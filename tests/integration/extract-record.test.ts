import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { runExtractionForRecord } from "@/lib/extraction/extract";

async function setup() {
  const { client } = await signUpUser(
    `er_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review } = await client.rpc("create_review", {
    p_title: "Extração record",
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
      metadata: { title: "Estudo" },
    })
    .select("id")
    .single();
  const recordId = rec!.id as string;
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
    char_end: 30,
    content: "Amostra de 42 participantes.",
    origin: "nativo",
  });
  await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
  await client.rpc("add_extraction_field", {
    p_review_id: reviewId,
    p_name: "Amostra",
    p_type: "number",
    p_options: null,
  });
  await client.rpc("add_extraction_field", {
    p_review_id: reviewId,
    p_name: "Campo Ausente",
    p_type: "text",
    p_options: null,
  });
  return { client, reviewId, recordId, svc };
}

describe("runExtractionForRecord (US3)", () => {
  it("cria ai_suggestion + extraction_value por campo, com grounding resolvido", async () => {
    const { reviewId, recordId, svc } = await setup();
    const res = await runExtractionForRecord(
      { supabase: svc, provider: new MockLLMProvider() },
      reviewId,
      recordId,
    );
    expect(res.created).toBe(2);

    const { data: vals } = await svc
      .from("extraction_value")
      .select("id, state, ai_suggestion_id, field_id")
      .eq("record_id", recordId);
    expect(vals!.length).toBe(2);
    expect(vals!.every((v) => v.ai_suggestion_id !== null)).toBe(true);

    const { data: sugg } = await svc
      .from("ai_suggestion")
      .select("grounding, not_found, target_kind")
      .eq("review_id", reviewId)
      .eq("target_kind", "extraction");
    expect(sugg!.length).toBe(2);
    const anchored = sugg!.find((s) => s.not_found === false)!;
    expect((anchored.grounding as { origin: string }).origin).toBe("nativo");
    expect(
      (anchored.grounding as { text_layer_id: string | null }).text_layer_id,
    ).not.toBeNull();
  });

  it("re-extração: nova sugestão pending, final_value validado intacto (FR-019a)", async () => {
    const { client, reviewId, recordId, svc } = await setup();
    await runExtractionForRecord(
      { supabase: svc, provider: new MockLLMProvider() },
      reviewId,
      recordId,
    );
    const { data: first } = await svc
      .from("extraction_value")
      .select("id")
      .eq("record_id", recordId)
      .limit(1)
      .single();
    await client.rpc("ratify_extraction_value", {
      p_value_id: first!.id,
      p_state: "accepted",
      p_final_value: { value: 42 },
    });

    await runExtractionForRecord(
      { supabase: svc, provider: new MockLLMProvider() },
      reviewId,
      recordId,
    );

    const { data: validated } = await svc
      .from("extraction_value")
      .select("final_value, state")
      .eq("id", first!.id)
      .single();
    expect(validated!.state).toBe("accepted");
    expect(validated!.final_value).toEqual({ value: 42 }); // intacto
    const { data: pendings } = await svc
      .from("extraction_value")
      .select("id")
      .eq("record_id", recordId)
      .eq("state", "pending");
    expect(pendings!.length).toBeGreaterThan(0); // nova sugestão pending viva
  });
});
