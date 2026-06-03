import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { processScreeningJob } from "./worker";

/**
 * Processa todos os jobs ai_screening_batch ativos da Revisão (D-F5.5).
 * Recebe o client (admin/service em produção) e o provider já resolvidos —
 * mantém testável e desacoplado da resolução de BYOK.
 */
export async function runScreeningWorkerWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
  criteria: string[],
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "ai_screening_batch")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processScreeningJob({ supabase, provider, criteria }, j.id);
  }
}
