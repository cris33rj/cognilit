// tests/e2e/prisma-flowchart.spec.ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function setupReview(page: import("@playwright/test").Page) {
  const email = `e2e_prisma_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/, { timeout: 15_000 });
  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão fluxograma e2e");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 10_000 });
  return page.url().split("/reviews/")[1]!.split("/")[0]!;
}

function seed(reviewId: string) {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const mk = (state: string, extra: Record<string, unknown> = {}) => ({
    review_id: reviewId,
    source_format: "ris",
    raw: { TI: `r-${state}-${Math.random()}` },
    metadata: { title: `r-${state}` },
    corpus_state: state,
    ...extra,
  });
  return svc
    .from("record")
    .insert([
      mk("active"),
      mk("duplicate_exact"),
      mk("included_ts", { ts_decision: "included" }),
      mk("excluded_ts", { ts_decision: "excluded" }),
    ]);
}

test("fluxograma PRISMA: visualiza e baixa SVG/PNG (US2)", async ({ page }) => {
  test.setTimeout(90_000);
  const reviewId = await setupReview(page);
  const { error } = await seed(reviewId);
  expect(error).toBeNull();

  await page.goto(`/reviews/${reviewId}/prisma`);
  const fig = page.getByRole("img", { name: "Fluxograma PRISMA 2020" });
  await expect(fig).toBeVisible({ timeout: 15_000 });
  await expect(fig).toContainText("n = 4"); // Identificados

  const svgResp = await page.request.get(
    `/reviews/${reviewId}/prisma/export?format=svg`,
  );
  expect(svgResp.status()).toBe(200);
  expect(svgResp.headers()["content-type"]).toContain("image/svg+xml");
  expect(svgResp.headers()["content-disposition"]).toContain(".svg");

  const pngResp = await page.request.get(
    `/reviews/${reviewId}/prisma/export?format=png`,
  );
  expect(pngResp.status()).toBe(200);
  expect(pngResp.headers()["content-type"]).toContain("image/png");
  expect(pngResp.headers()["content-disposition"]).toContain(".png");
});
