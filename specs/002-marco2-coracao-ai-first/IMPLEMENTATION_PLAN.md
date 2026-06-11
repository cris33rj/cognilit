# Fatia 4 — Extração por IA: grounding + proveniência + validação humana (US3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sobre um estudo (`record` com `corpus_state='included_ft'`) que tem PDF processado (`text_layer`), o pesquisador aciona a **extração por IA**: o `LLMProvider` preenche os campos do formulário (Fatia 3) como **sugestões** com trecho-fonte+página, "não encontrado" 1ª classe e campos inferidos marcados; o humano **aceita/edita/rejeita**; a IA nunca finaliza; re-extração encosta sem sobrescrever o validado.

**Architecture:** Espelha o caminho de IA do Marco 1 (screening) — **server-side Node**, provider injetado (A1). A escrita das sugestões de IA usa o **client service-role** (admin) que bypassa RLS (como `screening/worker.ts` e `text_layer`); a **ratificação humana** passa por **RPC `security definer` auditada** com `auth.uid()` (como as RPCs da Fatia 3). Sem job/lote nesta fatia (isso é a Fatia 5): a extração é **por estudo (single)**, disparada por Server Action. Reusa `src/components/ai/*` (FR-020). A fase "Extração" entra no trilho (`phases.ts`) como fase pós-triagem.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), Supabase (Postgres+RLS, RPC security-definer), `@anthropic-ai/sdk` via abstração `LLMProvider`, Vitest (unit + integration que batem direto no DB), Testing Library.

---

## Decisões de design (locked — não reabrir durante execução)

1. **AI escreve via service-role; humano via RPC auditada.** `runExtractionForRecord(admin, provider, …)` insere `ai_suggestion` + `extraction_value(state=pending|inferred)` com o client admin (bypassa RLS, espelha `screening/worker.ts`). A ratificação (`ratify_extraction_value`) é RPC `security definer` com `auth.uid()` + `audit_entry` (espelha `update_extraction_field`). RLS de `extraction_value` concede **só `select`** a membros.
2. **`extraction_value` é o âncora por sugestão.** Cada `ExtractedField` gera **um** `extraction_value` (estado nasce `pending`/`inferred`) ligado a **uma** `ai_suggestion` (`target_kind='extraction'`, `target_id = extraction_value.id`). `state` reusa o enum `suggestion_state` (não criar enum novo).
3. **Re-extração (FR-019a/Q4):** uma nova execução cria novas linhas `pending`/`inferred`. Linhas anteriores **ainda não ratificadas** (`pending`/`inferred`) são aposentadas (saem da UI). Linhas **validadas** (`accepted`/`edited`/`rejected`) **nunca** são tocadas — `final_value` permanece intacto. "Valor atual validado" de `(record,field)` = linha mais recente em `accepted`/`edited`.
4. **Sem `ai_usage` nesta fatia.** Contabilidade de consumo (FR-023) e o `job_type='ai_extraction_batch'` são da **Fatia 5**. F4 não enfileira job nem grava `ai_usage`.
5. **`extractFields` não consome embeddings (US3⟂US5/Q1).** Lê `text_layer` direto, concatenada e com `pageIndex` para ancorar span→página. Nenhum import de `embedding_chunk`/Voyage.
6. **Grounding resolvido no lib.** O provider devolve `grounding.page` + `source_span`; `runExtractionForRecord` mapeia `page → {text_layer_id, origin}` a partir das camadas carregadas (o provider não conhece IDs do banco).

---

## File Structure

**Criar:**
- `supabase/migrations/0015_extraction_value.sql` — `ALTER TYPE ai_target_kind ADD VALUE 'extraction'`; tabela `extraction_value` + RLS; RPC `ratify_extraction_value`.
- `src/lib/extraction/extract.ts` — `loadRecordText` + `runExtractionForRecord` (lib pura, deps-injetadas).
- `src/lib/extraction/run.ts` — `runExtractionForRecordWith(admin, provider, reviewId, recordId)` (wrapper, espelha `screening/run.ts`).
- `src/components/extraction/ExtractionRunner.tsx` — client: dispara extração + renderiza sugestões (reusa `components/ai/*`).
- `tests/unit/ai/extract-fields.test.ts` — `MockLLMProvider.extractFields` (provenance/not_found/inferred/sem-embeddings).
- `tests/unit/extraction/extraction-cost.test.ts` — `estimateExtractionCost`.
- `tests/unit/shell/phases-extraction.test.ts` — fase Extração no trilho.
- `tests/unit/extraction/extraction-runner.test.tsx` — componente.
- `tests/integration/extraction-value.test.ts` — migração + ratificação.
- `tests/integration/extract-record.test.ts` — `runExtractionForRecord` ponta-a-ponta (sugestão+valor+grounding) + queries.
- `tests/integration/rls.extraction-value.test.ts` — isolamento cross-review (SC-011).

**Modificar:**
- `src/lib/ai/llm/types.ts` — tipos de extração + `estimateCost` union.
- `src/lib/ai/llm/cost.ts` — `estimateExtractionCost`.
- `src/lib/ai/llm/mock.ts` — `extractFields` + `estimateCost` atualizado.
- `src/lib/ai/llm/anthropic.ts` — `extractFields` + `estimateCost` atualizado.
- `src/lib/extraction/queries.ts` — `listStudies` + `listExtractionValues`.
- `app/reviews/[reviewId]/extraction/actions.ts` — `runExtraction` + `ratifyExtractionValue`.
- `app/reviews/[reviewId]/extraction/page.tsx` — lista de estudos + `ExtractionRunner`.
- `src/lib/shell/phases.ts` — `PhaseKey` `extraction` + `loadPhaseStates`.

---

## Task 1: Migração 0015 — `extraction_value` + RLS + ALTER `ai_target_kind`

**Files:**
- Create: `supabase/migrations/0015_extraction_value.sql`
- Test: `tests/integration/extraction-value.test.ts`

- [ ] **Step 1: Escrever o teste de migração (falha)**

```ts
// tests/integration/extraction-value.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

async function newReviewWithStudy(title: string) {
  const { client } = await signUpUser(
    `xv_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await client.rpc("create_review", { p_title: title });
  if (error) throw new Error(error.message);
  const reviewId = review.id as string;
  const svc = serviceClient();
  const { data: rec, error: rErr } = await svc
    .from("record")
    .insert({ review_id: reviewId, corpus_state: "included_ft", metadata: { title: "Estudo X" } })
    .select("id")
    .single();
  if (rErr) throw new Error(rErr.message);
  await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
  const { data: field } = await client.rpc("add_extraction_field", {
    p_review_id: reviewId, p_name: "Amostra", p_type: "number", p_options: null,
  });
  return { client, reviewId, recordId: rec!.id as string, fieldId: field!.id as string };
}

describe("extraction_value — schema + RLS", () => {
  let ctx: Awaited<ReturnType<typeof newReviewWithStudy>>;
  beforeAll(async () => { ctx = await newReviewWithStudy("Valor de extração"); });

  it("membro lê extraction_value escrito por service-role", async () => {
    const svc = serviceClient();
    const { error: insErr } = await svc.from("extraction_value").insert({
      review_id: ctx.reviewId, record_id: ctx.recordId, field_id: ctx.fieldId, state: "pending",
    });
    expect(insErr).toBeNull();
    const { data, error } = await ctx.client
      .from("extraction_value").select("id, state").eq("review_id", ctx.reviewId);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0]!.state).toBe("pending");
  });

  it("CHECK: state accepted exige final_value não-nulo", async () => {
    const svc = serviceClient();
    const { error } = await svc.from("extraction_value").insert({
      review_id: ctx.reviewId, record_id: ctx.recordId, field_id: ctx.fieldId, state: "accepted",
    });
    expect(error).not.toBeNull(); // viola o CHECK
  });

  it("aceita target_kind='extraction' em ai_suggestion", async () => {
    const svc = serviceClient();
    const { error } = await svc.from("ai_suggestion").insert({
      review_id: ctx.reviewId, target_kind: "extraction", target_id: ctx.recordId,
      output: { value: 42, source_span: "n=42", page: 3 },
      provenance: { model: "m", version: "v", prompt_or_span: "p", timestamp: new Date().toISOString() },
      state: "pending", grounding: { text_layer_id: null, page: 3, source_span: "n=42", origin: "nativo" },
      not_found: false,
    });
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extraction-value.test.ts`
Expected: FAIL — relação `extraction_value` não existe / enum sem `extraction`.

- [ ] **Step 3: Escrever a migração**

```sql
-- supabase/migrations/0015_extraction_value.sql
-- ============================================================
-- Marco 2 / Fatia 4 — Extração por IA: valor extraído por estudo×campo.
-- A IA escreve ai_suggestion + extraction_value(pending/inferred) via service-role
-- (worker server-side, bypassa RLS). O humano ratifica via RPC security-definer
-- auditada (ratify_extraction_value). RLS concede só SELECT a membros.
-- data-model.md §extraction_value + §ai_suggestion(estendida) + máquina de estados.
-- ============================================================

-- target_kind ganha 'extraction' (aditivo). Usado em runtime, não nesta transação.
alter type ai_target_kind add value if not exists 'extraction';

-- ---------- extraction_value (record × field → valor humano + sugestão) ----------
create table public.extraction_value (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  record_id uuid not null references public.record (id) on delete cascade,
  field_id uuid not null references public.extraction_field (id) on delete cascade,
  ai_suggestion_id uuid references public.ai_suggestion (id) on delete set null,
  final_value jsonb,                                 -- valor humano após ratificação (FR-018)
  state suggestion_state not null default 'pending', -- reusa o enum do Marco 1
  superseded_by_id uuid references public.extraction_value (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- accepted/edited ⇒ final_value obrigatório (data-model §extraction_value)
  constraint extraction_value_final_ck check (
    state not in ('accepted', 'edited') or final_value is not null
  )
);
create index extraction_value_record_field_idx on public.extraction_value (record_id, field_id);
create index extraction_value_review_idx on public.extraction_value (review_id);

alter table public.extraction_value enable row level security;

-- Leitura por membros; escrita real é do worker service-role (IA) ou da RPC abaixo (humano).
create policy extraction_value_select_member on public.extraction_value
  for select using (public.is_review_member(review_id));
```

- [ ] **Step 4: Aplicar e ver passar**

Run: `npx supabase db reset` (aplica 0001–0015) e depois `npx vitest run tests/integration/extraction-value.test.ts`
Expected: os 3 testes passam. (Se `db reset` não estiver disponível no worktree, ver as notas de baseline no `COMPLETION-fatia-3.md`.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_extraction_value.sql tests/integration/extraction-value.test.ts
git commit -m "feat(002-f4): migration 0015 extraction_value + RLS + ai_target_kind=extraction (US3)"
```

---

## Task 2: RPC `ratify_extraction_value` (aceitar/editar/rejeitar, auditada)

**Files:**
- Modify: `supabase/migrations/0015_extraction_value.sql` (append)
- Test: `tests/integration/extraction-value.test.ts` (append)

- [ ] **Step 1: Escrever o teste (falha)**

```ts
// append em tests/integration/extraction-value.test.ts
describe("ratify_extraction_value — humano-no-laço, auditado", () => {
  let ctx: Awaited<ReturnType<typeof newReviewWithStudy>>;
  let valueId: string;
  beforeAll(async () => {
    ctx = await newReviewWithStudy("Ratificação");
    const svc = serviceClient();
    const { data } = await svc.from("extraction_value").insert({
      review_id: ctx.reviewId, record_id: ctx.recordId, field_id: ctx.fieldId, state: "pending",
    }).select("id").single();
    valueId = data!.id as string;
  });

  it("aceitar grava final_value, state=accepted e audit_entry", async () => {
    const { error } = await ctx.client.rpc("ratify_extraction_value", {
      p_value_id: valueId, p_state: "accepted", p_final_value: { value: 42 },
    });
    expect(error).toBeNull();
    const svc = serviceClient();
    const { data: row } = await svc.from("extraction_value").select("state, final_value").eq("id", valueId).single();
    expect(row!.state).toBe("accepted");
    expect(row!.final_value).toEqual({ value: 42 });
    const { data: audit } = await svc.from("audit_entry").select("action")
      .eq("entity_id", valueId).eq("action", "ratify_extraction_value");
    expect(audit!.length).toBeGreaterThan(0);
  });

  it("rejeitar não exige final_value", async () => {
    const svc = serviceClient();
    const { data } = await svc.from("extraction_value").insert({
      review_id: ctx.reviewId, record_id: ctx.recordId, field_id: ctx.fieldId, state: "pending",
    }).select("id").single();
    const { error } = await ctx.client.rpc("ratify_extraction_value", {
      p_value_id: data!.id, p_state: "rejected", p_final_value: null,
    });
    expect(error).toBeNull();
  });

  it("não-membro não ratifica", async () => {
    const { client: other } = await signUpUser(
      `other_${Date.now()}@example.com`, "senha-teste-123");
    const { error } = await other.rpc("ratify_extraction_value", {
      p_value_id: valueId, p_state: "accepted", p_final_value: { value: 1 },
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extraction-value.test.ts -t ratify`
Expected: FAIL — função `ratify_extraction_value` não existe.

- [ ] **Step 3: Adicionar a RPC à migração**

```sql
-- append em supabase/migrations/0015_extraction_value.sql
-- ============================================================
-- RPC: ratify_extraction_value — única via ao valor final (FR-019/§I).
-- p_state ∈ {accepted, edited, rejected}; accepted/edited exige final_value.
-- A IA nunca chama isto (ator 'human', auth.uid()). Audita before/after.
-- ============================================================
create or replace function public.ratify_extraction_value(
  p_value_id uuid,
  p_state suggestion_state,
  p_final_value jsonb
)
returns public.extraction_value
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.extraction_value;
  v_after public.extraction_value;
begin
  select * into v_before from public.extraction_value where id = p_value_id;
  if not found then
    raise exception 'extraction value not found';
  end if;
  if not public.is_review_member(v_before.review_id) then
    raise exception 'not a member';
  end if;
  if p_state not in ('accepted', 'edited', 'rejected') then
    raise exception 'invalid ratification state';
  end if;
  if p_state in ('accepted', 'edited') and p_final_value is null then
    raise exception 'final_value required for %', p_state;
  end if;

  update public.extraction_value
     set state = p_state,
         final_value = case when p_state = 'rejected' then null else p_final_value end,
         updated_at = now()
   where id = p_value_id
   returning * into v_after;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (v_before.review_id, 'human', auth.uid(), 'ratify_extraction_value', 'extraction_value',
          p_value_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;

grant execute on function public.ratify_extraction_value(uuid, suggestion_state, jsonb) to authenticated;
```

- [ ] **Step 4: Aplicar e ver passar**

Run: `npx supabase db reset && npx vitest run tests/integration/extraction-value.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_extraction_value.sql tests/integration/extraction-value.test.ts
git commit -m "feat(002-f4): ratify_extraction_value RPC (human-in-loop, audited) (US3/FR-018/019)"
```

---

## Task 3: Regenerar tipos do banco

**Files:**
- Modify: `src/types/database.ts` (gerado)

- [ ] **Step 1: Regenerar**

Run: `npm run gen:types`
Expected: `src/types/database.ts` passa a conter `extraction_value` e `ratify_extraction_value`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "chore(002-f4): regenerate database types (extraction_value)"
```

---

## Task 4: Tipos de extração no `LLMProvider` + `estimateCost` union

**Files:**
- Modify: `src/lib/ai/llm/types.ts`

- [ ] **Step 1: Adicionar os tipos e estender a interface**

```ts
// append/editar em src/lib/ai/llm/types.ts

export type ExtractionFieldType = "text" | "number" | "date" | "boolean" | "select";

export interface ExtractionFieldDef {
  id: string;
  name: string; // rótulo pt-BR
  type: ExtractionFieldType;
  options?: string[]; // quando type === 'select'
}

export interface ExtractedField {
  field_id: string;
  value: FactualValue<unknown>; // {value, source_span, page} | {value:null, reason:'not_found'}
  inferred: boolean; // true ⇒ state nasce 'inferred' (FR-014)
  grounding: {
    text_layer_id: string | null; // resolvido no lib (provider devolve null)
    page: number | null;
    source_span: string | null; // citado no idioma original (FR-015)
    origin: "nativo" | "ocr_ia" | null;
  };
}

export interface ExtractionResult {
  fields: ExtractedField[];
  provenance: Provenance; // OBRIGATÓRIO (FR-016/§II)
}
```

E estender a interface `LLMProvider` (dentro do `interface LLMProvider { … }`), logo após `ocrPage`:

```ts
  /** Preenche os campos do formulário a partir do TEXTO do documento (FR-012). pt-BR.
   *  documentText vem concatenada (chunking interno R6); NÃO usa RAG (Q1/§US3⟂US5). */
  extractFields(input: {
    fields: ExtractionFieldDef[];
    documentText: string;
    pageIndex?: { page: number; char_start: number; char_end: number }[];
  }): Promise<ExtractionResult>;
```

E trocar a assinatura de `estimateCost` para a união (FR-022, contrato `extraction.md`):

```ts
  /** Estimativa de custo ANTES de lote (FR-022, §VII/P5). */
  estimateCost(
    input:
      | { itemCount: number; kind: "ai_screening_batch" }
      | { itemCount: number; kind: "ai_extraction_batch"; fieldCount: number },
  ): Promise<CostEstimate>;
```

- [ ] **Step 2: Type-check (vai falhar nos implementadores — esperado)**

Run: `npx tsc --noEmit`
Expected: erros em `mock.ts` e `anthropic.ts` (não implementam `extractFields` / assinatura de `estimateCost`). Resolvidos nas Tasks 5–7.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/llm/types.ts
git commit -m "feat(002-f4): LLMProvider extraction types + estimateCost union (US3/contract)"
```

---

## Task 5: `estimateExtractionCost` + `estimateCost` do mock/anthropic

**Files:**
- Modify: `src/lib/ai/llm/cost.ts`
- Modify: `src/lib/ai/llm/mock.ts`
- Modify: `src/lib/ai/llm/anthropic.ts`
- Test: `tests/unit/extraction/extraction-cost.test.ts`

- [ ] **Step 1: Escrever o teste (falha)**

```ts
// tests/unit/extraction/extraction-cost.test.ts
import { describe, it, expect } from "vitest";
import { estimateExtractionCost } from "@/lib/ai/llm/cost";

describe("estimateExtractionCost", () => {
  it("escala com itens e campos", () => {
    const a = estimateExtractionCost(2, 3);
    expect(a.tokensEstimated).toBeGreaterThan(0);
    expect(a.cost.usd).toBeGreaterThan(0);
    const b = estimateExtractionCost(4, 3);
    expect(b.tokensEstimated).toBe(a.tokensEstimated * 2);
  });
  it("zero itens ⇒ zero", () => {
    expect(estimateExtractionCost(0, 5).tokensEstimated).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/extraction/extraction-cost.test.ts`
Expected: FAIL — `estimateExtractionCost` não existe.

- [ ] **Step 3: Implementar em cost.ts**

No topo de `cost.ts`, tornar a constante exportável (trocar `const USD_PER_1K_TOKENS` por `export const USD_PER_1K_TOKENS`). Depois adicionar ao fim:

```ts
// append em src/lib/ai/llm/cost.ts
const TOKENS_PER_FIELD = 250; // heurística (refinar na Fatia 5 com métricas reais)

/** Estimativa de custo de extração: itens (estudos) × campos. */
export function estimateExtractionCost(
  itemCount: number,
  fieldCount: number,
): CostEstimate {
  const items = Math.max(0, Math.trunc(itemCount));
  const fields = Math.max(0, Math.trunc(fieldCount));
  const tokensEstimated = items * fields * TOKENS_PER_FIELD;
  return {
    tokensEstimated,
    cost: { usd: (tokensEstimated / 1000) * USD_PER_1K_TOKENS },
  };
}
```

- [ ] **Step 4: Atualizar `estimateCost` do mock**

Em `src/lib/ai/llm/mock.ts`, trocar o método `estimateCost`:

```ts
  async estimateCost(
    input:
      | { itemCount: number; kind: "ai_screening_batch" }
      | { itemCount: number; kind: "ai_extraction_batch"; fieldCount: number },
  ): Promise<CostEstimate> {
    if (input.kind === "ai_extraction_batch") {
      return {
        tokensEstimated: input.itemCount * input.fieldCount * 250,
        cost: { usd: input.itemCount * input.fieldCount * 0.0006 },
      };
    }
    return {
      tokensEstimated: input.itemCount * 800,
      cost: { usd: input.itemCount * 0.002 },
    };
  }
```

- [ ] **Step 5: Atualizar `estimateCost` do anthropic**

Em `src/lib/ai/llm/anthropic.ts`, importar `estimateExtractionCost` e trocar o método:

```ts
import { estimateScreeningCost, estimateExtractionCost } from "./cost";
```

```ts
  async estimateCost(
    input:
      | { itemCount: number; kind: "ai_screening_batch" }
      | { itemCount: number; kind: "ai_extraction_batch"; fieldCount: number },
  ): Promise<CostEstimate> {
    if (input.kind === "ai_extraction_batch") {
      return estimateExtractionCost(input.itemCount, input.fieldCount);
    }
    return estimateScreeningCost(input.itemCount);
  }
```

- [ ] **Step 6: Rodar o teste**

Run: `npx vitest run tests/unit/extraction/extraction-cost.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/llm/cost.ts src/lib/ai/llm/mock.ts src/lib/ai/llm/anthropic.ts tests/unit/extraction/extraction-cost.test.ts
git commit -m "feat(002-f4): estimateExtractionCost + estimateCost ai_extraction_batch kind (US4 contract/FR-022)"
```

---

## Task 6: `MockLLMProvider.extractFields`

**Files:**
- Modify: `src/lib/ai/llm/mock.ts`
- Test: `tests/unit/ai/extract-fields.test.ts`

- [ ] **Step 1: Escrever os testes (falha)**

```ts
// tests/unit/ai/extract-fields.test.ts
import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import type { ExtractionFieldDef } from "@/lib/ai/llm/types";

const fields: ExtractionFieldDef[] = [
  { id: "f-amostra", name: "Amostra", type: "number" },
  { id: "f-ausente", name: "Campo Ausente", type: "text" },
  { id: "f-desenho", name: "Desenho do estudo", type: "select", options: ["RCT", "Coorte"] },
];

describe("MockLLMProvider.extractFields (FR-012..016)", () => {
  it("proveniência presente em 100% das saídas", async () => {
    const r = await new MockLLMProvider().extractFields({
      fields, documentText: "Amostra de 42 participantes. RCT duplo-cego.",
    });
    expect(r.provenance).toHaveProperty("model");
    expect(r.provenance).toHaveProperty("timestamp");
    expect(r.fields).toHaveLength(3);
  });

  it("campo ausente ⇒ value null + reason not_found (FR-013)", async () => {
    const r = await new MockLLMProvider().extractFields({ fields, documentText: "x" });
    const ausente = r.fields.find((f) => f.field_id === "f-ausente")!;
    expect(ausente.value.value).toBeNull();
    expect(ausente.value.reason).toBe("not_found");
  });

  it("campo inferido ⇒ inferred=true (FR-014)", async () => {
    const r = await new MockLLMProvider().extractFields({ fields, documentText: "x" });
    const desenho = r.fields.find((f) => f.field_id === "f-desenho")!;
    expect(desenho.inferred).toBe(true);
  });

  it("campo ancorado expõe source_span + page (FR-012)", async () => {
    const r = await new MockLLMProvider().extractFields({ fields, documentText: "x" });
    const amostra = r.fields.find((f) => f.field_id === "f-amostra")!;
    expect(amostra.value.value).not.toBeNull();
    expect(amostra.grounding.page).not.toBeNull();
    expect(amostra.grounding.source_span).toBeTypeOf("string");
  });

  it("determinístico e sem rede (espelha mock.ts)", async () => {
    const a = await new MockLLMProvider().extractFields({ fields, documentText: "x" });
    const b = await new MockLLMProvider().extractFields({ fields, documentText: "x" });
    expect(a.fields.map((f) => f.value.value)).toEqual(b.fields.map((f) => f.value.value));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/ai/extract-fields.test.ts`
Expected: FAIL — `extractFields` não existe no mock.

- [ ] **Step 3: Implementar no mock**

Adicionar os novos tipos ao import existente no topo de `mock.ts` (`ExtractedField`, `ExtractionFieldDef`, `ExtractionResult`). E o método (dentro da classe):

```ts
  async extractFields(input: {
    fields: ExtractionFieldDef[];
    documentText: string;
    pageIndex?: { page: number; char_start: number; char_end: number }[];
  }): Promise<ExtractionResult> {
    // Determinístico: 'select' ⇒ inferido; nome contendo "ausente" ⇒ not_found;
    // demais ⇒ ancorado em página 1 com span simulado. Sem rede, pt-BR.
    const fields: ExtractedField[] = input.fields.map((f) => {
      const isAusente = /ausente/i.test(f.name);
      const isInferred = f.type === "select";
      if (isAusente) {
        return {
          field_id: f.id,
          value: { value: null, source_span: null, page: null, reason: "not_found" },
          inferred: false,
          grounding: { text_layer_id: null, page: null, source_span: null, origin: null },
        };
      }
      const span = `[trecho simulado p/ ${f.name}]`;
      return {
        field_id: f.id,
        value: { value: `valor de ${f.name}`, source_span: span, page: 1 },
        inferred: isInferred,
        grounding: { text_layer_id: null, page: 1, source_span: span, origin: "nativo" },
      };
    });
    return { fields, provenance: provenance("extract") };
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/ai/extract-fields.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/llm/mock.ts tests/unit/ai/extract-fields.test.ts
git commit -m "feat(002-f4): MockLLMProvider.extractFields (not_found/inferred/grounding) (US3/FR-012..016)"
```

---

## Task 7: `AnthropicProvider.extractFields`

**Files:**
- Modify: `src/lib/ai/llm/anthropic.ts`

> Sem teste de rede (espelha `ocrPage`, que também não tem unit do provider real — o contrato é coberto pelo mock). Implementação fiel ao contrato e ao `safeParse` existente.

- [ ] **Step 1: Adicionar os novos tipos ao import existente no topo de anthropic.ts**

Incluir `ExtractedField`, `ExtractionFieldDef`, `ExtractionResult` no bloco `import type { … } from "./types";` já existente.

- [ ] **Step 2: Implementar o método (dentro da classe `AnthropicProvider`)**

```ts
  async extractFields(input: {
    fields: ExtractionFieldDef[];
    documentText: string;
    pageIndex?: { page: number; char_start: number; char_end: number }[];
  }): Promise<ExtractionResult> {
    const fieldSpec = input.fields
      .map((f) => `- ${f.name} (id=${f.id}, tipo=${f.type}${f.options ? `, opções=${f.options.join("|")}` : ""})`)
      .join("\n");
    const prompt =
      `Extraia os campos abaixo SOMENTE a partir do texto do documento.\n` +
      `Para cada campo retorne um objeto: {"field_id","value","source_span","page","inferred"}.\n` +
      `Se o valor NÃO constar no texto, use value=null e source_span=null (não invente).\n` +
      `Marque inferred=true quando o valor for deduzido sem trecho literal.\n` +
      `O source_span deve ser citado no IDIOMA ORIGINAL do documento.\n\n` +
      `Campos:\n${fieldSpec}\n\nTexto:\n${input.documentText}\n\n` +
      `Retorne JSON {"fields":[...]}.`;
    const raw = await this.ask(
      "Você extrai dados de estudos para revisões sistemáticas; nunca inventa valores.",
      prompt,
    );
    const parsed = safeParse<{ fields: Array<Record<string, unknown>> }>(raw, { fields: [] });
    const byId = new Map(parsed.fields.map((r) => [String(r.field_id), r]));
    const fields: ExtractedField[] = input.fields.map((f) => {
      const r = byId.get(f.id);
      const value = r && r.value !== null && r.value !== undefined ? r.value : null;
      const page = r && typeof r.page === "number" ? r.page : null;
      const span = r && typeof r.source_span === "string" ? r.source_span : null;
      const inferred = !!(r && r.inferred === true);
      if (value === null) {
        return {
          field_id: f.id,
          value: { value: null, source_span: null, page: null, reason: "not_found" },
          inferred,
          grounding: { text_layer_id: null, page: null, source_span: null, origin: null },
        };
      }
      return {
        field_id: f.id,
        value: { value, source_span: span, page },
        inferred,
        grounding: { text_layer_id: null, page, source_span: span, origin: null },
      };
    });
    return {
      fields,
      provenance: { model: MODEL, version: MODEL, prompt_or_span: prompt, timestamp: nowIso() },
    };
  }
```

- [ ] **Step 3: Type-check (deve fechar 0 erros agora)**

Run: `npx tsc --noEmit`
Expected: 0 erros (Tasks 4–7 completam a interface).

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/llm/anthropic.ts
git commit -m "feat(002-f4): AnthropicProvider.extractFields (grounding/not_found via safeParse) (US3/FR-012)"
```

---

## Task 8: Lib de extração — `loadRecordText` + `runExtractionForRecord`

**Files:**
- Create: `src/lib/extraction/extract.ts`
- Create: `src/lib/extraction/run.ts`
- Test: `tests/integration/extract-record.test.ts`

- [ ] **Step 1: Escrever o teste de integração (falha)**

```ts
// tests/integration/extract-record.test.ts
import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { runExtractionForRecord } from "@/lib/extraction/extract";

async function setup() {
  const { client } = await signUpUser(
    `er_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`, "senha-teste-123");
  const { data: review } = await client.rpc("create_review", { p_title: "Extração record" });
  const reviewId = review!.id as string;
  const svc = serviceClient();
  const { data: rec } = await svc.from("record")
    .insert({ review_id: reviewId, corpus_state: "included_ft", metadata: { title: "Estudo" } })
    .select("id").single();
  const recordId = rec!.id as string;
  const { data: doc } = await svc.from("document").insert({
    review_id: reviewId, record_id: recordId, storage_path: `review/${reviewId}/record/${recordId}/d.pdf`,
    filename: "d.pdf", byte_size: 10, processing_status: "text_ready",
  }).select("id").single();
  await svc.from("text_layer").insert({
    review_id: reviewId, document_id: doc!.id, page: 1, char_start: 0, char_end: 30,
    content: "Amostra de 42 participantes.", origin: "nativo",
  });
  await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
  await client.rpc("add_extraction_field", { p_review_id: reviewId, p_name: "Amostra", p_type: "number", p_options: null });
  await client.rpc("add_extraction_field", { p_review_id: reviewId, p_name: "Campo Ausente", p_type: "text", p_options: null });
  return { client, reviewId, recordId, svc };
}

describe("runExtractionForRecord (US3)", () => {
  it("cria ai_suggestion + extraction_value por campo, com grounding resolvido", async () => {
    const { reviewId, recordId, svc } = await setup();
    const res = await runExtractionForRecord({ supabase: svc, provider: new MockLLMProvider() }, reviewId, recordId);
    expect(res.created).toBe(2);

    const { data: vals } = await svc.from("extraction_value")
      .select("id, state, ai_suggestion_id, field_id").eq("record_id", recordId);
    expect(vals!.length).toBe(2);
    expect(vals!.every((v) => v.ai_suggestion_id !== null)).toBe(true);

    const { data: sugg } = await svc.from("ai_suggestion")
      .select("grounding, not_found, target_kind").eq("review_id", reviewId).eq("target_kind", "extraction");
    expect(sugg!.length).toBe(2);
    const anchored = sugg!.find((s) => s.not_found === false)!;
    expect((anchored.grounding as { origin: string }).origin).toBe("nativo");
    expect((anchored.grounding as { text_layer_id: string | null }).text_layer_id).not.toBeNull();
  });

  it("re-extração: nova sugestão pending, final_value validado intacto (FR-019a)", async () => {
    const { client, reviewId, recordId, svc } = await setup();
    await runExtractionForRecord({ supabase: svc, provider: new MockLLMProvider() }, reviewId, recordId);
    const { data: first } = await svc.from("extraction_value")
      .select("id").eq("record_id", recordId).limit(1).single();
    await client.rpc("ratify_extraction_value", { p_value_id: first!.id, p_state: "accepted", p_final_value: { value: 42 } });

    await runExtractionForRecord({ supabase: svc, provider: new MockLLMProvider() }, reviewId, recordId);

    const { data: validated } = await svc.from("extraction_value")
      .select("final_value, state").eq("id", first!.id).single();
    expect(validated!.state).toBe("accepted");
    expect(validated!.final_value).toEqual({ value: 42 }); // intacto
    const { data: pendings } = await svc.from("extraction_value")
      .select("id").eq("record_id", recordId).eq("state", "pending");
    expect(pendings!.length).toBeGreaterThan(0); // nova sugestão pending viva
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extract-record.test.ts`
Expected: FAIL — módulo `@/lib/extraction/extract` não existe.

- [ ] **Step 3: Implementar `extract.ts`**

```ts
// src/lib/extraction/extract.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionFieldDef, LLMProvider } from "@/lib/ai/llm/types";

export interface ExtractionDeps {
  supabase: SupabaseClient; // service-role (bypassa RLS — escrita da IA)
  provider: LLMProvider;
}

interface LayerRow {
  id: string;
  page: number;
  char_start: number;
  char_end: number;
  content: string;
  origin: "nativo" | "ocr_ia";
}

/** Concatena as text_layer dos PDFs processados do estudo e indexa por página. */
export async function loadRecordText(
  supabase: SupabaseClient,
  reviewId: string,
  recordId: string,
): Promise<{
  documentText: string;
  pageIndex: { page: number; char_start: number; char_end: number }[];
  layerByPage: Map<number, { text_layer_id: string; origin: "nativo" | "ocr_ia" }>;
}> {
  const { data: docs, error: dErr } = await supabase
    .from("document")
    .select("id")
    .eq("review_id", reviewId)
    .eq("record_id", recordId)
    .in("processing_status", ["text_ready", "partial"]);
  if (dErr) throw new Error(dErr.message);
  const docIds = (docs ?? []).map((d) => (d as { id: string }).id);
  if (docIds.length === 0) {
    return { documentText: "", pageIndex: [], layerByPage: new Map() };
  }

  const { data: layers, error: lErr } = await supabase
    .from("text_layer")
    .select("id, page, char_start, char_end, content, origin")
    .in("document_id", docIds)
    .order("page", { ascending: true });
  if (lErr) throw new Error(lErr.message);

  let text = "";
  const pageIndex: { page: number; char_start: number; char_end: number }[] = [];
  const layerByPage = new Map<number, { text_layer_id: string; origin: "nativo" | "ocr_ia" }>();
  for (const l of (layers ?? []) as LayerRow[]) {
    const start = text.length;
    text += l.content + "\n";
    pageIndex.push({ page: l.page, char_start: start, char_end: text.length });
    if (!layerByPage.has(l.page)) {
      layerByPage.set(l.page, { text_layer_id: l.id, origin: l.origin });
    }
  }
  return { documentText: text, pageIndex, layerByPage };
}

/**
 * Extração por IA de um estudo (single, server-side — A1). Cria ai_suggestion
 * (target_kind='extraction') + extraction_value(pending/inferred) por campo.
 * Re-extração: aposenta pendentes anteriores (não ratificados); NUNCA toca o
 * validado (FR-019/019a). A IA não finaliza valor — só a RPC ratify_extraction_value.
 */
export async function runExtractionForRecord(
  deps: ExtractionDeps,
  reviewId: string,
  recordId: string,
): Promise<{ created: number }> {
  const { supabase, provider } = deps;

  const { data: fieldRows, error: fErr } = await supabase
    .from("extraction_field")
    .select("id, name, type, options, sort_order")
    .eq("review_id", reviewId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (fErr) throw new Error(fErr.message);
  const fields: ExtractionFieldDef[] = (fieldRows ?? []).map((f) => {
    const r = f as { id: string; name: string; type: ExtractionFieldDef["type"]; options: string[] | null };
    return { id: r.id, name: r.name, type: r.type, options: r.options ?? undefined };
  });
  if (fields.length === 0) return { created: 0 };

  const { documentText, pageIndex, layerByPage } = await loadRecordText(supabase, reviewId, recordId);

  const result = await provider.extractFields({ fields, documentText, pageIndex });

  let created = 0;
  for (const ef of result.fields) {
    // Re-extração: pendentes anteriores (não ratificados) do mesmo (record,field) saem de cena.
    await supabase
      .from("extraction_value")
      .update({ state: "rejected", updated_at: new Date().toISOString() })
      .eq("record_id", recordId)
      .eq("field_id", ef.field_id)
      .in("state", ["pending", "inferred"]);

    const layer = ef.grounding.page != null ? layerByPage.get(ef.grounding.page) : undefined;
    const grounding = {
      text_layer_id: layer?.text_layer_id ?? null,
      page: ef.grounding.page,
      source_span: ef.grounding.source_span,
      origin: layer?.origin ?? ef.grounding.origin ?? null,
    };
    const state = ef.inferred ? "inferred" : "pending";

    const { data: value, error: vErr } = await supabase
      .from("extraction_value")
      .insert({ review_id: reviewId, record_id: recordId, field_id: ef.field_id, state })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);
    const valueId = (value as { id: string }).id;

    const { data: suggestion, error: sErr } = await supabase
      .from("ai_suggestion")
      .insert({
        review_id: reviewId,
        target_kind: "extraction",
        target_id: valueId,
        output: ef.value,
        provenance: result.provenance,
        state,
        grounding,
        not_found: ef.value.value === null,
      })
      .select("id")
      .single();
    if (sErr) throw new Error(sErr.message);

    await supabase
      .from("extraction_value")
      .update({ ai_suggestion_id: (suggestion as { id: string }).id })
      .eq("id", valueId);

    created += 1;
  }
  return { created };
}
```

> **Nota de re-extração:** o `update … set state='rejected'` aposenta sugestões pendentes velhas. Isso satisfaz "nova pendente ao lado do validado" porque linhas `accepted/edited` são excluídas pelo filtro `.in("state", ["pending","inferred"])`. O `final_value` validado nunca é tocado (FR-019a).

- [ ] **Step 4: Implementar `run.ts` (wrapper, espelha screening/run.ts)**

```ts
// src/lib/extraction/run.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { runExtractionForRecord } from "./extract";

/** Wrapper desacoplado da resolução de BYOK (admin + provider já resolvidos). */
export async function runExtractionForRecordWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
  recordId: string,
): Promise<{ created: number }> {
  return runExtractionForRecord({ supabase, provider }, reviewId, recordId);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/integration/extract-record.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/extraction/extract.ts src/lib/extraction/run.ts tests/integration/extract-record.test.ts
git commit -m "feat(002-f4): runExtractionForRecord (ai_suggestion+extraction_value, grounding, re-extract) (US3/FR-012..019a)"
```

---

## Task 9: Queries de leitura — `listStudies` + `listExtractionValues`

**Files:**
- Modify: `src/lib/extraction/queries.ts`
- Test: `tests/integration/extract-record.test.ts` (append)

- [ ] **Step 1: Escrever o teste (falha)**

```ts
// append em tests/integration/extract-record.test.ts
import { listStudies, listExtractionValues } from "@/lib/extraction/queries";

describe("queries de extração", () => {
  it("listStudies retorna estudos included_ft; listExtractionValues traz sugestão+grounding", async () => {
    const { client, reviewId, recordId, svc } = await setup();
    await runExtractionForRecord({ supabase: svc, provider: new MockLLMProvider() }, reviewId, recordId);

    const studies = await listStudies({ supabase: client }, reviewId);
    expect(studies.some((s) => s.id === recordId)).toBe(true);

    const values = await listExtractionValues({ supabase: client }, reviewId, recordId);
    expect(values.length).toBe(2);
    const anchored = values.find((v) => v.not_found === false)!;
    expect(anchored.output).toBeTruthy();
    expect(anchored.provenance).toHaveProperty("model");
    expect(anchored.state).toBe("pending");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/integration/extract-record.test.ts -t queries`
Expected: FAIL — `listStudies`/`listExtractionValues` não existem.

- [ ] **Step 3: Implementar em queries.ts**

```ts
// append em src/lib/extraction/queries.ts
import type { Provenance, SuggestionState } from "@/lib/ai/llm/types";

export interface StudyRow {
  id: string;
  title: string;
}

/** Estudos da Revisão (record incluído após o Texto completo — alvo da extração). */
export async function listStudies(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<StudyRow[]> {
  const { data, error } = await deps.supabase
    .from("record")
    .select("id, metadata")
    .eq("review_id", reviewId)
    .eq("corpus_state", "included_ft")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; metadata: { title?: string } | null }>).map((r) => ({
    id: r.id,
    title: r.metadata?.title ?? "(sem título)",
  }));
}

export interface ExtractionValueView {
  id: string;
  field_id: string;
  state: SuggestionState;
  final_value: unknown;
  not_found: boolean;
  output: unknown; // FactualValue da sugestão
  provenance: Provenance | null;
  grounding: { text_layer_id: string | null; page: number | null; source_span: string | null; origin: string | null } | null;
}

/** Valores vivos (não rejeitados) de um estudo, com a sugestão de IA embutida. */
export async function listExtractionValues(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordId: string,
): Promise<ExtractionValueView[]> {
  const { data, error } = await deps.supabase
    .from("extraction_value")
    .select(
      "id, field_id, state, final_value, ai_suggestion:ai_suggestion_id (output, provenance, grounding, not_found)",
    )
    .eq("review_id", reviewId)
    .eq("record_id", recordId)
    .neq("state", "rejected")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const sugg = (r.ai_suggestion ?? null) as null | {
      output: unknown; provenance: Provenance; not_found: boolean;
      grounding: ExtractionValueView["grounding"];
    };
    return {
      id: r.id as string,
      field_id: r.field_id as string,
      state: r.state as SuggestionState,
      final_value: r.final_value ?? null,
      not_found: sugg?.not_found ?? false,
      output: sugg?.output ?? null,
      provenance: sugg?.provenance ?? null,
      grounding: sugg?.grounding ?? null,
    };
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/integration/extract-record.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction/queries.ts tests/integration/extract-record.test.ts
git commit -m "feat(002-f4): listStudies + listExtractionValues (US3 read layer)"
```

---

## Task 10: Server Actions — `runExtraction` + `ratifyExtractionValue`

**Files:**
- Modify: `app/reviews/[reviewId]/extraction/actions.ts`

- [ ] **Step 1: Adicionar os imports server-side no topo**

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider, MissingByokError } from "@/lib/ai/llm";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { runExtractionForRecordWith } from "@/lib/extraction/run";
import type { SuggestionState } from "@/lib/ai/llm/types";
```

- [ ] **Step 2: Adicionar as actions (ao fim do arquivo)**

```ts
// ---- Extração por IA (Fatia 4 / US3): single por estudo, server-side (A1) ----
export async function runExtraction(reviewId: string, recordId: string) {
  await requireMember(reviewId);
  const admin = createAdminClient();
  // Provider: BYOK quando há chave; senão Mock determinístico (local/e2e).
  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) provider = new MockLLMProvider();
    else throw e;
  }
  const res = await runExtractionForRecordWith(admin, provider, reviewId, recordId);
  revalidate(reviewId);
  return { ok: true as const, created: res.created };
}

export async function ratifyExtractionValue(
  reviewId: string,
  valueId: string,
  state: SuggestionState,
  finalValue: unknown,
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("ratify_extraction_value", {
    p_value_id: valueId,
    p_state: state,
    p_final_value: state === "rejected" ? null : finalValue,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add app/reviews/[reviewId]/extraction/actions.ts
git commit -m "feat(002-f4): runExtraction + ratifyExtractionValue server actions (US3)"
```

---

## Task 11: Componente `ExtractionRunner` (reusa `components/ai/*`)

**Files:**
- Create: `src/components/extraction/ExtractionRunner.tsx`
- Test: `tests/unit/extraction/extraction-runner.test.tsx`

- [ ] **Step 1: Escrever o teste de componente (falha)**

```tsx
// tests/unit/extraction/extraction-runner.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExtractionRunner } from "@/components/extraction/ExtractionRunner";

const fields = [
  { id: "f1", name: "Amostra", type: "number" as const, options: null, sort_order: 1 },
  { id: "f2", name: "Desenho", type: "select" as const, options: ["RCT"], sort_order: 2 },
];

const values = [
  { id: "v1", field_id: "f1", state: "pending" as const, final_value: null, not_found: false,
    output: { value: "42", source_span: "n=42", page: 3 },
    provenance: { model: "mock-llm", version: "0.0.0", prompt_or_span: "extract", timestamp: new Date().toISOString() },
    grounding: { text_layer_id: "t1", page: 3, source_span: "n=42", origin: "nativo" } },
  { id: "v2", field_id: "f2", state: "inferred" as const, final_value: null, not_found: false,
    output: { value: "RCT", source_span: null, page: null },
    provenance: { model: "mock-llm", version: "0.0.0", prompt_or_span: "extract", timestamp: new Date().toISOString() },
    grounding: { text_layer_id: null, page: null, source_span: null, origin: null } },
];

describe("ExtractionRunner", () => {
  it("renderiza campos com chip de estado e ações da sugestão", () => {
    render(
      <ExtractionRunner
        reviewId="r1" recordId="rec1" fields={fields} values={values}
        onRun={vi.fn()} onRatify={vi.fn()}
      />,
    );
    expect(screen.getByText("Amostra")).toBeInTheDocument();
    expect(screen.getByText(/pendente/i)).toBeInTheDocument();
    expect(screen.getByText("Inferida")).toBeInTheDocument();
    expect(screen.getAllByText("Aceitar").length).toBeGreaterThan(0);
  });

  it("campo not_found renderiza 'não encontrado'", () => {
    const nf = [{ ...values[0], not_found: true, output: { value: null, page: null, source_span: null, reason: "not_found" } }];
    render(
      <ExtractionRunner reviewId="r1" recordId="rec1" fields={[fields[0]!]} values={nf as never}
        onRun={vi.fn()} onRatify={vi.fn()} />,
    );
    expect(screen.getByText(/não encontrado/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/extraction/extraction-runner.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar o componente**

```tsx
// src/components/extraction/ExtractionRunner.tsx
"use client";

import { useState, useTransition } from "react";
import type { SuggestionState } from "@/lib/ai/llm/types";
import type { ExtractionFieldRow, ExtractionValueView } from "@/lib/extraction/queries";
import { SuggestionChip } from "@/components/ai/SuggestionChip";
import { SuggestionActions } from "@/components/ai/SuggestionActions";
import { ProvenancePopover } from "@/components/ai/ProvenancePopover";
import { NotFound } from "@/components/ai/NotFound";

export function ExtractionRunner({
  reviewId,
  recordId,
  fields,
  values,
  onRun,
  onRatify,
}: {
  reviewId: string;
  recordId: string;
  fields: ExtractionFieldRow[];
  values: ExtractionValueView[];
  onRun: (reviewId: string, recordId: string) => Promise<{ ok: boolean; error?: string }>;
  onRatify: (
    reviewId: string,
    valueId: string,
    state: SuggestionState,
    finalValue: unknown,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const byField = new Map(values.map((v) => [v.field_id, v]));

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await onRun(reviewId, recordId);
      if (!r.ok) setError(r.error ?? "Falha ao extrair.");
    });
  }

  function ratify(valueId: string, state: SuggestionState, current: unknown) {
    setError(null);
    startTransition(async () => {
      const finalValue =
        state === "edited"
          ? { value: window.prompt("Novo valor:", String(current ?? "")) ?? "" }
          : { value: current };
      const r = await onRatify(reviewId, valueId, state, finalValue);
      if (!r.ok) setError(r.error ?? "Falha ao ratificar.");
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Extração por IA</h3>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="rounded border border-accent px-3 py-1 text-xs text-accent-deep focus-visible:ring disabled:opacity-50"
        >
          {pending ? "Extraindo…" : "Extrair por IA"}
        </button>
      </div>
      {error && <p className="text-xs text-warn">{error}</p>}
      <ul className="divide-y divide-line">
        {fields.map((f) => {
          const v = byField.get(f.id);
          const out = v?.output as { value: unknown; source_span: string | null; page: number | null } | null;
          const isFinal = v?.state === "accepted" || v?.state === "edited";
          return (
            <li key={f.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{f.name}</p>
                {!v && <p className="text-xs text-ink-faint">— ainda sem sugestão —</p>}
                {v?.not_found && <NotFound what={f.name} />}
                {v && !v.not_found && (
                  <p className="truncate text-xs text-ink-soft">
                    {isFinal
                      ? String((v.final_value as { value?: unknown })?.value ?? "")
                      : String(out?.value ?? "")}
                    {out?.page != null && <span className="ml-1 text-ink-faint">· p.{out.page}</span>}
                    {out?.source_span && <span className="ml-1 italic">“{out.source_span}”</span>}
                  </p>
                )}
              </div>
              {v && (
                <div className="flex shrink-0 items-center gap-2">
                  <SuggestionChip state={v.state} />
                  {v.provenance && <ProvenancePopover provenance={v.provenance} />}
                  {!isFinal && (
                    <SuggestionActions
                      disabled={pending}
                      onAccept={() => ratify(v.id, "accepted", out?.value)}
                      onEdit={() => ratify(v.id, "edited", out?.value)}
                      onReject={() => ratify(v.id, "rejected", null)}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/extraction/extraction-runner.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/extraction/ExtractionRunner.tsx tests/unit/extraction/extraction-runner.test.tsx
git commit -m "feat(002-f4): ExtractionRunner reusing components/ai/* (US3/FR-020)"
```

---

## Task 12: Página da Extração — lista de estudos + runner

**Files:**
- Modify: `app/reviews/[reviewId]/extraction/page.tsx`

- [ ] **Step 1: Reescrever a página para incluir estudos + extração**

```tsx
// app/reviews/[reviewId]/extraction/page.tsx
import { createClient } from "@/lib/supabase/server";
import {
  listExtractionFields,
  listStudies,
  listExtractionValues,
} from "@/lib/extraction/queries";
import { ExtractionFormBuilder } from "@/components/extraction/ExtractionFormBuilder";
import { ExtractionRunner } from "@/components/extraction/ExtractionRunner";
import {
  ensureExtractionForm,
  addExtractionField,
  updateExtractionField,
  removeExtractionField,
  reorderExtractionFields,
  runExtraction,
  ratifyExtractionValue,
} from "./actions";

export default async function ExtractionPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  await ensureExtractionForm(reviewId);
  const supabase = await createClient();
  const fields = await listExtractionFields({ supabase }, reviewId);
  const studies = await listStudies({ supabase }, reviewId);
  const valuesByStudy = await Promise.all(
    studies.map((s) => listExtractionValues({ supabase }, reviewId, s.id)),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <ExtractionFormBuilder
        reviewId={reviewId}
        fields={fields}
        onAdd={addExtractionField}
        onUpdate={updateExtractionField}
        onRemove={removeExtractionField}
        onReorder={reorderExtractionFields}
      />

      <section className="space-y-6">
        <h2 className="text-lg font-semibold">Estudos para extração</h2>
        {studies.length === 0 && (
          <p className="text-sm text-ink-faint">
            Nenhum estudo incluído no Texto completo ainda.
          </p>
        )}
        {studies.map((s, i) => (
          <div key={s.id} className="panel space-y-3 p-4">
            <h3 className="text-sm font-semibold">{s.title}</h3>
            <ExtractionRunner
              reviewId={reviewId}
              recordId={s.id}
              fields={fields}
              values={valuesByStudy[i]!}
              onRun={runExtraction}
              onRatify={ratifyExtractionValue}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 erros / sem warnings.

- [ ] **Step 3: Commit**

```bash
git add app/reviews/[reviewId]/extraction/page.tsx
git commit -m "feat(002-f4): extraction page wires studies list + ExtractionRunner (US3)"
```

---

## Task 13: Fase "Extração" no trilho (`phases.ts`)

**Files:**
- Modify: `src/lib/shell/phases.ts`
- Test: `tests/unit/shell/phases-extraction.test.ts`

- [ ] **Step 1: Escrever o teste (falha)**

```ts
// tests/unit/shell/phases-extraction.test.ts
import { describe, it, expect } from "vitest";
import { computePhaseStates } from "@/lib/shell/phases";

const base = {
  hasQuestion: true, protocolStatus: "locked" as const, identified: 10, duplicates: 0,
  screenedTs: 10, includedTs: 0, passedTs: 5, includedFt: 5, excludedFt: 0,
};

describe("fase Extração no trilho (§7-C)", () => {
  it("aparece após Triagem TC e é 'current' quando a triagem fechou e não há valor ratificado", () => {
    const phases = computePhaseStates("r1", { ...base, extractionRatified: false });
    const ext = phases.find((p) => p.key === "extraction")!;
    expect(ext).toBeTruthy();
    expect(ext.href).toBe("/reviews/r1/extraction");
    expect(ext.status).toBe("current");
  });

  it("fica 'done' quando há ao menos um valor ratificado", () => {
    const phases = computePhaseStates("r1", { ...base, extractionRatified: true });
    expect(phases.find((p) => p.key === "extraction")!.status).toBe("done");
  });

  it("não quebra a derivação T/R (screening_ft segue 'done')", () => {
    const phases = computePhaseStates("r1", { ...base, extractionRatified: false });
    expect(phases.find((p) => p.key === "screening_ft")!.status).toBe("done");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/shell/phases-extraction.test.ts`
Expected: FAIL — `extraction` não existe no `PhaseKey`/`PhaseInput`.

- [ ] **Step 3: Editar phases.ts**

Adicionar `"extraction"` ao `PhaseKey` (entre `screening_ft` e `risk_of_bias`):

```ts
export type PhaseKey =
  | "question"
  | "protocol"
  | "import"
  | "duplicates"
  | "screening_ts"
  | "screening_ft"
  | "extraction"
  | "risk_of_bias"
  | "certainty";
```

Adicionar à `PhaseInput` (após `excludedFt`):

```ts
  /** Há ao menos um extraction_value ratificado (accepted/edited) na Revisão. */
  extractionRatified: boolean;
```

Adicionar a def ao fim de `PIPELINE` (após `screening_ft`):

```ts
  {
    key: "extraction",
    label: "Extração",
    href: (r) => `/reviews/${r}/extraction`,
    // Fase pós-triagem (D19). Concluída quando há ≥1 valor ratificado pelo humano.
    completed: (i) => i.extractionRatified,
  },
```

Em `loadPhaseStates`, antes do `return computePhaseStates(...)`, contar valores ratificados:

```ts
  const { count: ratifiedCount } = await supabase
    .from("extraction_value")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .in("state", ["accepted", "edited"]);
```

e adicionar ao objeto passado a `computePhaseStates` (após `excludedFt`):

```ts
    extractionRatified: (ratifiedCount ?? 0) > 0,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/shell/phases-extraction.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Rodar a suíte de fases existente (não-regressão)**

Run: `npx vitest run tests/unit/shell`
Expected: PASS — nenhum teste de fases pré-existente quebrou.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shell/phases.ts tests/unit/shell/phases-extraction.test.ts
git commit -m "feat(002-f4): add Extração phase to rail without breaking T/R derivation (US3/§7-C)"
```

---

## Task 14: Isolamento cross-review (SC-011)

**Files:**
- Create: `tests/integration/rls.extraction-value.test.ts`

- [ ] **Step 1: Escrever o teste de isolamento**

```ts
// tests/integration/rls.extraction-value.test.ts
import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

describe("RLS — extraction_value escopado por Revisão (SC-011)", () => {
  it("não-membro não lê extraction_value de outra Revisão e não ratifica", async () => {
    const { client: a } = await signUpUser(
      `rva_${Date.now()}@example.com`, "senha-teste-123");
    const { data: review } = await a.rpc("create_review", { p_title: "Dona A" });
    const reviewId = review!.id as string;
    const svc = serviceClient();
    const { data: rec } = await svc.from("record")
      .insert({ review_id: reviewId, corpus_state: "included_ft", metadata: { title: "E" } })
      .select("id").single();
    await a.rpc("ensure_extraction_form", { p_review_id: reviewId });
    const { data: field } = await a.rpc("add_extraction_field", {
      p_review_id: reviewId, p_name: "Amostra", p_type: "number", p_options: null });
    const { data: val } = await svc.from("extraction_value").insert({
      review_id: reviewId, record_id: rec!.id, field_id: field!.id, state: "pending",
    }).select("id").single();

    const { client: b } = await signUpUser(
      `rvb_${Date.now()}@example.com`, "senha-teste-123");
    const { data: leaked } = await b.from("extraction_value").select("id").eq("review_id", reviewId);
    expect(leaked!.length).toBe(0); // RLS bloqueia leitura

    const { error: ratErr } = await b.rpc("ratify_extraction_value", {
      p_value_id: val!.id, p_state: "accepted", p_final_value: { value: 1 } });
    expect(ratErr).not.toBeNull(); // não-membro não ratifica
  });
});
```

- [ ] **Step 2: Rodar e ver passar**

Run: `npx vitest run tests/integration/rls.extraction-value.test.ts`
Expected: PASS (RLS já implementada na Task 1; este teste prova o isolamento).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rls.extraction-value.test.ts
git commit -m "test(002-f4): RLS isolamento cross-review de extraction_value (SC-011)"
```

---

## Task 15: Portões finais (CHECKPOINT 3)

**Files:** nenhum (verificação) + COMPLETION.

- [ ] **Step 1: Suíte completa**

Run: `npx vitest run`
Expected: tudo verde (ressalva conhecida: `pdf-pipeline.test.ts` pode dar timeout flaky sob carga — passa em isolamento; pré-existente da Fatia 2). F4 adiciona ~6 arquivos de teste.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Escrever o COMPLETION da fatia**

Criar `specs/002-marco2-coracao-ai-first/.superpowers/COMPLETION-fatia-4.md` (espelhar o formato do `COMPLETION-fatia-3.md`): branch + tip, o que foi entregue, tabela de tarefas→commits, evidência dos portões, cobertura de FR (012–020, 030), não-regressão, decisões/desvios, pendências (lote+custo+consumo → F5; busca semântica → F6). Atualizar a linha da F4 em `slicing.md` para `✅ completa — aguardando merge (CHECKPOINT 3, tip <hash>)`.

- [ ] **Step 5: Commit + PARAR (CHECKPOINT 3)**

```bash
git add specs/002-marco2-coracao-ai-first/.superpowers/COMPLETION-fatia-4.md specs/002-marco2-coracao-ai-first/.superpowers/slicing.md
git commit -m "docs(002-f4): COMPLETION da Fatia 4 + tracking (CHECKPOINT 3)"
```

**PARAR.** Apresentar ao desenvolvedor: branch `build/002-marco2-coracao-ai-first/4-extracao-ia`, diff, e evidência (testes + lint + tsc). **Aguardar o merge manual.** Não iniciar a Fatia 5.

---

## Self-Review (cobertura do escopo da Fatia 4)

**Cobertura de FR (slicing linha 140):**
- **FR-012** preencher campos a partir do texto, span+página → `extractFields` + `runExtractionForRecord` (grounding resolvido) · Tasks 6–8.
- **FR-013** "não encontrado" 1ª classe → `value:null, reason:'not_found'`, `not_found=true`, `<NotFound/>` · Tasks 6, 8, 11.
- **FR-014** inferido → `inferred=true` ⇒ `state='inferred'` ⇒ chip "Inferida" · Tasks 6, 8, 11.
- **FR-015** pt-BR + span no idioma original → mock/anthropic preservam span; UI cita `source_span` · Tasks 6–7, 11.
- **FR-016** proveniência obrigatória → `ExtractionResult.provenance` gravada em `ai_suggestion.provenance` (CHECK do schema) · Tasks 6–8.
- **FR-017/017a** só via `LLMProvider`, texto direto, sem embeddings → `extractFields` lê `text_layer`; nenhum import de `embedding_chunk` · Tasks 6–8 (+ teste "sem rede/sem embeddings").
- **FR-018** aceitar/editar/rejeitar + estados → `ratify_extraction_value` + `SuggestionActions` · Tasks 2, 10, 11.
- **FR-019** IA nunca finaliza → AI só grava `pending`/`inferred`; `final_value` só pela RPC humana · Tasks 2, 8.
- **FR-019a** re-extração sem sobrescrever → novas linhas pending; validadas intactas · Task 8 (teste dedicado).
- **FR-020/030** reusar vocabulário visual de IA, distinção humano/IA → `SuggestionChip/ProvenancePopover/SuggestionActions/NotFound` · Task 11.
- **Migration 0015 + RLS primeiro (Princípio IV)** → Tasks 1–3 precedem o código.
- **Fase Extração no trilho (§7-C)** → Task 13 (sem quebrar T/R).
- **SC-011 isolamento** → Task 14.

**Dependências satisfeitas:** F2 (`text_layer`) ✅ + F3 (`extraction_form`/`extraction_field`) ✅ — ambas mergeadas.

**Placeholders:** nenhum — cada step traz código/comando completo.

**Consistência de tipos:** `ExtractionFieldDef/ExtractedField/ExtractionResult` (Task 4) usados igual em mock (6), anthropic (7), extract (8); `ExtractionValueView`/`ExtractionFieldRow` (queries) consumidos pelo componente (11) e página (12); `suggestion_state` reusado em `extraction_value.state` e na RPC (1–2).

**Fora de escopo (não fazer aqui):** lote/job `ai_extraction_batch`, estimativa-antes-de-lote na UI, `ai_usage`/consumo (FR-021/022/023 → Fatia 5); busca semântica/embeddings (US5 → Fatia 6).
