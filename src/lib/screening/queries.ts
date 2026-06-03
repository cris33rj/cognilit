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

/** Motivos de exclusão configuráveis e ativos (FR-025). */
export async function listExclusionReasons(
  reviewId: string,
): Promise<ExclusionReason[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exclusion_reason")
    .select("id, label")
    .eq("review_id", reviewId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExclusionReason[];
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
