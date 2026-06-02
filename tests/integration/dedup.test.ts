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

describe("dedup_exact — fallback title_norm+year (sem DOI)", () => {
  it("remove duplicata pela chave title_norm+year quando não há DOI", async () => {
    const s = Date.now();
    const { client: owner2 } = await signUpUser(
      `dx_nodoi_${s}@example.com`,
      "senha-teste-123",
    );
    const { data: review } = await owner2.rpc("create_review", {
      p_title: "Sem DOI Review",
    });
    const rid = review.id;

    // Dois records com mesmo título e ano, sem DOI — deveriam ser colapsados.
    const keepId = await seedRecord(rid, {
      title: "Sem DOI estudo",
      year: "2018",
      createdAt: "2018-01-01T00:00:00Z",
    });
    const dupId = await seedRecord(rid, {
      title: "Sem DOI estudo",
      year: "2018",
      createdAt: "2018-03-01T00:00:00Z",
    });
    // Terceiro record com título diferente — não deve ser removido.
    await seedRecord(rid, {
      title: "Totalmente diferente",
      year: "2018",
      createdAt: "2018-02-01T00:00:00Z",
    });

    const { data: removed, error } = await owner2.rpc("dedup_exact", {
      p_review_id: rid,
    });
    expect(error).toBeNull();
    expect(removed).toBe(1);

    const svc = serviceClient();
    const { data: keepRec } = await svc
      .from("record")
      .select("corpus_state")
      .eq("id", keepId)
      .single();
    const { data: dupRec } = await svc
      .from("record")
      .select("corpus_state")
      .eq("id", dupId)
      .single();
    expect(keepRec!.corpus_state).toBe("active");
    expect(dupRec!.corpus_state).toBe("duplicate_exact");

    const { data: dec } = await svc
      .from("dedup_decision")
      .select("kind, outcome, record_a_id, record_b_id")
      .eq("review_id", rid)
      .eq("record_b_id", dupId)
      .single();
    expect(dec).toMatchObject({
      kind: "exact_auto",
      outcome: "removed",
      record_a_id: keepId,
    });
  });
});

describe("reverse_dedup (FR-026 / Q4)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let dupId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`rv_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Reverter",
    });
    reviewId = review.id;
    await seedRecord(reviewId, {
      title: "Estudo A",
      year: "2021",
      doi: "10.9/dup",
      createdAt: "2021-01-01T00:00:00Z",
    });
    dupId = await seedRecord(reviewId, {
      title: "Estudo A dup",
      year: "2021",
      doi: "10.9/dup",
      createdAt: "2021-02-01T00:00:00Z",
    });
    await owner.rpc("dedup_exact", { p_review_id: reviewId });
    const { data: dec } = await serviceClient()
      .from("dedup_decision")
      .select("id")
      .eq("record_b_id", dupId)
      .single();
    decisionId = dec!.id;
  });

  it("desfaz a remoção: record volta a active, decisão marcada is_reversed, nova auditoria criada", async () => {
    const { error } = await owner.rpc("reverse_dedup", {
      p_decision_id: decisionId,
    });
    expect(error).toBeNull();

    const svc = serviceClient();
    const { data: rec } = await svc
      .from("record")
      .select("corpus_state")
      .eq("id", dupId)
      .single();
    expect(rec!.corpus_state).toBe("active");

    const { data: dec } = await svc
      .from("dedup_decision")
      .select("is_reversed, reversed_at")
      .eq("id", decisionId)
      .single();
    expect(dec!.is_reversed).toBe(true);
    expect(dec!.reversed_at).not.toBeNull();

    const { count } = await svc
      .from("audit_entry")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId)
      .eq("action", "dedup_reverse");
    expect(count).toBe(1);
  });

  it("reverter duas vezes é rejeitado (decisão já revertida)", async () => {
    const { error } = await owner.rpc("reverse_dedup", {
      p_decision_id: decisionId,
    });
    expect(error).not.toBeNull();
  });
});

describe("list_fuzzy_candidates (FR-020 / R2: >=0.92 + mesmo ano)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`fz_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Fuzzy",
    });
    reviewId = review.id;
    // Par fuzzy forte: similarity()=0.960526, mesmo ano, SEM doi → não são exatas.
    await seedRecordActive(
      reviewId,
      "a systematic review of machine learning methods for medical image segmentation",
      "2022",
    );
    await seedRecordActive(
      reviewId,
      "a systematic review of machine learning methods for medical image segmentations",
      "2022",
    );
    // Mesmo título-quase mas ANO diferente ⇒ não é par (filtro de ano exclui).
    await seedRecordActive(
      reviewId,
      "a systematic review of machine learning methods for medical image segmentation",
      "2010",
    );
    // Título totalmente distinto ⇒ não é par (similarity ~0.12).
    await seedRecordActive(
      reviewId,
      "qualitative synthesis of nursing interventions",
      "2022",
    );
  });

  it("retorna só o par com similaridade >=0.92 e mesmo ano", async () => {
    const { data, error } = await owner.rpc("list_fuzzy_candidates", {
      p_review_id: reviewId,
    });
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].similarity).toBeGreaterThanOrEqual(0.92);
    expect(data![0].year_a).toBe("2022");
    expect(data![0].year_b).toBe("2022");
  });
});

export { seedRecord, seedRecordActive };
