import type { SupabaseClient } from "@supabase/supabase-js";

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
