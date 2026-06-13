import type { SupabaseClient } from "@supabase/supabase-js";
import type { SynthesisFinding } from "@/lib/ai/llm/types";

// ---------------------------------------------------------------------------
// Row shapes — typed minimally to match the supabase select projections below.
// Avoids `any` (no-explicit-any: error in .eslintrc.json).
// ---------------------------------------------------------------------------

interface ExtractionValueRow {
  id: string;
  record_id: string;
  final_value: unknown;
  // Supabase embeds the FK-parent as an array when using the table name directly.
  extraction_field: { name: string }[] | null;
}

interface RecordWithValueStateRow {
  id: string;
}

interface ThemeFindingRow {
  extraction_value_id: string;
  order: number;
}

interface ThemeRow {
  id: string;
  review_id: string;
  synthesis_id: string;
  name: string;
  narrative: string;
  order: number;
  summary_table: unknown;
  ai_suggestion_id: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  theme_finding: ThemeFindingRow[];
}

interface SynthesisRow {
  id: string;
  review_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Achados ratificados (accepted/edited) de um estudo — pool de grounding (Q3). */
export async function collectRatifiedFindings(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordId: string,
): Promise<SynthesisFinding[]> {
  const { data, error } = await deps.supabase
    .from("extraction_value")
    .select("id, record_id, final_value, extraction_field(name)")
    .eq("review_id", reviewId)
    .eq("record_id", recordId)
    .in("state", ["accepted", "edited"]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((v: ExtractionValueRow) => ({
    extractionValueId: v.id,
    recordId: v.record_id,
    fieldName: v.extraction_field?.[0]?.name ?? "",
    value: v.final_value,
  }));
}

/** Conta estudos elegíveis à síntese (included_ft com ≥1 achado ratificado) — FR-006. */
export async function countSynthesisCandidates(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<number> {
  const { data, error } = await deps.supabase
    .from("record")
    .select("id, extraction_value!inner(state)")
    .eq("review_id", reviewId)
    .eq("corpus_state", "included_ft")
    .in("extraction_value.state", ["accepted", "edited"]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: RecordWithValueStateRow) => r.id)).size;
}

/** Carrega a síntese + temas (não-rejeitados, ordenados) + grounding para a UI. */
export async function loadSynthesis(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<{ synthesis: SynthesisRow; themes: ThemeRow[] } | null> {
  const { data: synthesis } = await deps.supabase
    .from("synthesis")
    .select("*")
    .eq("review_id", reviewId)
    .maybeSingle<SynthesisRow>();
  if (!synthesis) return null;
  const { data: themes } = await deps.supabase
    .from("theme")
    .select('*, theme_finding(extraction_value_id, "order")')
    .eq("synthesis_id", synthesis.id)
    .neq("state", "rejected")
    .order("order");
  return { synthesis, themes: (themes ?? []) as ThemeRow[] };
}
