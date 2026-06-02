"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";
import { EnqueueValidationError } from "@shared/jobs/types";
import { searchSchema } from "@/lib/search/schema";
import type { SourceFormat } from "@shared/import/types";

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

export async function enqueueImport(
  reviewId: string,
  input: {
    format: SourceFormat;
    content: string;
    fieldMap?: Record<string, string>;
    search: unknown;
  },
) {
  const parsedSearch = searchSchema.safeParse(input.search);
  if (!parsedSearch.success) {
    return { ok: false as const, error: "Dados da busca inválidos." };
  }
  const { supabase } = await requireMember(reviewId);
  try {
    const res = await enqueueImportJob({ supabase }, reviewId, {
      format: input.format,
      content: input.content,
      fieldMap: input.fieldMap,
      search: parsedSearch.data,
    });
    revalidatePath(`/reviews/${reviewId}/workbench`);
    return { ok: true as const, jobId: res.job_id, itemCount: res.item_count };
  } catch (e) {
    if (e instanceof EnqueueValidationError) {
      return { ok: false as const, error: e.message }; // FR-016
    }
    throw e;
  }
}

/**
 * Gatilho síncrono do worker (Marco 1 / local / e2e — D-F3.5). Em produção o
 * worker é o jobs-worker agendado por pg_cron. Escopado: só processa jobs da
 * Revisão da qual o chamador é membro.
 */
export async function runImportWorker(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "import_parse")
    .in("status", ["queued", "running"]);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processImportJob({ supabase: admin }, j.id);
  }
  // Dedup exato automático ao concluir a importação (FR-018 / D-F4.3). Idempotente.
  await supabase.rpc("dedup_exact", { p_review_id: reviewId });
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

export async function runExactDedup(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const { data, error } = await supabase.rpc("dedup_exact", {
    p_review_id: reviewId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const, removed: data ?? 0 };
}

export async function decideFuzzy(
  reviewId: string,
  input: {
    recordA: string;
    recordB: string;
    outcome: "merged" | "kept_distinct";
    similarity: number;
  },
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("decide_fuzzy", {
    p_review_id: reviewId,
    p_record_a: input.recordA,
    p_record_b: input.recordB,
    p_outcome: input.outcome,
    p_similarity: input.similarity,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

export async function reverseDedup(reviewId: string, decisionId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("reverse_dedup", {
    p_decision_id: decisionId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}
