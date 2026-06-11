import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueExtractionJob } from "@/lib/extraction/enqueue";

describe("RLS — lote de extração escopado por Revisão (SC-011)", () => {
  it("não-membro não lê job/job_item/ai_usage de outra Revisão", async () => {
    const { client: a } = await signUpUser(
      `eba_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: review } = await a.rpc("create_review", {
      p_title: "Dona A",
    });
    const reviewId = review!.id as string;
    const svc = serviceClient();

    const { data: rec } = await svc
      .from("record")
      .insert({
        review_id: reviewId,
        corpus_state: "included_ft",
        source_format: "ris",
        raw: {},
        metadata: { title: "E" },
      })
      .select("id")
      .single();
    const { data: doc } = await svc
      .from("document")
      .insert({
        review_id: reviewId,
        record_id: rec!.id,
        storage_path: `review/${reviewId}/record/${rec!.id}/d.pdf`,
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
      char_end: 10,
      content: "Texto.",
      origin: "nativo",
    });
    await a.rpc("ensure_extraction_form", { p_review_id: reviewId });
    await a.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Amostra",
      p_type: "number",
      p_options: null,
    });
    const enq = await enqueueExtractionJob({ supabase: a }, reviewId, null);
    await svc.from("ai_usage").insert({
      review_id: reviewId,
      phase: "extraction",
      tokens_in: 0,
      tokens_out: 0,
      cost: {},
      job_id: enq.job_id,
    });

    // Outro usuário (não-membro) não enxerga nada da Revisão de A.
    const { client: b } = await signUpUser(
      `ebb_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: jobs } = await b
      .from("job")
      .select("id")
      .eq("review_id", reviewId);
    expect(jobs!.length).toBe(0);
    const { data: jis } = await b
      .from("job_item")
      .select("id")
      .eq("job_id", enq.job_id);
    expect(jis!.length).toBe(0);
    const { data: usage } = await b
      .from("ai_usage")
      .select("id")
      .eq("review_id", reviewId);
    expect(usage!.length).toBe(0);

    // E não consegue enfileirar lote na Revisão de A (RPC checa is_review_member).
    const { error: rpcErr } = await b.rpc("create_extraction_job", {
      p_review_id: reviewId,
      p_record_ids: null,
    });
    expect(rpcErr).toBeTruthy();
  });
});
