import { describe, it, expect } from "vitest";
import { summarizeUsageByPhase } from "@/lib/shell/usage";

describe("summarizeUsageByPhase (FR-023)", () => {
  it("agrupa tokens e conta chamadas por fase, ordenado por fase", () => {
    const rows = [
      { phase: "screening", tokens_in: 10, tokens_out: 5 },
      { phase: "extraction", tokens_in: 0, tokens_out: 0 },
      { phase: "extraction", tokens_in: 0, tokens_out: 0 },
      { phase: "screening", tokens_in: 3, tokens_out: null },
    ];
    const out = summarizeUsageByPhase(rows);
    expect(out).toEqual([
      { phase: "extraction", tokensIn: 0, tokensOut: 0, calls: 2 },
      { phase: "screening", tokensIn: 13, tokensOut: 5, calls: 2 },
    ]);
  });

  it("retorna [] para entrada vazia", () => {
    expect(summarizeUsageByPhase([])).toEqual([]);
  });
});
