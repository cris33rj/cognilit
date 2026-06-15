import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeMarkdown } from "./serialize-markdown";
import { serializeBibtex } from "./serialize-bibtex";
import { serializeRis } from "./serialize-ris";
import { serializeDocx } from "./serialize-docx";
import { serializePdf } from "./serialize-pdf";
import { formatCitationsApa7 } from "./format-apa7";
import { loadExportInputs, listIncludedFtRecordsDetail } from "./queries";
import { toFlowModel } from "@/lib/prisma/flow-model";
import { renderPrismaSvg } from "@/lib/prisma/svg";
import { renderPrismaPng } from "@/lib/prisma/png";
import type { PrismaCounters, ExclusionCount } from "@/lib/prisma/queries";

interface JobItemRow {
  id: string;
  payload: { format: string };
  attempts: number;
}

export interface ExportBatchDeps {
  supabase: SupabaseClient; // admin/service: upload no Storage + insert export_artifact
}

export interface ExportBatchResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

const EXT: Record<string, string> = {
  md: "md",
  bibtex: "bib",
  ris: "ris",
  docx: "docx",
  pdf: "pdf",
};
const MIME: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  bibtex: "application/x-bibtex; charset=utf-8",
  ris: "application/x-research-info-systems; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

/**
 * Processa um job report_export. Item = um formato (resiliente, FR-023):
 *   serializa → upload no bucket exports → insere export_artifact → marca done.
 * Formato não suportado nesta fatia (docx/pdf/prisma_*) → item falha isolado.
 */
export async function processReportExportJob(
  deps: ExportBatchDeps,
  jobId: string,
): Promise<ExportBatchResult> {
  const { supabase } = deps;

  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  try {
    const { data: jobData, error: jobErr } = await supabase
      .from("job")
      .select("id, review_id")
      .eq("id", jobId)
      .single();
    if (jobErr) throw new Error(jobErr.message);
    const reviewId = (jobData as { review_id: string }).review_id;

    // Relatório é opcional aqui (export de referências pode preceder o relatório):
    // data=null sem erro é esperado; um erro real de DB deve emergir.
    const { data: reportRow, error: reportErr } = await supabase
      .from("report")
      .select("id")
      .eq("review_id", reviewId)
      .maybeSingle();
    if (reportErr) throw new Error(reportErr.message);
    const reportId = (reportRow as { id: string } | null)?.id ?? null;

    const { data: items, error: itemsErr } = await supabase
      .from("job_item")
      .select("id, payload, attempts")
      .eq("job_id", jobId)
      .eq("status", "pending");
    if (itemsErr) throw new Error(itemsErr.message);

    let done = 0;
    let failed = 0;

    for (const it of (items ?? []) as JobItemRow[]) {
      const format = it.payload.format;
      try {
        const bytes = await serializeFormat(supabase, reviewId, format);
        const ext = EXT[format];
        const path = `review/${reviewId}/report/${reportId ?? "_"}/${format}/${it.id}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("exports")
          .upload(path, bytes, { contentType: MIME[format], upsert: true });
        if (upErr) throw new Error(upErr.message);

        // upsert por (job_id, format): idempotente em re-execução, espelhando o
        // upsert:true do upload no Storage (sem export_artifact duplicado).
        const { error: artErr } = await supabase.from("export_artifact").upsert(
          {
            review_id: reviewId,
            report_id: reportId,
            format,
            storage_path: path,
            job_id: jobId,
          },
          { onConflict: "job_id,format" },
        );
        if (artErr) throw new Error(artErr.message);

        await supabase
          .from("job_item")
          .update({ status: "done" })
          .eq("id", it.id);
        done++;
      } catch (e) {
        await supabase
          .from("job_item")
          .update({
            status: "failed",
            error: (e as Error).message,
            attempts: (it.attempts ?? 0) + 1,
          })
          .eq("id", it.id);
        failed++;
      }
    }

    return await _finalizeJob(supabase, jobId, done, failed);
  } catch (e) {
    await supabase.from("job").update({ status: "failed" }).eq("id", jobId);
    throw e;
  }
}

/**
 * Carrega os dados necessários para DOCX/PDF, usando o cliente supabase do worker
 * (evita chamar loadPrismaFlowModel que usa o server client de request do Next.js).
 */
async function loadDocInputs(supabase: SupabaseClient, reviewId: string) {
  const [input, records, countersRow, breakdownRows] = await Promise.all([
    loadExportInputs({ supabase }, reviewId),
    listIncludedFtRecordsDetail({ supabase }, reviewId),
    supabase
      .from("prisma_counter")
      .select(
        "identified, duplicates, screened, included_ts, excluded_ts, maybe_ts, included_ft, excluded_ft, passed_ts",
      )
      .eq("review_id", reviewId)
      .maybeSingle(),
    supabase
      .from("prisma_exclusion_breakdown")
      .select("reason_id, reason_label, n")
      .eq("review_id", reviewId)
      .order("n", { ascending: false }),
  ]);

  const counters: PrismaCounters = {
    identified: countersRow.data?.identified ?? 0,
    duplicates: countersRow.data?.duplicates ?? 0,
    screened: countersRow.data?.screened ?? 0,
    includedTs: countersRow.data?.included_ts ?? 0,
    excludedTs: countersRow.data?.excluded_ts ?? 0,
    maybeTs: countersRow.data?.maybe_ts ?? 0,
    passedTs: countersRow.data?.passed_ts ?? 0,
    includedFt: countersRow.data?.included_ft ?? 0,
    excludedFt: countersRow.data?.excluded_ft ?? 0,
  };

  const breakdown: ExclusionCount[] = (breakdownRows.data ?? []).map((r) => ({
    reasonId: (r as { reason_id: string | null }).reason_id ?? "",
    reasonLabel: (r as { reason_label: string | null }).reason_label ?? "",
    n: (r as { n: number | null }).n ?? 0,
  }));

  const flowModel = toFlowModel(counters, breakdown);
  const references = formatCitationsApa7(records);

  let prismaPng: Uint8Array | null = null;
  try {
    prismaPng = await renderPrismaPng(renderPrismaSvg(flowModel));
  } catch {
    prismaPng = null;
  }

  return { input, references, prismaPng };
}

/** Serializa um formato suportado. Outros → erro isolado (resilência por-formato). */
async function serializeFormat(
  supabase: SupabaseClient,
  reviewId: string,
  format: string,
): Promise<Buffer> {
  switch (format) {
    case "md": {
      const input = await loadExportInputs({ supabase }, reviewId);
      return Buffer.from(serializeMarkdown(input), "utf-8");
    }
    case "bibtex": {
      const records = await listIncludedFtRecordsDetail({ supabase }, reviewId);
      return Buffer.from(serializeBibtex(records), "utf-8");
    }
    case "ris": {
      const records = await listIncludedFtRecordsDetail({ supabase }, reviewId);
      return Buffer.from(serializeRis(records), "utf-8");
    }
    case "docx": {
      const { input, references, prismaPng } = await loadDocInputs(
        supabase,
        reviewId,
      );
      return serializeDocx(input, references, prismaPng);
    }
    case "pdf": {
      const { input, references, prismaPng } = await loadDocInputs(
        supabase,
        reviewId,
      );
      return serializePdf(input, references, prismaPng);
    }
    default:
      throw new Error(`formato '${format}' não suportado nesta versão`);
  }
}

/** Espelha _finalizeJob do report batch-worker (recomputa de TODOS os itens → retomável). */
async function _finalizeJob(
  supabase: SupabaseClient,
  jobId: string,
  done: number,
  failed: number,
): Promise<ExportBatchResult> {
  const { data: counts, error } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);

  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const totalDone = all.filter((i) => i.status === "done").length;
  const totalFailed = all.filter((i) => i.status === "failed").length;

  const status: ExportBatchResult["status"] =
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

  return { job_id: jobId, status, done, failed };
}
