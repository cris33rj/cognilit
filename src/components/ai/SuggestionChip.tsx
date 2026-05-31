import type { SuggestionState } from "@/lib/ai/llm/types";
import { SUGGESTION_STATE_CLASS, SUGGESTION_STATE_LABEL } from "./state";

export function SuggestionChip({ state }: { state: SuggestionState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${SUGGESTION_STATE_CLASS[state]}`}
      data-ai-state={state}
    >
      <span aria-hidden>✦</span>
      {SUGGESTION_STATE_LABEL[state]}
    </span>
  );
}
