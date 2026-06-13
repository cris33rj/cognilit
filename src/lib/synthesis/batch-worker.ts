import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider, SynthesisFinding } from "@/lib/ai/llm/types";
import { collectRatifiedFindings } from "./queries";
import { buildThemeSummaryTable, type SummaryFinding } from "./summary-table";

// ── Types ────────────────────────────────────────────────────────────────────

interface JobItemRow {
  id: string;
  review_id: string;
  payload: { record_id: string };
  attempts: number;
}

interface JobRow {
  id: string;
  review_id: string;
}

interface SynthesisRow {
  id: string;
}

interface ThemeRow {
  id: string;
}

interface SuggestionRow {
  id: string;
}

interface RecordRow {
  id: string;
  title_norm: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SynthesisBatchDeps {
  supabase: SupabaseClient;
  provider: LLMProvider;
}

export interface SynthesisBatchResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

// ── Worker ───────────────────────────────────────────────────────────────────

/**
 * Processa um job synthesis_batch (US1 / FR-001..007, FR-005a):
 *   1. Marca job 'running'.
 *   2. Resolve (ou cria) a row de synthesis.
 *   3. Agrega pool de achados item-a-item (resiliência per-item — FR-005).
 *   4. Se pool vazio → synthesis='draft', finaliza.
 *   5. Chama provider.synthesizeThemes; se insufficientData → draft, finaliza.
 *   6. REGENERATION-PRESERVATION: apaga temas 'pending'; insere novos temas +
 *      ai_suggestion (pattern Marco 2: target→suggestion→update target) +
 *      theme_finding + summary_table; marca synthesis='ready'.
 *   7. Insere ai_usage(phase='synthesis').
 *   8. Finaliza job status/progress (espelha processExtractionJob).
 */
export async function processSynthesisJob(
  deps: SynthesisBatchDeps,
  jobId: string,
): Promise<SynthesisBatchResult> {
  const { supabase, provider } = deps;

  // ── 1. Mark job running ───────────────────────────────────────────────────
  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  // Read job to get review_id
  const { data: jobData, error: jobErr } = await supabase
    .from("job")
    .select("id, review_id")
    .eq("id", jobId)
    .single();
  if (jobErr) throw new Error(jobErr.message);
  const job = jobData as JobRow;
  const reviewId = job.review_id;

  // ── 2. Resolve synthesis row ──────────────────────────────────────────────
  const { data: existingSynth } = await supabase
    .from("synthesis")
    .select("id")
    .eq("review_id", reviewId)
    .maybeSingle<SynthesisRow>();

  let synthesisId: string;
  if (existingSynth) {
    synthesisId = existingSynth.id;
    await supabase
      .from("synthesis")
      .update({ status: "generating" })
      .eq("id", synthesisId);
  } else {
    const { data: newSynth, error: synthErr } = await supabase
      .from("synthesis")
      .insert({ review_id: reviewId, status: "generating" })
      .select("id")
      .single();
    if (synthErr) throw new Error(synthErr.message);
    synthesisId = (newSynth as SynthesisRow).id;
  }

  // ── 3. Read pending job_items ─────────────────────────────────────────────
  const { data: items, error: itemsErr } = await supabase
    .from("job_item")
    .select("id, review_id, payload, attempts")
    .eq("job_id", jobId)
    .eq("status", "pending");
  if (itemsErr) throw new Error(itemsErr.message);

  const pool: SynthesisFinding[] = [];
  let runDone = 0;
  let runFailed = 0;

  // ── 4. Aggregate findings per-item (resilient) ────────────────────────────
  for (const it of (items ?? []) as JobItemRow[]) {
    try {
      const findings = await collectRatifiedFindings(
        { supabase },
        reviewId,
        it.payload.record_id,
      );
      pool.push(...findings);

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

  // ── 5. Empty pool — no fabrication (FR-007) ───────────────────────────────
  if (pool.length === 0) {
    await supabase
      .from("synthesis")
      .update({ status: "draft" })
      .eq("id", synthesisId);
    return await _finalizeJob(supabase, jobId, runDone, runFailed);
  }

  // ── 6. Synthesize themes ──────────────────────────────────────────────────
  const themeResult = await provider.synthesizeThemes({
    findings: pool,
    language: "pt-BR",
  });

  if ("insufficientData" in themeResult && themeResult.insufficientData) {
    await supabase
      .from("synthesis")
      .update({ status: "draft" })
      .eq("id", synthesisId);
    return await _finalizeJob(supabase, jobId, runDone, runFailed);
  }

  const { themes } = themeResult as {
    themes: NonNullable<
      typeof themeResult extends { themes: infer T } ? T : never
    >;
  };

  // ── 6a. REGENERATION-PRESERVATION: delete stale pending themes ───────────
  await supabase
    .from("theme")
    .delete()
    .eq("synthesis_id", synthesisId)
    .eq("state", "pending");

  // ── 6b. Fetch record labels in ONE query ──────────────────────────────────
  const involvedRecordIds = [...new Set(pool.map((f) => f.recordId))];
  const { data: recordRows } = await supabase
    .from("record")
    .select("id, title_norm, metadata")
    .in("id", involvedRecordIds);

  const recordLabelMap = new Map<string, string>();
  for (const r of (recordRows ?? []) as RecordRow[]) {
    const label =
      r.title_norm ??
      ((r.metadata as Record<string, unknown> | null)?.["title"] as
        | string
        | undefined) ??
      r.id;
    recordLabelMap.set(r.id, label);
  }

  // ── 6c. Insert each theme (Marco 2 pattern: target→suggestion→link) ───────
  const identity = provider.identity();
  const provenance = {
    model: identity.model,
    version: identity.version,
    prompt_or_span: "synthesizeThemes",
    timestamp: new Date().toISOString(),
  };

  const typedThemes = themes as import("@/lib/ai/llm/types").SynthesizedTheme[];

  for (const [idx, theme] of typedThemes.entries()) {
    // Build summary_table from the findings belonging to this theme
    const themefindings: SummaryFinding[] = pool
      .filter((f) => theme.findingRefs.includes(f.extractionValueId))
      .map((f) => ({
        recordId: f.recordId,
        recordLabel: recordLabelMap.get(f.recordId) ?? f.recordId,
        fieldName: f.fieldName,
        finalValue: f.value,
      }));

    const summaryTable = buildThemeSummaryTable(themefindings);

    // Insert theme row (state='pending', no ai_suggestion_id yet)
    const { data: themeData, error: themeErr } = await supabase
      .from("theme")
      .insert({
        review_id: reviewId,
        synthesis_id: synthesisId,
        name: theme.name,
        narrative: theme.narrative,
        order: idx,
        summary_table: summaryTable,
        state: "pending",
      })
      .select("id")
      .single();
    if (themeErr) throw new Error(themeErr.message);
    const themeId = (themeData as ThemeRow).id;

    // Insert ai_suggestion (target_kind='synthesis_theme', target_id=theme.id)
    // Marco 2 pattern: insert target → insert suggestion → update target.ai_suggestion_id
    const { data: suggData, error: suggErr } = await supabase
      .from("ai_suggestion")
      .insert({
        review_id: reviewId,
        target_kind: "synthesis_theme",
        target_id: themeId,
        output: { name: theme.name, narrative: theme.narrative },
        provenance: provenance,
        state: "pending",
        grounding: { findingRefs: theme.findingRefs },
        not_found: false,
      })
      .select("id")
      .single();
    if (suggErr) throw new Error(suggErr.message);
    const suggestionId = (suggData as SuggestionRow).id;

    // Link theme → suggestion
    await supabase
      .from("theme")
      .update({ ai_suggestion_id: suggestionId })
      .eq("id", themeId);

    // Insert theme_finding rows
    for (const [fi, evId] of theme.findingRefs.entries()) {
      await supabase.from("theme_finding").insert({
        review_id: reviewId,
        theme_id: themeId,
        extraction_value_id: evId,
        order: fi,
      });
    }
  }

  // Mark synthesis ready
  await supabase
    .from("synthesis")
    .update({ status: "ready" })
    .eq("id", synthesisId);

  // ── 7. Insert ai_usage ────────────────────────────────────────────────────
  await supabase.from("ai_usage").insert({
    review_id: reviewId,
    phase: "synthesis",
    tokens_in: 0,
    tokens_out: 0,
    cost: {},
    job_id: jobId,
  });

  // ── 8. Finalize job ───────────────────────────────────────────────────────
  return await _finalizeJob(supabase, jobId, runDone, runFailed);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function _finalizeJob(
  supabase: SupabaseClient,
  jobId: string,
  runDone: number,
  runFailed: number,
): Promise<SynthesisBatchResult> {
  const { data: counts, error: cErr } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);

  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const totalDone = all.filter((i) => i.status === "done").length;
  const totalFailed = all.filter((i) => i.status === "failed").length;

  const status: SynthesisBatchResult["status"] =
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
