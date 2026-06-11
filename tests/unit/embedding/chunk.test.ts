import { describe, it, expect } from "vitest";
import { chunkLayers } from "@/lib/embedding/chunk";

const layer = (
  page: number,
  content: string,
  origin: "nativo" | "ocr_ia" = "nativo",
) => ({
  document_id: "d1",
  page,
  char_start: 0,
  char_end: content.length,
  content,
  origin,
});

describe("chunkLayers (R6 — ancorado a página/posição)", () => {
  it("uma camada curta vira um único chunk com âncora da página", () => {
    const chunks = chunkLayers([layer(1, "Amostra de 42 participantes.")], {
      maxChars: 100,
      overlapChars: 10,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      document_id: "d1",
      page: 1,
      origin: "nativo",
      content: "Amostra de 42 participantes.",
      char_start: 0,
    });
  });

  it("camada longa é dividida em janelas com overlap, preservando a página", () => {
    const text = "a".repeat(250);
    const chunks = chunkLayers([layer(3, text)], {
      maxChars: 100,
      overlapChars: 20,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.page === 3)).toBe(true);
    expect(chunks.every((c) => c.content.length <= 100)).toBe(true);
    expect(chunks[1]!.char_start).toBeLessThan(chunks[0]!.char_end);
  });

  it("cada página gera chunks independentes e herda a origin", () => {
    const chunks = chunkLayers(
      [layer(1, "pagina um"), layer(2, "pagina dois", "ocr_ia")],
      { maxChars: 100, overlapChars: 10 },
    );
    const pages = chunks.map((c) => c.page).sort();
    expect(pages).toEqual([1, 2]);
    expect(chunks.find((c) => c.page === 2)!.origin).toBe("ocr_ia");
  });

  it("ignora camadas vazias", () => {
    expect(
      chunkLayers([layer(1, "   ")], { maxChars: 100, overlapChars: 10 }),
    ).toEqual([]);
  });
});
