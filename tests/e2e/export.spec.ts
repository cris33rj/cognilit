// tests/e2e/export.spec.ts
//
// US5 (Fatia 5) — Exportação MD/BibTeX/RIS, full UI path through the server action.
// Exercises the real client-role split that integration tests cannot: enqueueExport
// must enqueue with the MEMBER client (is_review_member → true) and run the worker with
// the ADMIN client (Storage upload + export_artifact). A swap would surface here as a
// 'not a member' failure or a missing artifact. Mirrors report.spec.ts setup.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "senha-teste-123";

async function signUpAndCreateReview(page: import("@playwright/test").Page) {
  const email = `e2e_export_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/, { timeout: 15_000 });
  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão exportação e2e");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 10_000 });
  const reviewId = page.url().split("/reviews/")[1]!.split("/")[0]!;
  return { email, reviewId };
}

// Seed one included_ft record with a ratified extraction_value so the report has real
// content and BibTeX/RIS cover at least one study. Same pattern as report.spec.ts.
async function seedCandidate(email: string, reviewId: string) {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const member = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInErr } = await member.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInErr) throw new Error(`signIn: ${signInErr.message}`);

  await member.rpc("ensure_extraction_form", { p_review_id: reviewId });
  const { data: field, error: fErr } = await member.rpc(
    "add_extraction_field",
    {
      p_review_id: reviewId,
      p_name: "Amostra",
      p_type: "text",
      p_options: null,
    },
  );
  if (fErr) throw new Error(`add_field: ${fErr.message}`);
  const fieldId = (field as { id: string }).id;

  const { data: rec, error: rErr } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      corpus_state: "included_ft",
      source_format: "ris",
      raw: {},
      metadata: {
        title: "Estudo Exportação e2e",
        authors: ["Silva, A"],
        year: 2021,
      },
      title_norm: "Estudo Exportação e2e",
    })
    .select("id")
    .single();
  if (rErr) throw new Error(`record: ${rErr.message}`);

  const { error: vErr } = await svc.from("extraction_value").insert({
    review_id: reviewId,
    record_id: (rec as { id: string }).id,
    field_id: fieldId,
    state: "accepted",
    final_value: { value: "resultado de Amostra", source_span: null, page: 1 },
  });
  if (vErr) throw new Error(`value: ${vErr.message}`);
}

test("exportação: membro gera MD/BibTeX/RIS e baixa os artefatos (US5)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { email, reviewId } = await signUpAndCreateReview(page);
  await seedCandidate(email, reviewId);

  // Report must exist for the ExportPanel to render (gated by report existence).
  await page.goto(`/reviews/${reviewId}/report`);
  await page.getByRole("button", { name: "Gerar relatório" }).click();
  await expect(page.getByText("Relatório gerado.")).toBeVisible({
    timeout: 30_000,
  });
  await page.reload();

  // ExportPanel is present.
  await expect(page.getByRole("heading", { name: "Exportação" })).toBeVisible();

  // Select all three formats (Markdown is checked by default).
  await page.getByLabel("BibTeX (.bib)").check();
  await page.getByLabel("RIS (.ris)").check();

  // Run the export — calls enqueueExport (member enqueue + admin worker, inline).
  await page.getByRole("button", { name: "Exportar" }).click();
  await expect(page.getByText("Exportação concluída.")).toBeVisible({
    timeout: 30_000,
  });
  // No membership failure leaked through.
  await expect(page.getByText("not a member")).toHaveCount(0);

  // revalidatePath was called server-side; reload to re-render the artifact list.
  await page.reload();

  // One download link per format.
  await expect(
    page.getByRole("link", { name: "Baixar Markdown" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Baixar BibTeX" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Baixar RIS" })).toBeVisible();

  // The Markdown link actually downloads a .md attachment from the bucket.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Baixar Markdown" }).first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
});

test("SC-005: membro exporta os 5 formatos numa única operação (US5)", async ({
  page,
}) => {
  // DOCX/PDF include flowchart rasterization — generous timeout.
  test.setTimeout(180_000);
  const { email, reviewId } = await signUpAndCreateReview(page);
  await seedCandidate(email, reviewId);

  // Report must exist for the ExportPanel to render (gated by report existence).
  await page.goto(`/reviews/${reviewId}/report`);
  await page.getByRole("button", { name: "Gerar relatório" }).click();
  await expect(page.getByText("Relatório gerado.")).toBeVisible({
    timeout: 30_000,
  });
  await page.reload();

  // ExportPanel is present.
  await expect(page.getByRole("heading", { name: "Exportação" })).toBeVisible();

  // Select all five formats. Labels set by Task 6:
  //   "DOCX", "PDF", "Markdown (.md)", "BibTeX (.bib)", "RIS (.ris)"
  // Markdown (.md) may already be checked by default; check() is idempotent.
  await page.getByLabel("DOCX").check();
  await page.getByLabel("PDF").check();
  await page.getByLabel("Markdown (.md)").check();
  await page.getByLabel("BibTeX (.bib)").check();
  await page.getByLabel("RIS (.ris)").check();

  // Single Exportar click triggers all five formats in one enqueue.
  await page.getByRole("button", { name: "Exportar" }).click();
  // DOCX/PDF generation + flowchart PNG rasterization is heavier than MD/BibTeX/RIS.
  await expect(page.getByText("Exportação concluída.")).toBeVisible({
    timeout: 120_000,
  });
  // No membership failure leaked through.
  await expect(page.getByText("not a member")).toHaveCount(0);

  // revalidatePath was called server-side; reload to re-render the artifact list.
  await page.reload();

  // One download link per format — five total.
  await expect(page.getByRole("link", { name: "Baixar DOCX" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Baixar PDF" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Baixar Markdown" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Baixar BibTeX" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Baixar RIS" })).toBeVisible();

  // Verify DOCX binary signature (PK ZIP magic bytes — same download pattern as US5).
  const [docxDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Baixar DOCX" }).first().click(),
  ]);
  expect(docxDownload.suggestedFilename()).toMatch(/\.docx$/);
  const docxPath = await docxDownload.path();
  if (docxPath) {
    const { readFileSync } = await import("fs");
    const docxBytes = readFileSync(docxPath);
    // PK ZIP magic: 0x50 0x4B
    expect(docxBytes[0]).toBe(0x50);
    expect(docxBytes[1]).toBe(0x4b);
  }

  // Verify PDF binary signature (%PDF-).
  const [pdfDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Baixar PDF" }).first().click(),
  ]);
  expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
  const pdfPath = await pdfDownload.path();
  if (pdfPath) {
    const { readFileSync } = await import("fs");
    const pdfBytes = readFileSync(pdfPath);
    // %PDF- magic: 0x25 0x50 0x44 0x46 0x2D
    const pdfMagic = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(pdfBytes.slice(0, 5)).toEqual(pdfMagic);
  }
});
