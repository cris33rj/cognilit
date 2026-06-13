import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { toFlowModel } from "@/lib/prisma/flow-model";
import type { PrismaCounters, ExclusionCount } from "@/lib/prisma/queries";

describe("fluxograma PRISMA = espelho das views (SC-002/§VI)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    owner = (
      await signUpUser(
        `pf_o_${crypto.randomUUID()}@example.com`,
        "senha-teste-123",
      )
    ).client;
    intruder = (
      await signUpUser(
        `pf_i_${crypto.randomUUID()}@example.com`,
        "senha-teste-123",
      )
    ).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "PRISMA flow",
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
    const { error } = await svc
      .from("record")
      .insert([
        mk("active"),
        mk("duplicate_exact"),
        mk("included_ts", { ts_decision: "included" }),
        mk("excluded_ts", { ts_decision: "excluded" }),
        mk("included_ft", { ts_decision: "included", ft_decision: "included" }),
        mk("excluded_ft", { ts_decision: "included", ft_decision: "excluded" }),
      ]);
    if (error) throw new Error(error.message);
  });

  it("toFlowModel reproduz exatamente os campos da view", async () => {
    const { data: c } = await owner
      .from("prisma_counter")
      .select("*")
      .eq("review_id", reviewId)
      .single();
    const { data: bk } = await owner
      .from("prisma_exclusion_breakdown")
      .select("reason_id, reason_label, n")
      .eq("review_id", reviewId);

    const counters: PrismaCounters = {
      identified: c!.identified,
      duplicates: c!.duplicates,
      screened: c!.screened,
      includedTs: c!.included_ts,
      excludedTs: c!.excluded_ts,
      maybeTs: c!.maybe_ts,
      passedTs: c!.passed_ts,
      includedFt: c!.included_ft,
      excludedFt: c!.excluded_ft,
    };
    const breakdown: ExclusionCount[] = (bk ?? []).map((r) => ({
      reasonId: r.reason_id ?? "",
      reasonLabel: r.reason_label ?? "",
      n: r.n ?? 0,
    }));
    const m = toFlowModel(counters, breakdown);

    expect(m.identified).toBe(c!.identified);
    expect(m.duplicatesRemoved).toBe(c!.duplicates);
    expect(m.screened).toBe(c!.identified - c!.duplicates);
    expect(m.excludedScreening).toBe(c!.excluded_ts);
    expect(m.assessedFullText).toBe(c!.passed_ts);
    expect(m.included).toBe(c!.included_ft);
  });

  it("RLS: intruso não-membro vê linha vazia → modelo zerado", async () => {
    const { data } = await intruder
      .from("prisma_counter")
      .select("identified")
      .eq("review_id", reviewId);
    expect((data ?? []).length).toBe(0);
  });
});
