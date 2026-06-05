import { createClient } from "@/lib/supabase/server";

export interface PrismaCounters {
  identified: number;
  duplicates: number;
  screened: number;
  includedTs: number;
  excludedTs: number;
  maybeTs: number;
  /** Cumulativo dos que passaram no T/R ("assessed for eligibility" — PRISMA). */
  passedTs: number;
  includedFt: number;
  excludedFt: number;
}

export interface ExclusionCount {
  reasonId: string;
  reasonLabel: string;
  n: number;
}

/** Fonte única dos contadores PRISMA (FR-036/SC-004). Lê a view derivada. */
export async function getPrismaCounters(
  reviewId: string,
): Promise<PrismaCounters> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prisma_counter")
    .select(
      "identified, duplicates, screened, included_ts, excluded_ts, maybe_ts, included_ft, excluded_ft, passed_ts",
    )
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    identified: data?.identified ?? 0,
    duplicates: data?.duplicates ?? 0,
    screened: data?.screened ?? 0,
    includedTs: data?.included_ts ?? 0,
    excludedTs: data?.excluded_ts ?? 0,
    maybeTs: data?.maybe_ts ?? 0,
    passedTs: data?.passed_ts ?? 0,
    includedFt: data?.included_ft ?? 0,
    excludedFt: data?.excluded_ft ?? 0,
  };
}

/** Excluídos no Texto completo por motivo (FR-036 "excluídos por razão"). */
export async function getExclusionBreakdown(
  reviewId: string,
): Promise<ExclusionCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prisma_exclusion_breakdown")
    .select("reason_id, reason_label, n")
    .eq("review_id", reviewId)
    .order("n", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    reasonId: r.reason_id ?? "",
    reasonLabel: r.reason_label ?? "",
    n: r.n ?? 0,
  }));
}
