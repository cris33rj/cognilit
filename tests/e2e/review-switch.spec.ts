import { test, expect } from "@playwright/test";

test("cria duas Revisões e troca a ativa pelo seletor", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(`switch_${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("senha-super-secreta-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/);

  for (const title of ["Revisão Alpha", "Revisão Beta"]) {
    await page.getByRole("link", { name: "Nova Revisão" }).click();
    await page.getByLabel("Título da Revisão").fill(title);
    await page.getByRole("button", { name: "Criar Revisão" }).click();
    await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);
  }

  // No contexto de uma Revisão, o seletor mostra a ativa e permite trocar.
  await expect(
    page.getByRole("heading", { name: "Revisão Beta" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Revisão ativa" }).selectOption({
    label: "Revisão Alpha",
  });
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "Revisão Alpha" }),
  ).toBeVisible();
});
