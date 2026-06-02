import { createClient } from "@/lib/supabase/server";

export interface ExactRemoval {
  decisionId: string;
  removedRecordId: string;
  keptRecordId: string;
  removedTitle: string;
  keptTitle: string;
  createdAt: string;
}

export interface FuzzyCandidate {
  recordAId: string;
  recordBId: string;
  similarity: number;
  titleA: string;
  titleB: string;
  yearA: string | null;
  yearB: string | null;
}

/** Log de exatas removidas e ainda não revertidas, com títulos para exibição. */
export async function listExactRemovals(
  reviewId: string,
): Promise<ExactRemoval[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dedup_decision")
    .select(
      "id, record_a_id, record_b_id, created_at, " +
        "kept:record_a_id(metadata), removed:record_b_id(metadata)",
    )
    .eq("review_id", reviewId)
    .eq("kind", "exact_auto")
    .eq("is_reversed", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    record_a_id: string;
    record_b_id: string | null;
    created_at: string;
    kept: { metadata: { title?: string } } | null;
    removed: { metadata: { title?: string } } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    decisionId: r.id,
    removedRecordId: r.record_b_id ?? "",
    keptRecordId: r.record_a_id,
    removedTitle: r.removed?.metadata?.title ?? "(sem título)",
    keptTitle: r.kept?.metadata?.title ?? "(sem título)",
    createdAt: r.created_at,
  }));
}

/** Pares fuzzy pendentes de confirmação (FR-020). */
export async function listFuzzyCandidates(
  reviewId: string,
): Promise<FuzzyCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_fuzzy_candidates", {
    p_review_id: reviewId,
  });
  if (error) throw new Error(error.message);
  type Row = {
    record_a_id: string;
    record_b_id: string;
    similarity: number;
    title_a: string | null;
    title_b: string | null;
    year_a: string | null;
    year_b: string | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    recordAId: r.record_a_id,
    recordBId: r.record_b_id,
    similarity: r.similarity,
    titleA: r.title_a ?? "(sem título)",
    titleB: r.title_b ?? "(sem título)",
    yearA: r.year_a,
    yearB: r.year_b,
  }));
}

/** Contador PRISMA "duplicados" mínimo (D-F4.7): removidas + mescladas, não revertidas. */
export async function countDuplicates(reviewId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("dedup_decision")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .eq("is_reversed", false)
    .in("outcome", ["removed", "merged"]);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
