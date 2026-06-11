# Contract — `EmbeddingProvider` (busca semântica / RAG)

**Feature**: `002-marco2-coracao-ai-first` | Princípio VII (D28), §VIII | FR-024..028, R4/R5/R6.

> **Segundo eixo de IA**, independente do `LLMProvider` (§VII). Nova abstração em
> `src/lib/ai/embedding/`, espelhando o padrão do LLM (`identity` / `mock` /
> `adapter`). Default **Voyage AI** hospedado, **2ª chave BYOK** distinta e cifrada
> via Vault. Vetores em **pgvector** com **dimensão variável** + índice **HNSW**.
> A busca é **escopada por Revisão** (RLS + filtro `review_id`). **Independente da
> extração** (US3 não consome embeddings — clarificação Q1).

## Interface (TypeScript)

```ts
// src/lib/ai/embedding/types.ts
export interface EmbeddingIdentity {
  provider: 'voyage' | string;   // default: voyage (D28)
  model: string;                 // ex.: 'voyage-3'
  dimension: number;             // ex.: 1024 — define a dim do vetor (R5)
}

export interface Chunk {
  document_id: string;
  page: number;
  char_start: number;
  char_end: number;
  origin: 'nativo' | 'ocr_ia';
  content: string;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];           // length === identity().dimension
}

export interface SemanticHit {
  document_id: string;
  record_id: string;             // estudo de origem (FR-024)
  page: number;
  source_span: string;           // trecho ancorado, idioma original
  origin: 'nativo' | 'ocr_ia';
  similarity: number;            // 0..1 (cosseno)
}

export interface EmbeddingProvider {
  identity(): EmbeddingIdentity;

  /** Gera vetores para chunks (R6). Chamado pelo worker do job embedding_batch (§VIII). */
  embed(input: { chunks: Chunk[] }): Promise<EmbeddedChunk[]>;

  /** Embedding de 1 query para busca (FR-024). */
  embedQuery(input: { query: string }): Promise<number[]>;

  /** Estimativa de custo antes do lote (FR-022/R9). */
  estimateCost(input: { chunkCount: number }):
    Promise<{ tokensEstimated: number; cost: Record<string, number> }>;
}
```

## Busca (server-side, sobre pgvector)

```
-- Escopada por Revisão (FR-025) + ordenada por similaridade de cosseno (HNSW).
SELECT document_id, record_id, page, content AS source_span, origin,
       1 - (embedding <=> :query_vec) AS similarity
FROM embedding_chunk
WHERE review_id = :review_id            -- RLS + filtro explícito (SC-008/SC-011)
ORDER BY embedding <=> :query_vec
LIMIT :k;
```

- `<=>` = distância de cosseno (pgvector); índice **HNSW** `vector_cosine_ops`.
- O `record_id` é derivado via `document.record_id` (join), ancorando o trecho ao
  **estudo** (FR-024).

## Invariantes do contrato

- **2ª chave BYOK** (`byok_key.purpose='embedding'`), cifrada via Vault, **distinta**
  da chave do LLM (FR-028); decifrada só server-side.
- Dimensão do vetor = `identity().dimension`; `embedding_chunk` guarda `provider`,
  `model`, `dim` para acomodar **dimensão variável** (D28/FR-026). Trocar de provedor
  com dimensão diferente é operação de reindexação, não caminho quente da v1.
- `embed`/`embedding_batch` rodam **no worker** (§VIII), retomáveis e resilientes
  por-item (FR-027). `embedQuery` (1 query) pode rodar num endpoint server-side leve.
- Busca **sempre** com `review_id` no filtro além da RLS (FR-025) — zero vazamento
  entre Revisões (SC-008/SC-011).
- Sem 2ª chave ⇒ busca semântica sinalizada **indisponível**; o restante do produto
  segue operável (FR-028, edge case).
- **Independência de US3**: a extração não chama `EmbeddingProvider` (Q1). US5 é
  fatia separável; sua ausência não bloqueia US1–US4.

## Testes mínimos (TDD)

- `embed` retorna vetores de length === `dimension` para 100% dos chunks.
- Busca de usuário A nunca retorna chunk de Revisão de B (isolamento, SC-011).
- Resultado tem `page` e `source_span` ancorados (FR-024) — nunca trecho sem âncora.
- Sem 2ª chave ⇒ erro tratado "indisponível", produto não trava (FR-028).
- Mock provider determinístico (vetores fixos) cobre busca sem rede.
- `embedding_batch`: falha em 1 chunk ⇒ job `completed_with_errors`, demais `done`.
