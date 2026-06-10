"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractionFieldInputSchema } from "@/lib/extraction/schema";
import type { ExtractionFieldType } from "@/lib/extraction/schema";

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
