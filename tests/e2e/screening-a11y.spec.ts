import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

// Load .env.local so the service-role key is available in the test process.
loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Creates a fresh user via the browser signup flow and returns their reviewId. */
async function setupA11yUser(
  page: import("@playwright/test").Page,
): Promise<{ reviewId: string }> {
  const ts = Date.now();
  const email = `e2e_a11y_${ts}@example.com`;

  // 1. Sign up via UI — establishes an authenticated browser session.
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/, { timeout: 15_000 });

  // 2. Create a review via UI — this also creates the membership row so RLS
  //    allows the browser user to query records inside this review.
  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão a11y e2e");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 10_000 });

  const reviewId = page.url().split("/reviews/")[1]?.split("/")[0];
  if (!reviewId) throw new Error("reviewId não encontrado na URL");
  return { reviewId };
}

/**
 * Seeds a handful of `active` record rows into `reviewId` using the
 * service-role client (bypasses RLS — the review was created by the browser
 * user so membership already exists; service client just skips the RLS check
 * on insert).
 */
async function seedActiveRecords(reviewId: string, count = 5): Promise<void> {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const rows = Array.from({ length: count }, (_, i) => {
    const title = `A11y record ${i + 1} — automated e2e seed`;
    return {
      review_id: reviewId,
      source_format: "ris",
      raw: { TI: title, PY: "2024", AU: ["Author, Test"] },
      metadata: { title, year: "2024" },
      title_norm: title.toLowerCase().replace(/\s+/g, " ").trim(),
      corpus_state: "active",
    };
  });

  const { error } = await svc.from("record").insert(rows);
  if (error) {
    throw new Error(`Seed failed: ${error.message} (${error.code})`);
  }
}

test("workbench de triagem é operável por teclado e expõe ARIA (SC-013)", async ({
  page,
}) => {
  test.setTimeout(90_000);

  // ── 1. Create user + review via browser (establishes membership/RLS). ──
  const { reviewId } = await setupA11yUser(page);

  // ── 2. Seed a handful of active records via service client. ──
  await seedActiveRecords(reviewId, 5);

  // ── 3. Navigate to title_abstract mode. ──
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);

  // ── 4. Assert role="grid" named /fila de triagem/i is visible. ──
  const grid = page.getByRole("grid", { name: /fila de triagem/i });
  await expect(grid).toBeVisible({ timeout: 15_000 });

  // Wait for at least one queue row to be rendered.
  await expect(page.getByRole("row").first()).toBeVisible({
    timeout: 10_000,
  });

  // ── 5. Assert role="tablist" named /modos do workbench/i is visible. ──
  await expect(
    page.getByRole("tablist", { name: /modos do workbench/i }),
  ).toBeVisible();

  // ── 6. Full keyboard operation: focus grid, press j then i. ──
  await grid.focus();
  // 'j' navigates down one row — must not throw or hang.
  await page.keyboard.press("j");
  // 'i' decides "include" on the focused row — must not throw or hang.
  await page.keyboard.press("i");

  // ── 7. Shortcut legend text /atalhos de teclado/i is visible (FR-041). ──
  await expect(page.getByText(/atalhos de teclado/i)).toBeVisible();

  // ── 8. Density combobox named /densidade da fila/i is visible (FR-040). ──
  await expect(
    page.getByRole("combobox", { name: /densidade da fila/i }),
  ).toBeVisible();

  // ── 9. Accessibility snapshot returns a truthy tree. ──
  // page.accessibility was removed in Playwright 1.47+; use ariaSnapshot() instead.
  const snapshot = await page.locator("body").ariaSnapshot();
  expect(snapshot).toBeTruthy();
});
