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
