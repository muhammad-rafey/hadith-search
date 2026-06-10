"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AnswerResponseSchema,
  type AnswerRequest,
  type AnswerResponse,
} from "@hadith/shared-types";

import { apiFetch } from "@/lib/api";
import { useUiStore } from "@/lib/store";

/**
 * Grounded-answer mutation. POSTs to /api/answer; the route re-runs the search
 * pipeline internally and synthesizes an answer from the top hadiths (or
 * abstains). Forwards `skip_cache` from Private mode like useSearch.
 */
export function useAnswer() {
  return useMutation<AnswerResponse, Error, AnswerRequest>({
    mutationKey: ["answer"],
    mutationFn: async (vars) => {
      const { privateMode } = useUiStore.getState();
      const body: AnswerRequest = { ...vars, skip_cache: privateMode };
      const res = await apiFetch("/api/answer", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = "";
        try {
          detail = JSON.stringify(await res.json());
        } catch {
          /* ignore */
        }
        throw new Error(`answer failed (${res.status})${detail ? `: ${detail}` : ""}`);
      }
      return AnswerResponseSchema.parse(await res.json());
    },
  });
}
