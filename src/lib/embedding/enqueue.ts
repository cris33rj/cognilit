import type { SupabaseClient } from "@supabase/supabase-js";

export interface EmbeddingEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/**
 * Cria o job embedding_batch (via RPC create_embedding_job) e conta os job_item.
 * NÃO embeda (§VIII) — o worker server-side (batch-worker.ts) faz o trabalho.
 * Espelha enqueueExtractionJob. documentIds: subconjunto opcional.
 */
export async function enqueueEmbeddingJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  documentIds: string[] | null,
): Promise<EmbeddingEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc("create_embedding_job", {
    p_review_id: reviewId,
    p_document_ids: documentIds ?? null,
  });
  if (error) throw new Error(error.message);

  const { count, error: countErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  if (countErr) throw new Error(countErr.message);

  return { job_id: job.id, status: "queued", item_count: count ?? 0 };
}
