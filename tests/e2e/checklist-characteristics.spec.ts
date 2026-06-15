// tests/e2e/checklist-characteristics.spec.ts
//
// US4 — Checklist PRISMA 2020 + Tabela de características, full UI path.
// After generating the report, the report page must render:
//   - the "Checklist PRISMA 2020" panel (27-item snapshot) with status badges,
//   - the "Características dos estudos" table (1 row per included_ft study, columns
//     = extraction fields), showing the RATIFIED value (.value extracted from the
//     structured final_value {value, source_span, page} — NOT "[object Object]").
// Mirrors the harness of report.spec.ts (member client for gated RPCs, service-role
// for DB rows; MockLLM via no-BYOK path in the server action).
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "senha-teste-123";

async function signUpAndCreateReview(page: import("@playwright/test").Page) {
  const email = `e2e_checklist_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/, { timeout: 15_000 });
  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão checklist e2e");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 10_000 });
  const reviewId = page.url().split("/reviews/")[1]!.split("/")[0]!;
  return { email, reviewId };
}

// One included_ft study + one ratified extraction_value whose final_value follows
// the {value, source_span, page} contract, so the characteristics table has a real
// row/cell and item 10/17 (characteristics) compute as "met".
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
      metadata: { title: "Estudo Checklist e2e" },
      title_norm: "Estudo Checklist e2e",
    })
    .select("id")
    .single();
  if (rErr) throw new Error(`record: ${rErr.message}`);

  const { error: vErr } = await svc.from("extraction_value").insert({
    review_id: reviewId,
    record_id: (rec as { id: string }).id,
    field_id: fieldId,
    state: "accepted",
    final_value: { value: "120 pacientes", source_span: null, page: 1 },
  });
  if (vErr) throw new Error(`value: ${vErr.message}`);
}

test("checklist + características aparecem no relatório gerado (US4)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { email, reviewId } = await signUpAndCreateReview(page);
  await seedCandidate(email, reviewId);

  await page.goto(`/reviews/${reviewId}/report`);
  await page.getByRole("button", { name: "Gerar relatório" }).click();
  await expect(page.getByText("Relatório gerado.")).toBeVisible({
    timeout: 30_000,
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Relatório" })).toBeVisible();

  // ── Checklist PRISMA 2020 panel (scoped to its <section>) ────────────────
  const checklist = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Checklist PRISMA 2020" }),
    });
  await expect(
    checklist.getByRole("heading", { name: "Checklist PRISMA 2020" }),
  ).toBeVisible({ timeout: 30_000 });
  // A met item from a deterministic section (item 5 — Critérios de elegibilidade).
  await expect(checklist.getByText("Critérios de elegibilidade")).toBeVisible();
  // not_applicable items exist (Risco de Viés / Certeza OFF — D19).
  await expect(checklist.getByText("Não aplicável").first()).toBeVisible();
  // met status badge is present.
  await expect(checklist.getByText("Atendido").first()).toBeVisible();

  // ── Tabela de características (scoped to its <section>) ────────────────────
  const chars = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Características dos estudos" }),
  });
  await expect(
    chars.getByRole("heading", { name: "Características dos estudos" }),
  ).toBeVisible();
  // Column header = extraction field name.
  await expect(
    chars.getByRole("columnheader", { name: "Amostra" }),
  ).toBeVisible();
  // One row per included_ft study (the seeded study title).
  await expect(chars.getByText("Estudo Checklist e2e")).toBeVisible();
  // Cell shows the ratified .value, NOT the raw {value,...} object.
  await expect(chars.getByText("120 pacientes")).toBeVisible();
  await expect(page.getByText("[object Object]")).toHaveCount(0);
});
