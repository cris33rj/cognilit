import { describe, it, expect } from "vitest";
import {
  SCREENING_PERF_BUDGET,
  DENSITIES,
  SHORTCUTS,
} from "@/lib/screening/config";

describe("screening config (A2 / FR-028/040)", () => {
  it("orçamento A2 fixa render<100ms, nav<50ms, inicial<1000ms", () => {
    expect(SCREENING_PERF_BUDGET.decisionToRenderMs).toBe(100);
    expect(SCREENING_PERF_BUDGET.keyNavMs).toBe(50);
    expect(SCREENING_PERF_BUDGET.initialRenderMs).toBe(1000);
  });
  it("densidades incluem compacto e confortável (FR-040)", () => {
    expect(DENSITIES.map((d) => d.key)).toEqual(["compact", "comfortable"]);
  });
  it("atalhos cobrem incluir/excluir/dúvida/desfazer/navegar (FR-023/028)", () => {
    const acts = SHORTCUTS.map((s) => s.action);
    for (const a of ["include", "exclude", "maybe", "undo", "next", "prev"]) {
      expect(acts).toContain(a);
    }
  });
});
