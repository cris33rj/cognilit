import { createClient } from "@/lib/supabase/server";
import { listJobs, type JobRow } from "@/lib/jobs/queries";

export interface AiUsageSummary {
  tokensIn: number;
  tokensOut: number;
}

export interface JobsAndUsage {
  jobs: JobRow[];
  usage: AiUsageSummary;
}

/** Soma tokens de IA (pura — testável sem I/O). */
export function summarizeUsage(
  rows: { tokens_in: number | null; tokens_out: number | null }[],
): AiUsageSummary {
  return rows.reduce<AiUsageSummary>(
    (acc, r) => ({
      tokensIn: acc.tokensIn + (r.tokens_in ?? 0),
      tokensOut: acc.tokensOut + (r.tokens_out ?? 0),
    }),
    { tokensIn: 0, tokensOut: 0 },
  );
}

/** Jobs da Revisão + tokens de IA acumulados (FR-033 consumo, surfaceado no shell). */
export async function getJobsAndUsage(reviewId: string): Promise<JobsAndUsage> {
  const supabase = await createClient();
  const jobs = await listJobs(reviewId);
  const { data, error } = await supabase
    .from("ai_usage")
    .select("tokens_in, tokens_out")
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
  return { jobs, usage: summarizeUsage(data ?? []) };
}
