import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { processSynthesisJob } from "./batch-worker";

/**
 * Processa todos os jobs synthesis_batch ativos da Revisão. Recebe o client
 * (admin/service em produção) e o provider já resolvidos — testável e
 * desacoplado da resolução de BYOK. Espelha runExtractionBatchWorkerWith.
 */
export async function runSynthesisBatchWorkerWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "synthesis_batch")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processSynthesisJob({ supabase, provider }, j.id);
  }
}
