import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

describe("RLS dedup_decision (SC-009)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`dd_owner_${s}@example.com`, "senha-teste-123"))
      .client;
    intruder = (await signUpUser(`dd_intr_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Dedup RLS",
    });
    reviewId = review.id;
    const svc = serviceClient();
    const { data: rec } = await svc
      .from("record")
      .insert({
        review_id: reviewId,
        source_format: "ris",
        raw: {},
        metadata: { title: "x", year: "2020" },
        title_norm: "x",
        corpus_state: "active",
      })
      .select("id")
      .single();
    const { data: dd } = await svc
      .from("dedup_decision")
      .insert({
        review_id: reviewId,
        kind: "exact_auto",
        record_a_id: rec!.id,
        record_b_id: rec!.id,
        outcome: "removed",
        actor: "system",
      })
      .select("id")
      .single();
    decisionId = dd!.id;
  });

  it("owner enxerga a decisão; intruso não-membro enxerga zero", async () => {
    const own = await owner
      .from("dedup_decision")
      .select("id")
      .eq("id", decisionId);
    expect(own.data?.length).toBe(1);
    const intr = await intruder
      .from("dedup_decision")
      .select("id")
      .eq("id", decisionId);
    expect(intr.data?.length ?? 0).toBe(0);
  });
});
