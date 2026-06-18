import { useMutation } from "@tanstack/react-query";
import {
  AnswerResponseSchema,
  type AnswerRequest,
  type AnswerResponse,
} from "@hadith/shared-types";

import { apiFetch } from "@/lib/api";
import { useUiStore } from "@/lib/store/ui-store";

/**
 * Grounded-answer mutation. POSTs to `${ENV.API_URL}/api/answer`; the route
 * re-runs the search pipeline internally and synthesizes an answer from the top
 * hadiths (or abstains). Mirrors apps/web/lib/queries/use-answer.ts and forwards
 * `skip_cache` from the persisted Private-mode toggle.
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
