import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

describe("RLS exclusion_reason + seed (US4/FR-025)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`scr_owner_${s}@example.com`, "senha-teste-123"))
      .client;
    intruder = (
      await signUpUser(`scr_intr_${s}@example.com`, "senha-teste-123")
    ).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Screening RLS",
    });
    reviewId = review.id;
    // Seed default reasons for this review
    await serviceClient().rpc("seed_default_exclusion_reasons", {
      p_review_id: reviewId,
    });
  });

  it("owner enxerga ≥1 motivo; intruso não-membro enxerga 0", async () => {
    const own = await owner
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    expect(own.data?.length ?? 0).toBeGreaterThanOrEqual(1);

    const intr = await intruder
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    expect(intr.data?.length ?? 0).toBe(0);
  });

  it("seed é idempotente — segunda chamada não duplica razões", async () => {
    await serviceClient().rpc("seed_default_exclusion_reasons", {
      p_review_id: reviewId,
    });
    const own = await owner
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    const countAfter = own.data?.length ?? 0;

    await serviceClient().rpc("seed_default_exclusion_reasons", {
      p_review_id: reviewId,
    });
    const own2 = await owner
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    const countAfter2 = own2.data?.length ?? 0;

    expect(countAfter2).toBe(countAfter);
  });
});
