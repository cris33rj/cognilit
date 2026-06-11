import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { processExtractionJob } from "./batch-worker";

/**
 * Processa todos os jobs ai_extraction_batch ativos da Revisão. Recebe o client
 * (admin/service em produção) e o provider já resolvidos — testável e desacoplado
 * da resolução de BYOK. Espelha runScreeningWorkerWith.
 */
export async function runExtractionBatchWorkerWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "ai_extraction_batch")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processExtractionJob({ supabase, provider }, j.id);
  }
}
