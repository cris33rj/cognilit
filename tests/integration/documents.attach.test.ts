import { describe, it, expect, beforeAll } from "vitest";
import { serviceClient, signUpUser, anonClient } from "./helpers/supabase";
import { attachPdfDocument } from "@/lib/documents/attach";
import { listDocuments } from "@/lib/documents/queries";

async function newReview(
  client: Awaited<ReturnType<typeof signUpUser>>["client"],
  title: string,
) {
  const { data, error } = await client.rpc("create_review", { p_title: title });
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function seedRecord(
  reviewId: string,
  corpusState: string,
): Promise<string> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo" },
      corpus_state: corpusState,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

describe("RPC create_pdf_pipeline_job (Fatia 1, FR-001/005)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recordFt: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`rpc_${s}@example.com`, "senha-teste-123"))
      .client;
    reviewId = await newReview(owner, "RPC Revisão");
    recordFt = await seedRecord(reviewId, "included_ft");
  });

  it("cria document(queued) + job(pdf_text_pipeline) + job_item + audit_entry", async () => {
    const docId = crypto.randomUUID();
    const { data, error } = await owner.rpc("create_pdf_pipeline_job", {
      p_review_id: reviewId,
      p_record_id: recordFt,
      p_document_id: docId,
      p_storage_path: `review/${reviewId}/record/${recordFt}/${docId}.pdf`,
      p_filename: "estudo.pdf",
      p_byte_size: 4096,
    });
    expect(error).toBeNull();
    expect(data.job_id).toBeTruthy();
    expect(data.document_id).toBe(docId);

    const svc = serviceClient();
    const doc = await svc
      .from("document")
      .select("processing_status, record_id")
      .eq("id", docId)
      .single();
    expect(doc.data!.processing_status).toBe("queued");

    const job = await svc
      .from("job")
      .select("type, status")
      .eq("id", data.job_id)
      .single();
    expect(job.data!.type).toBe("pdf_text_pipeline");
    expect(job.data!.status).toBe("queued");

    const items = await svc
      .from("job_item")
      .select("payload")
      .eq("job_id", data.job_id);
    expect(items.data!.length).toBe(1);
    expect(
      (items.data![0]!.payload as { document_id: string }).document_id,
    ).toBe(docId);

    const audit = await svc
      .from("audit_entry")
      .select("action")
      .eq("review_id", reviewId)
      .eq("entity", "document")
      .eq("entity_id", docId);
    expect((audit.data ?? []).some((a) => a.action === "attach_pdf")).toBe(
      true,
    );
  });

  it("rejeita record que NÃO passou em Título/Resumo (corpus_state inválido)", async () => {
    const recActive = await seedRecord(reviewId, "active");
    const docId = crypto.randomUUID();
    const { error } = await owner.rpc("create_pdf_pipeline_job", {
      p_review_id: reviewId,
      p_record_id: recActive,
      p_document_id: docId,
      p_storage_path: `review/${reviewId}/record/${recActive}/${docId}.pdf`,
      p_filename: "x.pdf",
      p_byte_size: 10,
    });
    expect(error).not.toBeNull();
  });

  it("rejeita record de outra revisão (isolamento cross-review)", async () => {
    const otherUser = (
      await signUpUser(`other_${Date.now()}@example.com`, "senha-teste-123")
    ).client;
    const otherReviewId = await newReview(otherUser, "Outra Revisão");
    const foreignRecord = await seedRecord(otherReviewId, "included_ft");
    const docId = crypto.randomUUID();
    const { error } = await owner.rpc("create_pdf_pipeline_job", {
      p_review_id: reviewId, // owner's review — passes membership check
      p_record_id: foreignRecord, // record belongs to otherReviewId
      p_document_id: docId,
      p_storage_path: `review/${reviewId}/record/${foreignRecord}/${docId}.pdf`,
      p_filename: "cross.pdf",
      p_byte_size: 10,
    });
    expect(error).not.toBeNull(); // 'record not found in review'
  });
});

describe("attachPdfDocument — validar + upload Storage + RPC (FR-001/002/003)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recordFt: string;

  function pdf(): Uint8Array {
    return new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n");
  }

  beforeAll(async () => {
    const s = Date.now();
    const u = await signUpUser(`att_${s}@example.com`, "senha-teste-123");
    owner = u.client;
    reviewId = await newReview(owner, "Anexo Revisão");
    recordFt = await seedRecord(reviewId, "included_ft");
  });

  it("guarda o PDF e enfileira o job (estado queued)", async () => {
    const res = await attachPdfDocument(
      { supabase: owner },
      { reviewId, recordId: recordFt, filename: "estudo.pdf", bytes: pdf() },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const svc = serviceClient();
    const doc = await svc
      .from("document")
      .select("storage_path, processing_status")
      .eq("id", res.documentId)
      .single();
    expect(doc.data!.processing_status).toBe("queued");
    expect(doc.data!.storage_path).toContain(
      `review/${reviewId}/record/${recordFt}/`,
    );
    const obj = await svc.storage.from("pdfs").download(doc.data!.storage_path);
    expect(obj.data).not.toBeNull();
  });

  it("rejeita arquivo não-PDF sem persistir document (FR-003)", async () => {
    const before =
      (
        await serviceClient()
          .from("document")
          .select("id")
          .eq("review_id", reviewId)
      ).data?.length ?? 0;
    const res = await attachPdfDocument(
      { supabase: owner },
      {
        reviewId,
        recordId: recordFt,
        filename: "x.txt",
        bytes: new TextEncoder().encode("hello"),
      },
    );
    expect(res.ok).toBe(false);
    const after =
      (
        await serviceClient()
          .from("document")
          .select("id")
          .eq("review_id", reviewId)
      ).data?.length ?? 0;
    expect(after).toBe(before);
  });

  it("não-membro não consegue ler o objeto no Storage (SC-011)", async () => {
    const res = await attachPdfDocument(
      { supabase: owner },
      { reviewId, recordId: recordFt, filename: "estudo2.pdf", bytes: pdf() },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const stranger = anonClient();
    const { data } = await stranger.storage
      .from("pdfs")
      .download(`review/${reviewId}/record/${recordFt}/${res.documentId}.pdf`);
    expect(data).toBeNull();
  });

  it("remove o objeto órfão do Storage quando a RPC rejeita (FR-003)", async () => {
    const recActive = await seedRecord(reviewId, "active");
    const prefix = `review/${reviewId}/record/${recActive}`;
    const svc = serviceClient();
    const before = (await svc.storage.from("pdfs").list(prefix)).data ?? [];
    const res = await attachPdfDocument(
      { supabase: owner },
      { reviewId, recordId: recActive, filename: "orfao.pdf", bytes: pdf() },
    );
    expect(res.ok).toBe(false);
    const after = (await svc.storage.from("pdfs").list(prefix)).data ?? [];
    expect(after.length).toBe(before.length);
  });
});

describe("listDocuments (FR-004)", () => {
  it("lista os PDFs de um estudo com seu estado de processamento", async () => {
    const s = Date.now();
    const owner2 = (
      await signUpUser(`list_${s}@example.com`, "senha-teste-123")
    ).client;
    const rev = await newReview(owner2, "Lista Revisão");
    const rec = await seedRecord(rev, "included_ft");
    await attachPdfDocument(
      { supabase: owner2 },
      {
        reviewId: rev,
        recordId: rec,
        filename: "a.pdf",
        bytes: new TextEncoder().encode("%PDF-1.4\nx\n%%EOF\n"),
      },
    );
    const docs = await listDocuments({ supabase: owner2 }, rev, rec);
    expect(docs.length).toBe(1);
    expect(docs[0]!.filename).toBe("a.pdf");
    expect(docs[0]!.processing_status).toBe("queued");
  });
});
