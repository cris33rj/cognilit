"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getLLMProvider,
  MissingByokError,
  type LLMProvider,
} from "@/lib/ai/llm";
import { writeAudit } from "@/lib/audit";

async function requireMember(reviewId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !data) throw new Error("not a member");
  return { supabase, userId: auth.user.id };
}

export async function draftProtocol(reviewId: string) {
  const { supabase, userId } = await requireMember(reviewId);
  const { data: q } = await supabase
    .from("question")
    .select("id, question_text")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Formule a pergunta primeiro." };

  const { data: existing } = await supabase
    .from("protocol")
    .select("state")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (existing?.state === "locked") {
    return { ok: false, error: "Protocolo travado; use emendas." };
  }

  const { data: crit } = await supabase
    .from("eligibility_criterion")
    .select("text")
    .eq("review_id", reviewId)
    .in("ratification_state", ["accepted", "edited"]);

  let provider: LLMProvider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError)
      return { ok: false, error: "Cadastre a chave de IA (BYOK)." };
    throw e;
  }

  const s = await provider.draftProtocol({
    questionText: q.question_text,
    criteria: (crit ?? []).map((c) => c.text),
  });

  const { data: sug, error: sugError } = await supabase
    .from("ai_suggestion")
    .insert({
      review_id: reviewId,
      target_kind: "protocol_draft",
      output: s.output,
      provenance: s.provenance,
      state: "pending",
      not_found: s.not_found,
    })
    .select("id")
    .single();
  if (sugError || !sug) {
    return { ok: false, error: "Falha ao registrar sugestão de IA." };
  }

  const { data: proto, error } = await supabase
    .from("protocol")
    .upsert(
      {
        review_id: reviewId,
        content: { contentMarkdown: s.output.contentMarkdown },
        origin: "ai_draft",
        ai_suggestion_id: sug.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "review_id" },
    )
    .select("id")
    .single();
  if (error || !proto) return { ok: false, error: "Falha ao gravar rascunho." };

  await writeAudit(supabase, {
    reviewId,
    actorId: userId,
    action: "draft_protocol",
    entity: "protocol",
    entityId: proto.id,
    before: null,
    after: { origin: "ai_draft" },
  });
  revalidatePath(`/reviews/${reviewId}/protocol`);
  return { ok: true as const };
}

export async function saveProtocolDraft(
  reviewId: string,
  contentMarkdown: string,
) {
  const { supabase, userId } = await requireMember(reviewId);
  // Trigger guard_locked_protocol barra se já travado.
  const { data, error } = await supabase
    .from("protocol")
    .upsert(
      {
        review_id: reviewId,
        content: { contentMarkdown },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "review_id" },
    )
    .select("id")
    .single();
  if (error)
    return {
      ok: false,
      error: "Protocolo travado ou inválido — edite via emenda.",
    };

  await writeAudit(supabase, {
    reviewId,
    actorId: userId,
    action: "save_protocol_draft",
    entity: "protocol",
    entityId: data!.id,
    before: null,
    after: null,
  });
  revalidatePath(`/reviews/${reviewId}/protocol`);
  return { ok: true as const };
}

export async function lockProtocol(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("lock_protocol", {
    p_review_id: reviewId,
  });
  if (error) return { ok: false, error: "Falha ao travar." };
  revalidatePath(`/reviews/${reviewId}/protocol`);
  return { ok: true as const };
}

export async function addAmendment(reviewId: string, formData: FormData) {
  const text = String(formData.get("change") ?? "").trim();
  if (text === "") return { ok: false, error: "Descreva a mudança." };
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("add_protocol_amendment", {
    p_review_id: reviewId,
    p_change: { text },
  });
  if (error)
    return {
      ok: false,
      error: "Falha ao registrar emenda (protocolo travado?).",
    };
  revalidatePath(`/reviews/${reviewId}/protocol`);
  return { ok: true as const };
}
