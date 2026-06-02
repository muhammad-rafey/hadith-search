#!/usr/bin/env python3
"""
Local BGE-M3 embedding + reranking server.

Loads BAAI/bge-m3 once (1024-dim dense embeddings, normalized) and serves it
over HTTP so both the corpus-ingest script and the Next.js search pipeline can
embed text through one identical model — the same way `cohere.ts` is the single
embed backend in the cloud setup.

Also loads BAAI/bge-reranker-v2-m3 (a cross-encoder) and serves it at /rerank,
so the search pipeline can rerank candidates locally — the free, all-local
equivalent of Cohere rerank-v4.0-pro. The /rerank response shape mirrors
Cohere's ({results:[{index, relevance_score}]}, best first) so the TS call site
maps either backend identically.

BGE-M3 needs NO instruction prefix on queries (unlike older BGE / Cohere's
asymmetric search_query/search_document modes), so query and document text are
encoded identically. `input_type` is accepted but ignored — kept for a drop-in
shape match with the Cohere call sites.

Run (from repo root):
    scripts/bge-m3-venv/bin/python scripts/bge_m3_server.py
        # → http://127.0.0.1:8000  (override with BGE_HOST / BGE_PORT)

Endpoints:
    GET  /health → {"status":"ok","model":"bge-m3","dim":1024,"device":"mps"}
    POST /embed  → body {"texts":[...], "input_type":"document"|"query"}
                   resp {"embeddings":[[...1024 floats...]], "model":"bge-m3", "dim":1024}
    POST /rerank → body {"query":"...", "documents":[...], "top_n":10}
                   resp {"results":[{"index":i,"relevance_score":s}, ...]}  (best first)

The reranker can be disabled (skip the ~2GB download) with BGE_RERANK_ENABLED=0.

Device: auto-detects Apple MPS (Metal) → CUDA → CPU. On an M-series Mac you get
MPS automatically. First request after boot warms lazily; the models are loaded
eagerly at startup so /health only returns ok once they're ready.
"""

from __future__ import annotations

import os
from typing import Optional

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder, SentenceTransformer

MODEL_NAME = os.environ.get("BGE_MODEL_NAME", "BAAI/bge-m3")
MODEL_ID = "bge-m3"  # tag stored in hadith_embeddings.model
EXPECTED_DIM = 1024
# Default to loopback. /embed and /rerank are UNAUTHENTICATED and CPU/GPU-heavy,
# so binding to 0.0.0.0 exposes them (and a trivial DoS surface) to the whole
# LAN. Only override BGE_HOST if you understand that and add your own gating.
HOST = os.environ.get("BGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("BGE_PORT", "8000"))
# Passages are capped ~2000 chars (~500 tokens) upstream; cap seq length to
# keep batches fast and memory bounded (bge-m3 supports up to 8192).
MAX_SEQ_LEN = int(os.environ.get("BGE_MAX_SEQ_LEN", "1024"))

# Cross-encoder reranker — the local equivalent of Cohere rerank-v4.0-pro.
RERANK_MODEL_NAME = os.environ.get("BGE_RERANK_MODEL", "BAAI/bge-reranker-v2-m3")
RERANK_MODEL_ID = "bge-reranker-v2-m3"
RERANK_ENABLED = os.environ.get("BGE_RERANK_ENABLED", "1") not in ("0", "false", "False")
# (query, passage) pairs are short; cap to keep cross-encoder scoring fast.
RERANK_MAX_LEN = int(os.environ.get("BGE_RERANK_MAX_LEN", "1024"))
# Pairs used to warm the reranker at boot — set near the real candidate-pool size
# (RETRIEVE_COUNT) so MPS compiles the batch shape the first query will use.
RERANK_WARMUP_PAIRS = int(os.environ.get("BGE_RERANK_WARMUP_PAIRS", "40"))


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


DEVICE = pick_device()
print(f"[bge-m3] loading {MODEL_NAME} on device={DEVICE} ...", flush=True)
model = SentenceTransformer(MODEL_NAME, device=DEVICE)
model.max_seq_length = MAX_SEQ_LEN
print(f"[bge-m3] ready. max_seq_length={model.max_seq_length}", flush=True)

reranker: CrossEncoder | None = None
if RERANK_ENABLED:
    print(f"[bge-m3] loading reranker {RERANK_MODEL_NAME} on device={DEVICE} ...", flush=True)
    reranker = CrossEncoder(RERANK_MODEL_NAME, device=DEVICE, max_length=RERANK_MAX_LEN)
    print("[bge-m3] reranker ready.", flush=True)
else:
    print("[bge-m3] reranker disabled (BGE_RERANK_ENABLED=0).", flush=True)


def _warmup() -> None:
    """Run one representative inference per model at boot so the first real
    request doesn't pay the MPS kernel-compilation cost. On Metal the first
    forward pass over a near-max-length batch can take tens of seconds to
    compile; without this it lands on (and times out) the first user query.
    """
    long_text = ("the prophet said " * 120).strip()  # ~near max_seq_length tokens
    model.encode([long_text], normalize_embeddings=True, show_progress_bar=False)
    if reranker is not None:
        pairs = [["dutiful to parents and kindness", long_text] for _ in range(RERANK_WARMUP_PAIRS)]
        reranker.predict(pairs, batch_size=min(len(pairs), 32), show_progress_bar=False)
    print("[bge-m3] warmup complete.", flush=True)


_warmup()


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)
    # Accepted for call-site symmetry with Cohere; bge-m3 ignores it.
    input_type: str = "document"


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    dim: int


class RerankRequest(BaseModel):
    query: str = Field(..., min_length=1)
    documents: list[str] = Field(..., min_length=1)
    # How many of the top-ranked documents to return. None → all.
    # Optional[int] (not `int | None`): the venv runs Python 3.9, where Pydantic
    # cannot evaluate PEP-604 union syntax in a field annotation.
    top_n: Optional[int] = None


class RerankHit(BaseModel):
    index: int
    relevance_score: float


class RerankResponse(BaseModel):
    results: list[RerankHit]
    model: str


app = FastAPI(title="bge-m3-embed", version="1.1")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": MODEL_ID,
        "dim": EXPECTED_DIM,
        "device": DEVICE,
        "reranker": RERANK_MODEL_ID if reranker is not None else None,
    }


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts must be non-empty")
    # normalize_embeddings=True → unit vectors, matching cosine HNSW index.
    vecs = model.encode(
        req.texts,
        batch_size=min(len(req.texts), 64),
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    if vecs.shape[1] != EXPECTED_DIM:
        raise HTTPException(
            status_code=500,
            detail=f"got dim {vecs.shape[1]}, expected {EXPECTED_DIM}",
        )
    return EmbedResponse(
        embeddings=vecs.astype(float).tolist(),
        model=MODEL_ID,
        dim=EXPECTED_DIM,
    )


@app.post("/rerank", response_model=RerankResponse)
def rerank(req: RerankRequest) -> RerankResponse:
    if reranker is None:
        raise HTTPException(status_code=503, detail="reranker disabled (BGE_RERANK_ENABLED=0)")
    if not req.documents:
        raise HTTPException(status_code=400, detail="documents must be non-empty")
    # Cross-encoder scores each (query, document) pair jointly. Sigmoid maps the
    # raw logit to a calibrated [0, 1] relevance score, matching Cohere's range
    # so the same downstream threshold applies to either backend.
    pairs = [[req.query, doc] for doc in req.documents]
    scores = reranker.predict(
        pairs,
        batch_size=min(len(pairs), 32),
        activation_fct=torch.nn.Sigmoid(),
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    order = sorted(range(len(scores)), key=lambda i: float(scores[i]), reverse=True)
    if req.top_n is not None:
        order = order[: max(0, req.top_n)]
    results = [RerankHit(index=i, relevance_score=float(scores[i])) for i in order]
    return RerankResponse(results=results, model=RERANK_MODEL_ID)


if __name__ == "__main__":
    if HOST not in ("127.0.0.1", "localhost", "::1"):
        print(
            f"[bge-m3] WARNING: binding to {HOST} exposes UNAUTHENTICATED /embed and "
            "/rerank endpoints on the network. Use 127.0.0.1 unless you have added access control.",
            flush=True,
        )
    # Single worker: the model is large and we want exactly one copy in memory.
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
