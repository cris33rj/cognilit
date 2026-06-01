import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { EnqueueValidationError } from "@shared/jobs/types";
import { processImportJob } from "@shared/jobs/worker";

const ris = readFileSync("tests/fixtures/import/sample.ris", "utf8");
const malformed = readFileSync("tests/fixtures/import/malformed.ris", "utf8");

describe("import job — enqueue (§VIII / FR-016)", () => {
  let userClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`imp_${stamp}@example.com`, "senha-teste-123");
    userClient = u.client;
    const { data } = await userClient.rpc("create_review", {
      p_title: "Importação",
    });
    reviewId = data.id;
  });

  const search = {
    queryString: "active learning",
    database: "ERIC",
    searchedOn: "2026-05-30",
    hits: 2,
  };

  it("RIS válido ⇒ cria job + itens, mas NÃO cria records ainda (enqueue não processa)", async () => {
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search,
    });
    expect(res.status).toBe("queued");
    expect(res.item_count).toBe(2);

    const { count: itemCount } = await userClient
      .from("job_item")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(itemCount).toBe(2);

    const { count: recordCount } = await userClient
      .from("record")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(recordCount).toBe(0); // §VIII: worker ainda não rodou
  });

  it("arquivo malformado ⇒ EnqueueValidationError e zero persistência (FR-016)", async () => {
    await expect(
      enqueueImportJob({ supabase: userClient }, reviewId, {
        format: "ris",
        content: malformed,
        search,
      }),
    ).rejects.toBeInstanceOf(EnqueueValidationError);

    // Nada novo persistido por causa do malformado: continua só o search válido anterior.
    const { count: searchCount } = await serviceClient()
      .from("search")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(searchCount).toBe(1);
  });
});

describe("import job — worker (§VIII resiliência por-item)", () => {
  let userClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let jobId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`wrk_${stamp}@example.com`, "senha-teste-123");
    userClient = u.client;
    const { data: review } = await userClient.rpc("create_review", {
      p_title: "Worker",
    });
    reviewId = review.id;
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search: {
        queryString: "x",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 2,
      },
    });
    jobId = res.job_id;
  });

  it("processa todos os itens ⇒ records inseridos + job completed", async () => {
    const out = await processImportJob({ supabase: serviceClient() }, jobId);
    expect(out.status).toBe("completed");
    expect(out.done).toBe(2);
    expect(out.failed).toBe(0);

    const { count } = await userClient
      .from("record")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBe(2);

    const { data: rec } = await userClient
      .from("record")
      .select("doi_normalized, corpus_state")
      .eq("review_id", reviewId)
      .not("doi_normalized", "is", null)
      .limit(1)
      .maybeSingle();
    expect(rec!.doi_normalized).toBe("10.1000/abc"); // normalização aplicada
    expect(rec!.corpus_state).toBe("imported");
  });

  it("re-run idempotente ⇒ sem registros duplicados, job completed, progress 100", async () => {
    // Run the same job a second time. Items are already 'done', so no new records
    // should be created and the job must remain completed at 100%.
    const out2 = await processImportJob({ supabase: serviceClient() }, jobId);
    expect(out2.status).toBe("completed");
    expect(out2.done).toBe(2);
    expect(out2.failed).toBe(0);

    const { data: job } = await serviceClient()
      .from("job")
      .select("status, progress")
      .eq("id", jobId)
      .single();
    expect(job!.status).toBe("completed");
    expect(job!.progress).toBe(100);

    // Most important: still exactly 2 records — no duplicates.
    const { count: recordCount } = await userClient
      .from("record")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(recordCount).toBe(2);
  });

  it("falha forçada num item ⇒ completed_with_errors, demais done", async () => {
    const u = await signUpUser(
      `wrk2_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: review } = await u.client.rpc("create_review", {
      p_title: "Worker2",
    });
    const res = await enqueueImportJob({ supabase: u.client }, review.id, {
      format: "ris",
      content: ris,
      search: {
        queryString: "x",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 2,
      },
    });
    let n = 0;
    const out = await processImportJob(
      {
        supabase: serviceClient(),
        // injeta processamento que falha no 1º item (DI — D-F3.1)
        processItem: async (item, real) => {
          n += 1;
          if (n === 1) throw new Error("falha simulada");
          return real(item);
        },
      },
      res.job_id,
    );
    expect(out.status).toBe("completed_with_errors");
    expect(out.failed).toBe(1);
    expect(out.done).toBe(1);
  });
});
