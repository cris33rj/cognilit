// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpUser, serviceClient } from "./helpers/supabase";

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
    expect((auditCount ?? 0) >= 1).toBe(true);
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
});
