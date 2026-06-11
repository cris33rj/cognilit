import { describe, it, expect } from "vitest";
import { estimateExtractionCost } from "@/lib/ai/llm/cost";

describe("estimateExtractionCost", () => {
  it("escala com itens e campos", () => {
    const a = estimateExtractionCost(2, 3);
    expect(a.tokensEstimated).toBeGreaterThan(0);
    expect(a.cost.usd).toBeGreaterThan(0);
    const b = estimateExtractionCost(4, 3);
    expect(b.tokensEstimated).toBe(a.tokensEstimated * 2);
  });
  it("zero itens ⇒ zero", () => {
    expect(estimateExtractionCost(0, 5).tokensEstimated).toBe(0);
  });
});
