import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";

describe("RLS — isolamento de Revisões (SC-009)", () => {
  let aClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let bClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewIdA: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const a = await signUpUser(`a_${stamp}@example.com`, "senha-teste-123");
    const b = await signUpUser(`b_${stamp}@example.com`, "senha-teste-123");
    aClient = a.client;
    bClient = b.client;

    const { data, error } = await aClient.rpc("create_review", {
      p_title: "Revisão do A",
    });
    if (error) throw error;
    reviewIdA = data.id;
  });

  it("A enxerga a própria Revisão", async () => {
    const { data } = await aClient
      .from("review")
      .select("id, title")
      .eq("id", reviewIdA);
    expect(data?.length).toBe(1);
  });

  it("B NÃO enxerga a Revisão de A (0 vazamentos)", async () => {
    const { data } = await bClient
      .from("review")
      .select("id, title")
      .eq("id", reviewIdA);
    expect(data ?? []).toHaveLength(0);
  });

  it("B NÃO enxerga o membership de A", async () => {
    const { data } = await bClient
      .from("member")
      .select("id")
      .eq("review_id", reviewIdA);
    expect(data ?? []).toHaveLength(0);
  });

  it("B NÃO consegue inserir audit_entry na Revisão de A", async () => {
    const { error } = await bClient.from("audit_entry").insert({
      review_id: reviewIdA,
      actor_type: "human",
      action: "tamper",
      entity: "review",
      entity_id: reviewIdA,
    });
    expect(error).not.toBeNull();
  });

  it("audit_entry registrou a criação da Revisão de A", async () => {
    const { data } = await aClient
      .from("audit_entry")
      .select("action, entity")
      .eq("review_id", reviewIdA);
    expect(
      (data ?? []).some(
        (e) => e.action === "create_review" && e.entity === "review",
      ),
    ).toBe(true);
  });
});
