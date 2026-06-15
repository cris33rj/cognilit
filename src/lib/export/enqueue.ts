import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExportEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/** Cria o job report_export (RPC create_report_export_job). Só enfileira (§VIII). */
export async function enqueueReportExportJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  formats: string[],
): Promise<ExportEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc(
    "create_report_export_job",
    { p_review_id: reviewId, p_formats: formats },
  );
  if (error) throw new Error(error.message);
  const jobId = (job as { id: string }).id;
  const { count, error: cErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);
  return { job_id: jobId, status: "queued", item_count: count ?? 0 };
}
