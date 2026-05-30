import { test, expect } from "@playwright/test";

test("home renderiza o nome do produto", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Cognilit")).toBeVisible();
});
