# Fatia 3 — Workbench shell + Importação & registro de busca — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Escopo:** esta é a **Fatia 3 de 6** do Marco 1 (`001-marco1-nucleo-fluxo`).
> Fronteiras, dependências e gate de cobertura em
> [.superpowers/slicing.md](./.superpowers/slicing.md). NÃO planejar/implementar
> capacidades de outras fatias (dedup = Fatia 4; triagem/IA-em-lote = Fatia 5;
> trilho/PRISMA view/export de auditoria = Fatia 6).
> *(Os planos das Fatias 1 e 2 permanecem no histórico git — commit `6df6f8d` e anteriores.)*
>
> **Branch de trabalho:** `build/001-marco1-nucleo-fluxo/3-workbench-importacao`
> (criar via `superpowers:using-git-worktrees`). A sessão **NUNCA** faz `git merge`
> nem `git push` para a feature branch ou `main` — o merge é manual do desenvolvedor
> ao fim da fatia (CHECKPOINT 3).

**Goal:** Estabelecer a superfície única do workbench (Princípio V) com o modo **Importar** funcional — registro de busca + importação RIS/BibTeX/CSV com preview, sobre a infra de **jobs assíncronos** (enqueue valida → worker persiste, resiliente por-item).

**Architecture:** Núcleo de parsing e de jobs em **TypeScript portátil** (`supabase/functions/_shared/`), consumido por três frentes: (a) preview client-side no Next; (b) testes Vitest em Node; (c) Edge Functions Deno (`jobs-enqueue`/`jobs-worker`) como cascas HTTP finas. `jobs-enqueue` **parseia para validar** (malformado ⇒ 400, zero persistência — FR-016) e cria `job` + um `job_item` por registro via RPC atômica; o **worker** normaliza (`doi_normalized`/`title_norm`) e **insere os `record`s por item** (§VIII). A UI observa por **polling (TanStack Query)**. Em produção o worker é agendado por `pg_cron`→`pg_net`; nos testes/e2e o worker é disparado por um gatilho server-side guardado (sem depender de timing de cron nem de Deno no host).

**Tech Stack:** Next.js 14 (App Router, RSC default), TypeScript strict, Supabase (Postgres + RLS + RPC `SECURITY DEFINER` + Edge Functions Deno + `pg_trgm`/`pg_cron`/`pg_net`), TanStack Query, `papaparse` (CSV), `@retorquere/bibtex-parser` (BibTeX), parser RIS próprio. Vitest (unit+integração), Playwright (e2e).

---

## Decisões de implementação desta fatia (D-F3.\*)

Registradas aqui (espelham o estilo das D-F2.\* da Fatia 2). As marcadas **[DESVIO]** alteram o caminho literal do contrato/plan por restrição de ambiente e devem ser confirmadas no CHECKPOINT 2.

- **D-F3.1 — Núcleo portátil + Edge Functions reais (casca).** A lógica de parse/validação/enqueue/processamento-por-item vive em módulos TS portáveis em `supabase/functions/_shared/`. As Edge Functions `jobs-enqueue`/`jobs-worker` são cascas HTTP Deno sobre o núcleo. Os portões (Vitest contra o Postgres local; Playwright) exercitam o **núcleo** diretamente / via gatilho de teste guardado — sem Deno no host nem timing de `pg_cron`. (Decisão do desenvolvedor no CHECKPOINT 2.)
- **D-F3.2 — [DESVIO] Localização do núcleo de import/jobs.** O contrato `import-parsers.md` cita `src/lib/import/`. Como o deploy Deno **não alcança `src/`**, o núcleo vive em `supabase/functions/_shared/import/` e `supabase/functions/_shared/jobs/`. O app importa via alias `@shared/*`. Interface pública idêntica ao contrato (`ParsedRecord`, `ParseResult`, `BibliographicParser`).
- **D-F3.3 — [DESVIO] `tsconfig` exclui `supabase/functions`.** Os `index.ts` das Edge Functions usam globais Deno (`Deno.serve`) e specifiers `npm:`; seriam erro sob o `tsc` do host. O `tsconfig` raiz passa a `exclude` `supabase/functions`; o núcleo `_shared` (TS puro, sem globais Deno) é checado **transitivamente** pelo `tsc` ao ser importado por `src/`/`app/`, e os shells Deno são checados pelo Deno (no deploy), fora do host.
- **D-F3.4 — Parse valida no enqueue; persistência no worker.** `jobs-enqueue` roda o parser para validar (0 registros válidos ⇒ 400, zero persistência — FR-016) e cria `job`+`job_item`s (1 por `ParsedRecord`) via RPC atômica `create_import_job`. O **worker** normaliza e **insere os `record`s** por item, com commit por item (resiliência §VIII; persistência final no worker, fiel a `import-parsers.md`). (Decisão do desenvolvedor no CHECKPOINT 2.)
- **D-F3.5 — Gatilho do worker.** Produção: `pg_cron`→`pg_net` `POST` na Edge Function `jobs-worker` (migration `0004`, bloco guardado e resiliente a extensão ausente localmente). Marco 1/local/e2e: Server Action guardada `runImportWorker(reviewId)` (cliente service-role, escopada à Revisão do membro) chama o **mesmo** núcleo do worker. Documentada como stand-in síncrono do cron.
- **D-F3.6 — A3 (dependências de parsing) pinadas.** CSV = `papaparse`; BibTeX = `@retorquere/bibtex-parser` (maduro; ecossistema Zotero/BBT); RIS = parser próprio (formato tagged, line-oriented). `@tanstack/react-query` para polling. Todas entram por **tarefa explícita** (Task 1, constitution §Portões). Adapters isolam a lib atrás de `BibliographicParser` — troca de lib toca só `bibtex.ts`.
- **D-F3.7 — Wiring do app sobre o núcleo.** O modo Importar (client) parseia para preview e, no confirmar, chama a Server Action `enqueueImport` (núcleo de enqueue, cliente RLS do usuário, via RPC `create_import_job`). A Edge Function `jobs-enqueue` é o endpoint HTTP equivalente sobre o mesmo núcleo (contrato `async-jobs.md`), sem duplicar lógica.
- **D-F3.8 — PRISMA "identificados" mínimo.** A view `prisma_counter` completa é da Fatia 6. Aqui exibimos apenas `count(record)` da Revisão ("identificados") no cabeçalho do workbench. Sem view derivada nesta fatia.

---

## Escopo coberto (rastreio à spec/slicing)

| Item | Onde nesta fatia |
|------|------------------|
| US2 (importar + registrar busca no workbench) | Tasks 13–14 (workbench + Importar + busca) |
| FR-013 (importar RIS/BibTeX/CSV) | Tasks 5–8 (parsers) |
| FR-014 (preview com mapeamento de campos antes de confirmar) | Tasks 8, 14 (preview client) |
| FR-015 (registrar string/base/data/hits) | Tasks 9, 13, 14 (`search`) |
| FR-016 (malformado ⇒ erro claro, zero persistência parcial) | Tasks 9, 14 (validação no enqueue) |
| FR-017 (parsing de importações grandes sem bloquear; progresso visível) | Tasks 10, 14 (worker + polling) |
| FR-027 (workbench = superfície única por modos, sem telas separadas) | Task 13 (ModeBar + 1 rota) |
| A3 (libs de parsing pinadas) | Task 1 |
| §VIII (enqueue enfileira; worker processa por-item, retomável) | Tasks 9, 10 |
| SC-009 (isolamento RLS) | Task 11 |
| Princípio III (auditoria append-only de mudanças de estado) | Tasks 2, 9, 10 (audit em RPCs) |

**Fora desta fatia (não fazer):** modos Duplicatas/T-R/Texto completo funcionais (Fatia 4/5 — aqui ficam **presentes-mas-inertes**); `ai_screening_batch` (Fatia 5); dedup (Fatia 4); view `prisma_counter` completa, trilho de fases e export de auditoria (Fatia 6).

---

## File Structure

**Núcleo portátil (Deno + Node + browser) — `supabase/functions/_shared/`**
- `import/types.ts` — `SourceFormat`, `ParsedRecord`, `ParseError`, `ParseResult`, `BibliographicParser`.
- `import/normalize.ts` — `normalizeDoi`, `normalizeTitle` (chaves de dedup — R2, consumidas pelo worker).
- `import/csv.ts` — parser CSV via `papaparse`.
- `import/ris.ts` — parser RIS próprio.
- `import/bibtex.ts` — parser BibTeX (adapter sobre `@retorquere/bibtex-parser`).
- `import/index.ts` — `parserFor(format)`, `parseContent(format, content, opts)`.
- `jobs/types.ts` — `JobType`, `JobStatus`, `EnqueueImportInput`, `EnqueueResult`, `WorkerResult`, `EnqueueValidationError`.
- `jobs/enqueue.ts` — `enqueueImportJob(deps, reviewId, input)`.
- `jobs/worker.ts` — `processImportJob(deps, jobId)`.

**Edge Functions (cascas Deno) — `supabase/functions/`**
- `jobs-enqueue/index.ts` — `Deno.serve` → núcleo de enqueue (cliente RLS do chamador).
- `jobs-worker/index.ts` — `Deno.serve` → núcleo do worker (cliente service-role).
- `deno.json` — import map (`papaparse`, `@retorquere/bibtex-parser`, `@supabase/supabase-js`) para o runtime Deno.

**Migrations — `supabase/migrations/`**
- `0003_search_record_jobs.sql` — enums + `search`, `record`, `job`, `job_item` + índices (`pg_trgm`) + RLS + RPCs `create_import_job`, `insert_import_record`.
- `0004_jobs_cron.sql` — `pg_cron`/`pg_net` + agendamento do worker (bloco guardado, resiliente a extensão ausente local).

**App (Next) — `src/` e `app/`**
- `src/components/providers/QueryProvider.tsx` — provider TanStack Query (client).
- `src/lib/jobs/queries.ts` — `listJobs`, `countRecords`.
- `src/lib/search/schema.ts` — Zod do registro de busca.
- `src/components/workbench/ModeBar.tsx` — barra dos 4 modos (Importar ativo; demais inertes).
- `src/components/workbench/ImportPanel.tsx` — client: arquivo + preview + form de busca + confirmar + progresso.
- `src/components/workbench/ImportPreview.tsx` — tabela de preview.
- `src/components/workbench/JobProgress.tsx` — client: polling de status do job.
- `app/reviews/[reviewId]/workbench/page.tsx` — RSC: lê `?mode=`, monta ModeBar + modo ativo + contador "identificados".
- `app/reviews/[reviewId]/workbench/actions.ts` — `enqueueImport`, `runImportWorker`.
- `app/reviews/[reviewId]/layout.tsx` — **modificar**: link de nav "Workbench".

**Tooling (modificar)**
- `tsconfig.json` — `exclude` `supabase/functions`; `paths` `@shared/*`.
- `vitest.config.ts` — alias `@shared`.
- `package.json` — deps (Task 1).
- `.env.example` — `SUPABASE_FUNCTIONS_URL`, `CRON_SECRET` (worker).

**Testes — `tests/`**
- `tests/fixtures/import/{sample.ris,sample.bib,sample.csv,malformed.ris}`.
- `tests/unit/import/{normalize,csv,ris,bibtex,parse-content}.test.ts`.
- `tests/unit/workbench/import-preview.test.tsx`.
- `tests/integration/jobs.import.test.ts` — enqueue+worker contra Postgres local.
- `tests/integration/rls.record-search-job.test.ts` — SC-009 para tabelas novas.
- `tests/e2e/import.spec.ts` — fluxo "importar" + invariante de superfície única.

---

## Task 1: Dependências + toolchain (A3, §Portões)

**Files:**
- Modify: `package.json` (deps)
- Create: `supabase/functions/deno.json`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Instalar dependências de runtime e dev (tarefa explícita A3)**

Run:
```bash
npm install papaparse @tanstack/react-query @retorquere/bibtex-parser
npm install -D @types/papaparse
```
Expected: `package.json` ganha `papaparse`, `@tanstack/react-query`, `@retorquere/bibtex-parser` em `dependencies` e `@types/papaparse` em `devDependencies`. (Versões: deixar o npm pinar a atual; não editar à mão.)

- [ ] **Step 2: Excluir `supabase/functions` do `tsc` do host e adicionar alias `@shared`**

Modify `tsconfig.json` — em `compilerOptions.paths` adicionar `@shared/*`, e trocar `exclude`:
```jsonc
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["./supabase/functions/_shared/*"]
    }
```
```jsonc
  "exclude": ["node_modules", "supabase/functions"]
```
Rationale (D-F3.3): os shells Deno usam globais que quebrariam o `tsc` do host; o núcleo `_shared` é checado transitivamente via imports de `src`/`app`.

- [ ] **Step 3: Alias `@shared` no Vitest**

Modify `vitest.config.ts` — em `resolve.alias` adicionar a entrada `@shared`:
```ts
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@shared": fileURLToPath(
          new URL("./supabase/functions/_shared", import.meta.url),
        ),
      },
    },
```

- [ ] **Step 4: Import map do Deno para as Edge Functions**

Create `supabase/functions/deno.json`:
```json
{
  "imports": {
    "papaparse": "npm:papaparse@5",
    "@retorquere/bibtex-parser": "npm:@retorquere/bibtex-parser@9",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2"
  }
}
```
Nota: o núcleo `_shared` usa specifiers nus (`"papaparse"`, etc.); no host resolvem por `node_modules`, no Deno por este import map.

- [ ] **Step 5: Variáveis de ambiente do worker**

Modify `.env.example` — acrescentar ao fim:
```bash

# Worker de jobs assíncronos (D-F3.5)
# URL base das Edge Functions (local: igual ao SUPABASE_URL). Usada pelo pg_cron
# (produção) e pela Server Action de gatilho (local/e2e).
SUPABASE_FUNCTIONS_URL=http://127.0.0.1:54321
# Segredo compartilhado que autentica o disparo do worker (header x-cron-secret).
CRON_SECRET=local-dev-cron-secret
```

- [ ] **Step 6: Verificar typecheck e lint limpos (nada quebrou)**

Run: `npm run typecheck && npm run lint`
Expected: `tsc` sem saída; ESLint "No ESLint warnings or errors".

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts supabase/functions/deno.json .env.example
git commit -m "chore(fatia3): pin parsing/query deps + @shared alias + tsconfig exclude (A3)"
```

---

## Task 2: Migration 0003 — search, record, job, job_item (+ RLS + RPCs)

**Files:**
- Create: `supabase/migrations/0003_search_record_jobs.sql`
- Modify: `src/types/database.ts` (gerado)

- [ ] **Step 1: Escrever a migration**

Create `supabase/migrations/0003_search_record_jobs.sql`:
```sql
-- ============================================================
-- Marco 1 / Fatia 3 — Importação & jobs: search, record, job, job_item
-- RLS habilitado em TODAS as tabelas (Princípio IV).
-- Parsing valida no enqueue; persistência (record) no worker (D-F3.4).
-- ============================================================

create extension if not exists pg_trgm;

-- enums
create type source_format    as enum ('ris', 'bibtex', 'csv');
create type corpus_state      as enum (
  'imported', 'active',
  'duplicate_exact', 'duplicate_fuzzy',
  'excluded_ts', 'maybe_ts', 'included_ts', 'excluded_ft', 'included_ft'
);
create type ts_decision_state as enum ('included', 'excluded', 'maybe');
create type ft_decision_state as enum ('included', 'excluded');
create type job_type          as enum ('import_parse', 'ai_screening_batch');
create type job_status        as enum (
  'queued', 'running', 'completed', 'completed_with_errors', 'failed'
);
create type job_item_status   as enum ('pending', 'done', 'failed');

-- ---------- search (busca registrada — US2/FR-015) ----------
create table public.search (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  query_string text not null,
  database text not null,
  searched_on date not null,
  hits integer not null check (hits >= 0),
  created_at timestamptz not null default now()
);
create index search_review_idx on public.search (review_id, created_at);

-- ---------- record (registro bibliográfico — US2/US3/US4) ----------
create table public.record (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  search_id uuid references public.search (id) on delete set null,
  source_format source_format not null,
  raw jsonb not null,
  metadata jsonb not null,
  doi_normalized text,
  title_norm text,
  corpus_state corpus_state not null default 'imported',
  ts_decision ts_decision_state,
  ft_decision ft_decision_state,
  ft_exclusion_reason_id uuid, -- FK adicionada na Fatia 5 (exclusion_reason)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index record_review_idx on public.record (review_id, created_at);
create index record_doi_idx on public.record (review_id, doi_normalized);
create index record_title_trgm_idx on public.record using gin (title_norm gin_trgm_ops);

-- ---------- job + job_item (jobs assíncronos — §VIII/R3) ----------
create table public.job (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  type job_type not null,
  status job_status not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  estimated_cost jsonb,
  actual_cost jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index job_review_idx on public.job (review_id, created_at desc);

create table public.job_item (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job (id) on delete cascade,
  review_id uuid not null references public.review (id) on delete cascade,
  status job_item_status not null default 'pending',
  payload jsonb not null,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create index job_item_job_idx on public.job_item (job_id, status);

-- ============================================================
-- RPC: create_import_job — search + job + job_items + audit (atômico)
-- Chamado pelo enqueue com o JWT do usuário (D-F3.7). FR-016: o chamador TS
-- só invoca esta RPC se houver >= 1 registro válido (zero persistência se 0).
-- ============================================================
create or replace function public.create_import_job(
  p_review_id uuid,
  p_format source_format,
  p_search jsonb,
  p_items jsonb  -- array de ParsedRecord
)
returns public.job
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search public.search;
  v_job public.job;
  v_item jsonb;
  v_count int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count is null or v_count = 0 then
    raise exception 'no records to import';
  end if;

  insert into public.search (review_id, query_string, database, searched_on, hits)
  values (
    p_review_id,
    p_search ->> 'queryString',
    p_search ->> 'database',
    (p_search ->> 'searchedOn')::date,
    (p_search ->> 'hits')::int
  )
  returning * into v_search;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'import_parse', 'queued')
  returning * into v_job;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.job_item (job_id, review_id, payload)
    values (
      v_job.id, p_review_id,
      jsonb_build_object('record', v_item, 'search_id', v_search.id, 'format', p_format)
    );
  end loop;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    p_review_id, 'human', auth.uid(), 'enqueue_import', 'job', v_job.id,
    null, jsonb_build_object('item_count', v_count, 'search_id', v_search.id)
  );

  return v_job;
end;
$$;

-- ============================================================
-- RPC: insert_import_record — insere record + marca item done + audit (atômico)
-- Chamado pelo worker (service-role). Normalização vem pronta do TS (D-F3.4).
-- ============================================================
create or replace function public.insert_import_record(
  p_review_id uuid,
  p_search_id uuid,
  p_job_item_id uuid,
  p_source_format source_format,
  p_raw jsonb,
  p_metadata jsonb,
  p_doi_normalized text,
  p_title_norm text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
begin
  insert into public.record (
    review_id, search_id, source_format, raw, metadata,
    doi_normalized, title_norm, corpus_state
  )
  values (
    p_review_id, p_search_id, p_source_format, p_raw, p_metadata,
    nullif(p_doi_normalized, ''), nullif(p_title_norm, ''), 'imported'
  )
  returning id into v_record_id;

  update public.job_item set status = 'done' where id = p_job_item_id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    p_review_id, 'system', null, 'import_record', 'record', v_record_id,
    null, jsonb_build_object('source_format', p_source_format)
  );

  return v_record_id;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.search   enable row level security;
alter table public.record   enable row level security;
alter table public.job      enable row level security;
alter table public.job_item enable row level security;

-- Leitura por membros (escrita via RPC SECURITY DEFINER / service-role).
create policy search_select   on public.search   for select using (public.is_review_member(review_id));
create policy record_select   on public.record   for select using (public.is_review_member(review_id));
create policy job_select      on public.job      for select using (public.is_review_member(review_id));
create policy job_item_select on public.job_item for select using (public.is_review_member(review_id));

-- ============================================================
-- Grants
-- ============================================================
grant execute on function public.create_import_job(uuid, source_format, jsonb, jsonb) to authenticated;
-- insert_import_record: só o worker (service-role); negado ao authenticated/anon.
revoke execute on function public.insert_import_record(uuid, uuid, uuid, source_format, jsonb, jsonb, text, text) from authenticated, anon, public;
grant  execute on function public.insert_import_record(uuid, uuid, uuid, source_format, jsonb, jsonb, text, text) to service_role;
```

- [ ] **Step 2: Resetar o banco local e aplicar migrations**

Run: `npx supabase db reset`
Expected: aplica `0001`, `0002`, `0003` sem erro; mensagem final de sucesso do reset.

- [ ] **Step 3: Regerar os tipos do banco**

Run: `npm run gen:types`
Expected: `src/types/database.ts` passa a conter `search`, `record`, `job`, `job_item` e as funções `create_import_job`/`insert_import_record`.

- [ ] **Step 4: Verificar typecheck**

Run: `npm run typecheck`
Expected: sem saída (limpo).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_search_record_jobs.sql src/types/database.ts
git commit -m "feat(db): migration 0003 search/record/job/job_item + RLS + import RPCs"
```

---

## Task 3: Migration 0004 — agendamento do worker (pg_cron/pg_net, guardado)

**Files:**
- Create: `supabase/migrations/0004_jobs_cron.sql`

- [ ] **Step 1: Escrever a migration de agendamento (resiliente a extensão ausente)**

Create `supabase/migrations/0004_jobs_cron.sql`:
```sql
-- ============================================================
-- Marco 1 / Fatia 3 — Agendamento do worker (D-F3.5).
-- Produção: pg_cron dispara, a cada minuto, um POST (pg_net) na Edge Function
-- jobs-worker. Bloco guardado: se pg_cron/pg_net não estiverem disponíveis
-- (ex.: imagem local sem as extensões), apenas emite NOTICE e segue — o reset
-- local NÃO falha (os testes disparam o worker pelo gatilho server-side).
-- ============================================================
do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  perform cron.schedule(
    'jobs-worker-tick',
    '* * * * *',
    $cron$
    select net.http_post(
      url := current_setting('app.functions_url', true) || '/functions/v1/jobs-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
exception when others then
  raise notice 'pg_cron/pg_net indisponível — worker será disparado pelo gatilho server-side (D-F3.5). Detalhe: %', sqlerrm;
end $$;
```
Nota de execução: os GUCs `app.functions_url`/`app.cron_secret` são configurados no projeto de produção (`alter database ... set app.functions_url = ...`). Localmente o bloco cai no `exception` e não agenda — esperado.

- [ ] **Step 2: Resetar o banco local (confirmar que não quebra)**

Run: `npx supabase db reset`
Expected: reset conclui com sucesso. É aceitável ver o `NOTICE` "pg_cron/pg_net indisponível ..." se a imagem local não tiver as extensões — **o reset não pode falhar**.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_jobs_cron.sql
git commit -m "feat(db): migration 0004 guarded pg_cron/pg_net worker schedule"
```

---

## Task 4: Núcleo de import — tipos + normalização (unit)

**Files:**
- Create: `supabase/functions/_shared/import/types.ts`
- Create: `supabase/functions/_shared/import/normalize.ts`
- Test: `tests/unit/import/normalize.test.ts`

- [ ] **Step 1: Escrever os tipos do contrato**

Create `supabase/functions/_shared/import/types.ts`:
```ts
export type SourceFormat = "ris" | "bibtex" | "csv";

export interface ParsedRecord {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  abstract: string | null;
  language: string | null; // original (FR-038)
  raw: Record<string, unknown>; // campos originais íntegros
}

export interface ParseError {
  line: number | null;
  message: string; // pt-BR, claro (FR-016)
}

export interface ParseResult {
  records: ParsedRecord[];
  errors: ParseError[];
  format: SourceFormat;
}

export interface BibliographicParser {
  format: SourceFormat;
  parse(
    content: string,
    opts?: { fieldMap?: Record<string, string> },
  ): ParseResult;
}
```

- [ ] **Step 2: Escrever o teste de normalização (RED)**

Create `tests/unit/import/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeDoi, normalizeTitle } from "@shared/import/normalize";

describe("normalizeDoi", () => {
  it("remove o prefixo de URL e baixa a caixa", () => {
    expect(normalizeDoi("https://doi.org/10.1000/ABC.123")).toBe(
      "10.1000/abc.123",
    );
  });
  it("aceita DOI cru", () => {
    expect(normalizeDoi("10.1/X")).toBe("10.1/x");
  });
  it("retorna null para vazio/nulo", () => {
    expect(normalizeDoi("")).toBeNull();
    expect(normalizeDoi(null)).toBeNull();
  });
});

describe("normalizeTitle", () => {
  it("baixa caixa, remove pontuação e colapsa espaços", () => {
    expect(normalizeTitle("  A  Study, of   Things! ")).toBe(
      "a study of things",
    );
  });
  it("retorna null para vazio", () => {
    expect(normalizeTitle("   ")).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar o teste (verificar que falha)**

Run: `npm test -- tests/unit/import/normalize.test.ts`
Expected: FAIL — `Cannot find module '@shared/import/normalize'`.

- [ ] **Step 4: Implementar normalização (GREEN)**

Create `supabase/functions/_shared/import/normalize.ts`:
```ts
/** Normaliza DOI para chave de dedup exata (R2). */
export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const v = doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
    .trim();
  return v.length > 0 ? v : null;
}

/** Normaliza título para chave de dedup exata/fuzzy (R2). */
export function normalizeTitle(
  title: string | null | undefined,
): string | null {
  if (!title) return null;
  const v = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // diacríticos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // pontuação → espaço
    .replace(/\s+/g, " ")
    .trim();
  return v.length > 0 ? v : null;
}
```

- [ ] **Step 5: Rodar o teste (verificar que passa)**

Run: `npm test -- tests/unit/import/normalize.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/import/types.ts supabase/functions/_shared/import/normalize.ts tests/unit/import/normalize.test.ts
git commit -m "feat(import): ParsedRecord contract + doi/title normalization (R2)"
```

---

## Task 5: Parser CSV (papaparse)

**Files:**
- Create: `supabase/functions/_shared/import/csv.ts`
- Create: `tests/fixtures/import/sample.csv`
- Test: `tests/unit/import/csv.test.ts`

- [ ] **Step 1: Criar a fixture CSV**

Create `tests/fixtures/import/sample.csv`:
```csv
title,authors,year,doi,abstract,language
"Aprendizagem ativa em sala","Silva, A.; Souza, B.",2021,10.1000/abc,"Resumo um.",pt
"Active learning review","Doe, J.",2019,,"Abstract two.",en
```

- [ ] **Step 2: Escrever o teste (RED)**

Create `tests/unit/import/csv.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { csvParser } from "@shared/import/csv";

const sample = readFileSync("tests/fixtures/import/sample.csv", "utf8");

describe("csvParser", () => {
  it("parseia linhas válidas com cabeçalho padrão", () => {
    const res = csvParser.parse(sample);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    const [a, b] = res.records;
    expect(a!.title).toBe("Aprendizagem ativa em sala");
    expect(a!.authors).toEqual(["Silva, A.", "Souza, B."]);
    expect(a!.year).toBe(2021);
    expect(a!.doi).toBe("10.1000/abc");
    expect(a!.language).toBe("pt");
    expect(b!.doi).toBeNull();
  });

  it("aceita fieldMap para colunas não-padrão (FR-014)", () => {
    const custom = 'Título,Ano\n"X",2020\n';
    const res = csvParser.parse(custom, {
      fieldMap: { title: "Título", year: "Ano" },
    });
    expect(res.records).toHaveLength(1);
    expect(res.records[0]!.title).toBe("X");
    expect(res.records[0]!.year).toBe(2020);
  });

  it("conteúdo sem linhas de dados ⇒ zero records", () => {
    const res = csvParser.parse("title,year\n");
    expect(res.records).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Rodar o teste (verificar que falha)**

Run: `npm test -- tests/unit/import/csv.test.ts`
Expected: FAIL — módulo `@shared/import/csv` inexistente.

- [ ] **Step 4: Implementar o parser CSV (GREEN)**

Create `supabase/functions/_shared/import/csv.ts`:
```ts
import Papa from "papaparse";
import type { BibliographicParser, ParsedRecord, ParseError } from "./types";

const DEFAULT_MAP: Record<string, string> = {
  title: "title",
  authors: "authors",
  year: "year",
  doi: "doi",
  abstract: "abstract",
  language: "language",
};

function splitAuthors(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function toYear(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export const csvParser: BibliographicParser = {
  format: "csv",
  parse(content, opts) {
    const map = { ...DEFAULT_MAP, ...(opts?.fieldMap ?? {}) };
    const errors: ParseError[] = [];
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });
    for (const e of parsed.errors) {
      errors.push({ line: e.row ?? null, message: `Erro de CSV: ${e.message}` });
    }
    const records: ParsedRecord[] = (parsed.data ?? [])
      .filter((row) => (row[map.title] ?? "").trim().length > 0)
      .map((row) => ({
        title: (row[map.title] ?? "").trim(),
        authors: splitAuthors(row[map.authors]),
        year: toYear(row[map.year]),
        doi: (row[map.doi] ?? "").trim() || null,
        abstract: (row[map.abstract] ?? "").trim() || null,
        language: (row[map.language] ?? "").trim() || null,
        raw: row,
      }));
    return { records, errors, format: "csv" };
  },
};
```

- [ ] **Step 5: Rodar o teste (verificar que passa)**

Run: `npm test -- tests/unit/import/csv.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/import/csv.ts tests/fixtures/import/sample.csv tests/unit/import/csv.test.ts
git commit -m "feat(import): CSV parser (papaparse) with fieldMap (FR-013/014)"
```

---

## Task 6: Parser RIS (próprio)

**Files:**
- Create: `supabase/functions/_shared/import/ris.ts`
- Create: `tests/fixtures/import/sample.ris`
- Create: `tests/fixtures/import/malformed.ris`
- Test: `tests/unit/import/ris.test.ts`

- [ ] **Step 1: Criar fixtures RIS (válida e malformada)**

Create `tests/fixtures/import/sample.ris`:
```ris
TY  - JOUR
TI  - Aprendizagem ativa em sala
AU  - Silva, A.
AU  - Souza, B.
PY  - 2021
DO  - 10.1000/abc
AB  - Resumo um.
LA  - pt
ER  -
TY  - JOUR
T1  - Active learning review
A1  - Doe, J.
Y1  - 2019///
N2  - Abstract two.
LA  - en
ER  -
```

Create `tests/fixtures/import/malformed.ris`:
```ris
isto não é RIS
apenas texto solto
sem tags nem ER
```

- [ ] **Step 2: Escrever o teste (RED)**

Create `tests/unit/import/ris.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { risParser } from "@shared/import/ris";

const sample = readFileSync("tests/fixtures/import/sample.ris", "utf8");
const malformed = readFileSync("tests/fixtures/import/malformed.ris", "utf8");

describe("risParser", () => {
  it("parseia dois registros, mapeando tags primárias e alternativas", () => {
    const res = risParser.parse(sample);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    const [a, b] = res.records;
    expect(a!.title).toBe("Aprendizagem ativa em sala");
    expect(a!.authors).toEqual(["Silva, A.", "Souza, B."]);
    expect(a!.year).toBe(2021);
    expect(a!.doi).toBe("10.1000/abc");
    expect(a!.abstract).toBe("Resumo um.");
    expect(b!.title).toBe("Active learning review"); // T1
    expect(b!.authors).toEqual(["Doe, J."]); // A1
    expect(b!.year).toBe(2019); // Y1 com sufixo ///
  });

  it("arquivo sem tags/ER ⇒ zero records e erro claro (FR-016)", () => {
    const res = risParser.parse(malformed);
    expect(res.records).toHaveLength(0);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]!.message).toMatch(/RIS/i);
  });
});
```

- [ ] **Step 3: Rodar o teste (verificar que falha)**

Run: `npm test -- tests/unit/import/ris.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Implementar o parser RIS (GREEN)**

Create `supabase/functions/_shared/import/ris.ts`:
```ts
import type { BibliographicParser, ParsedRecord, ParseError } from "./types";

const TAG_RE = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/;

const TITLE_TAGS = ["TI", "T1"];
const AUTHOR_TAGS = ["AU", "A1"];
const YEAR_TAGS = ["PY", "Y1"];
const ABSTRACT_TAGS = ["AB", "N2"];

function emptyAccum(): Record<string, string[]> {
  return {};
}

function buildRecord(fields: Record<string, string[]>): ParsedRecord {
  const first = (tags: string[]): string | null => {
    for (const t of tags) if (fields[t]?.length) return fields[t]![0]!;
    return null;
  };
  const all = (tags: string[]): string[] => {
    const out: string[] = [];
    for (const t of tags) if (fields[t]) out.push(...fields[t]!);
    return out;
  };
  const yearRaw = first(YEAR_TAGS);
  const yearMatch = yearRaw?.match(/\d{4}/);
  return {
    title: first(TITLE_TAGS) ?? "",
    authors: all(AUTHOR_TAGS),
    year: yearMatch ? parseInt(yearMatch[0], 10) : null,
    doi: first(["DO"]),
    abstract: first(ABSTRACT_TAGS),
    language: first(["LA"]),
    raw: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v.length === 1 ? v[0]! : v]),
    ),
  };
}

export const risParser: BibliographicParser = {
  format: "ris",
  parse(content) {
    const errors: ParseError[] = [];
    const records: ParsedRecord[] = [];
    const lines = content.split(/\r\n|\r|\n/);

    let fields = emptyAccum();
    let lastTag: string | null = null;
    let sawAnyTag = false;
    let openRecord = false;

    lines.forEach((line) => {
      if (line.trim() === "") return;
      const m = line.match(TAG_RE);
      if (!m) {
        // linha de continuação do último campo
        if (lastTag && fields[lastTag]?.length) {
          const arr = fields[lastTag]!;
          arr[arr.length - 1] = `${arr[arr.length - 1]} ${line.trim()}`;
        }
        return;
      }
      const [, tag, value] = m;
      sawAnyTag = true;
      if (tag === "TY") {
        fields = emptyAccum();
        openRecord = true;
        lastTag = null;
        return;
      }
      if (tag === "ER") {
        if (openRecord) records.push(buildRecord(fields));
        fields = emptyAccum();
        openRecord = false;
        lastTag = null;
        return;
      }
      (fields[tag!] ??= []).push((value ?? "").trim());
      lastTag = tag!;
    });

    if (!sawAnyTag) {
      errors.push({
        line: 1,
        message:
          "Arquivo RIS inválido: nenhuma tag reconhecida (esperado 'TY  - ...').",
      });
    } else if (openRecord && records.length === 0) {
      errors.push({
        line: lines.length,
        message: "Arquivo RIS inválido: registro sem marcador de fim 'ER  -'.",
      });
    }

    return { records, errors, format: "ris" };
  },
};
```

- [ ] **Step 5: Rodar o teste (verificar que passa)**

Run: `npm test -- tests/unit/import/ris.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/import/ris.ts tests/fixtures/import/sample.ris tests/fixtures/import/malformed.ris tests/unit/import/ris.test.ts
git commit -m "feat(import): RIS parser (own, tagged line-oriented) + malformed guard (FR-016)"
```

---

## Task 7: Parser BibTeX (adapter sobre @retorquere/bibtex-parser)

**Files:**
- Create: `supabase/functions/_shared/import/bibtex.ts`
- Create: `tests/fixtures/import/sample.bib`
- Test: `tests/unit/import/bibtex.test.ts`

- [ ] **Step 1: Criar a fixture BibTeX**

Create `tests/fixtures/import/sample.bib`:
```bibtex
@article{silva2021,
  title = {Aprendizagem ativa em sala},
  author = {Silva, A. and Souza, B.},
  year = {2021},
  doi = {10.1000/abc},
  abstract = {Resumo um.},
  language = {pt}
}
@article{doe2019,
  title = {Active learning review},
  author = {Doe, J.},
  year = {2019}
}
```

- [ ] **Step 2: Escrever o teste (RED) — o teste é o contrato de saída**

Create `tests/unit/import/bibtex.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bibtexParser } from "@shared/import/bibtex";

const sample = readFileSync("tests/fixtures/import/sample.bib", "utf8");

describe("bibtexParser", () => {
  it("parseia dois registros e mapeia campos para ParsedRecord", () => {
    const res = bibtexParser.parse(sample);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    const [a, b] = res.records;
    expect(a!.title).toBe("Aprendizagem ativa em sala");
    expect(a!.authors).toEqual(["Silva, A.", "Souza, B."]);
    expect(a!.year).toBe(2021);
    expect(a!.doi).toBe("10.1000/abc");
    expect(a!.abstract).toBe("Resumo um.");
    expect(a!.language).toBe("pt");
    expect(b!.title).toBe("Active learning review");
    expect(b!.doi).toBeNull();
    expect(b!.year).toBe(2019);
  });

  it("conteúdo sem entradas válidas ⇒ zero records (FR-016)", () => {
    const res = bibtexParser.parse("isto não é bibtex {{{");
    expect(res.records).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Rodar o teste (verificar que falha)**

Run: `npm test -- tests/unit/import/bibtex.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Implementar o adapter BibTeX (GREEN)**

Create `supabase/functions/_shared/import/bibtex.ts`. As acessoras (`asString`, leitura de `fields`/`creators`) são **defensivas** para tolerar variações de shape entre versões da lib; o teste do Step 2 é o contrato — se o mapeamento divergir, ajustar o acesso a campos (inspecionar `JSON.stringify(parse(sample))` num scratch) até o teste passar, **sem alterar o teste**.
```ts
import { parse as parseBibtex } from "@retorquere/bibtex-parser";
import type { BibliographicParser, ParsedRecord, ParseError } from "./types";

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? asString(v[0]) : null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function authorsFrom(entry: Record<string, unknown>): string[] {
  // @retorquere expõe nomes em `creators.author` (lista de {firstName,lastName})
  // ou, conforme a versão, em fields.author. Tratamos ambos.
  const creators = (entry.creators as Record<string, unknown> | undefined)
    ?.author;
  if (Array.isArray(creators)) {
    return creators
      .map((c) => {
        const o = c as { lastName?: string; firstName?: string; name?: string };
        if (o.name) return o.name.trim();
        const last = (o.lastName ?? "").trim();
        const first = (o.firstName ?? "").trim();
        return [last, first].filter(Boolean).join(", ");
      })
      .filter((s) => s.length > 0);
  }
  const fields = entry.fields as Record<string, unknown> | undefined;
  const raw = asString(fields?.author);
  if (!raw) return [];
  return raw
    .split(/\s+and\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export const bibtexParser: BibliographicParser = {
  format: "bibtex",
  parse(content) {
    const errors: ParseError[] = [];
    let entries: Array<Record<string, unknown>> = [];
    try {
      const bib = parseBibtex(content) as { entries?: unknown };
      entries = Array.isArray(bib.entries)
        ? (bib.entries as Array<Record<string, unknown>>)
        : [];
    } catch (e) {
      errors.push({
        line: null,
        message: `Arquivo BibTeX inválido: ${(e as Error).message}`,
      });
      return { records: [], errors, format: "bibtex" };
    }

    const records: ParsedRecord[] = [];
    for (const entry of entries) {
      const fields = (entry.fields ?? {}) as Record<string, unknown>;
      const title = asString(fields.title);
      if (!title) continue; // entrada sem título não é registro válido
      const yearStr = asString(fields.year) ?? asString(fields.date);
      const yearMatch = yearStr?.match(/\d{4}/);
      records.push({
        title,
        authors: authorsFrom(entry),
        year: yearMatch ? parseInt(yearMatch[0], 10) : null,
        doi: asString(fields.doi),
        abstract: asString(fields.abstract),
        language: asString(fields.language) ?? asString(fields.langid),
        raw: { type: entry.type, key: entry.key, fields },
      });
    }
    return { records, errors, format: "bibtex" };
  },
};
```

- [ ] **Step 5: Rodar o teste (verificar que passa)**

Run: `npm test -- tests/unit/import/bibtex.test.ts`
Expected: PASS (2 testes). Se o primeiro teste falhar por shape da lib, inspecionar a saída de `parseBibtex(sample)` e ajustar `authorsFrom`/acesso a `fields` até passar (não alterar o teste).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/import/bibtex.ts tests/fixtures/import/sample.bib tests/unit/import/bibtex.test.ts
git commit -m "feat(import): BibTeX parser adapter (@retorquere/bibtex-parser) (FR-013)"
```

---

## Task 8: Roteador de parsers + parseContent

**Files:**
- Create: `supabase/functions/_shared/import/index.ts`
- Test: `tests/unit/import/parse-content.test.ts`

- [ ] **Step 1: Escrever o teste (RED)**

Create `tests/unit/import/parse-content.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseContent, parserFor } from "@shared/import/index";

describe("parseContent", () => {
  it("roteia por formato", () => {
    expect(parserFor("ris").format).toBe("ris");
    expect(parserFor("bibtex").format).toBe("bibtex");
    expect(parserFor("csv").format).toBe("csv");
  });

  it("parseia RIS pela fachada única", () => {
    const ris = readFileSync("tests/fixtures/import/sample.ris", "utf8");
    const res = parseContent("ris", ris);
    expect(res.records).toHaveLength(2);
    expect(res.format).toBe("ris");
  });
});
```

- [ ] **Step 2: Rodar o teste (verificar que falha)**

Run: `npm test -- tests/unit/import/parse-content.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar a fachada (GREEN)**

Create `supabase/functions/_shared/import/index.ts`:
```ts
import { csvParser } from "./csv";
import { risParser } from "./ris";
import { bibtexParser } from "./bibtex";
import type { BibliographicParser, ParseResult, SourceFormat } from "./types";

const PARSERS: Record<SourceFormat, BibliographicParser> = {
  csv: csvParser,
  ris: risParser,
  bibtex: bibtexParser,
};

export function parserFor(format: SourceFormat): BibliographicParser {
  return PARSERS[format];
}

export function parseContent(
  format: SourceFormat,
  content: string,
  opts?: { fieldMap?: Record<string, string> },
): ParseResult {
  return parserFor(format).parse(content, opts);
}

export type {
  SourceFormat,
  ParsedRecord,
  ParseError,
  ParseResult,
  BibliographicParser,
} from "./types";
```

- [ ] **Step 4: Rodar o teste + cobertura do diretório import (≥80%, constitution §Testes)**

Run: `npm test -- tests/unit/import/`
Expected: PASS (todos). Confirmar visualmente que os 4 parsers + normalize estão cobertos pelos casos válidos/malformados/fieldMap.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/import/index.ts tests/unit/import/parse-content.test.ts
git commit -m "feat(import): single parseContent facade + parser router"
```

---

## Task 9: Núcleo de enqueue (valida + cria job/itens)

**Files:**
- Create: `supabase/functions/_shared/jobs/types.ts`
- Create: `supabase/functions/_shared/jobs/enqueue.ts`
- Test: `tests/integration/jobs.import.test.ts` (parte 1 — enqueue)

- [ ] **Step 1: Escrever os tipos de jobs**

Create `supabase/functions/_shared/jobs/types.ts`:
```ts
import type { SourceFormat } from "../import/types";

export interface SearchInput {
  queryString: string;
  database: string;
  searchedOn: string; // ISO date (yyyy-mm-dd)
  hits: number;
}

export interface EnqueueImportInput {
  format: SourceFormat;
  content: string;
  fieldMap?: Record<string, string>;
  search: SearchInput;
}

export interface EnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
  estimated_cost: null; // import_parse não tem custo de IA
}

export interface WorkerResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

/** Erro de validação que o shell HTTP mapeia para 400 (FR-016). */
export class EnqueueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnqueueValidationError";
  }
}

/** Dependências injetáveis (mantém o núcleo portátil/testável). */
export interface JobDeps {
  // Cliente Supabase tipado (Node nos testes; Deno no shell).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}
```
Nota: `supabase: any` está isolado em deps de baixo nível; o ESLint do projeto proíbe `any`, por isso o `eslint-disable-next-line` pontual (não há `SupabaseClient<Database>` disponível no runtime Deno sem acoplar o gerado). O núcleo de domínio permanece tipado.

- [ ] **Step 2: Escrever o teste de integração do enqueue (RED)**

Create `tests/integration/jobs.import.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { EnqueueValidationError } from "@shared/jobs/types";

const ris = readFileSync("tests/fixtures/import/sample.ris", "utf8");
const malformed = readFileSync("tests/fixtures/import/malformed.ris", "utf8");

describe("import job — enqueue (§VIII / FR-016)", () => {
  let userClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`imp_${stamp}@example.com`, "senha-teste-123");
    userClient = u.client;
    const { data } = await userClient.rpc("create_review", {
      p_title: "Importação",
    });
    reviewId = data.id;
  });

  const search = {
    queryString: "active learning",
    database: "ERIC",
    searchedOn: "2026-05-30",
    hits: 2,
  };

  it("RIS válido ⇒ cria job + itens, mas NÃO cria records ainda (enqueue não processa)", async () => {
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search,
    });
    expect(res.status).toBe("queued");
    expect(res.item_count).toBe(2);

    const { count: itemCount } = await userClient
      .from("job_item")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(itemCount).toBe(2);

    const { count: recordCount } = await userClient
      .from("record")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(recordCount).toBe(0); // §VIII: worker ainda não rodou
  });

  it("arquivo malformado ⇒ EnqueueValidationError e zero persistência (FR-016)", async () => {
    await expect(
      enqueueImportJob({ supabase: userClient }, reviewId, {
        format: "ris",
        content: malformed,
        search,
      }),
    ).rejects.toBeInstanceOf(EnqueueValidationError);

    // Nada novo persistido por causa do malformado: continua só o search válido anterior.
    const { count: searchCount } = await serviceClient()
      .from("search")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(searchCount).toBe(1);
  });
});
```

- [ ] **Step 3: Rodar o teste (verificar que falha)**

Run: `npm test -- tests/integration/jobs.import.test.ts`
Expected: FAIL — `@shared/jobs/enqueue` inexistente.

- [ ] **Step 4: Implementar o núcleo de enqueue (GREEN)**

Create `supabase/functions/_shared/jobs/enqueue.ts`:
```ts
import { parseContent } from "../import/index";
import {
  type EnqueueImportInput,
  type EnqueueResult,
  type JobDeps,
  EnqueueValidationError,
} from "./types";

/**
 * Valida e enfileira uma importação (D-F3.4). Parseia para validar:
 * 0 registros válidos ⇒ EnqueueValidationError (FR-016, zero persistência).
 * Caso contrário, cria search + job + job_items atômicos via RPC create_import_job.
 * NÃO insere records — isso é trabalho do worker (§VIII).
 */
export async function enqueueImportJob(
  deps: JobDeps,
  reviewId: string,
  input: EnqueueImportInput,
): Promise<EnqueueResult> {
  const result = parseContent(input.format, input.content, {
    fieldMap: input.fieldMap,
  });

  if (result.records.length === 0) {
    const detail = result.errors[0]?.message ?? "nenhum registro válido.";
    throw new EnqueueValidationError(
      `Importação rejeitada: ${detail} Nenhum registro foi salvo.`,
    );
  }

  const { data, error } = await deps.supabase.rpc("create_import_job", {
    p_review_id: reviewId,
    p_format: input.format,
    p_search: input.search,
    p_items: result.records,
  });
  if (error) throw new Error(error.message);

  return {
    job_id: data.id,
    status: "queued",
    item_count: result.records.length,
    estimated_cost: null,
  };
}
```

- [ ] **Step 5: Rodar o teste (verificar que passa)**

Run: `npm test -- tests/integration/jobs.import.test.ts`
Expected: PASS (2 testes da suíte de enqueue). Requer `supabase start` ativo e `.env.local` preenchido.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/jobs/types.ts supabase/functions/_shared/jobs/enqueue.ts tests/integration/jobs.import.test.ts
git commit -m "feat(jobs): enqueue core — validate parse, create job/items (§VIII/FR-016)"
```

---

## Task 10: Núcleo do worker (persiste records por item, resiliente)

**Files:**
- Create: `supabase/functions/_shared/jobs/worker.ts`
- Modify: `tests/integration/jobs.import.test.ts` (parte 2 — worker)

- [ ] **Step 1: Adicionar o bloco de teste do worker (RED)**

Modify `tests/integration/jobs.import.test.ts` — acrescentar o import e este `describe` ao fim do arquivo:
```ts
import { processImportJob } from "@shared/jobs/worker";

describe("import job — worker (§VIII resiliência por-item)", () => {
  let userClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let jobId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`wrk_${stamp}@example.com`, "senha-teste-123");
    userClient = u.client;
    const { data: review } = await userClient.rpc("create_review", {
      p_title: "Worker",
    });
    reviewId = review.id;
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search: {
        queryString: "x",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 2,
      },
    });
    jobId = res.job_id;
  });

  it("processa todos os itens ⇒ records inseridos + job completed", async () => {
    const out = await processImportJob({ supabase: serviceClient() }, jobId);
    expect(out.status).toBe("completed");
    expect(out.done).toBe(2);
    expect(out.failed).toBe(0);

    const { count } = await userClient
      .from("record")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBe(2);

    const { data: rec } = await userClient
      .from("record")
      .select("doi_normalized, corpus_state")
      .eq("review_id", reviewId)
      .not("doi_normalized", "is", null)
      .limit(1)
      .maybeSingle();
    expect(rec!.doi_normalized).toBe("10.1000/abc"); // normalização aplicada
    expect(rec!.corpus_state).toBe("imported");
  });

  it("falha forçada num item ⇒ completed_with_errors, demais done", async () => {
    const u = await signUpUser(
      `wrk2_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: review } = await u.client.rpc("create_review", {
      p_title: "Worker2",
    });
    const res = await enqueueImportJob({ supabase: u.client }, review.id, {
      format: "ris",
      content: ris,
      search: {
        queryString: "x",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 2,
      },
    });
    let n = 0;
    const out = await processImportJob(
      {
        supabase: serviceClient(),
        // injeta processamento que falha no 1º item (DI — D-F3.1)
        processItem: async (item, real) => {
          n += 1;
          if (n === 1) throw new Error("falha simulada");
          return real(item);
        },
      },
      res.job_id,
    );
    expect(out.status).toBe("completed_with_errors");
    expect(out.failed).toBe(1);
    expect(out.done).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar o teste (verificar que falha)**

Run: `npm test -- tests/integration/jobs.import.test.ts`
Expected: FAIL — `@shared/jobs/worker` inexistente.

- [ ] **Step 3: Implementar o núcleo do worker (GREEN)**

Create `supabase/functions/_shared/jobs/worker.ts`:
```ts
import { normalizeDoi, normalizeTitle } from "../import/normalize";
import type { ParsedRecord, SourceFormat } from "../import/types";
import type { JobDeps, WorkerResult } from "./types";

interface ImportItemPayload {
  record: ParsedRecord;
  search_id: string;
  format: SourceFormat;
}

interface WorkItem {
  id: string;
  payload: ImportItemPayload;
  review_id: string;
}

interface WorkerDeps extends JobDeps {
  /** Override de processamento por item (testes — D-F3.1). `real` aplica o default. */
  processItem?: (
    item: WorkItem,
    real: (i: WorkItem) => Promise<void>,
  ) => Promise<void>;
}

/**
 * Processa um job de importação item-a-item (§VIII): normaliza (R2) e insere
 * cada record via RPC atômica insert_import_record. Falha de um item ⇒ item
 * 'failed' (não derruba o job). Retomável: só pega itens 'pending'.
 */
export async function processImportJob(
  deps: WorkerDeps,
  jobId: string,
): Promise<WorkerResult> {
  const { supabase } = deps;

  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const { data: items, error } = await supabase
    .from("job_item")
    .select("id, payload, review_id")
    .eq("job_id", jobId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  const real = async (i: WorkItem) => {
    const rec = i.payload.record;
    const { error: rpcErr } = await supabase.rpc("insert_import_record", {
      p_review_id: i.review_id,
      p_search_id: i.payload.search_id,
      p_job_item_id: i.id,
      p_source_format: i.payload.format,
      p_raw: rec.raw,
      p_metadata: {
        title: rec.title,
        authors: rec.authors,
        year: rec.year,
        doi: rec.doi,
        abstract: rec.abstract,
        language: rec.language,
      },
      p_doi_normalized: normalizeDoi(rec.doi) ?? "",
      p_title_norm: normalizeTitle(rec.title) ?? "",
    });
    if (rpcErr) throw new Error(rpcErr.message);
  };

  let done = 0;
  let failed = 0;
  for (const item of (items ?? []) as WorkItem[]) {
    try {
      if (deps.processItem) await deps.processItem(item, real);
      else await real(item);
      done += 1;
    } catch (e) {
      failed += 1;
      await supabase
        .from("job_item")
        .update({
          status: "failed",
          error: (e as Error).message,
          attempts: 1,
        })
        .eq("id", item.id);
    }
  }

  const total = done + failed;
  const status =
    failed === 0 ? "completed" : done === 0 ? "failed" : "completed_with_errors";
  await supabase
    .from("job")
    .update({
      status,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return { job_id: jobId, status, done, failed };
}
```

- [ ] **Step 4: Rodar a suíte completa do job (verificar que passa)**

Run: `npm test -- tests/integration/jobs.import.test.ts`
Expected: PASS (enqueue + worker, 4 testes).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/jobs/worker.ts tests/integration/jobs.import.test.ts
git commit -m "feat(jobs): worker core — per-item record insert, resilient + resumable (§VIII)"
```

---

## Task 11: RLS das tabelas novas (SC-009)

**Files:**
- Test: `tests/integration/rls.record-search-job.test.ts`

> A RLS já foi escrita na migration 0003; este teste a verifica (vermelho só se a política estiver errada).

- [ ] **Step 1: Escrever o teste de isolamento**

Create `tests/integration/rls.record-search-job.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";

const ris = readFileSync("tests/fixtures/import/sample.ris", "utf8");

describe("RLS — record/search/job isolados por Revisão (SC-009)", () => {
  let aClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let bClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewIdA: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const a = await signUpUser(`rls_a_${stamp}@example.com`, "senha-teste-123");
    const b = await signUpUser(`rls_b_${stamp}@example.com`, "senha-teste-123");
    aClient = a.client;
    bClient = b.client;
    const { data } = await aClient.rpc("create_review", { p_title: "A" });
    reviewIdA = data.id;
    const res = await enqueueImportJob({ supabase: aClient }, reviewIdA, {
      format: "ris",
      content: ris,
      search: {
        queryString: "x",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 2,
      },
    });
    await processImportJob({ supabase: serviceClient() }, res.job_id);
  });

  it("A enxerga seus records", async () => {
    const { data } = await aClient
      .from("record")
      .select("id")
      .eq("review_id", reviewIdA);
    expect((data ?? []).length).toBe(2);
  });

  it("B NÃO enxerga record/search/job/job_item de A (0 vazamentos)", async () => {
    for (const table of ["record", "search", "job", "job_item"] as const) {
      const { data } = await bClient
        .from(table)
        .select("id")
        .eq("review_id", reviewIdA);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("B NÃO consegue chamar create_import_job na Revisão de A", async () => {
    const { error } = await bClient.rpc("create_import_job", {
      p_review_id: reviewIdA,
      p_format: "ris",
      p_search: {
        queryString: "x",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 1,
      },
      p_items: [
        {
          title: "intruso",
          authors: [],
          year: null,
          doi: null,
          abstract: null,
          language: null,
          raw: {},
        },
      ],
    });
    expect(error).not.toBeNull(); // 'not a member'
  });
});
```

- [ ] **Step 2: Rodar o teste (verificar que passa)**

Run: `npm test -- tests/integration/rls.record-search-job.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rls.record-search-job.test.ts
git commit -m "test(rls): record/search/job isolation + non-member enqueue denied (SC-009)"
```

---

## Task 12: Edge Functions (cascas Deno) — jobs-enqueue, jobs-worker

**Files:**
- Create: `supabase/functions/jobs-enqueue/index.ts`
- Create: `supabase/functions/jobs-worker/index.ts`

> Estes arquivos NÃO são checados pelo `tsc` do host (D-F3.3, excluídos). São cascas finas sobre o núcleo já testado. Validação real: deploy/Deno (fora desta sessão). Mantê-los mínimos.

- [ ] **Step 1: Escrever a Edge Function de enqueue**

Create `supabase/functions/jobs-enqueue/index.ts`:
```ts
// Edge Function (Deno) — casca HTTP sobre enqueueImportJob (D-F3.1/contrato async-jobs).
import { createClient } from "@supabase/supabase-js";
import { enqueueImportJob } from "../_shared/jobs/enqueue.ts";
import { EnqueueValidationError } from "../_shared/jobs/types.ts";

Deno.serve(async (req: Request) => {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const body = await req.json();
    const { review_id, type, payload } = body;
    if (type !== "import_parse") {
      return Response.json({ error: "tipo não suportado" }, { status: 400 });
    }
    // Cliente com o JWT do chamador → RLS valida membership.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const result = await enqueueImportJob({ supabase }, review_id, payload);
    return Response.json(result, { status: 202 });
  } catch (e) {
    if (e instanceof EnqueueValidationError) {
      return Response.json({ error: e.message }, { status: 400 }); // FR-016
    }
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
```

- [ ] **Step 2: Escrever a Edge Function do worker**

Create `supabase/functions/jobs-worker/index.ts`:
```ts
// Edge Function (Deno) agendada por pg_cron (D-F3.5). Processa jobs queued.
import { createClient } from "@supabase/supabase-js";
import { processImportJob } from "../_shared/jobs/worker.ts";

Deno.serve(async (req: Request) => {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== Deno.env.get("CRON_SECRET")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: jobs } = await supabase
    .from("job")
    .select("id")
    .eq("type", "import_parse")
    .in("status", ["queued", "running"]);
  const results = [];
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    results.push(await processImportJob({ supabase }, j.id));
  }
  return Response.json({ processed: results }, { status: 200 });
});
```

- [ ] **Step 3: Confirmar que o host segue limpo (functions excluídas do tsc)**

Run: `npm run typecheck`
Expected: sem saída — `supabase/functions/*/index.ts` não são checados (D-F3.3). Se aparecerem erros de `Deno`/`npm:`, confirmar o `exclude` da Task 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/jobs-enqueue/index.ts supabase/functions/jobs-worker/index.ts
git commit -m "feat(edge): jobs-enqueue + jobs-worker HTTP shells over shared core"
```

---

## Task 13: App — QueryProvider, queries de jobs, schema de busca, workbench + ModeBar + actions

**Files:**
- Create: `src/components/providers/QueryProvider.tsx`
- Create: `src/lib/jobs/queries.ts`
- Create: `src/lib/search/schema.ts`
- Create: `src/components/workbench/ModeBar.tsx`
- Create: `app/reviews/[reviewId]/workbench/page.tsx`
- Create: `app/reviews/[reviewId]/workbench/actions.ts`
- Modify: `app/reviews/[reviewId]/layout.tsx`

> Os gates (typecheck/lint) desta task só fecham junto com a Task 14 (a página importa `ImportPanel`). Rodar os portões ao fim da Task 14.

- [ ] **Step 1: Provider TanStack Query (client)**

Create `src/components/providers/QueryProvider.tsx`:
```tsx
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Queries de jobs + contador de records**

Create `src/lib/jobs/queries.ts`:
```ts
import { createClient } from "@/lib/supabase/server";

export interface JobRow {
  id: string;
  type: string;
  status: string;
  progress: number;
  created_at: string;
}

export async function listJobs(reviewId: string): Promise<JobRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job")
    .select("id, type, status, progress, created_at")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function countRecords(reviewId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("record")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

- [ ] **Step 3: Schema Zod do registro de busca (FR-015)**

Create `src/lib/search/schema.ts`:
```ts
import { z } from "zod";

export const searchSchema = z.object({
  queryString: z.string().trim().min(1, "Informe a string de busca."),
  database: z.string().trim().min(1, "Informe a base consultada."),
  searchedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  hits: z.coerce.number().int().min(0, "Hits não pode ser negativo."),
});

export type SearchInput = z.infer<typeof searchSchema>;
```

- [ ] **Step 4: Server Actions — enqueueImport + runImportWorker (D-F3.5/D-F3.7)**

Create `app/reviews/[reviewId]/workbench/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";
import { EnqueueValidationError } from "@shared/jobs/types";
import { searchSchema } from "@/lib/search/schema";
import type { SourceFormat } from "@shared/import/types";

async function requireMember(reviewId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !data) throw new Error("not a member");
  return { supabase };
}

export async function enqueueImport(
  reviewId: string,
  input: {
    format: SourceFormat;
    content: string;
    fieldMap?: Record<string, string>;
    search: unknown;
  },
) {
  const parsedSearch = searchSchema.safeParse(input.search);
  if (!parsedSearch.success) {
    return { ok: false as const, error: "Dados da busca inválidos." };
  }
  const { supabase } = await requireMember(reviewId);
  try {
    const res = await enqueueImportJob({ supabase }, reviewId, {
      format: input.format,
      content: input.content,
      fieldMap: input.fieldMap,
      search: parsedSearch.data,
    });
    revalidatePath(`/reviews/${reviewId}/workbench`);
    return { ok: true as const, jobId: res.job_id, itemCount: res.item_count };
  } catch (e) {
    if (e instanceof EnqueueValidationError) {
      return { ok: false as const, error: e.message }; // FR-016
    }
    throw e;
  }
}

/**
 * Gatilho síncrono do worker (Marco 1 / local / e2e — D-F3.5). Em produção o
 * worker é o jobs-worker agendado por pg_cron. Escopado: só processa jobs da
 * Revisão da qual o chamador é membro.
 */
export async function runImportWorker(reviewId: string) {
  await requireMember(reviewId);
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
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}
```

- [ ] **Step 5: ModeBar — superfície única, modos por searchParam (FR-027/Princípio V)**

Create `src/components/workbench/ModeBar.tsx`:
```tsx
import Link from "next/link";

export type WorkbenchMode =
  | "import"
  | "duplicates"
  | "title_abstract"
  | "full_text";

const MODES: { key: WorkbenchMode; label: string; enabled: boolean }[] = [
  { key: "import", label: "Importar", enabled: true },
  { key: "duplicates", label: "Duplicatas", enabled: false },
  { key: "title_abstract", label: "Título/Resumo", enabled: false },
  { key: "full_text", label: "Texto completo", enabled: false },
];

export function ModeBar({
  reviewId,
  active,
}: {
  reviewId: string;
  active: WorkbenchMode;
}) {
  return (
    <nav
      aria-label="Modos do workbench"
      className="flex gap-1 border-b pb-2"
      role="tablist"
    >
      {MODES.map((m) =>
        m.enabled ? (
          <Link
            key={m.key}
            href={`/reviews/${reviewId}/workbench?mode=${m.key}`}
            role="tab"
            aria-selected={active === m.key}
            className={`rounded px-3 py-1 text-sm ${
              active === m.key ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            {m.label}
          </Link>
        ) : (
          <span
            key={m.key}
            role="tab"
            aria-disabled="true"
            title="Disponível em uma etapa seguinte"
            className="cursor-not-allowed rounded px-3 py-1 text-sm text-gray-400"
          >
            {m.label}
          </span>
        ),
      )}
    </nav>
  );
}
```

- [ ] **Step 6: Página do workbench (RSC) — superfície única**

Create `app/reviews/[reviewId]/workbench/page.tsx`:
```tsx
import { ModeBar, type WorkbenchMode } from "@/components/workbench/ModeBar";
import { ImportPanel } from "@/components/workbench/ImportPanel";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { countRecords } from "@/lib/jobs/queries";

export const dynamic = "force-dynamic";

const VALID: WorkbenchMode[] = [
  "import",
  "duplicates",
  "title_abstract",
  "full_text",
];

export default async function WorkbenchPage({
  params,
  searchParams,
}: {
  params: Promise<{ reviewId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { reviewId } = await params;
  const { mode } = await searchParams;
  const active: WorkbenchMode = VALID.includes(mode as WorkbenchMode)
    ? (mode as WorkbenchMode)
    : "import";
  const identified = await countRecords(reviewId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workbench</h1>
        <span className="text-sm text-gray-600" aria-live="polite">
          Identificados (PRISMA): <strong>{identified}</strong>
        </span>
      </div>
      <ModeBar reviewId={reviewId} active={active} />
      <QueryProvider>
        {active === "import" ? (
          <ImportPanel reviewId={reviewId} />
        ) : (
          <p className="text-sm text-gray-500">
            Este modo é habilitado em uma etapa seguinte do Marco.
          </p>
        )}
      </QueryProvider>
    </div>
  );
}
```

- [ ] **Step 7: Link "Workbench" no shell da Revisão**

Modify `app/reviews/[reviewId]/layout.tsx` — dentro do `<nav className="flex gap-3 text-sm">`, acrescentar após o link "Protocolo":
```tsx
          <a href={`/reviews/${active.id}/workbench`} className="underline">
            Workbench
          </a>
```

- [ ] **Step 8: Commit**

```bash
git add src/components/providers/QueryProvider.tsx src/lib/jobs/queries.ts src/lib/search/schema.ts src/components/workbench/ModeBar.tsx "app/reviews/[reviewId]/workbench/page.tsx" "app/reviews/[reviewId]/workbench/actions.ts" "app/reviews/[reviewId]/layout.tsx"
git commit -m "feat(workbench): single-surface shell + mode bar + import actions (US2/FR-027)"
```

---

## Task 14: App — ImportPanel (preview + busca + confirmar + progresso)

**Files:**
- Create: `src/components/workbench/ImportPreview.tsx`
- Create: `src/components/workbench/JobProgress.tsx`
- Create: `src/components/workbench/ImportPanel.tsx`
- Test: `tests/unit/workbench/import-preview.test.tsx`

- [ ] **Step 1: Tabela de preview (FR-014)**

Create `src/components/workbench/ImportPreview.tsx`:
```tsx
"use client";

import type { ParsedRecord } from "@shared/import/types";

export function ImportPreview({ records }: { records: ParsedRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded border">
      <table className="min-w-full text-sm">
        <caption className="sr-only">Pré-visualização dos registros</caption>
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Título</th>
            <th className="p-2">Autores</th>
            <th className="p-2">Ano</th>
            <th className="p-2">DOI</th>
          </tr>
        </thead>
        <tbody>
          {records.slice(0, 20).map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{r.title}</td>
              <td className="p-2">{r.authors.join("; ")}</td>
              <td className="p-2">{r.year ?? "—"}</td>
              <td className="p-2">{r.doi ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-2 text-xs text-gray-500">
        {records.length} registro(s) — exibindo até 20 na prévia.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Progresso do job por polling (FR-017)**

Create `src/components/workbench/JobProgress.tsx`:
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const TERMINAL = ["completed", "completed_with_errors", "failed"];

export function JobProgress({ jobId }: { jobId: string }) {
  const { data } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("job")
        .select("status, progress")
        .eq("id", jobId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: (q) =>
      q.state.data && TERMINAL.includes(q.state.data.status) ? false : 800,
  });

  if (!data) return null;
  return (
    <div aria-live="polite" className="text-sm">
      Processamento: <strong>{data.status}</strong> ({data.progress}%)
    </div>
  );
}
```

- [ ] **Step 3: Painel de importação (orquestra tudo)**

Create `src/components/workbench/ImportPanel.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseContent } from "@shared/import/index";
import type { ParsedRecord, SourceFormat } from "@shared/import/types";
import { searchSchema, type SearchInput } from "@/lib/search/schema";
import {
  enqueueImport,
  runImportWorker,
} from "@/app/reviews/[reviewId]/workbench/actions";
import { ImportPreview } from "./ImportPreview";
import { JobProgress } from "./JobProgress";

function formatFromName(name: string): SourceFormat | null {
  if (name.endsWith(".ris")) return "ris";
  if (name.endsWith(".bib") || name.endsWith(".bibtex")) return "bibtex";
  if (name.endsWith(".csv")) return "csv";
  return null;
}

export function ImportPanel({ reviewId }: { reviewId: string }) {
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<SourceFormat | null>(null);
  const [preview, setPreview] = useState<ParsedRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { register, handleSubmit, formState } = useForm<SearchInput>({
    resolver: zodResolver(searchSchema),
    defaultValues: { queryString: "", database: "", searchedOn: "", hits: 0 },
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setJobId(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const fmt = formatFromName(file.name.toLowerCase());
    if (!fmt) {
      setError("Formato não suportado. Use .ris, .bib ou .csv.");
      setPreview([]);
      setFormat(null);
      return;
    }
    const text = await file.text();
    setContent(text);
    setFormat(fmt);
    const result = parseContent(fmt, text); // preview client-side (FR-014)
    setPreview(result.records);
    if (result.records.length === 0) {
      setError(
        result.errors[0]?.message ??
          "Nenhum registro reconhecido neste arquivo.",
      );
    }
  }

  async function onConfirm(search: SearchInput) {
    if (!format || preview.length === 0) return;
    setPending(true);
    setError(null);
    const res = await enqueueImport(reviewId, { format, content, search });
    if (!res.ok) {
      setError(res.error);
      setPending(false);
      return;
    }
    setJobId(res.jobId);
    // Marco 1: dispara o worker (stand-in do pg_cron — D-F3.5).
    await runImportWorker(reviewId);
    setPending(false);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="import-file" className="text-sm font-medium">
          Arquivo de referências (RIS, BibTeX ou CSV)
        </label>
        <input
          id="import-file"
          type="file"
          accept=".ris,.bib,.bibtex,.csv"
          onChange={onFile}
        />
      </div>

      <ImportPreview records={preview} />

      <form onSubmit={handleSubmit(onConfirm)} className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Registro da busca</h2>
        <input
          {...register("queryString")}
          placeholder="String de busca"
          className="rounded border p-2"
        />
        <input
          {...register("database")}
          placeholder="Base consultada"
          className="rounded border p-2"
        />
        <input {...register("searchedOn")} type="date" className="rounded border p-2" />
        <input
          {...register("hits")}
          type="number"
          placeholder="Nº de hits"
          className="rounded border p-2"
        />
        {formState.errors.queryString && (
          <p className="text-sm text-red-600">
            {formState.errors.queryString.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || preview.length === 0}
          className="self-start rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Confirmar importação
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {jobId && <JobProgress jobId={jobId} />}
    </section>
  );
}
```

- [ ] **Step 4: Teste de unidade do preview (render)**

Create `tests/unit/workbench/import-preview.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportPreview } from "@/components/workbench/ImportPreview";

describe("ImportPreview", () => {
  it("renderiza títulos dos registros", () => {
    render(
      <ImportPreview
        records={[
          {
            title: "Estudo X",
            authors: ["A"],
            year: 2020,
            doi: null,
            abstract: null,
            language: null,
            raw: {},
          },
        ]}
      />,
    );
    expect(screen.getByText("Estudo X")).toBeInTheDocument();
  });

  it("não renderiza nada sem registros", () => {
    const { container } = render(<ImportPreview records={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 5: Rodar testes de unidade + gates**

Run: `npm test -- tests/unit/workbench/ && npm run typecheck && npm run lint`
Expected: testes PASS; `tsc` limpo; ESLint sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/workbench/ImportPreview.tsx src/components/workbench/JobProgress.tsx src/components/workbench/ImportPanel.tsx tests/unit/workbench/import-preview.test.tsx
git commit -m "feat(workbench): ImportPanel — preview, search form, confirm + job polling (FR-014/017)"
```

---

## Task 15: e2e — fluxo "importar" + invariante de superfície única

**Files:**
- Test: `tests/e2e/import.spec.ts`

- [ ] **Step 1: Conferir os seletores reais de cadastro/criação**

Antes de escrever o spec, abrir `app/(auth)/signup/page.tsx`, `app/reviews/new/page.tsx` e `tests/e2e/review-switch.spec.ts` e copiar os seletores reais (labels/botões) para o helper abaixo — ajustar se divergirem.

- [ ] **Step 2: Escrever o e2e**

Create `tests/e2e/import.spec.ts`:
```ts
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// Ajustar os seletores ao padrão de tests/e2e/review-switch.spec.ts (Step 1).
async function signupAndCreateReview(page: Page) {
  const email = `e2e_imp_${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/senha/i).fill("senha-teste-123");
  await page.getByRole("button", { name: /cadastrar|entrar/i }).click();
  await page.waitForURL("**/reviews");
  await page.goto("/reviews/new");
  await page.getByLabel(/título/i).fill("Revisão e2e import");
  await page.getByRole("button", { name: /criar/i }).click();
  await page.waitForURL("**/reviews/**");
}

test("importar RIS: preview, registrar busca, confirmar, identificados sobem", async ({
  page,
}) => {
  await signupAndCreateReview(page);
  await page.getByRole("link", { name: "Workbench" }).click();
  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();

  // Invariante Princípio V: os outros modos NÃO são links de navegação.
  await expect(page.getByRole("tab", { name: "Duplicatas" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // Upload da fixture RIS → preview.
  await page.setInputFiles(
    "#import-file",
    path.resolve("tests/fixtures/import/sample.ris"),
  );
  await expect(page.getByText("Aprendizagem ativa em sala")).toBeVisible();

  // Registrar busca + confirmar.
  await page.getByPlaceholder("String de busca").fill("active learning");
  await page.getByPlaceholder("Base consultada").fill("ERIC");
  await page.locator('input[type="date"]').fill("2026-05-30");
  await page.getByPlaceholder("Nº de hits").fill("2");
  await page.getByRole("button", { name: /confirmar importação/i }).click();

  // O worker (stand-in) roda e o contador de identificados reflete o corpus.
  await expect(page.getByText(/Identificados \(PRISMA\):/)).toContainText("2", {
    timeout: 15_000,
  });
});
```

- [ ] **Step 3: Rodar o e2e (build de produção)**

Run: `npm run test:e2e -- import.spec.ts`
Expected: PASS — preview visível, identificados = 2 após confirmar.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/import.spec.ts
git commit -m "test(e2e): import flow + single-surface invariant (US2/FR-027)"
```

---

## Task 16: Self-review + portões de qualidade da fatia

- [ ] **Step 1: Suíte completa de testes**

Run: `npm test`
Expected: todas as suítes unit + integração PASS (incluindo as herdadas das Fatias 1–2).

- [ ] **Step 2: e2e completo**

Run: `npm run test:e2e`
Expected: specs herdados (auth, review-switch, smoke) + `import.spec.ts` PASS.

- [ ] **Step 3: Lint + typecheck (portões obrigatórios — constitution §Portões)**

Run: `npm run lint && npm run typecheck`
Expected: ESLint "No ESLint warnings or errors"; `tsc` sem saída.

- [ ] **Step 4: Conferência manual de invariantes**

Relendo o diff, confirmar:
- Princípio V: existe **uma** rota `app/reviews/[reviewId]/workbench/` — nenhuma rota separada para Duplicatas/T-R/Texto completo.
- §VIII: nenhum `record` é inserido no caminho de enqueue; só no worker.
- Sem `any` fora do ponto isolado e justificado em `jobs/types.ts`.
- Datas: `searched_on` é `DATE` no banco; UI usa input `type="date"` (yyyy-mm-dd).
- Dependências novas (papaparse, @retorquere/bibtex-parser, @tanstack/react-query) entraram via Task 1 (tarefa explícita).

- [ ] **Step 5: Escrever o COMPLETION da fatia**

Create `specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-3.md` com: US/FR cobertas, decisões D-F3.\*, saída literal dos portões, e o que foi diferido (cron real exercitado só no deploy; Edge Functions verificadas no deploy). Atualizar `slicing.md` §"Estado das fatias" marcando a Fatia 3.

- [ ] **Step 6: Parar no CHECKPOINT 3 (não mergear)**

Apresentar ao desenvolvedor: branch da fatia, diff, e a saída de `npm test` + `npm run lint` + `npm run typecheck` + `npm run test:e2e`. **Aguardar o merge manual** (CLAUDE.md §5). Não iniciar a Fatia 4.

---

## Self-Review (autor do plano)

**Cobertura da spec/slicing:** US2, FR-013/014/015/016/017/027 e A3 mapeados (tabela "Escopo coberto"). §VIII coberto por enqueue/worker separados + teste "enqueue não processa". SC-009 por Task 11. Princípio V por Task 13/15 (uma rota, modos inertes). FR-038 (idioma original) preservado em `metadata.language`/`raw`.

**Placeholders:** nenhum "TBD"/"etc." — todo passo tem código ou comando concreto. As notas de ajuste (shape do BibTeX na Task 7; seletores e2e na Task 15) apontam para o **teste como contrato** e o arquivo-padrão a conferir, não são lacunas de implementação.

**Consistência de tipos:** `ParsedRecord`/`ParseResult`/`BibliographicParser` definidos na Task 4 e usados igualmente em 5–10/13/14. `EnqueueResult`/`WorkerResult`/`EnqueueValidationError` definidos na Task 9 e reusados em 10/12/13. RPCs `create_import_job`/`insert_import_record` definidas na Task 2 e chamadas com a mesma assinatura em 9/10. Alias `@shared` definido na Task 1 e usado em todo o núcleo.

**Riscos conhecidos (sinalizar no CHECKPOINT 2):** (1) shape exato do `@retorquere/bibtex-parser` pode exigir ajuste do mapeamento (mitigado por TDD); (2) `pg_cron`/`pg_net` podem não existir na imagem local (mitigado pelo bloco guardado da Task 3 — reset não falha; worker roda pelo gatilho); (3) Edge Functions Deno não são exercitadas no host (mitigado: núcleo 100% testado; cascas finas verificadas no deploy).
