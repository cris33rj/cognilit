import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

async function signupAndCreateReview(page: Page) {
  const email = `e2e_imp_${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/);

  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão e2e import");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);
}

test("importar RIS: preview, registrar busca, confirmar, identificados sobem", async ({
  page,
}) => {
  await signupAndCreateReview(page);
  await page.getByRole("link", { name: "Importar" }).click();
  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();

  // A partir da Fatia 6 o shell expõe todas as fases do pipeline como abas
  // navegáveis (o trilho de fases é a fonte única da navegação por etapa);
  // Duplicatas, Título/Resumo e Texto completo já são links habilitados.
  await expect(
    page.getByRole("tab", { name: "Duplicatas" }),
  ).not.toHaveAttribute("aria-disabled", "true");

  // Upload da fixture RIS → preview client-side.
  await page.setInputFiles(
    "#import-file",
    path.resolve("tests/fixtures/import/sample.ris"),
  );
  await expect(page.getByText("Aprendizagem ativa em sala")).toBeVisible();

  // Registrar busca.
  await page.getByPlaceholder("String de busca").fill("active learning");
  await page.getByPlaceholder("Base consultada").fill("ERIC");
  await page.locator('input[type="date"]').fill("2026-05-30");
  await page.getByPlaceholder("Nº de hits").fill("2");

  // Confirmar importação (dispara enqueue + runImportWorker).
  await page.getByRole("button", { name: /confirmar importação/i }).click();

  // O worker roda e o contador "Identificados" da barra PRISMA reflete o corpus.
  await expect(page.getByLabel("Contadores PRISMA")).toContainText(
    "Identificados: 2",
    { timeout: 15_000 },
  );
});
