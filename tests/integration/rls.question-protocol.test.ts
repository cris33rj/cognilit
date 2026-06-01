import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";

describe("RLS — question/protocol/criteria/byok isolados por Revisão (SC-009)", () => {
  let aClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let bClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewIdA: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const a = await signUpUser(`qa_${stamp}@example.com`, "senha-teste-123");
    const b = await signUpUser(`qb_${stamp}@example.com`, "senha-teste-123");
    aClient = a.client;
    bClient = b.client;
    const { data } = await aClient.rpc("create_review", { p_title: "R de A" });
    reviewIdA = data.id;
    await aClient.from("question").insert({
      review_id: reviewIdA,
      framework: "spider",
      question_text: "Pergunta de A",
    });
  });

  it("A enxerga a própria question", async () => {
    const { data } = await aClient
      .from("question")
      .select("id")
      .eq("review_id", reviewIdA);
    expect(data?.length).toBe(1);
  });

  it("B NÃO enxerga a question de A", async () => {
    const { data } = await bClient
      .from("question")
      .select("id")
      .eq("review_id", reviewIdA);
    expect(data ?? []).toHaveLength(0);
  });

  it("B NÃO consegue inserir protocol na Revisão de A", async () => {
    const { error } = await bClient.from("protocol").insert({
      review_id: reviewIdA,
      content: { contentMarkdown: "tamper" },
      origin: "human",
    });
    expect(error).not.toBeNull();
  });

  it("B NÃO consegue travar o protocolo de A (RPC checa membership)", async () => {
    const { error } = await bClient.rpc("lock_protocol", {
      p_review_id: reviewIdA,
    });
    expect(error).not.toBeNull();
  });
});
