import { createClient } from "@/lib/supabase/server";
import { composeSuggestedQuery } from "./suggest";

interface SearchTermRow {
  text: string;
}

/**
 * Seed da string de busca para o modo Importar: termos de busca derivados por IA
 * (kind='search_term') ainda não rejeitados, compostos como sugestão editável (A-13.2).
 * Retorna "" quando não há termos.
 */
export async function getSuggestedQuery(reviewId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eligibility_criterion")
    .select("text, ratification_state")
    .eq("review_id", reviewId)
    .eq("kind", "search_term")
    .neq("ratification_state", "rejected")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const terms = ((data ?? []) as SearchTermRow[]).map((r) => r.text);
  return composeSuggestedQuery(terms);
}

/** Select PostgREST do histórico: campos da busca + contagem embutida de records. */
export const SEARCH_SUMMARY_SELECT = "id, database, created_at, record(count)";

export interface SearchSummary {
  id: string;
  database: string;
  createdAt: string;
  recordCount: number;
}

interface RawSearchRow {
  id: string;
  database: string;
  created_at: string;
  record: { count: number }[] | null;
}

/**
 * Achata as linhas do `SEARCH_SUMMARY_SELECT` em `SearchSummary`. Função pura: extrai a
 * contagem de `record(count)` (`record[0].count`, ou 0 quando ausente). Sem I/O.
 */
export function toSearchSummaries(rows: RawSearchRow[]): SearchSummary[] {
  return rows.map((r) => ({
    id: r.id,
    database: r.database,
    createdAt: r.created_at,
    recordCount: r.record?.[0]?.count ?? 0,
  }));
}

/**
 * Histórico de importações da Revisão (Fatia 14, read-only): uma linha por `search`,
 * mais recente primeiro, com a contagem de `record` associada. RLS cobre por membership.
 */
export async function listSearches(reviewId: string): Promise<SearchSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("search")
    .select(SEARCH_SUMMARY_SELECT)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // Embedded-count select widens the inferred type além das generics do supabase-js.
  return toSearchSummaries((data ?? []) as unknown as RawSearchRow[]);
}
