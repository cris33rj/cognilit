"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveByokKey(reviewId: string, formData: FormData) {
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (apiKey === "") {
    return { ok: false, error: "Informe a chave do provedor." };
  }
  const supabase = await createClient();
  // RLS na RPC (is_review_member) garante o escopo; o segredo nunca é logado.
  const { error } = await supabase.rpc("set_byok_key", {
    p_review_id: reviewId,
    p_provider: "anthropic",
    p_api_key: apiKey,
  });
  if (error) return { ok: false, error: "Falha ao salvar a chave." };
  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const };
}
