# Fatia 6 — Busca semântica / RAG (US5) — COMPLETION

**Branch:** `build/002-marco2-coracao-ai-first/6-busca-semantica` (tip `5d40131`)
**Base:** feature HEAD `58b99ac` (F1–F5 mergeadas + IMPLEMENTATION_PLAN da Fatia 6)
**Estado:** ✅ Mergeada na feature branch — merge `0ad546c` (2026-06-11). **Última fatia do Marco 2.**

## O que foi entregue

A **busca semântica / RAG** (US5): o pesquisador faz uma **consulta em linguagem natural**
sobre os PDFs ingeridos e recebe os **trechos mais similares ancorados a página/posição e ao
estudo de origem** (FR-024). Os embeddings são gerados por um **job assíncrono** retomável e
resiliente por-item (FR-027) via uma nova abstração **`EmbeddingProvider`** (default **Voyage
AI**, `voyage-3`/1024), com uma **2ª chave BYOK** cifrada via Vault e **distinta** da do LLM
(FR-028). Vetores em **pgvector** com índice **HNSW** cosseno; a busca é **escopada por Revisão**
(RLS + filtro `review_id` na RPC `security definer`) — zero vazamento entre Revisões (SC-008/011).
Sem a 2ª chave ⇒ a busca é **sinalizada indisponível** e o resto do produto segue operável.

Segundo eixo de IA (§VII), **independente** do `LLMProvider` e da extração (US3 ⟂ US5, Q1).
Espelha três padrões já no repo: a abstração do LLM (`src/lib/ai/embedding/`), a infra de lote
da Fatia 5 (`src/lib/embedding/`) e o BYOK via Vault — este **parametrizado por `purpose`** para
acomodar a 2ª chave (única mudança que toca código herdado, exceção justificada §7-B).

## Tarefas (16) → commits

| # | Entrega | Commit |
|---|---------|--------|
| 1 | Migração 0017: pgvector + `embedding_chunk` (HNSW cosseno + RLS) + `embedding_batch` enum + BYOK `purpose` + RPCs `create_embedding_job`/`match_embedding_chunks` | `64b4312` |
| 2 | Regeneração de `src/types/database.ts` | `b3a111a` |
| 3 | `EmbeddingProvider` tipos + `MissingEmbeddingKeyError` | `f8d24fd` |
| 4 | `MockEmbeddingProvider` (vetor 1024 determinístico/normalizado) | `d263cff` |
| 5 | `VoyageProvider` (adapter `fetch`, `input_type` document/query) | `8aa6c76` |
| — | Fix `noUncheckedIndexedAccess` nos providers + testes (lacuna do plano: Tasks 4/5 rodavam vitest mas não `tsc`) | `55919a3` |
| 6 | BYOK 2ª chave por `purpose` (set/get/status parametrizados) | `d46c072` |
| 7 | `getEmbeddingProvider` resolve a 2ª chave (Voyage, server-side) | `fbe8475` |
| 8 | Chunking ancorado a página/posição com overlap (R6) | `347e762` |
| 9 | `enqueueEmbeddingJob` + `listEmbeddingCandidates` | `d7489d2` |
| 10 | `processEmbeddingJob` por documento, resiliente/retomável + `ai_usage(phase='embedding')` | `00fc3e6` |
| 11 | `runEmbeddingBatchWorkerWith` processa jobs ativos (A1) | `b821baa` |
| 12 | `semanticSearch` via `match_embedding_chunks`, resultados ancorados | `7a52f8b` |
| 13 | Teste de isolamento RLS cross-review (SC-008/011) | `5c12bb1` |
| 14 | Server actions de busca (estimate/run/search/saveEmbeddingKey) + fallback indisponível | `192f571` |
| 15 | UI da busca semântica + 2ª chave + indexação | `5d40131` |

17 commits no total (16 tarefas + 1 fix de strict-mode). Execução via
`subagent-driven-development` (implementer + verificação independente por tarefa).

## Decisões de implementação (ratificadas no CHECKPOINT 2)

- **D-F6.1 — Voyage via `fetch`, sem novo SDK.** `VoyageProvider` é um adapter fino sobre
  `POST https://api.voyageai.com/v1/embeddings`. **Zero dependências novas** (honra o portão da
  constitution). Toda a interação Voyage fica isolada em `voyage.ts`.
- **D-F6.2 — Granularidade do job: item = um documento.** Cada `job_item` é um `document`; o
  worker lê a `text_layer`, chunka, embeda todos os chunks e insere. Espelha 1:1 a Fatia 5
  (item = estudo); resiliência por-item clara.

## Portões (CHECKPOINT 3) — evidência (tip `5d40131`)

- `npx vitest run` → **83 arquivos / 351 testes — 351 verdes**. Baseline da Fatia 5 era 76/320;
  a F6 adicionou **7 arquivos** (unit: `chunk`, `mock-embedding`, `voyage`; integration:
  `byok-purpose`, `embedding-batch`, `semantic-search`, `rls.embedding-chunk`).
- `npm run lint` → ✔ No ESLint warnings or errors
- `npx tsc --noEmit` → 0 erros

## Cobertura de requisitos (FR-024..028, SC-008, A2/A3)

- **FR-024** consulta semântica → trechos ancorados (page/source_span/estudo): `semanticSearch`
  + RPC `match_embedding_chunks` (join `document.record_id`) + UI.
- **FR-025** escopo por Revisão: RPC `security definer` com `is_review_member` + `where
  review_id`; RLS select-only por membro em `embedding_chunk`.
- **FR-026** `EmbeddingProvider` (Voyage) + dimensão variável: coluna `provider/model/dim`;
  comentário explícito **dim fixa do índice HNSW vs. dim variável do schema (A3)** na migration.
- **FR-027** job assíncrono retomável/resiliente por-item: `create_embedding_job` (idempotente —
  só documentos sem `embedding_chunk`) + `processEmbeddingJob` (item falho ⇒ `failed` sem gravar
  chunk; demais seguem; status `completed`/`completed_with_errors`/`failed`).
- **FR-028** 2ª chave BYOK distinta + indisponibilidade graciosa: `byok_purpose` + unicidade
  `(review_id, purpose)` + `getEmbeddingProvider`; sem chave ⇒ UI "indisponível", resto operável.
- **SC-008/011** 0 vazamento + ancoragem: `rls.embedding-chunk.test.ts` (busca de A não retorna
  chunk de B; busca cross-review rejeitada; leitura direta da tabela isolada por RLS).
- **A2** defaults voyage-3/1024, HNSW `m=16`/`ef_construction=64`, chunking ~2000 chars/15% overlap.

## Não-regressão (Princípio V / Marco ≥ 2)

Aditivo, **exceto** a parametrização do BYOK por `purpose` (exceção justificada §7-B), com default
`'llm'` que **preserva todos os chamadores herdados** (páginas question/protocol, `ByokKeyForm`
seguem compilando e verdes). Migração 0017 aditiva (extensão `vector`, nova tabela, `ALTER`s de
enum aditivos, novas RPCs). Novo módulo `src/lib/embedding/` + `src/lib/ai/embedding/` + rota
`search/`. **Zero dependências novas.** Suíte do Marco 1 + Fatias 1–5 segue verde.

## Decisões de design (registradas)

- **Vetor inserido como literal `"[v0,v1,...]"`** (string); pgvector parseia. A busca passa o
  vetor da query como `text` e a RPC faz `::vector`.
- **HNSW por dimensão fixa do provedor ativo (1024).** Trocar de provedor com outra dimensão é
  operação de reindexação/migração, não caminho quente da v1 (comentado na migration).
- **`ai_usage.phase='embedding'`** reusa o campo text (sem `ALTER`), consistente com a F5.
- **Custo da 2ª chave contabilizado separado** do LLM (FR-023/R9), via `phase='embedding'`.

## Limitações conhecidas / pendências sinalizadas (pós-merge)

- **Rate-limit da Voyage sem retry/backoff (verificado em uso real).** O worker dispara **1
  requisição por documento, em sequência e sem throttle**. No tier gratuito da Voyage (sem método
  de pagamento: **3 RPM / 10K TPM**) um lote pequeno já retorna **HTTP 429** nos itens excedentes.
  O comportamento é **correto** (FR-027: falha por-item isolada, item retomável — re-rodar
  "Gerar embeddings" reprocessa os pendentes), mas o UX num tier limitado é ruim. **Enhancement
  recomendado:** retry com backoff respeitando `Retry-After` e/ou throttle entre requisições no
  `VoyageProvider`/worker. **Não** está no spec (FR-027 só exige resiliência por-item, que existe).
- **Fase "Busca" não está no trilho de navegação** (`src/lib/shell/phases.ts`): a rota
  `/reviews/<id>/search` é alcançável apenas por URL direta. Wire opcional no rail fica como
  polimento de navegação.
- **Hygiene de teste (menor):** `semantic-search.test.ts` e `rls.embedding-chunk.test.ts`
  importam os helpers `setupReview`/`seedDoc` de `embedding-batch.test.ts` (padrão definido no
  plano), o que re-executa os describes daquele arquivo nos importadores. Tudo verde; um polimento
  seria extrair os helpers para um módulo não-`.test`.
- **`runEmbeddingBatch`/`semanticSearchAction` não caem no Mock** sem a 2ª chave (retornam
  "indisponível", fiel ao FR-028) — diferente da F5, cujo lote usa MockLLMProvider. Só o
  `estimateEmbeddingBatch` usa Mock como fallback. Testar o fluxo RAG completo localmente exige
  uma chave Voyage real.

## Infra do worktree (notas)

- Worktree em `.worktrees/build+002-marco2-coracao-ai-first+6-busca-semantica`, criado do HEAD da
  feature (`58b99ac`) via `git worktree add … HEAD` + `EnterWorktree path:`. `.env.local` copiado;
  `npm install`; `npx supabase db reset` aplicou 0001–0017; shebang do husky correto.

---

## Marco 2 — encerramento

Com a F6 mergeada, **as 6 fatias do Marco 2 estão completas e mergeadas na feature branch**
(`002-marco2-coracao-ai-first`): ingestão de PDF (F1) → pipeline de texto híbrido (F2) →
formulário de extração (F3) → extração por IA com proveniência (F4) → extração em lote +
custo/consumo (F5) → busca semântica/RAG (F6). Gate de cobertura do `slicing.md`: **todas as US
(US1–US5) cobertas**, FR-001..030 atribuídos, A1–A4 resolvidos. Pronto para a verificação de
marco e o merge da feature branch (operação do desenvolvedor).
