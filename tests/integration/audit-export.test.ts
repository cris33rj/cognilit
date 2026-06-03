import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { toAuditJson, toAuditCsv } from "@/lib/audit/export";
import type { AuditRow } from "@/lib/audit/queries";

describe("trilha de auditoria — SC-006 / FR-035", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recordId: string;
  let auditRows: AuditRow[];

  beforeAll(async () => {
    const uid = crypto.randomUUID();
    owner = (
      await signUpUser(`audit_owner_${uid}@example.com`, "senha-teste-123")
    ).client;
    intruder = (
      await signUpUser(`audit_intr_${uid}@example.com`, "senha-teste-123")
    ).client;

    // 1. Criar revisão via owner RPC
    const { data: review, error: reviewError } = await owner.rpc(
      "create_review",
      { p_title: "Audit Trail Test" },
    );
    if (reviewError) throw reviewError;
    reviewId = review.id;

    // 2. Inserir registro via serviceClient (contorna RLS de INSERT)
    const svc = serviceClient();
    const { data: rec, error: recError } = await svc
      .from("record")
      .insert({
        review_id: reviewId,
        source_format: "ris",
        raw: {},
        metadata: { title: "Test Article", year: "2024" },
        title_norm: "test article",
        corpus_state: "active",
      })
      .select("id")
      .single();
    if (recError) throw recError;
    recordId = rec!.id;

    // 3. Chamar decide_screening via owner (gera audit_entry "decide_screening")
    const { data: decisionId, error: decideError } = await owner.rpc(
      "decide_screening",
      {
        p_review_id: reviewId,
        p_record_id: recordId,
        p_stage: "title_abstract",
        p_decision: "exclude",
      },
    );
    if (decideError) throw decideError;

    // 4. Chamar reverse_screening via owner (gera audit_entry "reverse_screening")
    const { error: reverseError } = await owner.rpc("reverse_screening", {
      p_decision_id: decisionId as string,
    });
    if (reverseError) throw reverseError;

    // 5. Ler audit_entry diretamente via owner client (evita server wrapper)
    const { data: rows, error: auditError } = await owner
      .from("audit_entry")
      .select(
        "id, created_at, actor_type, actor_id, action, entity, entity_id, before, after",
      )
      .eq("review_id", reviewId)
      .order("created_at", { ascending: true });
    if (auditError) throw auditError;
    auditRows = (rows ?? []) as AuditRow[];
  }, 30_000);

  it("SC-006: ambas as ações aparecem na trilha (decide + reverse)", () => {
    const actions = auditRows.map((r) => r.action);
    expect(actions).toContain("screening_decide");
    expect(actions).toContain("screening_reverse");
  });

  it("SC-006: a entrada de reverse vem depois da de decide (ordem cronológica)", () => {
    const decideIdx = auditRows.findIndex(
      (r) => r.action === "screening_decide",
    );
    const reverseIdx = auditRows.findIndex(
      (r) => r.action === "screening_reverse",
    );
    expect(decideIdx).toBeGreaterThanOrEqual(0);
    expect(reverseIdx).toBeGreaterThan(decideIdx);
  });

  it("RLS: intruso não-membro lê zero entradas de audit_entry", async () => {
    const { data, error } = await intruder
      .from("audit_entry")
      .select("id")
      .eq("review_id", reviewId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("FR-035: serializador JSON preserva before/after aninhados", () => {
    const screeningRows = auditRows.filter(
      (r) =>
        r.action === "screening_decide" || r.action === "screening_reverse",
    );
    const parsed = JSON.parse(toAuditJson(screeningRows));
    expect(parsed).toHaveLength(screeningRows.length);
    // before/after devem ser objetos aninhados, não strings
    for (const row of parsed) {
      expect(typeof row.before === "object" || row.before === null).toBe(true);
      expect(typeof row.after === "object" || row.after === null).toBe(true);
    }
  });

  it("FR-035: serializador CSV produz header correto e linha por entrada", () => {
    const screeningRows = auditRows.filter(
      (r) =>
        r.action === "screening_decide" || r.action === "screening_reverse",
    );
    const csv = toAuditCsv(screeningRows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "id,created_at,actor_type,actor_id,action,entity,entity_id,before,after",
    );
    // header + 1 linha por entrada de screening
    expect(lines).toHaveLength(screeningRows.length + 1);
    expect(csv).toContain("screening_reverse");
  });
}, 60_000);
