import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";

const ris = readFileSync("tests/fixtures/import/sample.ris", "utf8");

describe("RLS — record/search/job isolados por Revisão (SC-009)", () => {
  let aClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let bClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewIdA: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const a = await signUpUser(`rls_a_${stamp}@example.com`, "senha-teste-123");
    const b = await signUpUser(`rls_b_${stamp}@example.com`, "senha-teste-123");
    aClient = a.client;
    bClient = b.client;
    const { data } = await aClient.rpc("create_review", { p_title: "A" });
    reviewIdA = data.id;
    const res = await enqueueImportJob({ supabase: aClient }, reviewIdA, {
      format: "ris",
      content: ris,
      search: {
        queryString: "x",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 2,
      },
    });
    await processImportJob({ supabase: serviceClient() }, res.job_id);
  });

  it("A enxerga seus records", async () => {
    const { data } = await aClient
      .from("record")
      .select("id")
      .eq("review_id", reviewIdA);
    expect((data ?? []).length).toBe(2);
  });

  it("B NÃO enxerga record/search/job/job_item de A (0 vazamentos)", async () => {
    for (const table of ["record", "search", "job", "job_item"] as const) {
      const { data } = await bClient
        .from(table)
        .select("id")
        .eq("review_id", reviewIdA);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("B NÃO consegue chamar create_import_job na Revisão de A", async () => {
    const { error } = await bClient.rpc("create_import_job", {
      p_review_id: reviewIdA,
      p_format: "ris",
      p_search: {
        queryString: "x",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 1,
      },
      p_items: [
        {
          title: "intruso",
          authors: [],
          year: null,
          doi: null,
          abstract: null,
          language: null,
          raw: {},
        },
      ],
    });
    expect(error).not.toBeNull(); // 'not a member'
  });
});
