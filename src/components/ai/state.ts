import type { SuggestionState } from "@/lib/ai/llm/types";

export const SUGGESTION_STATE_LABEL: Record<SuggestionState, string> = {
  pending: "Sugestão de IA · pendente",
  accepted: "Aceita",
  edited: "Editada",
  rejected: "Rejeitada",
  inferred: "Inferida",
};

// Borda/cor distinta de dado humano (Princípio I). Suporta dark mode.
export const SUGGESTION_STATE_CLASS: Record<SuggestionState, string> = {
  pending:
    "border-violet-400 bg-violet-50 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  accepted:
    "border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100",
  edited:
    "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  rejected:
    "border-red-400 bg-red-50 text-red-900 line-through dark:bg-red-950 dark:text-red-100",
  inferred:
    "border-sky-400 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
};
