import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReportEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/** Cria o job report_draft (RPC create_report_draft_job). Só enfileira (§VIII). */
export async function enqueueReportDraftJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<ReportEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc(
    "create_report_draft_job",
    {
      p_review_id: reviewId,
    },
  );
  if (error) throw new Error(error.message);
  const jobId = (job as { id: string }).id;
  const { count } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  return { job_id: jobId, status: "queued", item_count: count ?? 0 };
}
