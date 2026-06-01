import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { EnqueueValidationError } from "@shared/jobs/types";

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
