import { createClient } from "@/lib/supabase/server";

export type ScreeningStage = "title_abstract" | "full_text";

export interface QueueRowRaw {
  record_id: string;
  title: string | null;
  abstract: string | null;
  year: string | null;
  corpus_state: string;
  ts_decision: "included" | "excluded" | "maybe" | null;
  ft_decision: "included" | "excluded" | null;
  ft_exclusion_reason_id: string | null;
  ai_suggestion_id: string | null;
  ai_recommendation: "include" | "exclude" | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  ai_state: "pending" | "accepted" | "edited" | "rejected" | "inferred" | null;
  decision_id: string | null;
}

export interface AiHint {
  suggestionId: string;
  recommendation: "include" | "exclude";
  confidence: number | null;
  reason: string | null;
  state: NonNullable<QueueRowRaw["ai_state"]>;
}

export interface QueueRow {
  recordId: string;
  title: string;
  abstract: string | null;
  year: string | null;
  corpusState: string;
  tsDecision: QueueRowRaw["ts_decision"];
  ftDecision: QueueRowRaw["ft_decision"];
  ftExclusionReasonId: string | null;
  ai: AiHint | null;
  decisionId: string | null;
}

export interface ExclusionReason {
  id: string;
  label: string;
  origin: "seed" | "criterion" | "manual";
  sourceCriterionId: string | null;
  usageCount: number;
}

export interface ReasonUsage {
  recordId: string;
  title: string;
  decisionId: string | null;
}

export interface ReasonUsageRaw {
  record_id: string;
  title: string | null;
  decision_id: string | null;
}

/** Mapeia uma linha crua de list_reason_usage para o shape da UI. */
export function mapReasonUsageRow(r: ReasonUsageRaw): ReasonUsage {
  return {
    recordId: r.record_id,
    title: r.title ?? "(sem título)",
    decisionId: r.decision_id,
  };
}

/** Funde as contagens de uso (do breakdown PRISMA) na lista de motivos. */
export function mergeUsageCounts(
  reasons: Omit<ExclusionReason, "usageCount">[],
  counts: { reasonId: string; n: number }[],
): ExclusionReason[] {
  const byReason = new Map(counts.map((c) => [c.reasonId, c.n]));
  return reasons.map((r) => ({ ...r, usageCount: byReason.get(r.id) ?? 0 }));
}

/** Mapeia uma linha crua da RPC para o shape consumido pela UI. */
export function mapQueueRow(r: QueueRowRaw): QueueRow {
  return {
    recordId: r.record_id,
    title: r.title ?? "(sem título)",
    abstract: r.abstract,
    year: r.year,
    corpusState: r.corpus_state,
    tsDecision: r.ts_decision,
    ftDecision: r.ft_decision,
    ftExclusionReasonId: r.ft_exclusion_reason_id,
    ai:
      r.ai_suggestion_id && r.ai_recommendation && r.ai_state
        ? {
            suggestionId: r.ai_suggestion_id,
            recommendation: r.ai_recommendation,
            confidence: r.ai_confidence,
            reason: r.ai_reason,
            state: r.ai_state,
          }
        : null,
    decisionId: r.decision_id,
  };
}

/** Fila de triagem do estágio, com sugestão de IA anexada (FR-028). */
export async function listScreeningQueue(
  reviewId: string,
  stage: ScreeningStage,
): Promise<QueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_screening_queue", {
    p_review_id: reviewId,
    p_stage: stage,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as QueueRowRaw[]).map(mapQueueRow);
}

/** Motivos de exclusão configuráveis e ativos, com contagem de uso (FR-025). */
export async function listExclusionReasons(
  reviewId: string,
): Promise<ExclusionReason[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exclusion_reason")
    .select("id, label, origin, source_criterion_id")
    .eq("review_id", reviewId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const reasons = (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    origin: r.origin as ExclusionReason["origin"],
    sourceCriterionId: r.source_criterion_id,
  }));

  const { data: breakdown, error: bErr } = await supabase
    .from("prisma_exclusion_breakdown")
    .select("reason_id, n")
    .eq("review_id", reviewId);
  if (bErr) throw new Error(bErr.message);
  const counts = (breakdown ?? []).map((b) => ({
    reasonId: b.reason_id as string,
    n: Number(b.n),
  }));

  return mergeUsageCounts(reasons, counts);
}

/** Artigos excluídos no TC que usam um motivo (para o popover "em uso"). */
export async function listReasonUsage(
  reasonId: string,
): Promise<ReasonUsage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_reason_usage", {
    p_reason_id: reasonId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ReasonUsageRaw[]).map(mapReasonUsageRow);
}

/** Contador PRISMA parcial (Fatia 5): triados (ts_decision terminal, exclui maybe). */
export async function countScreened(reviewId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("record")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .in("ts_decision", ["included", "excluded"]);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Contador PRISMA parcial (Fatia 5): incluídos no Texto completo. */
export async function countIncludedFullText(reviewId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("record")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .eq("corpus_state", "included_ft");
  if (error) throw new Error(error.message);
  return count ?? 0;
}
