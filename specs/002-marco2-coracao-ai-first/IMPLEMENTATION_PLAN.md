# Fatia 3 — Formulário de extração configurável (US2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um membro da Revisão monte **um único** formulário de extração com campos tipados (texto/número/data/booleano/escolha), editáveis, removíveis e reordenáveis — toda mudança auditada — como instrumento configurável reaproveitável, **sem IA**.

**Architecture:** Schema-first (Princípio IV). Migração `0014` cria `extraction_form` (1:1 com `review`) + `extraction_field` (campos tipados, soft-delete via `is_active`), com RLS de leitura por membro. Toda mutação passa por **RPC `security definer`** que valida pertencimento, valida o campo e grava `audit_entry` atômico (espelha `lock_protocol`/`ensure_exclusion_reasons` do Marco 1). A camada TS (`queries`/`schema`/Server Actions) é fina sobre as RPCs; a UI é um builder client-side que chama as actions. **Nenhuma escrita direta** de campo contorna a RPC auditada.

**Tech Stack:** Next.js 14 (App Router, Server Actions), Supabase (PostgreSQL, RLS, RPC plpgsql), TypeScript strict, React Hook Form + Zod, Tailwind, Vitest (unit + integration), Testing Library.

---

## Decisões de design (registradas para CHECKPOINT 2)

1. **`sort_order int` (não `order`)** — `order` é palavra reservada do SQL; a convenção do repo já usa `sort_order` (`exclusion_reason`). A `data-model.md` nomeia `order` conceitualmente; `sort_order` é a materialização.
2. **Soft-delete via `is_active boolean`** — remover um campo faz `is_active=false` (espelha `exclusion_reason.is_active`), nunca `DELETE`. Honra o edge case "remover/editar **não apaga silenciosamente** `extraction_value` validado": `extraction_value` só nasce na Fatia 4, então o soft-delete é o **seam forward-safe** (a FK da F4 nunca aponta para linha removida). A F4 acrescenta a regra "não desativar campo com valor validado".
3. **Mutações só por RPC auditada** — `add/update/remove/reorder_extraction_field` e `ensure_extraction_form` são `security definer`, checam `is_review_member`, validam e gravam `audit_entry` (ator `human`). RLS concede **apenas `select`** a `authenticated`; escrita real é das RPCs. Satisfaz FR-010 ("mudança registrada") e FR-029 ("configurar formulário" na trilha).
4. **Validação em três camadas** — CHECK no schema (backstop), `raise exception` nas RPCs (mensagem limpa), Zod nas Server Actions (UX). `type='select' ⇒ options` array não-vazio; `name` não-vazio.
5. **Sem fiação do trilho de fases** — a slicing atribui o `PhaseKey` "Extração" à **Fatia 4**. A F3 entrega a página `app/reviews/[reviewId]/extraction/page.tsx` alcançável por URL; a F4 a insere no `PhaseRail`. F3 **não** toca `phases.ts`.
6. **Sem IA, sem embeddings, sem job** — F3 é configuração pura. Nenhum import de `LLMProvider`/`EmbeddingProvider`/`job`.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0014_extraction_form.sql` | **Criar:** enum `extraction_field_type`; tabelas `extraction_form` (1:1 review) + `extraction_field` (tipado, `is_active`, `sort_order`, CHECKs); RLS `select` por membro; RPCs `ensure_extraction_form`, `add/update/remove/reorder_extraction_field` (auditadas); grants. |
| `src/types/database.ts` | **Modificar (regen):** tipos de `extraction_form`/`extraction_field` + enum. |
| `src/lib/extraction/queries.ts` | **Criar:** `getExtractionForm` (form 1:1) + `listExtractionFields` (ativos, ordenados) — deps-injected (`{ supabase }`), espelha `documents/queries.ts`. |
| `src/lib/extraction/schema.ts` | **Criar:** Zod `extractionFieldInputSchema` + tipos derivados; `FIELD_TYPES` (`as const`). |
| `app/reviews/[reviewId]/extraction/actions.ts` | **Criar:** Server Actions `ensureExtractionForm`/`addExtractionField`/`updateExtractionField`/`removeExtractionField`/`reorderExtractionFields` (thin sobre RPC, `requireMember`, `revalidatePath`). |
| `app/reviews/[reviewId]/extraction/page.tsx` | **Criar:** Server Component — busca form+fields e renderiza `<ExtractionFormBuilder>`. |
| `src/components/extraction/ExtractionFormBuilder.tsx` | **Criar:** client builder — adicionar/editar/remover/reordenar campos via actions; pt-BR; Tailwind. |
| `tests/integration/extraction-form.test.ts` | **Criar:** RPCs (ensure 1:1, add+validação, update audit, remove soft-delete, reorder). |
| `tests/integration/rls.extraction.test.ts` | **Criar:** isolamento — não-membro não lê form/fields; RPC de não-membro levanta `not a member`. |
| `tests/unit/extraction/schema.test.ts` | **Criar:** Zod — `select` exige `options`; `name` não-vazio; tipos inválidos rejeitados. |
| `tests/unit/extraction/form-builder.test.tsx` | **Criar:** render do builder (campos listados, ordem, ação remover chama action). |

---

## Task 1: Migração 0014 — `extraction_form` + `extraction_field` + RLS (schema only)

**Files:**
- Create: `supabase/migrations/0014_extraction_form.sql`
- Modify: `src/types/database.ts` (via `npm run gen:types`)

- [ ] **Step 1: Escrever a migration (schema + RLS, sem RPCs ainda)**

Create `supabase/migrations/0014_extraction_form.sql`:

```sql
-- ============================================================
-- Marco 2 / Fatia 3 — Formulário de extração configurável (US2 / D9).
-- extraction_form é 1:1 com review (Q2). extraction_field é tipado e usa
-- soft-delete (is_active) para nunca apagar silenciosamente valores futuros
-- (extraction_value chega na Fatia 4). Escrita real via RPC auditada (abaixo);
-- RLS concede só SELECT a membros. data-model.md §extraction_form/§extraction_field.
-- ============================================================

-- tipo do campo (enum no banco — CLAUDE.md). FR-009.
create type extraction_field_type as enum ('text', 'number', 'date', 'boolean', 'select');

-- ---------- extraction_form (1:1 com review — Q2/FR-011) ----------
create table public.extraction_form (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- extraction_field (campo tipado — FR-009/010) ----------
create table public.extraction_field (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  form_id uuid not null references public.extraction_form (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),     -- não-vazio
  type extraction_field_type not null,
  options jsonb,                                            -- valores p/ type=select
  sort_order integer not null default 0,                   -- ordenação (FR-009)
  is_active boolean not null default true,                 -- soft-delete (decisão 2)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- select ⇒ options é array não-vazio; não-select ⇒ options nulo (decisão 4)
  constraint extraction_field_options_ck check (
    case
      when type = 'select'
        then options is not null and jsonb_typeof(options) = 'array' and jsonb_array_length(options) > 0
      else options is null
    end
  )
);
create index extraction_field_form_idx on public.extraction_field (form_id, sort_order);
create index extraction_field_review_idx on public.extraction_field (review_id);

alter table public.extraction_form  enable row level security;
alter table public.extraction_field enable row level security;

-- Leitura por membros; escrita só pelas RPCs security-definer (Task 2-6).
create policy extraction_form_select on public.extraction_form
  for select using (public.is_review_member(review_id));
create policy extraction_field_select on public.extraction_field
  for select using (public.is_review_member(review_id));
```

- [ ] **Step 2: Aplicar e regenerar tipos**

Run:
```bash
supabase db reset
npm run gen:types
```
Expected: reset sem erro; `src/types/database.ts` passa a conter `extraction_form`, `extraction_field` e o enum `extraction_field_type`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_extraction_form.sql src/types/database.ts
git commit -m "feat(002-f3): migration 0014 extraction_form + extraction_field + RLS (US2)"
```

---

## Task 2: RPC `ensure_extraction_form` (1:1 lazy create, auditada)

**Files:**
- Modify: `supabase/migrations/0014_extraction_form.sql`
- Test: `tests/integration/extraction-form.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/integration/extraction-form.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

async function newReview(title: string) {
  const { client } = await signUpUser(
    `xf_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await client.rpc("create_review", { p_title: title });
  if (error) throw new Error(error.message);
  return { client, reviewId: review.id as string };
}

describe("ensure_extraction_form — 1:1 com review, idempotente", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const r = await newReview("Form de extração");
    client = r.client;
    reviewId = r.reviewId;
  });

  it("cria o formulário na 1ª chamada e devolve o mesmo na 2ª (sem duplicar)", async () => {
    const a = await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
    expect(a.error).toBeNull();
    const b = await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
    expect(b.error).toBeNull();
    expect(b.data.id).toBe(a.data.id);

    const svc = serviceClient();
    const { data: forms } = await svc
      .from("extraction_form")
      .select("id")
      .eq("review_id", reviewId);
    expect(forms!.length).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extraction-form.test.ts`
Expected: FAIL — `function public.ensure_extraction_form(uuid) does not exist`.

- [ ] **Step 3: Adicionar a RPC à migration**

Append em `supabase/migrations/0014_extraction_form.sql`:

```sql
-- ============================================================
-- RPC: ensure_extraction_form — cria (idempotente) o form 1:1 da Revisão; audita só na criação.
-- ============================================================
create or replace function public.ensure_extraction_form(p_review_id uuid)
returns public.extraction_form
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.extraction_form;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  select * into v_form from public.extraction_form where review_id = p_review_id;
  if found then
    return v_form;
  end if;

  insert into public.extraction_form (review_id) values (p_review_id)
  returning * into v_form;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'ensure_extraction_form', 'extraction_form', v_form.id,
          null, to_jsonb(v_form));

  return v_form;
end;
$$;

grant execute on function public.ensure_extraction_form(uuid) to authenticated;
```

- [ ] **Step 4: Aplicar, regenerar tipos e ver passar**

Run:
```bash
supabase db reset
npm run gen:types
npx vitest run tests/integration/extraction-form.test.ts
```
Expected: reset sem erro; teste PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_extraction_form.sql src/types/database.ts tests/integration/extraction-form.test.ts
git commit -m "feat(002-f3): ensure_extraction_form RPC (1:1, audited) (US2/FR-011)"
```

---

## Task 3: RPC `add_extraction_field` + validação + audit

**Files:**
- Modify: `supabase/migrations/0014_extraction_form.sql`
- Test: `tests/integration/extraction-form.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Append em `tests/integration/extraction-form.test.ts`:

```ts
describe("add_extraction_field — cria campo tipado, valida, audita", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const r = await newReview("Form add campo");
    client = r.client;
    reviewId = r.reviewId;
    await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
  });

  it("cria um campo number e grava audit_entry", async () => {
    const { data, error } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Tamanho da amostra",
      p_type: "number",
      p_options: null,
    });
    expect(error).toBeNull();
    expect(data.name).toBe("Tamanho da amostra");
    expect(data.type).toBe("number");
    expect(data.is_active).toBe(true);

    const svc = serviceClient();
    const { data: audit } = await svc
      .from("audit_entry")
      .select("action, entity, entity_id")
      .eq("review_id", reviewId)
      .eq("action", "add_extraction_field");
    expect(audit!.length).toBe(1);
    expect(audit![0].entity_id).toBe(data.id);
  });

  it("rejeita select sem options", async () => {
    const { error } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Desenho",
      p_type: "select",
      p_options: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/options/i);
  });

  it("rejeita name vazio", async () => {
    const { error } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "   ",
      p_type: "text",
      p_options: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/name/i);
  });

  it("aceita select com options e anexa ao fim (sort_order crescente)", async () => {
    const first = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Desenho do estudo",
      p_type: "select",
      p_options: ["RCT", "Coorte", "Caso-controle"],
    });
    expect(first.error).toBeNull();
    expect(first.data.sort_order).toBeGreaterThan(0);
    expect(first.data.options).toEqual(["RCT", "Coorte", "Caso-controle"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extraction-form.test.ts`
Expected: FAIL — `function public.add_extraction_field(...) does not exist`.

- [ ] **Step 3: Adicionar a RPC à migration**

Append em `supabase/migrations/0014_extraction_form.sql`:

```sql
-- ============================================================
-- RPC: add_extraction_field — valida (name + select⇒options), anexa ao fim, audita.
-- ============================================================
create or replace function public.add_extraction_field(
  p_review_id uuid,
  p_name text,
  p_type extraction_field_type,
  p_options jsonb
)
returns public.extraction_field
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.extraction_form;
  v_field public.extraction_field;
  v_options jsonb;
  v_next int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'name required';
  end if;

  if p_type = 'select' then
    if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) = 0 then
      raise exception 'select requires non-empty options';
    end if;
    v_options := p_options;
  else
    v_options := null;  -- não-select nunca guarda options (decisão 4)
  end if;

  select * into v_form from public.extraction_form where review_id = p_review_id;
  if not found then
    raise exception 'extraction form not found';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_next
    from public.extraction_field where form_id = v_form.id and is_active;

  insert into public.extraction_field (review_id, form_id, name, type, options, sort_order)
  values (p_review_id, v_form.id, btrim(p_name), p_type, v_options, v_next)
  returning * into v_field;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'add_extraction_field', 'extraction_field', v_field.id,
          null, to_jsonb(v_field));

  return v_field;
end;
$$;

grant execute on function public.add_extraction_field(uuid, text, extraction_field_type, jsonb) to authenticated;
```

- [ ] **Step 4: Aplicar e ver passar**

Run:
```bash
supabase db reset
npm run gen:types
npx vitest run tests/integration/extraction-form.test.ts
```
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_extraction_form.sql src/types/database.ts tests/integration/extraction-form.test.ts
git commit -m "feat(002-f3): add_extraction_field RPC + validation + audit (US2/FR-009)"
```

---

## Task 4: RPC `update_extraction_field` + audit before/after

**Files:**
- Modify: `supabase/migrations/0014_extraction_form.sql`
- Test: `tests/integration/extraction-form.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Append em `tests/integration/extraction-form.test.ts`:

```ts
describe("update_extraction_field — edita campo, audita antes/depois", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let fieldId: string;

  beforeAll(async () => {
    const r = await newReview("Form edit campo");
    client = r.client;
    reviewId = r.reviewId;
    await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
    const { data } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Ano",
      p_type: "text",
      p_options: null,
    });
    fieldId = data.id;
  });

  it("atualiza nome/tipo e grava before/after", async () => {
    const { data, error } = await client.rpc("update_extraction_field", {
      p_field_id: fieldId,
      p_name: "Ano de publicação",
      p_type: "number",
      p_options: null,
    });
    expect(error).toBeNull();
    expect(data.name).toBe("Ano de publicação");
    expect(data.type).toBe("number");

    const svc = serviceClient();
    const { data: audit } = await svc
      .from("audit_entry")
      .select("before, after")
      .eq("review_id", reviewId)
      .eq("action", "update_extraction_field")
      .single();
    expect((audit!.before as { name: string }).name).toBe("Ano");
    expect((audit!.after as { name: string }).name).toBe("Ano de publicação");
  });

  it("rejeita virar select sem options", async () => {
    const { error } = await client.rpc("update_extraction_field", {
      p_field_id: fieldId,
      p_name: "Ano de publicação",
      p_type: "select",
      p_options: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/options/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extraction-form.test.ts`
Expected: FAIL — `function public.update_extraction_field(...) does not exist`.

- [ ] **Step 3: Adicionar a RPC à migration**

Append em `supabase/migrations/0014_extraction_form.sql`:

```sql
-- ============================================================
-- RPC: update_extraction_field — valida, atualiza, audita before/after.
-- ============================================================
create or replace function public.update_extraction_field(
  p_field_id uuid,
  p_name text,
  p_type extraction_field_type,
  p_options jsonb
)
returns public.extraction_field
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.extraction_field;
  v_after public.extraction_field;
  v_options jsonb;
begin
  select * into v_before from public.extraction_field where id = p_field_id;
  if not found then
    raise exception 'field not found';
  end if;
  if not public.is_review_member(v_before.review_id) then
    raise exception 'not a member';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'name required';
  end if;

  if p_type = 'select' then
    if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) = 0 then
      raise exception 'select requires non-empty options';
    end if;
    v_options := p_options;
  else
    v_options := null;
  end if;

  update public.extraction_field
     set name = btrim(p_name), type = p_type, options = v_options, updated_at = now()
   where id = p_field_id
   returning * into v_after;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (v_before.review_id, 'human', auth.uid(), 'update_extraction_field', 'extraction_field',
          p_field_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

grant execute on function public.update_extraction_field(uuid, text, extraction_field_type, jsonb) to authenticated;
```

- [ ] **Step 4: Aplicar e ver passar**

Run:
```bash
supabase db reset
npm run gen:types
npx vitest run tests/integration/extraction-form.test.ts
```
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_extraction_form.sql src/types/database.ts tests/integration/extraction-form.test.ts
git commit -m "feat(002-f3): update_extraction_field RPC + audit before/after (US2/FR-010)"
```

---

## Task 5: RPC `remove_extraction_field` — soft-delete + audit

**Files:**
- Modify: `supabase/migrations/0014_extraction_form.sql`
- Test: `tests/integration/extraction-form.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Append em `tests/integration/extraction-form.test.ts`:

```ts
describe("remove_extraction_field — soft-delete (não apaga linha), audita", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let fieldId: string;

  beforeAll(async () => {
    const r = await newReview("Form remove campo");
    client = r.client;
    reviewId = r.reviewId;
    await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
    const { data } = await client.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Campo temporário",
      p_type: "text",
      p_options: null,
    });
    fieldId = data.id;
  });

  it("marca is_active=false mantendo a linha (não apaga silenciosamente) e audita", async () => {
    const { data, error } = await client.rpc("remove_extraction_field", { p_field_id: fieldId });
    expect(error).toBeNull();
    expect(data.is_active).toBe(false);

    const svc = serviceClient();
    const { data: row } = await svc
      .from("extraction_field")
      .select("id, is_active")
      .eq("id", fieldId)
      .single();
    expect(row).not.toBeNull();          // linha preservada
    expect(row!.is_active).toBe(false);

    const { data: audit } = await svc
      .from("audit_entry")
      .select("before, after")
      .eq("review_id", reviewId)
      .eq("action", "remove_extraction_field")
      .single();
    expect((audit!.before as { is_active: boolean }).is_active).toBe(true);
    expect((audit!.after as { is_active: boolean }).is_active).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extraction-form.test.ts`
Expected: FAIL — `function public.remove_extraction_field(uuid) does not exist`.

- [ ] **Step 3: Adicionar a RPC à migration**

Append em `supabase/migrations/0014_extraction_form.sql`:

```sql
-- ============================================================
-- RPC: remove_extraction_field — soft-delete (is_active=false), audita. NUNCA DELETE
-- (forward-safe: extraction_value chega na Fatia 4; nada é apagado silenciosamente).
-- ============================================================
create or replace function public.remove_extraction_field(p_field_id uuid)
returns public.extraction_field
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.extraction_field;
  v_after public.extraction_field;
begin
  select * into v_before from public.extraction_field where id = p_field_id;
  if not found then
    raise exception 'field not found';
  end if;
  if not public.is_review_member(v_before.review_id) then
    raise exception 'not a member';
  end if;
  if not v_before.is_active then
    return v_before;  -- idempotente
  end if;

  update public.extraction_field
     set is_active = false, updated_at = now()
   where id = p_field_id
   returning * into v_after;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (v_before.review_id, 'human', auth.uid(), 'remove_extraction_field', 'extraction_field',
          p_field_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

grant execute on function public.remove_extraction_field(uuid) to authenticated;
```

- [ ] **Step 4: Aplicar e ver passar**

Run:
```bash
supabase db reset
npm run gen:types
npx vitest run tests/integration/extraction-form.test.ts
```
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_extraction_form.sql src/types/database.ts tests/integration/extraction-form.test.ts
git commit -m "feat(002-f3): remove_extraction_field RPC soft-delete + audit (US2/FR-010)"
```

---

## Task 6: RPC `reorder_extraction_fields` — reescreve `sort_order`, audita

**Files:**
- Modify: `supabase/migrations/0014_extraction_form.sql`
- Test: `tests/integration/extraction-form.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Append em `tests/integration/extraction-form.test.ts`:

```ts
describe("reorder_extraction_fields — reescreve sort_order pela ordem do array", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let aId: string;
  let bId: string;

  beforeAll(async () => {
    const r = await newReview("Form reorder");
    client = r.client;
    reviewId = r.reviewId;
    await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
    aId = (await client.rpc("add_extraction_field", {
      p_review_id: reviewId, p_name: "Primeiro", p_type: "text", p_options: null,
    })).data.id;
    bId = (await client.rpc("add_extraction_field", {
      p_review_id: reviewId, p_name: "Segundo", p_type: "text", p_options: null,
    })).data.id;
  });

  it("inverte a ordem e audita", async () => {
    const { error } = await client.rpc("reorder_extraction_fields", {
      p_review_id: reviewId,
      p_field_ids: [bId, aId],
    });
    expect(error).toBeNull();

    const svc = serviceClient();
    const { data: rows } = await svc
      .from("extraction_field")
      .select("id, sort_order")
      .eq("review_id", reviewId)
      .order("sort_order", { ascending: true });
    expect(rows!.map((r) => r.id)).toEqual([bId, aId]);

    const { data: audit } = await svc
      .from("audit_entry")
      .select("action")
      .eq("review_id", reviewId)
      .eq("action", "reorder_extraction_fields");
    expect(audit!.length).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extraction-form.test.ts`
Expected: FAIL — `function public.reorder_extraction_fields(uuid, uuid[]) does not exist`.

- [ ] **Step 3: Adicionar a RPC à migration**

Append em `supabase/migrations/0014_extraction_form.sql`:

```sql
-- ============================================================
-- RPC: reorder_extraction_fields — sort_order = posição no array; audita uma vez.
-- ============================================================
create or replace function public.reorder_extraction_fields(p_review_id uuid, p_field_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  update public.extraction_field f
     set sort_order = ord.pos, updated_at = now()
    from (
      select id, pos
      from unnest(p_field_ids) with ordinality as t(id, pos)
    ) ord
   where f.id = ord.id and f.review_id = p_review_id;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'reorder_extraction_fields', 'extraction_form', null,
          null, jsonb_build_object('order', to_jsonb(p_field_ids)));
end;
$$;

grant execute on function public.reorder_extraction_fields(uuid, uuid[]) to authenticated;
```

- [ ] **Step 4: Aplicar e ver passar**

Run:
```bash
supabase db reset
npm run gen:types
npx vitest run tests/integration/extraction-form.test.ts
```
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_extraction_form.sql src/types/database.ts tests/integration/extraction-form.test.ts
git commit -m "feat(002-f3): reorder_extraction_fields RPC + audit (US2/FR-009)"
```

---

## Task 7: Camada de leitura — `src/lib/extraction/queries.ts`

**Files:**
- Create: `src/lib/extraction/queries.ts`
- Test: `tests/integration/extraction-form.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Append em `tests/integration/extraction-form.test.ts` (o import vai no topo do arquivo, junto aos demais):

```ts
import { getExtractionForm, listExtractionFields } from "@/lib/extraction/queries";

describe("queries — getExtractionForm + listExtractionFields (só ativos, ordenados)", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let keepId: string;
  let dropId: string;

  beforeAll(async () => {
    const r = await newReview("Form queries");
    client = r.client;
    reviewId = r.reviewId;
    await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
    keepId = (await client.rpc("add_extraction_field", {
      p_review_id: reviewId, p_name: "Mantido", p_type: "text", p_options: null,
    })).data.id;
    dropId = (await client.rpc("add_extraction_field", {
      p_review_id: reviewId, p_name: "Removido", p_type: "text", p_options: null,
    })).data.id;
    await client.rpc("remove_extraction_field", { p_field_id: dropId });
  });

  it("retorna o form 1:1 e só os campos ativos, em ordem", async () => {
    const svc = serviceClient();
    const form = await getExtractionForm({ supabase: svc }, reviewId);
    expect(form).not.toBeNull();

    const fields = await listExtractionFields({ supabase: svc }, reviewId);
    expect(fields.map((f) => f.id)).toEqual([keepId]);
    expect(fields[0].name).toBe("Mantido");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extraction-form.test.ts`
Expected: FAIL — não há módulo `@/lib/extraction/queries`.

- [ ] **Step 3: Implementar as queries**

Create `src/lib/extraction/queries.ts` (espelha `src/lib/documents/queries.ts` — deps-injected, testável):

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExtractionFormRow {
  id: string;
  review_id: string;
}

export type ExtractionFieldType = "text" | "number" | "date" | "boolean" | "select";

export interface ExtractionFieldRow {
  id: string;
  name: string;
  type: ExtractionFieldType;
  options: string[] | null;
  sort_order: number;
}

/** Formulário 1:1 da Revisão (null se ainda não criado). RLS escopa por membro. */
export async function getExtractionForm(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<ExtractionFormRow | null> {
  const { data, error } = await deps.supabase
    .from("extraction_form")
    .select("id, review_id")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ExtractionFormRow | null) ?? null;
}

/** Campos ativos do formulário, na ordem de exibição (FR-009). */
export async function listExtractionFields(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<ExtractionFieldRow[]> {
  const { data, error } = await deps.supabase
    .from("extraction_field")
    .select("id, name, type, options, sort_order")
    .eq("review_id", reviewId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExtractionFieldRow[];
}
```

- [ ] **Step 4: Rodar e ver passar + type-check**

Run:
```bash
npx vitest run tests/integration/extraction-form.test.ts
npx tsc --noEmit
```
Expected: PASS; 0 erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction/queries.ts tests/integration/extraction-form.test.ts
git commit -m "feat(002-f3): extraction queries getExtractionForm + listExtractionFields (US2)"
```

---

## Task 8: Validação Zod + Server Actions

**Files:**
- Create: `src/lib/extraction/schema.ts`
- Create: `app/reviews/[reviewId]/extraction/actions.ts`
- Test: `tests/unit/extraction/schema.test.ts`

- [ ] **Step 1: Escrever o teste do schema que falha**

Create `tests/unit/extraction/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractionFieldInputSchema } from "@/lib/extraction/schema";

describe("extractionFieldInputSchema", () => {
  it("aceita um campo text válido", () => {
    const r = extractionFieldInputSchema.safeParse({ name: "Ano", type: "text" });
    expect(r.success).toBe(true);
  });

  it("rejeita name vazio", () => {
    const r = extractionFieldInputSchema.safeParse({ name: "  ", type: "text" });
    expect(r.success).toBe(false);
  });

  it("rejeita select sem options", () => {
    const r = extractionFieldInputSchema.safeParse({ name: "Desenho", type: "select" });
    expect(r.success).toBe(false);
  });

  it("rejeita select com options vazio", () => {
    const r = extractionFieldInputSchema.safeParse({ name: "Desenho", type: "select", options: [] });
    expect(r.success).toBe(false);
  });

  it("aceita select com options", () => {
    const r = extractionFieldInputSchema.safeParse({
      name: "Desenho", type: "select", options: ["RCT", "Coorte"],
    });
    expect(r.success).toBe(true);
  });

  it("rejeita tipo desconhecido", () => {
    const r = extractionFieldInputSchema.safeParse({ name: "X", type: "currency" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/extraction/schema.test.ts`
Expected: FAIL — não há módulo `@/lib/extraction/schema`.

- [ ] **Step 3: Implementar o schema**

Create `src/lib/extraction/schema.ts`:

```ts
import { z } from "zod";

export const FIELD_TYPES = ["text", "number", "date", "boolean", "select"] as const;
export type ExtractionFieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<ExtractionFieldType, string> = {
  text: "Texto",
  number: "Número",
  date: "Data",
  boolean: "Booleano",
  select: "Escolha de lista",
};

/** Entrada de um campo no builder. select ⇒ options não-vazio (FR-009). */
export const extractionFieldInputSchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome para o campo."),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1)).optional(),
  })
  .refine((v) => v.type !== "select" || (v.options !== undefined && v.options.length > 0), {
    message: "Campos de escolha exigem ao menos uma opção.",
    path: ["options"],
  });

export type ExtractionFieldInput = z.infer<typeof extractionFieldInputSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/extraction/schema.test.ts`
Expected: todos PASS.

- [ ] **Step 5: Implementar as Server Actions**

Create `app/reviews/[reviewId]/extraction/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractionFieldInputSchema } from "@/lib/extraction/schema";
import type { ExtractionFieldType } from "@/lib/extraction/schema";

async function requireMember(reviewId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase.rpc("is_review_member", { p_review_id: reviewId });
  if (error || !data) throw new Error("not a member");
  return { supabase };
}

function revalidate(reviewId: string) {
  revalidatePath(`/reviews/${reviewId}/extraction`);
}

export async function ensureExtractionForm(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const { data, error } = await supabase.rpc("ensure_extraction_form", { p_review_id: reviewId });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const, formId: data.id as string };
}

export async function addExtractionField(
  reviewId: string,
  input: { name: string; type: ExtractionFieldType; options?: string[] },
) {
  const parsed = extractionFieldInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Campo inválido." };
  }
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("add_extraction_field", {
    p_review_id: reviewId,
    p_name: parsed.data.name,
    p_type: parsed.data.type,
    p_options: parsed.data.type === "select" ? parsed.data.options! : null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

export async function updateExtractionField(
  reviewId: string,
  fieldId: string,
  input: { name: string; type: ExtractionFieldType; options?: string[] },
) {
  const parsed = extractionFieldInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Campo inválido." };
  }
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("update_extraction_field", {
    p_field_id: fieldId,
    p_name: parsed.data.name,
    p_type: parsed.data.type,
    p_options: parsed.data.type === "select" ? parsed.data.options! : null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

export async function removeExtractionField(reviewId: string, fieldId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("remove_extraction_field", { p_field_id: fieldId });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}

export async function reorderExtractionFields(reviewId: string, fieldIds: string[]) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("reorder_extraction_fields", {
    p_review_id: reviewId,
    p_field_ids: fieldIds,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: 0 erros.

```bash
git add src/lib/extraction/schema.ts "app/reviews/[reviewId]/extraction/actions.ts" tests/unit/extraction/schema.test.ts
git commit -m "feat(002-f3): extraction Zod schema + Server Actions (US2/FR-009/010)"
```

---

## Task 9: UI — `ExtractionFormBuilder` + página da Extração

**Files:**
- Create: `src/components/extraction/ExtractionFormBuilder.tsx`
- Create: `app/reviews/[reviewId]/extraction/page.tsx`
- Test: `tests/unit/extraction/form-builder.test.tsx`

- [ ] **Step 1: Escrever o teste do componente que falha**

Create `tests/unit/extraction/form-builder.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtractionFormBuilder } from "@/components/extraction/ExtractionFormBuilder";
import type { ExtractionFieldRow } from "@/lib/extraction/queries";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const fields: ExtractionFieldRow[] = [
  { id: "f1", name: "Ano de publicação", type: "number", options: null, sort_order: 1 },
  { id: "f2", name: "Desenho do estudo", type: "select", options: ["RCT", "Coorte"], sort_order: 2 },
];

const noop = vi.fn().mockResolvedValue({ ok: true });

describe("ExtractionFormBuilder", () => {
  it("lista os campos em ordem com o rótulo do tipo em pt-BR", () => {
    render(
      <ExtractionFormBuilder
        reviewId="r1"
        fields={fields}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
        onReorder={noop}
      />,
    );
    expect(screen.getByText("Ano de publicação")).toBeInTheDocument();
    expect(screen.getByText("Desenho do estudo")).toBeInTheDocument();
    expect(screen.getByText(/Número/)).toBeInTheDocument();
    expect(screen.getByText(/Escolha de lista/)).toBeInTheDocument();
  });

  it("chama onRemove com o id ao remover um campo", () => {
    const onRemove = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ExtractionFormBuilder
        reviewId="r1"
        fields={fields}
        onAdd={noop}
        onUpdate={noop}
        onRemove={onRemove}
        onReorder={noop}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /remover/i })[0]);
    expect(onRemove).toHaveBeenCalledWith("r1", "f1");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/extraction/form-builder.test.tsx`
Expected: FAIL — não há módulo `@/components/extraction/ExtractionFormBuilder`.

- [ ] **Step 3: Implementar o componente**

Create `src/components/extraction/ExtractionFormBuilder.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type ExtractionFieldType,
} from "@/lib/extraction/schema";
import type { ExtractionFieldRow } from "@/lib/extraction/queries";

type ActionResult = { ok: true } | { ok: false; error: string };

interface Props {
  reviewId: string;
  fields: ExtractionFieldRow[];
  onAdd: (reviewId: string, input: { name: string; type: ExtractionFieldType; options?: string[] }) => Promise<ActionResult>;
  onUpdate: (reviewId: string, fieldId: string, input: { name: string; type: ExtractionFieldType; options?: string[] }) => Promise<ActionResult>;
  onRemove: (reviewId: string, fieldId: string) => Promise<ActionResult>;
  onReorder: (reviewId: string, fieldIds: string[]) => Promise<ActionResult>;
}

export function ExtractionFormBuilder({ reviewId, fields, onAdd, onUpdate, onRemove, onReorder }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<ExtractionFieldType>("text");
  const [optionsText, setOptionsText] = useState("");

  // onUpdate é exposto para edição inline numa iteração futura; mantido no contrato
  // para a Fatia 4 (re-extração) sem alterar a assinatura do builder.
  void onUpdate;

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleAdd() {
    const options =
      type === "select"
        ? optionsText.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
    run(async () => {
      const res = await onAdd(reviewId, { name, type, options });
      if (res.ok) {
        setName("");
        setType("text");
        setOptionsText("");
      }
      return res;
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const ids = fields.map((f) => f.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => onReorder(reviewId, ids));
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Formulário de extração
        </h1>
        <p className="text-sm text-zinc-500">
          Monte os campos que a IA preencherá por estudo. Um formulário por revisão.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {fields.length === 0 && (
          <li className="px-4 py-6 text-sm text-zinc-500">Nenhum campo ainda.</li>
        )}
        {fields.map((f, i) => (
          <li key={f.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="Mover para cima"
                disabled={pending || i === 0}
                onClick={() => move(i, -1)}
                className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Mover para baixo"
                disabled={pending || i === fields.length - 1}
                onClick={() => move(i, 1)}
                className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
              >
                ↓
              </button>
            </div>
            <div className="flex-1">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{f.name}</p>
              <p className="text-xs text-zinc-500">
                {FIELD_TYPE_LABELS[f.type]}
                {f.type === "select" && f.options ? ` · ${f.options.join(", ")}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => onRemove(reviewId, f.id))}
              className="text-sm text-red-600 hover:underline disabled:opacity-40"
            >
              Remover
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Novo campo</h2>
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Nome do campo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do campo"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:bg-zinc-900"
          />
          <select
            aria-label="Tipo do campo"
            value={type}
            onChange={(e) => setType(e.target.value as ExtractionFieldType)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:bg-zinc-900"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {type === "select" && (
          <input
            aria-label="Opções (separadas por vírgula)"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="Opções separadas por vírgula (ex.: RCT, Coorte)"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:bg-zinc-900"
          />
        )}
        <button
          type="button"
          disabled={pending}
          onClick={handleAdd}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Adicionar campo
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/extraction/form-builder.test.tsx`
Expected: ambos PASS.

- [ ] **Step 5: Implementar a página (Server Component)**

Create `app/reviews/[reviewId]/extraction/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { listExtractionFields } from "@/lib/extraction/queries";
import { ExtractionFormBuilder } from "@/components/extraction/ExtractionFormBuilder";
import {
  ensureExtractionForm,
  addExtractionField,
  updateExtractionField,
  removeExtractionField,
  reorderExtractionFields,
} from "./actions";

export default async function ExtractionPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  // garante o form 1:1 antes de listar (idempotente, auditado só na criação)
  await ensureExtractionForm(reviewId);
  const supabase = await createClient();
  const fields = await listExtractionFields({ supabase }, reviewId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <ExtractionFormBuilder
        reviewId={reviewId}
        fields={fields}
        onAdd={addExtractionField}
        onUpdate={updateExtractionField}
        onRemove={removeExtractionField}
        onReorder={reorderExtractionFields}
      />
    </div>
  );
}
```

- [ ] **Step 6: Type-check + lint + commit**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: 0 erros, sem warnings.

```bash
git add src/components/extraction/ExtractionFormBuilder.tsx "app/reviews/[reviewId]/extraction/page.tsx" tests/unit/extraction/form-builder.test.tsx
git commit -m "feat(002-f3): ExtractionFormBuilder + página da Extração (US2/FR-009/010)"
```

---

## Task 10: Isolamento — RLS cross-review

**Files:**
- Create: `tests/integration/rls.extraction.test.ts`

- [ ] **Step 1: Escrever o teste**

Create `tests/integration/rls.extraction.test.ts` (espelha `rls.documents.test.ts`):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";

describe("RLS extraction_form/field — isolamento por Revisão (SC-011)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`xrls_owner_${s}@example.com`, "senha-teste-123")).client;
    intruder = (await signUpUser(`xrls_intr_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Revisão privada" });
    reviewId = review.id;
    await owner.rpc("ensure_extraction_form", { p_review_id: reviewId });
    await owner.rpc("add_extraction_field", {
      p_review_id: reviewId, p_name: "Privado", p_type: "text", p_options: null,
    });
  });

  it("não-membro não enxerga o formulário nem os campos", async () => {
    const form = await intruder.from("extraction_form").select("id").eq("review_id", reviewId);
    expect(form.data).toEqual([]);
    const fields = await intruder.from("extraction_field").select("id").eq("review_id", reviewId);
    expect(fields.data).toEqual([]);
  });

  it("RPC de não-membro levanta 'not a member'", async () => {
    const { error } = await intruder.rpc("add_extraction_field", {
      p_review_id: reviewId, p_name: "Intruso", p_type: "text", p_options: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not a member/i);
  });
});
```

- [ ] **Step 2: Rodar e ver passar**

Run: `npx vitest run tests/integration/rls.extraction.test.ts`
Expected: ambos PASS (RLS + membership já implementados nas Tasks 1-6).

- [ ] **Step 3: Suíte completa + portões (CHECKPOINT 3)**

Run:
```bash
npx vitest run
npm run lint
npx tsc --noEmit
```
Expected: toda a suíte verde (baseline da Fatia 2 era 62 arquivos / 263 testes; a Fatia 3 adiciona `extraction-form`, `rls.extraction`, `schema`, `form-builder`); 0 warnings de lint; 0 erros de tipo.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/rls.extraction.test.ts
git commit -m "test(002-f3): RLS isolamento cross-review do formulário de extração (SC-011)"
```

---

## Self-Review (cobertura da spec)

| Requisito | Onde |
|---|---|
| **FR-009** campos tipados (text/number/date/boolean/select), nome, ordenação | enum `extraction_field_type` + `add_extraction_field` + `reorder_extraction_fields` (Tasks 1,3,6); builder (Task 9) |
| **FR-010** editar e remover campos, mudança registrada | `update_extraction_field` + `remove_extraction_field` (soft-delete) + `audit_entry` (Tasks 4,5) |
| **FR-011** **um único** form por Revisão; engine genérica reaproveitável p/ viés/CERQual (não implementados) | `extraction_form.review_id unique` + `ensure_extraction_form` (Tasks 1,2); engine sem nada AI-específico |
| **FR-029** "configurar formulário" na trilha append-only (ator/timestamp/antes-depois) | toda RPC grava `audit_entry` `human`+`auth.uid()`+before/after (Tasks 2-6) |
| **Edge: remover/editar não apaga `extraction_value` validado** | soft-delete `is_active` (decisão 2); seam para a FK da Fatia 4 (Task 5) |
| **`select` exige opções; `name` não-vazio** | CHECK no schema (Task 1) + `raise` nas RPCs (Tasks 3,4) + Zod (Task 8) |
| **SC-011 isolamento por Revisão** | RLS `select` por membro + membership nas RPCs; teste cross-review (Task 10) |
| **pt-BR na UI** | rótulos `FIELD_TYPE_LABELS` + textos do builder (Tasks 8,9) |

**Não-regressão (Princípio V):** F3 só **adiciona** (migração 0014 aditiva; novo módulo `extraction/`; nova rota `extraction/`). **Não** toca workbench/triagem/`screening`/`import`, **não** altera `phases.ts` (o `PhaseKey` "Extração" é da Fatia 4), **não** importa IA/embeddings/job. Suíte do Marco 1 + Fatias 1-2 permanece verde.

**Placeholder scan:** nenhum passo usa "TBD/TODO/etc." — todo SQL, TS e teste estão completos.

**Type consistency:** `extraction_field_type`/`ExtractionFieldType`, `ExtractionFieldRow`, `ExtractionFieldInput`, e as assinaturas das RPCs (`add_extraction_field(uuid,text,extraction_field_type,jsonb)`, `reorder_extraction_fields(uuid,uuid[])`) são idênticas entre schema, queries, actions, componente e testes.

---

## Regime / CHECKPOINT 3 (lembrete do contrato — CLAUDE.md §5)

Ao fim da Task 10, **PARAR**. Apresentar ao desenvolvedor: branch `build/002-marco2-coracao-ai-first/3-formulario-extracao`, o diff, e a evidência dos portões (`npx vitest run` + `npm run lint` + `npx tsc --noEmit`). **Aguardar o merge manual.** Não iniciar a Fatia 4 antes da confirmação. Nunca `merge`/`push` para a feature ou `main`.
