import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider, ThemeSummary } from "@/lib/ai/llm/types";
import { buildDeterministicSections } from "./sections";
import { loadReportInputs, resolveReport } from "./queries";

// ── Types ────────────────────────────────────────────────────────────────────

interface JobRow {
  id: string;
  review_id: string;
}

interface JobItemRow {
  id: string;
  payload: { kind: "discussion" | "conclusion" };
  attempts: number;
}

interface SectionRow {
  id: string;
  edit_state: string;
}

interface SuggestionRow {
  id: string;
}

export interface ReportBatchDeps {
  supabase: SupabaseClient;
  provider: LLMProvider;
}

export interface ReportBatchResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

const SECTION_ORDER: Record<string, number> = {
  methods: 0,
  results: 1,
  discussion: 2,
  conclusion: 3,
  ai_declaration: 4,
  deviations: 5,
};

// ── Worker ───────────────────────────────────────────────────────────────────

/**
 * Processa um job report_draft:
 *   1. Marca job 'running'.
 *   2. Resolve (ou cria) a row report.
 *   3. Monta 4 seções determinísticas e upserta, preservando human_edited.
 *   4. Para cada job_item (discussion|conclusion): preserva human_edited;
 *      caso contrário chama provider.draftReportSection + insere ai_suggestion
 *      (padrão Marco 2: target→suggestion→update target.ai_suggestion_id) + ai_usage.
 *   5. Seta report.status = 'ready'.
 *   6. Finaliza job espelhando _finalizeJob da síntese.
 */
export async function processReportDraftJob(
  deps: ReportBatchDeps,
  jobId: string,
): Promise<ReportBatchResult> {
  const { supabase, provider } = deps;

  // ── 1. Mark job running ───────────────────────────────────────────────────
  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  let reportId: string | null = null;
  try {
    // Read job to get review_id
    const { data: jobData, error: jobErr } = await supabase
      .from("job")
      .select("id, review_id")
      .eq("id", jobId)
      .single();
    if (jobErr) throw new Error(jobErr.message);
    const reviewId = (jobData as JobRow).review_id;

    // ── 2. Resolve report row ───────────────────────────────────────────────
    reportId = await resolveReport({ supabase }, reviewId);
    await supabase
      .from("report")
      .update({ status: "generating" })
      .eq("id", reportId);

    // ── 3. Determinísticas ──────────────────────────────────────────────────
    const inputs = await loadReportInputs({ supabase }, reviewId);
    const deterministic = buildDeterministicSections(inputs);

    for (const sec of deterministic) {
      await upsertSection(
        supabase,
        reviewId,
        reportId,
        sec.kind,
        sec.content,
        "deterministic",
        null,
        sec.order,
      );
    }

    // Contexto p/ o LLM — seções determinísticas + temas ratificados.
    const methods =
      deterministic.find((s) => s.kind === "methods")?.content ?? "";
    const results =
      deterministic.find((s) => s.kind === "results")?.content ?? "";
    const themes: ThemeSummary[] = inputs.themes;

    // ── 4. Seções IA, resiliente por-item ──────────────────────────────────
    const { data: items, error: itemsErr } = await supabase
      .from("job_item")
      .select("id, payload, attempts")
      .eq("job_id", jobId)
      .eq("status", "pending");
    if (itemsErr) throw new Error(itemsErr.message);

    let runDone = 0;
    let runFailed = 0;

    for (const it of (items ?? []) as JobItemRow[]) {
      const kind = it.payload.kind;
      try {
        // Preservar human_edited
        const { data: existing } = await supabase
          .from("report_section")
          .select("id, edit_state")
          .eq("report_id", reportId)
          .eq("kind", kind)
          .maybeSingle<SectionRow>();

        if (existing?.edit_state === "human_edited") {
          await supabase
            .from("job_item")
            .update({ status: "done" })
            .eq("id", it.id);
          runDone++;
          continue;
        }

        // Chamar LLM
        const drafted = await provider.draftReportSection({
          kind,
          language: "pt-BR",
          context: { methods, results, themes },
        });

        // Upsert seção como ai_generated (sem ai_suggestion_id ainda)
        const sectionId = await upsertSection(
          supabase,
          reviewId,
          reportId,
          kind,
          drafted.content,
          "ai_generated",
          null,
          SECTION_ORDER[kind] ?? 2,
        );

        // Inserir ai_suggestion (padrão Marco 2: target→suggestion→update target)
        const { data: sug, error: sugErr } = await supabase
          .from("ai_suggestion")
          .insert({
            review_id: reviewId,
            target_kind: "report_section",
            target_id: sectionId,
            output: { kind, content: drafted.content },
            provenance: drafted.provenance,
            state: "pending",
          })
          .select("id")
          .single();
        if (sugErr) throw new Error(sugErr.message);
        const suggestionId = (sug as SuggestionRow).id;

        // Linkar seção → sugestão
        await supabase
          .from("report_section")
          .update({ ai_suggestion_id: suggestionId })
          .eq("id", sectionId);

        // Registrar ai_usage (phase='report')
        await supabase.from("ai_usage").insert({
          review_id: reviewId,
          phase: "report",
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

    // ── 5. Marcar report pronto ─────────────────────────────────────────────
    await supabase
      .from("report")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", reportId);

    // ── 6. Finalizar job (espelha _finalizeJob da síntese) ─────────────────
    return await _finalizeJob(supabase, jobId, runDone, runFailed);
  } catch (e) {
    await supabase.from("job").update({ status: "failed" }).eq("id", jobId);
    if (reportId) {
      await supabase
        .from("report")
        .update({ status: "failed" })
        .eq("id", reportId);
    }
    throw e;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Finaliza o job: recalcula progresso a partir de todos os job_items (não apenas
 * os do run atual), espelhando _finalizeJob do batch-worker de síntese.
 */
async function _finalizeJob(
  supabase: SupabaseClient,
  jobId: string,
  runDone: number,
  runFailed: number,
): Promise<ReportBatchResult> {
  const { data: counts, error: cErr } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);

  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const totalDone = all.filter((i) => i.status === "done").length;
  const totalFailed = all.filter((i) => i.status === "failed").length;

  const status: ReportBatchResult["status"] =
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

/**
 * Upsert por (report_id, kind) preservando human_edited.
 * Retorna o id da seção.
 */
async function upsertSection(
  supabase: SupabaseClient,
  reviewId: string,
  reportId: string,
  kind: string,
  content: string,
  editState: string,
  aiSuggestionId: string | null,
  order: number,
): Promise<string> {
  const { data: existing } = await supabase
    .from("report_section")
    .select("id, edit_state")
    .eq("report_id", reportId)
    .eq("kind", kind)
    .maybeSingle<SectionRow>();

  if (existing) {
    if (existing.edit_state === "human_edited") return existing.id;
    await supabase
      .from("report_section")
      .update({
        content,
        edit_state: editState,
        ai_suggestion_id: aiSuggestionId,
        order,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("report_section")
    .insert({
      review_id: reviewId,
      report_id: reportId,
      kind,
      content,
      edit_state: editState,
      ai_suggestion_id: aiSuggestionId,
      order,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (created as { id: string }).id;
}
