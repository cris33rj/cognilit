import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueExtractionJob } from "@/lib/extraction/enqueue";

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
