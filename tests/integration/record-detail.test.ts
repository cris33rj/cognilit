import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";
import {
  RECORD_DETAIL_SELECT,
  toRecordDetail,
  type RawRecordRow,
} from "@/lib/record/queries";

const ris = readFileSync("tests/fixtures/import/detail-rich.ris", "utf8");

describe("getRecordDetail — extração de periódico/palavras-chave do raw", () => {
  let userClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const u = await signUpUser(
      `detail_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    userClient = u.client;
    const { data: review } = await userClient.rpc("create_review", {
      p_title: "Detalhe",
    });
    reviewId = review.id;
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search: {
        queryString: "wearables",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 1,
      },
    });
    await processImportJob({ supabase: serviceClient() }, res.job_id);
  });

  it("o registro importado expõe periódico e palavras-chave do raw", async () => {
    const { data, error } = await serviceClient()
      .from("record")
      .select(RECORD_DETAIL_SELECT)
      .eq("review_id", reviewId)
      .limit(1)
      .single();
    if (error) throw new Error(error.message);
    const detail = toRecordDetail(data as unknown as RawRecordRow);
    expect(detail.journal).toBe("Journal of Wearable Tech");
    expect(detail.keywords).toContain("edge AI");
    expect(detail.authors.length).toBeGreaterThan(0);
    expect(detail.abstract).toBeTruthy();
    expect(detail.pages).toBe("45–60");
  });

  it("isolamento por review (RLS): outro usuário não lê o registro", async () => {
    const other = await signUpUser(
      `detail_other_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data } = await other.client
      .from("record")
      .select("id")
      .eq("review_id", reviewId);
    expect(data ?? []).toHaveLength(0);
  });
});
