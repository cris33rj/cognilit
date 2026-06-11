export interface EmbeddingIdentity {
  provider: "voyage" | string; // default: voyage (D28)
  model: string; // ex.: 'voyage-3'
  dimension: number; // ex.: 1024 — define a dim do vetor (R5)
}

export interface Chunk {
  document_id: string;
  page: number;
  char_start: number;
  char_end: number;
  origin: "nativo" | "ocr_ia";
  content: string;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[]; // length === identity().dimension
}

export interface SemanticHit {
  document_id: string;
  record_id: string; // estudo de origem (FR-024)
  page: number;
  source_span: string; // trecho ancorado, idioma original
  origin: "nativo" | "ocr_ia";
  similarity: number; // 0..1 (cosseno)
}

export interface EmbeddingCostEstimate {
  tokensEstimated: number;
  cost: Record<string, number>;
}

export interface EmbeddingProvider {
  identity(): EmbeddingIdentity;
  /** Gera vetores para chunks (R6). Chamado pelo worker do job embedding_batch (§VIII). */
  embed(input: { chunks: Chunk[] }): Promise<EmbeddedChunk[]>;
  /** Embedding de 1 query para busca (FR-024). */
  embedQuery(input: { query: string }): Promise<number[]>;
  /** Estimativa de custo antes do lote (FR-022/R9). */
  estimateCost(input: { chunkCount: number }): Promise<EmbeddingCostEstimate>;
}

/** Lançado quando a 2ª chave BYOK (embedding) não está cadastrada (FR-028). */
export class MissingEmbeddingKeyError extends Error {
  constructor(reviewId: string) {
    super(`Nenhuma chave de embeddings cadastrada para a Revisão ${reviewId}`);
    this.name = "MissingEmbeddingKeyError";
  }
}
