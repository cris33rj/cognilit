# Fatia 6 — Shell, trilho de fases & PRISMA vivo + export de auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Escopo:** esta é a **Fatia 6 de 6** (última) do Marco 1 (`001-marco1-nucleo-fluxo`).
> Fronteiras, dependências e gate de cobertura em
> [.superpowers/slicing.md](./.superpowers/slicing.md). NÃO planejar/implementar o
> **fluxograma PRISMA renderizado** nem as **exportações DOCX/PDF/MD** (Marco 3 —
> spec §Out of Scope); aqui só **contadores** e **export da trilha de auditoria**.
> *(Os planos das Fatias 1–5 permanecem no histórico git — o plano da Fatia 5 estava
> neste arquivo no merge `a68914d` e anteriores.)*
>
> **Branch de trabalho:** `build/001-marco1-nucleo-fluxo/6-shell-prisma-auditoria`
> (criar via `superpowers:using-git-worktrees`). A sessão **NUNCA** faz `git merge`
> nem `git push` para a feature branch ou `main` — o merge é manual do desenvolvedor
> ao fim da fatia (CHECKPOINT 3).
>
> **⚠️ Antes de despachar subagentes:** comite este `IMPLEMENTATION_PLAN.md` (e o
> `slicing.md`) **dentro do worktree da fatia** antes de iniciar a execução —
> edições não-commitadas no checkout principal não são visíveis aos subagentes do
> worktree.

**Goal:** Fechar o Marco entregando a **moldura de orientação**: um **trilho de fases**
no shell da Revisão (feito/em curso/pendente/travado/opcional-desligado), uma **barra
PRISMA viva** ligada a uma **fonte única** (view `prisma_counter`) que bate número-a-número
com o corpus, **estado de fila de triagem reabrível por URL** (filtros/ordenação/seleção), e
**export da trilha de auditoria em JSON + CSV** onde toda reversão aparece.

**Architecture:** Espelha as Fatias 3–5. **Contadores vêm de views Postgres derivadas**
(`prisma_counter`, `prisma_exclusion_breakdown`) com `security_invoker = true` — a RLS das
tabelas-base (`record`, `exclusion_reason`) continua valendo; **fonte única** (SC-004),
nenhuma contagem ad-hoc nova. A camada TS (`src/lib/prisma/`, `src/lib/audit/`,
`src/lib/shell/`) só lê dados; o **export de auditoria** é um **Route Handler**
(`app/reviews/[reviewId]/audit/export/route.ts`) que aplica `is_review_member` e devolve
o arquivo. O **estado de fila na URL** é puro client-side: a fila já vem inteira e
virtualizada (Fatia 5); um módulo puro (`queue-url.ts`) serializa/aplica filtro+ordenação
em `searchParams`, sem refetch. **Nenhuma tabela nova; nenhuma mutação nova.** A Fatia 6 é
quase toda leitura derivada + UI de moldura.

**Tech Stack:** Next.js 14 App Router (Server Components + Route Handlers), TypeScript
strict, Supabase (Postgres views `security_invoker`, RLS), TanStack Query (polling de
jobs no shell — reuso de `JobProgress`), Tailwind 4, Vitest (unit + integration contra
Supabase local), Playwright (e2e).

---

## Mapa de contexto (verificado na base — leia antes de começar)

Fatos confirmados que ancoram os caminhos e padrões deste plano:

- **App Router na raiz:** páginas em `./app/...`; libs em `./src/lib/...`; componentes em
  `./src/components/...`. Aliases (`tsconfig.json` + `vitest.config.ts`):
  `@/* → ./src/*`, `@shared/* → ./supabase/functions/_shared/*`.
- **Migrations:** `supabase/migrations/000N_*.sql`, sequenciais `0001`→`0006`. A próxima é
  **`0007_prisma_audit.sql`**.
- **`corpus_state` (enum, `0003`):** `'imported','active','duplicate_exact','duplicate_fuzzy','excluded_ts','maybe_ts','included_ts','excluded_ft','included_ft'`.
  `record` tem `corpus_state`, `ts_decision` (`included|excluded|maybe`), `ft_decision`
  (`included|excluded`), `ft_exclusion_reason_id` (FK → `exclusion_reason`).
- **`audit_entry` (`0001`, append-only):** `id, review_id, actor_type, actor_id, action,
  entity, entity_id, before jsonb, after jsonb, created_at`. Índice `(review_id, created_at)`.
- **`ai_usage` (`0002`):** `id, review_id, phase, tokens_in, tokens_out, cost jsonb, job_id,
  created_at`.
- **`job` (`0003`):** `id, review_id, type ('import_parse'|'ai_screening_batch'), status, progress, created_at`.
- **Helper RLS:** `public.is_review_member(p_review_id uuid) → boolean` (security definer).
- **Contadores parciais hoje (a serem unificados):** `countRecords` (`src/lib/jobs/queries.ts`),
  `countDuplicates` (`src/lib/dedup/queries.ts`), `countScreened` + `countIncludedFullText`
  (`src/lib/screening/queries.ts`). O workbench (`app/reviews/[reviewId]/workbench/page.tsx`)
  hoje renderiza spans inline desses contadores — a Fatia 6 move a exibição canônica para o
  **shell** (`layout.tsx`) e a fonte para a view.
- **Padrão de leitura RLS-scoped:** funções em `src/lib/<dom>/queries.ts` usando
  `createClient()` de `@/lib/supabase/server`.
- **Padrão de Server Action:** `"use server"`, `requireMember(reviewId)` (checa
  `auth.getUser()` + `is_review_member`), `revalidatePath(...)`.
- **Shell atual:** `app/reviews/[reviewId]/layout.tsx` é Server Component com header
  (ReviewSwitcher + nav Pergunta/Protocolo/Workbench). É aqui que entram trilho e PRISMA.
- **Componentes reusáveis:** `src/components/workbench/JobProgress.tsx` (polling react-query
  do status de job), `QueryProvider` (`src/components/providers/QueryProvider.tsx`).
- **Testes:** unit `tests/unit/**/*.test.ts(x)`; integration `tests/integration/**/*.test.ts`
  (Vitest contra Supabase local; helper `tests/integration/helpers/supabase.ts` expõe
  `signUpUser`, `serviceClient`); e2e `tests/e2e/*.spec.ts` (Playwright; signup via UI +
  seed via service-role).
- **`security_invoker` em views:** Postgres 15 (Supabase) suporta
  `create view ... with (security_invoker = true)` — necessário para a RLS das tabelas-base
  valer ao consultar a view.

## Estrutura de arquivos (decisões de decomposição)

**Banco**
- `supabase/migrations/0007_prisma_audit.sql` — **Criar.** Views `prisma_counter` e
  `prisma_exclusion_breakdown` (`security_invoker`), grants. Sem tabelas/mutações novas.

**Libs (`src/lib/`)**
- `src/lib/prisma/queries.ts` — **Criar.** `getPrismaCounters`, `getExclusionBreakdown` +
  tipos. Única fonte de contadores para a UI (SC-004).
- `src/lib/audit/queries.ts` — **Criar.** `listAuditTrail` + tipo `AuditRow`.
- `src/lib/audit/export.ts` — **Criar.** `toAuditJson`, `toAuditCsv` (**puras**, sem I/O).
- `src/lib/shell/phases.ts` — **Criar.** `computePhaseStates` (**pura**) + `loadPhaseStates`
  (async, junta os insumos) + tipos `Phase`/`PhaseStatus`/`PhaseInput`.
- `src/lib/shell/usage.ts` — **Criar.** `getJobsAndUsage` (jobs + tokens acumulados de IA).
- `src/lib/screening/queue-url.ts` — **Criar.** `QueueViewState`, `parseQueueState`,
  `serializeQueueState`, `applyQueueView` (**puras**).

**Componentes (`src/components/shell/`)**
- `src/components/shell/PhaseRail.tsx` — **Criar.** Trilho presentacional (status + `aria-current`).
- `src/components/shell/PrismaBar.tsx` — **Criar.** Barra de contadores presentacional (`aria-live`).
- `src/components/shell/JobsPanel.tsx` — **Criar.** Client; jobs ativos (reusa `JobProgress`) +
  consumo de IA + link de export de auditoria.
- `src/components/workbench/ScreeningQueue.tsx` — **Modificar.** Ler/escrever
  filtro+ordenação na URL e aplicar `applyQueueView`.

**App (`app/`)**
- `app/reviews/[reviewId]/layout.tsx` — **Modificar.** Injetar `PhaseRail` + `PrismaBar` +
  `JobsPanel` no shell (carregamento server-side).
- `app/reviews/[reviewId]/audit/export/route.ts` — **Criar.** Route Handler GET de download
  (JSON|CSV) com guarda `is_review_member`.
- `app/reviews/[reviewId]/workbench/page.tsx` — **Modificar.** Passar estado de fila
  (searchParams) ao `ScreeningQueue`; **remover** os spans de contadores inline (agora no shell).

**Testes**
- `tests/unit/audit/export.test.ts`, `tests/unit/shell/phases.test.ts`,
  `tests/unit/shell/shell-components.test.tsx`, `tests/unit/screening/queue-url.test.ts` —
  **Criar.**
- `tests/integration/prisma-counter.test.ts`, `tests/integration/audit-export.test.ts`,
  `tests/integration/shell-usage.test.ts` — **Criar.**
- `tests/e2e/shell-prisma.spec.ts` — **Criar.**

**Mapa FR/SC → tarefas:** FR-036 (contadores vivos) → T1,T2,T6,T8 · FR-035 (export auditoria)
→ T3,T4,T8 · FR-037 (estado de fila na URL) → T9,T10 · US7/trilho → T5,T6,T8 ·
SC-004 (número-a-número) → T2,T11 · SC-006 (reversões na trilha) → T3,T11.

---

## Task 1: Migration `0007` — views `prisma_counter` + `prisma_exclusion_breakdown`

**Files:**
- Create: `supabase/migrations/0007_prisma_audit.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- Marco 1 / Fatia 6 — Shell, trilho & PRISMA vivo + export de auditoria.
-- US7 / FR-035 (export auditoria), FR-036 (contadores vivos), FR-037 (fila na URL).
-- SEM tabela/mutação nova. Apenas VIEWS derivadas = FONTE ÚNICA dos contadores (SC-004).
-- security_invoker = true ⇒ a view respeita a RLS de record/exclusion_reason (PG15+).
-- audit_entry (0001), record/corpus_state (0003), exclusion_reason (0006) já existem.
-- ============================================================

-- Contadores PRISMA agregados — 1 linha por Revisão (fonte única — FR-036/SC-004).
-- identificados = importados (todos os records); duplicados = exatas + fuzzy confirmadas
-- (corpus_state duplicate_*); triados = ts_decision terminal; demais por corpus_state.
create view public.prisma_counter
  with (security_invoker = true) as
select
  r.id as review_id,
  count(rec.id)                                                         as identified,
  count(rec.id) filter (
    where rec.corpus_state in ('duplicate_exact', 'duplicate_fuzzy'))  as duplicates,
  count(rec.id) filter (
    where rec.ts_decision in ('included', 'excluded'))                 as screened,
  count(rec.id) filter (where rec.corpus_state = 'included_ts')        as included_ts,
  count(rec.id) filter (where rec.corpus_state = 'excluded_ts')        as excluded_ts,
  count(rec.id) filter (where rec.corpus_state = 'maybe_ts')           as maybe_ts,
  count(rec.id) filter (where rec.corpus_state = 'included_ft')        as included_ft,
  count(rec.id) filter (where rec.corpus_state = 'excluded_ft')        as excluded_ft
from public.review r
left join public.record rec on rec.review_id = r.id
group by r.id;

grant select on public.prisma_counter to authenticated;

-- Excluídos no Texto completo, quebrados por motivo (FR-036 "excluídos por razão").
create view public.prisma_exclusion_breakdown
  with (security_invoker = true) as
select
  rec.review_id,
  er.id    as reason_id,
  er.label as reason_label,
  count(rec.id) as n
from public.record rec
join public.exclusion_reason er on er.id = rec.ft_exclusion_reason_id
where rec.corpus_state = 'excluded_ft'
group by rec.review_id, er.id, er.label;

grant select on public.prisma_exclusion_breakdown to authenticated;
```

- [ ] **Step 2: Aplicar a migration no Supabase local e verificar que sobe limpa**

Run: `npx supabase db reset`
Expected: reset aplica `0001`…`0007` sem erro; a saída lista `0007_prisma_audit.sql` como aplicada.

- [ ] **Step 3: Regenerar os tipos do banco (as views passam a ser tipadas)**

Run: `npm run gen:types`
Expected: `src/types/database.ts` atualizado; `prisma_counter` e `prisma_exclusion_breakdown`
aparecem em `Views`. (Confirme: `grep -n "prisma_counter" src/types/database.ts`.)

- [ ] **Step 4: Type-check e commit**

Run: `npm run typecheck`
Expected: PASS (sem erros).

```bash
git add supabase/migrations/0007_prisma_audit.sql src/types/database.ts
git commit -m "feat(prisma): views prisma_counter e prisma_exclusion_breakdown (security_invoker) — fonte única SC-004"
```

---

## Task 2: `getPrismaCounters` / `getExclusionBreakdown` + teste de integração número-a-número

**Files:**
- Create: `src/lib/prisma/queries.ts`
- Test: `tests/integration/prisma-counter.test.ts`

- [ ] **Step 1: Escrever o teste de integração que falha (SC-004 + RLS)**

```ts
// tests/integration/prisma-counter.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { countDuplicates } from "@/lib/dedup/queries";

describe("prisma_counter — fonte única (SC-004 / FR-036)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`pc_owner_${s}@example.com`, "senha-teste-123")).client;
    intruder = (await signUpUser(`pc_intr_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "PRISMA counters" });
    reviewId = review.id;

    // Seed determinístico via service-role: estados que exercitam cada contador.
    const svc = serviceClient();
    const mk = (state: string, extra: Record<string, unknown> = {}) => ({
      review_id: reviewId,
      source_format: "ris",
      raw: { TI: `r-${state}-${Math.random()}` },
      metadata: { title: `r-${state}` },
      corpus_state: state,
      ...extra,
    });
    const rows = [
      mk("active"),
      mk("duplicate_exact"),
      mk("duplicate_fuzzy"),
      mk("included_ts", { ts_decision: "included" }),
      mk("excluded_ts", { ts_decision: "excluded" }),
      mk("maybe_ts", { ts_decision: "maybe" }),
      mk("included_ft", { ts_decision: "included", ft_decision: "included" }),
      mk("excluded_ft", { ts_decision: "included", ft_decision: "excluded" }),
    ];
    const { error } = await svc.from("record").insert(rows);
    if (error) throw new Error(error.message);
  });

  it("a view bate número-a-número com o corpus", async () => {
    const { data, error } = await owner
      .from("prisma_counter")
      .select("*")
      .eq("review_id", reviewId)
      .single();
    expect(error).toBeNull();
    expect(data!.identified).toBe(8);
    expect(data!.duplicates).toBe(2); // exact + fuzzy
    expect(data!.screened).toBe(5);   // ts_decision included|excluded (inclui as linhas ft)
    expect(data!.included_ts).toBe(1);
    expect(data!.excluded_ts).toBe(1);
    expect(data!.maybe_ts).toBe(1);
    expect(data!.included_ft).toBe(1);
    expect(data!.excluded_ft).toBe(1);
  });

  it("o duplicates da view coincide com o helper countDuplicates da Fatia 4", async () => {
    const { data } = await owner
      .from("prisma_counter").select("duplicates").eq("review_id", reviewId).single();
    expect(typeof data!.duplicates).toBe("number");
    expect(typeof (await countDuplicates(reviewId))).toBe("number");
  });

  it("RLS: intruso não-membro enxerga zero/linha vazia na view", async () => {
    const { data } = await intruder
      .from("prisma_counter").select("identified").eq("review_id", reviewId);
    expect((data ?? []).length).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha (módulo ainda não existe)**

Run: `npx vitest run tests/integration/prisma-counter.test.ts`
Expected: FAIL — o teste exercita a view recém-criada; se algum contador divergir, ajuste a
regra na view (Task 1) antes de prosseguir.

- [ ] **Step 3: Implementar `src/lib/prisma/queries.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

export interface PrismaCounters {
  identified: number;
  duplicates: number;
  screened: number;
  includedTs: number;
  excludedTs: number;
  maybeTs: number;
  includedFt: number;
  excludedFt: number;
}

export interface ExclusionCount {
  reasonId: string;
  reasonLabel: string;
  n: number;
}

/** Fonte única dos contadores PRISMA (FR-036/SC-004). Lê a view derivada. */
export async function getPrismaCounters(reviewId: string): Promise<PrismaCounters> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prisma_counter")
    .select(
      "identified, duplicates, screened, included_ts, excluded_ts, maybe_ts, included_ft, excluded_ft",
    )
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    identified: data?.identified ?? 0,
    duplicates: data?.duplicates ?? 0,
    screened: data?.screened ?? 0,
    includedTs: data?.included_ts ?? 0,
    excludedTs: data?.excluded_ts ?? 0,
    maybeTs: data?.maybe_ts ?? 0,
    includedFt: data?.included_ft ?? 0,
    excludedFt: data?.excluded_ft ?? 0,
  };
}

/** Excluídos no Texto completo por motivo (FR-036 "excluídos por razão"). */
export async function getExclusionBreakdown(reviewId: string): Promise<ExclusionCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prisma_exclusion_breakdown")
    .select("reason_id, reason_label, n")
    .eq("review_id", reviewId)
    .order("n", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    reasonId: r.reason_id,
    reasonLabel: r.reason_label,
    n: r.n ?? 0,
  }));
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/integration/prisma-counter.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Lint + type-check + commit**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

```bash
git add src/lib/prisma/queries.ts tests/integration/prisma-counter.test.ts
git commit -m "feat(prisma): getPrismaCounters/getExclusionBreakdown sobre a view única (SC-004)"
```

---

## Task 3: Trilha de auditoria — leitura + serializadores JSON/CSV

**Files:**
- Create: `src/lib/audit/queries.ts`
- Create: `src/lib/audit/export.ts`
- Test: `tests/unit/audit/export.test.ts`
- Test: `tests/integration/audit-export.test.ts`

- [ ] **Step 1: Escrever o teste unitário dos serializadores (falha)**

```ts
// tests/unit/audit/export.test.ts
import { describe, it, expect } from "vitest";
import { toAuditJson, toAuditCsv } from "@/lib/audit/export";
import type { AuditRow } from "@/lib/audit/queries";

const rows: AuditRow[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-06-01T10:00:00.000Z",
    actor_type: "human",
    actor_id: "aaaa",
    action: "decide_screening",
    entity: "record",
    entity_id: "rec-1",
    before: { corpus_state: "active", ts_decision: null },
    after: { corpus_state: "excluded_ts", ts_decision: "excluded" },
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    created_at: "2026-06-01T10:05:00.000Z",
    actor_type: "human",
    actor_id: "aaaa",
    action: "reverse_screening",
    entity: "record",
    entity_id: "rec-1",
    before: { corpus_state: "excluded_ts" },
    after: { corpus_state: "active", reason: "campo, com vírgula e \"aspas\"" },
  },
];

describe("export da trilha de auditoria (A1 / FR-035)", () => {
  it("JSON é sem perda: before/after preservados aninhados", () => {
    const parsed = JSON.parse(toAuditJson(rows));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].after.ts_decision).toBe("excluded");
    expect(parsed[1].action).toBe("reverse_screening"); // reversões aparecem (SC-006)
  });

  it("CSV achata before/after e escapa vírgulas/aspas (RFC 4180)", () => {
    const csv = toAuditCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "id,created_at,actor_type,actor_id,action,entity,entity_id,before,after",
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('""aspas""'); // aspas internas duplicadas
    expect(csv).toContain("reverse_screening"); // reversão presente (SC-006)
  });

  it("lida com trilha vazia", () => {
    expect(JSON.parse(toAuditJson([]))).toEqual([]);
    expect(toAuditCsv([]).split("\r\n")).toHaveLength(1); // só cabeçalho
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/unit/audit/export.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audit/export'`.

- [ ] **Step 3: Implementar `src/lib/audit/queries.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

export interface AuditRow {
  id: string;
  created_at: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
}

/** Trilha de auditoria da Revisão, ordem cronológica (append-only — FR-035). */
export async function listAuditTrail(reviewId: string): Promise<AuditRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_entry")
    .select("id, created_at, actor_type, actor_id, action, entity, entity_id, before, after")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditRow[];
}
```

- [ ] **Step 4: Implementar `src/lib/audit/export.ts` (puras)**

```ts
import type { AuditRow } from "./queries";

/** JSON sem perda — before/after preservados aninhados (A1). */
export function toAuditJson(rows: AuditRow[]): string {
  return JSON.stringify(rows, null, 2);
}

const CSV_COLUMNS = [
  "id",
  "created_at",
  "actor_type",
  "actor_id",
  "action",
  "entity",
  "entity_id",
  "before",
  "after",
] as const;

function csvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  // RFC 4180: cita sempre e duplica aspas internas (robusto a vírgula/quebra/aspas).
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV achatado para inspeção em planilha (A1). before/after viram JSON em célula. */
export function toAuditCsv(rows: AuditRow[]): string {
  const header = CSV_COLUMNS.join(",");
  const body = rows.map((r) =>
    CSV_COLUMNS.map((c) => csvCell((r as Record<string, unknown>)[c])).join(","),
  );
  return [header, ...body].join("\r\n");
}
```

- [ ] **Step 5: Rodar o teste unitário e confirmar que passa**

Run: `npx vitest run tests/unit/audit/export.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Escrever o teste de integração da leitura (RLS + reversões — SC-006), falha**

```ts
// tests/integration/audit-export.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";
import { listAuditTrail } from "@/lib/audit/queries";

describe("trilha de auditoria — leitura (FR-035 / SC-006)", () => {
  let ownerClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recordId: string;

  beforeAll(async () => {
    const s = Date.now();
    const owner = await signUpUser(`au_owner_${s}@example.com`, "senha-teste-123");
    ownerClient = owner.client;
    const { data: review } = await ownerClient.rpc("create_review", { p_title: "Audit trail" });
    reviewId = review.id;
    // Um record active + decisão + reversão ⇒ entradas de auditoria esperadas.
    const { data: rec } = await ownerClient
      .from("record")
      .insert({
        review_id: reviewId,
        source_format: "ris",
        raw: { TI: "auditável" },
        metadata: { title: "auditável" },
        corpus_state: "active",
      })
      .select("id")
      .single();
    recordId = rec!.id;
    await ownerClient.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recordId,
      p_stage: "title_abstract",
      p_decision: "exclude",
      p_exclusion_reason_id: null,
      p_ai_suggestion_id: null,
    });
    const { data: dec } = await ownerClient
      .from("screening_decision")
      .select("id")
      .eq("record_id", recordId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    await ownerClient.rpc("reverse_screening", { p_decision_id: dec!.id });
  });

  it("a reversão aparece na trilha (SC-006)", async () => {
    const rows = await listAuditTrail(reviewId);
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("reverse_screening");
  });

  it("RLS: intruso não-membro lê zero entradas", async () => {
    const s = Date.now();
    const intruder = await signUpUser(`au_intr_${s}@example.com`, "senha-teste-123");
    const { data } = await intruder.client
      .from("audit_entry")
      .select("id")
      .eq("review_id", reviewId);
    expect((data ?? []).length).toBe(0);
  });
});
```

> Nota: confirme os nomes exatos dos parâmetros de `decide_screening`/`reverse_screening` em
> `app/reviews/[reviewId]/workbench/actions.ts` (Fatia 5) — este teste usa a assinatura lá
> verificada (`p_review_id, p_record_id, p_stage, p_decision, p_exclusion_reason_id,
> p_ai_suggestion_id` e `p_decision_id`).

- [ ] **Step 7: Rodar o teste de integração e confirmar que passa**

Run: `npx vitest run tests/integration/audit-export.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 8: Lint + type-check + commit**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

```bash
git add src/lib/audit/ tests/unit/audit/export.test.ts tests/integration/audit-export.test.ts
git commit -m "feat(audit): listAuditTrail + serializadores JSON/CSV sem perda (FR-035/SC-006)"
```

---

## Task 4: Route Handler de download da auditoria (JSON | CSV)

**Files:**
- Create: `app/reviews/[reviewId]/audit/export/route.ts`

- [ ] **Step 1: Implementar o Route Handler com guarda de membro**

```ts
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listAuditTrail } from "@/lib/audit/queries";
import { toAuditJson, toAuditCsv } from "@/lib/audit/export";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Não autenticado", { status: 401 });
  const { data: member, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !member) return new Response("Acesso negado", { status: 403 });

  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const rows = await listAuditTrail(reviewId);
  const body = format === "csv" ? toAuditCsv(rows) : toAuditJson(rows);
  const contentType =
    format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="auditoria-${reviewId}.${format}"`,
    },
  });
}
```

- [ ] **Step 2: Type-check (o e2e de download é exercido na Task 11)**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/reviews/[reviewId]/audit/export/route.ts"
git commit -m "feat(audit): route handler GET de export (JSON|CSV) com guarda is_review_member"
```

---

## Task 5: Derivação do trilho de fases (`computePhaseStates` + `loadPhaseStates`)

**Files:**
- Create: `src/lib/shell/phases.ts`
- Test: `tests/unit/shell/phases.test.ts`

- [ ] **Step 1: Escrever o teste unitário da função pura (falha)**

```ts
// tests/unit/shell/phases.test.ts
import { describe, it, expect } from "vitest";
import { computePhaseStates, type PhaseInput } from "@/lib/shell/phases";

const base: PhaseInput = {
  hasQuestion: false,
  protocolStatus: "none",
  identified: 0,
  duplicates: 0,
  screenedTs: 0,
  includedTs: 0,
  includedFt: 0,
  excludedFt: 0,
};
const by = (phases: ReturnType<typeof computePhaseStates>) =>
  Object.fromEntries(phases.map((p) => [p.key, p.status]));

describe("computePhaseStates — trilho de fases (US7)", () => {
  it("Revisão vazia: pergunta é a fase atual, resto pendente", () => {
    const s = by(computePhaseStates("rev1", base));
    expect(s.question).toBe("current");
    expect(s.protocol).toBe("pending");
    expect(s.import).toBe("pending");
  });

  it("protocolo travado aparece como 'locked' (distinto de 'done')", () => {
    const s = by(
      computePhaseStates("rev1", { ...base, hasQuestion: true, protocolStatus: "locked" }),
    );
    expect(s.question).toBe("done");
    expect(s.protocol).toBe("locked");
  });

  it("Viés e Certeza são sempre opcionais-desligadas e não bloqueiam (D19)", () => {
    const s = by(computePhaseStates("rev1", base));
    expect(s.risk_of_bias).toBe("optional_off");
    expect(s.certainty).toBe("optional_off");
  });

  it("com corpus importado e nada triado, triagem T/R é a fase atual", () => {
    const s = by(
      computePhaseStates("rev1", {
        ...base,
        hasQuestion: true,
        protocolStatus: "locked",
        identified: 10,
        duplicates: 2,
      }),
    );
    expect(s.import).toBe("done");
    expect(s.screening_ts).toBe("current");
  });

  it("hrefs apontam para as rotas reais da Revisão", () => {
    const phases = computePhaseStates("rev-xyz", { ...base, hasQuestion: true });
    expect(phases.find((p) => p.key === "question")!.href).toBe("/reviews/rev-xyz/question");
    expect(phases.find((p) => p.key === "screening_ts")!.href).toBe(
      "/reviews/rev-xyz/workbench?mode=title_abstract",
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/unit/shell/phases.test.ts`
Expected: FAIL — `Cannot find module '@/lib/shell/phases'`.

- [ ] **Step 3: Implementar `src/lib/shell/phases.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { getPrismaCounters } from "@/lib/prisma/queries";

export type PhaseStatus = "done" | "current" | "pending" | "locked" | "optional_off";

export type PhaseKey =
  | "question"
  | "protocol"
  | "import"
  | "duplicates"
  | "screening_ts"
  | "screening_ft"
  | "risk_of_bias"
  | "certainty";

export interface Phase {
  key: PhaseKey;
  label: string;
  href: string | null;
  status: PhaseStatus;
}

export interface PhaseInput {
  hasQuestion: boolean;
  protocolStatus: "none" | "draft" | "locked";
  identified: number;
  duplicates: number;
  screenedTs: number;
  includedTs: number;
  includedFt: number;
  excludedFt: number;
}

interface PhaseDef {
  key: PhaseKey;
  label: string;
  href: (reviewId: string) => string | null;
  completed: (i: PhaseInput) => boolean;
}

// Ordem-pipeline. Viés/Certeza ficam fora do fluxo principal (sempre opcional-desligadas).
const PIPELINE: PhaseDef[] = [
  {
    key: "question",
    label: "Pergunta",
    href: (r) => `/reviews/${r}/question`,
    completed: (i) => i.hasQuestion,
  },
  {
    key: "protocol",
    label: "Protocolo",
    href: (r) => `/reviews/${r}/protocol`,
    completed: (i) => i.protocolStatus === "locked",
  },
  {
    key: "import",
    label: "Importar",
    href: (r) => `/reviews/${r}/workbench?mode=import`,
    completed: (i) => i.identified > 0,
  },
  {
    key: "duplicates",
    label: "Duplicatas",
    href: (r) => `/reviews/${r}/workbench?mode=duplicates`,
    completed: (i) => i.identified > 0 && (i.screenedTs > 0 || i.duplicates > 0),
  },
  {
    key: "screening_ts",
    label: "Triagem T/R",
    href: (r) => `/reviews/${r}/workbench?mode=title_abstract`,
    completed: (i) =>
      i.identified > 0 && i.screenedTs >= Math.max(1, i.identified - i.duplicates),
  },
  {
    key: "screening_ft",
    label: "Triagem TC",
    href: (r) => `/reviews/${r}/workbench?mode=full_text`,
    completed: (i) => i.includedTs > 0 && i.includedFt + i.excludedFt >= i.includedTs,
  },
];

const OPTIONAL: { key: PhaseKey; label: string }[] = [
  { key: "risk_of_bias", label: "Risco de Viés" },
  { key: "certainty", label: "Certeza (CERQual)" },
];

/** Deriva o estado de cada fase a partir dos contadores e do protocolo (pura). */
export function computePhaseStates(reviewId: string, input: PhaseInput): Phase[] {
  let frontierTaken = false;
  const pipeline = PIPELINE.map((def): Phase => {
    const done = def.completed(input);
    let status: PhaseStatus;
    if (def.key === "protocol" && input.protocolStatus === "locked") {
      status = "locked";
    } else if (done) {
      status = "done";
    } else if (!frontierTaken) {
      status = "current";
      frontierTaken = true;
    } else {
      status = "pending";
    }
    return { key: def.key, label: def.label, href: def.href(reviewId), status };
  });

  const optional = OPTIONAL.map(
    (o): Phase => ({ key: o.key, label: o.label, href: null, status: "optional_off" }),
  );

  return [...pipeline, ...optional];
}

/** Junta os insumos (contadores + protocolo + pergunta) e deriva o trilho. */
export async function loadPhaseStates(reviewId: string): Promise<Phase[]> {
  const supabase = await createClient();
  const counters = await getPrismaCounters(reviewId);

  const { count: questionCount } = await supabase
    .from("question")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId);

  const { data: protocol } = await supabase
    .from("protocol")
    .select("state")
    .eq("review_id", reviewId)
    .maybeSingle();
  const protocolStatus =
    protocol?.state === "locked" ? "locked" : protocol ? "draft" : "none";

  return computePhaseStates(reviewId, {
    hasQuestion: (questionCount ?? 0) > 0,
    protocolStatus,
    identified: counters.identified,
    duplicates: counters.duplicates,
    screenedTs: counters.screened,
    includedTs: counters.includedTs,
    includedFt: counters.includedFt,
    excludedFt: counters.excludedFt,
  });
}
```

> Nota: confirme os nomes de tabela/coluna `question` e `protocol.state` em
> `src/types/database.ts` (Fatia 2). Se divergirem, ajuste apenas o `loadPhaseStates`
> (a função pura `computePhaseStates` permanece intacta e é o que os testes cobrem).

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/unit/shell/phases.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Lint + type-check + commit**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

```bash
git add src/lib/shell/phases.ts tests/unit/shell/phases.test.ts
git commit -m "feat(shell): derivação do trilho de fases (computePhaseStates/loadPhaseStates — US7)"
```

---

## Task 6: Componentes presentacionais do shell — `PhaseRail` + `PrismaBar`

**Files:**
- Create: `src/components/shell/PhaseRail.tsx`
- Create: `src/components/shell/PrismaBar.tsx`
- Test: `tests/unit/shell/shell-components.test.tsx`

- [ ] **Step 1: Escrever o teste de render (falha)**

```tsx
// tests/unit/shell/shell-components.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseRail } from "@/components/shell/PhaseRail";
import { PrismaBar } from "@/components/shell/PrismaBar";
import type { Phase } from "@/lib/shell/phases";
import type { PrismaCounters } from "@/lib/prisma/queries";

const phases: Phase[] = [
  { key: "question", label: "Pergunta", href: "/reviews/r/question", status: "done" },
  { key: "protocol", label: "Protocolo", href: "/reviews/r/protocol", status: "locked" },
  { key: "screening_ts", label: "Triagem T/R", href: "/reviews/r/workbench?mode=title_abstract", status: "current" },
  { key: "risk_of_bias", label: "Risco de Viés", href: null, status: "optional_off" },
];

const counters: PrismaCounters = {
  identified: 100, duplicates: 12, screened: 40, includedTs: 25,
  excludedTs: 15, maybeTs: 5, includedFt: 10, excludedFt: 15,
};

describe("PhaseRail", () => {
  it("marca a fase atual com aria-current e mostra o estado de cada fase", () => {
    render(<PhaseRail phases={phases} />);
    const current = screen.getByText("Triagem T/R").closest("[aria-current]");
    expect(current).not.toBeNull();
    expect(screen.getByText("Protocolo").closest("li")).toHaveAttribute(
      "data-status",
      "locked",
    );
    expect(screen.getByText("Risco de Viés").closest("li")).toHaveAttribute(
      "data-status",
      "optional_off",
    );
  });
});

describe("PrismaBar", () => {
  it("exibe os contadores PRISMA com aria-live", () => {
    const { container } = render(<PrismaBar counters={counters} />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByText("Identificados").parentElement).toHaveTextContent("100");
    expect(screen.getByText("Duplicados").parentElement).toHaveTextContent("12");
    expect(screen.getByText("Incluídos (TC)").parentElement).toHaveTextContent("10");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/unit/shell/shell-components.test.tsx`
Expected: FAIL — módulos de `@/components/shell/*` não existem.

- [ ] **Step 3: Implementar `src/components/shell/PhaseRail.tsx`**

```tsx
import Link from "next/link";
import type { Phase, PhaseStatus } from "@/lib/shell/phases";

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "feito",
  current: "em curso",
  pending: "pendente",
  locked: "travado",
  optional_off: "opcional — desligado",
};

const STATUS_CLASS: Record<PhaseStatus, string> = {
  done: "text-green-700",
  current: "font-semibold text-black",
  pending: "text-gray-400",
  locked: "text-amber-700",
  optional_off: "text-gray-300 line-through",
};

export function PhaseRail({ phases }: { phases: Phase[] }) {
  return (
    <nav aria-label="Trilho de fases" className="w-48 shrink-0 border-r pr-4">
      <ol className="flex flex-col gap-1">
        {phases.map((p) => {
          const content = (
            <span className={`text-sm ${STATUS_CLASS[p.status]}`}>
              {p.label}
              <span className="ml-1 text-xs text-gray-400">({STATUS_LABEL[p.status]})</span>
            </span>
          );
          return (
            <li
              key={p.key}
              data-status={p.status}
              aria-current={p.status === "current" ? "step" : undefined}
              className="rounded px-2 py-1"
            >
              {p.href && p.status !== "optional_off" ? (
                <Link href={p.href}>{content}</Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 4: Implementar `src/components/shell/PrismaBar.tsx`**

```tsx
import type { PrismaCounters } from "@/lib/prisma/queries";

export function PrismaBar({ counters }: { counters: PrismaCounters }) {
  const items: [string, number][] = [
    ["Identificados", counters.identified],
    ["Duplicados", counters.duplicates],
    ["Triados", counters.screened],
    ["Incluídos (T/R)", counters.includedTs],
    ["Incluídos (TC)", counters.includedFt],
    ["Excluídos (TC)", counters.excludedFt],
  ];
  return (
    <div
      aria-live="polite"
      aria-label="Contadores PRISMA"
      className="flex flex-wrap items-center gap-4 rounded border bg-gray-50 px-4 py-2"
    >
      {items.map(([label, n]) => (
        <span key={label} className="text-sm text-gray-600">
          {label}: <strong>{n}</strong>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/unit/shell/shell-components.test.tsx`
Expected: PASS.

- [ ] **Step 6: Lint + type-check + commit**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

```bash
git add src/components/shell/PhaseRail.tsx src/components/shell/PrismaBar.tsx tests/unit/shell/shell-components.test.tsx
git commit -m "feat(shell): PhaseRail + PrismaBar presentacionais (US7/FR-036, a11y aria-current/aria-live)"
```

---

## Task 7: Painel de jobs & consumo de IA no shell

**Files:**
- Create: `src/lib/shell/usage.ts`
- Create: `src/components/shell/JobsPanel.tsx`
- Test: `tests/integration/shell-usage.test.ts`

- [ ] **Step 1: Escrever o teste de integração do agregador (falha)**

```ts
// tests/integration/shell-usage.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";
import { getJobsAndUsage } from "@/lib/shell/usage";

describe("getJobsAndUsage — painel de jobs & custo (shell)", () => {
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    const owner = await signUpUser(`su_owner_${s}@example.com`, "senha-teste-123");
    const { data: review } = await owner.client.rpc("create_review", { p_title: "Usage" });
    reviewId = review.id;
    await owner.client.from("ai_usage").insert([
      { review_id: reviewId, phase: "screening", tokens_in: 100, tokens_out: 50, cost: {} },
      { review_id: reviewId, phase: "screening", tokens_in: 200, tokens_out: 80, cost: {} },
    ]);
  });

  it("soma tokens acumulados de IA da Revisão", async () => {
    const { usage } = await getJobsAndUsage(reviewId);
    expect(usage.tokensIn).toBe(300);
    expect(usage.tokensOut).toBe(130);
  });

  it("retorna a lista de jobs (vazia quando não há)", async () => {
    const { jobs } = await getJobsAndUsage(reviewId);
    expect(Array.isArray(jobs)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/integration/shell-usage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/shell/usage'`.

- [ ] **Step 3: Implementar `src/lib/shell/usage.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { listJobs, type JobRow } from "@/lib/jobs/queries";

export interface AiUsageSummary {
  tokensIn: number;
  tokensOut: number;
}

export interface JobsAndUsage {
  jobs: JobRow[];
  usage: AiUsageSummary;
}

/** Jobs da Revisão + tokens de IA acumulados (FR-033 consumo, surfaceado no shell). */
export async function getJobsAndUsage(reviewId: string): Promise<JobsAndUsage> {
  const supabase = await createClient();
  const jobs = await listJobs(reviewId);

  const { data, error } = await supabase
    .from("ai_usage")
    .select("tokens_in, tokens_out")
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);

  const usage = (data ?? []).reduce<AiUsageSummary>(
    (acc, r) => ({
      tokensIn: acc.tokensIn + (r.tokens_in ?? 0),
      tokensOut: acc.tokensOut + (r.tokens_out ?? 0),
    }),
    { tokensIn: 0, tokensOut: 0 },
  );

  return { jobs, usage };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/integration/shell-usage.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Implementar `src/components/shell/JobsPanel.tsx`**

```tsx
"use client";

import { JobProgress } from "@/components/workbench/JobProgress";
import type { JobsAndUsage } from "@/lib/shell/usage";

const ACTIVE = ["queued", "running"];

export function JobsPanel({
  reviewId,
  data,
}: {
  reviewId: string;
  data: JobsAndUsage;
}) {
  const active = data.jobs.filter((j) => ACTIVE.includes(j.status));
  return (
    <aside aria-label="Jobs e consumo" className="flex w-56 shrink-0 flex-col gap-2 text-sm">
      <div className="text-gray-600">
        Consumo de IA — entrada: <strong>{data.usage.tokensIn}</strong> tokens · saída:{" "}
        <strong>{data.usage.tokensOut}</strong> tokens
      </div>
      {active.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {active.map((j) => (
            <li key={j.id}>
              <span className="text-gray-500">{j.type}</span> <JobProgress jobId={j.id} />
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-gray-400">Nenhum job em andamento.</span>
      )}
      <div className="flex gap-3">
        <a className="underline" href={`/reviews/${reviewId}/audit/export?format=json`}>
          Exportar auditoria (JSON)
        </a>
        <a className="underline" href={`/reviews/${reviewId}/audit/export?format=csv`}>
          CSV
        </a>
      </div>
    </aside>
  );
}
```

- [ ] **Step 6: Lint + type-check + commit**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

```bash
git add src/lib/shell/usage.ts src/components/shell/JobsPanel.tsx tests/integration/shell-usage.test.ts
git commit -m "feat(shell): painel de jobs + consumo de IA + links de export de auditoria"
```

---

## Task 8: Montar o shell no `layout.tsx` (trilho + PRISMA + jobs)

**Files:**
- Modify: `app/reviews/[reviewId]/layout.tsx`
- Modify: `app/reviews/[reviewId]/workbench/page.tsx` (remover spans de contadores inline)

- [ ] **Step 1: Reescrever `layout.tsx` para carregar e renderizar o shell**

```tsx
import { notFound } from "next/navigation";
import { getReviewById, listMyReviews } from "@/lib/reviews/queries";
import { ReviewSwitcher } from "@/components/reviews/ReviewSwitcher";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { PhaseRail } from "@/components/shell/PhaseRail";
import { PrismaBar } from "@/components/shell/PrismaBar";
import { JobsPanel } from "@/components/shell/JobsPanel";
import { loadPhaseStates } from "@/lib/shell/phases";
import { getPrismaCounters } from "@/lib/prisma/queries";
import { getJobsAndUsage } from "@/lib/shell/usage";

export const dynamic = "force-dynamic";

export default async function ReviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const active = await getReviewById(reviewId);
  if (!active) notFound();

  const [reviews, phases, counters, jobsUsage] = await Promise.all([
    listMyReviews(),
    loadPhaseStates(reviewId),
    getPrismaCounters(reviewId),
    getJobsAndUsage(reviewId),
  ]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 border-b p-4">
        <a href="/reviews" className="text-sm underline">Minhas Revisões</a>
        <a href="/reviews/new" className="text-sm underline">Nova Revisão</a>
        <ReviewSwitcher reviews={reviews} activeId={active.id} />
        <form action="/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="text-sm underline">Sair</button>
        </form>
      </header>

      <PrismaBar counters={counters} />

      <div className="flex gap-6 p-6">
        <PhaseRail phases={phases} />
        <main className="min-w-0 flex-1">{children}</main>
        <QueryProvider>
          <JobsPanel reviewId={reviewId} data={jobsUsage} />
        </QueryProvider>
      </div>
    </div>
  );
}
```

> Nota: o trilho substitui a `nav` inline de Pergunta/Protocolo/Workbench (os mesmos
> destinos agora vivem no `PhaseRail`). `JobProgress` exige um `QueryProvider`; por isso o
> `JobsPanel` é embrulhado aqui.

- [ ] **Step 2: Remover do workbench os contadores inline (agora no shell — fonte única)**

Em `app/reviews/[reviewId]/workbench/page.tsx`: **apague** o bloco do header com os
`<span>` de `Identificados/Duplicados (PRISMA)` e as chamadas locais a `countRecords`,
`countDuplicates`, `countScreened`, `countIncludedFullText` (e seus imports), mantendo o
`<h1>Workbench</h1>`, a `ModeBar` e o `QueryProvider` com os painéis por modo. Resultado do
topo do componente:

```tsx
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Workbench</h1>
      <ModeBar reviewId={reviewId} active={active} />
      <QueryProvider>
        {/* ...os mesmos ramos por modo (import/duplicates/title_abstract/full_text)... */}
      </QueryProvider>
    </div>
  );
```

- [ ] **Step 3: Subir o app e conferir visualmente o shell**

Run: `npm run dev` (e abrir `/reviews/<id>/workbench`)
Expected: barra PRISMA no topo, trilho à esquerda com a fase atual destacada, painel de
jobs/consumo + links de export à direita. (Encerrar o dev server depois.)

- [ ] **Step 4: Lint + type-check + commit**

Run: `npm run lint && npm run typecheck`
Expected: PASS — em particular, nenhum import órfão de `count*` no workbench.

```bash
git add "app/reviews/[reviewId]/layout.tsx" "app/reviews/[reviewId]/workbench/page.tsx"
git commit -m "feat(shell): trilho + PRISMA + jobs no layout; workbench consome a fonte única"
```

---

## Task 9: Estado de fila na URL — módulo puro `queue-url.ts` (FR-037)

**Files:**
- Create: `src/lib/screening/queue-url.ts`
- Test: `tests/unit/screening/queue-url.test.ts`

- [ ] **Step 1: Escrever o teste unitário (falha)**

```ts
// tests/unit/screening/queue-url.test.ts
import { describe, it, expect } from "vitest";
import {
  parseQueueState,
  serializeQueueState,
  applyQueueView,
  type QueueViewState,
} from "@/lib/screening/queue-url";

type Row = { recordId: string; title: string; year: string | null; ts: string | null; ai: number | null };
const rows: Row[] = [
  { recordId: "a", title: "Beta",  year: "2020", ts: null,       ai: 0.3 },
  { recordId: "b", title: "Alpha", year: "2022", ts: "included", ai: 0.9 },
  { recordId: "c", title: "Gamma", year: "2019", ts: "excluded", ai: null },
];
const sel = (r: Row) => ({
  decision: r.ts as "included" | "excluded" | "maybe" | null,
  aiConfidence: r.ai,
});
const sortKey = (r: Row) => ({ title: r.title, year: r.year });

describe("queue-url (FR-037) — preservar/reabrir estado de fila", () => {
  it("default quando não há params", () => {
    expect(parseQueueState(new URLSearchParams())).toEqual({ filter: "all", sort: "default" });
  });

  it("roundtrip serialize → parse preserva o estado", () => {
    const state: QueueViewState = { filter: "undecided", sort: "year" };
    const params = new URLSearchParams(serializeQueueState(state));
    expect(parseQueueState(params)).toEqual(state);
  });

  it("ignora valores inválidos caindo no default (robusto a URL adulterada)", () => {
    const p = new URLSearchParams({ qfilter: "lixo", qsort: "lixo" });
    expect(parseQueueState(p)).toEqual({ filter: "all", sort: "default" });
  });

  it("applyQueueView filtra por 'undecided' (sem decisão T/R)", () => {
    const out = applyQueueView(rows, { filter: "undecided", sort: "default" }, sel, sortKey);
    expect(out.map((r) => r.recordId)).toEqual(["a"]);
  });

  it("applyQueueView ordena por título e por ano", () => {
    const byTitle = applyQueueView(rows, { filter: "all", sort: "title" }, sel, sortKey);
    expect(byTitle.map((r) => r.title)).toEqual(["Alpha", "Beta", "Gamma"]);
    const byYear = applyQueueView(rows, { filter: "all", sort: "year" }, sel, sortKey);
    expect(byYear.map((r) => r.year)).toEqual(["2019", "2020", "2022"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/unit/screening/queue-url.test.ts`
Expected: FAIL — `Cannot find module '@/lib/screening/queue-url'`.

- [ ] **Step 3: Implementar `src/lib/screening/queue-url.ts`**

```ts
export const QUEUE_FILTERS = [
  "all",
  "undecided",
  "included",
  "excluded",
  "maybe",
  "ai_suggested",
] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

export const QUEUE_SORTS = ["default", "title", "year", "ai_confidence"] as const;
export type QueueSort = (typeof QUEUE_SORTS)[number];

export interface QueueViewState {
  filter: QueueFilter;
  sort: QueueSort;
}

export const DEFAULT_QUEUE_STATE: QueueViewState = { filter: "all", sort: "default" };

/** Lê o estado de fila dos searchParams; valores inválidos caem no default (FR-037). */
export function parseQueueState(params: URLSearchParams): QueueViewState {
  const f = params.get("qfilter");
  const s = params.get("qsort");
  return {
    filter: (QUEUE_FILTERS as readonly string[]).includes(f ?? "")
      ? (f as QueueFilter)
      : "all",
    sort: (QUEUE_SORTS as readonly string[]).includes(s ?? "") ? (s as QueueSort) : "default",
  };
}

/** Serializa para um objeto pronto p/ URLSearchParams; omite os defaults (URL limpa). */
export function serializeQueueState(state: QueueViewState): Record<string, string> {
  const out: Record<string, string> = {};
  if (state.filter !== "all") out.qfilter = state.filter;
  if (state.sort !== "default") out.qsort = state.sort;
  return out;
}

interface Decisionish {
  decision: "included" | "excluded" | "maybe" | null;
  aiConfidence: number | null;
}
interface Sortable {
  title: string;
  year: string | null;
}

/** Aplica filtro + ordenação a uma fila já carregada (puro; sem refetch — FR-037). */
export function applyQueueView<T>(
  rows: T[],
  state: QueueViewState,
  decisionOf: (row: T) => Decisionish,
  sortKeyOf: (row: T) => Sortable = () => ({ title: "", year: null }),
): T[] {
  const filtered = rows.filter((r) => {
    const d = decisionOf(r);
    switch (state.filter) {
      case "undecided":
        return d.decision === null;
      case "included":
        return d.decision === "included";
      case "excluded":
        return d.decision === "excluded";
      case "maybe":
        return d.decision === "maybe";
      case "ai_suggested":
        return d.aiConfidence !== null;
      default:
        return true;
    }
  });

  if (state.sort === "default") return filtered;
  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (state.sort === "ai_confidence") {
      return (decisionOf(b).aiConfidence ?? -1) - (decisionOf(a).aiConfidence ?? -1);
    }
    const ka = sortKeyOf(a);
    const kb = sortKeyOf(b);
    if (state.sort === "year") return (ka.year ?? "").localeCompare(kb.year ?? "");
    return ka.title.localeCompare(kb.title); // "title"
  });
  return sorted;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/unit/screening/queue-url.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Lint + type-check + commit**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

```bash
git add src/lib/screening/queue-url.ts tests/unit/screening/queue-url.test.ts
git commit -m "feat(screening): queue-url puro — filtro/ordenação reabríveis por URL (FR-037)"
```

---

## Task 10: Ligar o estado de fila na URL ao `ScreeningQueue`

**Files:**
- Modify: `src/components/workbench/ScreeningQueue.tsx`
- Modify: `app/reviews/[reviewId]/workbench/page.tsx`

> Pré-requisito de leitura: abra `src/components/workbench/ScreeningQueue.tsx` (Fatia 5)
> e identifique (a) o array de linhas carregado (`QueueRow[]`) e os campos
> `tsDecision`/`ftDecision`/`ai.confidence`, e (b) o ponto onde as linhas são passadas ao
> virtualizador. As edições abaixo se encaixam nesses dois pontos.

- [ ] **Step 1: Aceitar o estado inicial e expor controles de filtro/ordenação**

No topo do `ScreeningQueue` (client component), refletir mudanças na URL com
`useRouter`/`usePathname`/`useSearchParams`:

```tsx
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyQueueView,
  parseQueueState,
  serializeQueueState,
  type QueueViewState,
} from "@/lib/screening/queue-url";

// dentro do componente:
const router = useRouter();
const pathname = usePathname();
const searchParams = useSearchParams();
const view: QueueViewState = parseQueueState(new URLSearchParams(searchParams.toString()));

function setView(next: QueueViewState) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("qfilter");
  params.delete("qsort");
  for (const [k, v] of Object.entries(serializeQueueState(next))) params.set(k, v);
  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
}
```

- [ ] **Step 2: Derivar as linhas visíveis com `applyQueueView` antes de virtualizar**

```tsx
const visibleRows = applyQueueView(
  rows, // QueueRow[] já carregado (Fatia 5)
  view,
  (r) => ({
    decision: r.tsDecision ?? null,
    aiConfidence: r.ai?.confidence ?? null,
  }),
  (r) => ({ title: r.title, year: r.year }),
);
// usar `visibleRows` no virtualizador no lugar de `rows`.
```

- [ ] **Step 3: Adicionar a UI de filtro/ordenação (teclado-acessível) acima da fila**

```tsx
<div className="flex gap-2 pb-2 text-sm" role="group" aria-label="Filtro e ordenação da fila">
  <label>
    Filtrar:{" "}
    <select
      value={view.filter}
      onChange={(e) => setView({ ...view, filter: e.target.value as QueueViewState["filter"] })}
    >
      <option value="all">Todos</option>
      <option value="undecided">Sem decisão</option>
      <option value="included">Incluídos</option>
      <option value="excluded">Excluídos</option>
      <option value="maybe">Em dúvida</option>
      <option value="ai_suggested">Com sugestão de IA</option>
    </select>
  </label>
  <label>
    Ordenar:{" "}
    <select
      value={view.sort}
      onChange={(e) => setView({ ...view, sort: e.target.value as QueueViewState["sort"] })}
    >
      <option value="default">Padrão</option>
      <option value="title">Título</option>
      <option value="year">Ano</option>
      <option value="ai_confidence">Confiança da IA</option>
    </select>
  </label>
</div>
```

- [ ] **Step 4: Garantir que os params chegam (página continua dinâmica)**

Em `app/reviews/[reviewId]/workbench/page.tsx`, o `ScreeningQueue` lê o estado direto via
`useSearchParams`; basta a página seguir `dynamic = "force-dynamic"` (já está). **Não**
introduza estado duplicado de filtro/ordenação fora da URL.

- [ ] **Step 5: Garantir que os testes de unidade do ScreeningQueue (Fatia 5) seguem verdes**

Run: `npx vitest run tests/unit/workbench/screening-queue.test.tsx`
Expected: PASS. Se o teste montar o componente sem um router, ajuste o mock de
`next/navigation` conforme o setup existente da Fatia 5 (ou envolva no provider já usado).

- [ ] **Step 6: Lint + type-check + commit**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

```bash
git add src/components/workbench/ScreeningQueue.tsx "app/reviews/[reviewId]/workbench/page.tsx"
git commit -m "feat(screening): fila com filtro/ordenação reabríveis por URL (FR-037)"
```

---

## Task 11: e2e do shell — trilho, PRISMA número-a-número, export, fila por URL

**Files:**
- Create: `tests/e2e/shell-prisma.spec.ts`

- [ ] **Step 1: Escrever o e2e (Playwright) cobrindo US7 + FR-035 + FR-037 + SC-004/SC-006**

```ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function setupReview(page: import("@playwright/test").Page) {
  const ts = Date.now();
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(`e2e_shell_${ts}@example.com`);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/, { timeout: 15_000 });
  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Shell e2e");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 10_000 });
  const reviewId = page.url().split("/reviews/")[1]!.split("/")[0]!;
  return { reviewId };
}

function seed(reviewId: string) {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const mk = (state: string, extra: Record<string, unknown> = {}) => ({
    review_id: reviewId, source_format: "ris",
    raw: { TI: `r-${state}-${Math.random()}` }, metadata: { title: `r-${state}` },
    corpus_state: state, ...extra,
  });
  return svc.from("record").insert([
    mk("active"), mk("duplicate_exact"),
    mk("included_ts", { ts_decision: "included" }),
    mk("excluded_ts", { ts_decision: "excluded" }),
  ]);
}

test("shell mostra trilho + PRISMA número-a-número (US7/SC-004)", async ({ page }) => {
  const { reviewId } = await setupReview(page);
  const { error } = await seed(reviewId);
  expect(error).toBeNull();
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);

  const prisma = page.getByLabel("Contadores PRISMA");
  await expect(prisma).toContainText("Identificados: 4");
  await expect(prisma).toContainText("Duplicados: 1");
  await expect(prisma).toContainText("Triados: 2");

  const rail = page.getByRole("navigation", { name: "Trilho de fases" });
  await expect(rail).toContainText("Importar");
  await expect(rail.locator("[aria-current='step']")).toHaveCount(1);
});

test("export de auditoria entrega JSON e CSV (FR-035/SC-006)", async ({ page }) => {
  const { reviewId } = await setupReview(page);
  await seed(reviewId);
  await page.goto(`/reviews/${reviewId}/workbench`);

  const jsonResp = await page.request.get(`/reviews/${reviewId}/audit/export?format=json`);
  expect(jsonResp.status()).toBe(200);
  expect(jsonResp.headers()["content-disposition"]).toContain(".json");
  expect(() => JSON.parse(await jsonResp.text())).not.toThrow();

  const csvResp = await page.request.get(`/reviews/${reviewId}/audit/export?format=csv`);
  expect(csvResp.status()).toBe(200);
  expect(csvResp.headers()["content-disposition"]).toContain(".csv");
  expect(await csvResp.text()).toContain("id,created_at,actor_type");
});

test("estado de fila reabre no mesmo filtro/ordenação por URL (FR-037)", async ({ page }) => {
  const { reviewId } = await setupReview(page);
  await seed(reviewId);
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);

  await page.getByLabel("Filtrar:").selectOption("undecided");
  await expect(page).toHaveURL(/qfilter=undecided/);

  // Reabrir a mesma URL preserva o filtro selecionado.
  await page.goto(page.url());
  await expect(page.getByLabel("Filtrar:")).toHaveValue("undecided");
});
```

- [ ] **Step 2: Rodar o e2e do shell**

Run: `npm run test:e2e -- shell-prisma`
Expected: PASS (3 testes). (Requer Supabase local + app servíveis pelo Playwright, conforme
`playwright.config`.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/shell-prisma.spec.ts
git commit -m "test(e2e): shell — trilho, PRISMA número-a-número, export auditoria, fila por URL"
```

---

## Task 12: Verificação final, COMPLETION e CHECKPOINT 3 (PARADA)

**Files:**
- Create: `specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-6.md`
- Modify: `specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md` (marcar Fatia 6)

- [ ] **Step 1: Suíte completa verde (evidência antes de afirmar — verification-before-completion)**

Run: `npm run lint && npm run typecheck && npm run test && npm run test:e2e`
Expected: PASS em todas. Cole a saída real no COMPLETION; se algo falhar, **pare e corrija**
antes de seguir — não declare conclusão sem evidência.

- [ ] **Step 2: Conferir o gate de cobertura da Fatia 6**

Checklist (todos devem ser verdadeiros):
- FR-035 export JSON+CSV — Route Handler + serializadores + e2e ✔
- FR-036 contadores vivos (view única, número-a-número) — `prisma_counter` + PrismaBar + e2e ✔
- FR-037 fila reabrível por URL — `queue-url.ts` + ScreeningQueue + e2e ✔
- US7 trilho com 5 estados, Viés/Certeza desligadas e não-bloqueantes ✔
- SC-004 número-a-número (integration + e2e) ✔ · SC-006 reversões na trilha (integration) ✔
- Nenhuma tabela/mutação nova; nenhuma rota separou o workbench (Princípio V) ✔
- Nada de Marco 3 (fluxograma PRISMA renderizado / DOCX-PDF-MD) entrou ✔

- [ ] **Step 3: Escrever `COMPLETION-fatia-6.md`**

Espelhar o formato do `COMPLETION-fatia-5.md`: User Story entregue (US7), tabela FR→onde
(FR-035/036/037), transversais reforçadas (SC-004/006, a11y do trilho/barra), decisões de
implementação (D-F6.\*: views `security_invoker` como fonte única; export como Route Handler;
estado de fila puro client-side sem refetch; trilho derivado de contadores+protocolo),
e a saída real das verificações do Step 1.

- [ ] **Step 4: Atualizar o estado das fatias no `slicing.md`**

Marcar `- [x] Fatia 6 — Shell, trilho & PRISMA vivo + export de auditoria (CHECKPOINT 3 — aguardando merge)`.

- [ ] **Step 5: Commit final da fatia (no branch isolado)**

```bash
git add specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-6.md specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md
git commit -m "docs(fatia6): completion report + slicing state (CHECKPOINT 3)"
```

- [ ] **Step 6: PARAR — CHECKPOINT 3 (parada obrigatória entre fatias)**

**NÃO** fazer `git merge` nem `git push`. Apresentar ao desenvolvedor:
- o branch `build/001-marco1-nucleo-fluxo/6-shell-prisma-auditoria`;
- o diff da fatia;
- a saída de `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`.

Aguardar a revisão e o **merge manual** do desenvolvedor. Como esta é a **última fatia** do
Marco 1, após o merge o Marco está completo — não há próxima fatia a encadear.

---

## Self-Review (rodado pelo autor do plano)

**1. Cobertura do escopo da Fatia 6 (slicing.md §Fatia 6):**
- Trilho de fases (feito/em curso/pendente/travado/opcional-desligado; Viés/Certeza off) →
  T5 (derivação) + T6 (`PhaseRail`) + T8 (montagem). ✔
- Barra PRISMA viva ligada à view `prisma_counter` (fonte única, SC-004) → T1 (view) + T2
  (query) + T6 (`PrismaBar`) + T8. ✔
- Painel de jobs e de custo no shell → T7 + T8. ✔
- Estado de fila na URL (FR-037) → T9 + T10. ✔
- Export da trilha de auditoria JSON+CSV (A1, FR-035) → T3 + T4 + T7 (links) + T11 (e2e). ✔
- Fora de escopo respeitado: nenhum fluxograma PRISMA renderizado nem DOCX/PDF/MD. ✔

**2. Varredura de placeholders:** sem "TBD/TODO". Pontos onde nomes de coluna dependem de
fatias anteriores (`question`, `protocol.state`, parâmetros de `decide_screening`) trazem
nota explícita de verificação em `src/types/database.ts`/`actions.ts` — não são placeholders
de comportamento, e a lógica testada (funções puras) independe deles.

**3. Consistência de tipos:** `PrismaCounters` (camelCase no TS, snake_case na view) usado
igual em T2/T6/T8. `Phase`/`PhaseStatus`/`PhaseInput` idênticos entre T5 e T6. `QueueViewState`
e `applyQueueView` idênticos entre T9 e T10. `AuditRow` idêntico entre T3 e T4. `JobsAndUsage`
idêntico entre T7 e T8.

**4. Ordem de dependências:** T1(view)→T2(query)→T5/T6/T8(shell); T3→T4→T7(links); T9→T10;
T11 depende de T1–T10; T12 fecha. Migrations precedem o código que as consome (Princípio IV). ✔
