import { describe, it, expect } from "vitest";
import { computePhaseStates } from "@/lib/shell/phases";

const base = {
  hasQuestion: true,
  protocolStatus: "locked" as const,
  identified: 10,
  duplicates: 0,
  screenedTs: 10,
  includedTs: 0,
  passedTs: 5,
  includedFt: 5,
  excludedFt: 0,
  synthesisReady: false,
  reportReady: false,
};

describe("fase Extração no trilho (§7-C)", () => {
  it("aparece após Triagem TC e é 'current' quando a triagem fechou e não há valor ratificado", () => {
    const phases = computePhaseStates("r1", {
      ...base,
      extractionRatified: false,
    });
    const ext = phases.find((p) => p.key === "extraction")!;
    expect(ext).toBeTruthy();
    expect(ext.href).toBe("/reviews/r1/extraction");
    expect(ext.status).toBe("current");
  });

  it("fica 'done' quando há ao menos um valor ratificado", () => {
    const phases = computePhaseStates("r1", {
      ...base,
      extractionRatified: true,
    });
    expect(phases.find((p) => p.key === "extraction")!.status).toBe("done");
  });

  it("não quebra a derivação T/R (screening_ft segue 'done')", () => {
    const phases = computePhaseStates("r1", {
      ...base,
      extractionRatified: false,
    });
    expect(phases.find((p) => p.key === "screening_ft")!.status).toBe("done");
  });
});
