import { createClient } from "@/lib/supabase/server";
import { listJobs, type JobRow } from "@/lib/jobs/queries";

export interface AiUsageSummary {
  tokensIn: number;
  tokensOut: number;
}

export interface PhaseUsage {
  phase: string;
  tokensIn: number;
  tokensOut: number;
  calls: number;
}

/** Consumo por fase (FR-023): soma tokens e conta chamadas de ai_usage por phase. */
export function summarizeUsageByPhase(
  rows: {
    phase: string;
    tokens_in: number | null;
    tokens_out: number | null;
  }[],
): PhaseUsage[] {
  const map = new Map<string, PhaseUsage>();
  for (const r of rows) {
    const cur = map.get(r.phase) ?? {
      phase: r.phase,
      tokensIn: 0,
      tokensOut: 0,
      calls: 0,
    };
    cur.tokensIn += r.tokens_in ?? 0;
    cur.tokensOut += r.tokens_out ?? 0;
    cur.calls += 1;
    map.set(r.phase, cur);
  }
  return [...map.values()].sort((a, b) => a.phase.localeCompare(b.phase));
}

export interface JobsAndUsage {
  jobs: JobRow[];
  usage: AiUsageSummary;
  usageByPhase: PhaseUsage[];
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
    .select("phase, tokens_in, tokens_out")
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
  const allRows = (data ?? []) as {
    phase: string;
    tokens_in: number | null;
    tokens_out: number | null;
  }[];
  return {
    jobs,
    usage: summarizeUsage(allRows),
    usageByPhase: summarizeUsageByPhase(allRows),
  };
}
