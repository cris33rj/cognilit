import { describe, it, expect, beforeAll } from "vitest";
import { serviceClient, signUpUser } from "./helpers/supabase";

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
      (items.data![0].payload as { document_id: string }).document_id,
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
