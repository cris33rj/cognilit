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
  attempts: number;
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
    .select("id, payload, review_id, attempts")
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

  for (const item of (items ?? []) as WorkItem[]) {
    try {
      if (deps.processItem) await deps.processItem(item, real);
      else await real(item);
    } catch (e) {
      await supabase
        .from("job_item")
        .update({
          status: "failed",
          error: (e as Error).message,
          attempts: (item.attempts ?? 0) + 1,
        })
        .eq("id", item.id);
    }
  }

  // Derive final status and progress from DB counts across ALL items for the job
  // (robust to resumed/partial runs where this invocation didn't process all items).
  const { data: counts, error: countErr } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (countErr) throw new Error(countErr.message);

  const allItems = (counts ?? []) as { status: string }[];
  const totalDb = allItems.length;
  const doneDb = allItems.filter((i) => i.status === "done").length;
  const failedDb = allItems.filter((i) => i.status === "failed").length;

  const status =
    failedDb === 0 && doneDb === totalDb
      ? "completed"
      : doneDb === 0
        ? "failed"
        : "completed_with_errors";

  const progress = totalDb > 0 ? Math.round((doneDb / totalDb) * 100) : 0;

  try {
    await supabase
      .from("job")
      .update({
        status,
        progress,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (e) {
    // Log and rethrow — do not swallow silently.
    console.error("Failed to update job status:", e);
    throw e;
  }

  return { job_id: jobId, status, done: doneDb, failed: failedDb };
}
