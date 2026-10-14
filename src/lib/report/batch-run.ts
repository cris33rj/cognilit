import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { processReportDraftJob } from "./batch-worker";

/**
 * Processa todos os jobs report_draft ativos da Revisão.
 * Recebe o client (admin/service em produção) e o provider já resolvidos —
 * testável e desacoplado da resolução de BYOK. Espelha runSynthesisBatchWorkerWith.
 */
export async function runReportDraftWorkerWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "report_draft")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processReportDraftJob({ supabase, provider }, j.id);
  }
}
