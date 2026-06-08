import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";
import {
  SEARCH_SUMMARY_SELECT,
  toSearchSummaries,
  type SearchSummary,
} from "@/lib/search/queries";

const ris = readFileSync("tests/fixtures/import/sample.ris", "utf8");

async function summaries(reviewId: string): Promise<SearchSummary[]> {
  const { data, error } = await serviceClient()
    .from("search")
    .select(SEARCH_SUMMARY_SELECT)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return toSearchSummaries((data ?? []) as unknown as Parameters<typeof toSearchSummaries>[0]);
}

describe("histórico de importações — embedding record(count)", () => {
  let userClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`hist_${stamp}@example.com`, "senha-teste-123");
    userClient = u.client;
    const { data: review } = await userClient.rpc("create_review", {
      p_title: "Histórico",
    });
    reviewId = review.id;
  });

  it("uma importação ⇒ uma linha com a contagem de records (= 2)", async () => {
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search: {
        queryString: "active learning",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 2,
      },
    });
    await processImportJob({ supabase: serviceClient() }, res.job_id);

    const out = await summaries(reviewId);
    expect(out).toHaveLength(1);
    expect(out[0].database).toBe("ERIC");
    expect(out[0].recordCount).toBe(2);
  });

  it("uma segunda importação ⇒ duas linhas, mais recente primeiro", async () => {
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search: {
        queryString: "flipped classroom",
        database: "PubMed",
        searchedOn: "2026-06-01",
        hits: 2,
      },
    });
    await processImportJob({ supabase: serviceClient() }, res.job_id);

    const out = await summaries(reviewId);
    expect(out).toHaveLength(2);
    expect(out[0].database).toBe("PubMed"); // ordenado por created_at desc
    expect(out.every((s) => s.recordCount === 2)).toBe(true);
  });
});
