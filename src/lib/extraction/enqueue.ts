import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExtractionEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/**
 * Cria o job ai_extraction_batch (via RPC create_extraction_job) e conta os
 * job_item enfileirados. NÃO processa itens (§VIII) — o worker server-side
 * (batch-worker.ts) faz o trabalho pesado. Espelha enqueueScreeningJob.
 * recordIds: subconjunto opcional (lote sobre seleção). A elegibilidade
 * (included_ft + PDF processado) é aplicada na RPC.
 */
export async function enqueueExtractionJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordIds: string[] | null,
): Promise<ExtractionEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc(
    "create_extraction_job",
    { p_review_id: reviewId, p_record_ids: recordIds ?? null },
  );
  if (error) throw new Error(error.message);

  const { count, error: countErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  if (countErr) throw new Error(countErr.message);

  return { job_id: job.id, status: "queued", item_count: count ?? 0 };
}
