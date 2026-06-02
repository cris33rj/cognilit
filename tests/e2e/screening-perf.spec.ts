import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { SCREENING_PERF_BUDGET } from "../../src/lib/screening/config";

// Load .env.local so the service-role key is available in the Playwright
// process (Playwright does NOT use Next.js env loading by default).
loadEnvConfig(process.cwd());

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Creates a fresh user via the browser signup flow and returns their reviewId. */
async function setupPerfUser(
  page: import("@playwright/test").Page,
): Promise<{ reviewId: string }> {
  const ts = Date.now();
  const email = `e2e_perf_${ts}@example.com`;

  // 1. Sign up via UI — establishes an authenticated browser session.
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/, { timeout: 15_000 });

  // 2. Create a review via UI — this also creates the membership row so RLS
  //    allows the browser user to query records inside this review.
  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão perf e2e");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 10_000 });

  const reviewId = page.url().split("/reviews/")[1].split("/")[0];
  return { reviewId };
}

/**
 * Seeds ~5000 `record` rows into `reviewId` using the service-role client
 * (bypasses RLS — the review was created by the browser user so membership
 * already exists; service client just skips the RLS check on insert).
 *
 * Batches of 500 rows to stay well within Supabase default payload limits.
 */
async function seedRecords(reviewId: string, total = 5000): Promise<void> {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const CHUNK = 500;
  const chunks = Math.ceil(total / CHUNK);

  for (let c = 0; c < chunks; c++) {
    const size = c < chunks - 1 ? CHUNK : total - c * CHUNK;
    const rows = Array.from({ length: size }, (_, i) => {
      const idx = c * CHUNK + i + 1;
      const title = `Perf record ${idx} — automated e2e seed`;
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
      throw new Error(
        `Seed chunk ${c + 1}/${chunks} failed: ${error.message} (${error.code})`,
      );
    }
  }
}

test("fila com ~5.000 registros: render inicial rápido e DOM virtualizado", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // ── 1. Create user + review via browser (establishes membership/RLS). ──
  const { reviewId } = await setupPerfUser(page);
  // reviewId is used both for seeding and for browser navigation below.

  // ── 2. Seed ~5000 records via service client (fast, bypasses UI). ──
  await seedRecords(reviewId, 5000);

  // ── 3. Navigate to workbench in title_abstract mode and measure render. ──
  const t0 = Date.now();
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);

  const grid = page.getByRole("grid", { name: /fila de triagem/i });
  await expect(grid).toBeVisible({
    timeout: SCREENING_PERF_BUDGET.initialRenderMs * 3,
  });

  const elapsed = Date.now() - t0;
  // Generous e2e margin: budget × 3 (protocol overhead on top of UX target).
  expect(elapsed).toBeLessThan(SCREENING_PERF_BUDGET.initialRenderMs * 3);

  // ── 4. Virtualization invariant: DOM rows ≪ 5000. ──
  // This is the hard invariant — if virtualisation is working, the table
  // must render only the visible viewport rows (typically 20–60), never all
  // 5000. We allow up to 200 to absorb any overscan or header/footer rows.
  const rowCount = await page.getByRole("row").count();
  expect(rowCount).toBeLessThan(200);

  // ── 5. Keyboard navigation responds without hanging. ──
  await grid.focus();
  const n0 = Date.now();
  await page.keyboard.press("j");
  const keyElapsed = Date.now() - n0;
  // Generous margin: budget × 10 (e2e protocol latency for a single keypress).
  expect(keyElapsed).toBeLessThan(SCREENING_PERF_BUDGET.keyNavMs * 10);
});
