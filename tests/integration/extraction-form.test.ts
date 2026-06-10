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
    expect(audit![0]!.entity_id).toBe(data.id);
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

describe("update_extraction_field — edita campo, audita antes/depois", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let fieldId: string;

  beforeAll(async () => {
    const r = await newReview("Form edit campo");
    client = r.client;
    reviewId = r.reviewId;
    await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
    const { data } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Ano",
      p_type: "text",
      p_options: null,
    });
    fieldId = data.id;
  });

  it("atualiza nome/tipo e grava before/after", async () => {
    const { data, error } = await client.rpc("update_extraction_field", {
      p_field_id: fieldId,
      p_name: "Ano de publicação",
      p_type: "number",
      p_options: null,
    });
    expect(error).toBeNull();
    expect(data.name).toBe("Ano de publicação");
    expect(data.type).toBe("number");

    const svc = serviceClient();
    const { data: audit } = await svc
      .from("audit_entry")
      .select("before, after")
      .eq("review_id", reviewId)
      .eq("action", "update_extraction_field")
      .single();
    expect((audit!.before as { name: string }).name).toBe("Ano");
    expect((audit!.after as { name: string }).name).toBe("Ano de publicação");
  });

  it("rejeita virar select sem options", async () => {
    const { error } = await client.rpc("update_extraction_field", {
      p_field_id: fieldId,
      p_name: "Ano de publicação",
      p_type: "select",
      p_options: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/options/i);
  });
});

describe("remove_extraction_field — soft-delete (não apaga linha), audita", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let fieldId: string;

  beforeAll(async () => {
    const r = await newReview("Form remove campo");
    client = r.client;
    reviewId = r.reviewId;
    await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
    const { data } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Campo temporário",
      p_type: "text",
      p_options: null,
    });
    fieldId = data.id;
  });

  it("marca is_active=false mantendo a linha (não apaga silenciosamente) e audita", async () => {
    const { data, error } = await client.rpc("remove_extraction_field", {
      p_field_id: fieldId,
    });
    expect(error).toBeNull();
    expect(data.is_active).toBe(false);

    const svc = serviceClient();
    const { data: row } = await svc
      .from("extraction_field")
      .select("id, is_active")
      .eq("id", fieldId)
      .single();
    expect(row).not.toBeNull(); // linha preservada
    expect(row!.is_active).toBe(false);

    const { data: audit } = await svc
      .from("audit_entry")
      .select("before, after")
      .eq("review_id", reviewId)
      .eq("action", "remove_extraction_field")
      .single();
    expect((audit!.before as { is_active: boolean }).is_active).toBe(true);
    expect((audit!.after as { is_active: boolean }).is_active).toBe(false);
  });
});

describe("reorder_extraction_fields — reescreve sort_order pela ordem do array", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let aId: string;
  let bId: string;

  beforeAll(async () => {
    const r = await newReview("Form reorder");
    client = r.client;
    reviewId = r.reviewId;
    await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
    aId = (
      await client.rpc("add_extraction_field", {
        p_review_id: reviewId,
        p_name: "Primeiro",
        p_type: "text",
        p_options: null,
      })
    ).data.id;
    bId = (
      await client.rpc("add_extraction_field", {
        p_review_id: reviewId,
        p_name: "Segundo",
        p_type: "text",
        p_options: null,
      })
    ).data.id;
  });

  it("inverte a ordem e audita", async () => {
    const { error } = await client.rpc("reorder_extraction_fields", {
      p_review_id: reviewId,
      p_field_ids: [bId, aId],
    });
    expect(error).toBeNull();

    const svc = serviceClient();
    const { data: rows } = await svc
      .from("extraction_field")
      .select("id, sort_order")
      .eq("review_id", reviewId)
      .order("sort_order", { ascending: true });
    expect(rows!.map((r) => r.id)).toEqual([bId, aId]);

    const { data: audit } = await svc
      .from("audit_entry")
      .select("action")
      .eq("review_id", reviewId)
      .eq("action", "reorder_extraction_fields");
    expect(audit!.length).toBe(1);
  });
});
