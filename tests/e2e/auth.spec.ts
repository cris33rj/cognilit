import { test, expect } from "@playwright/test";

function uniqueEmail() {
  return `user_${Date.now()}@example.com`;
}

test("cadastro autentica e leva à lista de Revisões", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(uniqueEmail());
  await page.getByLabel("Senha").fill("senha-super-secreta-123");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/reviews/);
  await expect(
    page.getByRole("heading", { name: "Minhas Revisões" }),
  ).toBeVisible();
});

test("rota protegida sem sessão redireciona ao login", async ({ page }) => {
  await page.goto("/reviews");
  await expect(page).toHaveURL(/\/login/);
});
