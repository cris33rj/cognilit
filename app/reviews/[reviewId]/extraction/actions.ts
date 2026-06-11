"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractionFieldInputSchema } from "@/lib/extraction/schema";
import type { ExtractionFieldType } from "@/lib/extraction/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider } from "@/lib/ai/llm";
import { MissingByokError } from "@/lib/ai/llm/types";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { runExtractionForRecordWith } from "@/lib/extraction/run";
import { enqueueExtractionJob } from "@/lib/extraction/enqueue";
import { runExtractionBatchWorkerWith } from "@/lib/extraction/batch-run";
import {
  listExtractionBatchCandidates,
  listExtractionFields,
} from "@/lib/extraction/queries";
import type { SuggestionState } from "@/lib/ai/llm/types";

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
  revalidatePath(`/reviews/${reviewId}/extraction`);
}

export async function ensureExtractionForm(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const { data, error } = await supabase.rpc("ensure_extraction_form", {
    p_review_id: reviewId,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const, formId: data.id as string };
}

export async function addExtractionField(
  reviewId: string,
  input: { name: string; type: ExtractionFieldType; options?: string[] },
) {
  const parsed = extractionFieldInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Campo inválido.",
    };
  }
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("add_extraction_field", {
    p_review_id: reviewId,
    p_name: parsed.data.name,
    p_type: parsed.data.type,
    p_options: parsed.data.type === "select" ? parsed.data.options! : null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

export async function updateExtractionField(
  reviewId: string,
  fieldId: string,
  input: { name: string; type: ExtractionFieldType; options?: string[] },
) {
  const parsed = extractionFieldInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Campo inválido.",
    };
  }
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("update_extraction_field", {
    p_field_id: fieldId,
    p_name: parsed.data.name,
    p_type: parsed.data.type,
    p_options: parsed.data.type === "select" ? parsed.data.options! : null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

export async function removeExtractionField(reviewId: string, fieldId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("remove_extraction_field", {
    p_field_id: fieldId,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

export async function reorderExtractionFields(
  reviewId: string,
  fieldIds: string[],
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("reorder_extraction_fields", {
    p_review_id: reviewId,
    p_field_ids: fieldIds,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

// ---- Extração por IA (Fatia 4 / US3): single por estudo, server-side (A1) ----
export async function runExtraction(reviewId: string, recordId: string) {
  await requireMember(reviewId);
  const admin = createAdminClient();
  // Provider: BYOK quando há chave; senão Mock determinístico (local/e2e).
  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) provider = new MockLLMProvider();
    else throw e;
  }
  const res = await runExtractionForRecordWith(
    admin,
    provider,
    reviewId,
    recordId,
  );
  revalidate(reviewId);
  return { ok: true as const, created: res.created };
}

export async function ratifyExtractionValue(
  reviewId: string,
  valueId: string,
  state: SuggestionState,
  finalValue: unknown,
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("ratify_extraction_value", {
    p_value_id: valueId,
    p_state: state,
    p_final_value: state === "rejected" ? null : finalValue,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

// ---- Extração em lote (Fatia 5 / US4) ----

/**
 * Estimativa de custo/tokens ANTES do lote (FR-022). NÃO cria job. Conta os
 * estudos elegíveis (interseção com os selecionados) × campos ativos e delega ao
 * contrato provider.estimateCost. Sem 1ª chave ⇒ usa Mock para a estimativa e
 * sinaliza byokMissing (não trava — slicing A1/§7-B).
 */
export async function estimateExtractionBatch(
  reviewId: string,
  recordIds: string[] | null,
) {
  const { supabase } = await requireMember(reviewId);

  const candidates = await listExtractionBatchCandidates(
    { supabase },
    reviewId,
  );
  const candidateIds = new Set(candidates.map((c) => c.id));
  const selected =
    recordIds && recordIds.length > 0
      ? recordIds.filter((id) => candidateIds.has(id))
      : candidates.map((c) => c.id);
  const itemCount = selected.length;

  const fields = await listExtractionFields({ supabase }, reviewId);
  const fieldCount = fields.length;

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
    kind: "ai_extraction_batch",
    itemCount,
    fieldCount,
  });

  return { ok: true as const, itemCount, fieldCount, estimate, byokMissing };
}

/**
 * Enfileira o lote (create_extraction_job) e roda o worker server-side Node (A1).
 * Mesmo fallback de provider da extração single (Fatia 4): BYOK quando há chave,
 * senão Mock determinístico — não trava sem chave. Resiliente por-item / retomável
 * no worker (FR-021). Revalida para o JobsPanel refletir o consumo (FR-023).
 */
export async function runExtractionBatch(
  reviewId: string,
  recordIds: string[] | null,
) {
  await requireMember(reviewId);
  const admin = createAdminClient();

  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) provider = new MockLLMProvider();
    else throw e;
  }

  const enq = await enqueueExtractionJob(
    { supabase: admin },
    reviewId,
    recordIds,
  );
  if (enq.item_count === 0) {
    revalidate(reviewId);
    return { ok: true as const, jobId: enq.job_id, itemCount: 0 };
  }

  await runExtractionBatchWorkerWith(admin, provider, reviewId);
  revalidate(reviewId);
  return { ok: true as const, jobId: enq.job_id, itemCount: enq.item_count };
}
