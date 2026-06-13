# Fatia 2 — Síntese qualitativa assistida (US1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Contrato Sessão B**: commitar **somente** no branch isolado `build/003-marco3-saida-sintese-relatorio/2-synthesis`; **nunca** merge/push para a feature ou `main`. Ao fim, **PARAR** (CHECKPOINT 3) e aguardar merge do usuário.

**Goal:** Gerar, sob demanda e como job assíncrono retomável, uma síntese qualitativa (temas + narrativa pt-BR + tabela-resumo) a partir dos achados de extração ratificados de uma Revisão, com grounding obrigatório em nível de achado e ratificação humano-no-laço.

**Architecture:** Espelha o pipeline de extração do Marco 2: migration+RLS+RPC primeiro (Princípio IV), o LLM só via `LLMProvider` (§VII), Edge só enfileira e o **worker Node** processa item-a-item (§VIII, resiliente/retomável). A IA **sugere** temas (`state=pending`); o humano ratifica (accept/edit/reject/merge/split/reorder), cada operação com `audit_entry` (§I/§III). Re-gerar **preserva** temas `accepted/edited` (FR-005a/Q2). Toda saída factual ancora em `extraction_value` real (§II/FR-007); corpus sem achados ⇒ "dados insuficientes" 1ª classe.

**Tech Stack:** Next.js 14 (App Router, Server Components + server actions), TypeScript strict, Supabase (Postgres + RLS + RPC `security definer`), Vitest (unit/integration), `LLMProvider` (Anthropic default, Mock para teste/sem-chave). Sem libs novas.

**Branch:** `build/003-marco3-saida-sintese-relatorio/2-synthesis` (criar de feature HEAD via `using-git-worktrees`).

**Cobre:** US1 — FR-001..007, FR-005a, FR-024, FR-026; SC-001, SC-006(síntese), SC-007, SC-008(síntese). **A\*:** A1 (`summary_table` = estudos×campos, recomputável — Task 3).

**Não-regressão (regime Marco ≥ 2):** nada dos Marcos 1–2 é refatorado. Só **estende**: `ALTER TYPE ai_target_kind ADD VALUE 'synthesis_theme'` e `ALTER TYPE job_type ADD VALUE 'synthesis_batch'` (aditivos), `phases.ts` ganha uma fase, `LLMProvider` ganha um método + um ramo no `estimateCost`. Reusa `record`/`extraction_value`/`extraction_field`/`job`/`job_item`/`ai_usage`/`ai_suggestion`/`audit_entry`/`is_review_member` e os componentes `src/components/ai/*`.

---

## File Structure

**Criar:**
- `supabase/migrations/0018_synthesis.sql` — tabelas `synthesis`/`theme`/`theme_finding`, enum ALTERs, RLS, RPC `create_synthesis_job` + RPCs de ratificação.
- `src/lib/synthesis/summary-table.ts` — `buildThemeSummaryTable` (A1, pura, recomputável).
- `src/lib/synthesis/queries.ts` — `collectRatifiedFindings`, `loadSynthesis`, `countSynthesisCandidates`.
- `src/lib/synthesis/enqueue.ts` — `enqueueSynthesisJob` (só enfileira).
- `src/lib/synthesis/batch-worker.ts` — `processSynthesisJob` (worker Node, item=estudo, resiliente/retomável).
- `src/lib/synthesis/batch-run.ts` — `runSynthesisBatchWorkerWith`.
- `app/reviews/[reviewId]/synthesis/actions.ts` — server actions: estimar, gerar, ratificar.
- `app/reviews/[reviewId]/synthesis/page.tsx` — Server Component da síntese.
- `src/components/synthesis/ThemeList.tsx`, `ThemeCard.tsx`, `NarrativeEditor.tsx`, `SummaryTable.tsx`, `GroundingRefs.tsx`, `SynthesisRunner.tsx`, `InsufficientData.tsx`.
- Testes: `tests/unit/synthesis/summary-table.test.ts`, `tests/unit/synthesis/batch-worker.test.ts`, `tests/unit/synthesis/components.test.tsx`, `tests/unit/ai/llm-contract.test.ts` (estender), `tests/unit/shell/phases.test.ts` (estender), `tests/integration/synthesis.test.ts`.

**Modificar:**
- `src/lib/ai/llm/types.ts` — interface `LLMProvider` += `synthesizeThemes`; `estimateCost` union += `synthesis_batch`; novos tipos `SynthesisFinding`/`SynthesizedTheme`/`SynthesizeThemesResult`.
- `src/lib/ai/llm/cost.ts` — `estimateSynthesisCost`.
- `src/lib/ai/llm/mock.ts` — implementar `synthesizeThemes` + ramo `synthesis_batch` no `estimateCost`.
- `src/lib/ai/llm/anthropic.ts` — implementar `synthesizeThemes` + ramo `synthesis_batch`.
- `src/lib/shell/phases.ts` — adicionar a fase `synthesis` ao `PIPELINE`.

---

## Task 1: Migration 0018 — schema, enums, RLS, RPCs

**Files:**
- Create: `supabase/migrations/0018_synthesis.sql`
- Test: `tests/integration/synthesis.test.ts` (RLS/regeneração — escrito na Task 10)

Mirror: `supabase/migrations/0016_extraction_batch.sql` (ALTER TYPE + RPC `security definer` + `is_review_member` + `audit_entry`) e o padrão de RLS/policies das tabelas do Marco 2.

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- Marco 3 / Fatia 2 — Síntese qualitativa assistida (US1 / FR-001..007, FR-005a).
-- Aditivo (não-regressão Marco ≥ 2): tabelas novas + 2 enum ADD VALUE + RPCs.
-- A RPC create_synthesis_job só ENFILEIRA (§VIII); o worker Node agrega.
-- ============================================================

-- Enums (aditivos; usados em runtime no corpo plpgsql, padrão de 0015/0016).
alter type ai_target_kind add value if not exists 'synthesis_theme';
alter type job_type add value if not exists 'synthesis_batch';

-- ---------- synthesis (1:1 review — FR-005a) ----------
create table public.synthesis (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','generating','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- theme (tema da síntese — humano-no-laço) ----------
create table public.theme (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review(id) on delete cascade,
  synthesis_id uuid not null references public.synthesis(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  narrative text not null default '',
  "order" int not null default 0,
  summary_table jsonb,
  ai_suggestion_id uuid references public.ai_suggestion(id) on delete set null,
  state text not null default 'pending'
    check (state in ('pending','accepted','edited','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index theme_synthesis_idx on public.theme(synthesis_id, "order");

-- ---------- theme_finding (grounding tema → achado, Q3) ----------
create table public.theme_finding (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review(id) on delete cascade,
  theme_id uuid not null references public.theme(id) on delete cascade,
  extraction_value_id uuid not null
    references public.extraction_value(id) on delete cascade,
  "order" int not null default 0,
  created_at timestamptz not null default now()
);
create index theme_finding_theme_idx on public.theme_finding(theme_id, "order");

-- ---------- RLS: membros da Revisão (espelha tabelas do Marco 2) ----------
alter table public.synthesis enable row level security;
alter table public.theme enable row level security;
alter table public.theme_finding enable row level security;

create policy synthesis_member on public.synthesis
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));
create policy theme_member on public.theme
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));
create policy theme_finding_member on public.theme_finding
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));

-- ---------- RPC: create_synthesis_job (enqueue — FR-005) ----------
-- Item = um estudo included_ft com ≥1 extraction_value ratificado (accepted/edited).
create or replace function public.create_synthesis_job(p_review_id uuid)
returns public.job
language plpgsql security definer set search_path = public as $$
declare v_job public.job; v_count int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'synthesis_batch', 'queued')
  returning * into v_job;

  insert into public.job_item (job_id, review_id, status, payload)
  select v_job.id, p_review_id, 'pending', jsonb_build_object('record_id', r.id)
  from public.record r
  where r.review_id = p_review_id
    and r.corpus_state = 'included_ft'
    and exists (
      select 1 from public.extraction_value ev
      where ev.record_id = r.id and ev.state in ('accepted','edited')
    );
  get diagnostics v_count = row_count;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'enqueue_synthesis_batch', 'job', v_job.id,
    null, jsonb_build_object('item_count', v_count)
  );
  return v_job;
end; $$;
grant execute on function public.create_synthesis_job(uuid) to authenticated;

-- ---------- RPCs de ratificação (cada uma com audit_entry, §III) ----------
create or replace function public.set_theme_state(
  p_theme_id uuid, p_state text, p_name text default null, p_narrative text default null
) returns public.theme
language plpgsql security definer set search_path = public as $$
declare v_before public.theme; v_after public.theme; v_review uuid;
begin
  select * into v_before from public.theme where id = p_theme_id;
  if v_before.id is null then raise exception 'theme not found'; end if;
  v_review := v_before.review_id;
  if not public.is_review_member(v_review) then raise exception 'not a member'; end if;
  if p_state not in ('accepted','edited','rejected') then
    raise exception 'invalid state';
  end if;

  update public.theme set
    state = p_state,
    name = coalesce(p_name, name),
    narrative = coalesce(p_narrative, narrative),
    updated_at = now()
  where id = p_theme_id returning * into v_after;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    v_review, 'human', auth.uid(), 'ratify_theme', 'theme', p_theme_id,
    to_jsonb(v_before), to_jsonb(v_after)
  );
  return v_after;
end; $$;
grant execute on function public.set_theme_state(uuid, text, text, text) to authenticated;

create or replace function public.reorder_themes(
  p_synthesis_id uuid, p_theme_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare v_review uuid;
begin
  select review_id into v_review from public.synthesis where id = p_synthesis_id;
  if not public.is_review_member(v_review) then raise exception 'not a member'; end if;
  update public.theme t set "order" = ord.idx - 1
  from (select unnest(p_theme_ids) as id, generate_subscripts(p_theme_ids, 1) as idx) ord
  where t.id = ord.id and t.synthesis_id = p_synthesis_id;
  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, after)
  values (v_review, 'human', auth.uid(), 'reorder_themes', 'synthesis', p_synthesis_id,
          jsonb_build_object('order', to_jsonb(p_theme_ids)));
end; $$;
grant execute on function public.reorder_themes(uuid, uuid[]) to authenticated;

create or replace function public.merge_themes(
  p_theme_ids uuid[], p_name text
) returns public.theme
language plpgsql security definer set search_path = public as $$
declare v_review uuid; v_synth uuid; v_target public.theme;
begin
  select review_id, synthesis_id into v_review, v_synth
  from public.theme where id = p_theme_ids[1];
  if not public.is_review_member(v_review) then raise exception 'not a member'; end if;

  insert into public.theme (review_id, synthesis_id, name, narrative, state, "order")
  select v_review, v_synth, p_name,
         string_agg(narrative, E'\n\n' order by "order"), 'edited', min("order")
  from public.theme where id = any(p_theme_ids)
  returning * into v_target;

  -- Move o grounding dos temas-fonte para o tema fundido (sem órfão, §II).
  update public.theme_finding set theme_id = v_target.id where theme_id = any(p_theme_ids);
  update public.theme set state = 'rejected', updated_at = now() where id = any(p_theme_ids);

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, after)
  values (v_review, 'human', auth.uid(), 'merge_themes', 'theme', v_target.id,
          jsonb_build_object('sources', to_jsonb(p_theme_ids)));
  return v_target;
end; $$;
grant execute on function public.merge_themes(uuid[], text) to authenticated;

create or replace function public.split_theme(
  p_theme_id uuid, p_parts jsonb
) returns setof public.theme
language plpgsql security definer set search_path = public as $$
declare v_review uuid; v_synth uuid; v_part jsonb; v_new public.theme;
begin
  select review_id, synthesis_id into v_review, v_synth
  from public.theme where id = p_theme_id;
  if not public.is_review_member(v_review) then raise exception 'not a member'; end if;

  for v_part in select * from jsonb_array_elements(p_parts) loop
    insert into public.theme (review_id, synthesis_id, name, narrative, state, "order")
    values (v_review, v_synth, v_part->>'name', coalesce(v_part->>'narrative',''), 'edited',
            (select coalesce(max("order"),0)+1 from public.theme where synthesis_id = v_synth))
    returning * into v_new;
    -- Reatribui o grounding citado em cada parte (findingRefs), sem deixar órfão.
    update public.theme_finding set theme_id = v_new.id
    where theme_id = p_theme_id
      and extraction_value_id::text in (
        select jsonb_array_elements_text(v_part->'findingRefs'));
    return next v_new;
  end loop;

  update public.theme set state = 'rejected', updated_at = now() where id = p_theme_id;
  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, after)
  values (v_review, 'human', auth.uid(), 'split_theme', 'theme', p_theme_id, p_parts);
end; $$;
grant execute on function public.split_theme(uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Aplicar e verificar (reset local)**

Run: `npx supabase db reset`
Expected: aplica até `0018_synthesis.sql` sem erro; `synthesis`/`theme`/`theme_finding` existem com RLS habilitado.

- [ ] **Step 3: Regenerar tipos do banco**

Run: `npm run gen:types` (ou o script equivalente do projeto que gera `src/lib/supabase/types.ts`)
Expected: tipos incluem `synthesis`, `theme`, `theme_finding` e os novos enum values.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0018_synthesis.sql src/lib/supabase/types.ts
git commit -m "feat(synthesis): migration 0018 — synthesis/theme/theme_finding + RLS + RPCs (US1)"
```

---

## Task 2: `LLMProvider.synthesizeThemes` (contrato + mock + anthropic + estimateCost)

**Files:**
- Modify: `src/lib/ai/llm/types.ts`, `src/lib/ai/llm/cost.ts`, `src/lib/ai/llm/mock.ts`, `src/lib/ai/llm/anthropic.ts`
- Test: `tests/unit/ai/llm-contract.test.ts`

- [ ] **Step 1: Escrever os testes de contrato (falhando)**

Em `tests/unit/ai/llm-contract.test.ts`, adicionar (rodando contra `MockLLMProvider`):

```ts
describe("synthesizeThemes (contrato)", () => {
  const provider = new MockLLMProvider();

  it("retorna insufficientData quando não há achados (FR-007)", async () => {
    const res = await provider.synthesizeThemes({ findings: [], language: "pt-BR" });
    expect("insufficientData" in res && res.insufficientData).toBe(true);
  });

  it("nunca retorna tema sem findingRefs (§II)", async () => {
    const res = await provider.synthesizeThemes({
      findings: [
        { extractionValueId: "ev1", recordId: "r1", fieldName: "Desfecho", value: "x" },
        { extractionValueId: "ev2", recordId: "r2", fieldName: "Desfecho", value: "y" },
      ],
      language: "pt-BR",
    });
    if ("insufficientData" in res) throw new Error("esperava temas");
    expect(res.themes.length).toBeGreaterThan(0);
    for (const t of res.themes) {
      expect(t.findingRefs.length).toBeGreaterThan(0);
      expect(t.provenance.model).toBeTruthy();
      expect(t.narrative).toBeTruthy();
    }
  });

  it("estimateCost aceita o kind synthesis_batch", async () => {
    const est = await provider.estimateCost({ kind: "synthesis_batch", itemCount: 5 });
    expect(est.tokensEstimated).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/ai/llm-contract.test.ts`
Expected: FAIL — `synthesizeThemes` não existe; `estimateCost` rejeita o kind.

- [ ] **Step 3: Estender `types.ts`**

```ts
export interface SynthesisFinding {
  extractionValueId: string; // âncora de grounding (Q3)
  recordId: string;
  fieldName: string;
  value: unknown; // final_value ratificado
}

export interface SynthesizedTheme {
  name: string;
  narrative: string; // pt-BR
  findingRefs: string[]; // extractionValueId[] — nunca vazio
  provenance: Provenance;
}

export type SynthesizeThemesResult =
  | { themes: SynthesizedTheme[] }
  | { insufficientData: true };
```

No `interface LLMProvider`, adicionar o método e estender o union de `estimateCost`:

```ts
  /** Agrupa achados ratificados em temas + narrativa pt-BR (US1/FR-001). Grounding
   *  obrigatório: nenhum tema sem findingRefs. Sem achados ⇒ insufficientData (FR-007). */
  synthesizeThemes(input: {
    findings: SynthesisFinding[];
    language: "pt-BR";
  }): Promise<SynthesizeThemesResult>;

  estimateCost(
    input:
      | { itemCount: number; kind: "ai_screening_batch" }
      | { itemCount: number; kind: "ai_extraction_batch"; fieldCount: number }
      | { itemCount: number; kind: "synthesis_batch" },
  ): Promise<CostEstimate>;
```

- [ ] **Step 4: Adicionar `estimateSynthesisCost` em `cost.ts`**

```ts
const TOKENS_PER_STUDY_SYNTHESIS = 1200; // heurística (refinar com métricas reais)

/** Estimativa de custo de síntese: ~1 passe agregando os achados de N estudos. */
export function estimateSynthesisCost(itemCount: number): CostEstimate {
  const items = Math.max(0, Math.trunc(itemCount));
  const tokensEstimated = items * TOKENS_PER_STUDY_SYNTHESIS;
  return {
    tokensEstimated,
    cost: { usd: (tokensEstimated / 1000) * USD_PER_1K_TOKENS },
  };
}
```

- [ ] **Step 5: Implementar em `mock.ts`**

Adicionar o ramo no `estimateCost` e o método (determinístico, pt-BR, agrupa por `fieldName`):

```ts
  // dentro de estimateCost, antes do return final:
  if (input.kind === "synthesis_batch") {
    return estimateSynthesisCost(input.itemCount); // importar de "./cost"
  }

  async synthesizeThemes(input: {
    findings: SynthesisFinding[];
    language: "pt-BR";
  }): Promise<SynthesizeThemesResult> {
    if (input.findings.length === 0) return { insufficientData: true };
    // Determinístico: um tema por fieldName, ancorado nos achados daquele campo.
    const byField = new Map<string, SynthesisFinding[]>();
    for (const f of input.findings) {
      const arr = byField.get(f.fieldName) ?? [];
      arr.push(f);
      byField.set(f.fieldName, arr);
    }
    const themes: SynthesizedTheme[] = [...byField.entries()].map(([field, fs]) => ({
      name: `Tema: ${field}`,
      narrative: `Síntese simulada sobre ${field} em ${fs.length} estudo(s).`,
      findingRefs: fs.map((f) => f.extractionValueId),
      provenance: provenance(`synthesize:${field}`),
    }));
    return { themes };
  }
```

- [ ] **Step 6: Implementar em `anthropic.ts`**

Mirror o padrão dos métodos existentes (`extractFields`/`preclassifyScreening`): montar prompt pt-BR instruindo agrupamento temático **somente** sobre os achados fornecidos (sem inferência sem âncora), exigir JSON `{themes:[{name,narrative,findingRefs}]}` com `findingRefs ⊆ extractionValueId` de entrada, e validar/derrubar tema com `findingRefs` vazio. Sem achados ⇒ `{insufficientData:true}`. Anexar `provenance` via `this.identity()`. Adicionar o ramo `synthesis_batch` ao `estimateCost` chamando `estimateSynthesisCost`.

- [ ] **Step 7: Rodar até verde**

Run: `npx vitest run tests/unit/ai/llm-contract.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai/llm tests/unit/ai/llm-contract.test.ts
git commit -m "feat(synthesis): LLMProvider.synthesizeThemes + synthesis_batch estimate (US1/FR-001,006,007)"
```

---

## Task 3: `buildThemeSummaryTable` — tabela-resumo estudos×campos (A1, pura)

**Files:**
- Create: `src/lib/synthesis/summary-table.ts`
- Test: `tests/unit/synthesis/summary-table.test.ts`

A1 (decidido): linhas = estudos referenciados pelos `theme_finding` do tema; colunas = os `extraction_field` presentes nesses achados; célula = `final_value` (ou marcação "não encontrado"). **Recomputável** de `theme_finding` (o jsonb é só snapshot).

- [ ] **Step 1: Escrever o teste (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { buildThemeSummaryTable } from "@/lib/synthesis/summary-table";

const findings = [
  { recordId: "r1", recordLabel: "Silva 2020", fieldName: "Desfecho", finalValue: "melhora" },
  { recordId: "r1", recordLabel: "Silva 2020", fieldName: "N", finalValue: 30 },
  { recordId: "r2", recordLabel: "Souza 2021", fieldName: "Desfecho", finalValue: "sem efeito" },
];

describe("buildThemeSummaryTable (A1)", () => {
  it("monta colunas = união de campos, 1 linha por estudo", () => {
    const t = buildThemeSummaryTable(findings);
    expect(t.columns).toEqual(["Desfecho", "N"]);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toEqual({ recordId: "r1", label: "Silva 2020", cells: { Desfecho: "melhora", N: 30 } });
  });

  it("marca célula ausente como não encontrado (null)", () => {
    const t = buildThemeSummaryTable(findings);
    const souza = t.rows.find((r) => r.recordId === "r2")!;
    expect(souza.cells["N"]).toBeNull();
  });

  it("corpus vazio ⇒ tabela vazia (sem colunas, sem linhas)", () => {
    const t = buildThemeSummaryTable([]);
    expect(t.columns).toEqual([]);
    expect(t.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/synthesis/summary-table.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
export interface SummaryFinding {
  recordId: string;
  recordLabel: string;
  fieldName: string;
  finalValue: unknown;
}

export interface ThemeSummaryTable {
  columns: string[];
  rows: { recordId: string; label: string; cells: Record<string, unknown> }[];
}

/** A1: estudos×campos, derivada estritamente dos achados (theme_finding). Recomputável. */
export function buildThemeSummaryTable(findings: SummaryFinding[]): ThemeSummaryTable {
  const columns: string[] = [];
  for (const f of findings) if (!columns.includes(f.fieldName)) columns.push(f.fieldName);

  const byRecord = new Map<string, { label: string; cells: Record<string, unknown> }>();
  for (const f of findings) {
    const row = byRecord.get(f.recordId) ?? { label: f.recordLabel, cells: {} };
    row.cells[f.fieldName] = f.finalValue;
    byRecord.set(f.recordId, row);
  }

  const rows = [...byRecord.entries()].map(([recordId, r]) => ({
    recordId,
    label: r.label,
    cells: Object.fromEntries(columns.map((c) => [c, c in r.cells ? r.cells[c] : null])),
  }));
  return { columns, rows };
}
```

- [ ] **Step 4: Rodar até verde**

Run: `npx vitest run tests/unit/synthesis/summary-table.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/synthesis/summary-table.ts tests/unit/synthesis/summary-table.test.ts
git commit -m "feat(synthesis): buildThemeSummaryTable estudos×campos recomputável (A1/US1)"
```

---

## Task 4: Synthesis queries (pool de achados, candidatos, carga)

**Files:**
- Create: `src/lib/synthesis/queries.ts`
- Test: coberto pela integração na Task 10 (queries com RLS).

Mirror: `src/lib/extraction/queries.ts` (`listExtractionBatchCandidates`, `listExtractionFields`).

- [ ] **Step 1: Implementar as queries**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SynthesisFinding } from "@/lib/ai/llm/types";

/** Achados ratificados (accepted/edited) de um estudo — pool de grounding (Q3). */
export async function collectRatifiedFindings(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordId: string,
): Promise<SynthesisFinding[]> {
  const { data, error } = await deps.supabase
    .from("extraction_value")
    .select("id, record_id, final_value, extraction_field(name)")
    .eq("review_id", reviewId)
    .eq("record_id", recordId)
    .in("state", ["accepted", "edited"]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((v: any) => ({
    extractionValueId: v.id,
    recordId: v.record_id,
    fieldName: v.extraction_field?.name ?? "",
    value: v.final_value,
  }));
}

/** Conta estudos elegíveis à síntese (included_ft com ≥1 achado ratificado) — FR-006. */
export async function countSynthesisCandidates(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<number> {
  const { data, error } = await deps.supabase
    .from("record")
    .select("id, extraction_value!inner(state)")
    .eq("review_id", reviewId)
    .eq("corpus_state", "included_ft")
    .in("extraction_value.state", ["accepted", "edited"]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: any) => r.id)).size;
}

/** Carrega a síntese + temas (não-rejeitados, ordenados) + grounding para a UI. */
export async function loadSynthesis(
  deps: { supabase: SupabaseClient },
  reviewId: string,
) {
  const { data: synthesis } = await deps.supabase
    .from("synthesis").select("*").eq("review_id", reviewId).maybeSingle();
  if (!synthesis) return null;
  const { data: themes } = await deps.supabase
    .from("theme")
    .select("*, theme_finding(extraction_value_id, order)")
    .eq("synthesis_id", synthesis.id)
    .neq("state", "rejected")
    .order("order");
  return { synthesis, themes: themes ?? [] };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/synthesis/queries.ts
git commit -m "feat(synthesis): queries — pool de achados ratificados + candidatos + carga (US1)"
```

---

## Task 5: Worker Node — enqueue, batch-worker, batch-run

**Files:**
- Create: `src/lib/synthesis/enqueue.ts`, `src/lib/synthesis/batch-worker.ts`, `src/lib/synthesis/batch-run.ts`
- Test: `tests/unit/synthesis/batch-worker.test.ts`

Mirror: `src/lib/extraction/enqueue.ts`, `batch-worker.ts`, `batch-run.ts`. Item = um estudo; o worker coleta o pool por estudo, agrega com `synthesizeThemes`, persiste `theme`+`theme_finding`+`ai_suggestion`, grava `ai_usage(phase='synthesis')`, é resiliente por-item e retomável (só itens `pending`).

- [ ] **Step 1: `enqueue.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SynthesisEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/** Cria o job synthesis_batch (RPC create_synthesis_job) e conta os itens. Só
 *  enfileira (§VIII); o worker Node agrega. Espelha enqueueExtractionJob. */
export async function enqueueSynthesisJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<SynthesisEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc("create_synthesis_job", {
    p_review_id: reviewId,
  });
  if (error) throw new Error(error.message);
  const { count, error: cErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  if (cErr) throw new Error(cErr.message);
  return { job_id: job.id, status: "queued", item_count: count ?? 0 };
}
```

- [ ] **Step 2: Escrever o teste do worker (falhando)**

`tests/unit/synthesis/batch-worker.test.ts` com um fake Supabase client em memória (mirror do estilo de `batch-worker.test.ts` da extração se existir; senão, fake mínimo) verificando:
- agrega o pool e cria ≥1 `theme` + `theme_finding` por achado referenciado;
- corpus sem achados ⇒ `synthesis.status='draft'` e nenhum tema (insufficientData, FR-007);
- falha em um estudo marca o `job_item` como `failed` sem derrubar o job (FR-005);
- grava `ai_usage(phase='synthesis')`;
- re-rodar preserva temas `accepted/edited` (não recria/duplica — FR-005a).

```ts
import { describe, it, expect } from "vitest";
import { processSynthesisJob } from "@/lib/synthesis/batch-worker";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
// makeFakeSupabase(): stub com from()/rpc() suficiente para o worker (mirror extração).

it("agrega achados em temas com grounding (US1)", async () => {
  const supabase = makeFakeSupabase({
    items: [{ id: "i1", review_id: "rev", payload: { record_id: "r1" }, attempts: 0 }],
    findings: { r1: [
      { extractionValueId: "ev1", recordId: "r1", fieldName: "Desfecho", value: "x" },
    ] },
  });
  const res = await processSynthesisJob({ supabase, provider: new MockLLMProvider() }, "job1");
  expect(res.status).toBe("completed");
  expect(supabase.inserted("theme").length).toBeGreaterThan(0);
  expect(supabase.inserted("theme_finding").length).toBeGreaterThan(0);
  expect(supabase.inserted("ai_usage").some((u) => u.phase === "synthesis")).toBe(true);
});

it("corpus sem achados ⇒ insufficientData, synthesis draft (FR-007)", async () => {
  const supabase = makeFakeSupabase({
    items: [{ id: "i1", review_id: "rev", payload: { record_id: "r1" }, attempts: 0 }],
    findings: { r1: [] },
  });
  const res = await processSynthesisJob({ supabase, provider: new MockLLMProvider() }, "job1");
  expect(supabase.inserted("theme")).toHaveLength(0);
  expect(supabase.updated("synthesis").pop()?.status).toBe("draft");
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/unit/synthesis/batch-worker.test.ts`
Expected: FAIL — `processSynthesisJob` não existe.

- [ ] **Step 4: Implementar `batch-worker.ts`**

Estrutura (mirror `processExtractionJob`): `job→running`; carregar `synthesis` da Revisão (criar se ausente) e setar `status='generating'`; ler `job_item` `pending`; para cada estudo: `collectRatifiedFindings` e acumular no pool, marcando `done`/`failed` por-item resiliente. Após o loop: se pool vazio ⇒ `synthesis.status='draft'` e encerra (FR-007). Senão `synthesizeThemes(pool)`; se `insufficientData` ⇒ `draft`. Senão, **preservando** temas `accepted/edited` existentes (não apagar — FR-005a), inserir os temas novos `state='pending'` com `ai_suggestion(target_kind='synthesis_theme', grounding=findingRefs, provenance)` + `theme_finding` por `findingRef`; computar `summary_table` via `buildThemeSummaryTable`. Inserir `ai_usage(phase='synthesis', job_id)`. Fechar: `job.status/progress` (mirror) + `synthesis.status='ready'|'failed'`.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { collectRatifiedFindings } from "./queries";
import { buildThemeSummaryTable } from "./summary-table";

export interface SynthesisBatchDeps { supabase: SupabaseClient; provider: LLMProvider; }
export interface SynthesisBatchResult {
  job_id: string; status: "completed" | "completed_with_errors" | "failed";
  done: number; failed: number;
}

export async function processSynthesisJob(
  deps: SynthesisBatchDeps, jobId: string,
): Promise<SynthesisBatchResult> {
  // ... ver descrição acima; mirror processExtractionJob para o ciclo job/job_item.
}
```

- [ ] **Step 5: `batch-run.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { processSynthesisJob } from "./batch-worker";

/** Processa os jobs synthesis_batch ativos da Revisão. Espelha runExtractionBatchWorkerWith. */
export async function runSynthesisBatchWorkerWith(
  supabase: SupabaseClient, provider: LLMProvider, reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job").select("id")
    .eq("review_id", reviewId).eq("type", "synthesis_batch")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processSynthesisJob({ supabase, provider }, j.id);
  }
}
```

- [ ] **Step 6: Rodar até verde**

Run: `npx vitest run tests/unit/synthesis/batch-worker.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/synthesis/enqueue.ts src/lib/synthesis/batch-worker.ts src/lib/synthesis/batch-run.ts tests/unit/synthesis/batch-worker.test.ts
git commit -m "feat(synthesis): worker Node — enqueue + agrega temas/grounding resiliente (US1/FR-005,005a,007)"
```

---

## Task 6: Server actions — estimar, gerar, ratificar

**Files:**
- Create: `app/reviews/[reviewId]/synthesis/actions.ts`
- Test: coberto por integração (Task 10) + componentes (Task 8) com mock.

Mirror: `app/reviews/[reviewId]/extraction/actions.ts` (`requireMember`, `revalidate`, fallback `getLLMProvider`→`MockLLMProvider`, `estimate*`, `run*Batch`).

- [ ] **Step 1: Implementar as actions**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider } from "@/lib/ai/llm";
import { MissingByokError } from "@/lib/ai/llm/types";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueSynthesisJob } from "@/lib/synthesis/enqueue";
import { runSynthesisBatchWorkerWith } from "@/lib/synthesis/batch-run";
import { countSynthesisCandidates } from "@/lib/synthesis/queries";

async function requireMember(reviewId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase.rpc("is_review_member", { p_review_id: reviewId });
  if (error || !data) throw new Error("not a member");
  return { supabase };
}
function revalidate(reviewId: string) {
  revalidatePath(`/reviews/${reviewId}/synthesis`);
}
async function resolveProvider(reviewId: string) {
  try { return { provider: await getLLMProvider(reviewId), byokMissing: false }; }
  catch (e) {
    if (e instanceof MissingByokError) return { provider: new MockLLMProvider(), byokMissing: true };
    throw e;
  }
}

/** Estimativa ANTES do lote (FR-006). NÃO cria job. */
export async function estimateSynthesis(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const itemCount = await countSynthesisCandidates({ supabase }, reviewId);
  const { provider, byokMissing } = await resolveProvider(reviewId);
  const estimate = await provider.estimateCost({ kind: "synthesis_batch", itemCount });
  return { ok: true as const, itemCount, estimate, byokMissing };
}

/** Enfileira + roda o worker Node (FR-005). Re-gerar preserva accepted/edited (FR-005a). */
export async function runSynthesis(reviewId: string) {
  await requireMember(reviewId);
  const admin = createAdminClient();
  const { provider } = await resolveProvider(reviewId);
  const enq = await enqueueSynthesisJob({ supabase: admin }, reviewId);
  if (enq.item_count === 0) { revalidate(reviewId); return { ok: true as const, jobId: enq.job_id, itemCount: 0 }; }
  await runSynthesisBatchWorkerWith(admin, provider, reviewId);
  revalidate(reviewId);
  return { ok: true as const, jobId: enq.job_id, itemCount: enq.item_count };
}

// ---- Ratificação humano-no-laço (a IA nunca chama, §I) ----
export async function acceptTheme(reviewId: string, themeId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("set_theme_state", { p_theme_id: themeId, p_state: "accepted" });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId); return { ok: true as const };
}
export async function editTheme(reviewId: string, themeId: string, input: { name?: string; narrative?: string }) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("set_theme_state", {
    p_theme_id: themeId, p_state: "edited",
    p_name: input.name ?? null, p_narrative: input.narrative ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId); return { ok: true as const };
}
export async function rejectTheme(reviewId: string, themeId: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("set_theme_state", { p_theme_id: themeId, p_state: "rejected" });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId); return { ok: true as const };
}
export async function reorderThemes(reviewId: string, synthesisId: string, themeIds: string[]) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("reorder_themes", { p_synthesis_id: synthesisId, p_theme_ids: themeIds });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId); return { ok: true as const };
}
export async function mergeThemes(reviewId: string, themeIds: string[], name: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("merge_themes", { p_theme_ids: themeIds, p_name: name });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId); return { ok: true as const };
}
export async function splitTheme(
  reviewId: string, themeId: string,
  parts: { name: string; narrative?: string; findingRefs: string[] }[],
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("split_theme", { p_theme_id: themeId, p_parts: parts });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId); return { ok: true as const };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add "app/reviews/[reviewId]/synthesis/actions.ts"
git commit -m "feat(synthesis): server actions — estimar/gerar + ratificação (accept/edit/reject/merge/split/reorder) (US1/FR-003,004,006)"
```

---

## Task 7: Trilho — adicionar a fase `synthesis`

**Files:**
- Modify: `src/lib/shell/phases.ts`
- Test: `tests/unit/shell/phases.test.ts`

- [ ] **Step 1: Escrever/estender o teste (falhando)**

Adicionar caso: com `extractionRatified=true`, a fase `synthesis` é `current`/disponível e seu `href` aponta para `/reviews/:id/synthesis`; sem extração ratificada, fica `locked`.

```ts
it("expõe a fase synthesis após extração ratificada", () => {
  const phases = computePhaseStates("rev", baseInput({ extractionRatified: true }));
  const synth = phases.find((p) => p.key === "synthesis");
  expect(synth).toBeDefined();
  expect(synth!.href).toBe("/reviews/rev/synthesis");
  expect(synth!.status).not.toBe("locked");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/shell/phases.test.ts`
Expected: FAIL — chave `synthesis` ausente.

- [ ] **Step 3: Implementar**

Adicionar `"synthesis"` ao type `PhaseKey` e ao `PIPELINE` (após a fase de extração), com gating baseado em `i.extractionRatified` (fica `locked` enquanto for falso) e `completed` em `i.synthesisReady`:

```ts
  {
    key: "synthesis",
    label: "Síntese",
    href: (id) => `/reviews/${id}/synthesis`,
    completed: (i) => i.synthesisReady ?? false, // adicionar synthesisReady a PhaseInput
  },
```

Estender `PhaseInput` com `synthesisReady: boolean` e, em `getPhaseInput` (a função que monta o input no fim do arquivo), computar `synthesisReady` = existe `synthesis.status='ready'` na Revisão. Garantir que o gating de `locked`/`current` use `extractionRatified` (mesmo predicado já carregado no arquivo).

- [ ] **Step 4: Rodar até verde**

Run: `npx vitest run tests/unit/shell/phases.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell/phases.ts tests/unit/shell/phases.test.ts
git commit -m "feat(synthesis): adiciona a fase Síntese ao trilho (US1)"
```

---

## Task 8: Componentes da síntese (reusando `src/components/ai/*`)

**Files:**
- Create: `src/components/synthesis/{ThemeList,ThemeCard,NarrativeEditor,SummaryTable,GroundingRefs,SynthesisRunner,InsufficientData}.tsx`
- Test: `tests/unit/synthesis/components.test.tsx`

Reuso obrigatório: `SuggestionChip` (estado pending/accepted/edited/rejected), `SuggestionActions` (aceitar/editar/rejeitar), `ProvenancePopover` (proveniência §II), `NotFound` (base de `InsufficientData`), `AsyncActionButton`.

- [ ] **Step 1: Escrever os testes de componente (falhando)**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ThemeCard } from "@/components/synthesis/ThemeCard";
import { InsufficientData } from "@/components/synthesis/InsufficientData";

const theme = {
  id: "t1", name: "Tema A", narrative: "Narrativa pt-BR", state: "pending",
  summary_table: { columns: ["N"], rows: [{ recordId: "r1", label: "Silva 2020", cells: { N: 30 } }] },
  theme_finding: [{ extraction_value_id: "ev1", order: 0 }],
  provenance: { model: "mock-llm", version: "0.0.0", prompt_or_span: "x", timestamp: "t" },
};

describe("ThemeCard", () => {
  it("mostra nome, narrativa, chip de estado e refs de grounding", () => {
    render(<ThemeCard reviewId="rev" synthesisId="s1" theme={theme as any} />);
    expect(screen.getByText("Tema A")).toBeInTheDocument();
    expect(screen.getByText(/Narrativa pt-BR/)).toBeInTheDocument();
    expect(screen.getByText(/pendente/i)).toBeInTheDocument();
    expect(screen.getByText(/1 achado/i)).toBeInTheDocument(); // grounding visível
  });
});

describe("InsufficientData", () => {
  it("comunica dados insuficientes (FR-007)", () => {
    render(<InsufficientData />);
    expect(screen.getByText(/dados insuficientes/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/synthesis/components.test.tsx`
Expected: FAIL — componentes não existem.

- [ ] **Step 3: Implementar os componentes**

- `ThemeCard` (client): renderiza `name`, `NarrativeEditor`, `SuggestionChip(state)`, `SuggestionActions` ligado às actions (`acceptTheme`/`editTheme`/`rejectTheme`), `GroundingRefs` (conta + lista os `theme_finding`, com `ProvenancePopover`), e `SummaryTable`.
- `NarrativeEditor` (client): textarea pt-BR controlada; salvar chama `editTheme` (move estado→edited); a11y (label, foco).
- `SummaryTable`: renderiza `ThemeSummaryTable` (estudos×linhas, campos×colunas; célula null ⇒ "não encontrado").
- `GroundingRefs`: "{n} achado(s)" + lista de `extraction_value_id` com `ProvenancePopover`.
- `InsufficientData`: usa `NotFound` com texto "Dados insuficientes para gerar a síntese" (FR-007).
- `SynthesisRunner` (client): botão "Gerar síntese" que primeiro chama `estimateSynthesis` (mostra custo/itens + aviso `byokMissing`, FR-006) e, na confirmação, `runSynthesis`; reaproveita `AsyncActionButton`.
- `ThemeList`: ordena por `order`, controles de `reorderThemes`, e botões merge/split.

- [ ] **Step 4: Rodar até verde**

Run: `npx vitest run tests/unit/synthesis/components.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/synthesis tests/unit/synthesis/components.test.tsx
git commit -m "feat(synthesis): componentes (temas/narrativa/tabela/grounding/runner) reusando ai/* (US1/FR-002,003,006,007)"
```

---

## Task 9: Página da síntese (Server Component + wiring)

**Files:**
- Create: `app/reviews/[reviewId]/synthesis/page.tsx`
- Test: smoke via integração (a página é fina; lógica testada nas Tasks 4–8).

Mirror: `app/reviews/[reviewId]/search/page.tsx` (Server Component que carrega via lib e passa para componentes client).

- [ ] **Step 1: Implementar a página**

```tsx
import { createClient } from "@/lib/supabase/server";
import { loadSynthesis, countSynthesisCandidates } from "@/lib/synthesis/queries";
import { ThemeList } from "@/components/synthesis/ThemeList";
import { SynthesisRunner } from "@/components/synthesis/SynthesisRunner";
import { InsufficientData } from "@/components/synthesis/InsufficientData";

export default async function SynthesisPage({
  params,
}: { params: { reviewId: string } }) {
  const supabase = await createClient();
  const reviewId = params.reviewId;
  const data = await loadSynthesis({ supabase }, reviewId);
  const candidates = await countSynthesisCandidates({ supabase }, reviewId);

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Síntese qualitativa</h1>
        <SynthesisRunner reviewId={reviewId} candidateCount={candidates} />
      </header>
      {!data || data.themes.length === 0 ? (
        candidates === 0 ? <InsufficientData /> : <p>Gere a síntese para começar.</p>
      ) : (
        <ThemeList reviewId={reviewId} synthesisId={data.synthesis.id} themes={data.themes} />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verificar build/lint/types**

Run: `npm run lint && npx tsc --noEmit`
Expected: limpos.

- [ ] **Step 3: Commit**

```bash
git add "app/reviews/[reviewId]/synthesis/page.tsx"
git commit -m "feat(synthesis): página da síntese (Server Component + runner + estado insuficiente) (US1)"
```

---

## Task 10: Integração — RLS + regeneração preserva edições humanas

**Files:**
- Create: `tests/integration/synthesis.test.ts`

> Restrição (memória [[integration-tests-cant-call-server-client-wrappers]]): testes de integração batem direto na camada de dados (admin/anon client) — **não** chamam server actions que usam `cookies()`. Usar `createAdminClient` + um anon client setado para usuário não-membro, no padrão dos testes de RLS do Marco 2.

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from "vitest";
// helpers de seed do Marco 2 (review, member, record included_ft, extraction_value accepted)

describe("synthesis — RLS + regeneração", () => {
  it("isola synthesis/theme/theme_finding por membro (SC-008)", async () => {
    // não-membro não lê nem escreve synthesis/theme/theme_finding da Revisão.
  });

  it("re-gerar preserva temas accepted/edited (FR-005a)", async () => {
    // 1ª geração ⇒ temas pending; aceitar um; editar outro;
    // 2ª geração (processSynthesisJob) ⇒ os temas accepted/edited continuam presentes
    // e não foram duplicados/sobrescritos; novos temas entram como pending.
  });

  it("grounding obrigatório: nenhum theme ativo sem theme_finding (§II)", async () => {
    // todo theme não-rejeitado tem ≥1 theme_finding.
  });

  it("corpus sem extração ratificada ⇒ create_synthesis_job cria 0 itens / status draft (FR-007)", async () => {
    // ...
  });
});
```

- [ ] **Step 2: Rodar (com Supabase local de pé) até verde**

Run: `npx vitest run tests/integration/synthesis.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/synthesis.test.ts
git commit -m "test(synthesis): integração — RLS + regeneração preserva edições + grounding (SC-008/FR-005a/007)"
```

---

## Gate final da fatia (CHECKPOINT 3)

- [ ] `npx vitest run` (suíte unit+integration) — verde.
- [ ] `npm run lint` — sem warnings/erros.
- [ ] `npx tsc --noEmit` — 0 erros.
- [ ] Apresentar ao dev: branch `build/003-marco3-saida-sintese-relatorio/2-synthesis`, diff, saída dos 3 portões. **PARAR** e aguardar o merge manual (não encadear a Fatia 3).

---

## Self-Review (cobertura do spec)

- **FR-001** geração de temas/narrativa/tabela-resumo — Tasks 2,5,8.
- **FR-002** proveniência + grounding nível de achado — Tasks 1 (`theme_finding`/`ai_suggestion.grounding`), 5, 8 (`GroundingRefs`/`ProvenancePopover`).
- **FR-003** renomear/fundir/dividir/reordenar/editar/rejeitar — Tasks 1 (RPCs), 6 (actions), 8 (UI).
- **FR-004** auditoria append-only de toda ratificação — Task 1 (cada RPC insere `audit_entry`).
- **FR-005** job assíncrono resiliente/retomável com progresso — Tasks 1,5,9.
- **FR-005a** síntese 1:1 mutável; re-gerar preserva edições — Tasks 1 (`unique`), 5 (preservação), 10 (teste).
- **FR-006** estimativa de custo antes do lote — Tasks 2,6,8.
- **FR-007** recusa sem dados (insufficientData 1ª classe) — Tasks 2,5,8,10.
- **FR-024** saída pt-BR — Tasks 2 (contrato), 8.
- **FR-026** `ai_usage(phase=synthesis)` — Task 5.
- **SC-001/006/007/008** — cobertos por Tasks 5,8,10 (o e2e ponta-a-ponta US1→relatório→export é da Fatia 6).

**Type consistency:** `synthesizeThemes`/`SynthesisFinding`/`SynthesizedTheme` (Task 2) consumidos por worker (5); A1 usa `SummaryFinding` próprio (3). RPCs (`set_theme_state`/`reorder_themes`/`merge_themes`/`split_theme`/`create_synthesis_job`) batem com as actions (6). `phases.ts` ganha `synthesisReady` em `PhaseInput` (7).
