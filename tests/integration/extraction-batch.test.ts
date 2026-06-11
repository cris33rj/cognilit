import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueExtractionJob } from "@/lib/extraction/enqueue";
import { processExtractionJob } from "@/lib/extraction/batch-worker";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { runExtractionBatchWorkerWith } from "@/lib/extraction/batch-run";

/** Cria Revisão + estudo included_ft com PDF processado + text_layer + form (1 campo). */
async function seedStudy(
  svc: SupabaseClient,
  reviewId: string,
  opts: { processed?: boolean; title?: string } = {},
): Promise<string> {
  const { data: rec } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      corpus_state: "included_ft",
      source_format: "ris",
      raw: {},
      metadata: { title: opts.title ?? "Estudo" },
    })
    .select("id")
    .single();
  const recordId = rec!.id as string;
  if (opts.processed !== false) {
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
    await svc.from("text_layer").insert({
      review_id: reviewId,
      document_id: doc!.id,
      page: 1,
      char_start: 0,
      char_end: 28,
      content: "Amostra de 42 participantes.",
      origin: "nativo",
    });
  }
  return recordId;
}

async function setup() {
  const { client } = await signUpUser(
    `eb_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review } = await client.rpc("create_review", {
    p_title: "Extração lote",
  });
  const reviewId = review!.id as string;
  const svc = serviceClient();
  await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
  await client.rpc("add_extraction_field", {
    p_review_id: reviewId,
    p_name: "Amostra",
    p_type: "number",
    p_options: null,
  });
  return { client, reviewId, svc };
}

describe("enqueueExtractionJob (US4/FR-021)", () => {
  it("cria job ai_extraction_batch com um job_item por estudo elegível", async () => {
    const { client, reviewId, svc } = await setup();
    const r1 = await seedStudy(svc, reviewId, { title: "A" });
    const r2 = await seedStudy(svc, reviewId, { title: "B" });
    await seedStudy(svc, reviewId, { processed: false, title: "C" }); // sem PDF → fora

    const res = await enqueueExtractionJob(
      { supabase: client },
      reviewId,
      null,
    );
    expect(res.status).toBe("queued");
    expect(res.item_count).toBe(2); // C (sem PDF processado) não entra

    const { data: items } = await svc
      .from("job_item")
      .select("payload, status")
      .eq("job_id", res.job_id);
    const ids = (items ?? []).map(
      (i) => (i.payload as { record_id: string }).record_id,
    );
    expect(ids.sort()).toEqual([r1, r2].sort());
    expect((items ?? []).every((i) => i.status === "pending")).toBe(true);

    const { data: job } = await svc
      .from("job")
      .select("type, status")
      .eq("id", res.job_id)
      .single();
    expect(job!.type).toBe("ai_extraction_batch");
    expect(job!.status).toBe("queued");
  });

  it("respeita a seleção de recordIds (subconjunto)", async () => {
    const { client, reviewId, svc } = await setup();
    const r1 = await seedStudy(svc, reviewId, { title: "A" });
    await seedStudy(svc, reviewId, { title: "B" });

    const res = await enqueueExtractionJob({ supabase: client }, reviewId, [
      r1,
    ]);
    expect(res.item_count).toBe(1);
    const { data: items } = await svc
      .from("job_item")
      .select("payload")
      .eq("job_id", res.job_id);
    expect((items ?? [])[0]!.payload).toMatchObject({ record_id: r1 });
  });
});

describe("processExtractionJob (US4/FR-021/FR-023)", () => {
  it("processa cada estudo, grava ai_usage(phase='extraction') e fecha o job", async () => {
    const { client, reviewId, svc } = await setup();
    await seedStudy(svc, reviewId, { title: "A" });
    await seedStudy(svc, reviewId, { title: "B" });
    const enq = await enqueueExtractionJob(
      { supabase: client },
      reviewId,
      null,
    );

    const res = await processExtractionJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );
    expect(res.status).toBe("completed");
    expect(res.done).toBe(2);
    expect(res.failed).toBe(0);

    const { data: items } = await svc
      .from("job_item")
      .select("status")
      .eq("job_id", enq.job_id);
    expect((items ?? []).every((i) => i.status === "done")).toBe(true);

    const { data: job } = await svc
      .from("job")
      .select("status, progress")
      .eq("id", enq.job_id)
      .single();
    expect(job!.status).toBe("completed");
    expect(job!.progress).toBe(100);

    const { data: usage } = await svc
      .from("ai_usage")
      .select("phase, job_id")
      .eq("review_id", reviewId)
      .eq("phase", "extraction");
    expect((usage ?? []).length).toBe(2);
    expect((usage ?? []).every((u) => u.job_id === enq.job_id)).toBe(true);

    const { count } = await svc
      .from("extraction_value")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("falha de um item não derruba o lote (completed_with_errors)", async () => {
    const { client, reviewId, svc } = await setup();
    await seedStudy(svc, reviewId, { title: "A" });
    const enq = await enqueueExtractionJob(
      { supabase: client },
      reviewId,
      null,
    );

    await svc.from("job_item").insert({
      job_id: enq.job_id,
      review_id: reviewId,
      status: "pending",
      payload: { record_id: "00000000-0000-0000-0000-000000000000" },
    });

    const res = await processExtractionJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );
    expect(res.status).toBe("completed_with_errors");
    expect(res.done).toBe(1);
    expect(res.failed).toBe(1);

    const { data: failed } = await svc
      .from("job_item")
      .select("status, error, attempts")
      .eq("job_id", enq.job_id)
      .eq("status", "failed");
    expect((failed ?? []).length).toBe(1);
    expect((failed ?? [])[0]!.error).toBeTruthy();
    expect((failed ?? [])[0]!.attempts).toBe(1);
  });

  it("é retomável: re-rodar não reprocessa itens já 'done'", async () => {
    const { client, reviewId, svc } = await setup();
    await seedStudy(svc, reviewId, { title: "A" });
    const enq = await enqueueExtractionJob(
      { supabase: client },
      reviewId,
      null,
    );

    await processExtractionJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );
    const { count: after1 } = await svc
      .from("extraction_value")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);

    const res2 = await processExtractionJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );
    expect(res2.done).toBe(0);
    expect(res2.failed).toBe(0);

    const { count: after2 } = await svc
      .from("extraction_value")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(after2).toBe(after1);
  });
});

describe("runExtractionBatchWorkerWith (US4/A1)", () => {
  it("processa todos os jobs ai_extraction_batch ativos da Revisão", async () => {
    const { client, reviewId, svc } = await setup();
    await seedStudy(svc, reviewId, { title: "A" });
    const enq = await enqueueExtractionJob(
      { supabase: client },
      reviewId,
      null,
    );

    await runExtractionBatchWorkerWith(svc, new MockLLMProvider(), reviewId);

    const { data: job } = await svc
      .from("job")
      .select("status")
      .eq("id", enq.job_id)
      .single();
    expect(job!.status).toBe("completed");
  });
});
