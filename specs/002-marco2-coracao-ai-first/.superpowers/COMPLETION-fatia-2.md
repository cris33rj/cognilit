# Fatia 2 — Pipeline de texto assíncrono híbrido (US1-B) — COMPLETION

**Branch:** `build/002-marco2-coracao-ai-first/2-pipeline-texto` (tip `11bd58d`)
**Base:** feature HEAD `758c8e1` (Fatia 1 mergeada + IMPLEMENTATION_PLAN da Fatia 2)
**Estado:** ✅ Completa, aguardando **merge manual** (CHECKPOINT 3).

## O que foi entregue

O pipeline assíncrono que transforma os PDFs anexados na Fatia 1 (job `pdf_text_pipeline`
em `queued`) em **texto pronto para IA**. Um worker **server-side Node**
(`runPdfPipelineWorkerWith` → `processPdfPipelineJob`, espelhando o de screening do Marco 1)
processa **1 PDF por `job_item`** (páginas como sub-passos): baixa o binário do Storage,
extrai texto **nativo determinístico** por página (`unpdf`), detecta páginas escaneadas por
**limiar de densidade**, faz **OCR multimodal** via novo `LLMProvider.ocrPage` nas escaneadas,
e grava `text_layer` com `origin ∈ {nativo, ocr_ia}` e `page` 1-based. O `document` percorre
`queued → processing → text_ready | partial | failed`. **Retomável** (só pega `job_item`
`pending`) e **resiliente em dois níveis**: PDF que não abre → `document.failed` + item
`failed` (sem derrubar a fila); página que falha no OCR → `document.partial`, item `done`.

## Tarefas (7) — todas com spec-review + code-review (two-stage)

| # | Entrega | Commits |
|---|---------|---------|
| 1 | Migração 0013: `text_origin` enum + tabela `text_layer` + RLS (select membro) | `2783e20` |
| 2 | `extractNativeText` (unpdf 1.6.2, por página) + `isScannedPage` (densidade) | `8fecb75` (+`c2ae660`) |
| 3 | `LLMProvider.ocrPage` multimodal (types/mock/anthropic) | `a276a89` (+`b6c795a`) |
| 4 | `rasterizePage` (unpdf `renderPageAsImage`) — seam injetável (D31) | `1db4677` (+`61a7b5b`) |
| 5 | Worker `processPdfPipelineJob` — nativo+OCR por página, resiliente | `298a12a` (+`c84bcee`) |
| 6 | Runner `runPdfPipelineWorkerWith` + 4 testes de integração | `e729ed6` (+`9637636`) |
| 7 | Server Action `runPdfPipelineWorker` + disparo no `DocumentsPanel` | `94b7d55` (+`11bd58d`) |

Os commits `+(...)` são correções de code-review aplicadas dentro de cada tarefa
(observabilidade, idempotência, contrato de idioma do OCR, guard de rasterização, robustez de teste).

## Portões (CHECKPOINT 3) — evidência (HEAD `11bd58d`)

- `npm run lint` → ✔ No ESLint warnings or errors
- `npx tsc --noEmit` → 0 erros
- `npm test` → **62 arquivos / 263 testes**, todos verdes (baseline da Fatia 1 era 59/254;
  a fatia adicionou 3 arquivos de teste / +9 testes: `extract`, `ocr-page`, `pdf-pipeline`)

## Cobertura de requisitos

- **FR-006** worker retomável + resiliente por-item — `processPdfPipelineJob` (commit por item,
  só pega `pending`); teste de resiliência/retomável em `pdf-pipeline.test.ts`
- **FR-007** extração nativa determinística + híbrido nativo/OCR — `extract.ts` + worker
- **FR-008** `text_layer.origin` (`nativo`/`ocr_ia`), `page` 1-based — migração 0013 + worker + asserts
- **FR-015** OCR preserva o **idioma original** — `ocrPage` sem `PT_BR` no system prompt (fix `b6c795a`)
- **FR-005** (parte assíncrona) trabalho pesado no worker, nunca inline (§VIII)
- **SC-011** isolamento por Revisão — RLS de `text_layer` (teste de RLS cross-review)
- **A1/D31** lib nativa (`unpdf`, dep por tarefa explícita) + limiar de densidade
  (`DEFAULT_SCAN_THRESHOLD=30`, calibrável) — isolados atrás de seams injetáveis

## Não-regressão (Princípio V)

A integração com o Marco 1 é **estritamente aditiva**:
- `runPdfPipelineWorker` é uma nova Server Action espelhando `runScreeningWorker`; nenhuma
  ação existente foi alterada.
- O disparo do pipeline é threado como **prop opcional** (`onRunPdfPipeline`) por
  `page.tsx → ScreeningQueue → DocumentsPanel` (mesmo padrão da Fatia 1); a triagem não foi
  refragmentada. A única "deleção" no diff é um `else {` (envolver duas instruções), sem
  mudança de comportamento.
- `ALTER`/migração é **0013** (aditiva). Suíte do Marco 1 + Fatia 1 segue verde.

## Decisões de design e desvios do plano (registrados)

- **Worker server-side Node** (A1), não Edge/Deno — o `LLMProvider` Node não roda no Deno edge.
- **Idempotência por-item** (não no plano original): o worker apaga as `text_layer` do
  documento no início do processamento do item, antes de reextrair — evita linhas duplicadas
  `(document_id, page)` se um item `pending` for reprocessado após crash (não há UNIQUE no
  schema; granularidade de retomada = PDF, conforme o design "páginas como sub-passos").
- **Observabilidade**: falha de página agora loga `console.error` (antes era `catch {}` mudo).
- **Fixture `tests/fixtures/sample.pdf`**: era um PDF em branco (Fatia 1) e depois ficou com 29
  chars não-brancos (1 abaixo do limiar 30); foi atualizada para um PDF com texto (~33 chars)
  para o teste nativo exercitar `origin='nativo'`. O teste nativo também passou a forçar o
  caminho nativo via `scanThreshold: 0` (desacoplado do conteúdo da fixture). Mudança benigna:
  o e2e da Fatia 1 só checa o nome "sample.pdf"; a integração da Fatia 1 monta bytes inline.

## Fora desta fatia / pendências sinalizadas (D31 + backlog)

- **Calibração D31 (produção):** o valor real de `DEFAULT_SCAN_THRESHOLD` e a qualidade do
  OCR precisam ser validados contra PDFs reais do corpus (scaneados longos/teses).
- **Backend de canvas:** o caminho **real** de `rasterizePage` exige `@napi-rs/canvas`
  instalado no ambiente do worker (peer opcional do `unpdf`). Instalar antes de habilitar o
  caminho de OCR em produção. (Nos testes, um rasterizador falso é injetado.)
- **Defesa adicional opcional:** considerar `UNIQUE (document_id, page)` em `text_layer` +
  `upsert` como reforço de schema à idempotência já garantida no worker.
- Extração por IA (Fatia 4), formulário (Fatia 3), embeddings/RAG (Fatia 6) — fora do escopo.

## Infra do worktree (notas)

- Worktree em `.worktrees/build+002-marco2-coracao-ai-first+2-pipeline-texto`, criado a partir
  do HEAD da feature (`758c8e1`) via `git worktree add` (base explícita), sessão entrada via
  `EnterWorktree path:`. `.env.local` copiado; `npm install` (741 pkgs); `supabase db reset`
  aplicou 0001–0013. Shebang do husky já correto.
