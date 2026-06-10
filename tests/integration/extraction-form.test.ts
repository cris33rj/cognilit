import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

async function newReview(title: string) {
  const { client } = await signUpUser(
    `xf_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await client.rpc("create_review", {
    p_title: title,
  });
  if (error) throw new Error(error.message);
  return { client, reviewId: review.id as string };
}

describe("ensure_extraction_form — 1:1 com review, idempotente", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const r = await newReview("Form de extração");
    client = r.client;
    reviewId = r.reviewId;
  });

  it("cria o formulário na 1ª chamada e devolve o mesmo na 2ª (sem duplicar)", async () => {
    const a = await client.rpc("ensure_extraction_form", {
      p_review_id: reviewId,
    });
    expect(a.error).toBeNull();
    const b = await client.rpc("ensure_extraction_form", {
      p_review_id: reviewId,
    });
    expect(b.error).toBeNull();
    expect(b.data.id).toBe(a.data.id);

    const svc = serviceClient();
    const { data: forms } = await svc
      .from("extraction_form")
      .select("id")
      .eq("review_id", reviewId);
    expect(forms!.length).toBe(1);
  });
});
