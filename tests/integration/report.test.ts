// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpUser, serviceClient } from "./helpers/supabase";
import {
  loadReportInputs,
  resolveReport,
  loadReport,
} from "@/lib/report/queries";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueReportDraftJob } from "@/lib/report/enqueue";
import { runReportDraftWorkerWith } from "@/lib/report/batch-run";
import { regenerateDeterministicSections } from "@/lib/report/regenerate";

// Harness (mirrors tests/integration/synthesis.test.ts):
//  - serviceClient() bypasses RLS -> seeds/reads freely; is ALSO the Node worker client.
//  - signUpUser() -> anon client already signed-in; create_review RPC auto-inserts member.
//  - membership-gated RPCs (create_report_draft_job, set_report_section_content) -> client `member`.
async function seedReview(
  label: string,
): Promise<{ svc: SupabaseClient; member: SupabaseClient; reviewId: string }> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const svc = serviceClient();
  const { client: member } = await signUpUser(
    `report_${label}_${stamp}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await member.rpc("create_review", {
    p_title: `Relatorio ${label} ${stamp}`,
  });
  if (error) throw new Error(error.message);
  return { svc, member, reviewId: (review as { id: string }).id };
}

describe("Fatia 3 — migration report (0019)", () => {
  it("create_report_draft_job enfileira job report_draft com 2 job_items (secoes IA)", async () => {
    const { svc, member, reviewId } = await seedReview("mig");
    const { data: job, error } = await member.rpc("create_report_draft_job", {
      p_review_id: reviewId,
    });
    expect(error).toBeNull();
    const jobId = (job as { id: string }).id;
    const { count } = await svc
      .from("job_item")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);
    expect(count).toBe(2); // discussion + conclusion
    const { data: jr } = await svc
      .from("job")
      .select("type")
      .eq("id", jobId)
      .single();
    expect((jr as { type: string }).type).toBe("report_draft");
    const { count: auditCount } = await svc
      .from("audit_entry")
      .select("id", { count: "exact", head: true })
      .eq("entity", "job")
      .eq("entity_id", jobId);
    expect(auditCount).toBe(1);
  });

  it("set_report_section_content move Discussao para human_edited e audita", async () => {
    const { svc, member, reviewId } = await seedReview("edit");
    const { data: rep } = await svc
      .from("report")
      .insert({ review_id: reviewId, status: "ready" })
      .select("id")
      .single();
    const { data: sec } = await svc
      .from("report_section")
      .insert({
        review_id: reviewId,
        report_id: (rep as { id: string }).id,
        kind: "discussion",
        content: "rascunho",
        edit_state: "ai_generated",
        order: 2,
      })
      .select("id")
      .single();
    const sectionId = (sec as { id: string }).id;

    const { error } = await member.rpc("set_report_section_content", {
      p_section_id: sectionId,
      p_content: "texto editado pelo humano",
    });
    expect(error).toBeNull();
    const { data: after } = await svc
      .from("report_section")
      .select("content, edit_state")
      .eq("id", sectionId)
      .single();
    expect((after as { edit_state: string }).edit_state).toBe("human_edited");
    expect((after as { content: string }).content).toBe(
      "texto editado pelo humano",
    );

    const { count: auditCount } = await svc
      .from("audit_entry")
      .select("id", { count: "exact", head: true })
      .eq("entity", "report_section")
      .eq("entity_id", sectionId);
    expect(auditCount).toBe(1);
  });

  it("set_report_section_content rejeita edicao de Resultados (deterministic-only, A3)", async () => {
    const { svc, member, reviewId } = await seedReview("a3");
    const { data: rep } = await svc
      .from("report")
      .insert({ review_id: reviewId, status: "ready" })
      .select("id")
      .single();
    const { data: sec } = await svc
      .from("report_section")
      .insert({
        review_id: reviewId,
        report_id: (rep as { id: string }).id,
        kind: "results",
        content: "c",
        edit_state: "deterministic",
        order: 1,
      })
      .select("id")
      .single();
    const { error } = await member.rpc("set_report_section_content", {
      p_section_id: (sec as { id: string }).id,
      p_content: "x",
    });
    expect(error).not.toBeNull(); // A3: Resultados nao tem override por secao
  });

  it("nao-membro nao consegue create_report_draft_job (RLS/membership)", async () => {
    const { reviewId } = await seedReview("nonmember");
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const { client: outsider } = await signUpUser(
      `outsider_${stamp}@example.com`,
      "senha-teste-123",
    );
    const { error } = await outsider.rpc("create_report_draft_job", {
      p_review_id: reviewId,
    });
    expect(error).not.toBeNull();
  });
});

describe("loadReportInputs / resolveReport (IO, deps-injection)", () => {
  it("carrega contadores PRISMA, temas e fases opcionais OFF", async () => {
    const { svc, reviewId } = await seedReview("io");
    const inputs = await loadReportInputs({ supabase: svc }, reviewId);
    expect(inputs.counters).toBeDefined();
    expect(Array.isArray(inputs.themes)).toBe(true);
    expect(Array.isArray(inputs.aiSuggestions)).toBe(true);
    expect(inputs.optionalPhasesOff.length).toBe(2); // Viés + Certeza OFF (v1)
  });

  it("resolveReport cria a row report 1:1 idempotente", async () => {
    const { svc, reviewId } = await seedReview("resolve");
    const a = await resolveReport({ supabase: svc }, reviewId);
    const b = await resolveReport({ supabase: svc }, reviewId);
    expect(a).toBe(b);
  });
});

describe("processReportDraftJob (worker)", () => {
  it("monta 4 determinísticas + rascunha Discussão/Conclusão (ai_generated) + ai_usage report", async () => {
    const { svc, member, reviewId } = await seedReview("worker");
    await enqueueReportDraftJob({ supabase: member }, reviewId); // RPC gated -> member client
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId); // worker -> service client

    const rep = await loadReport({ supabase: svc }, reviewId);
    expect(rep).not.toBeNull();
    expect(rep!.status).toBe("ready");
    const kinds = rep!.sections.map((s) => s.kind).sort();
    expect(kinds).toEqual(
      [
        "ai_declaration",
        "conclusion",
        "deviations",
        "discussion",
        "methods",
        "results",
      ].sort(),
    );
    const disc = rep!.sections.find((s) => s.kind === "discussion")!;
    expect(disc.edit_state).toBe("ai_generated");
    expect(disc.ai_suggestion_id).not.toBeNull();

    const { count } = await svc
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId)
      .eq("phase", "report");
    expect((count ?? 0) >= 1).toBe(true);
  });

  it("regeneração via worker PRESERVA Discussão human_edited", async () => {
    const { svc, member, reviewId } = await seedReview("worker-preserve");
    await enqueueReportDraftJob({ supabase: member }, reviewId);
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);

    const rep0 = await loadReport({ supabase: svc }, reviewId);
    const disc = rep0!.sections.find((s) => s.kind === "discussion")!;
    await member.rpc("set_report_section_content", {
      p_section_id: disc.id,
      p_content: "DISCUSSÃO EDITADA PELO HUMANO",
    });

    await enqueueReportDraftJob({ supabase: member }, reviewId);
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);

    const rep1 = await loadReport({ supabase: svc }, reviewId);
    const disc1 = rep1!.sections.find((s) => s.kind === "discussion")!;
    expect(disc1.content).toBe("DISCUSSÃO EDITADA PELO HUMANO");
    expect(disc1.edit_state).toBe("human_edited");
  });
});

describe("regenerateDeterministicSections (FR-016)", () => {
  it("reescreve determinísticas e preserva Métodos human_edited", async () => {
    const { svc, member, reviewId } = await seedReview("regen");
    await enqueueReportDraftJob({ supabase: member }, reviewId);
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);

    const rep = await loadReport({ supabase: svc }, reviewId);
    const methods = rep!.sections.find((s) => s.kind === "methods")!;
    await member.rpc("set_report_section_content", {
      p_section_id: methods.id,
      p_content: "MÉTODOS EDITADO",
    });

    const res = await regenerateDeterministicSections(
      { supabase: svc },
      reviewId,
    );
    expect(res.preserved).toContain("methods");
    expect(res.regenerated).toContain("results");
    expect(res.regenerated).toContain("ai_declaration");

    const rep2 = await loadReport({ supabase: svc }, reviewId);
    expect(rep2!.sections.find((s) => s.kind === "methods")!.content).toBe(
      "MÉTODOS EDITADO",
    );
  });
});
