import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateScreeningCost } from "@/lib/ai/llm/cost";
import type { CostEstimate } from "@/lib/ai/llm/types";

export interface ScreeningEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
  estimated_cost: CostEstimate | null; // != null p/ IA (FR-033)
}

/**
 * Cria o job ai_screening_batch (via RPC create_screening_job) e calcula a
 * estimativa de custo prévia (FR-033/SC-008). NÃO processa itens (§VIII).
 * recordIds: subconjunto opcional (ações em lote sobre seleção).
 */
export async function enqueueScreeningJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordIds: string[] | null,
): Promise<ScreeningEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc("create_screening_job", {
    p_review_id: reviewId,
    p_record_ids: recordIds ?? null,
  });
  if (error) throw new Error(error.message);

  const { count, error: countErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  if (countErr) throw new Error(countErr.message);

  const itemCount = count ?? 0;
  return {
    job_id: job.id,
    status: "queued",
    item_count: itemCount,
    estimated_cost: estimateScreeningCost(itemCount),
  };
}
