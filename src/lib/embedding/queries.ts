import type { SupabaseClient } from "@supabase/supabase-js";

export interface EmbeddingCandidate {
  document_id: string;
  record_id: string;
  filename: string;
}

/**
 * Documentos elegíveis para embeddings (US5): processados (text_ready/partial) e
 * AINDA NÃO embedados. Mesmo predicado da RPC create_embedding_job — manter em
 * sincronia. Um documento com chunks já gerados não reaparece (idempotência).
 */
export async function listEmbeddingCandidates(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<EmbeddingCandidate[]> {
  const { data, error } = await deps.supabase
    .from("document")
    .select("id, record_id, filename, embedding_chunk(id)")
    .eq("review_id", reviewId)
    .in("processing_status", ["text_ready", "partial"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as Array<{
      id: string;
      record_id: string;
      filename: string;
      embedding_chunk: { id: string }[];
    }>
  )
    .filter((d) => (d.embedding_chunk ?? []).length === 0)
    .map((d) => ({
      document_id: d.id,
      record_id: d.record_id,
      filename: d.filename,
    }));
}
