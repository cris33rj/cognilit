"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ByokPurpose } from "./queries";

export async function saveByokKey(
  reviewId: string,
  formData: FormData,
  opts: { purpose?: ByokPurpose; provider?: string } = {},
) {
  const purpose: ByokPurpose = opts.purpose ?? "llm";
  const provider = (opts.provider ?? "anthropic") as "anthropic" | "voyage";
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (apiKey === "") {
    return { ok: false, error: "Informe a chave do provedor." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_byok_key", {
    p_review_id: reviewId,
    p_provider: provider,
    p_api_key: apiKey,
    p_purpose: purpose,
  });
  if (error) return { ok: false, error: "Falha ao salvar a chave." };
  revalidatePath(
    `/reviews/${reviewId}/${purpose === "embedding" ? "search" : "question"}`,
  );
  return { ok: true as const };
}
