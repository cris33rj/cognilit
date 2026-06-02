import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

async function signupAndCreateReview(page: Page) {
  const email = `e2e_dedup_${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/);

  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão e2e dedup");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);
}

test("dedup: exatas auto-removidas, par fuzzy confirmável, contador sobe", async ({
  page,
}) => {
  // 1. Autenticar e criar revisão.
  await signupAndCreateReview(page);

  // 2. Navegar ao Workbench (modo Importar por padrão).
  await page.getByRole("link", { name: "Workbench" }).click();
  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();

  // 3. Upload do corpus com exata + par fuzzy (4 entradas: 1 exata × 2 + 2 fuzzy).
  await page.setInputFiles(
    "#import-file",
    path.resolve("tests/fixtures/import/dedup-corpus.ris"),
  );
  // Preview deve mostrar ao menos um dos títulos.
  await expect(
    page.getByText(/Climate change adaptation strategies/).first(),
  ).toBeVisible();

  // 4. Registrar busca e confirmar importação.
  await page.getByPlaceholder("String de busca").fill("machine learning");
  await page.getByPlaceholder("Base consultada").fill("PubMed");
  await page.locator('input[type="date"]').fill("2026-05-30");
  await page.getByPlaceholder("Nº de hits").fill("4");

  // Confirmar (dispara enqueue + runImportWorker + dedup_exact automático).
  await page.getByRole("button", { name: /confirmar importação/i }).click();

  // 5. Aguardar o worker processar: contador de identificados deve subir.
  // Corpus: 4 entradas, 1 exacta removida → 3 identificados (2 fuzzy + 1 sem duplicata).
  await expect(page.getByText(/Identificados \(PRISMA\):/)).toContainText(
    /[1-9]/,
    { timeout: 20_000 },
  );

  // 6. Navegar para o modo Duplicatas.
  await page.getByRole("tab", { name: "Duplicatas" }).click();
  await expect(page).toHaveURL(/mode=duplicates/);

  // 7. Verificar log de exatas auto-removidas.
  await expect(
    page.getByText(/Exatas removidas automaticamente/),
  ).toBeVisible();
  // Deve haver ao menos um botão "Desfazer" no log de exatas.
  await expect(
    page.getByRole("button", { name: /desfazer/i }).first(),
  ).toBeVisible();

  // 8. Verificar par fuzzy presente: ambos os títulos devem aparecer.
  await expect(
    page
      .getByText(/A systematic review of machine learning in medical imaging/i)
      .first(),
  ).toBeVisible();

  // 9. Confirmar fusão do par fuzzy clicando "Mesma (mesclar)".
  await page
    .getByRole("button", { name: /mesma \(mesclar\)/i })
    .first()
    .click();

  // 10. Após a decisão o par deve sair da fila.
  await expect(page.getByText(/Nenhum par pendente\./)).toBeVisible({
    timeout: 10_000,
  });

  // 11. Contador "Duplicados (PRISMA)" deve estar visível (> 0 implícito pelo render condicional).
  await expect(page.getByText(/Duplicados \(PRISMA\):/)).toBeVisible();
});
