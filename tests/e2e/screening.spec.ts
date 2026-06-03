import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Sets up a fresh user + review + imports sample.ris (2 records, no dupes)
 * and runs the import worker, leaving corpus records in state 'active'.
 * Returns the reviewId extracted from the URL.
 */
async function setupScreeningCorpus(page: Page): Promise<string> {
  const email = `e2e_screening_${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/);

  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão e2e triagem");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);

  // Extract reviewId from URL before navigating further.
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

test("triagem T/R: incluir por teclado e ver contador subir", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const reviewId = await setupScreeningCorpus(page);

  // Navigate directly to title_abstract mode.
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);

  // The screening grid must be visible.
  const grid = page.getByRole("grid", { name: /fila de triagem/i });
  await expect(grid).toBeVisible({ timeout: 15_000 });

  // Wait for queue to load (at least one row visible).
  await expect(page.getByRole("row").first()).toBeVisible({ timeout: 10_000 });

  // Press 'i' — keyboard handler is on window, so just press the key.
  await page.keyboard.press("i");

  // After the decision, TanStack Query invalidates the queue (client-side).
  // The "Desfazer" button appears in the decided row, confirming the decision landed.
  await expect(
    page.getByRole("button", { name: /desfazer/i }).first(),
  ).toBeVisible({ timeout: 10_000 });

  // Navigate away and back so the server component re-renders with fresh counter.
  await page.goto(`/reviews/${reviewId}/workbench?mode=import`);
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);

  // PRISMA bar "Triados" counter must now show ≥1.
  await expect(page.getByLabel("Contadores PRISMA")).toContainText(
    /Triados: [1-9]/,
    { timeout: 10_000 },
  );
});

test("Texto completo: excluir exige motivo (FR-025)", async ({ page }) => {
  test.setTimeout(90_000);

  const reviewId = await setupScreeningCorpus(page);

  // full_text queue only shows records in corpus_state 'included_ts' (i.e., records
  // that were included in title_abstract screening). We must first include at least
  // one record in title_abstract mode before the full_text queue is non-empty.
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);
  const gridTA = page.getByRole("grid", { name: /fila de triagem/i });
  await expect(gridTA).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("row").first()).toBeVisible({ timeout: 10_000 });

  // Include the focused row via keyboard.
  await page.keyboard.press("i");

  // Wait for the decision to land (Desfazer button appears client-side).
  await expect(
    page.getByRole("button", { name: /desfazer/i }).first(),
  ).toBeVisible({ timeout: 10_000 });

  // Now navigate to full_text mode — the included record is now in the queue.
  await page.goto(`/reviews/${reviewId}/workbench?mode=full_text`);

  const grid = page.getByRole("grid", { name: /fila de triagem/i });
  await expect(grid).toBeVisible({ timeout: 15_000 });

  // Wait for queue to load (at least one row visible).
  await expect(page.getByRole("row").first()).toBeVisible({ timeout: 10_000 });

  // Press 'e' — in full_text mode without a reason selected, this triggers
  // pendingExclude state which reveals the reason combobox (FR-025 gate).
  await page.keyboard.press("e");

  // The exclusion reason select must appear.
  await expect(
    page.getByRole("combobox", { name: /motivo da exclusão/i }),
  ).toBeVisible({ timeout: 10_000 });
});
