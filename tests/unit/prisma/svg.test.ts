import { describe, it, expect } from "vitest";
import { renderPrismaSvg } from "@/lib/prisma/svg";
import type { PrismaFlowModel } from "@/lib/prisma/flow-model";

const model: PrismaFlowModel = {
  identified: 20,
  duplicatesRemoved: 5,
  screened: 15,
  excludedScreening: 6,
  assessedFullText: 9,
  excludedFullText: [{ reason: "Fora do escopo", n: 3 }],
  included: 5,
  partial: false,
};

describe("renderPrismaSvg — espelho read-only", () => {
  it("é um SVG bem-formado com viewBox", () => {
    const svg = renderPrismaSvg(model);
    expect(svg).toMatch(/^<svg[^>]+viewBox=/);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  it("contém os números de cada caixa", () => {
    const svg = renderPrismaSvg(model);
    for (const n of ["20", "5", "15", "6", "9", "5"]) {
      expect(svg).toContain(`n = ${n}`);
    }
    expect(svg).toContain("Fora do escopo");
    expect(svg).toContain("3");
  });

  it("é read-only: sem campos editáveis", () => {
    const svg = renderPrismaSvg(model);
    expect(svg).not.toContain("<input");
    expect(svg).not.toContain("<textarea");
    expect(svg).not.toContain("contenteditable");
    expect(svg).not.toContain("<foreignObject");
  });

  it("não renderiza caixas de fontes externas (FR-011a)", () => {
    const svg = renderPrismaSvg(model);
    expect(svg).not.toMatch(/cinzenta|citation searching|contato com autores/i);
  });

  it("marca 'parcial' quando partial=true", () => {
    expect(renderPrismaSvg({ ...model, partial: true })).toMatch(/parci/i);
    expect(renderPrismaSvg(model)).not.toMatch(/parci/i);
  });

  it("é determinístico", () => {
    expect(renderPrismaSvg(model)).toBe(renderPrismaSvg(model));
  });
});
