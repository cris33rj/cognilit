import type {
  Chunk,
  EmbeddedChunk,
  EmbeddingCostEstimate,
  EmbeddingIdentity,
  EmbeddingProvider,
} from "./types";

const MODEL = "voyage-3"; // default D28/R4 (multilingue)
const DIMENSION = 1024; // R5
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data: { index: number; embedding: number[] }[];
  usage?: { total_tokens?: number };
}

export class VoyageProvider implements EmbeddingProvider {
  constructor(private apiKey: string) {}

  identity(): EmbeddingIdentity {
    return { provider: "voyage", model: MODEL, dimension: DIMENSION };
  }

  private async call(
    inputs: string[],
    inputType: "document" | "query",
  ): Promise<number[][]> {
    if (inputs.length === 0) return [];
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: inputs,
        input_type: inputType,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Voyage API ${res.status}: ${detail}`);
    }
    const json = (await res.json()) as VoyageResponse;
    return [...json.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  async embed(input: { chunks: Chunk[] }): Promise<EmbeddedChunk[]> {
    const vectors = await this.call(
      input.chunks.map((c) => c.content),
      "document",
    );
    return input.chunks.map((c, i) => ({ ...c, embedding: vectors[i] }));
  }

  async embedQuery(input: { query: string }): Promise<number[]> {
    const [v] = await this.call([input.query], "query");
    return v;
  }

  async estimateCost(input: {
    chunkCount: number;
  }): Promise<EmbeddingCostEstimate> {
    const tokensEstimated = input.chunkCount * 512; // ~512 tokens/chunk (R6)
    return {
      tokensEstimated,
      cost: { usd: (tokensEstimated / 1000) * 0.00012 },
    };
  }
}
