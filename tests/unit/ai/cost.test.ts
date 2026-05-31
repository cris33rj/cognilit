import { describe, it, expect } from "vitest";
import { estimateScreeningCost } from "@/lib/ai/llm/cost";

describe("estimateScreeningCost", () => {
  it("escala linearmente com o número de itens", () => {
    const a = estimateScreeningCost(100);
    const b = estimateScreeningCost(200);
    expect(b.tokensEstimated).toBe(a.tokensEstimated * 2);
    expect(b.cost.usd!).toBeGreaterThan(a.cost.usd!);
  });

  it("0 itens ⇒ custo zero", () => {
    expect(estimateScreeningCost(0).tokensEstimated).toBe(0);
  });
});
