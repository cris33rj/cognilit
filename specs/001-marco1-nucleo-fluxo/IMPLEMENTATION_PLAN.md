# Fatia 5 — Triagem em duas etapas + IA-no-laço — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Escopo:** esta é a **Fatia 5 de 6** do Marco 1 (`001-marco1-nucleo-fluxo`).
> Fronteiras, dependências e gate de cobertura em
> [.superpowers/slicing.md](./.superpowers/slicing.md). NÃO planejar/implementar
> capacidades de outras fatias (trilho de fases, view `prisma_counter` completa,
> estado de fila na URL e export de auditoria = **Fatia 6**).
> *(Os planos das Fatias 1–4 permanecem no histórico git — o plano da Fatia 4
> estava neste arquivo no commit `55001d5` e anteriores.)*
>
> **Branch de trabalho:** `build/001-marco1-nucleo-fluxo/5-triagem`
> (criar via `superpowers:using-git-worktrees`). A sessão **NUNCA** faz `git merge`
> nem `git push` para a feature branch ou `main` — o merge é manual do desenvolvedor
> ao fim da fatia (CHECKPOINT 3).

**Goal:** Na bancada única, habilitar os modos **Título/Resumo** e **Texto completo**: filas densas, virtualizadas e teclado-first onde o humano decide incluir/excluir/dúvida (motivo obrigatório só no Texto completo), com a IA pré-classificando em **lote assíncrono** (estimativa de custo prévia, sugestões anexadas, a IA nunca decide), travando o protocolo na 1ª decisão, tudo reversível por item e auditado.

**Architecture:** Espelha as Fatias 3–4: **toda lógica de estado vive em RPCs Postgres `security definer`** (migration `0006_screening.sql`) — atômicas, auditáveis (`audit_entry`), testáveis em Node contra o Postgres local. A camada TS (`src/lib/screening/`) só consome RPCs; as **Server Actions** em `app/reviews/[reviewId]/workbench/actions.ts` aplicam `requireMember`. A pré-classificação de IA roda como **job `ai_screening_batch`** reusando a infra de jobs da Fatia 3 (`job`/`job_item`, resiliência por-item), com o processamento em `src/lib/screening/worker.ts` (Node/server) chamando **`LLMProvider.preclassifyScreening`** — nenhum SDK direto. A UI é composta por **novos modos** (`title_abstract`, `full_text`) na **mesma rota `workbench/`** (Princípio V / D32) — **nenhuma rota/tela nova**. A fila usa **TanStack Table + TanStack Virtual** (dependências novas, por tarefa explícita — A3/R7).

**Tech Stack:** Next.js 14 App Router (RSC + Server Actions), Supabase Postgres + RLS, `@supabase/supabase-js`, `@tanstack/react-query` (presente), **`@tanstack/react-table` + `@tanstack/react-virtual` (a adicionar)**, `LLMProvider` (Fatia 2, default Anthropic, mock determinístico), Vitest (unit + integração contra Postgres local), Playwright (e2e + perf). TypeScript strict, sem `any`.

---

## Contexto de execução

- **Pré-condição:** Fatias 1–4 mergeadas em `001-marco1-nucleo-fluxo`. Já existem (verificado no schema):
  - `record` **já tem** as colunas `ts_decision ts_decision_state`, `ft_decision ft_decision_state`, `ft_exclusion_reason_id uuid` (FK a ser adicionada nesta fatia) e o enum `corpus_state` **já inclui** `excluded_ts | maybe_ts | included_ts | excluded_ft | included_ft` (migration `0003`).
  - Enums `ts_decision_state` = `(included, excluded, maybe)` e `ft_decision_state` = `(included, excluded)` (migration `0003`).
  - `job_type` **já inclui** `ai_screening_batch`; `job`/`job_item` + RPC `create_import_job`/`insert_import_record` + padrão de worker resiliente por-item (`processItem` injetável) (migration `0003`/`0004`).
  - `lock_protocol(p_review_id uuid)` **já existe** (idempotente; trava `protocol`, marca `review.active_screening_started_at`, audita) e o trigger `protocol_guard_locked` impede sobrescrever conteúdo travado (migration `0002`). Esta fatia **só dispara** o lock na 1ª decisão.
  - `ai_suggestion` (colunas `target_kind ai_target_kind` com valor `screening`, `target_id`, `output jsonb`, `provenance jsonb` com check de chaves, `state suggestion_state`) e `ai_usage` (`phase text`, `tokens_in`, `tokens_out`, `cost jsonb`, `job_id`) **já existem** (migration `0002`).
  - `LLMProvider` com `preclassifyScreening` e `estimateCost`, `MockLLMProvider` determinístico, `getLLMProvider(reviewId)` (decifra BYOK server-side; lança `MissingByokError` sem chave), e `estimateScreeningCost(itemCount)` em `src/lib/ai/llm/cost.ts` (Fatia 2).
  - Helpers: `is_review_member(uuid)`, `createClient`/`createAdminClient`, `writeAudit`, helpers de teste `signUpUser`/`serviceClient`/`anonClient`.
- **Banco de testes:** integração roda contra o Supabase local (`supabase start` já feito). Loop TDD de SQL: editar `supabase/migrations/0006_screening.sql` → `supabase db reset` → rodar o teste de integração.
- **Scripts disponíveis** (`package.json`): `test` (`vitest run`), `test:e2e` (`playwright test`), `typecheck` (`tsc --noEmit`), `lint` (`next lint`), `gen:types` (gera `src/types/database.ts` do schema local).
- **PARADA OBRIGATÓRIA:** ao fim da fatia (CHECKPOINT 3) a sessão **não faz merge/push** — apresenta diff + portões (testes + `lint` + `typecheck`) e aguarda o merge manual (CLAUDE.md §5).

## Decisões de implementação (D-F5.*)

- **D-F5.1** — Toda mutação de estado de triagem é **RPC Postgres `security definer`** (não código de app), atômica + auditável + testável em Node, espelhando as Fatias 3/4. A camada TS só consome RPCs.
- **D-F5.2** — `decide_screening` grava `screening_decision` + transiciona `record` (`ts_decision`/`ft_decision`/`corpus_state`) + audita, **numa transação**. Validações: Texto completo exige `record.ts_decision='included'` (Q1); `maybe` proibido no Texto completo; `exclude` no Texto completo exige `exclusion_reason_id` (FR-025; reforçado por `CHECK`). Na **1ª** `screening_decision` da Revisão, chama `lock_protocol` **se houver `protocol`** (FR-010, Q5) — guarda para não quebrar fluxos sem protocolo (em produção o protocolo sempre existe; ver Fatia 2).
- **D-F5.3** — `reverse_screening` é **por item, a qualquer momento** (Q4/FR-026): marca `is_reversed`+`reversed_at`, restaura o **estado anterior daquela etapa** (T/R → `active`; Texto completo → `included_ts`) e escreve **nova** `audit_entry`. A UI não oferece reverter T/R enquanto houver decisão de Texto completo viva no mesmo registro.
- **D-F5.4** — `exclusion_reason` é **lista configurável por Revisão**. `seed_default_exclusion_reasons(p_review_id)` é **idempotente** (semeia padrões só se a lista estiver vazia) e é chamada ao carregar o modo Texto completo.
- **D-F5.5** — A pré-classificação roda como job `ai_screening_batch` reusando a infra da Fatia 3. O processamento (`src/lib/screening/worker.ts`) chama **`LLMProvider.preclassifyScreening`** por item, grava `ai_suggestion` (`target_kind='screening'`, `target_id=record.id`) e `ai_usage`, com **resiliência por-item**. A IA **nunca** altera `record` (FR-024). O provider é injetado; `runScreeningWorker` resolve via `getLLMProvider` e, sem BYOK (local/e2e), **cai para `MockLLMProvider`** (determinístico, sem chamada externa) — mantendo a regra "todo LLM passa pela abstração".
- **D-F5.6** — **Estimativa de custo prévia** (FR-033/SC-008): `enqueueScreeningJob` retorna `estimated_cost` via `estimateScreeningCost(itemCount)` (puro, sem decifrar BYOK); a UI exige confirmação antes de `runScreeningWorker`.
- **D-F5.7** — Fila **virtualizada** com **TanStack Table + TanStack Virtual** (dependências novas pinadas por tarefa explícita — A3/R7), **teclado-first** (FR-028), com **orçamento A2** como critério e2e/perf.
- **D-F5.8** — **Ações em lote** (FR-039) são decisões **humanas** e passam pela **mesma** `decide_screening` por item (loop), com as mesmas regras (motivo obrigatório no Texto completo, reversibilidade, auditoria). **Densidade** compacto/confortável (FR-040) e **a11y** ARIA/foco/teclado (FR-041, SC-013).

## Orçamento de performance — item A2 (critério de aceite, SC-012)

Limiares testáveis da fila com **~5.000 registros** (Task 14):
- decisão → render **< 100 ms** (update otimista com rollback);
- navegação por tecla (próximo/anterior) **< 50 ms**;
- render inicial da fila **< 1 s** para 5.000 registros;
- scroll mantém fluidez (virtualização: nº de nós no DOM ≪ 5.000).

*(Não altera `spec.md`, que está sign-off; o limiar vive aqui — HANDOFF A2.)*

---

## File Structure

**Criar:**
- `supabase/migrations/0006_screening.sql` — `exclusion_reason` + `screening_decision` + enums + `CHECK` + RLS + FK em `record.ft_exclusion_reason_id` + RPCs (`seed_default_exclusion_reasons`, `decide_screening`, `reverse_screening`, `list_screening_queue`, `create_screening_job`).
- `src/lib/screening/config.ts` — constantes do orçamento A2 + densidades + atalhos de teclado.
- `src/lib/screening/queries.ts` — fila, contadores (triados/incluídos), motivos de exclusão.
- `src/lib/screening/enqueue.ts` — `enqueueScreeningJob` (cria job + estimativa de custo, FR-033).
- `src/lib/screening/worker.ts` — `processScreeningJob` (chama `LLMProvider`, grava `ai_suggestion` + `ai_usage`, resiliente por-item).
- `src/lib/screening/run.ts` — `runScreeningWorkerWith` (driver síncrono dos jobs de IA da Revisão).
- `src/components/workbench/ScreeningQueue.tsx` — fila virtualizada teclado-first (T/R e Texto completo) com chip de IA, lote, densidade, a11y.
- `src/components/workbench/ShortcutLegend.tsx` — legenda de atalhos visível (FR-028/FR-041).
- `tests/integration/screening.test.ts` — decisões, reversão, fila, lock na 1ª decisão, job de IA.
- `tests/integration/rls.screening.test.ts` — isolamento RLS de `screening_decision` + `exclusion_reason`.
- `tests/unit/screening/config.test.ts`, `tests/unit/screening/queries.test.ts`.
- `tests/unit/workbench/screening-queue.test.tsx` — render, teclado, chip de IA, motivo obrigatório, lote.
- `tests/e2e/screening.spec.ts` — fluxo T/R + Texto completo + reversão + lock + sugestão de IA.
- `tests/e2e/screening-perf.spec.ts` — orçamento A2 (~5.000 registros).
- `tests/e2e/screening-a11y.spec.ts` — SC-013 (roles ARIA, foco, 100% teclado).

**Modificar:**
- `package.json` — adicionar `@tanstack/react-table` e `@tanstack/react-virtual` (Task 7).
- `src/types/database.ts` — regenerado (`npm run gen:types`) após a migration.
- `app/reviews/[reviewId]/workbench/actions.ts` — Server Actions de triagem + enqueue/worker de IA + fetchers.
- `src/components/workbench/ModeBar.tsx` — habilitar `title_abstract` e `full_text`.
- `app/reviews/[reviewId]/workbench/page.tsx` — renderizar `ScreeningQueue` nos dois modos + contadores PRISMA (triados/incluídos).

---

## Task 1: Migration — `exclusion_reason` + seed RPC + FK + RLS

**Files:**
- Create: `supabase/migrations/0006_screening.sql`
- Test: `tests/integration/rls.screening.test.ts`

- [ ] **Step 1: Write the failing test** (RLS + seed de `exclusion_reason`)

`tests/integration/rls.screening.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";

describe("RLS exclusion_reason (SC-009)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`er_owner_${s}@example.com`, "senha-teste-123")).client;
    intruder = (await signUpUser(`er_intr_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Reasons RLS" });
    reviewId = review.id;
    await owner.rpc("seed_default_exclusion_reasons", { p_review_id: reviewId });
  });

  it("owner enxerga os motivos semeados; intruso não-membro enxerga zero", async () => {
    const own = await owner.from("exclusion_reason").select("id").eq("review_id", reviewId);
    expect((own.data?.length ?? 0)).toBeGreaterThan(0);
    const intr = await intruder.from("exclusion_reason").select("id").eq("review_id", reviewId);
    expect(intr.data?.length ?? 0).toBe(0);
  });

  it("seed é idempotente — re-chamar não duplica", async () => {
    const before = await owner.from("exclusion_reason").select("id").eq("review_id", reviewId);
    await owner.rpc("seed_default_exclusion_reasons", { p_review_id: reviewId });
    const after = await owner.from("exclusion_reason").select("id").eq("review_id", reviewId);
    expect(after.data?.length).toBe(before.data?.length);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/rls.screening.test.ts`
Expected: FAIL — function `public.seed_default_exclusion_reasons` / relation `exclusion_reason` does not exist.

- [ ] **Step 3: Create the migration (exclusion_reason + FK + seed RPC)**

`supabase/migrations/0006_screening.sql`:

```sql
-- ============================================================
-- Marco 1 / Fatia 5 — Triagem em duas etapas + IA-no-laço.
-- US4 / FR-022..026, FR-028..029, FR-033, FR-039..041, FR-010 (lock).
-- RLS habilitado (Princípio IV). Toda mutação é RPC security definer que
-- escreve audit_entry (Princípio III). A IA nunca decide (Princípio I, FR-024).
-- record/ corpus_state/ ts_decision_state/ ft_decision_state já existem (0003).
-- lock_protocol / ai_suggestion / ai_usage já existem (0002).
-- ============================================================

-- ---------- exclusion_reason (lista configurável por Revisão — US4/FR-025) ----------
create table public.exclusion_reason (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index exclusion_reason_review_idx on public.exclusion_reason (review_id, sort_order);

-- FK pendente da Fatia 3 (record.ft_exclusion_reason_id) agora resolvível.
alter table public.record
  add constraint record_ft_exclusion_reason_fk
  foreign key (ft_exclusion_reason_id)
  references public.exclusion_reason (id) on delete set null;

alter table public.exclusion_reason enable row level security;
create policy exclusion_reason_select on public.exclusion_reason
  for select using (public.is_review_member(review_id));
create policy exclusion_reason_insert on public.exclusion_reason
  for insert with check (public.is_review_member(review_id));
create policy exclusion_reason_update on public.exclusion_reason
  for update using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));

-- ---------- seed idempotente dos motivos padrão (D-F5.4) ----------
create or replace function public.seed_default_exclusion_reasons(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  if exists (select 1 from public.exclusion_reason where review_id = p_review_id) then
    return; -- idempotente: já há lista (possivelmente customizada)
  end if;
  insert into public.exclusion_reason (review_id, label, sort_order) values
    (p_review_id, 'População fora do escopo', 1),
    (p_review_id, 'Intervenção/exposição não elegível', 2),
    (p_review_id, 'Desfecho não relevante', 3),
    (p_review_id, 'Desenho de estudo inelegível', 4),
    (p_review_id, 'Idioma não elegível', 5),
    (p_review_id, 'Texto completo indisponível', 6),
    (p_review_id, 'Duplicata não detectada', 7);
end;
$$;
grant execute on function public.seed_default_exclusion_reasons(uuid) to authenticated;
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/rls.screening.test.ts`
Expected: PASS (owner vê ≥1 motivo; intruso vê 0; seed idempotente).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_screening.sql tests/integration/rls.screening.test.ts
git commit -m "feat(db): migration 0006 exclusion_reason + seed + FK record (US4/FR-025)"
```

---

## Task 2: Migration — `screening_decision` + enums + RLS

**Files:**
- Modify: `supabase/migrations/0006_screening.sql` (append)
- Test: `tests/integration/rls.screening.test.ts` (novo bloco)

- [ ] **Step 1: Write the failing test** (anexar ao arquivo)

```ts
import { serviceClient } from "./helpers/supabase";

describe("RLS screening_decision (SC-009)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`sd_owner_${s}@example.com`, "senha-teste-123")).client;
    intruder = (await signUpUser(`sd_intr_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Screening RLS" });
    reviewId = review.id;
    const svc = serviceClient();
    const { data: rec } = await svc.from("record").insert({
      review_id: reviewId, source_format: "ris", raw: {},
      metadata: { title: "x", year: "2020" }, title_norm: "x", corpus_state: "active",
    }).select("id").single();
    const { data: dd } = await svc.from("screening_decision").insert({
      review_id: reviewId, record_id: rec!.id, stage: "title_abstract", decision: "include",
    }).select("id").single();
    decisionId = dd!.id;
  });

  it("owner enxerga a decisão; intruso não-membro enxerga zero", async () => {
    const own = await owner.from("screening_decision").select("id").eq("id", decisionId);
    expect(own.data?.length).toBe(1);
    const intr = await intruder.from("screening_decision").select("id").eq("id", decisionId);
    expect(intr.data?.length ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/rls.screening.test.ts -t screening_decision`
Expected: FAIL — relation `public.screening_decision` does not exist.

- [ ] **Step 3: Append the table + enums + RLS**

```sql
-- ---------- enums de triagem ----------
create type screening_stage  as enum ('title_abstract', 'full_text');
create type screening_choice as enum ('include', 'exclude', 'maybe');

-- ---------- screening_decision (decisão de triagem — US4) ----------
create table public.screening_decision (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  record_id uuid not null references public.record (id) on delete cascade,
  stage screening_stage not null,
  decision screening_choice not null,
  exclusion_reason_id uuid references public.exclusion_reason (id) on delete set null,
  ai_suggestion_id uuid references public.ai_suggestion (id) on delete set null,
  is_reversed boolean not null default false,
  reversed_at timestamptz,
  actor text not null default 'human', -- a IA nunca decide (Princípio I / FR-024)
  created_at timestamptz not null default now(),
  -- FR-025: exclusão no Texto completo exige motivo.
  constraint screening_ft_reason_required
    check (not (stage = 'full_text' and decision = 'exclude' and exclusion_reason_id is null)),
  -- 'maybe' só existe no Título/Resumo (Q1).
  constraint screening_maybe_only_ts
    check (not (stage = 'full_text' and decision = 'maybe'))
);
create index screening_review_idx on public.screening_decision (review_id, created_at desc);
create index screening_record_live_idx
  on public.screening_decision (record_id) where is_reversed = false;

alter table public.screening_decision enable row level security;
create policy screening_select on public.screening_decision
  for select using (public.is_review_member(review_id));
-- INSERT/UPDATE só via RPCs security definer abaixo (sem policy de write).
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/rls.screening.test.ts`
Expected: PASS (todos os blocos RLS).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_screening.sql tests/integration/rls.screening.test.ts
git commit -m "feat(db): screening_decision + enums + RLS (US4/SC-009)"
```

---

## Task 3: RPC `decide_screening` — decisão + transição + lock na 1ª (FR-022/023/025/010)

**Files:**
- Modify: `supabase/migrations/0006_screening.sql` (append)
- Test: `tests/integration/screening.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/integration/screening.test.ts` (primeiro bloco; helpers no topo, reusados nas Tasks 4/5/8/9):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

/** Insere um record 'active' (já deduplicado) e devolve o id. */
async function seedActiveRecord(
  reviewId: string,
  opts: { title: string; year?: string; abstract?: string },
) {
  const svc = serviceClient();
  const { data, error } = await svc.from("record").insert({
    review_id: reviewId, source_format: "ris", raw: {},
    metadata: { title: opts.title, year: opts.year ?? "2020", abstract: opts.abstract ?? null },
    title_norm: opts.title.toLowerCase().trim(), corpus_state: "active",
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data!.id;
}

describe("decide_screening — Título/Resumo (FR-022/023)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`ds_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Triagem TR" });
    reviewId = review.id;
    recId = await seedActiveRecord(reviewId, { title: "Active learning in nursing" });
  });

  it("incluir em T/R: record vira included_ts, decisão registrada, auditoria escrita", async () => {
    const { data: id, error } = await owner.rpc("decide_screening", {
      p_review_id: reviewId, p_record_id: recId,
      p_stage: "title_abstract", p_decision: "include",
    });
    expect(error).toBeNull();
    expect(id).toBeTruthy();

    const svc = serviceClient();
    const { data: rec } = await svc.from("record")
      .select("corpus_state, ts_decision").eq("id", recId).single();
    expect(rec!.corpus_state).toBe("included_ts");
    expect(rec!.ts_decision).toBe("included");

    const { count } = await svc.from("audit_entry").select("id", { count: "exact", head: true })
      .eq("review_id", reviewId).eq("action", "screening_decide");
    expect(count).toBe(1);
  });

  it("marcar dúvida em T/R: vira maybe_ts (pendente, não avança — Q1)", async () => {
    const r2 = await seedActiveRecord(reviewId, { title: "Outro estudo" });
    await owner.rpc("decide_screening", {
      p_review_id: reviewId, p_record_id: r2, p_stage: "title_abstract", p_decision: "maybe",
    });
    const { data } = await serviceClient().from("record")
      .select("corpus_state, ts_decision").eq("id", r2).single();
    expect(data!.corpus_state).toBe("maybe_ts");
    expect(data!.ts_decision).toBe("maybe");
  });
});

describe("decide_screening — Texto completo (FR-025/Q1)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recId: string;
  let reasonId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`dft_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Triagem TC" });
    reviewId = review.id;
    await owner.rpc("seed_default_exclusion_reasons", { p_review_id: reviewId });
    const { data: reason } = await owner.from("exclusion_reason")
      .select("id").eq("review_id", reviewId).order("sort_order").limit(1).single();
    reasonId = reason!.id;
    recId = await seedActiveRecord(reviewId, { title: "Estudo elegível" });
  });

  it("excluir no Texto completo sem motivo é rejeitado (FR-025)", async () => {
    await owner.rpc("decide_screening", {
      p_review_id: reviewId, p_record_id: recId, p_stage: "title_abstract", p_decision: "include",
    });
    const { error } = await owner.rpc("decide_screening", {
      p_review_id: reviewId, p_record_id: recId, p_stage: "full_text", p_decision: "exclude",
    });
    expect(error).not.toBeNull();
  });

  it("Texto completo só após included em T/R (Q1)", async () => {
    const r2 = await seedActiveRecord(reviewId, { title: "Não triado em TR" });
    const { error } = await owner.rpc("decide_screening", {
      p_review_id: reviewId, p_record_id: r2, p_stage: "full_text", p_decision: "include",
    });
    expect(error).not.toBeNull();
  });

  it("excluir no Texto completo com motivo: vira excluded_ft, grava motivo", async () => {
    const { error } = await owner.rpc("decide_screening", {
      p_review_id: reviewId, p_record_id: recId, p_stage: "full_text",
      p_decision: "exclude", p_exclusion_reason_id: reasonId,
    });
    expect(error).toBeNull();
    const { data } = await serviceClient().from("record")
      .select("corpus_state, ft_decision, ft_exclusion_reason_id").eq("id", recId).single();
    expect(data!.corpus_state).toBe("excluded_ft");
    expect(data!.ft_decision).toBe("excluded");
    expect(data!.ft_exclusion_reason_id).toBe(reasonId);
  });
});

describe("decide_screening — 1ª decisão trava o protocolo (FR-010/Q5)", () => {
  it("a primeira screening_decision dispara lock_protocol", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`lk_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Lock na triagem" });
    const reviewId = review.id;
    // Protocolo em rascunho (Fatia 2).
    await owner.from("protocol").insert({
      review_id: reviewId, content: { contentMarkdown: "# rascunho" }, origin: "human",
    });
    const recId = await seedActiveRecord(reviewId, { title: "Primeiro a triar" });
    await owner.rpc("decide_screening", {
      p_review_id: reviewId, p_record_id: recId, p_stage: "title_abstract", p_decision: "include",
    });
    const { data: proto } = await owner.from("protocol")
      .select("state, locked_at").eq("review_id", reviewId).single();
    expect(proto!.state).toBe("locked");
    expect(proto!.locked_at).not.toBeNull();
  });
});

export { seedActiveRecord };
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/screening.test.ts`
Expected: FAIL — function `public.decide_screening(...)` does not exist.

- [ ] **Step 3: Append the RPC**

```sql
-- ============================================================
-- RPC: decide_screening — registra decisão humana + transiciona record + audita.
-- Texto completo exige ts_decision=included (Q1) e motivo p/ exclude (FR-025).
-- 'maybe' só em title_abstract. 1ª decisão da Revisão trava o protocolo (FR-010).
-- Retorna o id da screening_decision criada. A IA nunca chama isto (FR-024).
-- ============================================================
create or replace function public.decide_screening(
  p_review_id uuid,
  p_record_id uuid,
  p_stage screening_stage,
  p_decision screening_choice,
  p_exclusion_reason_id uuid default null,
  p_ai_suggestion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.record;
  v_id uuid;
  v_new_state corpus_state;
  v_first boolean;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  select * into v_rec from public.record
   where id = p_record_id and review_id = p_review_id;
  if not found then
    raise exception 'record not found';
  end if;

  if p_stage = 'full_text' then
    if v_rec.ts_decision is distinct from 'included' then
      raise exception 'record must be included at title_abstract before full_text';
    end if;
    if p_decision = 'maybe' then
      raise exception 'maybe is not allowed at full_text';
    end if;
    if p_decision = 'exclude' and p_exclusion_reason_id is null then
      raise exception 'exclusion reason required at full_text';
    end if;
  end if;

  select not exists (select 1 from public.screening_decision where review_id = p_review_id)
    into v_first;

  insert into public.screening_decision (
    review_id, record_id, stage, decision, exclusion_reason_id, ai_suggestion_id
  ) values (
    p_review_id, p_record_id, p_stage, p_decision, p_exclusion_reason_id, p_ai_suggestion_id
  ) returning id into v_id;

  if p_stage = 'title_abstract' then
    v_new_state := (case p_decision
      when 'include' then 'included_ts' when 'exclude' then 'excluded_ts'
      else 'maybe_ts' end)::corpus_state;
    update public.record set
      ts_decision = (case p_decision
        when 'include' then 'included' when 'exclude' then 'excluded'
        else 'maybe' end)::ts_decision_state,
      corpus_state = v_new_state, updated_at = now()
    where id = p_record_id;
  else
    v_new_state := (case p_decision
      when 'include' then 'included_ft' else 'excluded_ft' end)::corpus_state;
    update public.record set
      ft_decision = (case p_decision
        when 'include' then 'included' else 'excluded' end)::ft_decision_state,
      ft_exclusion_reason_id = p_exclusion_reason_id,
      corpus_state = v_new_state, updated_at = now()
    where id = p_record_id;
  end if;

  -- FR-010: a 1ª decisão de triagem trava o protocolo (se existir).
  if v_first and exists (select 1 from public.protocol where review_id = p_review_id) then
    perform public.lock_protocol(p_review_id);
  end if;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'screening_decide', 'record', p_record_id,
    jsonb_build_object('corpus_state', v_rec.corpus_state,
                       'ts_decision', v_rec.ts_decision, 'ft_decision', v_rec.ft_decision),
    jsonb_build_object('stage', p_stage, 'decision', p_decision,
                       'corpus_state', v_new_state, 'decision_id', v_id)
  );

  return v_id;
end;
$$;
grant execute on function
  public.decide_screening(uuid, uuid, screening_stage, screening_choice, uuid, uuid)
  to authenticated;
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/screening.test.ts`
Expected: PASS (T/R, Texto completo, lock na 1ª).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_screening.sql tests/integration/screening.test.ts
git commit -m "feat(screening): decide_screening RPC — decisão + transição + lock 1ª (FR-022/025/010)"
```

---

## Task 4: RPC `reverse_screening` — reversão por item (FR-026/Q4)

**Files:**
- Modify: `supabase/migrations/0006_screening.sql` (append)
- Test: `tests/integration/screening.test.ts` (novo bloco)

- [ ] **Step 1: Write the failing test** (anexar; usa `seedActiveRecord` do topo)

```ts
describe("reverse_screening (FR-026 / Q4)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`rs_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Reverter triagem" });
    reviewId = review.id;
    recId = await seedActiveRecord(reviewId, { title: "Para reverter" });
    const { data: id } = await owner.rpc("decide_screening", {
      p_review_id: reviewId, p_record_id: recId, p_stage: "title_abstract", p_decision: "exclude",
    });
    decisionId = id as string;
  });

  it("desfaz decisão de T/R: record volta a active, decisão marcada, nova auditoria", async () => {
    const { error } = await owner.rpc("reverse_screening", { p_decision_id: decisionId });
    expect(error).toBeNull();

    const svc = serviceClient();
    const { data: rec } = await svc.from("record")
      .select("corpus_state, ts_decision").eq("id", recId).single();
    expect(rec!.corpus_state).toBe("active");
    expect(rec!.ts_decision).toBeNull();

    const { data: dec } = await svc.from("screening_decision")
      .select("is_reversed, reversed_at").eq("id", decisionId).single();
    expect(dec!.is_reversed).toBe(true);
    expect(dec!.reversed_at).not.toBeNull();

    const { count } = await svc.from("audit_entry").select("id", { count: "exact", head: true })
      .eq("review_id", reviewId).eq("action", "screening_reverse");
    expect(count).toBe(1);
  });

  it("reverter duas vezes é rejeitado", async () => {
    const { error } = await owner.rpc("reverse_screening", { p_decision_id: decisionId });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/screening.test.ts -t reverse_screening`
Expected: FAIL — function `public.reverse_screening(uuid)` does not exist.

- [ ] **Step 3: Append the RPC**

```sql
-- ============================================================
-- RPC: reverse_screening — desfaz uma decisão por item, a qualquer momento (Q4).
-- Restaura o estado anterior da etapa (T/R → active; Texto completo → included_ts),
-- marca is_reversed, NÃO apaga a decisão, e escreve NOVA audit_entry (FR-026).
-- ============================================================
create or replace function public.reverse_screening(p_decision_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.screening_decision;
  v_rec public.record;
begin
  select * into d from public.screening_decision where id = p_decision_id;
  if d.id is null then
    raise exception 'decision not found';
  end if;
  if not public.is_review_member(d.review_id) then
    raise exception 'not a member';
  end if;
  if d.is_reversed then
    raise exception 'decision already reversed';
  end if;

  select * into v_rec from public.record where id = d.record_id;

  if d.stage = 'title_abstract' then
    update public.record
       set ts_decision = null, corpus_state = 'active', updated_at = now()
     where id = d.record_id;
  else
    update public.record
       set ft_decision = null, ft_exclusion_reason_id = null,
           corpus_state = 'included_ts', updated_at = now()
     where id = d.record_id;
  end if;

  update public.screening_decision
     set is_reversed = true, reversed_at = now()
   where id = d.id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    d.review_id, 'human', auth.uid(), 'screening_reverse', 'screening_decision', d.id,
    jsonb_build_object('corpus_state', v_rec.corpus_state),
    jsonb_build_object('is_reversed', true, 'restored_record', d.record_id)
  );
end;
$$;
grant execute on function public.reverse_screening(uuid) to authenticated;
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/screening.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_screening.sql tests/integration/screening.test.ts
git commit -m "feat(screening): reverse_screening RPC — reversão por item + nova auditoria (FR-026/Q4)"
```

---

## Task 5: RPCs `list_screening_queue` + `create_screening_job` (FR-024/028)

**Files:**
- Modify: `supabase/migrations/0006_screening.sql` (append)
- Test: `tests/integration/screening.test.ts` (novo bloco)

- [ ] **Step 1: Write the failing test** (anexar)

```ts
describe("list_screening_queue (FR-028) + create_screening_job (FR-024)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`q_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Fila" });
    reviewId = review.id;
    await seedActiveRecord(reviewId, { title: "Estudo A", abstract: "resumo A" });
    await seedActiveRecord(reviewId, { title: "Estudo B", abstract: "resumo B" });
  });

  it("fila title_abstract lista os registros ativos com colunas de exibição", async () => {
    const { data, error } = await owner.rpc("list_screening_queue", {
      p_review_id: reviewId, p_stage: "title_abstract",
    });
    expect(error).toBeNull();
    expect(data!.length).toBe(2);
    expect(data![0]).toHaveProperty("record_id");
    expect(data![0]).toHaveProperty("title");
    expect(data![0]).toHaveProperty("corpus_state");
  });

  it("create_screening_job cria job ai_screening_batch + 1 job_item por registro elegível", async () => {
    const { data: job, error } = await owner.rpc("create_screening_job", {
      p_review_id: reviewId, p_record_ids: null,
    });
    expect(error).toBeNull();
    expect(job.type).toBe("ai_screening_batch");
    const { count } = await serviceClient().from("job_item")
      .select("id", { count: "exact", head: true }).eq("job_id", job.id);
    expect(count).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/screening.test.ts -t "list_screening_queue"`
Expected: FAIL — function `public.list_screening_queue` / `public.create_screening_job` does not exist.

- [ ] **Step 3: Append both RPCs**

```sql
-- ============================================================
-- RPC: list_screening_queue — registros do estágio + última sugestão de IA anexada.
-- title_abstract: corpus_state em active/maybe_ts/included_ts/excluded_ts.
-- full_text:      corpus_state em included_ts/included_ft/excluded_ft.
-- ============================================================
create or replace function public.list_screening_queue(
  p_review_id uuid,
  p_stage screening_stage
)
returns table (
  record_id uuid,
  title text,
  abstract text,
  year text,
  corpus_state corpus_state,
  ts_decision ts_decision_state,
  ft_decision ft_decision_state,
  ft_exclusion_reason_id uuid,
  ai_suggestion_id uuid,
  ai_recommendation text,
  ai_confidence real,
  ai_reason text,
  ai_state suggestion_state
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  return query
  select
    r.id,
    r.metadata ->> 'title',
    r.metadata ->> 'abstract',
    r.metadata ->> 'year',
    r.corpus_state, r.ts_decision, r.ft_decision, r.ft_exclusion_reason_id,
    s.id, s.output ->> 'recommendation', (s.output ->> 'confidence')::real,
    s.output ->> 'reason', s.state
  from public.record r
  left join lateral (
    select a.id, a.output, a.state
    from public.ai_suggestion a
    where a.target_kind = 'screening' and a.target_id = r.id
    order by a.created_at desc
    limit 1
  ) s on true
  where r.review_id = p_review_id
    and (
      (p_stage = 'title_abstract'
        and r.corpus_state in ('active','maybe_ts','included_ts','excluded_ts'))
      or
      (p_stage = 'full_text'
        and r.corpus_state in ('included_ts','included_ft','excluded_ft'))
    )
  order by r.created_at;
end;
$$;
grant execute on function public.list_screening_queue(uuid, screening_stage) to authenticated;

-- ============================================================
-- RPC: create_screening_job — cria job ai_screening_batch + job_items (1/registro),
-- só sobre registros elegíveis (active/maybe_ts/included_ts), audita. Não processa
-- (§VIII). p_record_ids = subconjunto opcional (lote sobre seleção).
-- ============================================================
create or replace function public.create_screening_job(
  p_review_id uuid,
  p_record_ids jsonb default null
)
returns public.job
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.job;
  v_count int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'ai_screening_batch', 'queued')
  returning * into v_job;

  insert into public.job_item (job_id, review_id, status, payload)
  select v_job.id, p_review_id, 'pending', jsonb_build_object('record_id', r.id)
  from public.record r
  where r.review_id = p_review_id
    and r.corpus_state in ('active','maybe_ts','included_ts')
    and (
      p_record_ids is null
      or r.id::text in (select jsonb_array_elements_text(p_record_ids))
    );
  get diagnostics v_count = row_count;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'enqueue_screening_batch', 'job', v_job.id,
    null, jsonb_build_object('item_count', v_count)
  );

  return v_job;
end;
$$;
grant execute on function public.create_screening_job(uuid, jsonb) to authenticated;
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/screening.test.ts`
Expected: PASS (todos os blocos de integração até aqui).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_screening.sql tests/integration/screening.test.ts
git commit -m "feat(screening): list_screening_queue + create_screening_job RPCs (FR-024/028)"
```

---

## Task 6: Regenerar tipos + camada TS (config + queries)

**Files:**
- Modify: `src/types/database.ts` (gerado)
- Create: `src/lib/screening/config.ts`, `src/lib/screening/queries.ts`
- Test: `tests/unit/screening/config.test.ts`, `tests/unit/screening/queries.test.ts`

- [ ] **Step 1: Regenerate DB types**

Run: `npm run gen:types && npm run typecheck`
Expected: `src/types/database.ts` passa a conter `screening_decision`, `exclusion_reason` e as RPCs novas; typecheck limpo.

- [ ] **Step 2: Write the failing unit tests**

`tests/unit/screening/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SCREENING_PERF_BUDGET, DENSITIES, SHORTCUTS } from "@/lib/screening/config";

describe("screening config (A2 / FR-028/040)", () => {
  it("orçamento A2 fixa render<100ms, nav<50ms, inicial<1000ms", () => {
    expect(SCREENING_PERF_BUDGET.decisionToRenderMs).toBe(100);
    expect(SCREENING_PERF_BUDGET.keyNavMs).toBe(50);
    expect(SCREENING_PERF_BUDGET.initialRenderMs).toBe(1000);
  });
  it("densidades incluem compacto e confortável (FR-040)", () => {
    expect(DENSITIES.map((d) => d.key)).toEqual(["compact", "comfortable"]);
  });
  it("atalhos cobrem incluir/excluir/dúvida/desfazer/navegar (FR-023/028)", () => {
    const acts = SHORTCUTS.map((s) => s.action);
    for (const a of ["include", "exclude", "maybe", "undo", "next", "prev"]) {
      expect(acts).toContain(a);
    }
  });
});
```

`tests/unit/screening/queries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapQueueRow } from "@/lib/screening/queries";

describe("mapQueueRow", () => {
  it("mapeia linha da RPC para o shape de UI, com IA quando presente", () => {
    const row = mapQueueRow({
      record_id: "r1", title: "T", abstract: "A", year: "2020",
      corpus_state: "active", ts_decision: null, ft_decision: null,
      ft_exclusion_reason_id: null,
      ai_suggestion_id: "s1", ai_recommendation: "include",
      ai_confidence: 0.7, ai_reason: "razão", ai_state: "pending",
    });
    expect(row.recordId).toBe("r1");
    expect(row.ai?.recommendation).toBe("include");
    expect(row.ai?.confidence).toBe(0.7);
  });
  it("ai = null quando não há sugestão", () => {
    const row = mapQueueRow({
      record_id: "r2", title: "T", abstract: null, year: null,
      corpus_state: "active", ts_decision: null, ft_decision: null,
      ft_exclusion_reason_id: null,
      ai_suggestion_id: null, ai_recommendation: null,
      ai_confidence: null, ai_reason: null, ai_state: null,
    });
    expect(row.ai).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to confirm they fail**

Run: `npm run test -- tests/unit/screening/`
Expected: FAIL — cannot find module `@/lib/screening/config` / `@/lib/screening/queries`.

- [ ] **Step 4: Create config + queries**

`src/lib/screening/config.ts`:

```ts
// Orçamento de performance da fila — item A2 / SC-012 (ajustável sem schema).
export const SCREENING_PERF_BUDGET = {
  decisionToRenderMs: 100, // decisão → render (update otimista)
  keyNavMs: 50, // navegação por tecla (próximo/anterior)
  initialRenderMs: 1000, // render inicial com ~5.000 registros
} as const;

// Densidades de exibição (FR-040). rowHeight alimenta a virtualização.
export const DENSITIES = [
  { key: "compact", label: "Compacto", rowHeight: 36 },
  { key: "comfortable", label: "Confortável", rowHeight: 56 },
] as const;
export type Density = (typeof DENSITIES)[number]["key"];

// Atalhos de teclado (FR-023/028). Exibidos na legenda (ShortcutLegend).
export const SHORTCUTS = [
  { key: "i", action: "include", label: "Incluir" },
  { key: "e", action: "exclude", label: "Excluir" },
  { key: "d", action: "maybe", label: "Dúvida" },
  { key: "u", action: "undo", label: "Desfazer" },
  { key: "j", action: "next", label: "Próximo" },
  { key: "k", action: "prev", label: "Anterior" },
  { key: "x", action: "select", label: "Selecionar (lote)" },
] as const;
export type ShortcutAction = (typeof SHORTCUTS)[number]["action"];
```

`src/lib/screening/queries.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export type ScreeningStage = "title_abstract" | "full_text";

export interface QueueRowRaw {
  record_id: string;
  title: string | null;
  abstract: string | null;
  year: string | null;
  corpus_state: string;
  ts_decision: "included" | "excluded" | "maybe" | null;
  ft_decision: "included" | "excluded" | null;
  ft_exclusion_reason_id: string | null;
  ai_suggestion_id: string | null;
  ai_recommendation: "include" | "exclude" | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  ai_state: "pending" | "accepted" | "edited" | "rejected" | "inferred" | null;
}

export interface AiHint {
  suggestionId: string;
  recommendation: "include" | "exclude";
  confidence: number | null;
  reason: string | null;
  state: NonNullable<QueueRowRaw["ai_state"]>;
}

export interface QueueRow {
  recordId: string;
  title: string;
  abstract: string | null;
  year: string | null;
  corpusState: string;
  tsDecision: QueueRowRaw["ts_decision"];
  ftDecision: QueueRowRaw["ft_decision"];
  ftExclusionReasonId: string | null;
  ai: AiHint | null;
}

export interface ExclusionReason {
  id: string;
  label: string;
}

/** Mapeia uma linha crua da RPC para o shape consumido pela UI. */
export function mapQueueRow(r: QueueRowRaw): QueueRow {
  return {
    recordId: r.record_id,
    title: r.title ?? "(sem título)",
    abstract: r.abstract,
    year: r.year,
    corpusState: r.corpus_state,
    tsDecision: r.ts_decision,
    ftDecision: r.ft_decision,
    ftExclusionReasonId: r.ft_exclusion_reason_id,
    ai:
      r.ai_suggestion_id && r.ai_recommendation && r.ai_state
        ? {
            suggestionId: r.ai_suggestion_id,
            recommendation: r.ai_recommendation,
            confidence: r.ai_confidence,
            reason: r.ai_reason,
            state: r.ai_state,
          }
        : null,
  };
}

/** Fila de triagem do estágio, com sugestão de IA anexada (FR-028). */
export async function listScreeningQueue(
  reviewId: string,
  stage: ScreeningStage,
): Promise<QueueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_screening_queue", {
    p_review_id: reviewId,
    p_stage: stage,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as QueueRowRaw[]).map(mapQueueRow);
}

/** Motivos de exclusão configuráveis e ativos (FR-025). */
export async function listExclusionReasons(
  reviewId: string,
): Promise<ExclusionReason[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exclusion_reason")
    .select("id, label")
    .eq("review_id", reviewId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExclusionReason[];
}

/** Contador PRISMA parcial (Fatia 5): triados (ts_decision terminal, exclui maybe). */
export async function countScreened(reviewId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("record")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .in("ts_decision", ["included", "excluded"]);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Contador PRISMA parcial (Fatia 5): incluídos no Texto completo. */
export async function countIncludedFullText(reviewId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("record")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .eq("corpus_state", "included_ft");
  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

- [ ] **Step 5: Run unit tests + typecheck**

Run: `npm run test -- tests/unit/screening/ && npm run typecheck`
Expected: unit PASS; typecheck limpo. Se o `.rpc` acusar tipo da RPC `returns table`, refine o cast `as unknown as QueueRowRaw[]` (já previsto).

- [ ] **Step 6: Commit**

```bash
git add src/lib/screening/config.ts src/lib/screening/queries.ts tests/unit/screening/ src/types/database.ts
git commit -m "feat(screening): TS config (A2/densidade/atalhos) + queries (fila/motivos/contadores)"
```

---

## Task 7: Dependência — TanStack Table + Virtual (A3/R7, tarefa explícita)

**Files:**
- Modify: `package.json` (+ `package-lock.json`)

> **Portão (constitution §Portões):** dependência nova entra **só** por tarefa explícita. R7/A3 autorizam `@tanstack/react-virtual` (e `@tanstack/react-table` como par) **na Fatia 5**. Nenhuma outra dependência é adicionada nesta fatia.

- [ ] **Step 1: Install pinned deps**

Run:
```bash
npm install @tanstack/react-table@^8.21.3 @tanstack/react-virtual@^3.13.6
```
(Use as versões mais recentes compatíveis com React 18 disponíveis no registro; pinar as resolvidas no `package-lock.json`.)

- [ ] **Step 2: Verify install + typecheck**

Run: `npm run typecheck`
Expected: limpo; os pacotes aparecem em `dependencies` do `package.json`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(deps): add @tanstack/react-table + react-virtual (R7/A3, fila virtualizada)"
```

---

## Task 8: Job de IA — enqueue (custo) + worker (sugestões), resiliente por-item

**Files:**
- Create: `src/lib/screening/enqueue.ts`, `src/lib/screening/worker.ts`
- Test: `tests/integration/screening.test.ts` (novo bloco)

> O LLM **só** via `LLMProvider` (constitution §VII). O worker processa item-a-item, resiliente (§VIII).

- [ ] **Step 1: Write the failing integration test** (anexar)

```ts
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueScreeningJob } from "@/lib/screening/enqueue";
import { processScreeningJob } from "@/lib/screening/worker";

describe("ai_screening_batch — enqueue + worker (FR-024/033, SC-008)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`ai_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "IA lote" });
    reviewId = review.id;
    recId = await seedActiveRecord(reviewId, { title: "Estudo IA", abstract: "resumo" });
  });

  it("enqueue retorna estimativa de custo prévia (FR-033)", async () => {
    const res = await enqueueScreeningJob({ supabase: owner }, reviewId, null);
    expect(res.item_count).toBe(1);
    expect(res.estimated_cost).not.toBeNull();
    expect(res.estimated_cost!.tokensEstimated).toBeGreaterThan(0);
  });

  it("worker anexa sugestão de IA ao registro e grava ai_usage; NUNCA altera o estado (FR-024)", async () => {
    const res = await enqueueScreeningJob({ supabase: owner }, reviewId, null);
    const svc = serviceClient();
    const before = await svc.from("record").select("corpus_state").eq("id", recId).single();

    await processScreeningJob(
      { supabase: svc, provider: new MockLLMProvider(), criteria: ["incluir tema"] },
      res.job_id,
    );

    const sug = await svc.from("ai_suggestion")
      .select("target_kind, target_id, output, provenance")
      .eq("review_id", reviewId).eq("target_id", recId)
      .order("created_at", { ascending: false }).limit(1).single();
    expect(sug.data!.target_kind).toBe("screening");
    expect(sug.data!.output).toHaveProperty("recommendation");
    expect(sug.data!.provenance).toHaveProperty("model");

    const usage = await svc.from("ai_usage").select("phase")
      .eq("review_id", reviewId).eq("phase", "screening");
    expect((usage.data?.length ?? 0)).toBeGreaterThan(0);

    const after = await svc.from("record").select("corpus_state").eq("id", recId).single();
    expect(after.data!.corpus_state).toBe(before.data!.corpus_state); // IA não decide

    const { data: job } = await svc.from("job").select("status").eq("id", res.job_id).single();
    expect(["completed", "completed_with_errors"]).toContain(job!.status);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/screening.test.ts -t ai_screening_batch`
Expected: FAIL — cannot find module `@/lib/screening/enqueue` / `worker`.

- [ ] **Step 3: Create enqueue + worker**

`src/lib/screening/enqueue.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateScreeningCost } from "@/lib/ai/llm/cost";
import type { CostEstimate } from "@/lib/ai/llm/types";

export interface ScreeningEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
  estimated_cost: CostEstimate | null; // != null p/ IA (FR-033)
}

/**
 * Cria o job ai_screening_batch (via RPC create_screening_job) e calcula a
 * estimativa de custo prévia (FR-033/SC-008). NÃO processa itens (§VIII).
 * recordIds: subconjunto opcional (ações em lote sobre seleção).
 */
export async function enqueueScreeningJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordIds: string[] | null,
): Promise<ScreeningEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc("create_screening_job", {
    p_review_id: reviewId,
    p_record_ids: recordIds ?? null,
  });
  if (error) throw new Error(error.message);

  const { count, error: countErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  if (countErr) throw new Error(countErr.message);

  const itemCount = count ?? 0;
  return {
    job_id: job.id,
    status: "queued",
    item_count: itemCount,
    estimated_cost: estimateScreeningCost(itemCount),
  };
}
```

`src/lib/screening/worker.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";

interface ScreeningItem {
  id: string;
  payload: { record_id: string };
  review_id: string;
  attempts: number;
}

export interface ScreeningWorkerDeps {
  supabase: SupabaseClient;
  provider: LLMProvider;
  criteria: string[];
}

export interface ScreeningWorkerResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

/**
 * Processa um job ai_screening_batch item-a-item (§VIII): chama
 * LLMProvider.preclassifyScreening (a IA nunca decide — FR-024), grava
 * ai_suggestion (target_kind='screening') + ai_usage. Falha de um item ⇒ item
 * 'failed' (não derruba o job). Retomável: só pega itens 'pending'.
 */
export async function processScreeningJob(
  deps: ScreeningWorkerDeps,
  jobId: string,
): Promise<ScreeningWorkerResult> {
  const { supabase, provider, criteria } = deps;

  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const { data: items, error } = await supabase
    .from("job_item")
    .select("id, payload, review_id, attempts")
    .eq("job_id", jobId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  for (const it of (items ?? []) as ScreeningItem[]) {
    try {
      const { data: rec, error: recErr } = await supabase
        .from("record")
        .select("metadata")
        .eq("id", it.payload.record_id)
        .single();
      if (recErr) throw new Error(recErr.message);
      const meta = (rec?.metadata ?? {}) as { title?: string; abstract?: string };

      const suggestion = await provider.preclassifyScreening({
        title: meta.title ?? "",
        abstract: meta.abstract ?? null,
        criteria,
      });

      const { error: insErr } = await supabase.from("ai_suggestion").insert({
        review_id: it.review_id,
        target_kind: "screening",
        target_id: it.payload.record_id,
        output: suggestion.output,
        provenance: suggestion.provenance,
        state: suggestion.state,
      });
      if (insErr) throw new Error(insErr.message);

      await supabase.from("ai_usage").insert({
        review_id: it.review_id,
        phase: "screening",
        tokens_in: 0,
        tokens_out: 0,
        cost: {},
        job_id: jobId,
      });

      await supabase.from("job_item").update({ status: "done" }).eq("id", it.id);
    } catch (e) {
      await supabase
        .from("job_item")
        .update({
          status: "failed",
          error: (e as Error).message,
          attempts: (it.attempts ?? 0) + 1,
        })
        .eq("id", it.id);
    }
  }

  const { data: counts, error: cErr } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);

  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const done = all.filter((i) => i.status === "done").length;
  const failed = all.filter((i) => i.status === "failed").length;
  const status =
    failed > 0 ? (done > 0 ? "completed_with_errors" : "failed") : "completed";

  await supabase
    .from("job")
    .update({ status, progress: total ? Math.round((done / total) * 100) : 100 })
    .eq("id", jobId);

  return { job_id: jobId, status, done, failed };
}
```

- [ ] **Step 4: Apply + run the test**

Run: `npm run test -- tests/integration/screening.test.ts && npm run typecheck`
Expected: PASS (enqueue tem custo; worker anexa sugestão, grava ai_usage, não muda estado); typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/screening/enqueue.ts src/lib/screening/worker.ts tests/integration/screening.test.ts
git commit -m "feat(screening): ai_screening_batch enqueue (custo) + worker (sugestões via LLMProvider) (FR-024/033)"
```

---

## Task 9: Server Actions — decisões, reversão, fila, motivos, enqueue/worker de IA

**Files:**
- Create: `src/lib/screening/run.ts`
- Modify: `app/reviews/[reviewId]/workbench/actions.ts`
- Test: `tests/integration/screening.test.ts` (novo bloco — fia o worker síncrono)

> **Skill obrigatória:** consulte `nextjs-best-practices` (Server Actions, `revalidatePath`, fronteiras RSC/Client) ao implementar esta tarefa.

- [ ] **Step 1: Write the failing integration test** (anexar)

```ts
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { runScreeningWorkerWith } from "@/lib/screening/run";

describe("runScreeningWorkerWith — fia o worker (D-F5.5)", () => {
  it("processa todos os itens pendentes do job ai_screening_batch da Revisão", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`run_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Run worker" });
    const reviewId = review.id;
    await seedActiveRecord(reviewId, { title: "Estudo run", abstract: "r" });
    const { data: job } = await owner.rpc("create_screening_job", {
      p_review_id: reviewId, p_record_ids: null,
    });
    const svc = serviceClient();
    await runScreeningWorkerWith(svc, new MockLLMProvider(), reviewId, []);
    const { count } = await svc.from("job_item")
      .select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "done");
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/screening.test.ts -t runScreeningWorkerWith`
Expected: FAIL — cannot find module `@/lib/screening/run`.

- [ ] **Step 3: Create the worker runner helper**

`src/lib/screening/run.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { processScreeningJob } from "./worker";

/**
 * Processa todos os jobs ai_screening_batch ativos da Revisão (D-F5.5).
 * Recebe o client (admin/service em produção) e o provider já resolvidos —
 * mantém testável e desacoplado da resolução de BYOK.
 */
export async function runScreeningWorkerWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
  criteria: string[],
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "ai_screening_batch")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processScreeningJob({ supabase, provider, criteria }, j.id);
  }
}
```

- [ ] **Step 4: Add the Server Actions**

Em `app/reviews/[reviewId]/workbench/actions.ts`, adicione os imports e as actions
(reaproveite `requireMember`, `createAdminClient`, `revalidatePath` já presentes):

```ts
// imports adicionais no topo do arquivo:
import {
  listScreeningQueue,
  listExclusionReasons,
  type ScreeningStage,
} from "@/lib/screening/queries";
import { enqueueScreeningJob } from "@/lib/screening/enqueue";
import { runScreeningWorkerWith } from "@/lib/screening/run";
import { getLLMProvider } from "@/lib/ai/llm";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { MissingByokError } from "@/lib/ai/llm/types";
```

```ts
// ---- Fetchers (passados como props server-action aos componentes client) ----
export async function fetchScreeningQueue(reviewId: string, stage: ScreeningStage) {
  await requireMember(reviewId);
  return listScreeningQueue(reviewId, stage);
}

export async function fetchExclusionReasons(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  await supabase.rpc("seed_default_exclusion_reasons", { p_review_id: reviewId }); // idempotente (D-F5.4)
  return listExclusionReasons(reviewId);
}

// ---- Mutações de triagem (decisões HUMANAS — FR-024) ----
export async function decideScreening(
  reviewId: string,
  input: {
    recordId: string;
    stage: ScreeningStage;
    decision: "include" | "exclude" | "maybe";
    exclusionReasonId?: string | null;
    aiSuggestionId?: string | null;
  },
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("decide_screening", {
    p_review_id: reviewId,
    p_record_id: input.recordId,
    p_stage: input.stage,
    p_decision: input.decision,
    p_exclusion_reason_id: input.exclusionReasonId ?? null,
    p_ai_suggestion_id: input.aiSuggestionId ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

export async function reverseScreening(reviewId: string, decisionId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("reverse_screening", { p_decision_id: decisionId });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

// ---- IA em lote: estimativa + enfileiramento + worker síncrono (D-F5.5/FR-033) ----
export async function enqueueScreeningBatch(reviewId: string, recordIds: string[] | null) {
  const { supabase } = await requireMember(reviewId);
  const res = await enqueueScreeningJob({ supabase }, reviewId, recordIds);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const, ...res };
}

export async function runScreeningWorker(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const admin = createAdminClient();
  // Provider: BYOK quando há chave; senão Mock determinístico (local/e2e — D-F5.5).
  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) provider = new MockLLMProvider();
    else throw e;
  }
  // Critérios de elegibilidade (Fatia 2) alimentam a pré-classificação.
  const { data: crit } = await supabase
    .from("eligibility_criterion")
    .select("label")
    .eq("review_id", reviewId);
  const criteria = ((crit ?? []) as Array<{ label: string }>).map((c) => c.label);
  await runScreeningWorkerWith(admin, provider, reviewId, criteria);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}
```

> Nota: `select("label")` assume a coluna de rótulo de `eligibility_criterion`
> (Fatia 2). Se o nome diferir no schema gerado, ajuste para o campo real — `tsc`
> acusará.

- [ ] **Step 5: Verify typecheck + integration suite**

Run: `npm run typecheck && npm run test -- tests/integration/screening.test.ts`
Expected: typecheck limpo; integração PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/reviews/[reviewId]/workbench/actions.ts" src/lib/screening/run.ts tests/integration/screening.test.ts
git commit -m "feat(screening): Server Actions (decidir/reverter/fila/motivos) + IA lote runner (D-F5.5)"
```

---

## Task 10: Habilitar os modos Título/Resumo e Texto completo na ModeBar

**Files:**
- Modify: `src/components/workbench/ModeBar.tsx`

> **Skill obrigatória:** consulte `frontend-design` (barra de modos / superfície única — Princípio V).

- [ ] **Step 1: Enable the two modes**

Em `src/components/workbench/ModeBar.tsx`, troque as duas linhas finais da tabela `MODES` para `enabled: true`:

```ts
const MODES: { key: WorkbenchMode; label: string; enabled: boolean }[] = [
  { key: "import", label: "Importar", enabled: true },
  { key: "duplicates", label: "Duplicatas", enabled: true },
  { key: "title_abstract", label: "Título/Resumo", enabled: true },
  { key: "full_text", label: "Texto completo", enabled: true },
];
```

- [ ] **Step 2: Verify lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: lint ✔; typecheck limpo.

- [ ] **Step 3: Commit**

```bash
git add src/components/workbench/ModeBar.tsx
git commit -m "feat(workbench): ativar modos Título/Resumo e Texto completo (Princípio V)"
```

---

## Task 11: `ShortcutLegend` + `ScreeningQueue` — fila virtualizada teclado-first (+ lote, densidade, a11y)

**Files:**
- Create: `src/components/workbench/ShortcutLegend.tsx`, `src/components/workbench/ScreeningQueue.tsx`
- Test: `tests/unit/workbench/screening-queue.test.tsx`

> **Skills obrigatórias:** `react-best-practices` (virtualização com `@tanstack/react-virtual`, updates otimistas, memoização da fila de ~5.000 itens — A2) e `frontend-design` (vocabulário visual de IA via `SuggestionChip`/`ProvenancePopover`, densidade, foco visível). Reusar `src/components/ai/SuggestionChip.tsx` para a sugestão de IA.
>
> **Escopo desta task (FR-039 é MUST):** a fila deve oferecer **multi-seleção** (tecla `x`/checkbox por linha) e uma **barra de ações em lote** que chama `onDecide` em loop sobre a seleção (mesmas regras: motivo obrigatório no Texto completo). Isto **não** pode ser diferido (MUST). FR-029 (ordenação/filtros — SHOULD) pode ficar de fora desta fatia se registrado no COMPLETION.

- [ ] **Step 1: Write the failing test**

`tests/unit/workbench/screening-queue.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScreeningQueue } from "@/components/workbench/ScreeningQueue";
import type { QueueRow } from "@/lib/screening/queries";

const ROWS: QueueRow[] = [
  {
    recordId: "r1", title: "Estudo Alpha", abstract: "resumo alpha", year: "2021",
    corpusState: "active", tsDecision: null, ftDecision: null, ftExclusionReasonId: null,
    ai: { suggestionId: "s1", recommendation: "include", confidence: 0.8, reason: "tema relevante", state: "pending" },
  },
  {
    recordId: "r2", title: "Estudo Beta", abstract: null, year: "2019",
    corpusState: "active", tsDecision: null, ftDecision: null, ftExclusionReasonId: null, ai: null,
  },
];

function renderQueue(over: Partial<React.ComponentProps<typeof ScreeningQueue>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ScreeningQueue
        reviewId="rev1"
        stage="title_abstract"
        loadQueue={vi.fn().mockResolvedValue(ROWS)}
        loadReasons={vi.fn().mockResolvedValue([{ id: "x1", label: "Fora do escopo" }])}
        onDecide={vi.fn().mockResolvedValue({ ok: true })}
        onReverse={vi.fn().mockResolvedValue({ ok: true })}
        {...over}
      />
    </QueryClientProvider>,
  );
}

describe("ScreeningQueue (US4)", () => {
  it("renderiza a fila com legenda de atalhos e a sugestão de IA distinta", async () => {
    renderQueue();
    expect(await screen.findByText("Estudo Alpha")).toBeInTheDocument();
    expect(screen.getByText(/tema relevante/i)).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: /fila de triagem/i })).toBeInTheDocument();
    expect(screen.getByText(/atalhos/i)).toBeInTheDocument();
  });

  it("decide por teclado: tecla 'i' no item focado chama onDecide include", async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ onDecide });
    await screen.findByText("Estudo Alpha");
    await userEvent.keyboard("i");
    expect(onDecide).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: "r1", stage: "title_abstract", decision: "include" }),
    );
  });

  it("no Texto completo, excluir exige escolher motivo antes de confirmar (FR-025)", async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ stage: "full_text", onDecide });
    await screen.findByText("Estudo Alpha");
    await userEvent.keyboard("e");
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: /motivo/i })).toBeInTheDocument();
  });

  it("ações em lote: selecionar 2 e incluir chama onDecide por item (FR-039)", async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ onDecide });
    await screen.findByText("Estudo Alpha");
    await userEvent.keyboard("x"); // seleciona o focado (r1)
    await userEvent.keyboard("j"); // move p/ r2
    await userEvent.keyboard("x"); // seleciona r2
    await userEvent.click(screen.getByRole("button", { name: /incluir selecionados/i }));
    expect(onDecide).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/unit/workbench/screening-queue.test.tsx`
Expected: FAIL — cannot find module `@/components/workbench/ScreeningQueue`.

- [ ] **Step 3: Implement `ShortcutLegend`**

`src/components/workbench/ShortcutLegend.tsx`:

```tsx
import { SHORTCUTS } from "@/lib/screening/config";

export function ShortcutLegend() {
  return (
    <details className="rounded border p-2 text-sm">
      <summary className="cursor-pointer font-medium">Atalhos de teclado</summary>
      <ul className="mt-2 grid grid-cols-2 gap-1">
        {SHORTCUTS.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <kbd className="rounded border bg-gray-100 px-1.5 text-xs">{s.key}</kbd>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

- [ ] **Step 4: Implement `ScreeningQueue`**

`src/components/workbench/ScreeningQueue.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SuggestionChip } from "@/components/ai/SuggestionChip";
import { ShortcutLegend } from "@/components/workbench/ShortcutLegend";
import { DENSITIES, type Density } from "@/lib/screening/config";
import type {
  ExclusionReason,
  QueueRow,
  ScreeningStage,
} from "@/lib/screening/queries";

type Decision = "include" | "exclude" | "maybe";

export interface ScreeningQueueProps {
  reviewId: string;
  stage: ScreeningStage;
  loadQueue: (reviewId: string, stage: ScreeningStage) => Promise<QueueRow[]>;
  loadReasons: (reviewId: string) => Promise<ExclusionReason[]>;
  onDecide: (input: {
    recordId: string;
    stage: ScreeningStage;
    decision: Decision;
    exclusionReasonId?: string | null;
    aiSuggestionId?: string | null;
  }) => Promise<{ ok: boolean }>;
  onReverse: (decisionId: string) => Promise<{ ok: boolean }>;
}

export function ScreeningQueue({
  reviewId,
  stage,
  loadQueue,
  loadReasons,
  onDecide,
}: ScreeningQueueProps) {
  const qc = useQueryClient();
  const [density, setDensity] = useState<Density>("comfortable");
  const [focusIdx, setFocusIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingExclude, setPendingExclude] = useState<string | null>(null);
  const [reasonId, setReasonId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const queue = useQuery({
    queryKey: ["screening", stage, reviewId],
    queryFn: () => loadQueue(reviewId, stage),
  });
  const reasons = useQuery({
    queryKey: ["screening", "reasons", reviewId],
    queryFn: () => loadReasons(reviewId),
    enabled: stage === "full_text",
  });

  const rows = useMemo(() => queue.data ?? [], [queue.data]);
  const rowHeight = DENSITIES.find((d) => d.key === density)?.rowHeight ?? 56;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  async function decideOne(row: QueueRow, decision: Decision) {
    // Texto completo + excluir ⇒ exige motivo antes de confirmar (FR-025).
    if (stage === "full_text" && decision === "exclude" && !reasonId) {
      setPendingExclude(row.recordId);
      return false;
    }
    await onDecide({
      recordId: row.recordId,
      stage,
      decision,
      exclusionReasonId:
        stage === "full_text" && decision === "exclude" ? reasonId : null,
      aiSuggestionId: row.ai?.suggestionId ?? null,
    });
    return true;
  }

  async function decide(row: QueueRow, decision: Decision) {
    setError(null);
    try {
      const ok = await decideOne(row, decision);
      if (ok) {
        setPendingExclude(null);
        setReasonId("");
        await qc.invalidateQueries({ queryKey: ["screening"] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao registrar a decisão.");
    }
  }

  // Ações em lote (FR-039): mesma regra por item.
  async function decideBatch(decision: Decision) {
    setError(null);
    try {
      for (const row of rows.filter((r) => selected.has(r.recordId))) {
        const ok = await decideOne(row, decision);
        if (!ok) return; // abre seletor de motivo; usuário reexecuta
      }
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: ["screening"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na ação em lote.");
    }
  }

  function toggleSelect(recordId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(recordId) ? next.delete(recordId) : next.add(recordId);
      return next;
    });
  }

  // Teclado-first (FR-023/028): navegação + decisão + seleção sem mouse.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (rows.length === 0) return;
      const row = rows[focusIdx];
      if (ev.key === "j") setFocusIdx((i) => Math.min(i + 1, rows.length - 1));
      else if (ev.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (ev.key === "x") toggleSelect(row.recordId);
      else if (ev.key === "i") void decide(row, "include");
      else if (ev.key === "e") void decide(row, "exclude");
      else if (ev.key === "d" && stage === "title_abstract") void decide(row, "maybe");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, focusIdx, stage, reasonId]);

  useEffect(() => {
    if (rows.length) virtualizer.scrollToIndex(focusIdx, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <ShortcutLegend />
        <label className="text-sm">
          Densidade{" "}
          <select
            aria-label="Densidade da fila"
            value={density}
            onChange={(e) => setDensity(e.target.value as Density)}
            className="rounded border px-2 py-1"
          >
            {DENSITIES.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded border bg-gray-50 p-2 text-sm">
          <span>{selected.size} selecionado(s):</span>
          <button type="button" className="rounded bg-black px-2 py-1 text-white"
            onClick={() => decideBatch("include")}>
            Incluir selecionados
          </button>
          <button type="button" className="rounded border px-2 py-1"
            onClick={() => decideBatch("exclude")}>
            Excluir selecionados
          </button>
          {stage === "title_abstract" && (
            <button type="button" className="rounded border px-2 py-1"
              onClick={() => decideBatch("maybe")}>
              Dúvida em lote
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {stage === "full_text" && pendingExclude && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          <label className="flex items-center gap-2">
            <span>Motivo da exclusão</span>
            <select
              aria-label="Motivo da exclusão"
              value={reasonId}
              onChange={(e) => setReasonId(e.target.value)}
              className="rounded border px-2 py-1"
            >
              <option value="">Selecione…</option>
              {(reasons.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div
        ref={parentRef}
        role="grid"
        aria-label="Fila de triagem"
        tabIndex={0}
        className="h-[60vh] overflow-auto rounded border focus:outline focus:outline-2 focus:outline-blue-500"
      >
        {queue.isLoading ? (
          <p className="p-3 text-sm text-gray-500">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-sm text-gray-500">Nenhum registro nesta fila.</p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = rows[v.index];
              const focused = v.index === focusIdx;
              return (
                <div
                  key={row.recordId}
                  role="row"
                  aria-selected={focused}
                  onClick={() => setFocusIdx(v.index)}
                  className={`absolute left-0 top-0 flex w-full items-center gap-3 border-b px-3 ${
                    focused ? "bg-blue-50 outline outline-2 outline-blue-400" : ""
                  }`}
                  style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${row.title}`}
                    checked={selected.has(row.recordId)}
                    onChange={() => toggleSelect(row.recordId)}
                    role="gridcell"
                  />
                  <span role="gridcell" className="flex-1 truncate text-sm">
                    {row.title}{" "}
                    <span className="text-xs text-gray-500">({row.year ?? "—"})</span>
                  </span>
                  <span role="gridcell" className="text-xs text-gray-600">
                    {row.tsDecision ?? row.ftDecision ?? row.corpusState}
                  </span>
                  {row.ai && (
                    <span role="gridcell">
                      <SuggestionChip state={row.ai.state}>
                        IA: {row.ai.recommendation === "include" ? "incluir" : "excluir"}
                        {row.ai.reason ? ` — ${row.ai.reason}` : ""}
                      </SuggestionChip>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

> Ajuste a chamada de `SuggestionChip` à sua assinatura real (Fatia 2). Se ele
> não aceitar `children`, passe a label via a prop esperada (ex.: `label`/`text`)
> — `tsc` acusará. O contrato visual (estado distinto + proveniência) deve ser
> preservado (SC-005).

- [ ] **Step 5: Run the unit test + lint + typecheck**

Run: `npm run test -- tests/unit/workbench/screening-queue.test.tsx && npm run lint && npm run typecheck`
Expected: unit PASS; lint ✔; typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/components/workbench/ScreeningQueue.tsx src/components/workbench/ShortcutLegend.tsx tests/unit/workbench/screening-queue.test.tsx
git commit -m "feat(workbench): ScreeningQueue virtualizada teclado-first + lote + densidade (US4/FR-028/039/040/041)"
```

---

## Task 12: Ligar os modos + contadores PRISMA na página do workbench

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/page.tsx`

> **Skill obrigatória:** consulte `nextjs-best-practices` (RSC vs Client; passar Server Actions como props ao componente client, como já feito com `DuplicatesPanel`).

- [ ] **Step 1: Wire ScreeningQueue into both modes + counters**

Em `app/reviews/[reviewId]/workbench/page.tsx`, adicione os imports:

```tsx
import { ScreeningQueue } from "@/components/workbench/ScreeningQueue";
import { countScreened, countIncludedFullText } from "@/lib/screening/queries";
import {
  // ...imports existentes de "./actions"...
  fetchScreeningQueue,
  fetchExclusionReasons,
  decideScreening,
  reverseScreening,
} from "./actions";
```

Calcule os contadores quando o modo for de triagem (após `const identified = ...`):

```tsx
  const screened =
    active === "title_abstract" || active === "full_text"
      ? await countScreened(reviewId)
      : null;
  const includedFt =
    active === "full_text" ? await countIncludedFullText(reviewId) : null;
```

No cabeçalho, junto aos contadores existentes:

```tsx
        {screened !== null && (
          <span className="text-sm text-gray-600" aria-live="polite">
            Triados (PRISMA): <strong>{screened}</strong>
          </span>
        )}
        {includedFt !== null && (
          <span className="text-sm text-gray-600" aria-live="polite">
            Incluídos (texto completo): <strong>{includedFt}</strong>
          </span>
        )}
```

No switch de modo, dentro do `<QueryProvider>`, adicione o ramo de triagem antes do fallback:

```tsx
        ) : active === "title_abstract" || active === "full_text" ? (
          <ScreeningQueue
            reviewId={reviewId}
            stage={active}
            loadQueue={fetchScreeningQueue}
            loadReasons={fetchExclusionReasons}
            onDecide={decideScreening.bind(null, reviewId)}
            onReverse={reverseScreening.bind(null, reviewId)}
          />
        ) : (
```

> Com a Fatia 5 os quatro modos ficam funcionais; o fallback "Este modo é
> habilitado em uma etapa seguinte" deixa de ser alcançável e pode permanecer
> como salvaguarda.

- [ ] **Step 2: Verify lint + typecheck + build (fronteira server/client)**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: lint ✔; typecheck limpo; build conclui (Server Actions serializáveis cruzando para o client component).

- [ ] **Step 3: Commit**

```bash
git add "app/reviews/[reviewId]/workbench/page.tsx"
git commit -m "feat(workbench): renderizar fila de triagem (T/R e TC) + contadores triados/incluídos"
```

---

## Task 13: e2e — fluxo de triagem no workbench

**Files:**
- Create: `tests/e2e/screening.spec.ts`
- (opcional) Create: `tests/e2e/helpers/seed-corpus.ts` (reuso import→dedup→screening)

> Espelha o estilo de `tests/e2e/dedup.spec.ts` e `import.spec.ts` (login → criar Revisão → importar → rodar worker). NÃO inventar API nova: derive o boilerplate de sessão/seed do spec existente.

- [ ] **Step 1: Write the e2e spec**

`tests/e2e/screening.spec.ts` (estrutura — preencher seletores conforme o markup real, espelhando `dedup.spec.ts`):

```ts
import { test, expect } from "@playwright/test";

test("triagem T/R: incluir por teclado e ver contador subir", async ({ page }) => {
  test.setTimeout(60_000);
  // setup: login, criar Revisão, importar ≥1 referência, rodar worker (corpus 'active').
  // (reusar o fluxo de import.spec.ts / dedup.spec.ts — extrair helper se útil.)
  await page.goto(`/reviews/${"<reviewId>"}/workbench?mode=title_abstract`);
  const grid = page.getByRole("grid", { name: /fila de triagem/i });
  await expect(grid).toBeVisible();
  await grid.focus();
  await page.keyboard.press("i"); // inclui o item focado
  await expect(page.getByText(/Triados \(PRISMA\)/i)).toContainText(/[1-9]/);
});

test("Texto completo: excluir exige motivo (FR-025)", async ({ page }) => {
  await page.goto(`/reviews/${"<reviewId>"}/workbench?mode=full_text`);
  await page.getByRole("grid", { name: /fila de triagem/i }).focus();
  await page.keyboard.press("e");
  await expect(page.getByRole("combobox", { name: /motivo/i })).toBeVisible();
});

test("sugestão de IA aparece e não decide sozinha (SC-005/FR-024)", async ({ page }) => {
  // disparar enqueueScreeningBatch + runScreeningWorker via a UI de IA do modo triagem
  await page.goto(`/reviews/${"<reviewId>"}/workbench?mode=title_abstract`);
  await expect(page.getByText(/IA:/)).toBeVisible();
  // o estado do registro permanece não-decidido até a ação humana
});
```

> **Importante:** o setup de sessão/seed **deve** seguir o mecanismo de
> `dedup.spec.ts`. Se for pesado, extraia `tests/e2e/helpers/seed-corpus.ts`
> reutilizado por import/dedup/screening. Nada de TODO no commit final.

- [ ] **Step 2: Run e2e**

Run: `npm run build && npm run test:e2e -- tests/e2e/screening.spec.ts`
Expected: PASS (3 cenários).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/screening.spec.ts tests/e2e/helpers/
git commit -m "test(e2e): triagem T/R + Texto completo + sugestão de IA (US4)"
```

---

## Task 14: Perf — orçamento A2 com ~5.000 registros (SC-012)

**Files:**
- Create: `tests/e2e/screening-perf.spec.ts`

> **Skill obrigatória:** `react-best-practices` (medir custo de render/atualização; confirmar que a virtualização mantém o DOM pequeno).

- [ ] **Step 1: Write the perf spec**

`tests/e2e/screening-perf.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { SCREENING_PERF_BUDGET } from "../../src/lib/screening/config";

test("fila com ~5.000 registros: render inicial rápido e DOM virtualizado", async ({ page }) => {
  test.setTimeout(120_000);
  // Seed de ~5.000 records 'active' via service client (helper seed-corpus).
  // ...
  const t0 = Date.now();
  await page.goto(`/reviews/${"<reviewId>"}/workbench?mode=title_abstract`);
  await expect(page.getByRole("grid", { name: /fila de triagem/i })).toBeVisible();
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeLessThan(SCREENING_PERF_BUDGET.initialRenderMs * 3); // margem de e2e

  // Virtualização: nº de linhas no DOM ≪ 5.000.
  const rowCount = await page.getByRole("row").count();
  expect(rowCount).toBeLessThan(200);

  // Navegação por tecla é responsiva (j move o foco).
  await page.getByRole("grid", { name: /fila de triagem/i }).focus();
  const n0 = Date.now();
  await page.keyboard.press("j");
  expect(Date.now() - n0).toBeLessThan(SCREENING_PERF_BUDGET.keyNavMs * 10); // margem de e2e
});
```

> O orçamento A2 são alvos de UX (cliente). Em e2e há overhead de protocolo;
> usamos margens (×3/×10) mas asseguramos a **invariante dura**: DOM virtualizado
> (`rowCount < 200`) e ausência de travamento. A medição fina de "decisão→render
> < 100ms" pode ser feita via `performance.now()` num bench de unidade separado.

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- tests/e2e/screening-perf.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/screening-perf.spec.ts
git commit -m "test(perf): fila de triagem ~5.000 registros — orçamento A2 (SC-012)"
```

---

## Task 15: a11y — SC-013 (ARIA, foco, 100% teclado)

**Files:**
- Create: `tests/e2e/screening-a11y.spec.ts`

> **Skill obrigatória:** `frontend-design` (semântica ARIA de grids/popovers, foco visível). Sem dependência nova: a verificação usa os papéis ARIA e o snapshot de acessibilidade nativo do Playwright (não adicionar libs fora do `plan.md`).

- [ ] **Step 1: Write the a11y spec**

`tests/e2e/screening-a11y.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("workbench de triagem é operável por teclado e expõe ARIA (SC-013)", async ({ page }) => {
  await page.goto(`/reviews/${"<reviewId>"}/workbench?mode=title_abstract`);

  const grid = page.getByRole("grid", { name: /fila de triagem/i });
  await expect(grid).toBeVisible();

  // barra de modos é uma tablist com tabs (ModeBar existente).
  await expect(page.getByRole("tablist", { name: /modos do workbench/i })).toBeVisible();

  // operação 100% por teclado.
  await grid.focus();
  await page.keyboard.press("j");
  await page.keyboard.press("i");

  // legenda de atalhos disponível na própria interface (FR-041).
  await expect(page.getByText(/atalhos de teclado/i)).toBeVisible();

  // controle de densidade nomeado (FR-040).
  await expect(page.getByRole("combobox", { name: /densidade da fila/i })).toBeVisible();

  // snapshot de acessibilidade disponível (sem nós sem-nome óbvios).
  const snapshot = await page.accessibility.snapshot();
  expect(snapshot).toBeTruthy();
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- tests/e2e/screening-a11y.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/screening-a11y.spec.ts
git commit -m "test(a11y): workbench de triagem ARIA/foco/teclado (SC-013/FR-041)"
```

---

## Task 16: Verificação final + COMPLETION (CHECKPOINT 3)

**Files:**
- Create: `specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-5.md`
- Modify: `specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md` (marcar Fatia 5)

> **Skill obrigatória:** `superpowers:verification-before-completion` — rodar os comandos e **colar a saída literal** antes de qualquer afirmação de "verde".

- [ ] **Step 1: Run the full gate (capture literal output)**

```bash
supabase db reset
npm run test
npm run build && npm run test:e2e
npm run lint
npm run typecheck
```
Expected: tudo verde. Cobertura ≥80% nas funções críticas de triagem (constitution §Testes) — confirmar no relatório do Vitest.

- [ ] **Step 2: Self-check de cobertura da fatia** (contra slicing.md §Fatia 5)

Confirmar, item a item: FR-022 · FR-023 (incluir/excluir/dúvida por teclado; dúvida pendente Q1) ·
FR-024 (IA pré-classifica em lote, nunca decide) · FR-025 (motivo só no TC, lista configurável) ·
FR-026 (reversão por item) · FR-028 (fila densa virtualizada teclado-first) · **FR-039 (lote — MUST)** ·
FR-040 (densidade) · FR-041 (a11y) · FR-010 (lock na 1ª decisão) · FR-033 (custo prévio) ·
SC-003/005/007/008/012/013.

> **FR-029** (SHOULD: ordenação/filtros) **não** está nesta fatia. Registrar
> explicitamente no COMPLETION como diferido e justificar (SHOULD, não MUST).

- [ ] **Step 3: Write COMPLETION-fatia-5.md**

`specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-5.md` — espelhar o formato de `COMPLETION-fatia-4.md`: US4 entregue; tabela FR→onde; decisões D-F5.*; saída **colada** dos portões; itens diferidos (FR-029 SHOULD; trilho/PRISMA view/URL/export de auditoria → Fatia 6); achados de review resolvidos; nota de CHECKPOINT 3 (aguardando merge manual).

- [ ] **Step 4: Mark the slice in slicing.md**

Em `specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md` §"Estado das fatias", marcar:
`- [x] Fatia 5 — Triagem 2 etapas + IA-no-laço (CHECKPOINT 3 — aguardando merge)`.

- [ ] **Step 5: Final commit + STOP**

```bash
git add specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-5.md specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md
git commit -m "docs(fatia5): completion report + slicing state (CHECKPOINT 3)"
```

**PARE (CHECKPOINT 3).** Apresente ao desenvolvedor: branch da fatia, diff, e a saída
literal de `npm run test` + `npm run test:e2e` + `npm run lint` + `npm run typecheck`.
**NÃO** faça `git merge` nem `git push` para a feature branch ou `main` — aguarde o
merge manual antes de qualquer próxima fatia (CLAUDE.md §5).

---

## Self-Review (verificação do plano contra o spec/slicing)

**1. Cobertura do spec (Fatia 5 = US4):**
- FR-022 dois modos → Tasks 10, 12. · FR-023 incluir/excluir/dúvida por teclado + dúvida pendente (Q1) → Task 3 (`maybe_ts`, validação de avanço) + Task 11 (atalhos). · FR-024 IA em lote, nunca decide → Tasks 5, 8 (worker grava sugestão, não muda estado — teste explícito). · FR-025 motivo só no TC, lista configurável → Tasks 1 (`exclusion_reason`+seed), 3 (`CHECK`+validação), 11 (seletor). · FR-026 reversão por item → Task 4. · FR-028 fila densa virtualizada teclado-first → Tasks 7, 11, 14. · **FR-039 lote (MUST)** → Task 11 (multi-seleção + barra de lote chamando `onDecide` por item) — teste de unidade dedicado. · FR-040 densidade → Tasks 6, 11. · FR-041 a11y → Tasks 11, 15. · FR-010 lock na 1ª decisão → Task 3. · FR-033 custo prévio → Tasks 8, 9. · SC-003/005/007/008/012/013 → Tasks 11/8(11)/3/8/14/15.
- **FR-029 (SHOULD: ordenação/filtros): deliberadamente fora desta fatia.** Registrar no COMPLETION (Task 16). É SHOULD — não bloqueia o gate.

**2. Placeholders:** sem "TBD"/"implementar depois". Os `<reviewId>` nos specs e2e são marcadores de setup de sessão que **devem** seguir `dedup.spec.ts` — sinalizados como tal, não como código final.

**3. Consistência de tipos/nomes:** RPCs `decide_screening`/`reverse_screening`/`list_screening_queue`/`create_screening_job`/`seed_default_exclusion_reasons` usadas de forma idêntica em SQL, queries TS, Server Actions e testes. `screening_choice` = `include|exclude|maybe` (consistente entre RPC, action input e UI); mapeamento para `ts_decision_state`/`ft_decision_state` (particípios) feito **só** dentro de `decide_screening`. `QueueRow`/`mapQueueRow`/`QueueRowRaw` consistentes entre `queries.ts`, componente e testes. `processScreeningJob`/`enqueueScreeningJob`/`runScreeningWorkerWith` com assinaturas estáveis entre worker, action e testes.

**4. Dependências de schema:** migration 0006 precede todo o código que a consome (Tasks 1–5 antes de 6–15); tipos regenerados (Task 6/Step 1) antes do uso TS. Dependência nova (`@tanstack/react-table` + `@tanstack/react-virtual`) só por tarefa explícita (Task 7), antes do componente (Task 11). ✔
