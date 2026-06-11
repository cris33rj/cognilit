"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";
import { EnqueueValidationError } from "@shared/jobs/types";
import { searchSchema } from "@/lib/search/schema";
import type { SourceFormat } from "@shared/import/types";
import { listExactRemovals, listFuzzyCandidates } from "@/lib/dedup/queries";
import {
  listScreeningQueue,
  listExclusionReasons,
  listReasonUsage,
  type ScreeningStage,
} from "@/lib/screening/queries";
import { enqueueScreeningJob } from "@/lib/screening/enqueue";
import { runScreeningWorkerWith } from "@/lib/screening/run";
import { runPdfPipelineWorkerWith } from "@/lib/documents/run";
import { getLLMProvider } from "@/lib/ai/llm";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { MissingByokError } from "@/lib/ai/llm/types";
import { getRecordDetail } from "@/lib/record/queries";
import { attachPdfDocument } from "@/lib/documents/attach";
import { listDocuments } from "@/lib/documents/queries";

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
  const { error: dedupError } = await supabase.rpc("dedup_exact", {
    p_review_id: reviewId,
  });
  if (dedupError) throw new Error(dedupError.message);
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

export async function fetchExactRemovals(reviewId: string) {
  await requireMember(reviewId);
  return listExactRemovals(reviewId);
}

export async function fetchFuzzyCandidates(reviewId: string) {
  await requireMember(reviewId);
  return listFuzzyCandidates(reviewId);
}

// ---- Fetchers (passados como props server-action aos componentes client) ----
export async function fetchScreeningQueue(
  reviewId: string,
  stage: ScreeningStage,
) {
  await requireMember(reviewId);
  return listScreeningQueue(reviewId, stage);
}

/** Detalhe rico de um registro para o painel mestre-detalhe do T/R (Fatia 15). */
export async function fetchRecordDetail(reviewId: string, recordId: string) {
  await requireMember(reviewId);
  return getRecordDetail(recordId);
}

export async function fetchExclusionReasons(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  // Deriva dos critérios de exclusão ratificados + semeia genéricos (Fatia 8).
  await supabase.rpc("ensure_exclusion_reasons", {
    p_review_id: reviewId,
  }); // idempotente (D-F5.4)
  return listExclusionReasons(reviewId);
}

/** Adiciona um motivo de exclusão manual (dedup por label normalizado). */
export async function addExclusionReason(reviewId: string, label: string) {
  const { supabase } = await requireMember(reviewId);
  const { data, error } = await supabase.rpc("add_exclusion_reason", {
    p_review_id: reviewId,
    p_label: label,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const, id: data as string };
}

/** Lista os artigos excluídos com um dado motivo (8.1 — popover de uso). */
export async function fetchReasonUsage(reviewId: string, reasonId: string) {
  await requireMember(reviewId);
  return listReasonUsage(reasonId);
}

/** Soft delete de um motivo de exclusão (preserva PRISMA). */
export async function removeExclusionReason(
  reviewId: string,
  reasonId: string,
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("set_exclusion_reason_active", {
    p_reason_id: reasonId,
    p_active: false,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

// ---- Mutações de triagem (decisões HUMANAS — FR-024) ----
export async function decideScreening(
  reviewId: string,
  input: {
    recordId: string;
    stage: ScreeningStage;
    decision: "include" | "exclude" | "maybe";
    exclusionReasonId?: string | null;
    aiSuggestionId?: string | null;
  },
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("decide_screening", {
    p_review_id: reviewId,
    p_record_id: input.recordId,
    p_stage: input.stage,
    p_decision: input.decision,
    p_exclusion_reason_id: input.exclusionReasonId ?? null,
    p_ai_suggestion_id: input.aiSuggestionId ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

export async function reverseScreening(reviewId: string, decisionId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("reverse_screening", {
    p_decision_id: decisionId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

// ---- IA em lote: estimativa + enfileiramento + worker síncrono (D-F5.5/FR-033) ----
export async function enqueueScreeningBatch(
  reviewId: string,
  recordIds: string[] | null,
) {
  const { supabase } = await requireMember(reviewId);
  const res = await enqueueScreeningJob({ supabase }, reviewId, recordIds);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const, ...res };
}

export async function runScreeningWorker(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const admin = createAdminClient();
  // Provider: BYOK quando há chave; senão Mock determinístico (local/e2e — D-F5.5).
  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) provider = new MockLLMProvider();
    else throw e;
  }
  // Critérios de elegibilidade (Fatia 2) alimentam a pré-classificação.
  // DEVIATION: plan uses select("label") but real column is "text" (verified in database.ts)
  const { data: crit } = await supabase
    .from("eligibility_criterion")
    .select("text")
    .eq("review_id", reviewId);
  const criteria = ((crit ?? []) as Array<{ text: string }>).map((c) => c.text);
  await runScreeningWorkerWith(admin, provider, reviewId, criteria);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

export async function runPdfPipelineWorker(reviewId: string) {
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
  await runPdfPipelineWorkerWith(admin, provider, reviewId);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

// ---- Ingestão de PDF (Fatia 1 / US1) — anexo no modo Texto completo ----
export async function attachPdf(reviewId: string, formData: FormData) {
  const { supabase } = await requireMember(reviewId);
  const recordId = String(formData.get("recordId") ?? "");
  const file = formData.get("file");
  if (!recordId || !(file instanceof File)) {
    return { ok: false as const, error: "Arquivo ou estudo ausente." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const res = await attachPdfDocument(
    { supabase },
    { reviewId, recordId, filename: file.name, bytes },
  );
  if (res.ok) revalidatePath(`/reviews/${reviewId}/workbench`);
  return res;
}

export async function fetchDocuments(reviewId: string, recordId: string) {
  const { supabase } = await requireMember(reviewId);
  return listDocuments({ supabase }, reviewId, recordId);
}
