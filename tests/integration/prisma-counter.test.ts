import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

describe("prisma_counter — fonte única (SC-004 / FR-036)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    owner = (
      await signUpUser(
        `pc_owner_${crypto.randomUUID()}@example.com`,
        "senha-teste-123",
      )
    ).client;
    intruder = (
      await signUpUser(
        `pc_intr_${crypto.randomUUID()}@example.com`,
        "senha-teste-123",
      )
    ).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "PRISMA counters",
    });
    reviewId = review.id;

    const svc = serviceClient();
    const mk = (state: string, extra: Record<string, unknown> = {}) => ({
      review_id: reviewId,
      source_format: "ris",
      raw: { TI: `r-${state}-${Math.random()}` },
      metadata: { title: `r-${state}` },
      corpus_state: state,
      ...extra,
    });
    const rows = [
      mk("active"),
      mk("duplicate_exact"),
      mk("duplicate_fuzzy"),
      mk("included_ts", { ts_decision: "included" }),
      mk("excluded_ts", { ts_decision: "excluded" }),
      mk("maybe_ts", { ts_decision: "maybe" }),
      mk("included_ft", { ts_decision: "included", ft_decision: "included" }),
      mk("excluded_ft", { ts_decision: "included", ft_decision: "excluded" }),
    ];
    const { error } = await svc.from("record").insert(rows);
    if (error) throw new Error(error.message);
  });

  it("a view bate número-a-número com o corpus", async () => {
    const { data, error } = await owner
      .from("prisma_counter")
      .select("*")
      .eq("review_id", reviewId)
      .single();
    expect(error).toBeNull();
    expect(data!.identified).toBe(8);
    expect(data!.duplicates).toBe(2);
    // screened = ts_decision IN ('included','excluded') — 'maybe' is still pending, not counted.
    // Rows: included_ts(inc), excluded_ts(exc), included_ft(inc), excluded_ft(inc) = 4.
    expect(data!.screened).toBe(4);
    expect(data!.included_ts).toBe(1);
    expect(data!.excluded_ts).toBe(1);
    expect(data!.maybe_ts).toBe(1);
    expect(data!.included_ft).toBe(1);
    expect(data!.excluded_ft).toBe(1);
  });

  it("RLS: intruso não-membro enxerga zero/linha vazia na view", async () => {
    const { data } = await intruder
      .from("prisma_counter")
      .select("identified")
      .eq("review_id", reviewId);
    expect((data ?? []).length).toBe(0);
  });
});
