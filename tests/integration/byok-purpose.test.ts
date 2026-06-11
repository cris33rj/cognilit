import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

async function newReview() {
  const { client } = await signUpUser(
    `byok_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review } = await client.rpc("create_review", {
    p_title: "BYOK purpose",
  });
  return { client, reviewId: review!.id as string };
}

describe("BYOK 2ª chave por purpose (FR-028)", () => {
  it("salva chave llm e embedding na mesma Revisão sem uma derrubar a outra", async () => {
    const { client, reviewId } = await newReview();
    await client.rpc("set_byok_key", {
      p_review_id: reviewId,
      p_provider: "anthropic",
      p_api_key: "sk-llm",
      p_purpose: "llm",
    });
    await client.rpc("set_byok_key", {
      p_review_id: reviewId,
      p_provider: "voyage",
      p_api_key: "pa-embed",
      p_purpose: "embedding",
    });

    const { data: rows } = await client
      .from("byok_key")
      .select("purpose, provider")
      .eq("review_id", reviewId);
    expect((rows ?? []).length).toBe(2);

    const svc = serviceClient();
    const { data: llm } = await svc.rpc("get_byok_secret", {
      p_review_id: reviewId,
      p_purpose: "llm",
    });
    const { data: emb } = await svc.rpc("get_byok_secret", {
      p_review_id: reviewId,
      p_purpose: "embedding",
    });
    expect(llm![0].api_key).toBe("sk-llm");
    expect(llm![0].provider).toBe("anthropic");
    expect(emb![0].api_key).toBe("pa-embed");
    expect(emb![0].provider).toBe("voyage");
  });

  it("get_byok_secret default resolve a chave llm", async () => {
    const { client, reviewId } = await newReview();
    await client.rpc("set_byok_key", {
      p_review_id: reviewId,
      p_provider: "anthropic",
      p_api_key: "sk-only",
      p_purpose: "llm",
    });
    const svc = serviceClient();
    const { data } = await svc.rpc("get_byok_secret", {
      p_review_id: reviewId,
    });
    expect(data![0].api_key).toBe("sk-only");
  });
});
