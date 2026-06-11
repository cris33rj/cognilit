import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddingProvider } from "@/lib/ai/embedding/types";
import { chunkLayers, type LayerInput } from "./chunk";

interface EmbeddingItem {
  id: string;
  payload: { document_id: string };
  review_id: string;
  attempts: number;
}

export interface EmbeddingBatchDeps {
  supabase: SupabaseClient;
  provider: EmbeddingProvider;
}

export interface EmbeddingBatchResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

async function embedDocument(
  deps: EmbeddingBatchDeps,
  reviewId: string,
  documentId: string,
): Promise<number> {
  const { supabase, provider } = deps;
  const { data: layers, error } = await supabase
    .from("text_layer")
    .select("document_id, page, char_start, char_end, content, origin")
    .eq("document_id", documentId)
    .order("page", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (layers ?? []) as LayerInput[];
  if (rows.length === 0) {
    throw new Error(`documento ${documentId} sem text_layer`);
  }

  const chunks = chunkLayers(rows);
  if (chunks.length === 0) return 0;

  const embedded = await provider.embed({ chunks });
  const id = provider.identity();
  const insertRows: {
    review_id: string;
    document_id: string;
    page: number;
    char_start: number;
    char_end: number;
    content: string;
    origin: string;
    embedding: string;
    provider: string;
    model: string;
    dim: number;
  }[] = embedded.map((e) => ({
    review_id: reviewId,
    document_id: documentId,
    page: e.page,
    char_start: e.char_start,
    char_end: e.char_end,
    content: e.content,
    origin: e.origin,
    embedding: `[${e.embedding.join(",")}]`,
    provider: id.provider,
    model: id.model,
    dim: id.dimension,
  }));
  const { error: insErr } = await supabase
    .from("embedding_chunk")
    .insert(insertRows);
  if (insErr) throw new Error(insErr.message);
  return insertRows.length;
}

/**
 * Processa um job embedding_batch item-a-item (§VIII / A1): cada item é UM
 * documento. Falha de um item ⇒ item 'failed' (não derruba o job — FR-027).
 * Retomável: só pega itens 'pending'. Espelha processExtractionJob (Fatia 5).
 */
export async function processEmbeddingJob(
  deps: EmbeddingBatchDeps,
  jobId: string,
): Promise<EmbeddingBatchResult> {
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

  let runDone = 0;
  let runFailed = 0;

  for (const it of (items ?? []) as EmbeddingItem[]) {
    try {
      await embedDocument(deps, it.review_id, it.payload.document_id);
      await supabase.from("ai_usage").insert({
        review_id: it.review_id,
        phase: "embedding",
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
