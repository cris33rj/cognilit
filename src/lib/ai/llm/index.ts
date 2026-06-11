import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnthropicProvider } from "./anthropic";
import { MissingByokError, type LLMProvider } from "./types";

export type { LLMProvider } from "./types";
export { MissingByokError } from "./types";

/**
 * Resolve o provider de LLM para uma Revisão. Decifra a BYOK SOMENTE server-side
 * via cliente service-role (D-F2.4). O chamador DEVE ter verificado que o usuário
 * é membro da Revisão antes de chamar.
 */
export async function getLLMProvider(reviewId: string): Promise<LLMProvider> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_byok_secret", {
    p_review_id: reviewId,
    p_purpose: "llm",
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row?.api_key) throw new MissingByokError(reviewId);
  if (row.provider === "anthropic") return new AnthropicProvider(row.api_key);
  throw new Error(`Provider não suportado: ${row.provider}`);
}
