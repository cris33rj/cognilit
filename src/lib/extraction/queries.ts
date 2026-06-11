import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provenance, SuggestionState } from "@/lib/ai/llm/types";

export interface ExtractionFormRow {
  id: string;
  review_id: string;
}

export type ExtractionFieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select";

export interface ExtractionFieldRow {
  id: string;
  name: string;
  type: ExtractionFieldType;
  options: string[] | null;
  sort_order: number;
}

/** Formulário 1:1 da Revisão (null se ainda não criado). RLS escopa por membro. */
export async function getExtractionForm(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<ExtractionFormRow | null> {
  const { data, error } = await deps.supabase
    .from("extraction_form")
    .select("id, review_id")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ExtractionFormRow | null) ?? null;
}

/** Campos ativos do formulário, na ordem de exibição (FR-009). */
export async function listExtractionFields(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<ExtractionFieldRow[]> {
  const { data, error } = await deps.supabase
    .from("extraction_field")
    .select("id, name, type, options, sort_order")
    .eq("review_id", reviewId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExtractionFieldRow[];
}

export interface StudyRow {
  id: string;
  title: string;
}

/** Estudos da Revisão (record incluído após o Texto completo — alvo da extração). */
export async function listStudies(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<StudyRow[]> {
  const { data, error } = await deps.supabase
    .from("record")
    .select("id, metadata")
    .eq("review_id", reviewId)
    .eq("corpus_state", "included_ft")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as Array<{ id: string; metadata: { title?: string } | null }>
  ).map((r) => ({
    id: r.id,
    title: r.metadata?.title ?? "(sem título)",
  }));
}

export interface ExtractionValueView {
  id: string;
  field_id: string;
  state: SuggestionState;
  final_value: unknown;
  not_found: boolean;
  output: unknown; // FactualValue da sugestão
  provenance: Provenance | null;
  grounding: {
    text_layer_id: string | null;
    page: number | null;
    source_span: string | null;
    origin: string | null;
  } | null;
}

/** Valores vivos (não rejeitados) de um estudo, com a sugestão de IA embutida. */
export async function listExtractionValues(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordId: string,
): Promise<ExtractionValueView[]> {
  const { data, error } = await deps.supabase
    .from("extraction_value")
    .select(
      "id, field_id, state, final_value, ai_suggestion:ai_suggestion_id (output, provenance, grounding, not_found)",
    )
    .eq("review_id", reviewId)
    .eq("record_id", recordId)
    .neq("state", "rejected")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const raw = r.ai_suggestion;
    const sugg = (Array.isArray(raw) ? raw[0] : raw) as null | {
      output: unknown;
      provenance: Provenance;
      not_found: boolean;
      grounding: ExtractionValueView["grounding"];
    };
    return {
      id: r.id as string,
      field_id: r.field_id as string,
      state: r.state as SuggestionState,
      final_value: r.final_value ?? null,
      not_found: sugg?.not_found ?? false,
      output: sugg?.output ?? null,
      provenance: sugg?.provenance ?? null,
      grounding: sugg?.grounding ?? null,
    };
  });
}
