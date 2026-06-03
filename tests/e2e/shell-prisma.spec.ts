import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

// Load .env.local so the service-role key is available in the test process.
loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Creates a fresh user via the browser signup flow and returns their reviewId. */
async function setupReview(
  page: import("@playwright/test").Page,
): Promise<{ reviewId: string }> {
  const ts = Date.now();
  const email = `e2e_shell_${ts}_${Math.floor(Math.random() * 1e6)}@example.com`;

  // 1. Sign up via UI — establishes an authenticated browser session.
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/, { timeout: 15_000 });

  // 2. Create a review via UI — also creates the membership row so RLS allows
  //    the browser user (and the audit-export route's member check) to pass.
  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão shell e2e");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 10_000 });

  const reviewId = page.url().split("/reviews/")[1]?.split("/")[0];
  if (!reviewId) throw new Error("reviewId não encontrado na URL");
  return { reviewId };
}

/**
 * Seeds four `record` rows that exercise every PRISMA bucket the bar shows:
 *   active          → conta só em Identificados
 *   duplicate_exact → Identificados + Duplicados
 *   included_ts     → Identificados + Triados (ts_decision terminal)
 *   excluded_ts     → Identificados + Triados (ts_decision terminal)
 * Expected counters: Identificados=4, Duplicados=1, Triados=2.
 * Service-role client bypasses RLS (the review was created by the browser user).
 */
function seed(reviewId: string) {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const mk = (
    state: string,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => {
    const title = `r-${state}-${Math.random()}`;
    return {
      review_id: reviewId,
      source_format: "ris",
      raw: { TI: title },
      metadata: { title: `r-${state}` },
      title_norm: title.toLowerCase().replace(/\s+/g, " ").trim(),
      corpus_state: state,
      ...extra,
    };
  };
  return svc
    .from("record")
    .insert([
      mk("active"),
      mk("duplicate_exact"),
      mk("included_ts", { ts_decision: "included" }),
      mk("excluded_ts", { ts_decision: "excluded" }),
    ]);
}

test("shell mostra trilho + PRISMA número-a-número (US7/SC-004)", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const { reviewId } = await setupReview(page);
  const { error } = await seed(reviewId);
  expect(error).toBeNull();

  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);

  // PRISMA bar é a fonte única dos contadores (SC-004); texto concatena
  // label + ": " + número dentro da região aria-live.
  const prisma = page.getByLabel("Contadores PRISMA");
  await expect(prisma).toContainText("Identificados: 4", { timeout: 15_000 });
  await expect(prisma).toContainText("Duplicados: 1");
  await expect(prisma).toContainText("Triados: 2");

  // Trilho de fases: contém "Importar" e tem exatamente UMA fase em curso.
  const rail = page.getByRole("navigation", { name: "Trilho de fases" });
  await expect(rail).toContainText("Importar");
  await expect(rail.locator("[aria-current='step']")).toHaveCount(1);
});

test("export de auditoria entrega JSON e CSV (FR-035/SC-006)", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const { reviewId } = await setupReview(page);
  const { error } = await seed(reviewId);
  expect(error).toBeNull();

  // Visita o workbench para garantir cookies de auth carregados no contexto.
  await page.goto(`/reviews/${reviewId}/workbench`);

  // page.request compartilha os cookies de auth do browser ⇒ a guarda de
  // membro da rota passa.
  const jsonResp = await page.request.get(
    `/reviews/${reviewId}/audit/export?format=json`,
  );
  expect(jsonResp.status()).toBe(200);
  expect(jsonResp.headers()["content-disposition"]).toContain(".json");
  const jsonText = await jsonResp.text();
  expect(() => JSON.parse(jsonText)).not.toThrow();

  const csvResp = await page.request.get(
    `/reviews/${reviewId}/audit/export?format=csv`,
  );
  expect(csvResp.status()).toBe(200);
  expect(csvResp.headers()["content-disposition"]).toContain(".csv");
  expect(await csvResp.text()).toContain("id,created_at,actor_type");
});

test("estado de fila reabre no mesmo filtro por URL (FR-037)", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const { reviewId } = await setupReview(page);
  const { error } = await seed(reviewId);
  expect(error).toBeNull();

  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);

  const filter = page.getByLabel("Filtrar a fila");
  await expect(filter).toBeVisible({ timeout: 15_000 });
  await filter.selectOption("undecided");
  await expect(page).toHaveURL(/qfilter=undecided/);

  // Reabrir pela mesma URL reidrata o filtro a partir do query param.
  await page.goto(page.url());
  await expect(page.getByLabel("Filtrar a fila")).toHaveValue("undecided");
});
