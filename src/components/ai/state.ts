import type { SuggestionState } from "@/lib/ai/llm/types";

export const SUGGESTION_STATE_LABEL: Record<SuggestionState, string> = {
  pending: "Sugestão de IA · pendente",
  accepted: "Aceita",
  edited: "Editada",
  rejected: "Rejeitada",
  inferred: "Inferida",
};

// Borda/cor distinta de dado humano (Princípio I). Tokens do design system.
export const SUGGESTION_STATE_CLASS: Record<SuggestionState, string> = {
  pending: "border-accent text-accent-deep bg-accent-wash",
  accepted: "border-done text-done bg-done-wash",
  edited: "border-warn text-warn bg-accent-wash",
  rejected: "border-line text-ink-faint line-through",
  inferred: "border-accent text-accent-deep bg-accent-wash",
};
