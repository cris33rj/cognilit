import { normalizeDoi, normalizeTitle } from "../import/normalize";
import type { ParsedRecord, SourceFormat } from "../import/types";
import type { JobDeps, WorkerResult } from "./types";

interface ImportItemPayload {
  record: ParsedRecord;
  search_id: string;
  format: SourceFormat;
}

interface WorkItem {
  id: string;
  payload: ImportItemPayload;
  review_id: string;
}

export interface WorkerDeps extends JobDeps {
  /** Override de processamento por item (testes — D-F3.1). `real` aplica o default. */
  processItem?: (
    item: WorkItem,
    real: (item: WorkItem) => Promise<void>,
  ) => Promise<void>;
}

/**
 * Processa um job de importação item-a-item (§VIII): normaliza (R2) e insere
 * cada record via RPC atômica insert_import_record. Falha de um item ⇒ item
 * 'failed' (não derruba o job). Retomável: só pega itens 'pending'.
 */
export async function processImportJob(
  deps: WorkerDeps,
  jobId: string,
): Promise<WorkerResult> {
  const { supabase } = deps;

  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const { data: items, error } = await supabase
    .from("job_item")
    .select("id, payload, review_id")
    .eq("job_id", jobId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  const real = async (i: WorkItem) => {
    const rec = i.payload.record;
    const { error: rpcErr } = await supabase.rpc("insert_import_record", {
      p_review_id: i.review_id,
      p_search_id: i.payload.search_id,
      p_job_item_id: i.id,
      p_source_format: i.payload.format,
      p_raw: rec.raw,
      p_metadata: {
        title: rec.title,
        authors: rec.authors,
        year: rec.year,
        doi: rec.doi,
        abstract: rec.abstract,
        language: rec.language,
      },
      p_doi_normalized: normalizeDoi(rec.doi) ?? "",
      p_title_norm: normalizeTitle(rec.title) ?? "",
    });
    if (rpcErr) throw new Error(rpcErr.message);
  };

  let done = 0;
  let failed = 0;
  for (const item of (items ?? []) as WorkItem[]) {
    try {
      if (deps.processItem) await deps.processItem(item, real);
      else await real(item);
      done += 1;
    } catch (e) {
      failed += 1;
      await supabase
        .from("job_item")
        .update({
          status: "failed",
          error: (e as Error).message,
          attempts: 1,
        })
        .eq("id", item.id);
    }
  }

  const total = done + failed;
  const status =
    failed === 0
      ? "completed"
      : done === 0
        ? "failed"
        : "completed_with_errors";
  await supabase
    .from("job")
    .update({
      status,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return { job_id: jobId, status, done, failed };
}
