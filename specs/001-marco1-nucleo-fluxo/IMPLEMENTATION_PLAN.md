# Fatia 2 — Pergunta + Protocolo (+ plumbing de IA/BYOK) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Escopo:** esta é a **Fatia 2 de 6** do Marco 1 (`001-marco1-nucleo-fluxo`).
> Fronteiras, dependências e gate de cobertura em
> [.superpowers/slicing.md](./.superpowers/slicing.md). NÃO planejar/implementar
> capacidades de outras fatias (workbench, importação, dedup, triagem, jobs em lote).
> *(O plano detalhado da Fatia 1 permanece no histórico git — commit `2a2a82f`.)*
>
> **Branch de trabalho:** `build/001-marco1-nucleo-fluxo/2-pergunta-protocolo`
> (criado via `superpowers:using-git-worktrees`). A sessão **NUNCA** faz `git merge`
> nem `git push` para a feature branch ou `main` — o merge é manual do desenvolvedor
> ao fim da fatia (CHECKPOINT 3).
>
> **Skills de implementação obrigatórias (HANDOFF §"Skills de implementação"):** subagentes começam **frios**. Toda tarefa de UI/componente abaixo nomeia explicitamente qual skill carregar: `frontend-design:frontend-design` (vocabulário de IA, formulários), `react-best-practices:react-best-practices` (componentes/data fetching), `nextjs-best-practices:nextjs-best-practices` (fronteiras RSC/Client, server actions). Carregue-as antes de escrever o código correspondente.

**Goal:** Entregar US5 (formular a Pergunta com framework + derivação de critérios/termos por IA, ratificável) e US6 (rascunhar/editar/travar o Protocolo PRISMA-P com emendas versionadas e export), fundadas sobre a **abstração `LLMProvider`** (adapter Anthropic default) e **BYOK via Supabase Vault** — tudo isolado por Revisão com RLS, auditado, e com saída de IA em pt-BR carregando proveniência e estado.

**Architecture:** Migration `0002` cria `question`, `eligibility_criterion`, `protocol`, `protocol_amendment`, `ai_suggestion`, `byok_key`, `ai_usage` com RLS por `is_review_member` (helper da Fatia 1) e RPCs `SECURITY DEFINER` para as operações atômicas/sensíveis (gravar BYOK no Vault, travar protocolo, criar emenda). A IA é chamada **exclusivamente** pela abstração `LLMProvider` (`src/lib/ai/llm/`); nenhum código de feature instancia um SDK direto. No Marco 1 as gerações (derivar critérios, rascunhar protocolo) são **single-shot síncronas** em **Server Actions** server-side (jobs em lote são Fatia 3/5). A chave BYOK é decifrada **somente server-side** via cliente service-role + RPC restrita a `service_role`; nunca chega ao browser. O vocabulário visual de IA (`src/components/ai/`) nasce aqui e é reusado nas fases seguintes (EP-3).

**Tech Stack:** Next.js 14 App Router (RSC default; `'use client'` só nas superfícies interativas), TypeScript strict, Supabase (Postgres + RLS + Vault), `@supabase/ssr` (cliente por sessão) + `@supabase/supabase-js` (cliente service-role server-only), React Hook Form + Zod, Tailwind 4, Vitest (unit/integration), Playwright (e2e). **Nova dependência (tarefa explícita, constitution §Portões):** `@anthropic-ai/sdk`.

---

## Decisões de implementação desta fatia (resolvidas no plano)

Registradas aqui porque afetam o aceite; nenhuma reabre `spec.md`/`CONTEXT.md`.

- **D-F2.1 — Export do protocolo (FR-012) = Markdown.** O `plan.md` define export como "serialização de `protocol.content` (Markdown **e/ou** PDF)". Fatia 2 entrega **download Markdown** (`.md`). PDF exigiria uma dependência pesada nova **não prevista** no `plan.md`/`research.md`; fica adiado ao pipeline de relatório do Marco 3 (spec §Out of Scope). Aceite de FR-012 = obter um `.md` submissível.
- **D-F2.2 — Escopo da chave BYOK = por Revisão (`review_id`).** O `data-model.md` deixa a decisão à migration ("uma chave de LLM por escopo de uso"). Escolhido `review_id` por casar com o padrão RLS `is_review_member` e com as fases consumidoras (Pergunta/Protocolo são review-scoped).
- **D-F2.3 — Geração de IA é Server Action síncrona single-shot.** Jobs assíncronos (`job`/`job_item` + worker) são Fatia 3; a **pré-classificação em lote** é Fatia 5. As gerações desta fatia (`deriveEligibility`, `draftProtocol`) são chamadas únicas e curtas — rodam em Server Action server-side, onde a BYOK é decifrada. Não há Edge Function nesta fatia (não se viola §VIII: não há trabalho pesado/em lote).
- **D-F2.4 — Decifragem da BYOK estritamente server-side.** A RPC `get_byok_secret` é `SECURITY DEFINER` e **só** concedida a `service_role`. A Server Action verifica a sessão do usuário (membro da Revisão) com o cliente por-sessão e, só então, usa o cliente **service-role** para decifrar. O segredo nunca é retornado a um cliente `authenticated`/browser.
- **D-F2.5 — `preclassifyScreening` e `estimateCost` implementados já na abstração.** O adapter Anthropic implementa a **interface completa** do contrato `llm-provider.md` (5 métodos) para a abstração nascer fechada; o **consumo** de `preclassifyScreening` (job em lote + UI da fila) é Fatia 5. `estimateCost` usa heurística simples agora (refinada na Fatia 5).
- **D-F2.6 — Gatilho de travamento.** Esta fatia entrega a **operação** de lock (`lock_protocol` RPC) e o **teste direto** de travamento/imutabilidade/emenda. O **gatilho automático** pela 1ª `screening_decision` é fiado na Fatia 5 (slicing).

---

## File Structure

**Migrations & tipos**
- Create `supabase/migrations/0002_question_protocol_ai.sql` — schema + RLS + RPCs desta fatia.
- Modify `src/types/database.ts` — **regenerado** via Supabase CLI após a migration.
- Modify `package.json` — script `gen:types`; dependência `@anthropic-ai/sdk`.

**Camada de IA (`src/lib/ai/llm/`)** — ponto único de chamada de LLM (constitution §VII)
- Create `src/lib/ai/llm/types.ts` — interfaces do contrato `llm-provider.md`.
- Create `src/lib/ai/llm/mock.ts` — `MockLLMProvider` (testes/dev sem chave).
- Create `src/lib/ai/llm/anthropic.ts` — adapter Anthropic (default D14).
- Create `src/lib/ai/llm/index.ts` — `getLLMProvider(reviewId)` (factory: resolve BYOK → adapter; sem chave → erro tipado `MissingByokError`).
- Create `src/lib/ai/llm/cost.ts` — heurística de `estimateCost`.

**Infra server-side compartilhada**
- Create `src/lib/supabase/admin.ts` — cliente **service-role** (server-only).
- Create `src/lib/audit.ts` — helper `writeAudit()` reutilizável (Princípio III).

**BYOK**
- Create `src/lib/byok/queries.ts` — status da chave (existe? provider?) por Revisão.
- Create `src/lib/byok/actions.ts` — server action `saveByokKey` (grava no Vault via RPC).
- Create `src/components/ai/ByokKeyForm.tsx` — formulário de cadastro da chave.

**Vocabulário visual de IA (`src/components/ai/`)** — EP-3, reusado nas fases seguintes
- Create `src/components/ai/SuggestionChip.tsx` — chip com estado (`pending`/`accepted`/`edited`/`rejected`/`inferred`).
- Create `src/components/ai/ProvenancePopover.tsx` — popover de proveniência (modelo/versão/trecho/timestamp).
- Create `src/components/ai/SuggestionActions.tsx` — botões aceitar/editar/rejeitar.
- Create `src/components/ai/NotFound.tsx` — render explícito de "não encontrado" (FR-034).
- Create `src/components/ai/state.ts` — labels pt-BR + classes Tailwind por estado (fonte única do tratamento visual).

**US5 — Pergunta**
- Create `src/lib/question/schema.ts` — Zod por framework (SPIDER default + PICo/PEO/PCC/livre).
- Create `src/lib/question/queries.ts` — leitura de `question` + `eligibility_criterion`.
- Create `app/reviews/[reviewId]/question/actions.ts` — `saveQuestion`, `deriveCriteria`, `ratifyCriterion`.
- Create `app/reviews/[reviewId]/question/page.tsx` — RSC: carrega estado, monta UI.
- Create `src/components/question/QuestionForm.tsx` — `'use client'`: seletor de framework + campos adaptáveis.
- Create `src/components/question/CriteriaPanel.tsx` — `'use client'`: lista de critérios/termos com chip/proveniência/ações.

**US6 — Protocolo**
- Create `src/lib/protocol/queries.ts` — leitura de `protocol` + `protocol_amendment`.
- Create `src/lib/protocol/markdown.ts` — serialização `content` → Markdown (export).
- Create `app/reviews/[reviewId]/protocol/actions.ts` — `draftProtocol`, `saveProtocolDraft`, `lockProtocol`, `addAmendment`.
- Create `app/reviews/[reviewId]/protocol/page.tsx` — RSC.
- Create `app/reviews/[reviewId]/protocol/export/route.ts` — Route Handler: download `.md`.
- Create `src/components/protocol/ProtocolEditor.tsx` — `'use client'`: editor + estado draft/locked visível.
- Create `src/components/protocol/AmendmentList.tsx` — `'use client'`: emendas versionadas/datadas.

**Navegação**
- Modify `app/reviews/[reviewId]/layout.tsx` — links para `question/` e `protocol/` no header (trilho completo é Fatia 6).

**Testes**
- Create `tests/unit/ai/llm-contract.test.ts` — invariantes do `LLMProvider` (provenance 100%, `not_found`, `state=pending`).
- Create `tests/unit/ai/cost.test.ts` — `estimateCost`.
- Create `tests/unit/ai/suggestion-chip.test.tsx` — chip do vocabulário de IA.
- Create `tests/unit/audit.test.ts` — helper de auditoria.
- Create `tests/unit/question/question-schema.test.ts` — Zod por framework.
- Create `tests/unit/protocol/markdown.test.ts` — serialização Markdown.
- Create `tests/integration/question-derivation.test.ts` — persistência de sugestão + critérios pending.
- Create `tests/integration/rls.question-protocol.test.ts` — RLS nas tabelas novas (SC-009).
- Create `tests/integration/protocol-lock.test.ts` — travamento/imutabilidade/emenda (SC-010).
- Create `tests/integration/byok.test.ts` — Vault round-trip + isolamento.

---

## Task 1 — Migration 0002: schema + RLS + RPCs (Princípio IV — antes de qualquer código)

**Files:**
- Create: `supabase/migrations/0002_question_protocol_ai.sql`
- Modify: `package.json` (script `gen:types`)
- Modify: `src/types/database.ts` (regenerado)

- [ ] **Step 1: Escrever a migration completa**

Create `supabase/migrations/0002_question_protocol_ai.sql`:

```sql
-- ============================================================
-- Marco 1 / Fatia 2 — Pergunta, Protocolo, IA/BYOK
-- RLS em TODAS as tabelas (Princípio IV). Auditoria em mudanças (Princípio III).
-- Reusa public.is_review_member(uuid) da migration 0001.
-- ============================================================

create extension if not exists supabase_vault with schema vault;

-- ---------- enums ----------
create type question_framework as enum ('spider', 'pico', 'peo', 'pcc', 'free');
create type criterion_kind     as enum ('inclusion', 'exclusion', 'search_term');
create type criterion_origin   as enum ('human', 'ai');
create type ratification_state as enum ('pending', 'accepted', 'edited', 'rejected');
create type protocol_state     as enum ('draft', 'locked');
create type protocol_origin    as enum ('ai_draft', 'human');
create type ai_target_kind     as enum ('eligibility', 'protocol_draft', 'screening');
create type suggestion_state   as enum ('pending', 'accepted', 'edited', 'rejected', 'inferred');
create type llm_provider       as enum ('anthropic');

-- ---------- ai_suggestion (transversal) ----------
create table public.ai_suggestion (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  target_kind ai_target_kind not null,
  target_id uuid,
  output jsonb not null,
  provenance jsonb not null,                       -- model/version/prompt_or_span/timestamp (FR-031)
  state suggestion_state not null default 'pending',
  grounding jsonb,                                 -- Marco 1: metadado/resumo
  not_found boolean not null default false,        -- FR-034
  created_at timestamptz not null default now(),
  constraint ai_suggestion_provenance_keys check (
    provenance ? 'model' and provenance ? 'version'
    and provenance ? 'prompt_or_span' and provenance ? 'timestamp'
  )
);

-- ---------- question (US5) ----------
create table public.question (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review (id) on delete cascade,
  framework question_framework not null default 'spider',
  fields jsonb not null default '{}'::jsonb,
  question_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- eligibility_criterion (US5) ----------
create table public.eligibility_criterion (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  question_id uuid not null references public.question (id) on delete cascade,
  kind criterion_kind not null,
  text text not null check (length(btrim(text)) > 0),
  origin criterion_origin not null,
  ratification_state ratification_state not null default 'pending',
  ai_suggestion_id uuid references public.ai_suggestion (id) on delete set null,
  created_at timestamptz not null default now(),
  -- origin=ai ⇒ exige ai_suggestion (data-model)
  constraint criterion_ai_needs_suggestion check (
    origin <> 'ai' or ai_suggestion_id is not null
  )
);

-- ---------- protocol (US6) ----------
create table public.protocol (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review (id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  state protocol_state not null default 'draft',
  locked_at timestamptz,
  origin protocol_origin not null default 'human',
  ai_suggestion_id uuid references public.ai_suggestion (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- protocol_amendment (US6) ----------
create table public.protocol_amendment (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  protocol_id uuid not null references public.protocol (id) on delete cascade,
  version int not null,
  change jsonb not null,
  dated_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (protocol_id, version)
);

-- ---------- byok_key (R5/FR-032) ----------
create table public.byok_key (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review (id) on delete cascade,
  provider llm_provider not null default 'anthropic',
  vault_secret_id uuid not null,                   -- ref. ao Supabase Vault (cifrado)
  created_at timestamptz not null default now()
);

-- ---------- ai_usage (FR-033/P5) ----------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  phase text not null,                             -- question | protocol | screening
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost jsonb not null default '{}'::jsonb,
  job_id uuid,                                     -- FK em Fatia 3 (jobs); nullable aqui
  created_at timestamptz not null default now()
);

create index ai_suggestion_review_idx on public.ai_suggestion (review_id, created_at);
create index criterion_review_idx     on public.eligibility_criterion (review_id);
create index amendment_protocol_idx   on public.protocol_amendment (protocol_id, version);
create index ai_usage_review_phase_idx on public.ai_usage (review_id, phase);

-- ============================================================
-- Trigger: protocolo travado é imutável em content (FR-011/SC-010)
-- ============================================================
create or replace function public.guard_locked_protocol()
returns trigger
language plpgsql
as $$
begin
  if old.state = 'locked' then
    if new.content is distinct from old.content then
      raise exception 'protocol is locked; changes must be amendments';
    end if;
    -- não permite "destravar" silenciosamente
    if new.state <> 'locked' then
      raise exception 'protocol cannot be unlocked';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protocol_guard_locked
  before update on public.protocol
  for each row execute function public.guard_locked_protocol();

-- ============================================================
-- RPC: lock_protocol — trava + marca review + audita (idempotente)
-- ============================================================
create or replace function public.lock_protocol(p_review_id uuid)
returns public.protocol
language plpgsql
security definer
set search_path = public
as $$
declare
  v_protocol public.protocol;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  select * into v_protocol from public.protocol where review_id = p_review_id;
  if not found then
    raise exception 'protocol not found';
  end if;
  if v_protocol.state = 'locked' then
    return v_protocol;  -- idempotente
  end if;

  update public.protocol
     set state = 'locked', locked_at = now()
   where id = v_protocol.id
   returning * into v_protocol;

  update public.review
     set active_screening_started_at = coalesce(active_screening_started_at, now())
   where id = p_review_id;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'lock_protocol', 'protocol', v_protocol.id,
          jsonb_build_object('state', 'draft'), jsonb_build_object('state', 'locked'));

  return v_protocol;
end;
$$;

-- ============================================================
-- RPC: add_protocol_amendment — só se locked; versão sequencial; audita
-- ============================================================
create or replace function public.add_protocol_amendment(p_review_id uuid, p_change jsonb)
returns public.protocol_amendment
language plpgsql
security definer
set search_path = public
as $$
declare
  v_protocol public.protocol;
  v_amendment public.protocol_amendment;
  v_version int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  select * into v_protocol from public.protocol where review_id = p_review_id;
  if not found then raise exception 'protocol not found'; end if;
  if v_protocol.state <> 'locked' then
    raise exception 'amendments require a locked protocol';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.protocol_amendment where protocol_id = v_protocol.id;

  insert into public.protocol_amendment (review_id, protocol_id, version, change)
  values (p_review_id, v_protocol.id, v_version, p_change)
  returning * into v_amendment;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'add_protocol_amendment', 'protocol_amendment',
          v_amendment.id, null, to_jsonb(v_amendment));

  return v_amendment;
end;
$$;

-- ============================================================
-- BYOK no Vault: gravar (membro) / decifrar (apenas service_role)
-- ============================================================
create or replace function public.set_byok_key(p_review_id uuid, p_provider llm_provider, p_api_key text)
returns public.byok_key
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_row public.byok_key;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  if coalesce(btrim(p_api_key), '') = '' then
    raise exception 'api key required';
  end if;

  -- remove chave anterior (uma por Revisão, D-F2.2)
  delete from public.byok_key where review_id = p_review_id;

  v_secret_id := vault.create_secret(
    p_api_key,
    'byok:' || p_review_id::text || ':' || p_provider::text,
    'BYOK LLM key for review ' || p_review_id::text
  );

  insert into public.byok_key (review_id, provider, vault_secret_id)
  values (p_review_id, p_provider, v_secret_id)
  returning * into v_row;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'set_byok_key', 'byok_key', v_row.id,
          null, jsonb_build_object('provider', p_provider));  -- NUNCA loga o segredo

  return v_row;
end;
$$;

-- Decifragem: somente service_role (D-F2.4). NÃO concedida a authenticated.
create or replace function public.get_byok_secret(p_review_id uuid)
returns table (provider llm_provider, api_key text)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
  select k.provider, s.decrypted_secret
    from public.byok_key k
    join vault.decrypted_secrets s on s.id = k.vault_secret_id
   where k.review_id = p_review_id;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.ai_suggestion         enable row level security;
alter table public.question              enable row level security;
alter table public.eligibility_criterion enable row level security;
alter table public.protocol              enable row level security;
alter table public.protocol_amendment    enable row level security;
alter table public.byok_key              enable row level security;
alter table public.ai_usage              enable row level security;

-- padrão: membros leem/escrevem por review_id
create policy ai_suggestion_rw on public.ai_suggestion
  for all using (public.is_review_member(review_id)) with check (public.is_review_member(review_id));

create policy question_rw on public.question
  for all using (public.is_review_member(review_id)) with check (public.is_review_member(review_id));

create policy criterion_rw on public.eligibility_criterion
  for all using (public.is_review_member(review_id)) with check (public.is_review_member(review_id));

-- protocol: membros leem; INSERT/UPDATE por membros (UPDATE de content travado é
-- barrado pelo trigger). Sem DELETE.
create policy protocol_select on public.protocol
  for select using (public.is_review_member(review_id));
create policy protocol_insert on public.protocol
  for insert with check (public.is_review_member(review_id));
create policy protocol_update on public.protocol
  for update using (public.is_review_member(review_id)) with check (public.is_review_member(review_id));

-- protocol_amendment: leitura por membros; escrita só via RPC SECURITY DEFINER
create policy amendment_select on public.protocol_amendment
  for select using (public.is_review_member(review_id));

-- byok_key: membros leem METADADOS (provider/created_at). Escrita só via RPC.
-- vault_secret_id é visível mas inútil sem service_role (decifragem server-only).
create policy byok_select on public.byok_key
  for select using (public.is_review_member(review_id));

create policy ai_usage_select on public.ai_usage
  for select using (public.is_review_member(review_id));
create policy ai_usage_insert on public.ai_usage
  for insert with check (public.is_review_member(review_id));

-- ============================================================
-- Grants
-- ============================================================
grant execute on function public.lock_protocol(uuid)                    to authenticated;
grant execute on function public.add_protocol_amendment(uuid, jsonb)    to authenticated;
grant execute on function public.set_byok_key(uuid, llm_provider, text) to authenticated;
-- get_byok_secret: SOMENTE service_role
grant execute on function public.get_byok_secret(uuid) to service_role;
revoke execute on function public.get_byok_secret(uuid) from authenticated, anon, public;
```

- [ ] **Step 2: Aplicar a migration localmente**

Run: `npx supabase db reset`
Expected: aplica `0001` e `0002` sem erro; termina em "Finished supabase db reset".

> Se `supabase start` não estiver rodando: `npx supabase start` antes.

- [ ] **Step 3: Adicionar script `gen:types` e regenerar os tipos**

Modify `package.json` scripts (após `"typecheck"`):

```json
    "gen:types": "supabase gen types typescript --local > src/types/database.ts",
```

Run: `npm run gen:types`
Expected: `src/types/database.ts` passa a conter `question`, `eligibility_criterion`, `protocol`, `protocol_amendment`, `ai_suggestion`, `byok_key`, `ai_usage`, os novos enums e as funções `lock_protocol`/`add_protocol_amendment`/`set_byok_key`/`get_byok_secret`.

- [ ] **Step 4: Type-check limpo**

Run: `npm run typecheck`
Expected: PASS (sem erros). Os tipos novos compilam.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_question_protocol_ai.sql package.json src/types/database.ts
git commit -m "feat(db): migration 0002 — question/protocol/ai/byok schema + RLS + RPCs"
```

---

## Task 2 — `LLMProvider` types (contrato `llm-provider.md`)

**Files:**
- Create: `src/lib/ai/llm/types.ts`

- [ ] **Step 1: Escrever as interfaces do contrato**

Create `src/lib/ai/llm/types.ts` (cópia fiel do contrato, identificadores em inglês):

```ts
export interface ProviderIdentity {
  provider: "anthropic" | string; // default: anthropic (Claude)
  model: string; // exposto à proveniência (FR-031)
  version: string;
}

export interface FactualValue<T> {
  value: T | null;
  source_span: string | null; // Marco 1: metadado/resumo
  page: number | null; // null no Marco 1 (sem PDF)
  reason?: "not_found"; // quando value === null (FR-034)
}

export interface Provenance {
  model: string;
  version: string;
  prompt_or_span: string;
  timestamp: string; // ISO 8601
}

export type SuggestionState =
  | "pending"
  | "accepted"
  | "edited"
  | "rejected"
  | "inferred";

export interface LlmSuggestion<T> {
  output: T;
  provenance: Provenance; // OBRIGATÓRIO (FR-031, §II)
  state: SuggestionState; // nasce 'pending' (§I)
  not_found: boolean; // §II / FR-034
}

export interface EligibilityDerivation {
  inclusion: string[];
  exclusion: string[];
  searchTerms: string[];
}

export interface ProtocolDraft {
  contentMarkdown: string;
}

export interface ScreeningPreclassification {
  recommendation: "include" | "exclude"; // nunca decide (FR-024)
  confidence: number; // 0..1
  reason: string; // razão curta, pt-BR
}

export interface CostEstimate {
  tokensEstimated: number;
  cost: Record<string, number>;
}

export interface LLMProvider {
  identity(): ProviderIdentity;

  /** Deriva critérios/termos a partir da pergunta (US5/FR-007). Saída pt-BR. */
  deriveEligibility(input: {
    framework: string;
    questionText: string;
    fields: Record<string, unknown>;
  }): Promise<LlmSuggestion<EligibilityDerivation>>;

  /** Rascunha protocolo PRISMA-P (US6/FR-009). Saída pt-BR. */
  draftProtocol(input: {
    questionText: string;
    criteria: string[];
  }): Promise<LlmSuggestion<ProtocolDraft>>;

  /** Pré-classifica um registro na triagem (FR-024). Ancora em metadado/resumo. */
  preclassifyScreening(input: {
    title: string;
    abstract: string | null;
    criteria: string[];
  }): Promise<LlmSuggestion<ScreeningPreclassification>>;

  /** Estimativa de custo ANTES de lote (FR-033, §VII/P5). */
  estimateCost(input: {
    itemCount: number;
    kind: "ai_screening_batch";
  }): Promise<CostEstimate>;
}

export class MissingByokError extends Error {
  constructor(reviewId: string) {
    super(`Nenhuma chave BYOK cadastrada para a Revisão ${reviewId}`);
    this.name = "MissingByokError";
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/llm/types.ts
git commit -m "feat(ai): LLMProvider contract types"
```

---

## Task 3 — `MockLLMProvider` + testes de contrato (TDD)

**Files:**
- Create: `src/lib/ai/llm/mock.ts`
- Test: `tests/unit/ai/llm-contract.test.ts`

- [ ] **Step 1: Escrever o teste de contrato (falha primeiro)**

Create `tests/unit/ai/llm-contract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "@/lib/ai/llm/mock";

const provider = new MockLLMProvider();

describe("LLMProvider — invariantes do contrato (§II/FR-031, §I)", () => {
  it("deriveEligibility retorna provenance completa e state=pending", async () => {
    const s = await provider.deriveEligibility({
      framework: "spider",
      questionText: "Qual o impacto de X em Y?",
      fields: {},
    });
    expect(s.provenance.model).toBeTruthy();
    expect(s.provenance.version).toBeTruthy();
    expect(s.provenance.prompt_or_span).toBeTruthy();
    expect(s.provenance.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(s.state).toBe("pending");
    expect(Array.isArray(s.output.inclusion)).toBe(true);
  });

  it("draftProtocol retorna provenance e markdown em pt-BR", async () => {
    const s = await provider.draftProtocol({
      questionText: "Pergunta",
      criteria: ["incluir A"],
    });
    expect(s.provenance.model).toBeTruthy();
    expect(s.state).toBe("pending");
    expect(s.output.contentMarkdown.length).toBeGreaterThan(0);
  });

  it("preclassifyScreening nunca omite provenance e nunca decide", async () => {
    const s = await provider.preclassifyScreening({
      title: "T",
      abstract: null,
      criteria: [],
    });
    expect(s.provenance.model).toBeTruthy();
    expect(["include", "exclude"]).toContain(s.output.recommendation);
    expect(s.output.confidence).toBeGreaterThanOrEqual(0);
    expect(s.output.confidence).toBeLessThanOrEqual(1);
  });

  it("not_found é resultado de 1ª classe quando a pergunta é vazia (FR-034)", async () => {
    const s = await provider.deriveEligibility({
      framework: "spider",
      questionText: "",
      fields: {},
    });
    expect(s.not_found).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm run test -- tests/unit/ai/llm-contract.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/llm/mock'`.

- [ ] **Step 3: Implementar o MockLLMProvider**

Create `src/lib/ai/llm/mock.ts`:

```ts
import type {
  CostEstimate,
  EligibilityDerivation,
  LLMProvider,
  LlmSuggestion,
  ProtocolDraft,
  ProviderIdentity,
  ScreeningPreclassification,
} from "./types";

function provenance(prompt: string) {
  return {
    model: "mock-llm",
    version: "0.0.0",
    prompt_or_span: prompt,
    timestamp: new Date().toISOString(),
  };
}

function suggestion<T>(
  output: T,
  prompt: string,
  notFound = false,
): LlmSuggestion<T> {
  return { output, provenance: provenance(prompt), state: "pending", not_found: notFound };
}

/** Provider determinístico para testes e modo sem-chave em dev. Saída pt-BR. */
export class MockLLMProvider implements LLMProvider {
  identity(): ProviderIdentity {
    return { provider: "anthropic", model: "mock-llm", version: "0.0.0" };
  }

  async deriveEligibility(input: {
    framework: string;
    questionText: string;
    fields: Record<string, unknown>;
  }): Promise<LlmSuggestion<EligibilityDerivation>> {
    if (input.questionText.trim() === "") {
      return suggestion<EligibilityDerivation>(
        { inclusion: [], exclusion: [], searchTerms: [] },
        "derive:empty",
        true,
      );
    }
    return suggestion<EligibilityDerivation>(
      {
        inclusion: ["Estudos sobre o tema da pergunta"],
        exclusion: ["Estudos fora do escopo"],
        searchTerms: ["termo1", "termo2"],
      },
      `derive:${input.framework}`,
    );
  }

  async draftProtocol(input: {
    questionText: string;
    criteria: string[];
  }): Promise<LlmSuggestion<ProtocolDraft>> {
    return suggestion<ProtocolDraft>(
      { contentMarkdown: `# Protocolo PRISMA-P\n\n## Pergunta\n${input.questionText}\n` },
      "draft:protocol",
    );
  }

  async preclassifyScreening(): Promise<LlmSuggestion<ScreeningPreclassification>> {
    return suggestion<ScreeningPreclassification>(
      { recommendation: "include", confidence: 0.5, reason: "Sugestão simulada" },
      "preclassify",
    );
  }

  async estimateCost(input: {
    itemCount: number;
    kind: "ai_screening_batch";
  }): Promise<CostEstimate> {
    return { tokensEstimated: input.itemCount * 800, cost: { usd: input.itemCount * 0.002 } };
  }
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npm run test -- tests/unit/ai/llm-contract.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/llm/mock.ts tests/unit/ai/llm-contract.test.ts
git commit -m "feat(ai): MockLLMProvider + contract invariant tests"
```

---

## Task 4 — `estimateCost` heurístico (TDD)

**Files:**
- Create: `src/lib/ai/llm/cost.ts`
- Test: `tests/unit/ai/cost.test.ts`

- [ ] **Step 1: Teste (falha primeiro)**

Create `tests/unit/ai/cost.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { estimateScreeningCost } from "@/lib/ai/llm/cost";

describe("estimateScreeningCost", () => {
  it("escala linearmente com o número de itens", () => {
    const a = estimateScreeningCost(100);
    const b = estimateScreeningCost(200);
    expect(b.tokensEstimated).toBe(a.tokensEstimated * 2);
    expect(b.cost.usd).toBeGreaterThan(a.cost.usd);
  });

  it("0 itens ⇒ custo zero", () => {
    expect(estimateScreeningCost(0).tokensEstimated).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm run test -- tests/unit/ai/cost.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Create `src/lib/ai/llm/cost.ts`:

```ts
import type { CostEstimate } from "./types";

// Heurística do Marco 1 (refinada na Fatia 5 com métricas reais).
const TOKENS_PER_ITEM = 800;
const USD_PER_1K_TOKENS = 0.0025;

export function estimateScreeningCost(itemCount: number): CostEstimate {
  const tokensEstimated = Math.max(0, Math.trunc(itemCount)) * TOKENS_PER_ITEM;
  return {
    tokensEstimated,
    cost: { usd: (tokensEstimated / 1000) * USD_PER_1K_TOKENS },
  };
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npm run test -- tests/unit/ai/cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/llm/cost.ts tests/unit/ai/cost.test.ts
git commit -m "feat(ai): heuristic estimateScreeningCost"
```

---

## Task 5 — Cliente service-role + adapter Anthropic + factory

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/ai/llm/anthropic.ts`
- Create: `src/lib/ai/llm/index.ts`
- Modify: `package.json` (dependência `@anthropic-ai/sdk`)

- [ ] **Step 1: Adicionar a dependência (tarefa explícita — constitution §Portões)**

Run: `npm install @anthropic-ai/sdk@^0.32.1`
Expected: `@anthropic-ai/sdk` aparece em `dependencies` do `package.json`.

- [ ] **Step 2: Cliente service-role (server-only)**

Create `src/lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Cliente service-role: usado APENAS server-side para operações que
// exigem privilégio (ex.: decifrar a BYOK via get_byok_secret — D-F2.4).
// Nunca importar em código client.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

- [ ] **Step 3: Adapter Anthropic (implementa toda a interface)**

Create `src/lib/ai/llm/anthropic.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type {
  CostEstimate,
  EligibilityDerivation,
  LLMProvider,
  LlmSuggestion,
  ProtocolDraft,
  ProviderIdentity,
  ScreeningPreclassification,
} from "./types";
import { estimateScreeningCost } from "./cost";

const MODEL = "claude-opus-4-8"; // default D14
const PT_BR = "Responda SEMPRE em português brasileiro (pt-BR).";

function nowIso() {
  return new Date().toISOString();
}

/** Extrai o primeiro bloco de texto da resposta. */
function textOf(msg: Anthropic.Message): string {
  const block = msg.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  identity(): ProviderIdentity {
    return { provider: "anthropic", model: MODEL, version: MODEL };
  }

  private async ask(system: string, user: string): Promise<string> {
    const msg = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: `${PT_BR}\n${system}`,
      messages: [{ role: "user", content: user }],
    });
    return textOf(msg);
  }

  async deriveEligibility(input: {
    framework: string;
    questionText: string;
    fields: Record<string, unknown>;
  }): Promise<LlmSuggestion<EligibilityDerivation>> {
    const prompt = `Framework: ${input.framework}\nPergunta: ${input.questionText}\nCampos: ${JSON.stringify(input.fields)}\n\nRetorne JSON {"inclusion":[],"exclusion":[],"searchTerms":[]}.`;
    if (input.questionText.trim() === "") {
      return {
        output: { inclusion: [], exclusion: [], searchTerms: [] },
        provenance: { model: MODEL, version: MODEL, prompt_or_span: prompt, timestamp: nowIso() },
        state: "pending",
        not_found: true,
      };
    }
    const raw = await this.ask(
      "Você é um metodologista de revisões sistemáticas.",
      prompt,
    );
    const parsed = safeParse<EligibilityDerivation>(raw, {
      inclusion: [],
      exclusion: [],
      searchTerms: [],
    });
    return {
      output: parsed,
      provenance: { model: MODEL, version: MODEL, prompt_or_span: prompt, timestamp: nowIso() },
      state: "pending",
      not_found: false,
    };
  }

  async draftProtocol(input: {
    questionText: string;
    criteria: string[];
  }): Promise<LlmSuggestion<ProtocolDraft>> {
    const prompt = `Pergunta: ${input.questionText}\nCritérios: ${input.criteria.join("; ")}\n\nRascunhe um protocolo PRISMA-P em Markdown.`;
    const md = await this.ask(
      "Você redige protocolos PRISMA-P de revisões sistemáticas.",
      prompt,
    );
    return {
      output: { contentMarkdown: md },
      provenance: { model: MODEL, version: MODEL, prompt_or_span: prompt, timestamp: nowIso() },
      state: "pending",
      not_found: md.trim() === "",
    };
  }

  async preclassifyScreening(input: {
    title: string;
    abstract: string | null;
    criteria: string[];
  }): Promise<LlmSuggestion<ScreeningPreclassification>> {
    const prompt = `Título: ${input.title}\nResumo: ${input.abstract ?? "(sem resumo)"}\nCritérios: ${input.criteria.join("; ")}\n\nRetorne JSON {"recommendation":"include|exclude","confidence":0..1,"reason":"..."}.`;
    const raw = await this.ask(
      "Você pré-classifica registros para triagem; NUNCA decide sozinho.",
      prompt,
    );
    const parsed = safeParse<ScreeningPreclassification>(raw, {
      recommendation: "include",
      confidence: 0.5,
      reason: "Não foi possível classificar.",
    });
    return {
      output: parsed,
      provenance: { model: MODEL, version: MODEL, prompt_or_span: prompt, timestamp: nowIso() },
      state: "pending",
      not_found: false,
    };
  }

  async estimateCost(input: {
    itemCount: number;
    kind: "ai_screening_batch";
  }): Promise<CostEstimate> {
    return estimateScreeningCost(input.itemCount);
  }
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as T) : fallback;
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 4: Factory `getLLMProvider`**

Create `src/lib/ai/llm/index.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnthropicProvider } from "./anthropic";
import { MissingByokError, type LLMProvider } from "./types";

export type { LLMProvider } from "./types";
export { MissingByokError } from "./types";

/**
 * Resolve o provider de LLM para uma Revisão. Decifra a BYOK SOMENTE server-side
 * via cliente service-role (D-F2.4). O chamador DEVE ter verificado que o usuário
 * é membro da Revisão antes de chamar.
 */
export async function getLLMProvider(reviewId: string): Promise<LLMProvider> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_byok_secret", { p_review_id: reviewId });
  if (error) throw error;
  const row = data?.[0];
  if (!row?.api_key) throw new MissingByokError(reviewId);
  if (row.provider === "anthropic") return new AnthropicProvider(row.api_key);
  throw new Error(`Provider não suportado: ${row.provider}`);
}
```

- [ ] **Step 5: Type-check (não chama a API — só compila)**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/supabase/admin.ts src/lib/ai/llm/anthropic.ts src/lib/ai/llm/index.ts
git commit -m "feat(ai): Anthropic adapter + service-role client + getLLMProvider factory"
```

---

## Task 6 — Reconciliar `.env.example` (tarefa explícita — codebase-map §4)

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Reescrever o `.env.example` removendo o resíduo do build anterior**

Replace o conteúdo inteiro de `.env.example` por:

```bash
# Supabase local — preenchido por `supabase status` após `supabase start`.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# BYOK (chave do provedor de LLM): NÃO vai em env var.
# É cadastrada pela UI e cifrada no Supabase Vault (R5/FR-032); a decifragem
# ocorre apenas server-side. Ver specs/001-marco1-nucleo-fluxo/data-model.md (byok_key).
```

> Remove `BYOK_MASTER_KEY`, `ANTHROPIC_BYOK_DEV`, e toda menção a `private.app_secrets`/`byok_keys`/`migration 0009`/`resolveLLMKey()` (resíduo do build descartado, codebase-map §4).

- [ ] **Step 2: Confirmar que o resíduo sumiu**

Run: `git diff .env.example`
Expected: linhas com `BYOK_MASTER_KEY` e `ANTHROPIC_BYOK_DEV` aparecem como removidas (`-`).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: reconcile .env.example to Vault BYOK (drop prior-build residue)"
```

---

## Task 7 — Helper de auditoria reutilizável (TDD leve)

**Files:**
- Create: `src/lib/audit.ts`
- Test: `tests/unit/audit.test.ts`

- [ ] **Step 1: Teste do shape do payload (falha primeiro)**

Create `tests/unit/audit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAuditRow } from "@/lib/audit";

describe("buildAuditRow", () => {
  it("monta a linha append-only com actor humano", () => {
    const row = buildAuditRow({
      reviewId: "r1",
      actorId: "u1",
      action: "save_question",
      entity: "question",
      entityId: "q1",
      before: null,
      after: { framework: "spider" },
    });
    expect(row).toMatchObject({
      review_id: "r1",
      actor_type: "human",
      actor_id: "u1",
      action: "save_question",
      entity: "question",
      entity_id: "q1",
      after: { framework: "spider" },
    });
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm run test -- tests/unit/audit.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Create `src/lib/audit.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/types/database";

export interface AuditInput {
  reviewId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
}

export function buildAuditRow(
  input: AuditInput,
): TablesInsert<"audit_entry"> {
  return {
    review_id: input.reviewId,
    actor_type: "human",
    actor_id: input.actorId,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId,
    before: (input.before ?? null) as TablesInsert<"audit_entry">["before"],
    after: (input.after ?? null) as TablesInsert<"audit_entry">["after"],
  };
}

/** Insere uma entrada de auditoria (append-only). Lança em erro de RLS. */
export async function writeAudit(
  supabase: SupabaseClient<Database>,
  input: AuditInput,
): Promise<void> {
  const { error } = await supabase
    .from("audit_entry")
    .insert(buildAuditRow(input));
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npm run test -- tests/unit/audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts tests/unit/audit.test.ts
git commit -m "feat: reusable append-only audit helper"
```

---

## Task 8 — Vocabulário visual de IA (`src/components/ai/`)

> **SKILL:** carregue `frontend-design:frontend-design` antes deste task (vocabulário de IA é central no Marco 1 — EP-3) e `react-best-practices:react-best-practices`. Componentes pequenos, um por arquivo, PascalCase, Tailwind utility-first, dark mode via classes. Tratamento visual de IA SEMPRE distinto de dado humano (cor/ícone/borda — Princípio I).

**Files:**
- Create: `src/components/ai/state.ts`
- Create: `src/components/ai/SuggestionChip.tsx`
- Create: `src/components/ai/ProvenancePopover.tsx`
- Create: `src/components/ai/SuggestionActions.tsx`
- Create: `src/components/ai/NotFound.tsx`
- Test: `tests/unit/ai/suggestion-chip.test.tsx`

- [ ] **Step 1: Fonte única de labels/estilo por estado**

Create `src/components/ai/state.ts`:

```ts
import type { SuggestionState } from "@/lib/ai/llm/types";

export const SUGGESTION_STATE_LABEL: Record<SuggestionState, string> = {
  pending: "Sugestão de IA · pendente",
  accepted: "Aceita",
  edited: "Editada",
  rejected: "Rejeitada",
  inferred: "Inferida",
};

// Borda/cor distinta de dado humano (Princípio I). Suporta dark mode.
export const SUGGESTION_STATE_CLASS: Record<SuggestionState, string> = {
  pending: "border-violet-400 bg-violet-50 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  accepted: "border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100",
  edited: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  rejected: "border-red-400 bg-red-50 text-red-900 line-through dark:bg-red-950 dark:text-red-100",
  inferred: "border-sky-400 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
};
```

- [ ] **Step 2: Teste do chip (falha primeiro)**

Create `tests/unit/ai/suggestion-chip.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuggestionChip } from "@/components/ai/SuggestionChip";

describe("SuggestionChip", () => {
  it("exibe o rótulo pt-BR do estado e marca como IA", () => {
    render(<SuggestionChip state="pending" />);
    expect(screen.getByText(/Sugestão de IA · pendente/)).toBeInTheDocument();
  });

  it("estado rejeitado usa rótulo 'Rejeitada'", () => {
    render(<SuggestionChip state="rejected" />);
    expect(screen.getByText("Rejeitada")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `npm run test -- tests/unit/ai/suggestion-chip.test.tsx`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Implementar `SuggestionChip`**

Create `src/components/ai/SuggestionChip.tsx`:

```tsx
import type { SuggestionState } from "@/lib/ai/llm/types";
import { SUGGESTION_STATE_CLASS, SUGGESTION_STATE_LABEL } from "./state";

export function SuggestionChip({ state }: { state: SuggestionState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${SUGGESTION_STATE_CLASS[state]}`}
      data-ai-state={state}
    >
      <span aria-hidden>✦</span>
      {SUGGESTION_STATE_LABEL[state]}
    </span>
  );
}
```

- [ ] **Step 5: Implementar `ProvenancePopover`**

Create `src/components/ai/ProvenancePopover.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Provenance } from "@/lib/ai/llm/types";

export function ProvenancePopover({ provenance }: { provenance: Provenance }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Ver proveniência da sugestão de IA"
        className="rounded border px-1 text-xs underline focus:outline-none focus-visible:ring"
      >
        proveniência
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Proveniência"
          className="absolute z-10 mt-1 w-72 rounded border bg-white p-2 text-xs shadow dark:bg-zinc-900"
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-2">
            <dt className="font-semibold">Modelo</dt>
            <dd>{provenance.model}</dd>
            <dt className="font-semibold">Versão</dt>
            <dd>{provenance.version}</dd>
            <dt className="font-semibold">Quando</dt>
            <dd>{new Date(provenance.timestamp).toLocaleString("pt-BR")}</dd>
            <dt className="font-semibold">Origem</dt>
            <dd className="break-words">{provenance.prompt_or_span}</dd>
          </dl>
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 6: Implementar `SuggestionActions` e `NotFound`**

Create `src/components/ai/SuggestionActions.tsx`:

```tsx
"use client";

export function SuggestionActions({
  onAccept,
  onEdit,
  onReject,
  disabled,
}: {
  onAccept: () => void;
  onEdit: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label="Ações da sugestão de IA">
      <button type="button" onClick={onAccept} disabled={disabled}
        className="rounded border border-green-600 px-2 py-0.5 text-xs text-green-700 focus-visible:ring">
        Aceitar
      </button>
      <button type="button" onClick={onEdit} disabled={disabled}
        className="rounded border border-amber-600 px-2 py-0.5 text-xs text-amber-700 focus-visible:ring">
        Editar
      </button>
      <button type="button" onClick={onReject} disabled={disabled}
        className="rounded border border-red-500 px-2 py-0.5 text-xs text-red-600 focus-visible:ring">
        Rejeitar
      </button>
    </div>
  );
}
```

Create `src/components/ai/NotFound.tsx`:

```tsx
export function NotFound({ what = "Resultado" }: { what?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-zinc-400 px-2 py-0.5 text-xs italic text-zinc-600 dark:text-zinc-300">
      {what}: não encontrado
    </span>
  );
}
```

- [ ] **Step 7: Rodar testes do chip até passar**

Run: `npm run test -- tests/unit/ai/suggestion-chip.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/ai tests/unit/ai/suggestion-chip.test.tsx
git commit -m "feat(ai): AI visual vocabulary (chip, provenance, actions, not-found)"
```

---

## Task 9 — BYOK: queries, server action e formulário

> **SKILL:** `nextjs-best-practices` (server action + RSC), `frontend-design` (form).

**Files:**
- Create: `src/lib/byok/queries.ts`
- Create: `src/lib/byok/actions.ts`
- Create: `src/components/ai/ByokKeyForm.tsx`

- [ ] **Step 1: Query de status da chave (metadados, nunca o segredo)**

Create `src/lib/byok/queries.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export interface ByokStatus {
  present: boolean;
  provider: string | null;
}

export async function getByokStatus(reviewId: string): Promise<ByokStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("byok_key")
    .select("provider")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { present: !!data, provider: data?.provider ?? null };
}
```

- [ ] **Step 2: Server action que grava a chave no Vault via RPC**

Create `src/lib/byok/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveByokKey(reviewId: string, formData: FormData) {
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (apiKey === "") {
    return { ok: false, error: "Informe a chave do provedor." };
  }
  const supabase = await createClient();
  // RLS na RPC (is_review_member) garante o escopo; o segredo nunca é logado.
  const { error } = await supabase.rpc("set_byok_key", {
    p_review_id: reviewId,
    p_provider: "anthropic",
    p_api_key: apiKey,
  });
  if (error) return { ok: false, error: "Falha ao salvar a chave." };
  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const };
}
```

- [ ] **Step 3: Formulário (client)**

Create `src/components/ai/ByokKeyForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { saveByokKey } from "@/lib/byok/actions";

export function ByokKeyForm({
  reviewId,
  present,
}: {
  reviewId: string;
  present: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      action={async (fd) => {
        const r = await saveByokKey(reviewId, fd);
        setMsg(r.ok ? "Chave salva (cifrada no Vault)." : r.error ?? "Erro");
      }}
      className="flex flex-col gap-2 rounded border p-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Chave do provedor de IA (Anthropic){present ? " — já cadastrada" : ""}
        <input
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={present ? "•••• (substituir)" : "sk-ant-..."}
          className="border p-2"
        />
      </label>
      <button type="submit" className="self-start bg-black px-3 py-1 text-sm text-white">
        Salvar chave
      </button>
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/byok src/components/ai/ByokKeyForm.tsx
git commit -m "feat(byok): key status query + Vault-backed save action + form"
```

---

## Task 10 — US5: schema da Pergunta por framework (TDD)

> **SKILL:** —. Lógica pura + Zod.

**Files:**
- Create: `src/lib/question/schema.ts`
- Test: `tests/unit/question/question-schema.test.ts`

- [ ] **Step 1: Teste (falha primeiro)**

Create `tests/unit/question/question-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { questionSchema, FRAMEWORK_FIELDS } from "@/lib/question/schema";

describe("questionSchema", () => {
  it("SPIDER é o default e aceita seus campos", () => {
    const r = questionSchema.safeParse({
      framework: "spider",
      questionText: "Impacto de X?",
      fields: { sample: "estudantes", phenomenon: "X", design: "qualitativo", evaluation: "Y", researchType: "qual" },
    });
    expect(r.success).toBe(true);
  });

  it("rejeita framework inválido", () => {
    const r = questionSchema.safeParse({ framework: "xyz", questionText: "q", fields: {} });
    expect(r.success).toBe(false);
  });

  it("livre exige apenas questionText", () => {
    const r = questionSchema.safeParse({ framework: "free", questionText: "Pergunta livre", fields: {} });
    expect(r.success).toBe(true);
  });

  it("define os campos de cada framework", () => {
    expect(FRAMEWORK_FIELDS.spider.length).toBeGreaterThan(0);
    expect(FRAMEWORK_FIELDS.pico).toEqual(expect.arrayContaining(["population"]));
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm run test -- tests/unit/question/question-schema.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Create `src/lib/question/schema.ts`:

```ts
import { z } from "zod";

export const FRAMEWORKS = ["spider", "pico", "peo", "pcc", "free"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

// Campos exibidos por framework (labels pt-BR vivem na UI; aqui só as chaves).
export const FRAMEWORK_FIELDS: Record<Framework, string[]> = {
  spider: ["sample", "phenomenon", "design", "evaluation", "researchType"],
  pico: ["population", "intervention", "comparison", "outcome"],
  peo: ["population", "exposure", "outcome"],
  pcc: ["population", "concept", "context"],
  free: [],
};

export const questionSchema = z.object({
  framework: z.enum(FRAMEWORKS),
  questionText: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Formule a pergunta")),
  fields: z.record(z.string(), z.string()).default({}),
});

export type QuestionInput = z.infer<typeof questionSchema>;
```

- [ ] **Step 4: Rodar até passar**

Run: `npm run test -- tests/unit/question/question-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/question/schema.ts tests/unit/question/question-schema.test.ts
git commit -m "feat(question): framework-aware question Zod schema"
```

---

## Task 11 — US5: queries + server actions (Pergunta, derivação, ratificação)

> **SKILL:** `nextjs-best-practices` (server actions, RSC). Critérios IA nascem `pending` e exigem `ai_suggestion` (Princípio I; data-model). Toda mudança ⇒ `writeAudit`.

**Files:**
- Create: `src/lib/question/queries.ts`
- Create: `app/reviews/[reviewId]/question/actions.ts`
- Test: `tests/integration/question-derivation.test.ts`

- [ ] **Step 1: Queries (leitura de pergunta + critérios)**

Create `src/lib/question/queries.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import type { Framework } from "./schema";

export interface QuestionRow {
  id: string;
  framework: Framework;
  question_text: string;
  fields: Record<string, string>;
}

export interface CriterionRow {
  id: string;
  kind: "inclusion" | "exclusion" | "search_term";
  text: string;
  origin: "human" | "ai";
  ratification_state: "pending" | "accepted" | "edited" | "rejected";
  ai_suggestion_id: string | null;
}

export async function getQuestion(reviewId: string): Promise<QuestionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question")
    .select("id, framework, question_text, fields")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as QuestionRow | null;
}

export async function listCriteria(reviewId: string): Promise<CriterionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eligibility_criterion")
    .select("id, kind, text, origin, ratification_state, ai_suggestion_id")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CriterionRow[];
}
```

- [ ] **Step 2: Server actions (save question, derive criteria, ratify)**

Create `app/reviews/[reviewId]/question/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLLMProvider, MissingByokError } from "@/lib/ai/llm";
import { questionSchema } from "@/lib/question/schema";
import { writeAudit } from "@/lib/audit";

async function requireMember(reviewId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !data) throw new Error("not a member");
  return { supabase, userId: auth.user.id };
}

export async function saveQuestion(reviewId: string, formData: FormData) {
  const parsed = questionSchema.safeParse({
    framework: formData.get("framework"),
    questionText: formData.get("questionText"),
    fields: JSON.parse(String(formData.get("fields") ?? "{}")),
  });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const { supabase, userId } = await requireMember(reviewId);
  const { data, error } = await supabase
    .from("question")
    .upsert(
      {
        review_id: reviewId,
        framework: parsed.data.framework,
        question_text: parsed.data.questionText,
        fields: parsed.data.fields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "review_id" },
    )
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Falha ao salvar." };

  await writeAudit(supabase, {
    reviewId,
    actorId: userId,
    action: "save_question",
    entity: "question",
    entityId: data.id,
    before: null,
    after: { framework: parsed.data.framework },
  });
  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const };
}

export async function deriveCriteria(reviewId: string) {
  const { supabase, userId } = await requireMember(reviewId);
  const { data: q } = await supabase
    .from("question")
    .select("id, framework, question_text, fields")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Formule a pergunta primeiro." };

  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError)
      return { ok: false, error: "Cadastre a chave de IA (BYOK) para usar a derivação." };
    throw e;
  }

  const s = await provider.deriveEligibility({
    framework: q.framework,
    questionText: q.question_text,
    fields: (q.fields ?? {}) as Record<string, unknown>,
  });

  // 1) persiste a sugestão (proveniência obrigatória)
  const { data: sug, error: sugErr } = await supabase
    .from("ai_suggestion")
    .insert({
      review_id: reviewId,
      target_kind: "eligibility",
      target_id: q.id,
      output: s.output,
      provenance: s.provenance,
      state: "pending",
      not_found: s.not_found,
    })
    .select("id")
    .single();
  if (sugErr || !sug) return { ok: false, error: "Falha ao registrar sugestão." };

  // 2) materializa critérios pendentes (origin=ai)
  const rows = [
    ...s.output.inclusion.map((t) => ({ kind: "inclusion" as const, text: t })),
    ...s.output.exclusion.map((t) => ({ kind: "exclusion" as const, text: t })),
    ...s.output.searchTerms.map((t) => ({ kind: "search_term" as const, text: t })),
  ].map((r) => ({
    review_id: reviewId,
    question_id: q.id,
    kind: r.kind,
    text: r.text,
    origin: "ai" as const,
    ratification_state: "pending" as const,
    ai_suggestion_id: sug.id,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from("eligibility_criterion").insert(rows);
    if (error) return { ok: false, error: "Falha ao gravar critérios." };
  }

  await writeAudit(supabase, {
    reviewId,
    actorId: userId,
    action: "derive_criteria",
    entity: "ai_suggestion",
    entityId: sug.id,
    before: null,
    after: { count: rows.length },
  });
  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const, notFound: s.not_found, count: rows.length };
}

export async function ratifyCriterion(
  reviewId: string,
  criterionId: string,
  decision: "accepted" | "edited" | "rejected",
  newText?: string,
) {
  const { supabase, userId } = await requireMember(reviewId);
  const patch: { ratification_state: typeof decision; text?: string } = {
    ratification_state: decision,
  };
  if (decision === "edited" && newText) patch.text = newText.trim();

  const { error } = await supabase
    .from("eligibility_criterion")
    .update(patch)
    .eq("id", criterionId)
    .eq("review_id", reviewId);
  if (error) return { ok: false, error: "Falha ao ratificar." };

  await writeAudit(supabase, {
    reviewId,
    actorId: userId,
    action: "ratify_criterion",
    entity: "eligibility_criterion",
    entityId: criterionId,
    before: null,
    after: { ratification_state: decision },
  });
  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const };
}
```

- [ ] **Step 2b: Teste de integração da derivação (mock provider, sem chamar API)**

> Este teste valida a **persistência** (sugestão + critérios pendentes) usando o `MockLLMProvider` diretamente — não exercita a factory/Vault (coberto em `byok.test.ts`). Usa o cliente do usuário (RLS) para semear `review`/`question` e ler o resultado.

Create `tests/integration/question-derivation.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";
import { MockLLMProvider } from "@/lib/ai/llm/mock";

describe("derivação de critérios — persistência pending (US5)", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let questionId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`q_${stamp}@example.com`, "senha-teste-123");
    client = u.client;
    const { data: r } = await client.rpc("create_review", { p_title: "R Pergunta" });
    reviewId = r.id;
    const { data: q } = await client
      .from("question")
      .insert({ review_id: reviewId, framework: "spider", question_text: "Q?" })
      .select("id")
      .single();
    questionId = q!.id;
  });

  it("grava ai_suggestion + critérios pending (origin=ai)", async () => {
    const provider = new MockLLMProvider();
    const s = await provider.deriveEligibility({
      framework: "spider",
      questionText: "Q?",
      fields: {},
    });
    const { data: sug } = await client
      .from("ai_suggestion")
      .insert({
        review_id: reviewId,
        target_kind: "eligibility",
        target_id: questionId,
        output: s.output,
        provenance: s.provenance,
        state: "pending",
        not_found: s.not_found,
      })
      .select("id")
      .single();
    expect(sug!.id).toBeTruthy();

    await client.from("eligibility_criterion").insert(
      s.output.inclusion.map((t) => ({
        review_id: reviewId,
        question_id: questionId,
        kind: "inclusion" as const,
        text: t,
        origin: "ai" as const,
        ratification_state: "pending" as const,
        ai_suggestion_id: sug!.id,
      })),
    );

    const { data: crit } = await client
      .from("eligibility_criterion")
      .select("ratification_state, origin")
      .eq("review_id", reviewId);
    expect(crit!.length).toBeGreaterThan(0);
    expect(crit!.every((c) => c.ratification_state === "pending" && c.origin === "ai")).toBe(true);
  });

  it("constraint barra critério origin=ai sem ai_suggestion_id", async () => {
    const { error } = await client.from("eligibility_criterion").insert({
      review_id: reviewId,
      question_id: questionId,
      kind: "inclusion",
      text: "sem sugestão",
      origin: "ai",
      ratification_state: "pending",
      ai_suggestion_id: null,
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 3: Rodar o teste de integração (requer supabase local)**

Run: `npm run test -- tests/integration/question-derivation.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 4: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/question/queries.ts "app/reviews/[reviewId]/question/actions.ts" tests/integration/question-derivation.test.ts
git commit -m "feat(question): queries + save/derive/ratify actions (AI suggestions pending)"
```

---

## Task 12 — US5: UI da Pergunta (page + form + painel de critérios)

> **SKILL:** carregue `frontend-design` (form + painel de critérios com vocabulário de IA), `react-best-practices`, `nextjs-best-practices` (RSC carrega dados; client só onde interage).

**Files:**
- Create: `app/reviews/[reviewId]/question/page.tsx`
- Create: `src/components/question/QuestionForm.tsx`
- Create: `src/components/question/CriteriaPanel.tsx`

- [ ] **Step 1: Page (RSC) — carrega pergunta, critérios e status BYOK**

Create `app/reviews/[reviewId]/question/page.tsx`:

```tsx
import { getQuestion, listCriteria } from "@/lib/question/queries";
import { getByokStatus } from "@/lib/byok/queries";
import { QuestionForm } from "@/components/question/QuestionForm";
import { CriteriaPanel } from "@/components/question/CriteriaPanel";
import { ByokKeyForm } from "@/components/ai/ByokKeyForm";

export const dynamic = "force-dynamic";

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const [question, criteria, byok] = await Promise.all([
    getQuestion(reviewId),
    listCriteria(reviewId),
    getByokStatus(reviewId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Pergunta da Revisão</h1>
      <QuestionForm reviewId={reviewId} initial={question} />
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Chave de IA (BYOK)</h2>
        <ByokKeyForm reviewId={reviewId} present={byok.present} />
      </section>
      <CriteriaPanel
        reviewId={reviewId}
        criteria={criteria}
        canDerive={!!question && byok.present}
      />
    </div>
  );
}
```

- [ ] **Step 2: `QuestionForm` (client) — seletor de framework + campos adaptáveis**

Create `src/components/question/QuestionForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { FRAMEWORK_FIELDS, FRAMEWORKS, type Framework } from "@/lib/question/schema";
import { saveQuestion } from "../../../app/reviews/[reviewId]/question/actions";

const FRAMEWORK_LABEL: Record<Framework, string> = {
  spider: "SPIDER", pico: "PICo", peo: "PEO", pcc: "PCC", free: "Livre",
};
const FIELD_LABEL: Record<string, string> = {
  sample: "Amostra", phenomenon: "Fenômeno", design: "Desenho",
  evaluation: "Avaliação", researchType: "Tipo de pesquisa",
  population: "População", intervention: "Intervenção", comparison: "Comparação",
  outcome: "Desfecho", exposure: "Exposição", concept: "Conceito", context: "Contexto",
};

export function QuestionForm({
  reviewId,
  initial,
}: {
  reviewId: string;
  initial: { framework: Framework; question_text: string; fields: Record<string, string> } | null;
}) {
  const [framework, setFramework] = useState<Framework>(initial?.framework ?? "spider");
  const [fields, setFields] = useState<Record<string, string>>(initial?.fields ?? {});
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        fd.set("framework", framework);
        fd.set("fields", JSON.stringify(fields));
        const r = await saveQuestion(reviewId, fd);
        setMsg(r.ok ? "Pergunta salva." : r.error ?? "Erro");
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Framework
        <select
          value={framework}
          onChange={(e) => setFramework(e.target.value as Framework)}
          className="border p-2"
        >
          {FRAMEWORKS.map((f) => (
            <option key={f} value={f}>{FRAMEWORK_LABEL[f]}</option>
          ))}
        </select>
      </label>

      {FRAMEWORK_FIELDS[framework].map((key) => (
        <label key={key} className="flex flex-col gap-1 text-sm">
          {FIELD_LABEL[key] ?? key}
          <input
            value={fields[key] ?? ""}
            onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))}
            className="border p-2"
          />
        </label>
      ))}

      <label className="flex flex-col gap-1 text-sm">
        Pergunta
        <textarea name="questionText" defaultValue={initial?.question_text ?? ""} required className="border p-2" rows={3} />
      </label>

      <button type="submit" className="self-start bg-black px-3 py-1 text-sm text-white">
        Salvar pergunta
      </button>
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
    </form>
  );
}
```

- [ ] **Step 3: `CriteriaPanel` (client) — derivar + ratificar com vocabulário de IA**

Create `src/components/question/CriteriaPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { SuggestionChip } from "@/components/ai/SuggestionChip";
import { SuggestionActions } from "@/components/ai/SuggestionActions";
import { NotFound } from "@/components/ai/NotFound";
import type { CriterionRow } from "@/lib/question/queries";
import {
  deriveCriteria,
  ratifyCriterion,
} from "../../../app/reviews/[reviewId]/question/actions";

const KIND_LABEL = {
  inclusion: "Inclusão",
  exclusion: "Exclusão",
  search_term: "Termo de busca",
} as const;

export function CriteriaPanel({
  reviewId,
  criteria,
  canDerive,
}: {
  reviewId: string;
  criteria: CriterionRow[];
  canDerive: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium">Critérios e termos (sugeridos pela IA)</h2>
        <button
          type="button"
          disabled={!canDerive}
          title={canDerive ? "" : "Salve a pergunta e cadastre a chave de IA"}
          onClick={async () => {
            const r = await deriveCriteria(reviewId);
            setNotFound(!!r.ok && !!r.notFound);
            setMsg(r.ok ? "Sugestões geradas." : r.error ?? "Erro");
          }}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          Derivar por IA
        </button>
        {msg && <span className="text-xs text-zinc-600">{msg}</span>}
      </div>

      {notFound && <NotFound what="Sugestões de critérios" />}

      <ul className="flex flex-col gap-2">
        {criteria.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
            <span className="text-xs font-semibold">{KIND_LABEL[c.kind]}</span>
            <span className="flex-1">{c.text}</span>
            {c.origin === "ai" && <SuggestionChip state={c.ratification_state} />}
            {c.origin === "ai" && c.ratification_state === "pending" && (
              <SuggestionActions
                onAccept={async () => { await ratifyCriterion(reviewId, c.id, "accepted"); }}
                onEdit={async () => {
                  const t = window.prompt("Editar critério", c.text);
                  if (t) await ratifyCriterion(reviewId, c.id, "edited", t);
                }}
                onReject={async () => { await ratifyCriterion(reviewId, c.id, "rejected"); }}
              />
            )}
          </li>
        ))}
        {criteria.length === 0 && (
          <li className="text-sm text-zinc-500">Nenhum critério ainda.</li>
        )}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Type-check + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/reviews/[reviewId]/question/page.tsx" src/components/question
git commit -m "feat(question): question page, framework form, AI criteria panel (US5)"
```

---

## Task 13 — US6: serialização Markdown do protocolo (TDD)

**Files:**
- Create: `src/lib/protocol/markdown.ts`
- Test: `tests/unit/protocol/markdown.test.ts`

- [ ] **Step 1: Teste (falha primeiro)**

Create `tests/unit/protocol/markdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { protocolToMarkdown } from "@/lib/protocol/markdown";

describe("protocolToMarkdown", () => {
  it("usa contentMarkdown quando presente", () => {
    const md = protocolToMarkdown({ contentMarkdown: "# Título\n\ncorpo" });
    expect(md).toContain("# Título");
  });

  it("serializa um content estruturado em seções", () => {
    const md = protocolToMarkdown({ sections: { objetivo: "X", criterios: "Y" } });
    expect(md).toContain("## objetivo");
    expect(md).toContain("X");
  });

  it("content vazio gera um cabeçalho mínimo", () => {
    const md = protocolToMarkdown({});
    expect(md).toMatch(/Protocolo/);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm run test -- tests/unit/protocol/markdown.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Create `src/lib/protocol/markdown.ts`:

```ts
export type ProtocolContent =
  | { contentMarkdown: string }
  | { sections: Record<string, string> }
  | Record<string, never>;

export function protocolToMarkdown(content: ProtocolContent): string {
  if ("contentMarkdown" in content && content.contentMarkdown) {
    return content.contentMarkdown;
  }
  if ("sections" in content && content.sections) {
    const body = Object.entries(content.sections)
      .map(([k, v]) => `## ${k}\n\n${v}\n`)
      .join("\n");
    return `# Protocolo PRISMA-P\n\n${body}`;
  }
  return `# Protocolo PRISMA-P\n\n(Sem conteúdo.)\n`;
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npm run test -- tests/unit/protocol/markdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/protocol/markdown.ts tests/unit/protocol/markdown.test.ts
git commit -m "feat(protocol): content -> Markdown serialization (FR-012 export)"
```

---

## Task 14 — US6: queries + server actions (rascunhar, salvar, travar, emendar)

> **SKILL:** `nextjs-best-practices`. Travamento via RPC `lock_protocol`; emenda via `add_protocol_amendment`; edição de `content` só enquanto `draft` (trigger barra o resto).

**Files:**
- Create: `src/lib/protocol/queries.ts`
- Create: `app/reviews/[reviewId]/protocol/actions.ts`

- [ ] **Step 1: Queries**

Create `src/lib/protocol/queries.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import type { ProtocolContent } from "./markdown";

export interface ProtocolRow {
  id: string;
  content: ProtocolContent;
  state: "draft" | "locked";
  locked_at: string | null;
  origin: "ai_draft" | "human";
}

export interface AmendmentRow {
  id: string;
  version: number;
  change: Record<string, unknown>;
  dated_at: string;
}

export async function getProtocol(reviewId: string): Promise<ProtocolRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol")
    .select("id, content, state, locked_at, origin")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ProtocolRow | null;
}

export async function listAmendments(reviewId: string): Promise<AmendmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol_amendment")
    .select("id, version, change, dated_at")
    .eq("review_id", reviewId)
    .order("version", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AmendmentRow[];
}
```

- [ ] **Step 2: Server actions**

Create `app/reviews/[reviewId]/protocol/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLLMProvider, MissingByokError } from "@/lib/ai/llm";
import { writeAudit } from "@/lib/audit";

async function requireMember(reviewId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase.rpc("is_review_member", { p_review_id: reviewId });
  if (error || !data) throw new Error("not a member");
  return { supabase, userId: auth.user.id };
}

export async function draftProtocol(reviewId: string) {
  const { supabase, userId } = await requireMember(reviewId);
  const { data: q } = await supabase
    .from("question")
    .select("id, question_text")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Formule a pergunta primeiro." };

  const { data: crit } = await supabase
    .from("eligibility_criterion")
    .select("text")
    .eq("review_id", reviewId)
    .in("ratification_state", ["accepted", "edited"]);

  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError)
      return { ok: false, error: "Cadastre a chave de IA (BYOK)." };
    throw e;
  }

  const s = await provider.draftProtocol({
    questionText: q.question_text,
    criteria: (crit ?? []).map((c) => c.text),
  });

  const { data: sug } = await supabase
    .from("ai_suggestion")
    .insert({
      review_id: reviewId,
      target_kind: "protocol_draft",
      output: s.output,
      provenance: s.provenance,
      state: "pending",
      not_found: s.not_found,
    })
    .select("id")
    .single();

  const { data: proto, error } = await supabase
    .from("protocol")
    .upsert(
      {
        review_id: reviewId,
        content: { contentMarkdown: s.output.contentMarkdown },
        origin: "ai_draft",
        ai_suggestion_id: sug?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "review_id" },
    )
    .select("id, state")
    .single();
  if (error || !proto) return { ok: false, error: "Falha ao gravar rascunho." };
  if (proto.state === "locked")
    return { ok: false, error: "Protocolo travado; use emendas." };

  await writeAudit(supabase, {
    reviewId, actorId: userId, action: "draft_protocol",
    entity: "protocol", entityId: proto.id, before: null, after: { origin: "ai_draft" },
  });
  revalidatePath(`/reviews/${reviewId}/protocol`);
  return { ok: true as const };
}

export async function saveProtocolDraft(reviewId: string, contentMarkdown: string) {
  const { supabase, userId } = await requireMember(reviewId);
  // Trigger guard_locked_protocol barra se já travado.
  const { data, error } = await supabase
    .from("protocol")
    .upsert(
      { review_id: reviewId, content: { contentMarkdown }, updated_at: new Date().toISOString() },
      { onConflict: "review_id" },
    )
    .select("id")
    .single();
  if (error)
    return { ok: false, error: "Protocolo travado ou inválido — edite via emenda." };

  await writeAudit(supabase, {
    reviewId, actorId: userId, action: "save_protocol_draft",
    entity: "protocol", entityId: data!.id, before: null, after: null,
  });
  revalidatePath(`/reviews/${reviewId}/protocol`);
  return { ok: true as const };
}

export async function lockProtocol(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("lock_protocol", { p_review_id: reviewId });
  if (error) return { ok: false, error: "Falha ao travar." };
  revalidatePath(`/reviews/${reviewId}/protocol`);
  return { ok: true as const };
}

export async function addAmendment(reviewId: string, formData: FormData) {
  const text = String(formData.get("change") ?? "").trim();
  if (text === "") return { ok: false, error: "Descreva a mudança." };
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("add_protocol_amendment", {
    p_review_id: reviewId,
    p_change: { text },
  });
  if (error) return { ok: false, error: "Falha ao registrar emenda (protocolo travado?)." };
  revalidatePath(`/reviews/${reviewId}/protocol`);
  return { ok: true as const };
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/protocol/queries.ts "app/reviews/[reviewId]/protocol/actions.ts"
git commit -m "feat(protocol): queries + draft/save/lock/amend actions (US6)"
```

---

## Task 15 — US6: travamento e imutabilidade (teste de integração — SC-010)

**Files:**
- Test: `tests/integration/protocol-lock.test.ts`

- [ ] **Step 1: Escrever o teste de integração**

Create `tests/integration/protocol-lock.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";

describe("travamento de protocolo (US6 / SC-010)", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`pl_${stamp}@example.com`, "senha-teste-123");
    client = u.client;
    const { data: r } = await client.rpc("create_review", { p_title: "R Protocolo" });
    reviewId = r.id;
    await client.from("protocol").insert({
      review_id: reviewId,
      content: { contentMarkdown: "# rascunho" },
      origin: "human",
    });
  });

  it("lock_protocol trava e marca a Revisão", async () => {
    const { error } = await client.rpc("lock_protocol", { p_review_id: reviewId });
    expect(error).toBeNull();
    const { data } = await client
      .from("protocol")
      .select("state, locked_at")
      .eq("review_id", reviewId)
      .single();
    expect(data!.state).toBe("locked");
    expect(data!.locked_at).not.toBeNull();
  });

  it("conteúdo travado é imutável (trigger barra UPDATE de content)", async () => {
    const { error } = await client
      .from("protocol")
      .update({ content: { contentMarkdown: "# tentativa de sobrescrever" } })
      .eq("review_id", reviewId);
    expect(error).not.toBeNull();
  });

  it("mudança pós-travamento vira emenda versionada e datada", async () => {
    const { error } = await client.rpc("add_protocol_amendment", {
      p_review_id: reviewId,
      p_change: { text: "ajuste de critério" },
    });
    expect(error).toBeNull();
    const { data } = await client
      .from("protocol_amendment")
      .select("version, dated_at, change")
      .eq("review_id", reviewId)
      .order("version", { ascending: true });
    expect(data!.length).toBe(1);
    expect(data![0].version).toBe(1);
    expect(data![0].dated_at).toBeTruthy();
  });

  it("trilha de auditoria registrou lock + emenda", async () => {
    const { data } = await client
      .from("audit_entry")
      .select("action")
      .eq("review_id", reviewId);
    const actions = (data ?? []).map((a) => a.action);
    expect(actions).toContain("lock_protocol");
    expect(actions).toContain("add_protocol_amendment");
  });
});
```

- [ ] **Step 2: Rodar até passar (supabase local)**

Run: `npm run test -- tests/integration/protocol-lock.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/protocol-lock.test.ts
git commit -m "test(protocol): lock immutability + versioned amendment (SC-010)"
```

---

## Task 16 — US6: UI do protocolo (page + editor + emendas + export)

> **SKILL:** `frontend-design` (estado draft/locked visível), `react-best-practices`, `nextjs-best-practices` (Route Handler de download).

**Files:**
- Create: `app/reviews/[reviewId]/protocol/page.tsx`
- Create: `app/reviews/[reviewId]/protocol/export/route.ts`
- Create: `src/components/protocol/ProtocolEditor.tsx`
- Create: `src/components/protocol/AmendmentList.tsx`

- [ ] **Step 1: Page (RSC)**

Create `app/reviews/[reviewId]/protocol/page.tsx`:

```tsx
import { getProtocol, listAmendments } from "@/lib/protocol/queries";
import { getByokStatus } from "@/lib/byok/queries";
import { ProtocolEditor } from "@/components/protocol/ProtocolEditor";
import { AmendmentList } from "@/components/protocol/AmendmentList";

export const dynamic = "force-dynamic";

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const [protocol, amendments, byok] = await Promise.all([
    getProtocol(reviewId),
    listAmendments(reviewId),
    getByokStatus(reviewId),
  ]);

  const initialMd =
    protocol && "contentMarkdown" in protocol.content
      ? (protocol.content.contentMarkdown ?? "")
      : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Protocolo PRISMA-P</h1>
        {protocol?.state === "locked" ? (
          <span className="rounded-full border border-zinc-500 bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
            🔒 Travado{protocol.locked_at ? ` em ${new Date(protocol.locked_at).toLocaleDateString("pt-BR")}` : ""}
          </span>
        ) : (
          <span className="rounded-full border border-violet-400 bg-violet-50 px-2 py-0.5 text-xs dark:bg-violet-950">
            Rascunho
          </span>
        )}
        <a href={`/reviews/${reviewId}/protocol/export`} className="ml-auto text-sm underline">
          Exportar (.md)
        </a>
      </div>

      <ProtocolEditor
        reviewId={reviewId}
        initialMarkdown={initialMd}
        locked={protocol?.state === "locked"}
        canDraft={byok.present}
      />

      <AmendmentList reviewId={reviewId} amendments={amendments} locked={protocol?.state === "locked"} />
    </div>
  );
}
```

- [ ] **Step 2: Route Handler de export Markdown (FR-012)**

Create `app/reviews/[reviewId]/protocol/export/route.ts`:

```ts
import { getProtocol } from "@/lib/protocol/queries";
import { protocolToMarkdown } from "@/lib/protocol/markdown";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;
  const protocol = await getProtocol(reviewId); // RLS garante o escopo
  if (!protocol) return new Response("Protocolo não encontrado", { status: 404 });

  const md = protocolToMarkdown(protocol.content);
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="protocolo-${reviewId}.md"`,
    },
  });
}
```

- [ ] **Step 3: `ProtocolEditor` (client)**

Create `src/components/protocol/ProtocolEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  draftProtocol,
  saveProtocolDraft,
  lockProtocol,
} from "../../../app/reviews/[reviewId]/protocol/actions";

export function ProtocolEditor({
  reviewId,
  initialMarkdown,
  locked,
  canDraft,
}: {
  reviewId: string;
  initialMarkdown: string;
  locked: boolean;
  canDraft: boolean;
}) {
  const [md, setMd] = useState(initialMarkdown);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={locked || !canDraft}
          title={canDraft ? "" : "Cadastre a chave de IA"}
          onClick={async () => {
            const r = await draftProtocol(reviewId);
            setMsg(r.ok ? "Rascunho gerado pela IA." : r.error ?? "Erro");
          }}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          Rascunhar por IA
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={async () => {
            const r = await saveProtocolDraft(reviewId, md);
            setMsg(r.ok ? "Rascunho salvo." : r.error ?? "Erro");
          }}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          Salvar rascunho
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={async () => {
            if (!window.confirm("Travar o protocolo? Mudanças passarão a ser emendas.")) return;
            const r = await lockProtocol(reviewId);
            setMsg(r.ok ? "Protocolo travado." : r.error ?? "Erro");
          }}
          className="rounded border border-zinc-700 px-3 py-1 text-sm disabled:opacity-50"
        >
          Travar protocolo
        </button>
      </div>

      <textarea
        value={md}
        onChange={(e) => setMd(e.target.value)}
        readOnly={locked}
        rows={16}
        aria-label="Conteúdo do protocolo (Markdown)"
        className="border p-2 font-mono text-sm read-only:bg-zinc-50 dark:read-only:bg-zinc-900"
      />
      {locked && (
        <p className="text-xs text-zinc-600">
          Protocolo travado: o conteúdo é imutável; registre mudanças como emendas abaixo.
        </p>
      )}
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
    </section>
  );
}
```

- [ ] **Step 4: `AmendmentList` (client)**

Create `src/components/protocol/AmendmentList.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { AmendmentRow } from "@/lib/protocol/queries";
import { addAmendment } from "../../../app/reviews/[reviewId]/protocol/actions";

export function AmendmentList({
  reviewId,
  amendments,
  locked,
}: {
  reviewId: string;
  amendments: AmendmentRow[];
  locked: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">Emendas versionadas</h2>
      <ul className="flex flex-col gap-1">
        {amendments.map((a) => (
          <li key={a.id} className="rounded border p-2 text-sm">
            <span className="font-semibold">v{a.version}</span>{" "}
            <span className="text-zinc-500">({new Date(a.dated_at).toLocaleDateString("pt-BR")})</span>
            <div>{(a.change as { text?: string }).text ?? JSON.stringify(a.change)}</div>
          </li>
        ))}
        {amendments.length === 0 && <li className="text-sm text-zinc-500">Sem emendas.</li>}
      </ul>

      {locked && (
        <form
          action={async (fd) => {
            const r = await addAmendment(reviewId, fd);
            setMsg(r.ok ? "Emenda registrada." : r.error ?? "Erro");
          }}
          className="flex flex-col gap-2"
        >
          <textarea name="change" rows={2} required className="border p-2 text-sm"
            placeholder="Descreva a mudança (emenda datada)" />
          <button type="submit" className="self-start rounded border px-3 py-1 text-sm">
            Adicionar emenda
          </button>
          {msg && <p className="text-xs text-zinc-600">{msg}</p>}
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Type-check + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/reviews/[reviewId]/protocol" src/components/protocol
git commit -m "feat(protocol): protocol page, editor, amendments, Markdown export (US6)"
```

---

## Task 17 — Navegação: links Pergunta/Protocolo no shell

> **SKILL:** `nextjs-best-practices`. O trilho de fases completo é Fatia 6; aqui só links de navegação dentro da Revisão ativa.

**Files:**
- Modify: `app/reviews/[reviewId]/layout.tsx`

- [ ] **Step 1: Adicionar links após o `ReviewSwitcher`**

In `app/reviews/[reviewId]/layout.tsx`, dentro do `<header>`, **após** a linha `<ReviewSwitcher reviews={reviews} activeId={active.id} />`, inserir:

```tsx
        <nav className="flex gap-3 text-sm">
          <a href={`/reviews/${active.id}/question`} className="underline">
            Pergunta
          </a>
          <a href={`/reviews/${active.id}/protocol`} className="underline">
            Protocolo
          </a>
        </nav>
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/reviews/[reviewId]/layout.tsx"
git commit -m "feat(shell): question/protocol nav links in review header"
```

---

## Task 18 — BYOK + RLS: testes de integração (Vault round-trip + isolamento — SC-009)

**Files:**
- Test: `tests/integration/byok.test.ts`
- Test: `tests/integration/rls.question-protocol.test.ts`

- [ ] **Step 1: Teste do BYOK (Vault round-trip + decifragem só por service_role)**

Create `tests/integration/byok.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

describe("BYOK via Supabase Vault (R5/FR-032)", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`k_${stamp}@example.com`, "senha-teste-123");
    client = u.client;
    const { data: r } = await client.rpc("create_review", { p_title: "R BYOK" });
    reviewId = r.id;
  });

  it("set_byok_key grava metadados e cifra o segredo no Vault", async () => {
    const { error } = await client.rpc("set_byok_key", {
      p_review_id: reviewId,
      p_provider: "anthropic",
      p_api_key: "sk-ant-teste-123",
    });
    expect(error).toBeNull();
    const { data } = await client
      .from("byok_key")
      .select("provider, vault_secret_id")
      .eq("review_id", reviewId)
      .single();
    expect(data!.provider).toBe("anthropic");
    expect(data!.vault_secret_id).toBeTruthy();
  });

  it("authenticated NÃO pode chamar get_byok_secret (decifragem só server-side)", async () => {
    const { error } = await client.rpc("get_byok_secret", { p_review_id: reviewId });
    expect(error).not.toBeNull(); // permissão negada
  });

  it("service_role decifra o segredo original", async () => {
    const admin = serviceClient();
    const { data, error } = await admin.rpc("get_byok_secret", { p_review_id: reviewId });
    expect(error).toBeNull();
    expect(data?.[0]?.api_key).toBe("sk-ant-teste-123");
  });
});
```

- [ ] **Step 2: Teste de RLS nas tabelas novas (SC-009)**

Create `tests/integration/rls.question-protocol.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";

describe("RLS — question/protocol/criteria/byok isolados por Revisão (SC-009)", () => {
  let aClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let bClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewIdA: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const a = await signUpUser(`qa_${stamp}@example.com`, "senha-teste-123");
    const b = await signUpUser(`qb_${stamp}@example.com`, "senha-teste-123");
    aClient = a.client;
    bClient = b.client;
    const { data } = await aClient.rpc("create_review", { p_title: "R de A" });
    reviewIdA = data.id;
    await aClient.from("question").insert({
      review_id: reviewIdA,
      framework: "spider",
      question_text: "Pergunta de A",
    });
  });

  it("A enxerga a própria question", async () => {
    const { data } = await aClient.from("question").select("id").eq("review_id", reviewIdA);
    expect(data?.length).toBe(1);
  });

  it("B NÃO enxerga a question de A", async () => {
    const { data } = await bClient.from("question").select("id").eq("review_id", reviewIdA);
    expect(data ?? []).toHaveLength(0);
  });

  it("B NÃO consegue inserir protocol na Revisão de A", async () => {
    const { error } = await bClient.from("protocol").insert({
      review_id: reviewIdA,
      content: { contentMarkdown: "tamper" },
      origin: "human",
    });
    expect(error).not.toBeNull();
  });

  it("B NÃO consegue travar o protocolo de A (RPC checa membership)", async () => {
    const { error } = await bClient.rpc("lock_protocol", { p_review_id: reviewIdA });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 3: Rodar a suíte de integração inteira**

Run: `npm run test -- tests/integration/`
Expected: PASS — RLS da Fatia 1 + question-derivation + protocol-lock + byok + rls.question-protocol.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/byok.test.ts tests/integration/rls.question-protocol.test.ts
git commit -m "test: BYOK Vault round-trip + RLS isolation for question/protocol (SC-009)"
```

---

## Task 19 — Verificação final da fatia (portões de qualidade) + COMPLETION

> **SKILL:** `verification-before-completion` (evidência antes de afirmar concluído).

**Files:**
- Create: `specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-2.md`

- [ ] **Step 1: Rodar todos os portões e capturar a saída**

Run, em sequência, capturando o resultado de cada um:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

Expected: `lint` sem erros; `typecheck` limpo; `vitest` todos verdes (unit + integration); `playwright` — os e2e da Fatia 1 (auth, review-switch, smoke) continuam verdes (sem regressão). *(e2e novos de Pergunta/Protocolo não são obrigatórios nesta fatia — os fluxos críticos e2e do spec são importar/triar, das Fatias 3/5.)*

- [ ] **Step 2: Escrever o COMPLETION da fatia**

Create `specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-2.md` com: FR cobertas (006–012, 030–034), US (US5, US6), itens entregues, decisões D-F2.\*, saída literal dos 4 portões, e o que ficou explicitamente para fatias seguintes (gatilho automático de lock → Fatia 5; export PDF → Marco 3; jobs/batch → Fatia 3/5).

- [ ] **Step 3: Commit**

```bash
git add specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-2.md
git commit -m "docs: Fatia 2 completion report"
```

- [ ] **Step 4: PARAR (CHECKPOINT 3)**

**NÃO** mergear. Apresentar ao desenvolvedor: branch `build/001-marco1-nucleo-fluxo/2-pergunta-protocolo`, o diff, e a saída de `lint` + `typecheck` + `test` + `test:e2e`. Aguardar o merge manual do desenvolvedor antes de qualquer próxima fatia (CLAUDE.md §5).

---

## Self-Review (writing-plans)

**1. Cobertura da spec (FR/US da Fatia 2 — slicing):**
- FR-006 (framework SPIDER default + alternativas) → Task 10 (schema) + Task 12 (UI select). ✓
- FR-007/008 (derivação IA ratificável; aceitar/editar/rejeitar c/ estado) → Task 11 (`deriveCriteria`/`ratifyCriterion`) + Task 12 (CriteriaPanel). ✓
- FR-009 (rascunho PRISMA-P editável) → Task 14 (`draftProtocol`/`saveProtocolDraft`) + Task 16 (editor). ✓
- FR-010 (travar; estado visível) → operação em Task 1 (`lock_protocol`) + Task 14/16; gatilho automático **diferido à Fatia 5** (D-F2.6, conforme slicing). ✓
- FR-011 (emenda versionada/datada, sem sobrescrever) → Task 1 (`add_protocol_amendment` + trigger) + Task 15 (teste SC-010) + Task 16. ✓
- FR-012 (export) → Task 13 (markdown) + Task 16 (route). Markdown (D-F2.1). ✓
- FR-030 (estado visível, distinto de humano) → Task 8 (SuggestionChip/state). ✓
- FR-031 (proveniência) → contrato em Task 2; persistida em Task 11/14; exibida em Task 8 (ProvenancePopover). ✓
- FR-032 (BYOK cifrada; operar manualmente sem IA) → Task 1 (Vault RPCs) + Task 9 (form/action); `MissingByokError` mantém fases manuais (Task 11/14). ✓
- FR-033 (estimativa de custo) → `estimateCost`/`ai_usage` (Task 1/4/5); **consumo na UI da fila** é Fatia 5 — aqui fica a base. ✓ (parcial-por-design)
- FR-034 (not_found 1ª classe) → Task 2 (contrato) + Task 8 (NotFound) + Task 12 (render). ✓
- US5 → Tasks 10–12. US6 → Tasks 13–16. ✓

**2. Placeholders:** nenhuma tarefa contém "TBD"/"adicionar validação"/"similar à Task N". Todo código está escrito. ✓

**3. Consistência de tipos:** `LlmSuggestion<T>`/`Provenance`/`SuggestionState` definidos na Task 2 e usados idênticos em Tasks 3/5/8/11/14. `CriterionRow`/`AmendmentRow`/`ProtocolRow` definidos nas queries (Tasks 11/14) e consumidos nas UIs (Tasks 12/16). RPCs (`lock_protocol`, `add_protocol_amendment`, `set_byok_key`, `get_byok_secret`, `is_review_member`) definidas na Task 1 e chamadas com a mesma assinatura nas actions. ✓

**Nota de ordem de execução:** Task 1 (migration + tipos) **precede** todo consumo de schema (Princípio IV). Tasks 2–8 são fundação de IA/UI sem dependência de UI de feature. Tasks 9–12 (US5) e 13–16 (US6) dependem de 1–8. Tasks 18–19 fecham com integração e verificação.
