// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderPrismaPng } from "@/lib/prisma/png";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">' +
  '<rect width="100" height="40" fill="#fff"/><text x="10" y="24">n = 5</text></svg>';

describe("renderPrismaPng — rasteriza o SVG (A2, Node)", () => {
  it("retorna bytes PNG (assinatura 0x89 P N G)", async () => {
    const png = await renderPrismaPng(SVG);
    expect(png.length).toBeGreaterThan(8);
    expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
