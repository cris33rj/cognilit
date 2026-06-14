// tests/e2e/report.spec.ts
//
// US3 — Relatório, full UI path through the server action.
// Regression guard for the "not a member" bug: generateReport must enqueue
// create_report_draft_job with the member Supabase client (auth.uid() present →
// is_review_member true). If the service-role admin client were used instead,
// auth.uid() would be NULL → is_review_member false → raise 'not a member'.
// Integration tests can't catch it because they call enqueueReportDraftJob with a
// member client directly; only the real server action exercises the client choice —
// hence this e2e.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "senha-teste-123";

async function signUpAndCreateReview(page: import("@playwright/test").Page) {
  const email = `e2e_report_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/, { timeout: 15_000 });
  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão relatório e2e");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 10_000 });
  const reviewId = page.url().split("/reviews/")[1]!.split("/")[0]!;
  return { email, reviewId };
}

// Seed one included_ft record with a ratified extraction_value so that
// deterministic report sections (Métodos/Resultados/Desvios) have real data.
// Uses the same pattern as synthesis.spec.ts: service-role for DB rows,
// member client for RPCs gated on is_review_member.
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
      metadata: { title: "Estudo Relatório e2e" },
      title_norm: "Estudo Relatório e2e",
    })
    .select("id")
    .single();
  if (rErr) throw new Error(`record: ${rErr.message}`);

  const { error: vErr } = await svc.from("extraction_value").insert({
    review_id: reviewId,
    record_id: (rec as { id: string }).id,
    field_id: fieldId,
    state: "accepted",
    final_value: {
      value: "resultado de Amostra",
      source_span: null,
      page: 1,
    },
  });
  if (vErr) throw new Error(`value: ${vErr.message}`);
}

test("relatório: membro gera relatório sem erro 'not a member' (US3)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { email, reviewId } = await signUpAndCreateReview(page);
  await seedCandidate(email, reviewId);

  await page.goto(`/reviews/${reviewId}/report`);
  await expect(page.getByRole("heading", { name: "Relatório" })).toBeVisible();

  // Before generation the empty-state placeholder is shown
  await expect(page.getByText("Gere o relatório para começar.")).toBeVisible();

  // Click "Gerar relatório" — calls generateReport server action:
  // enqueueReportDraftJob with MEMBER client + runReportDraftWorkerWith with ADMIN + MockLLM (no BYOK).
  await page.getByRole("button", { name: "Gerar relatório" }).click();

  // The fix: member client → is_review_member true → no 'not a member' error.
  // ReportRunner sets info text "Relatório gerado." when the action resolves.
  await expect(page.getByText("Relatório gerado.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("not a member")).toHaveCount(0);

  // Reload to trigger Server Component re-render now that revalidatePath was called.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Relatório" })).toBeVisible();

  // All six report sections must be present after generation.
  await expect(page.getByRole("heading", { name: "Métodos" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "Resultados" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("heading", { name: "Discussão" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("heading", { name: "Conclusão" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("heading", { name: "Declaração de uso de IA" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("heading", { name: "Desvios do protocolo" }),
  ).toBeVisible({ timeout: 10_000 });

  // The PRISMA flowchart is embedded below Resultados.
  await expect(
    page.getByRole("heading", { name: "Fluxograma PRISMA 2020" }),
  ).toBeVisible();

  // Once a report exists, the runner shows "Regerar tudo (com IA)" (not "Gerar relatório").
  await expect(
    page.getByRole("button", { name: "Regerar tudo (com IA)" }),
  ).toBeVisible();

  // At least one edit-state badge should be visible (sections carry [automática] / [rascunho IA]).
  // "automática" is the deterministic badge; "rascunho IA" for LLM-drafted sections.
  const badges = page
    .locator("span")
    .filter({ hasText: /automática|rascunho IA/ });
  await expect(badges.first()).toBeVisible();
});
