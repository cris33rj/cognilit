import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddingProvider, SemanticHit } from "@/lib/ai/embedding/types";

export interface SearchDeps {
  supabase: SupabaseClient;
  provider: EmbeddingProvider;
}

/**
 * Busca semântica escopada por Revisão (FR-024/FR-025): embeda a query e chama a
 * RPC match_embedding_chunks (security definer + checagem de membro + filtro
 * review_id explícito → 0 vazamento, SC-008/011). O vetor vai serializado como
 * texto ('[...]'); a RPC faz ::vector.
 */
export async function semanticSearch(
  deps: SearchDeps,
  reviewId: string,
  query: string,
  k = 10,
): Promise<SemanticHit[]> {
  const vec = await deps.provider.embedQuery({ query });
  const { data, error } = await deps.supabase.rpc("match_embedding_chunks", {
    p_review_id: reviewId,
    p_query: `[${vec.join(",")}]`,
    p_k: k,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SemanticHit[];
}
