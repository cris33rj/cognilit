import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueEmbeddingJob } from "@/lib/embedding/enqueue";
import { listEmbeddingCandidates } from "@/lib/embedding/queries";
import { processEmbeddingJob } from "@/lib/embedding/batch-worker";
import { runEmbeddingBatchWorkerWith } from "@/lib/embedding/batch-run";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";

export async function seedDoc(
  svc: SupabaseClient,
  reviewId: string,
  opts: { processed?: boolean; pages?: string[] } = {},
): Promise<{ recordId: string; documentId: string | null }> {
  const { data: rec } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      corpus_state: "included_ft",
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo" },
    })
    .select("id")
    .single();
  const recordId = rec!.id as string;
  if (opts.processed === false) return { recordId, documentId: null };
  const { data: doc } = await svc
    .from("document")
    .insert({
      review_id: reviewId,
      record_id: recordId,
      storage_path: `review/${reviewId}/record/${recordId}/d.pdf`,
      filename: "d.pdf",
      byte_size: 10,
      processing_status: "text_ready",
    })
    .select("id")
    .single();
  const documentId = doc!.id as string;
  const pages = opts.pages ?? ["Amostra de 42 participantes."];
  let i = 0;
  for (const content of pages) {
    i += 1;
    await svc.from("text_layer").insert({
      review_id: reviewId,
      document_id: documentId,
      page: i,
      char_start: 0,
      char_end: content.length,
      content,
      origin: "nativo",
    });
  }
  return { recordId, documentId };
}

export async function setupReview() {
  const { client } = await signUpUser(
    `emb_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review } = await client.rpc("create_review", {
    p_title: "Embeddings",
  });
  return { client, reviewId: review!.id as string, svc: serviceClient() };
}

describe("enqueueEmbeddingJob + listEmbeddingCandidates (US5/FR-027)", () => {
  it("enfileira um job_item por documento processado e não-embedado", async () => {
    const { client, reviewId, svc } = await setupReview();
    const a = await seedDoc(svc, reviewId);
    await seedDoc(svc, reviewId, { processed: false });

    const candidates = await listEmbeddingCandidates(
      { supabase: client },
      reviewId,
    );
    expect(candidates.map((c) => c.document_id)).toEqual([a.documentId]);

    const res = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    expect(res.status).toBe("queued");
    expect(res.item_count).toBe(1);

    const { data: job } = await svc
      .from("job")
      .select("type, status")
      .eq("id", res.job_id)
      .single();
    expect(job!.type).toBe("embedding_batch");
  });
});

describe("processEmbeddingJob (US5/FR-026/FR-027)", () => {
  it("embeda cada documento, grava embedding_chunk + ai_usage(phase='embedding') e fecha o job", async () => {
    const { client, reviewId, svc } = await setupReview();
    await seedDoc(svc, reviewId, {
      pages: ["pagina um do estudo", "pagina dois do estudo"],
    });
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);

    const res = await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      enq.job_id,
    );
    expect(res.status).toBe("completed");
    expect(res.done).toBe(1);

    const { data: chunks } = await svc
      .from("embedding_chunk")
      .select("page, content, dim, provider")
      .eq("review_id", reviewId);
    expect((chunks ?? []).length).toBeGreaterThanOrEqual(2);
    expect((chunks ?? []).every((c) => c.dim === 1024)).toBe(true);
    expect((chunks ?? []).every((c) => c.provider === "mock")).toBe(true);

    const { data: usage } = await svc
      .from("ai_usage")
      .select("phase, job_id")
      .eq("review_id", reviewId)
      .eq("phase", "embedding");
    expect((usage ?? []).length).toBe(1);
    expect((usage ?? [])[0]!.job_id).toBe(enq.job_id);
  });

  it("falha em um item não derruba o lote (completed_with_errors)", async () => {
    const { client, reviewId, svc } = await setupReview();
    await seedDoc(svc, reviewId);
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    await svc.from("job_item").insert({
      job_id: enq.job_id,
      review_id: reviewId,
      status: "pending",
      payload: { document_id: "00000000-0000-0000-0000-000000000000" },
    });

    const res = await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      enq.job_id,
    );
    expect(res.status).toBe("completed_with_errors");
    expect(res.done).toBe(1);
    expect(res.failed).toBe(1);
  });

  it("é retomável: re-rodar não duplica chunks de itens já 'done'", async () => {
    const { client, reviewId, svc } = await setupReview();
    await seedDoc(svc, reviewId);
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      enq.job_id,
    );
    const { count: after1 } = await svc
      .from("embedding_chunk")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    const res2 = await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      enq.job_id,
    );
    expect(res2.done).toBe(0);
    const { count: after2 } = await svc
      .from("embedding_chunk")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(after2).toBe(after1);
  });
});

describe("runEmbeddingBatchWorkerWith (US5/A1)", () => {
  it("processa todos os jobs embedding_batch ativos da Revisão", async () => {
    const { client, reviewId, svc } = await setupReview();
    await seedDoc(svc, reviewId);
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    await runEmbeddingBatchWorkerWith(
      svc,
      new MockEmbeddingProvider(),
      reviewId,
    );
    const { data: job } = await svc
      .from("job")
      .select("status")
      .eq("id", enq.job_id)
      .single();
    expect(job!.status).toBe("completed");
  });
});
