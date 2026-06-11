import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import {
  processPdfPipelineJob,
  type PipelineWorkerDeps,
} from "./pipeline-worker";

/**
 * Processa todos os jobs pdf_text_pipeline ativos da Revisão (espelha o screening).
 * Recebe o client (service-role) e o provider já resolvidos. `extra` permite injetar
 * rasterizador/limiar nos testes.
 */
export async function runPdfPipelineWorkerWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
  extra?: Pick<PipelineWorkerDeps, "rasterize" | "scanThreshold">,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "pdf_text_pipeline")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processPdfPipelineJob({ supabase, provider, ...extra }, j.id);
  }
}
