import { describe, it, expect } from "vitest";
import { toFlowModel } from "@/lib/prisma/flow-model";
import type { PrismaCounters, ExclusionCount } from "@/lib/prisma/queries";

const counters = (over: Partial<PrismaCounters> = {}): PrismaCounters => ({
  identified: 0,
  duplicates: 0,
  screened: 0,
  includedTs: 0,
  excludedTs: 0,
  maybeTs: 0,
  passedTs: 0,
  includedFt: 0,
  excludedFt: 0,
  ...over,
});

describe("toFlowModel — espelho das views (SC-002, §VI)", () => {
  it("mapeia cada caixa a partir dos campos da view", () => {
    const breakdown: ExclusionCount[] = [
      { reasonId: "r1", reasonLabel: "Fora do escopo", n: 3 },
      { reasonId: "r2", reasonLabel: "Idioma", n: 1 },
    ];
    const m = toFlowModel(
      counters({
        identified: 20,
        duplicates: 5,
        excludedTs: 6,
        passedTs: 9,
        includedFt: 5,
        excludedFt: 4,
        screened: 15,
      }),
      breakdown,
    );
    expect(m.identified).toBe(20);
    expect(m.duplicatesRemoved).toBe(5);
    expect(m.screened).toBe(15); // identified - duplicates
    expect(m.excludedScreening).toBe(6);
    expect(m.assessedFullText).toBe(9);
    expect(m.excludedFullText).toEqual([
      { reason: "Fora do escopo", n: 3 },
      { reason: "Idioma", n: 1 },
    ]);
    expect(m.included).toBe(5);
  });

  it("partial=false quando T/R e TC fecharam", () => {
    // entrou na triagem = 18; todos com decisão terminal (screened>=18); TC: passed=10, incl+excl=10
    const m = toFlowModel(
      counters({
        identified: 20,
        duplicates: 2,
        screened: 18,
        excludedTs: 8,
        passedTs: 10,
        includedFt: 7,
        excludedFt: 3,
      }),
      [],
    );
    expect(m.partial).toBe(false);
  });

  it("partial=true quando ainda há registros sem decisão de T/R", () => {
    const m = toFlowModel(
      counters({ identified: 20, duplicates: 2, screened: 5, passedTs: 0 }),
      [],
    );
    expect(m.partial).toBe(true);
  });

  it("partial=true quando o texto completo não fechou", () => {
    const m = toFlowModel(
      counters({
        identified: 10,
        duplicates: 0,
        screened: 10,
        excludedTs: 4,
        passedTs: 6,
        includedFt: 2,
        excludedFt: 1,
      }), // 2+1 < 6
      [],
    );
    expect(m.partial).toBe(true);
  });

  it("Revisão vazia: tudo zero e não-parcial", () => {
    const m = toFlowModel(counters(), []);
    expect(m.identified).toBe(0);
    expect(m.included).toBe(0);
    expect(m.partial).toBe(false);
    expect(m.excludedFullText).toEqual([]);
  });
});
