import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

async function newReviewWithStudy(title: string) {
  const { client } = await signUpUser(
    `xv_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await client.rpc("create_review", {
    p_title: title,
  });
  if (error) throw new Error(error.message);
  const reviewId = review.id as string;
  const svc = serviceClient();
  const { data: rec, error: rErr } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      corpus_state: "included_ft",
      source_format: "ris",
      raw: { title: "Estudo X" },
      metadata: { title: "Estudo X" },
    })
    .select("id")
    .single();
  if (rErr) throw new Error(rErr.message);
  await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
  const { data: field } = await client.rpc("add_extraction_field", {
    p_review_id: reviewId,
    p_name: "Amostra",
    p_type: "number",
    p_options: null,
  });
  return {
    client,
    reviewId,
    recordId: rec!.id as string,
    fieldId: field!.id as string,
  };
}

describe("extraction_value — schema + RLS", () => {
  let ctx: Awaited<ReturnType<typeof newReviewWithStudy>>;
  beforeAll(async () => {
    ctx = await newReviewWithStudy("Valor de extração");
  });

  it("membro lê extraction_value escrito por service-role", async () => {
    const svc = serviceClient();
    const { error: insErr } = await svc.from("extraction_value").insert({
      review_id: ctx.reviewId,
      record_id: ctx.recordId,
      field_id: ctx.fieldId,
      state: "pending",
    });
    expect(insErr).toBeNull();
    const { data, error } = await ctx.client
      .from("extraction_value")
      .select("id, state")
      .eq("review_id", ctx.reviewId);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0]!.state).toBe("pending");
  });

  it("CHECK: state accepted exige final_value não-nulo", async () => {
    const svc = serviceClient();
    const { error } = await svc.from("extraction_value").insert({
      review_id: ctx.reviewId,
      record_id: ctx.recordId,
      field_id: ctx.fieldId,
      state: "accepted",
    });
    expect(error).not.toBeNull(); // viola o CHECK
  });

  it("CHECK: state edited exige final_value não-nulo", async () => {
    const svc = serviceClient();
    const { error } = await svc.from("extraction_value").insert({
      review_id: ctx.reviewId,
      record_id: ctx.recordId,
      field_id: ctx.fieldId,
      state: "edited",
    });
    expect(error).not.toBeNull();
  });

  it("membro não escreve direto (RLS só concede select)", async () => {
    const { error } = await ctx.client.from("extraction_value").insert({
      review_id: ctx.reviewId,
      record_id: ctx.recordId,
      field_id: ctx.fieldId,
      state: "pending",
    });
    expect(error).not.toBeNull();
  });

  it("aceita target_kind='extraction' em ai_suggestion", async () => {
    const svc = serviceClient();
    const { error } = await svc.from("ai_suggestion").insert({
      review_id: ctx.reviewId,
      target_kind: "extraction",
      target_id: ctx.recordId,
      output: { value: 42, source_span: "n=42", page: 3 },
      provenance: {
        model: "m",
        version: "v",
        prompt_or_span: "p",
        timestamp: new Date().toISOString(),
      },
      state: "pending",
      grounding: {
        text_layer_id: null,
        page: 3,
        source_span: "n=42",
        origin: "nativo",
      },
      not_found: false,
    });
    expect(error).toBeNull();
  });
});

describe("ratify_extraction_value — humano-no-laço, auditado", () => {
  let ctx: Awaited<ReturnType<typeof newReviewWithStudy>>;
  let valueId: string;
  beforeAll(async () => {
    ctx = await newReviewWithStudy("Ratificação");
    const svc = serviceClient();
    const { data } = await svc
      .from("extraction_value")
      .insert({
        review_id: ctx.reviewId,
        record_id: ctx.recordId,
        field_id: ctx.fieldId,
        state: "pending",
      })
      .select("id")
      .single();
    valueId = data!.id as string;
  });

  it("aceitar grava final_value, state=accepted e audit_entry", async () => {
    const { error } = await ctx.client.rpc("ratify_extraction_value", {
      p_value_id: valueId,
      p_state: "accepted",
      p_final_value: { value: 42 },
    });
    expect(error).toBeNull();
    const svc = serviceClient();
    const { data: row } = await svc
      .from("extraction_value")
      .select("state, final_value")
      .eq("id", valueId)
      .single();
    expect(row!.state).toBe("accepted");
    expect(row!.final_value).toEqual({ value: 42 });
    const { data: audit } = await svc
      .from("audit_entry")
      .select("action")
      .eq("entity_id", valueId)
      .eq("action", "ratify_extraction_value");
    expect(audit!.length).toBeGreaterThan(0);
  });

  it("rejeitar não exige final_value", async () => {
    const svc = serviceClient();
    const { data } = await svc
      .from("extraction_value")
      .insert({
        review_id: ctx.reviewId,
        record_id: ctx.recordId,
        field_id: ctx.fieldId,
        state: "pending",
      })
      .select("id")
      .single();
    const { error } = await ctx.client.rpc("ratify_extraction_value", {
      p_value_id: data!.id,
      p_state: "rejected",
      p_final_value: null,
    });
    expect(error).toBeNull();
  });

  it("não-membro não ratifica", async () => {
    const { client: other } = await signUpUser(
      `other_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { error } = await other.rpc("ratify_extraction_value", {
      p_value_id: valueId,
      p_state: "accepted",
      p_final_value: { value: 1 },
    });
    expect(error).not.toBeNull();
  });
});
