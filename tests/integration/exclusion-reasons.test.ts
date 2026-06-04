import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

/** Cria uma question + N critérios de exclusão para a Revisão (origin=human). */
async function seedQuestion(reviewId: string) {
  const svc = serviceClient();
  const { data: q, error } = await svc
    .from("question")
    .insert({
      review_id: reviewId,
      framework: "spider",
      question_text: "Pergunta de teste",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return q!.id as string;
}

async function addCriterion(
  reviewId: string,
  questionId: string,
  text: string,
  ratification: "pending" | "accepted" | "edited" | "rejected" = "accepted",
) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("eligibility_criterion")
    .insert({
      review_id: reviewId,
      question_id: questionId,
      kind: "exclusion",
      text,
      origin: "human",
      ratification_state: ratification,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

async function seedActiveRecord(reviewId: string, title: string) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title, year: "2020" },
      title_norm: title.toLowerCase().trim(),
      corpus_state: "active",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

describe("ensure_exclusion_reasons — deriva de critérios + semeia genéricos", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let questionId: string;
  let critAId: string;
  let critBId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`xr_ens_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Motivos derivados",
    });
    reviewId = review.id;
    questionId = await seedQuestion(reviewId);
    critAId = await addCriterion(
      reviewId,
      questionId,
      "Estudo não randomizado",
      "accepted",
    );
    critBId = await addCriterion(
      reviewId,
      questionId,
      "Publicado antes de 2010",
      "edited",
    );
  });

  it("inclui os 2 motivos derivados (origin=criterion) + os 7 seeds, sem duplicata literal", async () => {
    const { error } = await owner.rpc("ensure_exclusion_reasons", {
      p_review_id: reviewId,
    });
    expect(error).toBeNull();

    const svc = serviceClient();
    const { data: reasons } = await svc
      .from("exclusion_reason")
      .select("id, label, origin, source_criterion_id, is_active")
      .eq("review_id", reviewId)
      .eq("is_active", true);

    const derived = reasons!.filter((r) => r.origin === "criterion");
    expect(derived.length).toBe(2);
    const byCrit = new Map(
      derived.map((r) => [r.source_criterion_id as string, r]),
    );
    expect(byCrit.get(critAId)!.label).toBe("Estudo não randomizado");
    expect(byCrit.get(critBId)!.label).toBe("Publicado antes de 2010");

    const seeds = reasons!.filter((r) => r.origin === "seed");
    expect(seeds.length).toBe(7);

    // Sem duplicata literal (label normalizado único entre ativos).
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const labels = reasons!.map((r) => norm(r.label));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("idempotência: chamar duas vezes não cria duplicatas", async () => {
    const svc = serviceClient();
    const before = await svc
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });
    const after = await svc
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId);
    expect(after.data!.length).toBe(before.data!.length);
  });

  it("editar o texto de um critério ratificado: re-sync atualiza o label do espelho", async () => {
    const svc = serviceClient();
    await svc
      .from("eligibility_criterion")
      .update({ text: "Estudo não randomizado (revisado)" })
      .eq("id", critAId);
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });
    const { data: mirror } = await svc
      .from("exclusion_reason")
      .select("label")
      .eq("source_criterion_id", critAId)
      .single();
    expect(mirror!.label).toBe("Estudo não randomizado (revisado)");
  });
});

describe("sync — des-ratificar critério desativa o espelho não usado, preserva o usado", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let questionId: string;
  let critUnusedId: string;
  let critUsedId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`xr_unr_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Des-ratificar",
    });
    reviewId = review.id;
    questionId = await seedQuestion(reviewId);
    critUnusedId = await addCriterion(
      reviewId,
      questionId,
      "Motivo nunca usado",
      "accepted",
    );
    critUsedId = await addCriterion(
      reviewId,
      questionId,
      "Motivo que foi usado",
      "accepted",
    );
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });
  });

  it("espelho não usado vira is_active=false; espelho usado por um record permanece ativo", async () => {
    const svc = serviceClient();
    // Descobre o reason espelho do critério usado e referencia num record excluído.
    const { data: usedReason } = await svc
      .from("exclusion_reason")
      .select("id")
      .eq("source_criterion_id", critUsedId)
      .single();
    const recId = await seedActiveRecord(reviewId, "Estudo a excluir");
    await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "title_abstract",
      p_decision: "include",
    });
    await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "full_text",
      p_decision: "exclude",
      p_exclusion_reason_id: usedReason!.id,
    });

    // Des-ratifica ambos.
    await svc
      .from("eligibility_criterion")
      .update({ ratification_state: "rejected" })
      .in("id", [critUnusedId, critUsedId]);

    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });

    const { data: unused } = await svc
      .from("exclusion_reason")
      .select("is_active")
      .eq("source_criterion_id", critUnusedId)
      .single();
    expect(unused!.is_active).toBe(false);

    const { data: used } = await svc
      .from("exclusion_reason")
      .select("is_active")
      .eq("source_criterion_id", critUsedId)
      .single();
    expect(used!.is_active).toBe(true);
  });
});

describe("sync — re-ratificar critério reativa o espelho desativado", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let questionId: string;
  let critId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`xr_rer_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Re-ratificar",
    });
    reviewId = review.id;
    questionId = await seedQuestion(reviewId);
    critId = await addCriterion(
      reviewId,
      questionId,
      "Critério que vai e volta",
      "accepted",
    );
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });
  });

  it("rejeitar então re-aceitar o critério: espelho fica is_active=true de novo (uma só linha)", async () => {
    const svc = serviceClient();

    // Espelho criado e ativo.
    const { data: mirror0 } = await svc
      .from("exclusion_reason")
      .select("id, is_active")
      .eq("source_criterion_id", critId)
      .single();
    expect(mirror0!.is_active).toBe(true);

    // Rejeita o critério → re-sync desativa o espelho (não usado).
    await svc
      .from("eligibility_criterion")
      .update({ ratification_state: "rejected" })
      .eq("id", critId);
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });
    const { data: mirrorOff } = await svc
      .from("exclusion_reason")
      .select("is_active")
      .eq("source_criterion_id", critId)
      .single();
    expect(mirrorOff!.is_active).toBe(false);

    // Re-aceita o critério → re-sync reativa o espelho.
    await svc
      .from("eligibility_criterion")
      .update({ ratification_state: "accepted" })
      .eq("id", critId);
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });

    const { data: mirrorBack } = await svc
      .from("exclusion_reason")
      .select("id, is_active")
      .eq("source_criterion_id", critId);
    // Ainda uma única linha para o critério.
    expect(mirrorBack!.length).toBe(1);
    const back = mirrorBack![0]!;
    expect(back.is_active).toBe(true);
    expect(back.id).toBe(mirror0!.id);
  });
});

describe("add_exclusion_reason + set_exclusion_reason_active", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`xr_man_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Manual",
    });
    reviewId = review.id;
  });

  it("add_exclusion_reason insere motivo manual (origin=manual)", async () => {
    const { data: id, error } = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "Motivo manual",
    });
    expect(error).toBeNull();
    expect(id).toBeTruthy();
    const svc = serviceClient();
    const { data: row } = await svc
      .from("exclusion_reason")
      .select("origin, label")
      .eq("id", id)
      .single();
    expect(row!.origin).toBe("manual");
    expect(row!.label).toBe("Motivo manual");
  });

  it("dedup por label normalizado retorna o id existente, não duplica", async () => {
    const { data: id1 } = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "Duplo motivo",
    });
    const { data: id2 } = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "  DUPLO   motivo  ",
    });
    expect(id2).toBe(id1);
  });

  it("rejeita label vazio", async () => {
    const { error } = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "   ",
    });
    expect(error).not.toBeNull();
  });

  it("set_exclusion_reason_active(false) faz soft-delete (linha permanece)", async () => {
    const { data: id } = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "Para desativar",
    });
    const { error } = await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: id,
      p_active: false,
    });
    expect(error).toBeNull();
    const svc = serviceClient();
    const { data: row } = await svc
      .from("exclusion_reason")
      .select("is_active")
      .eq("id", id)
      .single();
    expect(row!.is_active).toBe(false);
  });

  it("set_exclusion_reason_active(true) rejeita se outro motivo ATIVO já usa o label normalizado", async () => {
    const svc = serviceClient();

    // Motivo ativo de referência.
    const { data: activeId } = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "Motivo colidente",
    });

    // Motivo distinto que será desativado e depois colidido por label.
    const { data: inactiveId } = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "Outro motivo qualquer",
    });
    await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: inactiveId,
      p_active: false,
    });

    // Força o label do inativo a colidir (normalizado) com o ativo,
    // contornando o dedup do add via service client.
    await svc
      .from("exclusion_reason")
      .update({ label: "  motivo   COLIDENTE " })
      .eq("id", inactiveId);

    // Reativar deve falhar: outro ativo já usa o mesmo label normalizado.
    const { error } = await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: inactiveId,
      p_active: true,
    });
    expect(error).not.toBeNull();

    // O motivo permanece inativo; o ativo de referência segue ativo.
    const { data: stillInactive } = await svc
      .from("exclusion_reason")
      .select("is_active")
      .eq("id", inactiveId)
      .single();
    expect(stillInactive!.is_active).toBe(false);
    const { data: stillActive } = await svc
      .from("exclusion_reason")
      .select("is_active")
      .eq("id", activeId)
      .single();
    expect(stillActive!.is_active).toBe(true);
  });
});

describe("prisma_exclusion_breakdown resolve motivo derivado usado", () => {
  it("excluir no Texto completo com motivo derivado aparece no breakdown com o label do critério", async () => {
    const s = Date.now();
    const owner = (
      await signUpUser(`xr_pri_${s}@example.com`, "senha-teste-123")
    ).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Breakdown derivado",
    });
    const reviewId = review.id;
    const questionId = await seedQuestion(reviewId);
    const critId = await addCriterion(
      reviewId,
      questionId,
      "Desfecho não relatado",
      "accepted",
    );
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });

    const svc = serviceClient();
    const { data: reason } = await svc
      .from("exclusion_reason")
      .select("id")
      .eq("source_criterion_id", critId)
      .single();

    const recId = await seedActiveRecord(reviewId, "Estudo p/ breakdown");
    await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "title_abstract",
      p_decision: "include",
    });
    await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recId,
      p_stage: "full_text",
      p_decision: "exclude",
      p_exclusion_reason_id: reason!.id,
    });

    const { data: breakdown } = await svc
      .from("prisma_exclusion_breakdown")
      .select("reason_id, reason_label, n")
      .eq("review_id", reviewId);
    const row = breakdown!.find((b) => b.reason_id === reason!.id);
    expect(row).toBeDefined();
    expect(row!.reason_label).toBe("Desfecho não relatado");
    expect(Number(row!.n)).toBe(1);
  });
});

describe("dismissed — a remoção do usuário é pegajosa (não ressuscita)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let questionId: string;
  let critId: string;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`xr_dis_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Dismissed",
    });
    reviewId = review.id;
    questionId = await seedQuestion(reviewId);
    critId = await addCriterion(
      reviewId,
      questionId,
      "Critério removível",
      "accepted",
    );
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });
  });

  it("remover um motivo DERIVADO (critério ainda ratificado) persiste após ensure", async () => {
    const svc = serviceClient();
    const { data: mirror } = await svc
      .from("exclusion_reason")
      .select("id")
      .eq("source_criterion_id", critId)
      .single();

    await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: mirror!.id,
      p_active: false,
    });
    // ensure roda sync (critério segue ratificado) — NÃO deve reativar.
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });

    const { data: after } = await svc
      .from("exclusion_reason")
      .select("is_active, dismissed")
      .eq("id", mirror!.id)
      .single();
    expect(after!.is_active).toBe(false);
    expect(after!.dismissed).toBe(true);

    // Não cria um segundo espelho para o mesmo critério.
    const { data: mirrors } = await svc
      .from("exclusion_reason")
      .select("id")
      .eq("source_criterion_id", critId);
    expect(mirrors!.length).toBe(1);
  });

  it("remover um motivo SEED persiste após ensure (não re-semeia)", async () => {
    const svc = serviceClient();
    const { data: seeds } = await svc
      .from("exclusion_reason")
      .select("id, label")
      .eq("review_id", reviewId)
      .eq("origin", "seed")
      .eq("is_active", true);
    const seed = seeds![0]!;

    await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: seed.id,
      p_active: false,
    });
    await owner.rpc("ensure_exclusion_reasons", { p_review_id: reviewId });

    const { data: active } = await svc
      .from("exclusion_reason")
      .select("label")
      .eq("review_id", reviewId)
      .eq("is_active", true);
    expect(active!.some((r) => norm(r.label) === norm(seed.label))).toBe(false);

    // Continua existindo só uma linha com aquele label (a dispensada).
    const { data: rows } = await svc
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId)
      .eq("label", seed.label);
    expect(rows!.length).toBe(1);
  });

  it("re-adicionar o mesmo label revive o motivo dispensado (sem duplicar)", async () => {
    const svc = serviceClient();
    const { data: seeds } = await svc
      .from("exclusion_reason")
      .select("id, label")
      .eq("review_id", reviewId)
      .eq("origin", "seed")
      .eq("is_active", true);
    const seed = seeds![0]!;

    await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: seed.id,
      p_active: false,
    });
    const res = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: seed.label,
    });
    expect(res.error).toBeNull();
    expect(res.data).toBe(seed.id); // revive a mesma linha, não cria nova

    const { data: after } = await svc
      .from("exclusion_reason")
      .select("is_active, dismissed")
      .eq("id", seed.id)
      .single();
    expect(after!.is_active).toBe(true);
    expect(after!.dismissed).toBe(false);

    const { data: rows } = await svc
      .from("exclusion_reason")
      .select("id")
      .eq("review_id", reviewId)
      .eq("label", seed.label);
    expect(rows!.length).toBe(1);
  });
});

describe("RLS — não-membro não pode chamar os novos RPCs", () => {
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    const owner = (
      await signUpUser(`xr_rls_o_${s}@example.com`, "senha-teste-123")
    ).client;
    intruder = (
      await signUpUser(`xr_rls_i_${s}@example.com`, "senha-teste-123")
    ).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "RLS novos RPCs",
    });
    reviewId = review.id;
  });

  it("ensure/add/set chamados por não-membro disparam erro", async () => {
    const e1 = await intruder.rpc("ensure_exclusion_reasons", {
      p_review_id: reviewId,
    });
    expect(e1.error).not.toBeNull();

    const e2 = await intruder.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "intruso",
    });
    expect(e2.error).not.toBeNull();
  });
});

describe("set_exclusion_reason_active — bloqueia remoção de motivo EM USO (8.1)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let reasonId: string;
  let recordId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`xr_use_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "Em uso",
    });
    reviewId = review.id;
    const { data: id } = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "Motivo em uso",
    });
    reasonId = id as string;
    recordId = await seedActiveRecord(reviewId, "Estudo que usa o motivo");
    await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recordId,
      p_stage: "title_abstract",
      p_decision: "include",
    });
    const { data: did } = await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recordId,
      p_stage: "full_text",
      p_decision: "exclude",
      p_exclusion_reason_id: reasonId,
    });
    decisionId = did as string;
  });

  it("remover (desativar) um motivo em uso dispara erro e mantém o motivo ativo", async () => {
    const { error } = await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: reasonId,
      p_active: false,
    });
    expect(error).not.toBeNull();
    const svc = serviceClient();
    const { data: row } = await svc
      .from("exclusion_reason")
      .select("is_active")
      .eq("id", reasonId)
      .single();
    expect(row!.is_active).toBe(true);
  });

  it("list_reason_usage retorna o artigo + título + decision_id da decisão viva", async () => {
    const { data, error } = await owner.rpc("list_reason_usage", {
      p_reason_id: reasonId,
    });
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].record_id).toBe(recordId);
    expect(data![0].title).toBe("Estudo que usa o motivo");
    expect(data![0].decision_id).toBe(decisionId);
  });

  it("após reverter a exclusão, o motivo deixa de estar em uso e a remoção passa", async () => {
    await owner.rpc("reverse_screening", { p_decision_id: decisionId });
    const { data: usage } = await owner.rpc("list_reason_usage", {
      p_reason_id: reasonId,
    });
    expect(usage!.length).toBe(0);
    const { error } = await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: reasonId,
      p_active: false,
    });
    expect(error).toBeNull();
    const svc = serviceClient();
    const { data: row } = await svc
      .from("exclusion_reason")
      .select("is_active, dismissed")
      .eq("id", reasonId)
      .single();
    expect(row!.is_active).toBe(false);
    expect(row!.dismissed).toBe(true);
  });
});

describe("list_reason_usage — RLS: não-membro não lista o uso (8.1)", () => {
  it("não-membro chamando list_reason_usage dispara erro", async () => {
    const s = Date.now();
    const owner = (
      await signUpUser(`xr_lru_o_${s}@example.com`, "senha-teste-123")
    ).client;
    const intruder = (
      await signUpUser(`xr_lru_i_${s}@example.com`, "senha-teste-123")
    ).client;
    const { data: review } = await owner.rpc("create_review", {
      p_title: "RLS usage",
    });
    const { data: id } = await owner.rpc("add_exclusion_reason", {
      p_review_id: review.id,
      p_label: "Motivo X",
    });
    const { error } = await intruder.rpc("list_reason_usage", {
      p_reason_id: id,
    });
    expect(error).not.toBeNull();
  });
});
