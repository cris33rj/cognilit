import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";

describe("RLS extraction_form/field — isolamento por Revisão (SC-011)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`xrls_owner_${s}@example.com`, "senha-teste-123"))
      .client;
    intruder = (
      await signUpUser(`xrls_intr_${s}@example.com`, "senha-teste-123")
    ).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Revisão privada",
    });
    reviewId = review.id;
    await owner.rpc("ensure_extraction_form", { p_review_id: reviewId });
    await owner.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Privado",
      p_type: "text",
      p_options: null,
    });
  });

  it("não-membro não enxerga o formulário nem os campos", async () => {
    const form = await intruder
      .from("extraction_form")
      .select("id")
      .eq("review_id", reviewId);
    expect(form.data).toEqual([]);
    const fields = await intruder
      .from("extraction_field")
      .select("id")
      .eq("review_id", reviewId);
    expect(fields.data).toEqual([]);
  });

  it("RPC de não-membro levanta 'not a member'", async () => {
    const { error } = await intruder.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Intruso",
      p_type: "text",
      p_options: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not a member/i);
  });
});
