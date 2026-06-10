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

describe("add_extraction_field — cria campo tipado, valida, audita", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const r = await newReview("Form add campo");
    client = r.client;
    reviewId = r.reviewId;
    await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
  });

  it("cria um campo number e grava audit_entry", async () => {
    const { data, error } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Tamanho da amostra",
      p_type: "number",
      p_options: null,
    });
    expect(error).toBeNull();
    expect(data.name).toBe("Tamanho da amostra");
    expect(data.type).toBe("number");
    expect(data.is_active).toBe(true);

    const svc = serviceClient();
    const { data: audit } = await svc
      .from("audit_entry")
      .select("action, entity, entity_id")
      .eq("review_id", reviewId)
      .eq("action", "add_extraction_field");
    expect(audit!.length).toBe(1);
    expect(audit![0].entity_id).toBe(data.id);
  });

  it("rejeita select sem options", async () => {
    const { error } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Desenho",
      p_type: "select",
      p_options: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/options/i);
  });

  it("rejeita name vazio", async () => {
    const { error } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "   ",
      p_type: "text",
      p_options: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/name/i);
  });

  it("aceita select com options e anexa ao fim (sort_order crescente)", async () => {
    const first = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Desenho do estudo",
      p_type: "select",
      p_options: ["RCT", "Coorte", "Caso-controle"],
    });
    expect(first.error).toBeNull();
    expect(first.data.sort_order).toBeGreaterThan(0);
    expect(first.data.options).toEqual(["RCT", "Coorte", "Caso-controle"]);
  });
});
