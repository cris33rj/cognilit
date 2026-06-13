# Slicing — Marco 3 (Saída) — Sessão B

**Feature**: `003-marco3-saida-sintese-relatorio` | **Date**: 2026-06-12
**Status**: Fatiação APROVADA pelo usuário (CHECKPOINT 1, 2026-06-12). Fatia 1 em planejamento.
**Ancorado em**: [codebase-map.md](./codebase-map.md), [plan.md](../plan.md),
[data-model.md](../data-model.md), contratos (synthesis/report/prisma-export),
[HANDOFF.md](../HANDOFF.md). Produto sign-off (CONTEXT/constitution/spec) — não reaberto.

> Regime (PROTOCOLS §"três decisões"): Superpowers conduz fatiação+plan+execução; motor
> `subagent-driven-development`; commit em branch isolado por fatia; **parada obrigatória
> e merge manual entre fatias**. Branch por fatia:
> `build/003-marco3-saida-sintese-relatorio/<n>-<slug>`. Uma fatia por vez.

---

## Resolução das ambiguidades de implementação (A1/A2/A3)

### A1 — Shape de `theme.summary_table` → **Estudos × campos** (decidido)
Linhas = estudos (`record` `corpus_state='included_ft'`) referenciados pelos
`theme_finding` do tema; colunas = os `extraction_field` (ativos) presentes nesses
achados; célula = `extraction_value.final_value` (ou marcação "não encontrado").
**Derivada estritamente de `theme_finding → extraction_value`** (grounding nível de
achado, Q3) e **recomputável** — o `jsonb` é snapshot de conveniência, não fonte de
verdade (a verdade é `theme_finding`). Atribuído à **Fatia 2** (Síntese).

### A2 — Runtime das libs de export → **Worker Node** (decidido)
O codebase-map constatou que **todo trabalho pesado de IA dos Marcos 1–2 roda em worker
Node server-side** (`src/lib/<dom>/batch-worker.ts` + `batch-run.ts`, disparado por server
action), e o `jobs-worker` Deno só despacha `import_parse`. `docx`/`pdfmake`/
`@resvg/resvg-wasm` são puras-JS/wasm e rodam no **mesmo runtime Node** onde
`unpdf`+`@napi-rs/canvas` já rasterizam PDFs hoje. Logo o "risco runtime Deno" do A2 se
dissolve; o que resta é **validar fidelidade do output** (abrir DOCX no Word, conferir
PDF), espelhando como o Marco 2 calibrou `rasterize.ts`. `synthesis_batch`/`report_draft`/
`report_export` seguem o **padrão Node**, não um handler Deno novo. Validação concentrada
na **Fatia 6**; `@resvg/resvg-wasm` de-riscado já na **Fatia 1**.

### A3 — Editabilidade da narrativa de Resultados → **Só na Síntese** (decidido)
Fonte única: o pesquisador edita a narrativa na fase **Síntese** (US1). A seção
`report_section(kind=results)` nasce e permanece `edit_state='deterministic'` e a
**regeneração sempre re-monta** Resultados refletindo a síntese ratificada **corrente** +
contagens. **Sem override por seção** em Resultados (evita duas fontes de verdade).
Atribuído à **Fatia 3** (Relatório).

### Correção de fato registrada (codebase-map §0.2)
`ai_usage.phase` é **`text`** (não enum). As phases `synthesis`/`report` entram por
`insert`, **sem `ALTER TYPE`**. ALTERs de enum reais e aditivos: `ai_target_kind`
(+`synthesis_theme`, +`report_section`) e `job_type` (+`synthesis_batch`, +`report_draft`,
+`report_export`).

---

## Fatias (ordem de execução)

Princípio: **1 fatia ≈ 1 user story**, cada uma lidera com sua migration+RLS, cada uma
entregável e testável ponta-a-ponta (vitest tocado + `npm run lint` + `tsc --noEmit`
verdes). Ordem por dependência natural: **US2 → US1 → US3 → US4 → US5(a) → US5(b)**.
Numeração de migration é indicativa; o número real (próximo após `0017`) é fixado no
`writing-plans`/execução para evitar colisão.

### Fatia 1 — Fluxograma PRISMA 2020 (US2)
- **Escopo (in)**: estende `src/lib/prisma/queries.ts` com `buildPrismaFlowModel`
  (consome `prisma_counter` + `prisma_exclusion_breakdown`; `partial:boolean` p/ fases
  abertas, FR-011; discrimina exclusões por motivo, FR-010) e `renderPrismaSvg(model)`
  (template determinístico **read-only**, caixas de fontes externas zero/ocultas,
  FR-011a). Renderer in-app (Server Component, `src/components/prisma/`). Export **SVG**
  (serialização direta) e **PNG** (`@resvg/resvg-wasm`) via **route handler de download**
  (precedente `protocol/export/route.ts`, `audit/export/route.ts`) — **sem bucket**.
- **Out**: não persiste em Storage; não toca relatório; **sem LLM**; sem tabela nova.
- **Migrations**: nenhuma (consome views existentes, §VI).
- **Novas libs (por tarefa)**: `@resvg/resvg-wasm` (R2) — de-risca rasterização cedo.
- **Depende de**: nada (só views dos Marcos 1–2).
- **A\***: valida o runtime de `@resvg/resvg-wasm` (insumo p/ A2).
- **Cobre**: US2 — FR-008, FR-009, FR-010, FR-011, FR-011a; SC-002.
- **Pronto quando**: unit (views→modelo de caixas, partial, fontes externas ocultas) +
  integration (números == views, SC-002) + e2e leve do fluxograma; lint+tsc verdes.

### Fatia 2 — Síntese qualitativa assistida (US1)
- **Migration**: `synthesis` (1:1 review), `theme`, `theme_finding` + `ALTER TYPE
  ai_target_kind ADD VALUE 'synthesis_theme'` + `ALTER TYPE job_type ADD VALUE
  'synthesis_batch'` + RLS (`is_review_member`) + RPC `create_synthesis_job` +
  RPCs/actions de ratificação (accept/edit/reject/merge/split/reorder, cada uma com
  `audit_entry`).
- **LLMProvider**: `synthesizeThemes(...)` (temas com `findingRefs` + provenance, ou
  `{insufficientData:true}`) + estender `estimateCost` union com `synthesis_batch`.
  Implementar em `types.ts` + `anthropic.ts` + `mock.ts`; estender `llm-contract.test.ts`.
  Saída **pt-BR**.
- **Worker Node**: `src/lib/synthesis/{enqueue,batch-run,batch-worker,queries}.ts`
  (`processSynthesisJob`, item = estudo `included_ft`, coleta `extraction_value`
  ratificados, resiliente por-item, retomável, grava `ai_usage` phase `synthesis`) +
  server action em `app/reviews/[reviewId]/synthesis/actions.ts`. Espelha
  `src/lib/extraction/batch-worker.ts`.
- **A1 aqui**: `summary_table` = estudos×campos, recomputável de `theme_finding`.
- **UI**: `synthesis/page.tsx` + `src/components/synthesis/*` (lista de temas, editor de
  narrativa, tabela-resumo, refs de grounding) **reusando `src/components/ai/*`**
  (SuggestionChip/Actions/ProvenancePopover/NotFound). Estimativa de custo antes do lote
  (FR-006). "Dados insuficientes" 1ª classe (FR-007). Estado por tema. Adicionar phase
  `synthesis` ao trilho (`src/lib/shell/phases.ts` + testes).
- **Out**: não gera relatório.
- **Depende de**: extração (Marcos 1–2). Independente do fluxograma.
- **A\***: **A1**.
- **Cobre**: US1 — FR-001..007, FR-005a, FR-024, FR-026; SC-001, SC-006(síntese),
  SC-007, SC-008(síntese).
- **Pronto quando**: unit (grounding obrigatório, insufficientData, componentes c/ mock
  LLM) + integration (RLS síntese/tema/grounding; re-geração preserva temas
  `accepted/edited`) ; lint+tsc verdes.

### Fatia 3 — Relatório estruturado (US3)
- **Migration**: `report` (1:1), `report_section` (`kind`, `edit_state`, `ai_suggestion_id`)
  + `ALTER TYPE ai_target_kind ADD VALUE 'report_section'` + `ALTER TYPE job_type ADD
  VALUE 'report_draft'` + RLS + RPC `create_report_draft_job` + actions
  `editReportSection`/`regenerateReport` (com `audit_entry`).
- **Montagem determinística (sem LLM)** `src/lib/report/`: `buildMethodsSection`
  (pergunta+critérios+protocolo+buscas+fluxo de triagem), `buildResultsSection`
  (contagens das views + **embute a síntese ratificada de US1** — A3, sem novo passe de
  LLM), `buildAiDeclaration` (enumera `ai_suggestion` por fase + proveniência, FR-013),
  `buildDeviations` (`protocol_amendment` datadas, FR-014), `buildOptionalPhasesDeclaration`
  (Viés/Certeza OFF declaradas, FR-015).
- **Trilha assistida por IA** (`LLMProvider`): `draftReportSection({kind:
  discussion|conclusion,...})` + estender `estimateCost` com `report_draft`. Worker Node
  `processReportDraftJob` (item = seção IA), `ai_usage` phase `report`.
- **Regeneração** (FR-016): reescreve `deterministic`+`ai_generated`, **preserva**
  `human_edited` e **avisa** quais manteve. `editReportSection` → `human_edited`+audit.
- **UI**: `report/page.tsx` + `src/components/report/*` (editor de seção, declaração-IA,
  desvios) + **embute o fluxograma da Fatia 1**. Adicionar phase `report` ao trilho.
- **Depende de**: **Fatia 1** (display do fluxograma), **Fatia 2** (síntese p/ Resultados).
- **A\***: **A3**.
- **Cobre**: US3 — FR-012..017, FR-024; SC-003, SC-004, SC-009(declaração no relatório).
- **Pronto quando**: unit (montagem determinística de cada seção; serialização markdown;
  mock LLM Discussão/Conclusão) + integration (regeneração preserva `human_edited`; RLS);
  lint+tsc verdes.

### Fatia 4 — Checklist PRISMA + Tabela de características (US4)
- **Migration**: `prisma_checklist_item` + RLS + **seed dos 27 itens** PRISMA 2020 (R5).
- **Lógica**: `computePrismaChecklist` (cobertura computada das seções do relatório;
  `not_applicable` p/ fases OFF — D19/SC-009; snapshot na geração) e
  `buildCharacteristicsTable` (**derivação pura** `extraction_field` × `extraction_value`,
  1 linha/estudo `included_ft` — **sem tabela nova**, R6).
- **UI**: painéis de checklist e de tabela de características em `report/page.tsx`.
- **Depende de**: **Fatia 3** (seções do relatório p/ a cobertura) + extração existente.
- **A\***: — (completa SC-009 junto com a Fatia 3).
- **Cobre**: US4 — FR-018, FR-019; SC-009 (checklist).
- **Pronto quando**: unit (cobertura met/pending/not_applicable; derivação da tabela) +
  integration (RLS + snapshot do checklist); lint+tsc verdes.

### Fatia 5 — Exportação: infra + Markdown/BibTeX/RIS (US5, parte 1)
- **Migration**: `export_artifact` + bucket privado `exports` + policies em
  `storage.objects` (espelham `pdfs_*`, path `review/<review_id>/...`, R8) + `ALTER TYPE
  job_type ADD VALUE 'report_export'` + RPC `create_report_export_job` + RLS.
- **Worker Node (esqueleto resiliente por-formato)**:
  `src/lib/export/{enqueue,batch-run,batch-worker,queries}.ts` (`processReportExportJob`,
  **item = um formato**, falha de um formato não derruba os demais — FR-023; retomável) +
  server action `enqueueExport`.
- **Serializadores leves (próprios, R4)**: `serializeMarkdown` (montagem direta das
  seções), `serializeBibtex`, `serializeRis` (cobrem todos os `included_ft`, FR-021).
  Persiste no bucket + `export_artifact`; download.
- **Out**: DOCX/PDF/APA7 (Fatia 6).
- **Novas libs**: nenhuma pesada (serializadores próprios).
- **Depende de**: **Fatia 3** (relatório/seções), **Fatia 4** (p/ MD embutir
  características/checklist).
- **A\***: valida a infra de worker/bucket (insumo p/ A2).
- **Cobre**: US5 (parcial) — FR-021, FR-023, FR-020 (parte MD).
- **Pronto quando**: unit (serializadores BibTeX/RIS/MD) + integration (RLS bucket +
  `export_artifact`; resiliência por-formato); lint+tsc verdes.

### Fatia 6 — Exportação: DOCX/PDF + APA 7 (US5, parte 2) — fatia terminal
- **Novas libs (por tarefa)**: `docx` (R3), `pdfmake` (R3), `citeproc` + CSL APA 7 (R4).
- **Serializadores pesados**: `serializeDocx` (`docx`), `serializePdf` (`pdfmake`,
  **embute o PNG do fluxograma da Fatia 1** + checklist + tabela de características da
  Fatia 4 — FR-020), `formatCitationsApa7` (`citeproc`+CSL; metadados ausentes
  **marcados**, não inventados — §II, FR-022). Adiciona os formatos `docx`/`pdf` ao
  mesmo job `report_export`.
- **Validação A2**: abrir DOCX no Word, conferir fidelidade do PDF — espelha a calibração
  de `rasterize.ts` do Marco 2.
- **UI**: painel de export completo (todos os formatos) em `report/page.tsx`; download.
- **Depende de**: **Fatia 5** (infra/worker/bucket), **Fatia 1** (PNG), **Fatia 4**
  (checklist+características), **Fatia 3** (relatório).
- **A\***: **A2** (validação das libs pesadas — núcleo).
- **Cobre**: US5 (completa) — FR-020, FR-022; SC-005.
- **Pronto quando**: unit (smoke de docx/pdf + APA7) + integration (embute PNG/checklist/
  características; resiliência) + **e2e SC-005** (síntese→relatório→export multi-formato) +
  **suíte completa** (última fatia); lint+tsc verdes.

---

## Gate de cobertura (PROTOCOLS §Sessão B)

| User story | Fatia(s) | Sem sobreposição |
|------------|----------|------------------|
| US1 Síntese | Fatia 2 | ✓ |
| US2 Fluxograma PRISMA | Fatia 1 | ✓ |
| US3 Relatório | Fatia 3 | ✓ |
| US4 Checklist + características | Fatia 4 | ✓ |
| US5 Exportações | Fatias 5 + 6 (split sem overlap: MD/BibTeX/RIS+infra | DOCX/PDF+APA7) | ✓ |

- **Toda US coberta; união = Marco inteiro; nada duplicado.** ✓
- **Ordem respeita dependências de schema**: cada fatia lidera com sua migration+RLS;
  Fatia 1 não cria tabela (só views); todos os `ALTER`s de enum são **aditivos**. ✓
- **Itens A\* atribuídos**: A1 → Fatia 2; A2 → Fatia 6 (validação; resvg de-riscado na
  Fatia 1); A3 → Fatia 3. ✓
- **Nenhuma tech fora do `plan.md`**: `@resvg/resvg-wasm` (F1), `docx`/`pdfmake`/
  `citeproc`+CSL (F6) — todas previstas no plan, só por tarefa explícita. ✓
- **Não-regressão Marcos 1–2**: nenhuma fatia refatora workbench/triagem, extração ou
  views PRISMA; só **estende** (`prisma/queries.ts`, `llm/*`, `shell/phases.ts`,
  `ai_suggestion`/`job` via ALTER aditivo). ✓
- **Fronteira de IA**: LLM só em Fatia 2 (síntese) e Fatia 3 (Discussão/Conclusão);
  Métodos/Resultados/declaração-IA/desvios determinísticos; export sem IA. ✓

---

## Estado de execução (atualizado a cada merge)

| # | Fatia | Branch | Status |
|---|-------|--------|--------|
| 1 | Fluxograma PRISMA (US2) | build/003-marco3-saida-sintese-relatorio/1-prisma-flowchart | 🟡 planejando (CHECKPOINT 2) |
| 2 | Síntese (US1) | build/003-marco3-saida-sintese-relatorio/2-synthesis | ⏳ não iniciada |
| 3 | Relatório (US3) | build/003-marco3-saida-sintese-relatorio/3-report | ⏳ não iniciada |
| 4 | Checklist + características (US4) | build/003-marco3-saida-sintese-relatorio/4-checklist-characteristics | ⏳ não iniciada |
| 5 | Export infra + MD/BibTeX/RIS (US5a) | build/003-marco3-saida-sintese-relatorio/5-export-light | ⏳ não iniciada |
| 6 | Export DOCX/PDF + APA7 (US5b) | build/003-marco3-saida-sintese-relatorio/6-export-docs | ⏳ não iniciada |

Após aprovação (CHECKPOINT 1): por fatia, `writing-plans` (CHECKPOINT 2) →
`using-git-worktrees` → `subagent-driven-development` → **PARAR** (CHECKPOINT 3) →
aguardar merge do usuário → próxima fatia. A sessão **nunca** faz merge/push para a
branch da feature ou `main`.
