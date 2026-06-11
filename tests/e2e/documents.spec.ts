import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Sets up a fresh user + review + imports sample.ris (2 records) and waits for
 * the import worker to finish. Returns the reviewId.
 * Mirrors setupScreeningCorpus in screening.spec.ts exactly.
 */
async function setupCorpus(page: Page): Promise<string> {
  const email = `e2e_docs_${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/);

  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão e2e PDFs");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);

  const reviewId = page.url().split("/reviews/")[1]?.split("/")[0];
  if (!reviewId) throw new Error("reviewId não encontrado na URL");

  // Navigate to Workbench (import mode).
  await page.getByRole("link", { name: "Importar" }).click();
  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();

  // Upload sample.ris (2 records, no duplicates).
  await page.setInputFiles(
    "#import-file",
    path.resolve("tests/fixtures/import/sample.ris"),
  );
  // Wait for client-side preview to render.
  await expect(page.getByText("Aprendizagem ativa em sala")).toBeVisible();

  // Fill search metadata.
  await page.getByPlaceholder("String de busca").fill("active learning e2e");
  await page.getByPlaceholder("Base consultada").fill("PubMed");
  await page.locator('input[type="date"]').fill("2026-05-30");
  await page.getByPlaceholder("Nº de hits").fill("2");

  // Confirm import — triggers enqueue + runImportWorker.
  await page.getByRole("button", { name: /confirmar importação/i }).click();

  // Wait for worker to finish: PRISMA bar "Identificados" shows 2.
  await expect(page.getByLabel("Contadores PRISMA")).toContainText(
    "Identificados: 2",
    { timeout: 20_000 },
  );

  return reviewId;
}

test("anexa um PDF a um estudo no modo Texto completo (US1)", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const reviewId = await setupCorpus(page);

  // Include at least one record in title/abstract so it enters the full_text queue.
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);
  const gridTA = page.getByRole("grid", { name: /fila de triagem/i });
  await expect(gridTA).toBeVisible({ timeout: 15_000 });
  // Wait for at least one row to load.
  await expect(page.getByRole("row").first()).toBeVisible({ timeout: 10_000 });

  // Press 'i' to include the focused record (keyboard-first, FR-023).
  await page.keyboard.press("i");

  // Desfazer button confirms decision landed (client-side invalidation).
  await expect(
    page.getByRole("button", { name: /desfazer/i }).first(),
  ).toBeVisible({ timeout: 10_000 });

  // Navigate to full_text mode — the included record is in the queue.
  await page.goto(`/reviews/${reviewId}/workbench?mode=full_text`);
  const grid = page.getByRole("grid", { name: /fila de triagem/i });
  await expect(grid).toBeVisible({ timeout: 15_000 });

  // Wait for queue to load (at least one row visible).
  // focusIdx starts at 0, so the DocumentsPanel receives a non-null recordId automatically.
  await expect(page.getByRole("row").first()).toBeVisible({ timeout: 10_000 });

  // DocumentsPanel heading must be visible once a row is focused.
  await expect(page.getByText("PDFs do estudo")).toBeVisible({
    timeout: 10_000,
  });

  // Attach the PDF fixture via the labelled file input.
  await page
    .getByLabel("Anexar PDF")
    .setInputFiles(path.resolve("tests/fixtures/sample.pdf"));

  // After upload: the filename appears in the list.
  await expect(page.getByText("sample.pdf")).toBeVisible({ timeout: 15_000 });

  // And a processing-status label appears next to it (queued → processing → text_ready).
  await expect(
    page.getByText(/enfileirado|processando|texto pronto/),
  ).toBeVisible({ timeout: 15_000 });
});
