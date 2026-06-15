# Fatia 4 — Checklist PRISMA 2020 + Tabela de características (US4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Contrato Sessão B**: commitar **somente** no branch isolado `build/003-marco3-saida-sintese-relatorio/4-checklist-characteristics`; **nunca** merge/push para a feature ou `main`. Ao fim, **PARAR** (CHECKPOINT 3) e aguardar merge do usuário.

**Goal:** Gerar os dois artefatos de conformidade do relatório — um **checklist PRISMA 2020 de 27 itens auto-preenchido** (cada item `met | pending | not_applicable` com referência à seção que o cobre, snapshot por Revisão) e uma **tabela de características** dos estudos incluídos (1 linha por estudo `included_ft`, colunas = campos do formulário de extração) — tudo **determinístico (sem LLM)**, em pt-BR, e exibido no relatório.

**Architecture:** Espelha o padrão das fatias anteriores: migration+RLS primeiro (Princípio IV); lógica em **funções puras** testáveis sem DB (`deriveChecklist`, `assembleCharacteristics`) + finos wrappers IO (`computePrismaChecklist`, `buildCharacteristicsTable`) na convenção deps-injection (`{ supabase }`) já usada em `report/queries.ts` e `extraction/queries.ts`. O checklist é **snapshot gravado na geração/regeneração do relatório** (R5) — `snapshotPrismaChecklist` é chamado no fim de `processReportDraftJob` (worker, admin client) **e** de `regenerateDeterministicSections` (server action, member client); a RLS `is_review_member` permite a escrita do membro e o admin a bypassa. A tabela de características é **derivação pura** de `extraction_value × extraction_field` (R6) — **sem tabela nova**, computada sob demanda (como `buildPrismaFlowModel`). O seed dos 27 itens é uma **constante TS estática** em `src/lib/prisma/` (R5: "seed estático em `src/lib/prisma/`"), não dados SQL — a migration só cria a tabela-snapshot/enum/RLS.

**Tech Stack:** Next.js 14 (App Router, Server Components), TypeScript strict, Supabase (Postgres + RLS), Vitest (unit/integration). **Sem libs novas** e **sem LLM** (US4 é 100% determinística). Exportação (embutir checklist/características em DOCX/PDF/MD) é Fatia 5/6 — fora de escopo aqui.

**Branch:** `build/003-marco3-saida-sintese-relatorio/4-checklist-characteristics` (criar de feature HEAD `1290f65` via `using-git-worktrees`).

**Cobre:** US4 — FR-018 (checklist auto-preenchido), FR-019 (tabela de características), FR-025 (RLS por Revisão); SC-009 (parte checklist, junto com a declaração de fases off da Fatia 3). **A\*:** — (nenhum item de ambiguidade atribuído; a fatia completa SC-009 com a Fatia 3).

---

## Decisão de design para revisão no CHECKPOINT 2

**Mapa de cobertura dos 27 itens PRISMA 2020 → estado do relatório.** A norma PRISMA 2020 fixa os 27 itens (Task 2 traz o seed completo, pt-BR). O que **não** é normativo é *como* inferir `met/pending/not_applicable` a partir do que **este** sistema realmente produz. A regra adotada (determinística e defensável):

- **`met`** quando a seção/dado que cobre o item existe e está preenchido:
  itens cobertos por **Métodos** (objetivos, elegibilidade, fontes, busca, coleta, métodos de síntese, registro/protocolo), por **Resultados** (resultados individuais e de síntese), por **Discussão**, pela **seleção de estudos** (contadores PRISMA/fluxograma) e pela **tabela de características** (itens de dados + características dos estudos).
- **`not_applicable`** para os itens das **fases opcionais desligadas** (Risco de Viés: itens 11, 14, 18, 21; Certeza: itens 15, 22) — realiza a declaração explícita de D19/§VI/SC-009.
- **`pending`** para itens que o sistema **não gera** na v1 (Título, Resumo, Justificativa, Medidas de efeito, Financiamento, Conflitos de interesse, Disponibilidade de dados/código) — exatamente o caso US4.3 ("item que o relatório não cobre → pendente, não atendido").

O mapeamento exato item→regra está na constante `PRISMA_2020_ITEMS` (Task 2). **Se você quiser outra alocação (ex.: tratar "Medidas de efeito" como `not_applicable` por ser revisão qualitativa, ou mapear item 13 para Resultados), ajuste o `rule`/`sectionRef` da linha correspondente** — a engine (Task 3) é agnóstica ao mapa.

---

## File Structure

**Migration (Task 1)**
- Create `supabase/migrations/0020_prisma_checklist.sql` — enum `prisma_checklist_status`, tabela `prisma_checklist_item` (snapshot por Revisão, UNIQUE `(review_id, item_code)`), RLS `is_review_member`.

**Lógica nova — `src/lib/prisma/` (Tasks 2–5)**
- Create `src/lib/prisma/checklist-items.ts` — seed estático dos 27 itens PRISMA 2020 (`PRISMA_2020_ITEMS`) + tipos `CoverageRule`/`ChecklistSeedItem`.
- Create `src/lib/prisma/checklist.ts` — `deriveChecklist` (pura), `computePrismaChecklist` (IO), `snapshotPrismaChecklist` (IO, upsert), `loadPrismaChecklist` (IO, leitura UI).
- Create `src/lib/prisma/characteristics.ts` — `assembleCharacteristics` (pura), `buildCharacteristicsTable` (IO).

**Integração nos pipelines da Fatia 3 — extensão (Task 6)**
- Modify `src/lib/report/batch-worker.ts` — chamar `snapshotPrismaChecklist` ao fim de `processReportDraftJob` (antes de `status='ready'`).
- Modify `src/lib/report/regenerate.ts` — chamar `snapshotPrismaChecklist` ao fim de `regenerateDeterministicSections`.

**UI — `src/components/report/` + página (Task 7)**
- Create `src/components/report/PrismaChecklistPanel.tsx` — painel read-only do checklist (server component).
- Create `src/components/report/CharacteristicsTablePanel.tsx` — painel read-only da tabela (server component).
- Modify `app/reviews/[reviewId]/report/page.tsx` — carregar e renderizar os dois painéis após as seções.

**Testes (Tasks 3, 4, 8)**
- Create `tests/unit/prisma/checklist.test.ts` — cobertura met/pending/not_applicable (pura).
- Create `tests/unit/prisma/characteristics.test.ts` — derivação da tabela (pura).
- Create `tests/integration/prisma-checklist.test.ts` — RLS + snapshot na geração + regeneração refaz o snapshot.

---

## Task 1: Migration — `prisma_checklist_item` (snapshot + RLS)

**Files:**
- Create: `supabase/migrations/0020_prisma_checklist.sql`
- Test: `tests/integration/prisma-checklist.test.ts` (criado na Task 8; a RLS é validada lá)

- [ ] **Step 1: Escrever a migration**

Espelha o padrão de `0019_report.sql` (enum + tabela + `enable row level security` + policy `is_review_member` `for all`). UNIQUE `(review_id, item_code)` torna o snapshot idempotente (upsert por item). Sem RPC: a escrita do snapshot é feita pelo worker (admin, bypassa RLS) e pela regeneração (member, autorizado pela policy).

```sql
-- ============================================================
-- Marco 3 / Fatia 4 — Checklist PRISMA 2020 auto-preenchido (US4 / FR-018).
-- Snapshot por Revisão: 1 linha por item PRISMA (27 itens, seed estático em TS).
-- Gravado na geração/regeneração do relatório. status computado da cobertura.
-- Aditivo (não-regressão): tabela + enum novos, nenhum ALTER em objeto existente.
-- data-model.md §prisma_checklist_item; research.md R5.
-- ============================================================

create type prisma_checklist_status as enum ('met', 'pending', 'not_applicable');

create table public.prisma_checklist_item (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review(id) on delete cascade,
  item_code text not null,
  label text not null,
  section_ref text,
  status prisma_checklist_status not null,
  computed_at timestamptz not null default now(),
  unique (review_id, item_code)
);
create index prisma_checklist_item_review_idx on public.prisma_checklist_item(review_id);

alter table public.prisma_checklist_item enable row level security;

create policy prisma_checklist_item_member on public.prisma_checklist_item
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));
```

- [ ] **Step 2: Aplicar a migration no Postgres local**

Run: `npx supabase db reset`
Expected: aplica `0001`..`0020` sem erro; termina com "Finished supabase db reset".

- [ ] **Step 3: Type-check (sanidade do repo após reset)**

Run: `npx tsc --noEmit`
Expected: 0 erros (a migration não muda tipos TS ainda).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0020_prisma_checklist.sql
git commit -m "feat(checklist): migration prisma_checklist_item snapshot + RLS (US4)"
```

---

## Task 2: Seed estático dos 27 itens PRISMA 2020

**Files:**
- Create: `src/lib/prisma/checklist-items.ts`

- [ ] **Step 1: Escrever o seed + tipos**

`CoverageRule` é o vocabulário fechado que a engine (Task 3) interpreta. `label`/`sectionRef` em pt-BR (UI). `item_code` = número PRISMA "1".."27".

```ts
import type { SectionKind } from "@/lib/report/types";

/** Regra de cobertura: como inferir o status do item a partir do estado do relatório. */
export type CoverageRule =
  | { type: "section"; kind: SectionKind } // met se a seção existe e não está vazia
  | { type: "study_selection" } // met se há contadores PRISMA (fluxograma)
  | { type: "characteristics" } // met se há tabela de características com dados
  | { type: "optional_off"; phase: "risk_of_bias" | "certainty" } // not_applicable (D19)
  | { type: "manual" }; // pending: sistema não gera este item na v1 (US4.3)

export interface ChecklistSeedItem {
  itemCode: string;
  /** Rótulo pt-BR exibido ao pesquisador. */
  label: string;
  /** Seção do relatório que cobre o item (referência exibida quando `met`). */
  sectionRef: string | null;
  rule: CoverageRule;
}

/**
 * 27 itens do PRISMA 2020 (nível superior). Mapeamento de cobertura → ver
 * "Decisão de design" no IMPLEMENTATION_PLAN.md (revisável no CHECKPOINT 2).
 */
export const PRISMA_2020_ITEMS: ChecklistSeedItem[] = [
  // TÍTULO / RESUMO / INTRODUÇÃO — não gerados pelo sistema na v1 → pending (US4.3)
  { itemCode: "1", label: "Título", sectionRef: null, rule: { type: "manual" } },
  { itemCode: "2", label: "Resumo", sectionRef: null, rule: { type: "manual" } },
  { itemCode: "3", label: "Justificativa", sectionRef: null, rule: { type: "manual" } },
  { itemCode: "4", label: "Objetivos", sectionRef: "Métodos", rule: { type: "section", kind: "methods" } },
  // MÉTODOS
  { itemCode: "5", label: "Critérios de elegibilidade", sectionRef: "Métodos", rule: { type: "section", kind: "methods" } },
  { itemCode: "6", label: "Fontes de informação", sectionRef: "Métodos", rule: { type: "section", kind: "methods" } },
  { itemCode: "7", label: "Estratégia de busca", sectionRef: "Métodos", rule: { type: "section", kind: "methods" } },
  { itemCode: "8", label: "Processo de seleção", sectionRef: "Resultados (fluxograma)", rule: { type: "study_selection" } },
  { itemCode: "9", label: "Processo de coleta de dados", sectionRef: "Métodos", rule: { type: "section", kind: "methods" } },
  { itemCode: "10", label: "Itens de dados", sectionRef: "Tabela de características", rule: { type: "characteristics" } },
  { itemCode: "11", label: "Avaliação do risco de viés nos estudos", sectionRef: null, rule: { type: "optional_off", phase: "risk_of_bias" } },
  { itemCode: "12", label: "Medidas de efeito", sectionRef: null, rule: { type: "manual" } },
  { itemCode: "13", label: "Métodos de síntese", sectionRef: "Métodos", rule: { type: "section", kind: "methods" } },
  { itemCode: "14", label: "Avaliação de viés de relato", sectionRef: null, rule: { type: "optional_off", phase: "risk_of_bias" } },
  { itemCode: "15", label: "Avaliação da certeza da evidência", sectionRef: null, rule: { type: "optional_off", phase: "certainty" } },
  // RESULTADOS
  { itemCode: "16", label: "Seleção dos estudos", sectionRef: "Resultados (fluxograma)", rule: { type: "study_selection" } },
  { itemCode: "17", label: "Características dos estudos", sectionRef: "Tabela de características", rule: { type: "characteristics" } },
  { itemCode: "18", label: "Risco de viés nos estudos", sectionRef: null, rule: { type: "optional_off", phase: "risk_of_bias" } },
  { itemCode: "19", label: "Resultados dos estudos individuais", sectionRef: "Resultados", rule: { type: "section", kind: "results" } },
  { itemCode: "20", label: "Resultados das sínteses", sectionRef: "Resultados", rule: { type: "section", kind: "results" } },
  { itemCode: "21", label: "Vieses de relato", sectionRef: null, rule: { type: "optional_off", phase: "risk_of_bias" } },
  { itemCode: "22", label: "Certeza da evidência", sectionRef: null, rule: { type: "optional_off", phase: "certainty" } },
  // DISCUSSÃO
  { itemCode: "23", label: "Discussão", sectionRef: "Discussão", rule: { type: "section", kind: "discussion" } },
  // OUTRAS INFORMAÇÕES
  { itemCode: "24", label: "Registro e protocolo", sectionRef: "Métodos", rule: { type: "section", kind: "methods" } },
  { itemCode: "25", label: "Apoio / financiamento", sectionRef: null, rule: { type: "manual" } },
  { itemCode: "26", label: "Conflitos de interesse", sectionRef: null, rule: { type: "manual" } },
  { itemCode: "27", label: "Disponibilidade de dados, código e materiais", sectionRef: null, rule: { type: "manual" } },
];
```

- [ ] **Step 2: Sanidade — 27 itens, códigos únicos (type-check)**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/prisma/checklist-items.ts
git commit -m "feat(checklist): seed estatico dos 27 itens PRISMA 2020 + CoverageRule"
```

---

## Task 3: Engine do checklist — `deriveChecklist` (pura) + IO

**Files:**
- Create: `src/lib/prisma/checklist.ts`
- Test: `tests/unit/prisma/checklist.test.ts`

- [ ] **Step 1: Escrever o teste que falha (engine pura)**

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { deriveChecklist } from "@/lib/prisma/checklist";
import { PRISMA_2020_ITEMS } from "@/lib/prisma/checklist-items";
import type { ChecklistCoverageInputs } from "@/lib/prisma/checklist";

const fullInputs: ChecklistCoverageInputs = {
  sections: { methods: true, results: true, discussion: true, conclusion: true, ai_declaration: true, deviations: true },
  hasCounters: true,
  hasCharacteristics: true,
  optionalPhasesOff: { risk_of_bias: true, certainty: true },
};

describe("deriveChecklist", () => {
  it("retorna exatamente os 27 itens, na ordem do seed", () => {
    const out = deriveChecklist(PRISMA_2020_ITEMS, fullInputs);
    expect(out).toHaveLength(27);
    expect(out.map((i) => i.itemCode)).toEqual(PRISMA_2020_ITEMS.map((i) => i.itemCode));
  });

  it("marca itens de fases desligadas (Viés/Certeza) como not_applicable", () => {
    const out = deriveChecklist(PRISMA_2020_ITEMS, fullInputs);
    for (const code of ["11", "14", "15", "18", "21", "22"]) {
      expect(out.find((i) => i.itemCode === code)?.status).toBe("not_applicable");
    }
  });

  it("marca itens não gerados pelo sistema como pending (US4.3)", () => {
    const out = deriveChecklist(PRISMA_2020_ITEMS, fullInputs);
    for (const code of ["1", "2", "3", "12", "25", "26", "27"]) {
      expect(out.find((i) => i.itemCode === code)?.status).toBe("pending");
    }
  });

  it("met quando a seção existe; pending quando vazia (item 23 = Discussão)", () => {
    const met = deriveChecklist(PRISMA_2020_ITEMS, fullInputs).find((i) => i.itemCode === "23");
    expect(met?.status).toBe("met");
    expect(met?.sectionRef).toBe("Discussão");
    const noDisc = deriveChecklist(PRISMA_2020_ITEMS, {
      ...fullInputs,
      sections: { ...fullInputs.sections, discussion: false },
    }).find((i) => i.itemCode === "23");
    expect(noDisc?.status).toBe("pending");
  });

  it("characteristics/study_selection met conforme dados presentes (itens 10, 8)", () => {
    const out = deriveChecklist(PRISMA_2020_ITEMS, {
      ...fullInputs,
      hasCharacteristics: false,
      hasCounters: false,
    });
    expect(out.find((i) => i.itemCode === "10")?.status).toBe("pending");
    expect(out.find((i) => i.itemCode === "8")?.status).toBe("pending");
  });
});
```

- [ ] **Step 2: Rodar o teste — deve falhar**

Run: `npx vitest run tests/unit/prisma/checklist.test.ts`
Expected: FAIL — `deriveChecklist`/`ChecklistCoverageInputs` não existem.

- [ ] **Step 3: Implementar `checklist.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionKind } from "@/lib/report/types";
import {
  PRISMA_2020_ITEMS,
  type ChecklistSeedItem,
} from "./checklist-items";

export type ChecklistStatus = "met" | "pending" | "not_applicable";

export interface ChecklistItem {
  itemCode: string;
  label: string;
  sectionRef: string | null;
  status: ChecklistStatus;
}

/** Sinais do estado do relatório que decidem a cobertura de cada item. */
export interface ChecklistCoverageInputs {
  /** Por kind: a seção existe e tem conteúdo não-vazio. */
  sections: Record<SectionKind, boolean>;
  /** Há contadores PRISMA (fluxograma de seleção disponível). */
  hasCounters: boolean;
  /** Há ≥1 estudo included_ft com ≥1 valor de extração ratificado. */
  hasCharacteristics: boolean;
  /** Fases opcionais desligadas (v1: ambas true — D19). */
  optionalPhasesOff: { risk_of_bias: boolean; certainty: boolean };
}

/** Pura: aplica a regra de cobertura de cada item ao estado do relatório. */
export function deriveChecklist(
  items: ChecklistSeedItem[],
  inputs: ChecklistCoverageInputs,
): ChecklistItem[] {
  return items.map((item) => {
    let status: ChecklistStatus;
    switch (item.rule.type) {
      case "section":
        status = inputs.sections[item.rule.kind] ? "met" : "pending";
        break;
      case "study_selection":
        status = inputs.hasCounters ? "met" : "pending";
        break;
      case "characteristics":
        status = inputs.hasCharacteristics ? "met" : "pending";
        break;
      case "optional_off":
        // Fase desligada → declara não-aplicável (D19). Se ligada no futuro: pending.
        status = inputs.optionalPhasesOff[item.rule.phase] ? "not_applicable" : "pending";
        break;
      case "manual":
        status = "pending";
        break;
    }
    return {
      itemCode: item.itemCode,
      label: item.label,
      sectionRef: status === "met" ? item.sectionRef : item.sectionRef && status === "not_applicable" ? null : item.sectionRef,
      status,
    };
  });
}

interface Deps {
  supabase: SupabaseClient;
}

const SECTION_KINDS: SectionKind[] = [
  "methods",
  "results",
  "discussion",
  "conclusion",
  "ai_declaration",
  "deviations",
];

/** IO: carrega o estado do relatório e deriva o checklist (sem persistir). */
export async function computePrismaChecklist(
  deps: Deps,
  reviewId: string,
): Promise<ChecklistItem[]> {
  const { supabase } = deps;

  const [{ data: sectionRows }, { data: counter }, { data: valueRows }] =
    await Promise.all([
      supabase
        .from("report_section")
        .select("kind, content")
        .eq("review_id", reviewId),
      supabase
        .from("prisma_counter")
        .select("identified")
        .eq("review_id", reviewId)
        .maybeSingle(),
      supabase
        .from("extraction_value")
        .select("id")
        .eq("review_id", reviewId)
        .in("state", ["accepted", "edited"])
        .limit(1),
    ]);

  const sections = Object.fromEntries(
    SECTION_KINDS.map((k) => [k, false]),
  ) as Record<SectionKind, boolean>;
  for (const r of (sectionRows ?? []) as { kind: SectionKind; content: string }[]) {
    if ((r.content ?? "").trim().length > 0) sections[r.kind] = true;
  }

  const inputs: ChecklistCoverageInputs = {
    sections,
    hasCounters: ((counter as { identified?: number } | null)?.identified ?? 0) > 0,
    hasCharacteristics: (valueRows ?? []).length > 0,
    optionalPhasesOff: { risk_of_bias: true, certainty: true }, // D19 — ambas OFF na v1
  };

  return deriveChecklist(PRISMA_2020_ITEMS, inputs);
}

/** IO: computa e grava o snapshot (upsert por (review_id, item_code)). */
export async function snapshotPrismaChecklist(
  deps: Deps,
  reviewId: string,
): Promise<ChecklistItem[]> {
  const { supabase } = deps;
  const items = await computePrismaChecklist(deps, reviewId);
  const now = new Date().toISOString();
  const { error } = await supabase.from("prisma_checklist_item").upsert(
    items.map((i) => ({
      review_id: reviewId,
      item_code: i.itemCode,
      label: i.label,
      section_ref: i.sectionRef,
      status: i.status,
      computed_at: now,
    })),
    { onConflict: "review_id,item_code" },
  );
  if (error) throw new Error(error.message);
  return items;
}

/** IO: lê o snapshot persistido (para a UI). */
export async function loadPrismaChecklist(
  deps: Deps,
  reviewId: string,
): Promise<ChecklistItem[]> {
  const { supabase } = deps;
  const { data, error } = await supabase
    .from("prisma_checklist_item")
    .select("item_code, label, section_ref, status")
    .eq("review_id", reviewId)
    .order("item_code");
  if (error) throw new Error(error.message);
  // Ordena numericamente ("2" antes de "10").
  return ((data ?? []) as {
    item_code: string;
    label: string;
    section_ref: string | null;
    status: ChecklistStatus;
  }[])
    .map((r) => ({
      itemCode: r.item_code,
      label: r.label,
      sectionRef: r.section_ref,
      status: r.status,
    }))
    .sort((a, b) => Number(a.itemCode) - Number(b.itemCode));
}
```

> Nota: a expressão de `sectionRef` no `deriveChecklist` simplifica para "mostrar a referência quando `met`, ocultar quando `not_applicable`". Se preferir sempre exibir `sectionRef` do seed, troque por `sectionRef: item.sectionRef`. Mantido conservador: referência só quando o item é efetivamente atendido.

- [ ] **Step 4: Rodar o teste — deve passar**

Run: `npx vitest run tests/unit/prisma/checklist.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prisma/checklist.ts tests/unit/prisma/checklist.test.ts
git commit -m "feat(checklist): deriveChecklist + compute/snapshot/load (US4, FR-018)"
```

---

## Task 4: Tabela de características — `assembleCharacteristics` (pura) + IO

**Files:**
- Create: `src/lib/prisma/characteristics.ts`
- Test: `tests/unit/prisma/characteristics.test.ts`

- [ ] **Step 1: Escrever o teste que falha (derivação pura)**

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { assembleCharacteristics } from "@/lib/prisma/characteristics";

const fields = [
  { id: "f1", name: "Ano" },
  { id: "f2", name: "Amostra" },
];
const studies = [
  { id: "s1", title: "Estudo A" },
  { id: "s2", title: "Estudo B" },
];
const values = [
  { recordId: "s1", fieldId: "f1", finalValue: 2020 },
  { recordId: "s1", fieldId: "f2", finalValue: "120 pacientes" },
  { recordId: "s2", fieldId: "f1", finalValue: 2021 },
  // s2/f2 ausente de propósito
];

describe("assembleCharacteristics", () => {
  it("colunas = título + campos; 1 linha por estudo", () => {
    const t = assembleCharacteristics(fields, studies, values);
    expect(t.columns).toEqual(["Estudo", "Ano", "Amostra"]);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].recordId).toBe("s1");
  });

  it("preenche células ratificadas e deixa null nas ausentes", () => {
    const t = assembleCharacteristics(fields, studies, values);
    expect(t.rows[0].cells).toEqual({ Estudo: "Estudo A", Ano: 2020, Amostra: "120 pacientes" });
    expect(t.rows[1].cells).toEqual({ Estudo: "Estudo B", Ano: 2021, Amostra: null });
  });

  it("tabela vazia quando não há estudos", () => {
    const t = assembleCharacteristics(fields, [], []);
    expect(t.rows).toHaveLength(0);
    expect(t.columns).toEqual(["Estudo", "Ano", "Amostra"]);
  });
});
```

- [ ] **Step 2: Rodar o teste — deve falhar**

Run: `npx vitest run tests/unit/prisma/characteristics.test.ts`
Expected: FAIL — `assembleCharacteristics` não existe.

- [ ] **Step 3: Implementar `characteristics.ts`**

A query IO reusa `listExtractionFields`/`listStudies` (já existentes em `@/lib/extraction/queries`, convenção `{ supabase }`) e lê os valores ratificados da Revisão diretamente (escopo por `review_id`, estado `accepted/edited`). **Não** reabre a engine de extração (não-regressão).

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listExtractionFields,
  listStudies,
} from "@/lib/extraction/queries";

export interface CharacteristicsTable {
  columns: string[];
  rows: Array<{ recordId: string; cells: Record<string, unknown> }>;
}

interface FieldLite {
  id: string;
  name: string;
}
interface StudyLite {
  id: string;
  title: string;
}
interface ValueLite {
  recordId: string;
  fieldId: string;
  finalValue: unknown;
}

const STUDY_COLUMN = "Estudo";

/** Pura: monta colunas (Estudo + campos) e 1 linha por estudo, célula = valor ratificado. */
export function assembleCharacteristics(
  fields: FieldLite[],
  studies: StudyLite[],
  values: ValueLite[],
): CharacteristicsTable {
  const columns = [STUDY_COLUMN, ...fields.map((f) => f.name)];
  const fieldNameById = new Map(fields.map((f) => [f.id, f.name]));

  const rows = studies.map((s) => {
    const cells: Record<string, unknown> = { [STUDY_COLUMN]: s.title };
    for (const f of fields) cells[f.name] = null; // default explícito
    for (const v of values) {
      if (v.recordId !== s.id) continue;
      const name = fieldNameById.get(v.fieldId);
      if (name) cells[name] = v.finalValue ?? null;
    }
    return { recordId: s.id, cells };
  });

  return { columns, rows };
}

interface Deps {
  supabase: SupabaseClient;
}

/** IO: deriva a tabela de características dos estudos included_ft (sem tabela nova, R6). */
export async function buildCharacteristicsTable(
  deps: Deps,
  reviewId: string,
): Promise<CharacteristicsTable> {
  const { supabase } = deps;
  const [fields, studies] = await Promise.all([
    listExtractionFields(deps, reviewId),
    listStudies(deps, reviewId),
  ]);

  const { data: valueRows, error } = await supabase
    .from("extraction_value")
    .select("record_id, field_id, final_value")
    .eq("review_id", reviewId)
    .in("state", ["accepted", "edited"]);
  if (error) throw new Error(error.message);

  const values: ValueLite[] = ((valueRows ?? []) as {
    record_id: string;
    field_id: string;
    final_value: unknown;
  }[]).map((r) => ({
    recordId: r.record_id,
    fieldId: r.field_id,
    finalValue: r.final_value,
  }));

  return assembleCharacteristics(
    fields.map((f) => ({ id: f.id, name: f.name })),
    studies.map((s) => ({ id: s.id, title: s.title })),
    values,
  );
}
```

- [ ] **Step 4: Rodar o teste — deve passar**

Run: `npx vitest run tests/unit/prisma/characteristics.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prisma/characteristics.ts tests/unit/prisma/characteristics.test.ts
git commit -m "feat(characteristics): assembleCharacteristics + buildCharacteristicsTable (US4, FR-019)"
```

---

## Task 5: Type-check do conjunto novo (sem UI ainda)

**Files:** (nenhum novo — verificação)

- [ ] **Step 1: Type-check e lint dos módulos novos**

Run: `npx tsc --noEmit && npx eslint src/lib/prisma/checklist.ts src/lib/prisma/checklist-items.ts src/lib/prisma/characteristics.ts`
Expected: 0 erros, 0 warnings.

- [ ] **Step 2: Rodar todos os unit novos**

Run: `npx vitest run tests/unit/prisma/`
Expected: PASS (todos os testes de checklist + characteristics + os pré-existentes de prisma, se houver).

> Sem commit (passo só de verificação; nada mudou).

---

## Task 6: Gravar o snapshot na geração e na regeneração do relatório

**Files:**
- Modify: `src/lib/report/batch-worker.ts` (em `processReportDraftJob`, antes de `report.status='ready'`)
- Modify: `src/lib/report/regenerate.ts` (ao fim de `regenerateDeterministicSections`)
- Test: coberto na Task 8 (integração)

- [ ] **Step 1: `regenerate.ts` — chamar o snapshot ao fim**

Adicionar o import e a chamada antes do `return`. Usa o mesmo `supabase` (member client) — autorizado pela policy `prisma_checklist_item_member`.

Import (topo do arquivo, junto aos demais):

```ts
import { snapshotPrismaChecklist } from "@/lib/prisma/checklist";
```

Antes de `return { regenerated, preserved };`:

```ts
  // US4: o checklist é snapshot do relatório → re-gravar ao regenerar (FR-018).
  await snapshotPrismaChecklist({ supabase }, reviewId);

  return { regenerated, preserved };
```

- [ ] **Step 2: `batch-worker.ts` — chamar o snapshot antes de `status='ready'`**

Import (junto aos demais imports do arquivo):

```ts
import { snapshotPrismaChecklist } from "@/lib/prisma/checklist";
```

Localizar, em `processReportDraftJob`, o ponto onde o report é marcado pronto:

```ts
    await supabase.from("report").update({ status: "ready" }).eq("id", reportId);
```

Inserir **imediatamente antes** dessa linha:

```ts
    // US4: grava o snapshot do checklist PRISMA com a cobertura do relatório recém-montado.
    await snapshotPrismaChecklist({ supabase }, reviewId);
```

> Se o texto exato do update de status divergir (ex.: outra ordem de chaves), localizar pela substring `status: "ready"` dentro de `processReportDraftJob` e inserir a chamada na linha anterior. O snapshot deve rodar **depois** do upsert das seções determinísticas e dos rascunhos IA, e **antes** de marcar `ready`, para refletir o conteúdo final.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/lib/report/regenerate.ts src/lib/report/batch-worker.ts`
Expected: 0 erros.

- [ ] **Step 4: Rodar a suíte de report (não-regressão da Fatia 3)**

Run: `npx vitest run tests/integration/report.test.ts tests/unit/report/`
Expected: PASS (mesmos testes da Fatia 3 continuam verdes; o snapshot adicional não os quebra).

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/regenerate.ts src/lib/report/batch-worker.ts
git commit -m "feat(checklist): snapshot do checklist na geracao e regeneracao do relatorio (US4)"
```

---

## Task 7: UI — painéis read-only de checklist e características

**Files:**
- Create: `src/components/report/PrismaChecklistPanel.tsx`
- Create: `src/components/report/CharacteristicsTablePanel.tsx`
- Modify: `app/reviews/[reviewId]/report/page.tsx`

- [ ] **Step 1: `PrismaChecklistPanel.tsx` (server component, read-only)**

```tsx
import type { ChecklistItem } from "@/lib/prisma/checklist";

const STATUS_LABEL: Record<ChecklistItem["status"], string> = {
  met: "Atendido",
  pending: "Pendente",
  not_applicable: "Não aplicável",
};

const STATUS_CLASS: Record<ChecklistItem["status"], string> = {
  met: "text-emerald-700",
  pending: "text-amber-700",
  not_applicable: "text-ink-soft",
};

export function PrismaChecklistPanel({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        O checklist é gerado junto com o relatório.
      </p>
    );
  }
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Checklist PRISMA 2020</h2>
      <ul className="divide-y divide-line rounded border border-line">
        {items.map((it) => (
          <li
            key={it.itemCode}
            className="flex items-baseline gap-3 px-3 py-2 text-sm"
          >
            <span className="w-6 shrink-0 text-ink-soft">{it.itemCode}</span>
            <span className="flex-1">
              {it.label}
              {it.sectionRef && (
                <span className="text-ink-soft"> — {it.sectionRef}</span>
              )}
            </span>
            <span className={`shrink-0 text-xs ${STATUS_CLASS[it.status]}`}>
              {STATUS_LABEL[it.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: `CharacteristicsTablePanel.tsx` (server component, read-only)**

```tsx
import type { CharacteristicsTable } from "@/lib/prisma/characteristics";

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export function CharacteristicsTablePanel({
  table,
}: {
  table: CharacteristicsTable;
}) {
  if (table.rows.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Sem estudos incluídos com extração ratificada para caracterizar.
      </p>
    );
  }
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Características dos estudos</h2>
      <div className="overflow-x-auto rounded border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {table.columns.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.recordId} className="border-b border-line last:border-0">
                {table.columns.map((c) => (
                  <td key={c} className="px-3 py-2 align-top">
                    {renderCell(r.cells[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Ligar os painéis na página do relatório**

Em `app/reviews/[reviewId]/report/page.tsx`:

Adicionar imports (junto aos existentes):

```tsx
import { loadPrismaChecklist } from "@/lib/prisma/checklist";
import { buildCharacteristicsTable } from "@/lib/prisma/characteristics";
import { PrismaChecklistPanel } from "@/components/report/PrismaChecklistPanel";
import { CharacteristicsTablePanel } from "@/components/report/CharacteristicsTablePanel";
```

Estender o `Promise.all` de carga para incluir os dois artefatos:

```tsx
  const [report, flowModel, checklist, characteristics] = await Promise.all([
    loadReport({ supabase }, reviewId),
    loadPrismaFlowModel(reviewId),
    loadPrismaChecklist({ supabase }, reviewId),
    buildCharacteristicsTable({ supabase }, reviewId),
  ]);
```

Renderizar os painéis **após** o bloco `{report?.sections.map(...)}`, ainda dentro do `<main>`, somente quando há relatório:

```tsx
      {report && (
        <>
          <PrismaChecklistPanel items={checklist} />
          <CharacteristicsTablePanel table={characteristics} />
        </>
      )}
```

- [ ] **Step 4: Type-check + lint da UI**

Run: `npx tsc --noEmit && npx eslint "app/reviews/[reviewId]/report/page.tsx" src/components/report/PrismaChecklistPanel.tsx src/components/report/CharacteristicsTablePanel.tsx`
Expected: 0 erros.

- [ ] **Step 5: Build de produção (sanidade do App Router)**

Run: `npx next build`
Expected: compila sem erro de tipos/rotas (a página `report` continua válida).

- [ ] **Step 6: Commit**

```bash
git add "app/reviews/[reviewId]/report/page.tsx" src/components/report/PrismaChecklistPanel.tsx src/components/report/CharacteristicsTablePanel.tsx
git commit -m "feat(report): paineis read-only de checklist PRISMA e caracteristicas (US4)"
```

---

## Task 8: Teste de integração — RLS + snapshot na geração/regeneração

**Files:**
- Create: `tests/integration/prisma-checklist.test.ts`

- [ ] **Step 1: Escrever o teste de integração**

Espelha o harness de `tests/integration/report.test.ts` (`serviceClient()` = admin/worker; `signUpUser()` = membro; `create_review` auto-insere member). Cobre: (a) snapshot gravado na geração (worker), com os 27 itens e os estados esperados; (b) regeneração re-grava; (c) RLS — não-membro não lê o snapshot.

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueReportDraftJob } from "@/lib/report/enqueue";
import { runReportDraftWorkerWith } from "@/lib/report/batch-run";
import { regenerateDeterministicSections } from "@/lib/report/regenerate";
import { loadPrismaChecklist } from "@/lib/prisma/checklist";

async function seedReview(
  label: string,
): Promise<{ svc: SupabaseClient; member: SupabaseClient; reviewId: string }> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const svc = serviceClient();
  const { client: member } = await signUpUser(
    `checklist_${label}_${stamp}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await member.rpc("create_review", {
    p_title: `Checklist ${label} ${stamp}`,
  });
  if (error) throw new Error(error.message);
  return { svc, member, reviewId: (review as { id: string }).id };
}

describe("Fatia 4 — checklist PRISMA (0020)", () => {
  it("a geracao do relatorio grava o snapshot com 27 itens", async () => {
    const { svc, reviewId } = await seedReview("gen");
    await enqueueReportDraftJob({ supabase: svc }, reviewId);
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);

    const { count } = await svc
      .from("prisma_checklist_item")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBe(27);

    const items = await loadPrismaChecklist({ supabase: svc }, reviewId);
    // Fases opcionais OFF → not_applicable (D19).
    expect(items.find((i) => i.itemCode === "11")?.status).toBe("not_applicable");
    expect(items.find((i) => i.itemCode === "22")?.status).toBe("not_applicable");
    // Métodos é montado deterministicamente → item 5 atendido.
    expect(items.find((i) => i.itemCode === "5")?.status).toBe("met");
    // Item não gerado pelo sistema → pendente (US4.3).
    expect(items.find((i) => i.itemCode === "1")?.status).toBe("pending");
  });

  it("a regeneracao re-grava o snapshot (idempotente, 27 itens)", async () => {
    const { svc, member, reviewId } = await seedReview("regen");
    await enqueueReportDraftJob({ supabase: svc }, reviewId);
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);
    await regenerateDeterministicSections({ supabase: member }, reviewId);

    const { count } = await svc
      .from("prisma_checklist_item")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBe(27); // upsert por (review_id,item_code) — não duplica
  });

  it("RLS: nao-membro nao le o snapshot de outra Revisao", async () => {
    const { svc, reviewId } = await seedReview("rls");
    await enqueueReportDraftJob({ supabase: svc }, reviewId);
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);

    const { client: outsider } = await signUpUser(
      `outsider_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data } = await outsider
      .from("prisma_checklist_item")
      .select("id")
      .eq("review_id", reviewId);
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar o teste — deve passar**

Run: `npx vitest run tests/integration/prisma-checklist.test.ts`
Expected: PASS (3 testes). (Requer Supabase local de pé — `npx supabase start` — e a migration `0020` aplicada.)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/prisma-checklist.test.ts
git commit -m "test(checklist): integracao RLS + snapshot na geracao/regeneracao (US4)"
```

---

## Task 9: Verificação final da fatia (CHECKPOINT 3)

**Files:** (nenhum — gate de verificação)

- [ ] **Step 1: Type-check completo**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 2: Lint completo**

Run: `npm run lint`
Expected: 0 erros.

- [ ] **Step 3: Suíte unitária completa**

Run: `npx vitest run tests/unit/`
Expected: PASS (inclui os novos `tests/unit/prisma/checklist.test.ts` e `characteristics.test.ts`; nenhuma regressão).

- [ ] **Step 4: Suíte de integração tocada pela fatia**

Run: `npx vitest run tests/integration/prisma-checklist.test.ts tests/integration/report.test.ts`
Expected: PASS (checklist novo + report da Fatia 3 sem regressão).

- [ ] **Step 5: Escrever `COMPLETION-fatia-4.md` e PARAR**

Criar `specs/003-marco3-saida-sintese-relatorio/.superpowers/COMPLETION-fatia-4.md` (espelha o da Fatia 3): o que foi entregue (US4/FR-018/FR-019/SC-009), invariantes (snapshot determinístico, not_applicable p/ fases OFF, pending p/ itens não cobertos, RLS), resultados de tsc/lint/testes, commits, e nota pós-merge (atualizar a tabela em `slicing.md`: Fatia 4 → ✅ mergeada + SHA; próxima: Fatia 5). **Não fazer merge/push.** Apresentar ao desenvolvedor o branch, o diff e os resultados de verificação, e **aguardar o merge manual** (CHECKPOINT 3).

---

## Self-Review (planner)

**Cobertura do spec (US4):**
- FR-018 (checklist 27 itens auto-preenchido, marcado, com referência à seção) → Tasks 1–3, 7, 8 ✓
- FR-019 (tabela de características, 1 linha/estudo, colunas do formulário) → Tasks 4, 7 ✓
- FR-025 (RLS por Revisão) → Task 1 (policy) + Task 8 (teste RLS) ✓
- SC-009 (checklist; `not_applicable` para fases OFF) → Task 3 (regra `optional_off`) + Task 8 ✓
- US4.1 (item marcado com referência à seção) → `PrismaChecklistPanel` + `sectionRef` ✓
- US4.2 (1 linha por estudo, colunas = campos do formulário) → `assembleCharacteristics` ✓
- US4.3 (item não coberto → pending) → regra `manual`/`section` ausente → `pending` ✓

**Sem placeholders:** todos os passos com código completo, comandos exatos e saída esperada.

**Consistência de tipos:** `ChecklistItem`/`ChecklistCoverageInputs`/`CoverageRule`/`CharacteristicsTable` definidos antes de serem consumidos; `SectionKind` importado de `@/lib/report/types`; `listExtractionFields`/`listStudies` consumidos com a assinatura `(deps, reviewId)` já existente; `snapshotPrismaChecklist({ supabase }, reviewId)` chamado com a mesma forma nos dois pontos de integração.

**Não-regressão:** só **estende** `report/batch-worker.ts` e `report/regenerate.ts` (2 chamadas aditivas); nenhuma tabela/coluna existente alterada; nenhuma lib nova; sem LLM. A tabela de características **lê** `extraction_value` (não reabre a extração). Migration `0020` é puramente aditiva.
