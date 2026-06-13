import type { SupabaseClient } from "@supabase/supabase-js";

export interface SynthesisEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/**
 * Cria o job synthesis_batch (RPC create_synthesis_job) e conta os itens.
 * Só enfileira (§VIII); o worker Node agrega. Espelha enqueueExtractionJob.
 */
export async function enqueueSynthesisJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<SynthesisEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc("create_synthesis_job", {
    p_review_id: reviewId,
  });
  if (error) throw new Error(error.message);

  const { count, error: cErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", (job as { id: string }).id);
  if (cErr) throw new Error(cErr.message);

  return {
    job_id: (job as { id: string }).id,
    status: "queued",
    item_count: count ?? 0,
  };
}
