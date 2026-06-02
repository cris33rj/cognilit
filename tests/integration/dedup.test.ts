import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

// Insere um record diretamente (service role) já no estado dado.
async function seedRecord(
  reviewId: string,
  opts: { title: string; year: string; doi?: string; createdAt?: string },
) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: opts.title, year: opts.year, doi: opts.doi ?? null },
      doi_normalized: opts.doi ?? null,
      title_norm: opts.title.toLowerCase().trim(),
      corpus_state: "imported",
      ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id;
}

// Insere já como 'active' (para testes de fila fuzzy, Tasks 4/5).
async function seedRecordActive(reviewId: string, title: string, year: string) {
  const svc = serviceClient();
  const { error } = await svc.from("record").insert({
    review_id: reviewId,
    source_format: "ris",
    raw: {},
    metadata: { title, year },
    title_norm: title,
    corpus_state: "active",
  });
  if (error) throw new Error(error.message);
}

describe("dedup_exact (FR-018/019)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let keepId: string;
  let dupId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`dx_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Exatas",
    });
    reviewId = review.id;
    keepId = await seedRecord(reviewId, {
      title: "Active learning",
      year: "2020",
      doi: "10.1/abc",
      createdAt: "2020-01-01T00:00:00Z",
    });
    dupId = await seedRecord(reviewId, {
      title: "Active learning (dup)",
      year: "2020",
      doi: "10.1/abc",
      createdAt: "2020-02-01T00:00:00Z",
    });
    await seedRecord(reviewId, {
      title: "Outro estudo",
      year: "2019",
      doi: "10.2/zzz",
    });
  });

  it("remove a exata mais nova, mantém a mais antiga ativa, registra decisão reversível + auditoria", async () => {
    const { data: removed, error } = await owner.rpc("dedup_exact", {
      p_review_id: reviewId,
    });
    expect(error).toBeNull();
    expect(removed).toBe(1);

    const svc = serviceClient();
    const { data: keep } = await svc
      .from("record")
      .select("corpus_state")
      .eq("id", keepId)
      .single();
    const { data: dup } = await svc
      .from("record")
      .select("corpus_state")
      .eq("id", dupId)
      .single();
    expect(keep!.corpus_state).toBe("active");
    expect(dup!.corpus_state).toBe("duplicate_exact");

    const { data: dec } = await svc
      .from("dedup_decision")
      .select("kind, outcome, actor, record_a_id, record_b_id, is_reversed")
      .eq("review_id", reviewId)
      .eq("record_b_id", dupId)
      .single();
    expect(dec).toMatchObject({
      kind: "exact_auto",
      outcome: "removed",
      actor: "system",
      record_a_id: keepId,
      is_reversed: false,
    });

    const { count: auditCount } = await svc
      .from("audit_entry")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId)
      .eq("action", "dedup_exact_remove");
    expect(auditCount).toBe(1);
  });

  it("re-rodar é idempotente — não remove mais nada nem duplica decisões", async () => {
    const { data: removed2 } = await owner.rpc("dedup_exact", {
      p_review_id: reviewId,
    });
    expect(removed2).toBe(0);
    const { count } = await serviceClient()
      .from("dedup_decision")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBe(1);
  });
});

export { seedRecord, seedRecordActive };
