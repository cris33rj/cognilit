"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLLMProvider, MissingByokError } from "@/lib/ai/llm";
import { questionSchema } from "@/lib/question/schema";
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
  const { supabase, userId } = await requireMember(reviewId);
  const { data: q } = await supabase
    .from("question")
    .select("id, framework, question_text, fields")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Formule a pergunta primeiro." };

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

  const { data: sug, error: sugErr } = await supabase
    .from("ai_suggestion")
    .insert({
      review_id: reviewId,
      target_kind: "eligibility",
      target_id: q.id,
      output: s.output,
      provenance: s.provenance,
      state: "pending",
      not_found: s.not_found,
    })
    .select("id")
    .single();
  if (sugErr || !sug)
    return { ok: false, error: "Falha ao registrar sugestão." };

  const rows = [
    ...s.output.inclusion.map((t) => ({ kind: "inclusion" as const, text: t })),
    ...s.output.exclusion.map((t) => ({ kind: "exclusion" as const, text: t })),
    ...s.output.searchTerms.map((t) => ({
      kind: "search_term" as const,
      text: t,
    })),
  ].map((r) => ({
    review_id: reviewId,
    question_id: q.id,
    kind: r.kind,
    text: r.text,
    origin: "ai" as const,
    ratification_state: "pending" as const,
    ai_suggestion_id: sug.id,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from("eligibility_criterion").insert(rows);
    if (error) return { ok: false, error: "Falha ao gravar critérios." };
  }

  await writeAudit(supabase, {
    reviewId,
    actorId: userId,
    action: "derive_criteria",
    entity: "ai_suggestion",
    entityId: sug.id,
    before: null,
    after: { count: rows.length },
  });
  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const, notFound: s.not_found, count: rows.length };
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
