import { describe, it, expect, vi, afterEach } from "vitest";
import { VoyageProvider } from "@/lib/ai/embedding/voyage";

afterEach(() => vi.restoreAllMocks());

function mockFetchOnce(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

describe("VoyageProvider", () => {
  it("identity expõe voyage-3 / 1024", () => {
    const p = new VoyageProvider("key");
    expect(p.identity()).toEqual({
      provider: "voyage",
      model: "voyage-3",
      dimension: 1024,
    });
  });

  it("embed chama a API com input_type='document' e devolve vetores na ordem", async () => {
    const spy = mockFetchOnce({
      data: [
        { index: 0, embedding: new Array(1024).fill(0.1) },
        { index: 1, embedding: new Array(1024).fill(0.2) },
      ],
      usage: { total_tokens: 10 },
    });
    const p = new VoyageProvider("secret-key");
    const out = await p.embed({
      chunks: [
        {
          document_id: "d",
          page: 1,
          char_start: 0,
          char_end: 1,
          origin: "nativo",
          content: "a",
        },
        {
          document_id: "d",
          page: 1,
          char_start: 1,
          char_end: 2,
          origin: "nativo",
          content: "b",
        },
      ],
    });
    expect(out[0].embedding).toHaveLength(1024);
    expect(out[1].embedding[0]).toBeCloseTo(0.2);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe("voyage-3");
    expect(sent.input_type).toBe("document");
    expect(sent.input).toEqual(["a", "b"]);
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret-key",
    });
  });

  it("embedQuery usa input_type='query' e devolve 1 vetor", async () => {
    mockFetchOnce({
      data: [{ index: 0, embedding: new Array(1024).fill(0.3) }],
      usage: {},
    });
    const p = new VoyageProvider("k");
    const v = await p.embedQuery({ query: "consulta" });
    expect(v).toHaveLength(1024);
  });

  it("erro da API vira exceção tratável", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as Response);
    const p = new VoyageProvider("bad");
    await expect(
      p.embed({
        chunks: [
          {
            document_id: "d",
            page: 1,
            char_start: 0,
            char_end: 1,
            origin: "nativo",
            content: "a",
          },
        ],
      }),
    ).rejects.toThrow();
  });
});
