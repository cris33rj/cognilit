# Codebase Map — Marco 3 (Saída) ancorado no estado real dos Marcos 1–2

**Feature**: `003-marco3-saida-sintese-relatorio` | **Date**: 2026-06-12
**Propósito**: ancorar a fatiação e o `writing-plans` no código **real e herdado**
(migrations `0001`–`0017`, `src/`, `app/`, `supabase/functions/`), impedindo
re-execução de trabalho feito e suposições erradas. Não é spec; é o retrato do que
existe e dos pontos de extensão exatos que o Marco 3 toca.

> Convenção de leitura: cada seção lista **o que existe**, **assinatura/colunas reais**,
> e **→ como o Marco 3 estende**. Tudo dos Marcos 1–2 é **não-regressão** salvo onde uma
> tarefa do plano exigir, com justificativa.

---

## 0. Descobertas que corrigem/precisam o plan/research (LER PRIMEIRO)

1. **Trabalho pesado de IA roda em worker Node server-side, NÃO no Deno cron.**
   O `supabase/functions/jobs-worker/index.ts` (pg_cron, `x-cron-secret`) despacha
   **somente `type=import_parse`**. Todo o resto do trabalho pesado dos Marcos 1–2 —
   extração em lote, embeddings em lote, pipeline de PDF (incl. rasterização), triagem
   por IA — roda como **módulo Node** (`src/lib/<dominio>/batch-worker.ts` +
   `batch-run.ts`) **invocado de uma server action** (`app/reviews/[reviewId]/*/actions.ts`):
   - `extraction/actions.ts` → `runExtractionBatchWorkerWith` (`src/lib/extraction/batch-run.ts` → `processExtractionJob`)
   - `search/actions.ts` → `runEmbeddingBatchWorkerWith` (`src/lib/embedding/batch-run.ts`)
   - `workbench/actions.ts` → `runScreeningWorkerWith`, `runPdfPipelineWorkerWith`
   - Enfileiramento: server action chama a **RPC `create_<x>_job`** (SECURITY DEFINER,
     transacional: insere `job` + `job_item`s + `audit_entry`). O Edge `jobs-enqueue`
     só é usado pela importação.
   - **Implicação p/ A2 e fatiação:** `synthesis_batch`/`report_draft`/`report_export`
     devem **espelhar o padrão Node** (`src/lib/synthesis/batch-worker.ts` etc. + server
     action), não introduzir um handler Deno novo. As libs de export (`docx`, `pdfmake`,
     `@resvg/resvg-wasm`) são **puras-JS/wasm e rodam em Node** — o mesmo runtime onde
     `unpdf`+`@napi-rs/canvas` já rasterizam PDFs hoje. O risco "runtime Deno" do A2 em
     grande parte **se dissolve**; o que resta validar é **fidelidade do output** (abrir
     DOCX no Word, conferir PDF), espelhando como o Marco 2 calibrou `rasterize.ts`.

2. **`ai_usage.phase` é `text` (não enum).** `0002`: `phase text not null`. Workers
   apenas `.insert({ phase: "synthesis" | "report", ... })`. **Nenhum ALTER de enum
   para `ai_usage`** — o item correspondente no data-model é no-op (corrigir na fatia).
   ALTERs de enum reais e necessários: `ai_target_kind` (+`synthesis_theme`,
   `report_section`) e `job_type` (+`synthesis_batch`, `report_draft`, `report_export`).

3. **`estimateCost` é um union fechado por `kind`.** Hoje: `ai_screening_batch` |
   `ai_extraction_batch`. Estender o union com `synthesis_batch` (+ `report_draft`) nos
   **três** arquivos em sincronia: `types.ts`, `anthropic.ts`, `mock.ts` (há
   `llm-contract.test.ts` que ambos os provedores devem satisfazer).

---

## 1. Trilho de fases (onde Síntese e Redação plugam) — `src/lib/shell/phases.ts`

- `PhaseKey` atual: `question | protocol | import | duplicates | screening_ts |
  screening_ft | extraction | risk_of_bias | certainty`. `PIPELINE` (núcleo fixo, D19)
  termina em `extraction`; `OPTIONAL` = risk_of_bias/certainty (sempre `optional_off`).
- `PhaseInput.extractionRatified` = há ≥1 `extraction_value` em `accepted|edited`.
  `computePhaseStates` é **pura** (testada em `tests/unit/shell/phases*.test.ts`).
- **→ Marco 3**: adicionar `synthesis` e `report` (talvez `report` cobrindo
  checklist/características/export) ao `PIPELINE` **após** `extraction`, com `completed`
  derivado de `synthesis.status=ready` / existência de `report`. `href` →
  `/reviews/[reviewId]/synthesis` e `/report`. Atualizar `phases*.test.ts`. **Não tocar**
  a ordem/condições das fases herdadas (não-regressão).
- Trilho renderizado por `src/components/shell/PhaseRail.tsx`; barra PRISMA viva em
  `PrismaBar.tsx`; jobs em `JobsPanel.tsx`. Layout: `app/reviews/[reviewId]/layout.tsx`.

## 2. Infra de Job (espinha dos jobs do Marco 3)

**Tabelas (`0003`)**:
- `job(id, review_id, type job_type, status job_status, progress int 0..100,
  estimated_cost jsonb, actual_cost jsonb, created_at, started_at, finished_at)`.
- `job_item(id, job_id, review_id, status job_item_status[pending|done|failed],
  payload jsonb, error text, attempts int, created_at)`.
- Enums: `job_type` = `import_parse|ai_screening_batch` (+`pdf_text_pipeline` em 0012,
  +`ai_extraction_batch` em 0016). `job_status`, `job_item_status` como acima.
- RLS: `*_select` via `public.is_review_member(review_id)`.

**Padrão de worker resiliente** (`supabase/functions/_shared/jobs/worker.ts`
`processImportJob`; espelhado em `src/lib/extraction/batch-worker.ts`
`processExtractionJob` e `src/lib/embedding/batch-worker.ts`):
- marca `job.status=running`; lê `job_item` `status=pending` (**retomável**);
- por item: `try { real(item) } catch { job_item.status=failed, error, attempts++ }`
  (**falha por-item não derruba o lote**);
- recomputa status final por contagem no DB: `completed | completed_with_errors | failed`;
  `progress = done/total`. Workers de IA gravam `ai_usage` por item.
- **→ Marco 3**: `processSynthesisJob` (item = um estudo `included_ft`),
  `processReportDraftJob` (item = uma seção IA), `processReportExportJob` (item = um
  formato — resiliência por-formato, FR-023). Mesma forma; `create_<x>_job` RPCs novas.
- Helpers de leitura: `src/lib/jobs/queries.ts` (`listJobs`, `countRecords`).
- `src/lib/extraction/enqueue.ts` = molde de enqueue (valida + `rpc('create_extraction_job')`).

## 3. LLMProvider (ponto único de IA — §VII) — `src/lib/ai/llm/`

- Arquivos: `types.ts` (interface + tipos), `anthropic.ts` (real), `mock.ts` (testes,
  sem rede), `cost.ts`, `index.ts`. Contrato em `tests/unit/ai/llm-contract.test.ts`.
- Tipos-âncora:
  - `LlmSuggestion<T> = { output: T; provenance: Provenance; state: SuggestionState;
    not_found: boolean }` — toda saída IA nasce `state="pending"`.
  - `Provenance = { model, version, prompt_or_span, timestamp }` (obrigatória; check no DB).
  - `FactualValue<T> = { value, source_span, page, reason?: "not_found" }`.
  - `SuggestionState = pending|accepted|edited|rejected|inferred`.
- Métodos atuais: `identity`, `deriveEligibility`, `draftProtocol`,
  `preclassifyScreening`, `ocrPage`, `extractFields`, `estimateCost`.
- **→ Marco 3** (contracts/synthesis.md, report.md): adicionar
  `synthesizeThemes(...)` (retorna temas com `findingRefs` + provenance, ou
  `{insufficientData:true}`) e `draftReportSection({kind:"discussion"|"conclusion", ...})`.
  Estender o union de `estimateCost` com `synthesis_batch`/`report_draft`. Implementar em
  `anthropic.ts` **e** `mock.ts`; estender `llm-contract.test.ts`. Saída **pt-BR** fixa.
  **Sem SDK direto fora desta camada; sem raw-write.**

## 4. Sugestão de IA / proveniência / vocabulário visual (reuso EP-3)

- Tabela `ai_suggestion` (`0002`): `id, review_id, target_kind ai_target_kind, target_id,
  output jsonb, provenance jsonb (check de chaves), grounding jsonb, not_found bool`.
  `ai_target_kind` = `eligibility|protocol_draft|screening` (+`extraction` em 0015).
- **→ Marco 3**: `ALTER TYPE ai_target_kind ADD VALUE 'synthesis_theme'`,
  `'report_section'` (aditivo). `theme.ai_suggestion_id` / `report_section.ai_suggestion_id`
  apontam para ela. `grounding` do tema referencia `extraction_value` (nível de achado, Q3).
- Componentes reusados (`src/components/ai/`): `SuggestionChip.tsx`,
  `SuggestionActions.tsx` (accept/edit/reject), `ProvenancePopover.tsx`, `NotFound.tsx`,
  `AsyncActionButton.tsx`, `state.ts` (`SUGGESTION_STATE_LABEL`/`_CLASS`). **Reusar tal
  qual** para temas e seções IA — não reinventar (testes em `tests/unit/ai/`).

## 5. Contadores PRISMA = fonte única do fluxograma (US2, §VI)

- Views (`0007`, estendida `0010`, `security_invoker=true` → herdam RLS de
  `record`/`exclusion_reason`):
  - `prisma_counter(review_id, identified, duplicates, screened, included_ts, excluded_ts,
    maybe_ts, included_ft, excluded_ft, passed_ts)`.
  - `prisma_exclusion_breakdown(review_id, reason_id, reason_label, n)`.
- Acesso já pronto: `src/lib/prisma/queries.ts` → `getPrismaCounters(reviewId)`,
  `getExclusionBreakdown(reviewId)`. Testado em `tests/integration/prisma-counter.test.ts`,
  `tests/e2e/shell-prisma.spec.ts`.
- **→ Marco 3**: `src/lib/prisma/queries.ts` **ESTENDER** com `buildPrismaFlowModel`
  (mapeia as duas queries → modelo de caixas, `partial:boolean` se fases abertas) +
  `renderPrismaSvg(model)` (template determinístico, read-only, fontes externas
  zero/ocultas — Q4/FR-011a). **NÃO recontar**; consumir as views. PNG = rasterizar o SVG
  (`@resvg/resvg-wasm`) no worker de export. Renderer in-app: Server Component síncrono.

## 6. Extração = fonte da síntese (grounding) e da tabela de características

- `extraction_form` 1:1 da Revisão; `extraction_field(id, name, type
  text|number|date|boolean|select, options[], sort_order, is_active)`.
- `extraction_value` (`0015`): `id, review_id, record_id, field_id, ai_suggestion_id,
  final_value jsonb, state suggestion_state, superseded_by_id`. Índice único de valor
  ativo por (record, field). RPC `ratify_extraction_value` (humano-no-laço).
- Helpers prontos (`src/lib/extraction/queries.ts`): `listStudies` (record
  `corpus_state='included_ft'`), `listExtractionFields`, `listExtractionValues(reviewId,
  recordId)` → `ExtractionValueView{ id, field_id, state, final_value, output, provenance,
  grounding }`. `listExtractionBatchCandidates` (included_ft com PDF processado).
- **→ Marco 3**:
  - **Síntese**: o `synthesis_batch` coleta os `extraction_value` ratificados
    (`state in accepted|edited`, `final_value`) por estudo → `synthesizeThemes`. Cada
    `theme_finding.extraction_value_id` é a âncora de grounding (A1/Q3).
  - **Tabela de características (US4, R6)**: **derivação pura** de `extraction_field` ×
    `extraction_value` (colunas = campos ativos; 1 linha/estudo `included_ft`). **Sem
    tabela nova.** Provável novo `buildCharacteristicsTable` em `src/lib/prisma/` ou
    `src/lib/report/`.
  - **A1 (shape de `theme.summary_table`)**: a tabela-resumo do tema deve derivar dos
    `theme_finding` → `extraction_value` (linhas = achados/estudos do tema; colunas =
    `extraction_field` relevantes). Decidir o shape jsonb na fatia de síntese, ancorado
    nestes tipos reais (recomputável a partir do grounding).

## 7. Protocolo / emendas / pergunta = fonte de Métodos e Desvios (determinístico, R9)

- `question(review_id unique, framework question_framework, fields jsonb, question_text)`.
- `eligibility_criterion(review_id, question_id, kind criterion_kind, text, origin, ...)`.
- `protocol(review_id unique, content jsonb, state protocol_state[draft|locked],
  locked_at)`; `protocol_amendment(protocol_id, version int, change jsonb, dated_at date)`;
  RPCs `lock_protocol`, `add_protocol_amendment`. Markdown helpers em
  `src/lib/protocol/markdown.ts`; UI `AmendmentList.tsx`.
- **→ Marco 3** (`src/lib/report/`, **sem LLM**): `buildMethodsSection` (pergunta +
  critérios + protocolo + buscas + fluxo de triagem), `buildDeviations` (lista
  `protocol_amendment` datadas), `buildAiDeclaration` (enumera `ai_suggestion` por fase +
  proveniência), `buildOptionalPhasesDeclaration` (Viés/Certeza OFF → declara). Métodos =
  determinístico; **Resultados** = montagem sem novo passe de LLM, **embutindo** a
  narrativa de síntese ratificada (US1) + contagens + características (A3).

## 8. Auditoria, RLS, BYOK, custo

- `audit_entry` insert-only (ator/timestamp/before/after); helpers `src/lib/audit/`.
  Toda mudança de estado do Marco 3 (gerar/editar síntese, ratificar tema, editar seção,
  regenerar) **grava `audit_entry`** (§III). Export disponível: `audit/export/route.ts`.
- RLS: helper `public.is_review_member(review_id)`. **Todas** as tabelas novas seguem
  `using (is_review_member(review_id))` (Princípio IV). Testes RLS abundantes em
  `tests/integration/rls.*.test.ts` — **espelhar** para cada tabela nova.
- BYOK: `byok_key` + `set_byok_key` (Vault); `MissingByokError`. Síntese/redação reusam.
- Custo/consumo: `ai_usage(review_id, phase text, tokens_in, tokens_out, cost jsonb,
  job_id)`. UI/agregação `src/lib/shell/usage.ts` (`usage-by-phase`). Workers de IA
  inserem `ai_usage` por item (ver `extraction/batch-worker.ts:59`, `phase:'extraction'`).

## 9. Storage bucket (precedente para `exports`) — `0012`

- Padrão `pdfs`: `insert into storage.buckets (id,name,public,file_size_limit,
  allowed_mime_types) values ('pdfs','pdfs',false,…)`; policies em `storage.objects`
  (`pdfs_select_member`/`insert`/`delete`) com `is_review_member` e `review_id` derivado
  do **path**. `document` table + `attach.ts` (upload) + `create_pdf_pipeline_job`.
- **→ Marco 3 (R8)**: bucket privado `exports`; policies espelhando `pdfs_*`; path
  `review/<review_id>/report/<report_id>/<format>/<id>.<ext>`. Tabela `export_artifact`
  referenciando `storage.objects`. Mesmo padrão, **sem reinventar**.

## 10. Stack / deps reais (`package.json`)

- Presentes: `@anthropic-ai/sdk ^0.100`, `@supabase/{ssr,supabase-js}`,
  `@tanstack/{react-query,react-table,react-virtual}`, `react-hook-form`+`zod`,
  `react-markdown`+`remark-gfm` (preview de relatório — reuso), `unpdf` (rasterize),
  `papaparse`, `@retorquere/bibtex-parser` (parser de import — **leitura**; BibTeX/RIS de
  **saída** são serializadores próprios, R4), `next ^14.2`, `react 18`. Test: `vitest`,
  `@playwright/test`, testing-library, `jsdom`.
- **Novas, só por tarefa explícita por fatia** (constitution §Portões; HANDOFF DO NOT):
  `docx` (R3), `pdfmake` (R3), `@resvg/resvg-wasm` (R2), `citeproc`+CSL APA 7 (R4).
- Scripts: `test`=vitest run, `test:e2e`=playwright, `lint`=next lint,
  `typecheck`=tsc --noEmit, `gen:types` (regenerar `src/types/database.ts` após migrations).

## 11. Rotas/superfícies a criar (`app/reviews/[reviewId]/`)

- Existentes (NÃO refatorar): `question/`, `protocol/`, `workbench/` (import+dedup+triagem
  unificados, §V), `extraction/`, `search/`, `audit/`, `page.tsx`, `layout.tsx`.
- **→ Marco 3 [novo]**: `synthesis/page.tsx` (+`actions.ts`) — temas, narrativa,
  tabelas-resumo, validação humana; `report/page.tsx` (+`actions.ts`) — seções editáveis,
  fluxograma SVG, declaração-IA, desvios, checklist, características, painel de export.
  Componentes novos em `src/components/{synthesis,report,prisma}/`; hooks `use*.ts` novos.

## 12. Padrão de teste herdado (espelhar)

- `tests/unit/` (lógica pura: serializadores, montagem determinística, derivações,
  componentes `*.test.tsx` com testing-library + mock LLM).
- `tests/integration/` (DB direto via `helpers/supabase.ts` — **não** o server
  `createClient()`, que quebra fora de request; cf. memória "integration-tests-cant-call-
  server-client-wrappers"): RLS por tabela, fluxograma=views, regeneração preserva seções.
- `tests/e2e/` (Playwright): fluxo síntese → relatório → exportação multi-formato (SC-005).
- Coverage ≥80% em funções críticas (aqui: serializadores BibTeX/RIS/APA7, derivação do
  fluxograma, montagem/regeneração do relatório).

---

## Resumo dos pontos de extensão (checklist para a fatiação)

| Área | Existe | Marco 3 faz |
|------|--------|-------------|
| Migrations | `0001`–`0017` | `0018`+: 7 tabelas novas + bucket `exports` + policies + ALTERs aditivos (`ai_target_kind`, `job_type`) — **`ai_usage.phase` é text, sem ALTER** |
| LLMProvider | 7 métodos | +`synthesizeThemes`, +`draftReportSection`, +`estimateCost` kinds (types/anthropic/mock + contract test) |
| Jobs | RPC `create_*_job` + Node `batch-worker` via server action | `synthesis_batch`/`report_draft`/`report_export` no **mesmo padrão Node** (não Deno) |
| PRISMA flow | views + `prisma/queries.ts` | `buildPrismaFlowModel`+`renderPrismaSvg` (consome views) + PNG no worker |
| Síntese | `extraction_value` + grounding | `synthesis`/`theme`/`theme_finding` + clustering via LLM; A1 shape da summary_table |
| Relatório | protocolo/emendas/ai_suggestion/views | `report`/`report_section` (edit_state); montagem determinística (Métodos/decl-IA/desvios); Resultados embute síntese (A3); Discussão/Conclusão via LLM |
| Checklist/Características | `extraction_*` | `prisma_checklist_item` (seed 27) + `buildCharacteristicsTable` (derivado, sem tabela) |
| Export | bucket `pdfs` precedente | bucket `exports` + `export_artifact` + serializadores docx/pdf/md/bibtex/ris + APA7 |
| Vocabulário IA | `src/components/ai/*` | **reuso** para temas e seções |
| Auditoria/RLS | `audit_entry`, `is_review_member` | espelhar em todas as tabelas novas |
