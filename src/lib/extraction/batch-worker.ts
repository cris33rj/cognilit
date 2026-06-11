import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { runExtractionForRecord } from "./extract";

interface ExtractionItem {
  id: string;
  payload: { record_id: string };
  review_id: string;
  attempts: number;
}

export interface ExtractionBatchDeps {
  supabase: SupabaseClient; // service-role (admin) — escrita da IA bypassa RLS
  provider: LLMProvider;
}

export interface ExtractionBatchResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

/**
 * Processa um job ai_extraction_batch item-a-item (§VIII / A1): cada item é UM
 * estudo; chama runExtractionForRecord (Fatia 4) e grava ai_usage(phase='extraction').
 * Falha de um item ⇒ item 'failed' (não derruba o job — FR-021). Retomável: só
 * pega itens 'pending'. Espelha processScreeningJob (Marco 1).
 */
export async function processExtractionJob(
  deps: ExtractionBatchDeps,
  jobId: string,
): Promise<ExtractionBatchResult> {
  const { supabase, provider } = deps;

  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const { data: items, error } = await supabase
    .from("job_item")
    .select("id, payload, review_id, attempts")
    .eq("job_id", jobId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  let runDone = 0;
  let runFailed = 0;

  for (const it of (items ?? []) as ExtractionItem[]) {
    try {
      await runExtractionForRecord(
        { supabase, provider },
        it.review_id,
        it.payload.record_id,
      );

      await supabase.from("ai_usage").insert({
        review_id: it.review_id,
        phase: "extraction",
        tokens_in: 0,
        tokens_out: 0,
        cost: {},
        job_id: jobId,
      });

      await supabase
        .from("job_item")
        .update({ status: "done" })
        .eq("id", it.id);

      runDone++;
    } catch (e) {
      await supabase
        .from("job_item")
        .update({
          status: "failed",
          error: (e as Error).message,
          attempts: (it.attempts ?? 0) + 1,
        })
        .eq("id", it.id);

      runFailed++;
    }
  }

  const { data: counts, error: cErr } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);

  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const totalDone = all.filter((i) => i.status === "done").length;
  const totalFailed = all.filter((i) => i.status === "failed").length;
  const status =
    totalFailed > 0
      ? totalDone > 0
        ? "completed_with_errors"
        : "failed"
      : "completed";

  await supabase
    .from("job")
    .update({
      status,
      progress: total ? Math.round((totalDone / total) * 100) : 100,
    })
    .eq("id", jobId);

  return { job_id: jobId, status, done: runDone, failed: runFailed };
}
