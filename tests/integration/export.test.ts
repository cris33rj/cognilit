// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueReportExportJob } from "@/lib/export/enqueue";
import { runReportExportWorkerWith } from "@/lib/export/batch-run";

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

  it("create_report_export_job rejeita 2º job enquanto 1º está ativo", async () => {
    const { member, reviewId } = await seedReview("dupjob");
    await member.rpc("create_report_export_job", {
      p_review_id: reviewId,
      p_formats: ["md"],
    });
    const { error } = await member.rpc("create_report_export_job", {
      p_review_id: reviewId,
      p_formats: ["bibtex"],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/already in progress/);
  });
});

describe("Fatia 5 — worker report_export", () => {
  it("gera md/bibtex/ris: 3 artefatos + objetos no bucket; job completed", async () => {
    const { svc, member, reviewId } = await seedReview("worker");
    await svc.from("record").insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo A", authors: ["Silva, A"], year: 2020 },
      corpus_state: "included_ft",
    });
    const { data: rep } = await svc
      .from("report")
      .insert({ review_id: reviewId, status: "ready" })
      .select("id")
      .single();
    await svc.from("report_section").insert({
      review_id: reviewId,
      report_id: (rep as { id: string }).id,
      kind: "methods",
      content: "Métodos.",
      edit_state: "deterministic",
    });

    await enqueueReportExportJob({ supabase: member }, reviewId, [
      "md",
      "bibtex",
      "ris",
    ]);
    await runReportExportWorkerWith(svc, reviewId);

    const { data: arts } = await svc
      .from("export_artifact")
      .select("format, storage_path")
      .eq("review_id", reviewId);
    expect(
      (arts ?? []).map((a) => (a as { format: string }).format).sort(),
    ).toEqual(["bibtex", "md", "ris"]);

    for (const a of (arts ?? []) as { storage_path: string }[]) {
      const slash = a.storage_path.lastIndexOf("/");
      const { data: listed } = await svc.storage
        .from("exports")
        .list(a.storage_path.slice(0, slash));
      expect((listed ?? []).length).toBeGreaterThan(0);
    }

    const { data: job } = await svc
      .from("job")
      .select("status, progress")
      .eq("review_id", reviewId)
      .eq("type", "report_export")
      .single();
    expect((job as { status: string }).status).toBe("completed");
    expect((job as { progress: number }).progress).toBe(100);
  });

  it("resiliência por-formato: formato não suportado falha isolado (FR-023)", async () => {
    const { svc, member, reviewId } = await seedReview("resil");
    // prisma_svg está no enum export_format (a RPC aceita) mas não tem case no
    // worker (serializeFormat → default: throw). Fatia 6 passou a suportar docx,
    // então usamos prisma_svg como o formato deliberadamente não suportado.
    await enqueueReportExportJob({ supabase: member }, reviewId, [
      "md",
      "prisma_svg",
    ]);
    await runReportExportWorkerWith(svc, reviewId);

    const { data: job } = await svc
      .from("job")
      .select("id, status")
      .eq("review_id", reviewId)
      .eq("type", "report_export")
      .single();
    expect((job as { status: string }).status).toBe("completed_with_errors");

    const { data: items } = await svc
      .from("job_item")
      .select("payload, status")
      .eq("job_id", (job as { id: string }).id);
    const byFmt = Object.fromEntries(
      (items ?? []).map((i) => [
        (i as { payload: { format: string } }).payload.format,
        (i as { status: string }).status,
      ]),
    );
    expect(byFmt.md).toBe("done");
    expect(byFmt.prisma_svg).toBe("failed");

    const { data: arts } = await svc
      .from("export_artifact")
      .select("format")
      .eq("review_id", reviewId);
    expect((arts ?? []).map((a) => (a as { format: string }).format)).toEqual([
      "md",
    ]);
  });

  it("retomável: re-rodar o worker não duplica export_artifact (upsert por job_id,format)", async () => {
    const { svc, member, reviewId } = await seedReview("resume");
    await enqueueReportExportJob({ supabase: member }, reviewId, [
      "md",
      "bibtex",
    ]);

    // 1ª passada conclui o job; 2ª passada não tem itens pending, mas mesmo que
    // re-executasse, o upsert por (job_id, format) garante 1 linha por formato.
    await runReportExportWorkerWith(svc, reviewId);
    await runReportExportWorkerWith(svc, reviewId);

    const { data: arts } = await svc
      .from("export_artifact")
      .select("format")
      .eq("review_id", reviewId);
    expect(
      (arts ?? []).map((a) => (a as { format: string }).format).sort(),
    ).toEqual(["bibtex", "md"]);
  });

  it("worker gera artefatos docx e pdf no bucket (FR-020)", async () => {
    const { svc, member, reviewId } = await seedReview("docxpdf");
    await svc.from("record").insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo Docx", authors: ["Costa, B"], year: 2021 },
      corpus_state: "included_ft",
    });
    const { data: rep } = await svc
      .from("report")
      .insert({ review_id: reviewId, status: "ready" })
      .select("id")
      .single();
    await svc.from("report_section").insert({
      review_id: reviewId,
      report_id: (rep as { id: string }).id,
      kind: "methods",
      content: "Métodos do estudo.",
      edit_state: "deterministic",
    });

    await enqueueReportExportJob({ supabase: member }, reviewId, [
      "docx",
      "pdf",
    ]);
    await runReportExportWorkerWith(svc, reviewId);

    const { data: arts } = await svc
      .from("export_artifact")
      .select("format, storage_path")
      .eq("review_id", reviewId);
    const formats = (arts ?? [])
      .map((a) => (a as { format: string }).format)
      .sort();
    expect(formats).toEqual(["docx", "pdf"]);

    for (const a of (arts ?? []) as {
      format: string;
      storage_path: string;
    }[]) {
      const { data: blob } = await svc.storage
        .from("exports")
        .download(a.storage_path);
      const buf = Buffer.from(await blob!.arrayBuffer());
      if (a.format === "docx")
        expect(buf.subarray(0, 2).toString("ascii")).toBe("PK");
      if (a.format === "pdf")
        expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    }
  });
});
