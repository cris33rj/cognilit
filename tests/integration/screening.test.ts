import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

/** Insere um record 'active' (já deduplicado) e devolve o id. */
async function seedActiveRecord(
  reviewId: string,
  opts: { title: string; year?: string; abstract?: string },
) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: {
        title: opts.title,
        year: opts.year ?? "2020",
        abstract: opts.abstract ?? null,
      },
      title_norm: opts.title.toLowerCase().trim(),
      corpus_state: "active",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id;
}

describe("decide_screening — Título/Resumo (FR-022/023)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`ds_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Triagem TR",
    });
    reviewId = review.id;
    recId = await seedActiveRecord(reviewId, {
      title: "Active learning in nursing",
    });
  });

  it("incluir em T/R: record vira included_ts, decisão registrada, auditoria escrita", async () => {
    const { data: id, error } = await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "title_abstract",
      p_decision: "include",
    });
    expect(error).toBeNull();
    expect(id).toBeTruthy();

    const svc = serviceClient();
    const { data: rec } = await svc
      .from("record")
      .select("corpus_state, ts_decision")
      .eq("id", recId)
      .single();
    expect(rec!.corpus_state).toBe("included_ts");
    expect(rec!.ts_decision).toBe("included");

    const { count } = await svc
      .from("audit_entry")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId)
      .eq("action", "screening_decide");
    expect(count).toBe(1);
  });

  it("marcar dúvida em T/R: vira maybe_ts (pendente, não avança — Q1)", async () => {
    const r2 = await seedActiveRecord(reviewId, { title: "Outro estudo" });
    await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: r2,
      p_stage: "title_abstract",
      p_decision: "maybe",
    });
    const { data } = await serviceClient()
      .from("record")
      .select("corpus_state, ts_decision")
      .eq("id", r2)
      .single();
    expect(data!.corpus_state).toBe("maybe_ts");
    expect(data!.ts_decision).toBe("maybe");
  });
});

describe("decide_screening — Texto completo (FR-025/Q1)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recId: string;
  let reasonId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`dft_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Triagem TC",
    });
    reviewId = review.id;
    await owner.rpc("seed_default_exclusion_reasons", {
      p_review_id: reviewId,
    });
    const { data: reason } = await owner
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId)
      .order("sort_order")
      .limit(1)
      .single();
    reasonId = reason!.id;
    recId = await seedActiveRecord(reviewId, { title: "Estudo elegível" });
  });

  it("excluir no Texto completo sem motivo é rejeitado (FR-025)", async () => {
    await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "title_abstract",
      p_decision: "include",
    });
    const { error } = await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "full_text",
      p_decision: "exclude",
    });
    expect(error).not.toBeNull();
  });

  it("Texto completo só após included em T/R (Q1)", async () => {
    const r2 = await seedActiveRecord(reviewId, { title: "Não triado em TR" });
    const { error } = await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: r2,
      p_stage: "full_text",
      p_decision: "include",
    });
    expect(error).not.toBeNull();
  });

  it("excluir no Texto completo com motivo: vira excluded_ft, grava motivo", async () => {
    const { error } = await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "full_text",
      p_decision: "exclude",
      p_exclusion_reason_id: reasonId,
    });
    expect(error).toBeNull();
    const { data } = await serviceClient()
      .from("record")
      .select("corpus_state, ft_decision, ft_exclusion_reason_id")
      .eq("id", recId)
      .single();
    expect(data!.corpus_state).toBe("excluded_ft");
    expect(data!.ft_decision).toBe("excluded");
    expect(data!.ft_exclusion_reason_id).toBe(reasonId);
  });
});

describe("decide_screening — 1ª decisão trava o protocolo (FR-010/Q5)", () => {
  it("a primeira screening_decision dispara lock_protocol", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`lk_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Lock na triagem",
    });
    const reviewId = review.id;
    // Protocolo em rascunho (Fatia 2).
    await owner.from("protocol").insert({
      review_id: reviewId,
      content: { contentMarkdown: "# rascunho" },
      origin: "human",
    });
    const recId = await seedActiveRecord(reviewId, {
      title: "Primeiro a triar",
    });
    await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "title_abstract",
      p_decision: "include",
    });
    const { data: proto } = await owner
      .from("protocol")
      .select("state, locked_at")
      .eq("review_id", reviewId)
      .single();
    expect(proto!.state).toBe("locked");
    expect(proto!.locked_at).not.toBeNull();
  });
});

describe("reverse_screening (FR-026 / Q4)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`rs_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Reverter triagem",
    });
    reviewId = review.id;
    recId = await seedActiveRecord(reviewId, { title: "Para reverter" });
    const { data: id } = await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "title_abstract",
      p_decision: "exclude",
    });
    decisionId = id as string;
  });

  it("desfaz decisão de T/R: record volta a active, decisão marcada, nova auditoria", async () => {
    const { error } = await owner.rpc("reverse_screening", {
      p_decision_id: decisionId,
    });
    expect(error).toBeNull();

    const svc = serviceClient();
    const { data: rec } = await svc
      .from("record")
      .select("corpus_state, ts_decision")
      .eq("id", recId)
      .single();
    expect(rec!.corpus_state).toBe("active");
    expect(rec!.ts_decision).toBeNull();

    const { data: dec } = await svc
      .from("screening_decision")
      .select("is_reversed, reversed_at")
      .eq("id", decisionId)
      .single();
    expect(dec!.is_reversed).toBe(true);
    expect(dec!.reversed_at).not.toBeNull();

    const { count } = await svc
      .from("audit_entry")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId)
      .eq("action", "screening_reverse");
    expect(count).toBe(1);
  });

  it("reverter duas vezes é rejeitado", async () => {
    const { error } = await owner.rpc("reverse_screening", {
      p_decision_id: decisionId,
    });
    expect(error).not.toBeNull();
  });
});

describe("list_screening_queue (FR-028) + create_screening_job (FR-024)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`q_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Fila",
    });
    reviewId = review.id;
    await seedActiveRecord(reviewId, {
      title: "Estudo A",
      abstract: "resumo A",
    });
    await seedActiveRecord(reviewId, {
      title: "Estudo B",
      abstract: "resumo B",
    });
  });

  it("fila title_abstract lista os registros ativos com colunas de exibição", async () => {
    const { data, error } = await owner.rpc("list_screening_queue", {
      p_review_id: reviewId,
      p_stage: "title_abstract",
    });
    expect(error).toBeNull();
    expect(data!.length).toBe(2);
    expect(data![0]).toHaveProperty("record_id");
    expect(data![0]).toHaveProperty("title");
    expect(data![0]).toHaveProperty("corpus_state");
  });

  it("create_screening_job cria job ai_screening_batch + 1 job_item por registro elegível", async () => {
    const { data: job, error } = await owner.rpc("create_screening_job", {
      p_review_id: reviewId,
      p_record_ids: null,
    });
    expect(error).toBeNull();
    expect(job.type).toBe("ai_screening_batch");
    const { count } = await serviceClient()
      .from("job_item")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id);
    expect(count).toBe(2);
  });
});

import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueScreeningJob } from "@/lib/screening/enqueue";
import { processScreeningJob } from "@/lib/screening/worker";

describe("ai_screening_batch — enqueue + worker (FR-024/033, SC-008)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`ai_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "IA lote",
    });
    reviewId = review.id;
    recId = await seedActiveRecord(reviewId, {
      title: "Estudo IA",
      abstract: "resumo",
    });
  });

  it("enqueue retorna estimativa de custo prévia (FR-033)", async () => {
    const res = await enqueueScreeningJob({ supabase: owner }, reviewId, null);
    expect(res.item_count).toBe(1);
    expect(res.estimated_cost).not.toBeNull();
    expect(res.estimated_cost!.tokensEstimated).toBeGreaterThan(0);
  });

  it("worker anexa sugestão de IA ao registro e grava ai_usage; NUNCA altera o estado (FR-024)", async () => {
    const res = await enqueueScreeningJob({ supabase: owner }, reviewId, null);
    const svc = serviceClient();
    const before = await svc
      .from("record")
      .select("corpus_state")
      .eq("id", recId)
      .single();

    await processScreeningJob(
      {
        supabase: svc,
        provider: new MockLLMProvider(),
        criteria: ["incluir tema"],
      },
      res.job_id,
    );

    const sug = await svc
      .from("ai_suggestion")
      .select("target_kind, target_id, output, provenance")
      .eq("review_id", reviewId)
      .eq("target_id", recId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(sug.data!.target_kind).toBe("screening");
    expect(sug.data!.output).toHaveProperty("recommendation");
    expect(sug.data!.provenance).toHaveProperty("model");

    const usage = await svc
      .from("ai_usage")
      .select("phase")
      .eq("review_id", reviewId)
      .eq("phase", "screening");
    expect(usage.data?.length ?? 0).toBeGreaterThan(0);

    const after = await svc
      .from("record")
      .select("corpus_state")
      .eq("id", recId)
      .single();
    expect(after.data!.corpus_state).toBe(before.data!.corpus_state); // IA não decide

    const { data: job } = await svc
      .from("job")
      .select("status")
      .eq("id", res.job_id)
      .single();
    expect(["completed", "completed_with_errors"]).toContain(job!.status);
  });
});

export { seedActiveRecord };

import { runScreeningWorkerWith } from "@/lib/screening/run";

describe("runScreeningWorkerWith — fia o worker (D-F5.5)", () => {
  it("processa todos os itens pendentes do job ai_screening_batch da Revisão", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`run_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Run worker",
    });
    const reviewId = review.id;
    await seedActiveRecord(reviewId, { title: "Estudo run", abstract: "r" });
    const { data: job } = await owner.rpc("create_screening_job", {
      p_review_id: reviewId,
      p_record_ids: null,
    });
    const svc = serviceClient();
    await runScreeningWorkerWith(svc, new MockLLMProvider(), reviewId, []);
    const { count } = await svc
      .from("job_item")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("status", "done");
    expect(count).toBe(1);
  });
});
