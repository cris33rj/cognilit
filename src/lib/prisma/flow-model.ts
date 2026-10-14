import {
  getPrismaCounters,
  getExclusionBreakdown,
  type PrismaCounters,
  type ExclusionCount,
} from "./queries";

export interface ExcludedFullTextReason {
  reason: string;
  n: number;
}

/** Modelo de caixas do fluxograma PRISMA 2020 — espelho das views (§VI). */
export interface PrismaFlowModel {
  identified: number;
  duplicatesRemoved: number;
  screened: number; // registros que entraram na triagem T/R = identified - duplicates
  excludedScreening: number;
  assessedFullText: number; // "assessed for eligibility" = passed_ts
  excludedFullText: ExcludedFullTextReason[];
  included: number;
  /** true quando T/R ou TC ainda não fecharam (FR-011) — números não finais. */
  partial: boolean;
}

/** Puro: mapeia campos das views → caixas. Consistência número-a-número por construção. */
export function toFlowModel(
  counters: PrismaCounters,
  breakdown: ExclusionCount[],
): PrismaFlowModel {
  const screened = Math.max(0, counters.identified - counters.duplicates);
  const tsComplete = counters.identified > 0 && counters.screened >= screened;
  const ftComplete =
    counters.passedTs > 0 &&
    counters.includedFt + counters.excludedFt >= counters.passedTs;
  const partial = counters.identified > 0 ? !(tsComplete && ftComplete) : false;

  return {
    identified: counters.identified,
    duplicatesRemoved: counters.duplicates,
    screened,
    excludedScreening: counters.excludedTs,
    assessedFullText: counters.passedTs,
    excludedFullText: breakdown.map((b) => ({ reason: b.reasonLabel, n: b.n })),
    included: counters.includedFt,
    partial,
  };
}

/** IO fina: lê as views (RLS escopa) e devolve o modelo. NÃO chamar em testes de
 *  integração (usa o server client de request) — testar `toFlowModel` puro. */
export async function loadPrismaFlowModel(
  reviewId: string,
): Promise<PrismaFlowModel> {
  const [counters, breakdown] = await Promise.all([
    getPrismaCounters(reviewId),
    getExclusionBreakdown(reviewId),
  ]);
  return toFlowModel(counters, breakdown);
}
