import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddingProvider } from "@/lib/ai/embedding/types";
import { processEmbeddingJob } from "./batch-worker";

/**
 * Processa todos os jobs embedding_batch ativos da Revisão. Recebe o client
 * (admin/service em produção) e o provider já resolvidos — testável e desacoplado
 * da resolução de BYOK. Espelha runExtractionBatchWorkerWith.
 */
export async function runEmbeddingBatchWorkerWith(
  supabase: SupabaseClient,
  provider: EmbeddingProvider,
  reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "embedding_batch")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processEmbeddingJob({ supabase, provider }, j.id);
  }
}
