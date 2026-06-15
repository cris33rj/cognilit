import type { SupabaseClient } from "@supabase/supabase-js";
import { processReportExportJob } from "./batch-worker";

/** Processa todos os jobs report_export ativos da Revisão (client admin/service). */
export async function runReportExportWorkerWith(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "report_export")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processReportExportJob({ supabase }, j.id);
  }
}
