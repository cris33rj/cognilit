import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { processPdfPipelineJob } from "@/lib/documents/pipeline-worker";
import { runPdfPipelineWorkerWith } from "@/lib/documents/run";

const fakeRasterize = async (_b: Uint8Array, _page: number) => ({
  imageBase64: "ZmFrZQ==",
  mediaType: "image/png" as const,
});

/** Cria review + record included_ft e anexa um PDF (via RPC), devolvendo ids. */
async function seedDocument(
  owner: Awaited<ReturnType<typeof signUpUser>>["client"],
  reviewId: string,
  bytes: Uint8Array,
) {
  const svc = serviceClient();
  const { data: rec } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo PDF" },
      title_norm: "estudo pdf",
      corpus_state: "included_ft",
    })
    .select("id")
    .single();
  const recordId = rec!.id as string;
  const documentId = crypto.randomUUID();
  const storagePath = `review/${reviewId}/record/${recordId}/${documentId}.pdf`;
  const up = await svc.storage
    .from("pdfs")
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (up.error) throw new Error(up.error.message);
  const { data: job, error } = await owner.rpc("create_pdf_pipeline_job", {
    p_review_id: reviewId,
    p_record_id: recordId,
    p_document_id: documentId,
    p_storage_path: storagePath,
    p_filename: "estudo.pdf",
    p_byte_size: bytes.byteLength,
  });
  if (error) throw new Error(error.message);
  return {
    recordId,
    documentId,
    jobId: (job as { job_id: string }).job_id,
  };
}

const samplePdf = () =>
  new Uint8Array(
    readFileSync(join(process.cwd(), "tests/fixtures/sample.pdf")),
  );

describe("pdf_text_pipeline — PDF nativo (FR-007/008)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let documentId: string;
  let jobId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`pdf_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Pipeline",
    });
    reviewId = review.id;
    ({ documentId, jobId } = await seedDocument(owner, reviewId, samplePdf()));
  });

  it("grava text_layer origin='nativo' e move document p/ text_ready com page_count", async () => {
    const svc = serviceClient();
    await processPdfPipelineJob(
      {
        supabase: svc,
        provider: new MockLLMProvider(),
        rasterize: fakeRasterize,
      },
      jobId,
    );
    const { data: layers } = await svc
      .from("text_layer")
      .select("origin, page")
      .eq("document_id", documentId);
    expect((layers ?? []).length).toBeGreaterThanOrEqual(1);
    expect(layers!.every((l) => l.origin === "nativo")).toBe(true);

    const { data: doc } = await svc
      .from("document")
      .select("processing_status, page_count")
      .eq("id", documentId)
      .single();
    expect(doc!.processing_status).toBe("text_ready");
    expect(doc!.page_count).toBeGreaterThanOrEqual(1);
  });
});

describe("pdf_text_pipeline — página escaneada → OCR (origin='ocr_ia')", () => {
  it("limiar alto força todas as páginas a OCR via provider", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`ocr_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "OCR",
    });
    const reviewId = review.id;
    const { documentId, jobId } = await seedDocument(
      owner,
      reviewId,
      samplePdf(),
    );
    const svc = serviceClient();
    await processPdfPipelineJob(
      {
        supabase: svc,
        provider: new MockLLMProvider(),
        rasterize: fakeRasterize,
        scanThreshold: 100000, // força isScannedPage=true em toda página
      },
      jobId,
    );
    const { data: layers } = await svc
      .from("text_layer")
      .select("origin, content")
      .eq("document_id", documentId);
    expect(layers!.length).toBeGreaterThanOrEqual(1);
    expect(layers!.every((l) => l.origin === "ocr_ia")).toBe(true);
    expect(layers![0]!.content).toContain("[OCR p.1]");
  });
});

describe("pdf_text_pipeline — resiliência por-item + retomável (FR-006)", () => {
  it("PDF inválido ⇒ document.failed + job_item failed; PDF válido na mesma fila ⇒ done", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`res_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Resiliência",
    });
    const reviewId = review.id;
    const bad = await seedDocument(
      owner,
      reviewId,
      new Uint8Array([1, 2, 3, 4]),
    );
    const good = await seedDocument(owner, reviewId, samplePdf());
    const svc = serviceClient();

    await runPdfPipelineWorkerWith(svc, new MockLLMProvider(), reviewId, {
      rasterize: fakeRasterize,
    });

    const docBad = await svc
      .from("document")
      .select("processing_status")
      .eq("id", bad.documentId)
      .single();
    const docGood = await svc
      .from("document")
      .select("processing_status")
      .eq("id", good.documentId)
      .single();
    expect(docBad.data!.processing_status).toBe("failed");
    expect(["text_ready", "partial"]).toContain(
      docGood.data!.processing_status,
    );

    const { data: badJob } = await svc
      .from("job")
      .select("status")
      .eq("id", bad.jobId)
      .single();
    expect(["failed", "completed_with_errors"]).toContain(badJob!.status);
  });
});

describe("pdf_text_pipeline — RLS de text_layer (SC-011)", () => {
  it("membro de outra Revisão não lê text_layer alheio", async () => {
    const s = Date.now();
    const a = (await signUpUser(`tla_${s}@example.com`, "senha-teste-123"))
      .client;
    const b = (await signUpUser(`tlb_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: reviewA } = await a.rpc("create_review", { p_title: "A" });
    const reviewId = reviewA.id;
    const { documentId, jobId } = await seedDocument(a, reviewId, samplePdf());
    await processPdfPipelineJob(
      {
        supabase: serviceClient(),
        provider: new MockLLMProvider(),
        rasterize: fakeRasterize,
      },
      jobId,
    );
    const { data: seenByB } = await b
      .from("text_layer")
      .select("id")
      .eq("document_id", documentId);
    expect((seenByB ?? []).length).toBe(0);
  });
});
