// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

const PROV = {
  model: "test-model",
  version: "1",
  prompt_or_span: "teste",
  timestamp: new Date().toISOString(),
};
const OUTPUT = { inclusion: [], exclusion: [], searchTerms: [] };

describe("regenerate_eligibility_criteria — supersede + dedupe + guarda de trava (Fatia 11)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`rederiv_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: r } = await owner.rpc("create_review", {
      p_title: "Rederiv",
    });
    reviewId = r.id;
    await owner.from("question").insert({
      review_id: reviewId,
      framework: "spider",
      question_text: "Pergunta de teste",
    });
  });

  function regenerate(items: { kind: string; text: string }[]) {
    return owner.rpc("regenerate_eligibility_criteria", {
      p_review_id: reviewId,
      p_output: OUTPUT,
      p_provenance: PROV,
      p_not_found: false,
      p_items: items,
    });
  }

  async function listCriteria() {
    const svc = serviceClient();
    const { data } = await svc
      .from("eligibility_criterion")
      .select("kind, text, origin, ratification_state")
      .eq("review_id", reviewId)
      .order("created_at", { ascending: true });
    return data ?? [];
  }

  it("primeira derivação insere o lote (count = nº de itens)", async () => {
    const { data, error } = await regenerate([
      { kind: "inclusion", text: "Adultos" },
      { kind: "exclusion", text: "Crianças" },
      { kind: "search_term", text: "ansiedade" },
    ]);
    expect(error).toBeNull();
    expect(data).toBe(3);
    expect((await listCriteria()).length).toBe(3);
  });

  it("re-derivar substitui os pendentes — NÃO dobra (converge)", async () => {
    const { data, error } = await regenerate([
      { kind: "inclusion", text: "Adultos" },
      { kind: "exclusion", text: "Crianças" },
    ]);
    expect(error).toBeNull();
    expect(data).toBe(2);
    expect((await listCriteria()).length).toBe(2);
  });

  it("preserva ratificados e não re-propõe o que já foi decidido (dedupe)", async () => {
    const svc = serviceClient();
    await svc
      .from("eligibility_criterion")
      .update({ ratification_state: "accepted" })
      .eq("review_id", reviewId)
      .eq("text", "Adultos");

    const { data, error } = await regenerate([
      { kind: "inclusion", text: "Adultos" },
      { kind: "inclusion", text: "Idosos" },
    ]);
    expect(error).toBeNull();
    expect(data).toBe(1);

    const rows = await listCriteria();
    expect(rows.map((r) => r.text).sort()).toEqual(["Adultos", "Idosos"]);
    expect(rows.find((r) => r.text === "Adultos")!.ratification_state).toBe(
      "accepted",
    );
  });

  it("recusa quando o protocolo está travado (FR-010/011)", async () => {
    const svc = serviceClient();
    await svc.from("protocol").insert({ review_id: reviewId, state: "locked" });

    const { error } = await regenerate([{ kind: "inclusion", text: "X" }]);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/locked/);
  });

  it("RLS: não-membro não consegue regenerar", async () => {
    const s = Date.now();
    const intruder = (
      await signUpUser(`rederiv_i_${s}@example.com`, "senha-teste-123")
    ).client;
    const { error } = await intruder.rpc("regenerate_eligibility_criteria", {
      p_review_id: reviewId,
      p_output: OUTPUT,
      p_provenance: PROV,
      p_not_found: false,
      p_items: [{ kind: "inclusion", text: "Y" }],
    });
    expect(error).not.toBeNull();
  });
});
