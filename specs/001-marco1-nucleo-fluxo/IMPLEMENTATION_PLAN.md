# Fatia 4 — Deduplicação no workbench — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Escopo:** esta é a **Fatia 4 de 6** do Marco 1 (`001-marco1-nucleo-fluxo`).
> Fronteiras, dependências e gate de cobertura em
> [.superpowers/slicing.md](./.superpowers/slicing.md). NÃO planejar/implementar
> capacidades de outras fatias (triagem/IA-em-lote = Fatia 5; trilho/PRISMA view/
> export de auditoria = Fatia 6).
> *(Os planos das Fatias 1–3 permanecem no histórico git — commit `84b20ec` e anteriores.)*
>
> **Branch de trabalho:** `build/001-marco1-nucleo-fluxo/4-deduplicacao`
> (criar via `superpowers:using-git-worktrees`). A sessão **NUNCA** faz `git merge`
> nem `git push` para a feature branch ou `main` — o merge é manual do desenvolvedor
> ao fim da fatia (CHECKPOINT 3).

**Goal:** No modo **Duplicatas** da bancada única, remover automaticamente duplicatas exatas (com log reversível) e oferecer uma fila de pares fuzzy lado a lado para decisão humana mesma/distintas — toda decisão e reversão registradas na trilha append-only.

**Architecture:** Toda a lógica de dedup vive em **RPCs Postgres `security definer`** (migration `0005_dedup.sql`), espelhando o padrão da Fatia 3 (`create_import_job`/`insert_import_record`): atômicas, testáveis em Node contra o Postgres local, e que sempre escrevem `audit_entry`. A camada TS (`src/lib/dedup/`) só consome essas RPCs; as Server Actions em `app/reviews/[reviewId]/workbench/actions.ts` aplicam `requireMember` e disparam o dedup exato **automaticamente ao concluir a importação** (estendendo `runImportWorker`). A UI é um novo **modo** (`DuplicatesPanel`) na mesma rota `workbench/` — **nenhuma rota/tela nova** (Princípio V). Nenhuma dependência nova é introduzida (`pg_trgm` já habilitado na 0003; `@tanstack/react-query` já presente).

**Tech Stack:** Next.js 14 App Router (RSC + Server Actions), Supabase Postgres + RLS + `pg_trgm`, `@supabase/supabase-js`, `@tanstack/react-query`, Vitest (unit + integration contra Postgres local), Playwright (e2e). TypeScript strict, sem `any`.

---

## Contexto de execução

- **Pré-condição:** Fatias 1–3 mergeadas em `001-marco1-nucleo-fluxo`. Existem: `record` (com `doi_normalized`, `title_norm` coluna, `metadata.year` em jsonb, `corpus_state` enum com `imported|active|duplicate_exact|duplicate_fuzzy|…`), índices `record_doi_idx` e `record_title_trgm_idx` (gin_trgm_ops), `audit_entry` (insert-only), helper `is_review_member(uuid)`, infra de jobs + `runImportWorker`.
- **Higiene:** se ainda existir o worktree órfão `.worktrees/3-workbench-importacao`, removê-lo é decisão do desenvolvedor (fora deste plano).
- **Banco de testes:** os testes de integração rodam contra o Supabase local (`supabase start` já feito). O loop TDD de SQL é: editar `supabase/migrations/0005_dedup.sql` → `supabase db reset` → rodar o teste de integração.
- **PARADA OBRIGATÓRIA:** ao fim da fatia (CHECKPOINT 3) a sessão **não faz merge/push** — apresenta diff + portões e aguarda o merge manual (CLAUDE.md §5).

## Decisões de implementação (D-F4.*)

- **D-F4.1** — Toda a lógica de dedup é **RPC Postgres `security definer`** (não código Deno/`_shared`), para ser atômica + auditável + testável em Node, espelhando a Fatia 3. O worker Deno **não** é editado.
- **D-F4.2** — `dedup_exact` é **idempotente**: opera só sobre `corpus_state='active'`; promove `imported→active` no início; re-rodar não re-marca nem duplica decisões.
- **D-F4.3** — Dedup exato dispara **automaticamente ao concluir a importação**, estendendo a Server Action `runImportWorker` (chama `dedup_exact` após processar os jobs). Também exposto como Server Action `runExactDedup` (re-executável; idempotente).
- **D-F4.4** — Chave exata: `doi_normalized` quando presente; senão `title_norm` + `metadata->>'year'` (R2). Sobrevivente do grupo = registro mais antigo (`created_at, id`); demais ⇒ `duplicate_exact`.
- **D-F4.5** — Fila fuzzy: `similarity(title_norm)` (`pg_trgm`) **≥ 0.92** **e** mesmo ano, entre registros `active`, excluindo pares já decididos (decisão `fuzzy_human` não revertida). Limiar em constante `DEDUP_FUZZY_HIGH` (`src/lib/dedup/config.ts`), ajustável sem schema (R2).
- **D-F4.6** — Reversão **por item, a qualquer momento** (Q4): seta `is_reversed=true`+`reversed_at`, restaura `record_b` para `active`, e escreve **nova** `audit_entry` (não apaga a original).
- **D-F4.7** — Contador PRISMA "duplicados" mínimo no cabeçalho do workbench = `dedup_decision` com `outcome ∈ {removed,merged}` e `is_reversed=false` (a view `prisma_counter` completa é Fatia 6, espelhando D-F3.8).

---

## File Structure

**Criar:**
- `supabase/migrations/0005_dedup.sql` — tabela `dedup_decision` + enums + RLS + RPCs (`dedup_exact`, `reverse_dedup`, `list_fuzzy_candidates`, `decide_fuzzy`).
- `src/lib/dedup/config.ts` — constantes de limiar fuzzy.
- `src/lib/dedup/queries.ts` — leituras: log de exatas, candidatos fuzzy, contador de duplicados.
- `src/components/workbench/DuplicatesPanel.tsx` — modo Duplicatas (client, TanStack Query).
- `tests/integration/dedup.test.ts` — exatas, reversão, fuzzy, decisão, auto-dispatch.
- `tests/integration/rls.dedup.test.ts` — isolamento RLS de `dedup_decision`.
- `tests/unit/dedup/config.test.ts` — sanidade das constantes.
- `tests/e2e/dedup.spec.ts` — fluxo ponta-a-ponta no modo Duplicatas.

**Modificar:**
- `src/types/database.ts` — regenerado (`npm run gen:types`) após a migration.
- `app/reviews/[reviewId]/workbench/actions.ts` — `runExactDedup`, `decideFuzzy`, `reverseDedup`; `runImportWorker` passa a chamar `dedup_exact`.
- `src/components/workbench/ModeBar.tsx:9-14` — habilitar o modo `duplicates`.
- `app/reviews/[reviewId]/workbench/page.tsx` — renderizar `DuplicatesPanel` quando `active==='duplicates'`; contador "Duplicados" no cabeçalho.

---

## Task 1: Migration — tabela `dedup_decision` + enums + RLS

**Files:**
- Create: `supabase/migrations/0005_dedup.sql`
- Test: `tests/integration/rls.dedup.test.ts`

- [ ] **Step 1: Write the failing test** (RLS de `dedup_decision`)

`tests/integration/rls.dedup.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

describe("RLS dedup_decision (SC-009)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`dd_owner_${s}@example.com`, "senha-teste-123")).client;
    intruder = (await signUpUser(`dd_intr_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Dedup RLS" });
    reviewId = review.id;
    // Seed via service role (bypass RLS para setup).
    const svc = serviceClient();
    const { data: rec } = await svc
      .from("record")
      .insert({
        review_id: reviewId,
        source_format: "ris",
        raw: {},
        metadata: { title: "x", year: "2020" },
        title_norm: "x",
        corpus_state: "active",
      })
      .select("id")
      .single();
    const { data: dd } = await svc
      .from("dedup_decision")
      .insert({
        review_id: reviewId,
        kind: "exact_auto",
        record_a_id: rec!.id,
        record_b_id: rec!.id,
        outcome: "removed",
        actor: "system",
      })
      .select("id")
      .single();
    decisionId = dd!.id;
  });

  it("owner enxerga a decisão; intruso não-membro enxerga zero", async () => {
    const own = await owner.from("dedup_decision").select("id").eq("id", decisionId);
    expect(own.data?.length).toBe(1);
    const intr = await intruder.from("dedup_decision").select("id").eq("id", decisionId);
    expect(intr.data?.length ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/rls.dedup.test.ts`
Expected: FAIL — relation `public.dedup_decision` does not exist.

- [ ] **Step 3: Create the migration (table + enums + RLS)**

`supabase/migrations/0005_dedup.sql`:

```sql
-- ============================================================
-- Marco 1 / Fatia 4 — Deduplicação: dedup_decision + RPCs
-- US3 / FR-018..021, FR-026. RLS habilitado (Princípio IV).
-- Toda lógica de dedup é RPC security definer e escreve audit_entry (Princípio III).
-- ============================================================

create type dedup_kind    as enum ('exact_auto', 'fuzzy_human');
create type dedup_outcome as enum ('removed', 'merged', 'kept_distinct');
create type dedup_actor   as enum ('system', 'human');

-- ---------- dedup_decision (decisão de dedup — US3) ----------
-- record_a_id = sobrevivente/mantido; record_b_id = removido/mesclado (nullable p/ data-model).
create table public.dedup_decision (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  kind dedup_kind not null,
  record_a_id uuid not null references public.record (id) on delete cascade,
  record_b_id uuid references public.record (id) on delete cascade,
  similarity real,
  outcome dedup_outcome not null,
  is_reversed boolean not null default false,
  reversed_at timestamptz,
  actor dedup_actor not null,
  created_at timestamptz not null default now()
);
create index dedup_review_idx on public.dedup_decision (review_id, created_at desc);
-- Acelera o "par já decidido?" da fila fuzzy (apenas decisões vivas).
create index dedup_active_pair_idx
  on public.dedup_decision (review_id, record_a_id, record_b_id)
  where is_reversed = false;

-- ---------- RLS ----------
alter table public.dedup_decision enable row level security;
create policy dedup_select on public.dedup_decision
  for select using (public.is_review_member(review_id));
-- INSERT/UPDATE de dedup_decision só via RPCs security definer abaixo (sem policy de write).
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/rls.dedup.test.ts`
Expected: PASS (owner vê 1, intruso vê 0).

- [ ] **Step 5: Regenerate DB types**

Run: `npm run gen:types && npm run typecheck`
Expected: `src/types/database.ts` passa a conter `dedup_decision`; typecheck sem saída (limpo).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0005_dedup.sql tests/integration/rls.dedup.test.ts src/types/database.ts
git commit -m "feat(db): migration 0005 dedup_decision + RLS (US3/SC-009)"
```

---

## Task 2: RPC `dedup_exact` — remoção automática de exatas (FR-018/019)

**Files:**
- Modify: `supabase/migrations/0005_dedup.sql` (append)
- Test: `tests/integration/dedup.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/integration/dedup.test.ts` (primeiro bloco):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

// Insere um record diretamente (service role) já no estado dado.
async function seedRecord(
  reviewId: string,
  opts: { title: string; year: string; doi?: string; createdAt?: string },
) {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: opts.title, year: opts.year, doi: opts.doi ?? null },
      doi_normalized: opts.doi ?? null,
      title_norm: opts.title.toLowerCase().trim(),
      corpus_state: "imported",
      ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id;
}

// Insere já como 'active' (para testes de fila fuzzy, Tasks 4/5).
async function seedRecordActive(reviewId: string, title: string, year: string) {
  const svc = serviceClient();
  const { error } = await svc.from("record").insert({
    review_id: reviewId,
    source_format: "ris",
    raw: {},
    metadata: { title, year },
    title_norm: title,
    corpus_state: "active",
  });
  if (error) throw new Error(error.message);
}

describe("dedup_exact (FR-018/019)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let keepId: string;
  let dupId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`dx_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Exatas" });
    reviewId = review.id;
    keepId = await seedRecord(reviewId, {
      title: "Active learning", year: "2020", doi: "10.1/abc",
      createdAt: "2020-01-01T00:00:00Z",
    });
    dupId = await seedRecord(reviewId, {
      title: "Active learning (dup)", year: "2020", doi: "10.1/abc",
      createdAt: "2020-02-01T00:00:00Z",
    });
    await seedRecord(reviewId, { title: "Outro estudo", year: "2019", doi: "10.2/zzz" });
  });

  it("remove a exata mais nova, mantém a mais antiga ativa, registra decisão reversível + auditoria", async () => {
    const { data: removed, error } = await owner.rpc("dedup_exact", { p_review_id: reviewId });
    expect(error).toBeNull();
    expect(removed).toBe(1);

    const svc = serviceClient();
    const { data: keep } = await svc.from("record").select("corpus_state").eq("id", keepId).single();
    const { data: dup } = await svc.from("record").select("corpus_state").eq("id", dupId).single();
    expect(keep!.corpus_state).toBe("active");
    expect(dup!.corpus_state).toBe("duplicate_exact");

    const { data: dec } = await svc
      .from("dedup_decision")
      .select("kind, outcome, actor, record_a_id, record_b_id, is_reversed")
      .eq("review_id", reviewId).eq("record_b_id", dupId).single();
    expect(dec).toMatchObject({
      kind: "exact_auto", outcome: "removed", actor: "system",
      record_a_id: keepId, is_reversed: false,
    });

    const { count: auditCount } = await svc
      .from("audit_entry").select("id", { count: "exact", head: true })
      .eq("review_id", reviewId).eq("action", "dedup_exact_remove");
    expect(auditCount).toBe(1);
  });

  it("re-rodar é idempotente — não remove mais nada nem duplica decisões", async () => {
    const { data: removed2 } = await owner.rpc("dedup_exact", { p_review_id: reviewId });
    expect(removed2).toBe(0);
    const { count } = await serviceClient()
      .from("dedup_decision").select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBe(1);
  });
});

export { seedRecord, seedRecordActive };
```

> Os helpers `seedRecord`/`seedRecordActive` ficam no topo deste arquivo e são reutilizados pelos blocos das Tasks 3–7 (mesmo arquivo, não re-declarar).

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/dedup.test.ts`
Expected: FAIL — function `public.dedup_exact(uuid)` does not exist.

- [ ] **Step 3: Append the RPC to the migration**

Em `supabase/migrations/0005_dedup.sql`, adicione:

```sql
-- ============================================================
-- RPC: dedup_exact — remove duplicatas exatas (FR-018), reversível (FR-019).
-- Idempotente: opera só sobre 'active'; promove 'imported'→'active' primeiro.
-- Chave: doi_normalized; na ausência, title_norm + metadata->>'year' (R2).
-- Sobrevivente = mais antigo (created_at, id). Retorna nº de removidos nesta execução.
-- ============================================================
create or replace function public.dedup_exact(p_review_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed int := 0;
  r record;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  -- Registros importados entram no corpus como 'active'.
  update public.record
     set corpus_state = 'active', updated_at = now()
   where review_id = p_review_id and corpus_state = 'imported';

  for r in
    with keyed as (
      select
        id, created_at,
        case
          when coalesce(nullif(doi_normalized, ''), '') <> '' then 'doi:' || doi_normalized
          when coalesce(nullif(title_norm, ''), '') <> ''
            then 'tt:' || title_norm || '|' || coalesce(metadata ->> 'year', '')
          else null
        end as dkey
      from public.record
      where review_id = p_review_id and corpus_state = 'active'
    ),
    ranked as (
      select
        id, dkey,
        first_value(id) over (partition by dkey order by created_at, id) as keep_id,
        row_number()  over (partition by dkey order by created_at, id) as rn
      from keyed
      where dkey is not null
    )
    select id, keep_id from ranked where rn > 1
  loop
    update public.record
       set corpus_state = 'duplicate_exact', updated_at = now()
     where id = r.id;

    insert into public.dedup_decision (review_id, kind, record_a_id, record_b_id, outcome, actor)
    values (p_review_id, 'exact_auto', r.keep_id, r.id, 'removed', 'system');

    insert into public.audit_entry (
      review_id, actor_type, actor_id, action, entity, entity_id, before, after
    )
    values (
      p_review_id, 'system', null, 'dedup_exact_remove', 'record', r.id,
      jsonb_build_object('corpus_state', 'active'),
      jsonb_build_object('corpus_state', 'duplicate_exact', 'kept', r.keep_id)
    );

    v_removed := v_removed + 1;
  end loop;

  return v_removed;
end;
$$;

grant execute on function public.dedup_exact(uuid) to authenticated;
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/dedup.test.ts`
Expected: PASS (ambos os blocos `dedup_exact`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_dedup.sql tests/integration/dedup.test.ts
git commit -m "feat(dedup): dedup_exact RPC — exatas auto-removidas reversíveis (FR-018/019)"
```

---

## Task 3: RPC `reverse_dedup` — reversão por item, a qualquer momento (FR-026/Q4)

**Files:**
- Modify: `supabase/migrations/0005_dedup.sql` (append)
- Test: `tests/integration/dedup.test.ts` (novo bloco)

- [ ] **Step 1: Write the failing test** (anexar ao arquivo)

```ts
describe("reverse_dedup (FR-026 / Q4)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let dupId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`rv_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Reverter" });
    reviewId = review.id;
    await seedRecord(reviewId, {
      title: "Estudo A", year: "2021", doi: "10.9/dup", createdAt: "2021-01-01T00:00:00Z",
    });
    dupId = await seedRecord(reviewId, {
      title: "Estudo A dup", year: "2021", doi: "10.9/dup", createdAt: "2021-02-01T00:00:00Z",
    });
    await owner.rpc("dedup_exact", { p_review_id: reviewId });
    const { data: dec } = await serviceClient()
      .from("dedup_decision").select("id").eq("record_b_id", dupId).single();
    decisionId = dec!.id;
  });

  it("desfaz a remoção: record volta a active, decisão marcada is_reversed, nova auditoria criada", async () => {
    const { error } = await owner.rpc("reverse_dedup", { p_decision_id: decisionId });
    expect(error).toBeNull();

    const svc = serviceClient();
    const { data: rec } = await svc.from("record").select("corpus_state").eq("id", dupId).single();
    expect(rec!.corpus_state).toBe("active");

    const { data: dec } = await svc
      .from("dedup_decision").select("is_reversed, reversed_at").eq("id", decisionId).single();
    expect(dec!.is_reversed).toBe(true);
    expect(dec!.reversed_at).not.toBeNull();

    const { count } = await svc
      .from("audit_entry").select("id", { count: "exact", head: true })
      .eq("review_id", reviewId).eq("action", "dedup_reverse");
    expect(count).toBe(1);
  });

  it("reverter duas vezes é rejeitado (decisão já revertida)", async () => {
    const { error } = await owner.rpc("reverse_dedup", { p_decision_id: decisionId });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/dedup.test.ts -t reverse_dedup`
Expected: FAIL — function `public.reverse_dedup(uuid)` does not exist.

- [ ] **Step 3: Append the RPC**

```sql
-- ============================================================
-- RPC: reverse_dedup — desfaz uma decisão (exata ou fuzzy), por item, a qualquer
-- momento (Q4). Restaura record_b para 'active', marca is_reversed, NÃO apaga a
-- decisão e escreve NOVA audit_entry (FR-019/021/026).
-- ============================================================
create or replace function public.reverse_dedup(p_decision_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.dedup_decision;
begin
  select * into d from public.dedup_decision where id = p_decision_id;
  if d.id is null then
    raise exception 'decision not found';
  end if;
  if not public.is_review_member(d.review_id) then
    raise exception 'not a member';
  end if;
  if d.is_reversed then
    raise exception 'decision already reversed';
  end if;

  if d.outcome in ('removed', 'merged') and d.record_b_id is not null then
    update public.record
       set corpus_state = 'active', updated_at = now()
     where id = d.record_b_id
       and corpus_state in ('duplicate_exact', 'duplicate_fuzzy');
  end if;

  update public.dedup_decision
     set is_reversed = true, reversed_at = now()
   where id = d.id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    d.review_id, 'human', auth.uid(), 'dedup_reverse', 'dedup_decision', d.id,
    jsonb_build_object('is_reversed', false),
    jsonb_build_object('is_reversed', true, 'restored_record', d.record_b_id)
  );
end;
$$;

grant execute on function public.reverse_dedup(uuid) to authenticated;
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/dedup.test.ts`
Expected: PASS (todos os blocos até aqui).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_dedup.sql tests/integration/dedup.test.ts
git commit -m "feat(dedup): reverse_dedup RPC — reversão por item + nova auditoria (FR-026/Q4)"
```

---

## Task 4: RPC `list_fuzzy_candidates` — fila de pares fuzzy (FR-020)

**Files:**
- Modify: `supabase/migrations/0005_dedup.sql` (append)
- Test: `tests/integration/dedup.test.ts` (novo bloco)

- [ ] **Step 1: Write the failing test** (anexar; usa `seedRecordActive` do topo)

```ts
describe("list_fuzzy_candidates (FR-020 / R2: >=0.92 + mesmo ano)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`fz_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Fuzzy" });
    reviewId = review.id;
    // Par fuzzy forte (títulos quase iguais, mesmo ano, SEM doi → não são exatas).
    await seedRecordActive(reviewId, "machine learning for screening reviews", "2022");
    await seedRecordActive(reviewId, "machine learning for screening review", "2022");
    // Mesmo título-quase mas ANO diferente ⇒ não é par.
    await seedRecordActive(reviewId, "machine learning for screening reviews", "2010");
    // Título totalmente distinto ⇒ não é par.
    await seedRecordActive(reviewId, "qualitative synthesis of nursing", "2022");
  });

  it("retorna só o par com similaridade >=0.92 e mesmo ano", async () => {
    const { data, error } = await owner.rpc("list_fuzzy_candidates", { p_review_id: reviewId });
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].similarity).toBeGreaterThanOrEqual(0.92);
    expect(data![0].year_a).toBe("2022");
    expect(data![0].year_b).toBe("2022");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/dedup.test.ts -t list_fuzzy_candidates`
Expected: FAIL — function `public.list_fuzzy_candidates` does not exist.

- [ ] **Step 3: Append the RPC**

```sql
-- ============================================================
-- RPC: list_fuzzy_candidates — pares de alta similaridade p/ confirmação humana
-- (FR-020). similarity(title_norm) >= limiar E mesmo ano, entre 'active',
-- excluindo pares já decididos (fuzzy_human vivo). a.id < b.id evita duplicar par.
-- ============================================================
create or replace function public.list_fuzzy_candidates(
  p_review_id uuid,
  p_threshold real default 0.92
)
returns table (
  record_a_id uuid,
  record_b_id uuid,
  similarity  real,
  title_a text,
  title_b text,
  year_a  text,
  year_b  text
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
  with active as (
    select
      id,
      title_norm,
      metadata ->> 'year'  as yr,
      metadata ->> 'title' as ttl
    from public.record
    where review_id = p_review_id
      and corpus_state = 'active'
      and coalesce(nullif(title_norm, ''), '') <> ''
  )
  select
    a.id, b.id,
    similarity(a.title_norm, b.title_norm)::real,
    a.ttl, b.ttl, a.yr, b.yr
  from active a
  join active b
    on a.id < b.id
   and a.yr is not distinct from b.yr
   and similarity(a.title_norm, b.title_norm) >= p_threshold
  where not exists (
    select 1
    from public.dedup_decision d
    where d.review_id = p_review_id
      and d.kind = 'fuzzy_human'
      and d.is_reversed = false
      and (
        (d.record_a_id = a.id and d.record_b_id = b.id) or
        (d.record_a_id = b.id and d.record_b_id = a.id)
      )
  )
  order by similarity(a.title_norm, b.title_norm) desc;
end;
$$;

grant execute on function public.list_fuzzy_candidates(uuid, real) to authenticated;
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/dedup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_dedup.sql tests/integration/dedup.test.ts
git commit -m "feat(dedup): list_fuzzy_candidates RPC — fila >=0.92 mesmo ano (FR-020/R2)"
```

---

## Task 5: RPC `decide_fuzzy` — decisão humana mesma/distintas (FR-020/021)

**Files:**
- Modify: `supabase/migrations/0005_dedup.sql` (append)
- Test: `tests/integration/dedup.test.ts` (novo bloco)

- [ ] **Step 1: Write the failing test** (anexar)

```ts
describe("decide_fuzzy (FR-020/021)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`df_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Decidir fuzzy" });
    reviewId = review.id;
    await seedRecordActive(reviewId, "deep learning triage", "2023");
    await seedRecordActive(reviewId, "deep learning triages", "2023");
  });

  it("'mesma' (merged) marca record_b duplicate_fuzzy, some da fila, é reversível", async () => {
    const { data: simRows } = await owner.rpc("list_fuzzy_candidates", { p_review_id: reviewId });
    const pair = simRows![0];
    const { error } = await owner.rpc("decide_fuzzy", {
      p_review_id: reviewId,
      p_record_a: pair.record_a_id,
      p_record_b: pair.record_b_id,
      p_outcome: "merged",
      p_similarity: pair.similarity,
    });
    expect(error).toBeNull();

    const svc = serviceClient();
    const { data: rec } = await svc.from("record")
      .select("corpus_state").eq("id", pair.record_b_id).single();
    expect(rec!.corpus_state).toBe("duplicate_fuzzy");

    const { data: after } = await owner.rpc("list_fuzzy_candidates", { p_review_id: reviewId });
    expect(after!.length).toBe(0);
  });

  it("'distintas' (kept_distinct) não muda estado mas remove o par da fila", async () => {
    const s = Date.now();
    const o2 = (await signUpUser(`df2_${s}@example.com`, "senha-teste-123")).client;
    const { data: r2 } = await o2.rpc("create_review", { p_title: "Distintas" });
    await seedRecordActive(r2.id, "active recall study", "2024");
    await seedRecordActive(r2.id, "active recall studies", "2024");
    const { data: cand } = await o2.rpc("list_fuzzy_candidates", { p_review_id: r2.id });
    const p = cand![0];
    await o2.rpc("decide_fuzzy", {
      p_review_id: r2.id, p_record_a: p.record_a_id, p_record_b: p.record_b_id,
      p_outcome: "kept_distinct", p_similarity: p.similarity,
    });
    const svc = serviceClient();
    const { data: recA } = await svc.from("record").select("corpus_state").eq("id", p.record_a_id).single();
    const { data: recB } = await svc.from("record").select("corpus_state").eq("id", p.record_b_id).single();
    expect(recA!.corpus_state).toBe("active");
    expect(recB!.corpus_state).toBe("active");
    const { data: after } = await o2.rpc("list_fuzzy_candidates", { p_review_id: r2.id });
    expect(after!.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/integration/dedup.test.ts -t decide_fuzzy`
Expected: FAIL — function `public.decide_fuzzy` does not exist.

- [ ] **Step 3: Append the RPC**

```sql
-- ============================================================
-- RPC: decide_fuzzy — decisão humana de um par fuzzy (FR-020), reversível (FR-021).
-- 'merged'        ⇒ record_b vira duplicate_fuzzy (record_a sobrevive).
-- 'kept_distinct' ⇒ nenhum estado muda; a decisão registrada tira o par da fila.
-- ============================================================
create or replace function public.decide_fuzzy(
  p_review_id uuid,
  p_record_a uuid,
  p_record_b uuid,
  p_outcome dedup_outcome,
  p_similarity real
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  if p_outcome not in ('merged', 'kept_distinct') then
    raise exception 'invalid fuzzy outcome';
  end if;

  if p_outcome = 'merged' then
    update public.record
       set corpus_state = 'duplicate_fuzzy', updated_at = now()
     where id = p_record_b and review_id = p_review_id and corpus_state = 'active';
  end if;

  insert into public.dedup_decision (
    review_id, kind, record_a_id, record_b_id, similarity, outcome, actor
  )
  values (
    p_review_id, 'fuzzy_human', p_record_a, p_record_b, p_similarity, p_outcome, 'human'
  )
  returning id into v_id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    p_review_id, 'human', auth.uid(), 'dedup_fuzzy_decide', 'dedup_decision', v_id,
    null,
    jsonb_build_object('outcome', p_outcome, 'record_a', p_record_a, 'record_b', p_record_b)
  );

  return v_id;
end;
$$;

grant execute on function public.decide_fuzzy(uuid, uuid, uuid, dedup_outcome, real) to authenticated;
```

- [ ] **Step 4: Apply migration and run the test**

Run: `supabase db reset && npm run test -- tests/integration/dedup.test.ts`
Expected: PASS (todos os blocos de integração de dedup).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_dedup.sql tests/integration/dedup.test.ts
git commit -m "feat(dedup): decide_fuzzy RPC — mesma/distintas reversível (FR-020/021)"
```

---

## Task 6: Camada TS — config + queries de dedup

**Files:**
- Create: `src/lib/dedup/config.ts`
- Create: `src/lib/dedup/queries.ts`
- Test: `tests/unit/dedup/config.test.ts`

- [ ] **Step 1: Write the failing unit test**

`tests/unit/dedup/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEDUP_FUZZY_HIGH } from "@/lib/dedup/config";

describe("dedup config (R2)", () => {
  it("limiar forte fuzzy é 0.92", () => {
    expect(DEDUP_FUZZY_HIGH).toBe(0.92);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/unit/dedup/config.test.ts`
Expected: FAIL — cannot find module `@/lib/dedup/config`.

- [ ] **Step 3: Create config + queries**

`src/lib/dedup/config.ts`:

```ts
// Limiares de deduplicação fuzzy (R2). Ajustáveis sem mudança de schema.
// Banda forte (entra na fila de confirmação): similaridade de título >= HIGH e mesmo ano.
export const DEDUP_FUZZY_HIGH = 0.92;
```

`src/lib/dedup/queries.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export interface ExactRemoval {
  decisionId: string;
  removedRecordId: string;
  keptRecordId: string;
  removedTitle: string;
  keptTitle: string;
  createdAt: string;
}

export interface FuzzyCandidate {
  recordAId: string;
  recordBId: string;
  similarity: number;
  titleA: string;
  titleB: string;
  yearA: string | null;
  yearB: string | null;
}

/** Log de exatas removidas e ainda não revertidas, com títulos para exibição. */
export async function listExactRemovals(reviewId: string): Promise<ExactRemoval[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dedup_decision")
    .select(
      "id, record_a_id, record_b_id, created_at, " +
        "kept:record_a_id(metadata), removed:record_b_id(metadata)",
    )
    .eq("review_id", reviewId)
    .eq("kind", "exact_auto")
    .eq("is_reversed", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    record_a_id: string;
    record_b_id: string | null;
    created_at: string;
    kept: { metadata: { title?: string } } | null;
    removed: { metadata: { title?: string } } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    decisionId: r.id,
    removedRecordId: r.record_b_id ?? "",
    keptRecordId: r.record_a_id,
    removedTitle: r.removed?.metadata?.title ?? "(sem título)",
    keptTitle: r.kept?.metadata?.title ?? "(sem título)",
    createdAt: r.created_at,
  }));
}

/** Pares fuzzy pendentes de confirmação (FR-020). */
export async function listFuzzyCandidates(reviewId: string): Promise<FuzzyCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_fuzzy_candidates", {
    p_review_id: reviewId,
  });
  if (error) throw new Error(error.message);
  type Row = {
    record_a_id: string;
    record_b_id: string;
    similarity: number;
    title_a: string | null;
    title_b: string | null;
    year_a: string | null;
    year_b: string | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    recordAId: r.record_a_id,
    recordBId: r.record_b_id,
    similarity: r.similarity,
    titleA: r.title_a ?? "(sem título)",
    titleB: r.title_b ?? "(sem título)",
    yearA: r.year_a,
    yearB: r.year_b,
  }));
}

/** Contador PRISMA "duplicados" mínimo (D-F4.7): removidas + mescladas, não revertidas. */
export async function countDuplicates(reviewId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("dedup_decision")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .eq("is_reversed", false)
    .in("outcome", ["removed", "merged"]);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

- [ ] **Step 4: Run the unit test + typecheck**

Run: `npm run test -- tests/unit/dedup/config.test.ts && npm run typecheck`
Expected: unit PASS; typecheck sem saída (limpo). Se o `.select` com embed de FK acusar tipo, refine o cast `as unknown as Row[]` (já previsto).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dedup/config.ts src/lib/dedup/queries.ts tests/unit/dedup/config.test.ts
git commit -m "feat(dedup): TS config + queries (exact log, fuzzy candidates, counter)"
```

---

## Task 7: Server Actions — disparo automático + decisões + reversão

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/actions.ts`
- Test: `tests/integration/dedup.test.ts` (novo bloco)

> **Skill obrigatória:** consulte `nextjs-best-practices` (Server Actions, `revalidatePath`, fronteiras RSC/Client) ao implementar esta tarefa.

- [ ] **Step 1: Write the failing integration test** (auto-dedup ao concluir importação)

Anexe a `tests/integration/dedup.test.ts`:

```ts
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";

describe("dedup_exact dispara após a importação concluir (D-F4.3)", () => {
  it("worker insere records; dedup_exact remove a exata e survivors ficam active", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`auto_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Auto dedup" });
    const reviewId = review.id;
    // RIS com 2 entradas de MESMO DOI ⇒ exata após import.
    const ris = [
      "TY  - JOUR", "TI  - Estudo X", "PY  - 2020", "DO  - 10.5/same", "ER  - ",
      "TY  - JOUR", "TI  - Estudo X copia", "PY  - 2020", "DO  - 10.5/same", "ER  - ",
    ].join("\n");
    const res = await enqueueImportJob({ supabase: owner }, reviewId, {
      format: "ris", content: ris,
      search: { queryString: "x", database: "ERIC", searchedOn: "2026-05-30", hits: 2 },
    });
    await processImportJob({ supabase: serviceClient() }, res.job_id);
    // simula o que runImportWorker fará a seguir:
    const removed = await owner.rpc("dedup_exact", { p_review_id: reviewId });
    expect(removed.data).toBe(1);
    const { count: active } = await owner
      .from("record").select("id", { count: "exact", head: true })
      .eq("review_id", reviewId).eq("corpus_state", "active");
    expect(active).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm behavior**

Run: `npm run test -- tests/integration/dedup.test.ts -t "após a importação"`
Expected: PASS (o RPC já existe). Este teste fixa o contrato que a Server Action automatizará.

- [ ] **Step 3: Extend `runImportWorker` + add dedup Server Actions**

Em `app/reviews/[reviewId]/workbench/actions.ts`:

1. `runImportWorker` já chama `await requireMember(reviewId)` no início, mas descarta o retorno. Capture o client e, **antes** do `revalidatePath` final, dispare o dedup exato:

```ts
export async function runImportWorker(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "import_parse")
    .in("status", ["queued", "running"]);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processImportJob({ supabase: admin }, j.id);
  }
  // Dedup exato automático ao concluir a importação (FR-018 / D-F4.3). Idempotente.
  await supabase.rpc("dedup_exact", { p_review_id: reviewId });
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}
```

2. Adicione as três Server Actions ao mesmo arquivo:

```ts
export async function runExactDedup(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const { data, error } = await supabase.rpc("dedup_exact", { p_review_id: reviewId });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const, removed: data ?? 0 };
}

export async function decideFuzzy(
  reviewId: string,
  input: { recordA: string; recordB: string; outcome: "merged" | "kept_distinct"; similarity: number },
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("decide_fuzzy", {
    p_review_id: reviewId,
    p_record_a: input.recordA,
    p_record_b: input.recordB,
    p_outcome: input.outcome,
    p_similarity: input.similarity,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}

export async function reverseDedup(reviewId: string, decisionId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("reverse_dedup", { p_decision_id: decisionId });
  if (error) throw new Error(error.message);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}
```

- [ ] **Step 4: Verify typecheck + full integration suite**

Run: `npm run typecheck && npm run test -- tests/integration/dedup.test.ts`
Expected: typecheck limpo; integração PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/reviews/[reviewId]/workbench/actions.ts" tests/integration/dedup.test.ts
git commit -m "feat(dedup): auto dedup_exact pós-import + Server Actions decide/reverse (D-F4.3)"
```

---

## Task 8: Habilitar o modo Duplicatas na ModeBar

**Files:**
- Modify: `src/components/workbench/ModeBar.tsx:9-14`

> **Skill obrigatória:** consulte `frontend-design` (barra de modos / superfície única do workbench).

- [ ] **Step 1: Update the MODES table**

Em `src/components/workbench/ModeBar.tsx`, troque a linha do modo `duplicates` para `enabled: true`:

```ts
const MODES: { key: WorkbenchMode; label: string; enabled: boolean }[] = [
  { key: "import", label: "Importar", enabled: true },
  { key: "duplicates", label: "Duplicatas", enabled: true },
  { key: "title_abstract", label: "Título/Resumo", enabled: false },
  { key: "full_text", label: "Texto completo", enabled: false },
];
```

- [ ] **Step 2: Verify lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: lint ✔ sem avisos; typecheck limpo.

- [ ] **Step 3: Commit**

```bash
git add src/components/workbench/ModeBar.tsx
git commit -m "feat(workbench): ativar modo Duplicatas na ModeBar (Princípio V)"
```

---

## Task 9: `DuplicatesPanel` — UI do modo Duplicatas (client)

**Files:**
- Create: `src/components/workbench/DuplicatesPanel.tsx`
- Test: `tests/unit/workbench/duplicates-panel.test.tsx`

> **Skills obrigatórias:** consulte `react-best-practices` (TanStack Query + updates otimistas; este painel espelha o padrão de `ImportPanel`/`JobProgress`) e `frontend-design` (par fuzzy lado a lado, log reversível, vocabulário visual consistente).

- [ ] **Step 1: Write the failing test**

`tests/unit/workbench/duplicates-panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DuplicatesPanel } from "@/components/workbench/DuplicatesPanel";

function renderPanel(over: Partial<React.ComponentProps<typeof DuplicatesPanel>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DuplicatesPanel
        reviewId="r1"
        loadExactRemovals={vi.fn().mockResolvedValue([
          { decisionId: "d1", removedRecordId: "rb", keptRecordId: "ra",
            removedTitle: "Estudo X copia", keptTitle: "Estudo X",
            createdAt: "2026-06-01T00:00:00Z" },
        ])}
        loadFuzzyCandidates={vi.fn().mockResolvedValue([
          { recordAId: "a", recordBId: "b", similarity: 0.95,
            titleA: "deep learning triage", titleB: "deep learning triages",
            yearA: "2023", yearB: "2023" },
        ])}
        onDecide={vi.fn().mockResolvedValue({ ok: true })}
        onReverse={vi.fn().mockResolvedValue({ ok: true })}
        {...over}
      />
    </QueryClientProvider>,
  );
}

describe("DuplicatesPanel (US3)", () => {
  it("mostra o par fuzzy lado a lado com ações mesma/distintas", async () => {
    renderPanel();
    expect(await screen.findByText("deep learning triage")).toBeInTheDocument();
    expect(screen.getByText("deep learning triages")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mesma/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /distintas/i })).toBeInTheDocument();
  });

  it("lista as exatas removidas com botão desfazer", async () => {
    renderPanel();
    expect(await screen.findByText(/Estudo X copia/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /desfazer/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test -- tests/unit/workbench/duplicates-panel.test.tsx`
Expected: FAIL — cannot find module `@/components/workbench/DuplicatesPanel`.

- [ ] **Step 3: Implement the component**

`src/components/workbench/DuplicatesPanel.tsx`:

```tsx
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExactRemoval, FuzzyCandidate } from "@/lib/dedup/queries";

export interface DuplicatesPanelProps {
  reviewId: string;
  loadExactRemovals: (reviewId: string) => Promise<ExactRemoval[]>;
  loadFuzzyCandidates: (reviewId: string) => Promise<FuzzyCandidate[]>;
  onDecide: (input: {
    recordA: string;
    recordB: string;
    outcome: "merged" | "kept_distinct";
    similarity: number;
  }) => Promise<{ ok: boolean }>;
  onReverse: (decisionId: string) => Promise<{ ok: boolean }>;
}

export function DuplicatesPanel({
  reviewId,
  loadExactRemovals,
  loadFuzzyCandidates,
  onDecide,
  onReverse,
}: DuplicatesPanelProps) {
  const qc = useQueryClient();
  const exact = useQuery({
    queryKey: ["dedup", "exact", reviewId],
    queryFn: () => loadExactRemovals(reviewId),
  });
  const fuzzy = useQuery({
    queryKey: ["dedup", "fuzzy", reviewId],
    queryFn: () => loadFuzzyCandidates(reviewId),
  });

  const refetchAll = () => qc.invalidateQueries({ queryKey: ["dedup"] });

  async function decide(c: FuzzyCandidate, outcome: "merged" | "kept_distinct") {
    await onDecide({
      recordA: c.recordAId,
      recordB: c.recordBId,
      outcome,
      similarity: c.similarity,
    });
    await refetchAll();
  }

  async function reverse(decisionId: string) {
    await onReverse(decisionId);
    await refetchAll();
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="fuzzy-h">
        <h2 id="fuzzy-h" className="mb-2 text-sm font-semibold">
          Pares prováveis para confirmar
        </h2>
        {fuzzy.isLoading ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : (fuzzy.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500">Nenhum par pendente.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {fuzzy.data!.map((c) => (
              <li key={`${c.recordAId}:${c.recordBId}`} className="rounded border p-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">{c.titleA}</p>
                    <p className="text-xs text-gray-500">Ano: {c.yearA ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{c.titleB}</p>
                    <p className="text-xs text-gray-500">Ano: {c.yearB ?? "—"}</p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Similaridade: {(c.similarity * 100).toFixed(0)}%
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded bg-black px-3 py-1 text-sm text-white"
                    onClick={() => decide(c, "merged")}
                  >
                    Mesma (mesclar)
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1 text-sm"
                    onClick={() => decide(c, "kept_distinct")}
                  >
                    Distintas
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="exact-h">
        <h2 id="exact-h" className="mb-2 text-sm font-semibold">
          Exatas removidas automaticamente
        </h2>
        {(exact.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma remoção registrada.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {exact.data!.map((r) => (
              <li
                key={r.decisionId}
                className="flex items-center justify-between rounded border p-2 text-sm"
              >
                <span>
                  Removido: <strong>{r.removedTitle}</strong> (mantido: {r.keptTitle})
                </span>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => reverse(r.decisionId)}
                >
                  Desfazer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test + lint + typecheck**

Run: `npm run test -- tests/unit/workbench/duplicates-panel.test.tsx && npm run lint && npm run typecheck`
Expected: unit PASS; lint ✔; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/components/workbench/DuplicatesPanel.tsx tests/unit/workbench/duplicates-panel.test.tsx
git commit -m "feat(workbench): DuplicatesPanel — par fuzzy lado a lado + log reversível (US3)"
```

---

## Task 10: Ligar o modo Duplicatas + contador na página do workbench

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/page.tsx`
- Modify: `app/reviews/[reviewId]/workbench/actions.ts` (Server Actions de leitura)

> **Skill obrigatória:** consulte `nextjs-best-practices` (RSC + fronteira `'use client'`; o painel é client e recebe Server Actions como props).

- [ ] **Step 1: Add read Server Actions** (fronteira server→client serializável)

Em `app/reviews/[reviewId]/workbench/actions.ts`, importe as queries e exponha-as como Server Actions com guarda de membro:

```ts
import { listExactRemovals, listFuzzyCandidates } from "@/lib/dedup/queries";

export async function fetchExactRemovals(reviewId: string) {
  await requireMember(reviewId);
  return listExactRemovals(reviewId);
}

export async function fetchFuzzyCandidates(reviewId: string) {
  await requireMember(reviewId);
  return listFuzzyCandidates(reviewId);
}
```

- [ ] **Step 2: Wire the panel and counter into the page**

Em `app/reviews/[reviewId]/workbench/page.tsx`:

1. Imports no topo:

```ts
import { DuplicatesPanel } from "@/components/workbench/DuplicatesPanel";
import { countDuplicates } from "@/lib/dedup/queries";
import {
  decideFuzzy,
  reverseDedup,
  fetchExactRemovals,
  fetchFuzzyCandidates,
} from "./actions";
```

2. Após `const identified = await countRecords(reviewId);`:

```ts
  const duplicates = active === "duplicates" ? await countDuplicates(reviewId) : null;
```

3. No cabeçalho, ao lado do contador de identificados:

```tsx
        {duplicates !== null && (
          <span className="text-sm text-gray-600" aria-live="polite">
            Duplicados (PRISMA): <strong>{duplicates}</strong>
          </span>
        )}
```

4. No bloco de modos, ramo `duplicates` antes do fallback:

```tsx
        {active === "import" ? (
          <ImportPanel reviewId={reviewId} />
        ) : active === "duplicates" ? (
          <DuplicatesPanel
            reviewId={reviewId}
            loadExactRemovals={fetchExactRemovals}
            loadFuzzyCandidates={fetchFuzzyCandidates}
            onDecide={(input) => decideFuzzy(reviewId, input)}
            onReverse={(decisionId) => reverseDedup(reviewId, decisionId)}
          />
        ) : (
          <p className="text-sm text-gray-500">
            Este modo é habilitado em uma etapa seguinte do Marco.
          </p>
        )}
```

- [ ] **Step 3: Verify build boundary + lint + typecheck**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: lint ✔; typecheck limpo; build conclui sem erro de fronteira server/client (Server Actions são serializáveis cruzando para o client component).

- [ ] **Step 4: Commit**

```bash
git add "app/reviews/[reviewId]/workbench/page.tsx" "app/reviews/[reviewId]/workbench/actions.ts"
git commit -m "feat(workbench): renderizar modo Duplicatas + contador duplicados (US3/D-F4.7)"
```

---

## Task 11: e2e — fluxo de deduplicação no workbench

**Files:**
- Create: `tests/e2e/dedup.spec.ts`

> **Referência:** espelhe o padrão de `tests/e2e/import.spec.ts` (login, criar Revisão, registrar busca, importar, aguardar job). NÃO deixar placeholders no commit final — derive o boilerplate do `import.spec.ts` real.

- [ ] **Step 1: Write the e2e test**

`tests/e2e/dedup.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("importar corpus com exatas+fuzzy ⇒ exatas auto-removidas, par fuzzy confirmável, contador sobe", async ({ page }) => {
  // 1. Login + criar Revisão (replicar o fluxo real de import.spec.ts).
  // 2. Modo Importar: registrar busca + colar RIS contendo:
  //    - 2 entradas mesmo DOI (exatas)
  //    - 2 entradas títulos quase iguais, mesmo ano, sem DOI (par fuzzy)
  //    confirmar importação e aguardar o job concluir (JobProgress 100%).
  //    (runImportWorker já dispara dedup_exact ao concluir — D-F4.3.)

  // 3. Ir ao modo Duplicatas:
  await page.getByRole("tab", { name: "Duplicatas" }).click();

  // 4. Exatas: aparecem no log "Exatas removidas automaticamente" com "Desfazer".
  await expect(page.getByText(/Exatas removidas automaticamente/)).toBeVisible();
  await expect(page.getByRole("button", { name: /desfazer/i }).first()).toBeVisible();

  // 5. Fuzzy: par lado a lado; clicar "Mesma (mesclar)".
  await page.getByRole("button", { name: /mesma/i }).first().click();

  // 6. Par some da fila.
  await expect(page.getByText(/Nenhum par pendente/)).toBeVisible();

  // 7. Contador "Duplicados (PRISMA)" visível e > 0.
  await expect(page.getByText(/Duplicados \(PRISMA\)/)).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e suite (prod build)**

Run: `npm run build && npm run test:e2e -- dedup.spec.ts`
Expected: PASS (import → exatas removidas → fuzzy confirmado → contador).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/dedup.spec.ts
git commit -m "test(e2e): deduplicação — exatas auto + fuzzy confirmável + contador (US3)"
```

---

## Task 12: Verificação final + COMPLETION (CHECKPOINT 3)

**Files:**
- Create: `specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-4.md`
- Modify: `specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md` (marcar Fatia 4)

> **Skill obrigatória:** use `superpowers:verification-before-completion` — rode todos os portões e cole a saída literal antes de qualquer afirmação de "pronto".

- [ ] **Step 1: Run the full quality gate (capture literal output)**

```bash
npm run test
npm run typecheck
npm run lint
npm run build && npm run test:e2e
```

Expected: todos os testes verdes (unit+integration incl. dedup ≥80% nas funções de dedup), `tsc` limpo, lint ✔, e2e (auth, review-switch, smoke, import, **dedup**) passam.

- [ ] **Step 2: Write COMPLETION-fatia-4.md**

Documente, espelhando `COMPLETION-fatia-3.md`: US3 entregue; tabela FR→onde (FR-018–021/026); decisões D-F4.*; saída literal dos portões; itens diferidos (modos T/R e Texto completo → Fatia 5; view `prisma_counter` completa, trilho e export de auditoria → Fatia 6); achados de review resolvidos.

- [ ] **Step 3: Update slicing state**

Em `specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md`, marque:

```
- [x] Fatia 4 — Deduplicação (CHECKPOINT 3 — aguardando merge)
```

- [ ] **Step 4: Commit**

```bash
git add specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-4.md specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md
git commit -m "docs(fatia4): completion report + slicing state"
```

- [ ] **Step 5: PARAR — CHECKPOINT 3**

Apresente ao desenvolvedor: branch `build/001-marco1-nucleo-fluxo/4-deduplicacao`, o diff, e a saída literal de testes + `tsc --noEmit` + `npm run lint`. **NÃO** fazer merge/push. Aguardar o merge manual antes da Fatia 5.

---

## Self-Review (verificação do plano contra o spec/slicing)

**Cobertura de requisitos (US3 / FR-018–021, 026):**
- FR-018 (remover exatas auto; DOI senão title_norm+ano) → Task 2 (`dedup_exact`, D-F4.4).
- FR-019 (remoção automática reversível) → Task 2 (decisão `exact_auto`) + Task 3 (`reverse_dedup`).
- FR-020 (pares fuzzy lado a lado, mesma/distintas) → Task 4 (`list_fuzzy_candidates`) + Task 5 (`decide_fuzzy`) + Task 9 (UI lado a lado).
- FR-021 (mesclagem fuzzy registrada + reversível) → Task 5 (`decide_fuzzy merged`) + Task 3 (`reverse_dedup`).
- FR-026 (desfazer por item, a qualquer momento, nova `audit_entry`) → Task 3 (D-F4.6).
- Modo Duplicatas na superfície única (Princípio V) → Tasks 8/10 (sem rota nova).
- PRISMA "duplicados" → Task 6 (`countDuplicates`) + Task 10 (cabeçalho).
- Disparo automático ao concluir importação → Task 7 (D-F4.3).
- Testes-chave do slicing (≥80% dedup; exatas auto+reversão; fila fuzzy; contadores; estado órfão impedido) → Tasks 2/3/4/5 (integração) + Task 3 (dupla-reversão bloqueada = guarda contra estado órfão) + Task 11 (e2e).
- RLS das tabelas novas (SC-009) → Task 1 (`rls.dedup.test.ts`).

**Dependências de schema:** migration 0005 precede todo o código que a consome (Tasks 1–5 antes de 6–11); tipos regenerados (Task 1/Step 5) antes do uso TS. ✔

**Sem dependência nova:** `pg_trgm` (0003) e `@tanstack/react-query` já presentes — nenhuma tarefa de pin necessária. ✔

**Consistência de tipos/nomes:** `dedup_decision(record_a_id=mantido, record_b_id=removido)`, enums `dedup_kind/outcome/actor`, RPCs `dedup_exact/reverse_dedup/list_fuzzy_candidates/decide_fuzzy`, queries `listExactRemovals/listFuzzyCandidates/countDuplicates`, actions `runExactDedup/decideFuzzy/reverseDedup/fetchExactRemovals/fetchFuzzyCandidates` — usados de forma idêntica em todas as tasks. ✔

**Placeholders:** o único conteúdo deixado ao executor é o boilerplate de login/import do e2e (Task 11), explicitamente derivado de `import.spec.ts` existente — não pode ir com TODO ao commit final.
