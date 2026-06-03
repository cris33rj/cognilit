export const QUEUE_FILTERS = [
  "all",
  "undecided",
  "included",
  "excluded",
  "maybe",
  "ai_suggested",
] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

export const QUEUE_SORTS = [
  "default",
  "title",
  "year",
  "ai_confidence",
] as const;
export type QueueSort = (typeof QUEUE_SORTS)[number];

export interface QueueViewState {
  filter: QueueFilter;
  sort: QueueSort;
}

export const DEFAULT_QUEUE_STATE: QueueViewState = {
  filter: "all",
  sort: "default",
};

/** Lê o estado de fila dos searchParams; valores inválidos caem no default (FR-037). */
export function parseQueueState(params: URLSearchParams): QueueViewState {
  const f = params.get("qfilter");
  const s = params.get("qsort");
  return {
    filter: (QUEUE_FILTERS as readonly string[]).includes(f ?? "")
      ? (f as QueueFilter)
      : "all",
    sort: (QUEUE_SORTS as readonly string[]).includes(s ?? "")
      ? (s as QueueSort)
      : "default",
  };
}

/** Serializa para um objeto pronto p/ URLSearchParams; omite os defaults (URL limpa). */
export function serializeQueueState(
  state: QueueViewState,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (state.filter !== "all") out.qfilter = state.filter;
  if (state.sort !== "default") out.qsort = state.sort;
  return out;
}

interface Decisionish {
  decision: "included" | "excluded" | "maybe" | null;
  aiConfidence: number | null;
}
interface Sortable {
  title: string;
  year: string | null;
}

/** Aplica filtro + ordenação a uma fila já carregada (puro; sem refetch — FR-037). */
export function applyQueueView<T>(
  rows: T[],
  state: QueueViewState,
  decisionOf: (row: T) => Decisionish,
  sortKeyOf: (row: T) => Sortable = () => ({ title: "", year: null }),
): T[] {
  const filtered = rows.filter((r) => {
    const d = decisionOf(r);
    switch (state.filter) {
      case "undecided":
        return d.decision === null;
      case "included":
        return d.decision === "included";
      case "excluded":
        return d.decision === "excluded";
      case "maybe":
        return d.decision === "maybe";
      case "ai_suggested":
        return d.aiConfidence !== null;
      default:
        return true;
    }
  });

  if (state.sort === "default") return filtered;
  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (state.sort === "ai_confidence") {
      return (
        (decisionOf(b).aiConfidence ?? -1) - (decisionOf(a).aiConfidence ?? -1)
      );
    }
    const ka = sortKeyOf(a);
    const kb = sortKeyOf(b);
    if (state.sort === "year")
      return (ka.year ?? "").localeCompare(kb.year ?? "");
    return ka.title.localeCompare(kb.title); // "title"
  });
  return sorted;
}
