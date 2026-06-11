import type {
  Chunk,
  EmbeddedChunk,
  EmbeddingCostEstimate,
  EmbeddingIdentity,
  EmbeddingProvider,
} from "./types";

const DIM = 1024;

/** Vetor determinístico a partir do texto: hash dos char codes espalhado em DIM
 *  posições, depois normalizado (norma L2 = 1) para cosseno estável. Sem rede. */
function deterministicVector(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    v[(code + i) % DIM] += ((code % 17) + 1) / 17;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Provider determinístico para testes e modo sem-chave em dev. */
export class MockEmbeddingProvider implements EmbeddingProvider {
  identity(): EmbeddingIdentity {
    return { provider: "mock", model: "mock-embed", dimension: DIM };
  }

  async embed(input: { chunks: Chunk[] }): Promise<EmbeddedChunk[]> {
    return input.chunks.map((c) => ({
      ...c,
      embedding: deterministicVector(c.content),
    }));
  }

  async embedQuery(input: { query: string }): Promise<number[]> {
    return deterministicVector(input.query);
  }

  async estimateCost(input: {
    chunkCount: number;
  }): Promise<EmbeddingCostEstimate> {
    const tokensEstimated = input.chunkCount * 512;
    return {
      tokensEstimated,
      cost: { usd: (tokensEstimated / 1000) * 0.00012 },
    };
  }
}
