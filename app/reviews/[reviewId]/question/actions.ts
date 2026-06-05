"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLLMProvider, MissingByokError } from "@/lib/ai/llm";
import { questionSchema } from "@/lib/question/schema";
import { writeAudit } from "@/lib/audit";
import { criteriaItemsFromOutput } from "@/lib/question/criteria";

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

export async function saveQuestion(reviewId: string, formData: FormData) {
  const parsed = questionSchema.safeParse({
    framework: formData.get("framework"),
    questionText: formData.get("questionText"),
    fields: JSON.parse(String(formData.get("fields") ?? "{}")),
  });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const { supabase, userId } = await requireMember(reviewId);
  const { data, error } = await supabase
    .from("question")
    .upsert(
      {
        review_id: reviewId,
        framework: parsed.data.framework,
        question_text: parsed.data.questionText,
        fields: parsed.data.fields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "review_id" },
    )
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Falha ao salvar." };

  await writeAudit(supabase, {
    reviewId,
    actorId: userId,
    action: "save_question",
    entity: "question",
    entityId: data.id,
    before: null,
    after: { framework: parsed.data.framework },
  });
  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const };
}

export async function deriveCriteria(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const { data: q } = await supabase
    .from("question")
    .select("id, framework, question_text, fields")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Formule a pergunta primeiro." };

  // Pré-checagem de fase: evita gastar a chamada de LLM se o protocolo já travou.
  // A RPC reforça isto de forma autoritativa (defesa em profundidade).
  const { data: protocol } = await supabase
    .from("protocol")
    .select("state")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (protocol?.state === "locked") {
    return {
      ok: false,
      error:
        "Protocolo travado: mudanças de elegibilidade entram como emenda do protocolo.",
    };
  }

  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError)
      return {
        ok: false,
        error: "Cadastre a chave de IA (BYOK) para usar a derivação.",
      };
    throw e;
  }

  const s = await provider.deriveEligibility({
    framework: q.framework,
    questionText: q.question_text,
    fields: (q.fields ?? {}) as Record<string, unknown>,
  });

  const { data: count, error } = await supabase.rpc(
    "regenerate_eligibility_criteria",
    {
      p_review_id: reviewId,
      p_output: s.output,
      p_provenance: s.provenance,
      p_not_found: s.not_found,
      p_items: criteriaItemsFromOutput(s.output),
    },
  );
  if (error) {
    if (error.message.includes("locked"))
      return {
        ok: false,
        error:
          "Protocolo travado: mudanças de elegibilidade entram como emenda do protocolo.",
      };
    return { ok: false, error: "Falha ao gravar critérios." };
  }

  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const, notFound: s.not_found, count: count ?? 0 };
}

export async function ratifyCriterion(
  reviewId: string,
  criterionId: string,
  decision: "accepted" | "edited" | "rejected",
  newText?: string,
) {
  const { supabase, userId } = await requireMember(reviewId);
  const patch: { ratification_state: typeof decision; text?: string } = {
    ratification_state: decision,
  };
  if (decision === "edited" && newText) patch.text = newText.trim();

  const { error } = await supabase
    .from("eligibility_criterion")
    .update(patch)
    .eq("id", criterionId)
    .eq("review_id", reviewId);
  if (error) return { ok: false, error: "Falha ao ratificar." };

  await writeAudit(supabase, {
    reviewId,
    actorId: userId,
    action: "ratify_criterion",
    entity: "eligibility_criterion",
    entityId: criterionId,
    before: null,
    after: { ratification_state: decision },
  });
  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const };
}
