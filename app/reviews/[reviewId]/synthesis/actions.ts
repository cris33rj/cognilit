"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider } from "@/lib/ai/llm";
import { MissingByokError } from "@/lib/ai/llm/types";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueSynthesisJob } from "@/lib/synthesis/enqueue";
import { runSynthesisBatchWorkerWith } from "@/lib/synthesis/batch-run";
import { countSynthesisCandidates } from "@/lib/synthesis/queries";

async function requireMember(reviewId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !data) throw new Error("not a member");
  return { supabase };
}

function revalidate(reviewId: string) {
  revalidatePath(`/reviews/${reviewId}/synthesis`);
}

// ---- Estimativa de custo (FR-006) ----

/**
 * Conta estudos elegíveis à síntese e delega ao provider para estimar
 * custo/tokens ANTES de criar o job. Sem BYOK ⇒ usa Mock e sinaliza
 * byokMissing — não trava o fluxo.
 */
export async function estimateSynthesis(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const itemCount = await countSynthesisCandidates({ supabase }, reviewId);

  let byokMissing = false;
  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) {
      provider = new MockLLMProvider();
      byokMissing = true;
    } else throw e;
  }

  const estimate = await provider.estimateCost({
    kind: "synthesis_batch",
    itemCount,
  });

  return { ok: true as const, itemCount, estimate, byokMissing };
}

// ---- Geração da síntese (FR-003) ----

/**
 * Enfileira o job synthesis_batch e roda o worker server-side Node.
 * Mesmo fallback de provider: BYOK quando há chave, senão Mock determinístico.
 */
export async function runSynthesis(reviewId: string) {
  await requireMember(reviewId);
  const admin = createAdminClient();

  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) {
      provider = new MockLLMProvider();
    } else throw e;
  }

  const enq = await enqueueSynthesisJob({ supabase: admin }, reviewId);

  if (enq.item_count === 0) {
    revalidate(reviewId);
    return { ok: true as const, jobId: enq.job_id, itemCount: 0 };
  }

  await runSynthesisBatchWorkerWith(admin, provider, reviewId);
  revalidate(reviewId);
  return { ok: true as const, jobId: enq.job_id, itemCount: enq.item_count };
}

// ---- Ratificação de temas (FR-004) ----

/** Aceita o tema sem alterações. */
export async function acceptTheme(reviewId: string, themeId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("set_theme_state", {
    p_theme_id: themeId,
    p_state: "accepted",
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

/** Edita nome e/ou narrativa do tema e marca como editado. */
export async function editTheme(
  reviewId: string,
  themeId: string,
  input: { name?: string; narrative?: string },
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("set_theme_state", {
    p_theme_id: themeId,
    p_state: "edited",
    p_name: input.name ?? null,
    p_narrative: input.narrative ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

/** Rejeita o tema (exclui da síntese final). */
export async function rejectTheme(reviewId: string, themeId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("set_theme_state", {
    p_theme_id: themeId,
    p_state: "rejected",
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

// ---- Reorganização de temas (FR-006) ----

/** Reordena os temas de uma síntese conforme a lista de IDs fornecida. */
export async function reorderThemes(
  reviewId: string,
  synthesisId: string,
  themeIds: string[],
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("reorder_themes", {
    p_synthesis_id: synthesisId,
    p_theme_ids: themeIds,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

/** Mescla dois ou mais temas num único tema com o nome fornecido. */
export async function mergeThemes(
  reviewId: string,
  themeIds: string[],
  name: string,
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("merge_themes", {
    p_theme_ids: themeIds,
    p_name: name,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

/** Divide um tema em duas ou mais partes, redistribuindo os achados. */
export async function splitTheme(
  reviewId: string,
  themeId: string,
  parts: { name: string; narrative?: string; findingRefs: string[] }[],
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("split_theme", {
    p_theme_id: themeId,
    p_parts: parts,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}
