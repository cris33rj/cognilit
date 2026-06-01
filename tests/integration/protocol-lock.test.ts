import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";

describe("travamento de protocolo (US6 / SC-010)", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`pl_${stamp}@example.com`, "senha-teste-123");
    client = u.client;
    const { data: r } = await client.rpc("create_review", {
      p_title: "R Protocolo",
    });
    reviewId = r.id;
    await client.from("protocol").insert({
      review_id: reviewId,
      content: { contentMarkdown: "# rascunho" },
      origin: "human",
    });
  });

  it("lock_protocol trava e marca a Revisão", async () => {
    const { error } = await client.rpc("lock_protocol", {
      p_review_id: reviewId,
    });
    expect(error).toBeNull();
    const { data } = await client
      .from("protocol")
      .select("state, locked_at")
      .eq("review_id", reviewId)
      .single();
    expect(data!.state).toBe("locked");
    expect(data!.locked_at).not.toBeNull();
  });

  it("conteúdo travado é imutável (trigger barra UPDATE de content)", async () => {
    const { error } = await client
      .from("protocol")
      .update({ content: { contentMarkdown: "# tentativa de sobrescrever" } })
      .eq("review_id", reviewId);
    expect(error).not.toBeNull();
  });

  it("mudança pós-travamento vira emenda versionada e datada", async () => {
    const { error } = await client.rpc("add_protocol_amendment", {
      p_review_id: reviewId,
      p_change: { text: "ajuste de critério" },
    });
    expect(error).toBeNull();
    const { data } = await client
      .from("protocol_amendment")
      .select("version, dated_at, change")
      .eq("review_id", reviewId)
      .order("version", { ascending: true });
    expect(data!.length).toBe(1);
    expect(data![0].version).toBe(1);
    expect(data![0].dated_at).toBeTruthy();
  });

  it("trilha de auditoria registrou lock + emenda", async () => {
    const { data } = await client
      .from("audit_entry")
      .select("action")
      .eq("review_id", reviewId);
    const actions = (data ?? []).map((a) => a.action);
    expect(actions).toContain("lock_protocol");
    expect(actions).toContain("add_protocol_amendment");
  });
});
