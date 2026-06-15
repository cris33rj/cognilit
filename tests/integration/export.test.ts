// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpUser, serviceClient } from "./helpers/supabase";

async function seedReview(
  label: string,
): Promise<{ svc: SupabaseClient; member: SupabaseClient; reviewId: string }> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const svc = serviceClient();
  const { client: member } = await signUpUser(
    `export_${label}_${stamp}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await member.rpc("create_review", {
    p_title: `Export ${label} ${stamp}`,
  });
  if (error) throw new Error(error.message);
  return { svc, member, reviewId: (review as { id: string }).id };
}

describe("Fatia 5 — migration report_export (0021)", () => {
  it("create_report_export_job enfileira 1 job_item por formato + audita", async () => {
    const { svc, member, reviewId } = await seedReview("mig");
    const { data: job, error } = await member.rpc("create_report_export_job", {
      p_review_id: reviewId,
      p_formats: ["md", "bibtex", "ris"],
    });
    expect(error).toBeNull();
    const jobId = (job as { id: string }).id;

    const { count } = await svc
      .from("job_item")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);
    expect(count).toBe(3);

    const { data: jr } = await svc
      .from("job")
      .select("type")
      .eq("id", jobId)
      .single();
    expect((jr as { type: string }).type).toBe("report_export");

    const { count: auditCount } = await svc
      .from("audit_entry")
      .select("id", { count: "exact", head: true })
      .eq("entity", "job")
      .eq("entity_id", jobId);
    expect(auditCount).toBe(1);
  });

  it("create_report_export_job rejeita formato inválido", async () => {
    const { member, reviewId } = await seedReview("badfmt");
    const { error } = await member.rpc("create_report_export_job", {
      p_review_id: reviewId,
      p_formats: ["md", "xlsx"],
    });
    expect(error).not.toBeNull();
  });

  it("export_artifact: não-membro não enxerga (RLS)", async () => {
    const { svc, reviewId } = await seedReview("rls");
    await svc.from("export_artifact").insert({
      review_id: reviewId,
      format: "md",
      storage_path: `review/${reviewId}/report/_/md/x.md`,
    });
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const { client: stranger } = await signUpUser(
      `export_stranger_${stamp}@example.com`,
      "senha-teste-123",
    );
    const { data } = await stranger
      .from("export_artifact")
      .select("id")
      .eq("review_id", reviewId);
    expect(data ?? []).toHaveLength(0);
  });
});
