import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";

interface ScreeningItem {
  id: string;
  payload: { record_id: string };
  review_id: string;
  attempts: number;
}

export interface ScreeningWorkerDeps {
  supabase: SupabaseClient;
  provider: LLMProvider;
  criteria: string[];
}

export interface ScreeningWorkerResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

/**
 * Processa um job ai_screening_batch item-a-item (§VIII): chama
 * LLMProvider.preclassifyScreening (a IA nunca decide — FR-024), grava
 * ai_suggestion (target_kind='screening') + ai_usage. Falha de um item ⇒ item
 * 'failed' (não derruba o job). Retomável: só pega itens 'pending'.
 */
export async function processScreeningJob(
  deps: ScreeningWorkerDeps,
  jobId: string,
): Promise<ScreeningWorkerResult> {
  const { supabase, provider, criteria } = deps;

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

  for (const it of (items ?? []) as ScreeningItem[]) {
    try {
      const { data: rec, error: recErr } = await supabase
        .from("record")
        .select("metadata")
        .eq("id", it.payload.record_id)
        .single();
      if (recErr) throw new Error(recErr.message);
      const meta = (rec?.metadata ?? {}) as {
        title?: string;
        abstract?: string;
      };

      const suggestion = await provider.preclassifyScreening({
        title: meta.title ?? "",
        abstract: meta.abstract ?? null,
        criteria,
      });

      const { error: insErr } = await supabase.from("ai_suggestion").insert({
        review_id: it.review_id,
        target_kind: "screening",
        target_id: it.payload.record_id,
        output: suggestion.output,
        provenance: suggestion.provenance,
        state: suggestion.state,
      });
      if (insErr) throw new Error(insErr.message);

      await supabase.from("ai_usage").insert({
        review_id: it.review_id,
        phase: "screening",
        tokens_in: 0,
        tokens_out: 0,
        cost: {},
        job_id: jobId,
      });

      await supabase
        .from("job_item")
        .update({ status: "done" })
        .eq("id", it.id);
    } catch (e) {
      await supabase
        .from("job_item")
        .update({
          status: "failed",
          error: (e as Error).message,
          attempts: (it.attempts ?? 0) + 1,
        })
        .eq("id", it.id);
    }
  }

  const { data: counts, error: cErr } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);

  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const done = all.filter((i) => i.status === "done").length;
  const failed = all.filter((i) => i.status === "failed").length;
  const status =
    failed > 0 ? (done > 0 ? "completed_with_errors" : "failed") : "completed";

  await supabase
    .from("job")
    .update({
      status,
      progress: total ? Math.round((done / total) * 100) : 100,
    })
    .eq("id", jobId);

  return { job_id: jobId, status, done, failed };
}
