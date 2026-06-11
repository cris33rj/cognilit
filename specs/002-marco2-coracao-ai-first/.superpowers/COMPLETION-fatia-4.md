# Fatia 4 — Extração por IA: grounding + proveniência + validação humana (US3) — COMPLETION

**Branch:** `build/002-marco2-coracao-ai-first/4-extracao-ia` (tip `618be10`)
**Base:** feature HEAD `bc2e0ca` (F2 + F3 mergeadas + IMPLEMENTATION_PLAN da Fatia 4)
**Estado:** ✅ Mergeada na feature branch — merge `925ba7c` (2026-06-11).

## O que foi entregue

A **extração por IA com humano-no-laço** (US3): sobre um estudo (`record` com
`corpus_state='included_ft'`) que tem PDF processado (`text_layer` da Fatia 2), o
`LLMProvider.extractFields` preenche os campos do formulário (Fatia 3) **como sugestões**,
cada uma com **trecho-fonte + página** (grounding), **proveniência obrigatória**,
**"não encontrado" de 1ª classe** e campos **inferidos** marcados. O humano **aceita /
edita / rejeita** via RPC `security definer` auditada; **a IA nunca finaliza** (FR-019/§I):
só ela escreve `pending`/`inferred`, só o humano move ao `final_value`. **Re-extração**
encosta novas sugestões pendentes **sem sobrescrever** o validado (FR-019a/Q4). A UI
**reusa `src/components/ai/*`** (FR-020). Uma **fase "Extração"** entra no trilho pós-triagem.

Espelha o caminho de IA do Marco 1 (screening): **server-side Node**, provider injetado
(decisão A1); a IA escreve via **service-role** (bypassa RLS, como `screening/worker.ts`);
o humano ratifica via **RPC auditada** com `auth.uid()` (como as RPCs da Fatia 3).
**Sem job/lote, sem `ai_usage`, sem embeddings** — single por estudo (lote+custo → F5;
RAG → F6).

## Tarefas (15, executadas via subagent-driven-development) → commits

| # | Entrega | Commit(s) |
|---|---------|-----------|
| 1 | Migração 0015: `extraction_value` + RLS `select` + índice parcial `active_uidx` + `ALTER ai_target_kind ADD 'extraction'` | `a1b0eab`, `f371c93` (review) |
| 2 | RPC `ratify_extraction_value` (security definer, audita `human`/`auth.uid()`) | `d76bbba`, `f997f7e` (review) |
| 3 | Regeneração de `src/types/database.ts` | `c30ffac` |
| 4 | `LLMProvider` tipos de extração + `estimateCost` union | `31aefdb` |
| 5 | `estimateExtractionCost` + kind `ai_extraction_batch` (mock/anthropic) | `19f6ad5`, `e02ebc2` (review) |
| 6 | `MockLLMProvider.extractFields` (not_found/inferred/grounding) | `84f751b`, `e02ebc2` (review) |
| 7 | `AnthropicProvider.extractFields` (budget de tokens, `safeParse`) | `3ed38cd`, `e02ebc2` (review) |
| 8 | `runExtractionForRecord` + `run.ts` (ai_suggestion+extraction_value, grounding, re-extração) | `a5855cf`, `b963599` (review) |
| 9 | `listStudies` + `listExtractionValues` (camada de leitura) | `6c75006`, `f0d9ed0` (review) |
| 10 | Server Actions `runExtraction` + `ratifyExtractionValue` | `8b1678a` |
| 11 | `ExtractionRunner` (reusa `components/ai/*`) | `e8c97f5`, `50136f0` (review) |
| 12 | Página da Extração: lista de estudos + runner | `3bc4eb1` |
| 13 | Fase "Extração" no trilho (`phases.ts`) sem quebrar T/R | `3310d8c` |
| 14 | Teste de isolamento RLS cross-review (SC-011) | `618be10` |

Cada tarefa passou por **review de spec-compliance + review de qualidade** por subagentes;
correções aplicadas inline (commits `(review)`). **Final integration review** (cross-task,
opus) → **READY TO MERGE**, sem achados bloqueantes.

## Portões (CHECKPOINT 3) — evidência (tip `618be10`)

- `npx vitest run` → **73 arquivos / 310 testes — 310 verdes**. Baseline da Fatia 3 era
  66/283; a F4 adicionou **7 arquivos / +27 testes** (integration: `extraction-value` 8,
  `extract-record` 4, `rls.extraction-value` 1; unit: `extract-fields` 5, `extraction-cost` 3,
  `extraction-runner` 5, `phases-extraction` 3). O `pdf-pipeline.test.ts` (flaky da F2) passou
  sob a suíte cheia desta vez.
- `npm run lint` → ✔ No ESLint warnings or errors
- `npx tsc --noEmit` → 0 erros

## Cobertura de requisitos (FR-012..020, 030)

- **FR-012** campos a partir do texto, span+página — `extractFields` + `runExtractionForRecord`
  (grounding resolvido da `text_layer`).
- **FR-013** "não encontrado" 1ª classe — `{value:null, reason:'not_found'}`, `ai_suggestion.not_found`,
  `<NotFound/>`.
- **FR-014** inferido — `inferred=true` ⇒ `state='inferred'` ⇒ chip "Inferida".
- **FR-015** pt-BR + span no idioma original — mock/anthropic preservam `source_span`; UI o cita.
- **FR-016** proveniência obrigatória — `result.provenance` gravada em `ai_suggestion.provenance`
  (CHECK `ai_suggestion_provenance_keys` garante os 4 campos).
- **FR-017/017a** só via `LLMProvider`, texto direto, **sem embeddings** (US3⟂US5) — verificado
  por grep no review (zero referência a `embedding_chunk`).
- **FR-018** aceitar/editar/rejeitar + estados — `ratify_extraction_value` + `SuggestionActions`.
- **FR-019** IA nunca finaliza — a IA só grava `pending`/`inferred`; `final_value` só pela RPC humana.
- **FR-019a** re-extração sem sobrescrever — novas pendentes; validadas intactas (teste dedicado
  prova `active.length===2` e `final_value` preservado).
- **FR-020/030** reuso do vocabulário visual de IA — `SuggestionChip`/`ProvenancePopover`/
  `SuggestionActions`/`NotFound`; distinção humano/IA pelos tokens de estado.
- **FR-029** auditoria — `ratify_extraction_value` grava `audit_entry` `human` + before/after.
- **SC-011** isolamento por Revisão — RLS `select` por membro + membership na RPC;
  `rls.extraction-value.test.ts` (não-membro não lê nem ratifica).

## Não-regressão (Princípio V / Marco ≥ 2)

Estritamente **aditivo**: migração **0015** aditiva; novo módulo de lib/componentes;
extensão da rota `extraction/`. A fase "Extração" entra no `PIPELINE` **ao fim** (após
`screening_ft`) — a derivação linear T/R fica intacta (3 testes de não-regressão verdes,
§7-C). `ALTER ai_target_kind` aditivo. **Não** toca workbench/triagem/screening/import/F1-F3;
**não** introduz job/`ai_usage`/embeddings. Suíte do Marco 1 + Fatias 1–3 segue verde.

## Decisões de design (registradas)

- **IA escreve via service-role; humano via RPC auditada.** RLS de `extraction_value` é
  `select`-only; toda escrita da IA passa pelo admin client (espelha `screening/worker.ts`).
- **`extraction_value` reusa o enum `suggestion_state`** (sem enum novo); `state` espelha a sugestão.
- **Índice parcial `extraction_value_active_uidx`** `(record_id,field_id) where state in
  ('pending','inferred')` — garante no máximo **uma** sugestão não-ratificada viva por
  (estudo,campo), compatível com FR-019a (validado coexiste com nova pendente).
- **Re-extração:** pendentes/inferidas anteriores → `rejected` antes do novo insert; validadas
  nunca tocadas; `listExtractionValues` filtra `rejected`.
- **Grounding resolvido no lib:** provider devolve `page`+`source_span` (text_layer_id/origin null);
  o lib mapeia `page → {text_layer_id, origin}` da `text_layer`.
- **`extractFields` do Anthropic** chama `messages.create` direto com `max_tokens` escalado por
  nº de campos (evita truncamento→not_found silencioso em formulários grandes; review I-1).
- **`estimateCost` kind `ai_extraction_batch`** é **contrato-only** nesta fatia (usado na F5).

## Fora desta fatia / pendências sinalizadas (para o desenvolvedor / F5)

- **not_found + "Aceitar":** o `ExtractionRunner` ainda mostra Aceitar/Editar para uma sugestão
  `not_found` (aceitar grava `{value: undefined}`→`{}`; sem risco de integridade). Polimento
  sugerido pelo integration review: ocultar "Aceitar" quando `not_found` (oferecer Rejeitar/Editar).
  Adiado à F5/polimento.
- **Insert não-transacional (3 passos)** em `runExtractionForRecord` — se o insert de
  `ai_suggestion` falhar, fica `extraction_value` órfã `pending` (auto-reaproveitada pela próxima
  re-extração; comentado no código). Hardening eventual: RPC transacional.
- **Grounding "first-wins por página"** quando um estudo tem ≥2 PDFs na mesma página (estudo típico
  tem 1 PDF; limitação comentada no código).
- **Lote + estimativa-de-custo na UI + consumo (`ai_usage`)** — FR-021/022/023 → **Fatia 5**.
- **Busca semântica / embeddings (US5)** → **Fatia 6**.

## Infra do worktree (notas)

- Worktree em `.worktrees/build+002-marco2-coracao-ai-first+4-extracao-ia`, criado a partir do
  HEAD da feature (`bc2e0ca`) via `git worktree add … HEAD`, entrada via `EnterWorktree path:`.
  `.env.local` copiado; `npm install`; `npx supabase db reset` aplicou 0001–0015; shebang do
  husky correto.
