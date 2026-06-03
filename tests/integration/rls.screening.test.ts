import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

describe("RLS exclusion_reason (SC-009)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`er_owner_${s}@example.com`, "senha-teste-123"))
      .client;
    intruder = (await signUpUser(`er_intr_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Reasons RLS",
    });
    reviewId = review.id;
    await owner.rpc("seed_default_exclusion_reasons", {
      p_review_id: reviewId,
    });
  });

  it("owner enxerga os motivos semeados; intruso não-membro enxerga zero", async () => {
    const own = await owner
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    expect(own.data?.length ?? 0).toBe(7);
    const intr = await intruder
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    expect(intr.data?.length ?? 0).toBe(0);
  });

  it("seed é idempotente — re-chamar não duplica", async () => {
    const before = await owner
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    await owner.rpc("seed_default_exclusion_reasons", {
      p_review_id: reviewId,
    });
    const after = await owner
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    expect(after.data?.length).toBe(before.data?.length);
  });
});

describe("RLS screening_decision (SC-009)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`sd_owner_${s}@example.com`, "senha-teste-123"))
      .client;
    intruder = (await signUpUser(`sd_intr_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Screening RLS",
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
      .from("screening_decision")
      .insert({
        review_id: reviewId,
        record_id: rec!.id,
        stage: "title_abstract",
        decision: "include",
      })
      .select("id")
      .single();
    decisionId = dd!.id;
  });

  it("owner enxerga a decisão; intruso não-membro enxerga zero", async () => {
    const own = await owner
      .from("screening_decision")
      .select("id")
      .eq("id", decisionId);
    expect(own.data?.length).toBe(1);
    const intr = await intruder
      .from("screening_decision")
      .select("id")
      .eq("id", decisionId);
    expect(intr.data?.length ?? 0).toBe(0);
  });
});
