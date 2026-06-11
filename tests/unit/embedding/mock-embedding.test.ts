import { describe, it, expect } from "vitest";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";

describe("MockEmbeddingProvider", () => {
  const p = new MockEmbeddingProvider();

  it("identity expõe provider/model/dimension", () => {
    expect(p.identity()).toEqual({
      provider: "mock",
      model: "mock-embed",
      dimension: 1024,
    });
  });

  it("embed retorna um vetor de length === dimension para cada chunk", async () => {
    const out = await p.embed({
      chunks: [
        {
          document_id: "d1",
          page: 1,
          char_start: 0,
          char_end: 5,
          origin: "nativo",
          content: "alpha",
        },
        {
          document_id: "d1",
          page: 2,
          char_start: 5,
          char_end: 9,
          origin: "nativo",
          content: "beta",
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]!.embedding).toHaveLength(1024);
    expect(out[1]!.embedding).toHaveLength(1024);
    expect(out[0]!.content).toBe("alpha");
  });

  it("é determinístico: o mesmo texto gera o mesmo vetor", async () => {
    const q1 = await p.embedQuery({ query: "amostra de participantes" });
    const q2 = await p.embedQuery({ query: "amostra de participantes" });
    expect(q1).toEqual(q2);
    expect(q1).toHaveLength(1024);
  });

  it("estimateCost cresce com chunkCount", async () => {
    const a = await p.estimateCost({ chunkCount: 10 });
    const b = await p.estimateCost({ chunkCount: 20 });
    expect(b.tokensEstimated).toBeGreaterThan(a.tokensEstimated);
  });
});
