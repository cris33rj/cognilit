# Research — Marco 2: Coração AI-first

**Feature**: `002-marco2-coracao-ai-first` | **Date**: 2026-06-09
**Input**: [spec.md](./spec.md), [.specify/memory/constitution.md](../../.specify/memory/constitution.md), Marco 1 (`specs/001-marco1-nucleo-fluxo/`)

> Fase 0 do `/speckit-plan`. Resolve as decisões deixadas em aberto pela spec
> (seção Assumptions) **dentro da stack ratificada** e **ancorada no código real do
> Marco 1** (mergeado em `main`): `LLMProvider` (`src/lib/ai/llm/`), infraestrutura
> de jobs (`job`/`job_item` + `supabase/functions/jobs-enqueue` + `jobs-worker` via
> `pg_cron`), BYOK via Vault (`src/lib/byok/`), 11 migrations (`0001`–`0011`). Cada
> decisão `R*` cita o FR/Princípio que a motiva. Mecanismos concretos validáveis
> contra PDFs reais do corpus-alvo ficam sinalizados (D31).

---

## R1 — Extração determinística de texto nativo (PDF com camada de texto)

**Decisão**: extrair o texto nativo no **worker** (Edge Function Deno), por PDF,
com uma biblioteca compatível com o runtime Deno/serverless (candidata primária:
`unpdf` — wrapper de pdf.js empacotado para serverless; fallback `pdfjs-dist`).
Adicionada **por tarefa explícita** na fatia do pipeline (constitution §Portões).

**Rationale**: FR-005/FR-007 exigem extração determinística para a camada nativa,
rodando no worker (nunca no enqueue, §VIII). `unpdf` roda em Deno sem binários
nativos e expõe texto por página, o que alimenta o grounding por página (FR-008).

**Alternativas**: `pdf-parse` (Node-only, depende de `fs` — não ideal em Deno);
serviço externo de parsing (rejeitado: adiciona dependência de rede e custo, e a
extração determinística não precisa de IA). **Validar contra PDFs reais** do corpus
(D31) antes de fixar a lib na fatia.

## R2 — Detecção de escaneado + OCR via LLM multimodal

**Decisão**: após a extração nativa, classificar cada página/documento por
**densidade de texto** (ex.: caracteres por página abaixo de um limiar ⇒ "imagem").
Páginas sem texto útil são **rasterizadas em imagem** e enviadas ao `LLMProvider`
multimodal (Claude) como OCR; o texto resultante é marcado `origin = ocr_ia`. O
limiar concreto é **validado contra o corpus** (D31).

**Rationale**: D31/FR-007 fixam a estratégia híbrida (nativo → determinístico;
escaneado → LLM multimodal). Reusar o `LLMProvider` (não um SDK direto) honra §VII;
marcar `origin` por camada honra §II/FR-008.

**Alternativas**: Tesseract/OCR clássico (rejeitado para a v1: D31 escolhe LLM
multimodal explicitamente; OCR clássico fica como `EmbeddingProvider`-style plugin
futuro). Detecção por flag de "scanned" do PDF (frágil; densidade de texto é mais
robusta).

## R3 — Mecanismo de job para trabalho longo (pipeline, extração, embeddings)

**Decisão**: reutilizar a infraestrutura `job`/`job_item` + worker `pg_cron` do
Marco 1, com **granularidade por-item adequada ao custo**: `job_item` = **um PDF**
para `pdf_text_pipeline`; = **um estudo** para `ai_extraction_batch`; = **um chunk
(ou documento)** para `embedding_batch`. Commit por item ⇒ retomável e resiliente
por-item (FR-006/FR-021/FR-027). Páginas de OCR caras podem ser sub-itens de um PDF.

**Rationale**: §VIII e o contrato `async-jobs.md` do Marco 1 já garantem
enqueue-only + worker por-item + retomabilidade; estender os `type`s evita
reinventar. Manter cada item curto respeita o teto de tempo da Edge Function.

**Alternativas**: fila externa (ex.: QStash/Trigger.dev) — rejeitada para a v1
(adiciona infra fora da stack ratificada; o `pg_cron` + por-item já satisfaz D25).
Reavaliável se PDFs muito grandes excederem o teto de tempo por item.

## R4 — EmbeddingProvider e provedor default

**Decisão**: nova abstração `EmbeddingProvider` em `src/lib/ai/embedding/`, espelhando
o padrão do `LLMProvider`: `identity()` expõe `provider/model/dimension`; `embed()`
gera vetores. Default **Voyage AI** hospedado (`voyage-3` multilingue), **2ª chave
BYOK** distinta da do LLM, decifrada server-side via Vault (FR-026/FR-028). Modelo
local in-process fica plugável **no futuro** (D28).

**Rationale**: §VII exige dois eixos de IA independentes, cada um atrás de sua
abstração e com sua própria chave. Voyage multilingue serve o conteúdo PT/EN/ES
(D24). Reusar o padrão do `LLMProvider` (identity/mock/adapter) dá testabilidade.

**Alternativas**: usar embeddings da Anthropic (não oferece API de embeddings de 1ª
classe equivalente); OpenAI (fora do escopo BYOK definido em D28).

## R5 — pgvector com dimensão variável + índice HNSW

**Decisão**: habilitar a extensão `vector` (pgvector) numa migration nova. Coluna de
embedding `vector` com a **dimensão do provedor default** (Voyage `voyage-3` =
1024); `embedding_chunk` guarda `provider`, `model` e `dim` para acomodar a
**dimensão variável** do schema (D28). Índice **HNSW** (`vector_cosine_ops`) sobre a
dimensão ativa. Busca por similaridade de cosseno, **escopada por `review_id`**
(FR-025) via filtro + RLS.

**Rationale**: D28 fixa pgvector + dimensão variável + HNSW. O índice HNSW exige
dimensão fixa **por índice**; resolvemos guardando a dimensão como metadado e
indexando a dimensão do provedor ativo — trocar de provedor (dimensão diferente) é
uma operação de migração/reindexação, não um caminho quente da v1.

**Alternativas**: `halfvec`/quantização (otimização futura); índice IVFFlat
(rejeitado: HNSW dá melhor recall para o volume-alvo ~500 PDFs). Múltiplas colunas
por dimensão (complexidade desnecessária na v1 com um provedor default).

## R6 — Chunking ancorado a página/posição

**Decisão**: dividir o texto extraído em **chunks por janela de tokens com
sobreposição**, cada chunk carregando **âncora** (`document_id`, `page`,
`char_start`/`char_end`) e a `origin` da camada (`nativo`/`ocr_ia`). A âncora é o
que torna o resultado da busca (US5) e o grounding da extração (US3) verificáveis
(FR-024/FR-012/§II).

**Rationale**: D27/D28 pedem "chunking ancorado" e resultados "ancorados a
página/posição". O mesmo texto extraído alimenta tanto a extração (direta, R8)
quanto os embeddings (R4) — sem acoplar as duas (US3 ⟂ US5, clarificação Q1).

**Alternativas**: chunk por página inteira (perde granularidade de span); por
sentença (overhead de vetores). Janela com overlap é o equilíbrio padrão para RAG.

## R7 — Storage de PDF escopado por Revisão (RLS)

**Decisão**: bucket privado do Supabase Storage com **convenção de path**
`review/<review_id>/record/<record_id>/<document_id>.pdf` e **políticas RLS em
`storage.objects`** que exigem `member(review_id, auth.uid())` — derivando o
`review_id` do primeiro segmento do path. Metadados do arquivo na tabela `document`
(FR-001/FR-002, §IV). Upload assinado/validado no enqueue (FR-003/FR-005).

**Rationale**: §IV exige isolamento por Revisão desde a origem, inclusive no
Storage. Política em `storage.objects` por path é o padrão Supabase; o `document`
espelha o objeto para joins e estado de processamento.

**Alternativas**: bucket por Revisão (limite de número de buckets; gerência pior);
guardar o binário no Postgres (rejeitado: bloat, sem streaming).

## R8 — Contrato de extração com grounding (LLMProvider estendido)

**Decisão**: estender o `LLMProvider` com `extractFields(form, documentText)` que
retorna, **por campo**, um `FactualValue` — `{value, source_span, page}` ou
`{value: null, reason: "not_found"}` — mais um marcador `inferred` para campos sem
âncora direta (FR-012/FR-013/FR-014). A extração lê o **texto do documento
diretamente** (clarificação Q1), com chunking interno (R6) para documentos que
excedem a janela de contexto; **não** consome embeddings. Saída pt-BR, span no
idioma original (FR-015). Método multimodal `ocrPage(image)` para R2.

**Rationale**: reaproveita `FactualValue`/`Provenance`/`SuggestionState` já
definidos no contrato do Marco 1 (`llm-provider.md`); só adiciona métodos. Mantém o
ponto único de chamada (§VII) e o contrato anti-alucinação (§II).

**Alternativas**: extração via RAG (rejeitada na clarificação Q1 — acoplaria US3 a
US5 e inverteria a ordem P1→P2). Tool-calling estruturado é detalhe de
implementação do adapter, atrás do mesmo contrato.

## R9 — Estimativa de custo e contabilidade para lotes de IA

**Decisão**: estender `estimateCost(kind)` para `ai_extraction_batch` e
`embedding_batch` (além do `ai_screening_batch` do Marco 1). O enqueue retorna
`estimated_cost` (FR-022); o worker grava `ai_usage` por item com `phase`
(`extraction`/`embedding`) e `job_id`, alimentando o consumo acumulado por
Revisão/fase (FR-023/SC-006). A 2ª chave (embeddings) tem custo contabilizado
separadamente da 1ª (LLM).

**Rationale**: §VII/P5 e FR-022/FR-023 já têm o padrão no Marco 1 (`ai_usage`,
`job.estimated_cost`); Marco 2 só adiciona `kind`s e `phase`s.

**Alternativas**: estimativa exata pré-execução (impossível sem rodar; a spec já
assume aproximação). Sem estimativa (viola FR-022).

---

## Decisões deixadas à Sessão B (migration/fatia), não bloqueantes

- Lib concreta de extração nativa e limiar de densidade para OCR — **validar contra
  PDFs reais** do corpus (R1/R2, D31), fixados por tarefa explícita.
- Parâmetros de chunking (tamanho de janela, overlap) — afináveis sem mudar o
  schema (R6).
- Parâmetros HNSW (`m`, `ef_construction`) e modelo Voyage exato — afináveis (R5).
- Teto de tamanho/página por arquivo no upload — regra de validação no enqueue (R7).

## Resumo das resoluções

| # | Tema | Decisão |
|---|------|---------|
| R1 | Texto nativo | Extração determinística no worker (`unpdf`/pdf.js), por tarefa explícita |
| R2 | Escaneado/OCR | Detecção por densidade → OCR via `LLMProvider` multimodal (`origin=ocr_ia`) |
| R3 | Jobs | Reutiliza `job`/`job_item` + `pg_cron`; novos `type`s; item por PDF/estudo/chunk |
| R4 | Embeddings | Nova abstração `EmbeddingProvider`; Voyage default; 2ª chave BYOK via Vault |
| R5 | pgvector | Extensão `vector`; dim do provedor (1024) + metadado de dim; índice HNSW cosseno |
| R6 | Chunking | Janela de tokens com overlap; âncora `document/page/offset` + `origin` |
| R7 | Storage | Bucket privado, path por `review_id`, RLS em `storage.objects` + tabela `document` |
| R8 | Extração | `LLMProvider.extractFields` direto sobre o texto; grounding por campo; pt-BR |
| R9 | Custo | `estimateCost` p/ extração/embeddings; `ai_usage` por fase; 2ª chave separada |
