import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { VoyageProvider } from "./voyage";
import { MissingEmbeddingKeyError, type EmbeddingProvider } from "./types";

export type { EmbeddingProvider } from "./types";
export { MissingEmbeddingKeyError } from "./types";

/**
 * Resolve o provider de EMBEDDINGS (2ª chave BYOK, purpose='embedding'). Decifra
 * server-side via service-role. O chamador DEVE ter verificado a associação à
 * Revisão. Sem chave ⇒ MissingEmbeddingKeyError (FR-028).
 */
export async function getEmbeddingProvider(
  reviewId: string,
): Promise<EmbeddingProvider> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_byok_secret", {
    p_review_id: reviewId,
    p_purpose: "embedding",
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row?.api_key) throw new MissingEmbeddingKeyError(reviewId);
  if (row.provider === "voyage") return new VoyageProvider(row.api_key);
  throw new Error(`Provider de embeddings não suportado: ${row.provider}`);
}
