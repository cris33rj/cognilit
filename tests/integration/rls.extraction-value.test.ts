import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

describe("RLS — extraction_value escopado por Revisão (SC-011)", () => {
  it("não-membro não lê extraction_value de outra Revisão e não ratifica", async () => {
    const { client: a } = await signUpUser(
      `rva_${Date.now()}@example.com`,
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
    await a.rpc("ensure_extraction_form", { p_review_id: reviewId });
    const { data: field } = await a.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Amostra",
      p_type: "number",
      p_options: null,
    });
    const { data: val } = await svc
      .from("extraction_value")
      .insert({
        review_id: reviewId,
        record_id: rec!.id,
        field_id: field!.id,
        state: "pending",
      })
      .select("id")
      .single();

    const { client: b } = await signUpUser(
      `rvb_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: leaked } = await b
      .from("extraction_value")
      .select("id")
      .eq("review_id", reviewId);
    expect(leaked!.length).toBe(0); // RLS bloqueia leitura

    const { error: ratErr } = await b.rpc("ratify_extraction_value", {
      p_value_id: val!.id,
      p_state: "accepted",
      p_final_value: { value: 1 },
    });
    expect(ratErr).not.toBeNull(); // não-membro não ratifica
  });
});
