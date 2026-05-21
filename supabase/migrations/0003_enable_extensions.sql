-- Phase A.1: Enable extensions needed by hadith-search.
-- pgvector >= 0.7.0 provides halfvec (half-precision 1024-d vectors, 2x storage savings).
-- pg_trgm is used for narrator-substring filtering via ILIKE on englishText.
create extension if not exists vector;
create extension if not exists pg_trgm;
