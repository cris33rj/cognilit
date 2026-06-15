// @vitest-environment node
import { describe, it, expect } from "vitest";
import { deriveChecklist } from "@/lib/prisma/checklist";
import { PRISMA_2020_ITEMS } from "@/lib/prisma/checklist-items";
import type { ChecklistCoverageInputs } from "@/lib/prisma/checklist";

const fullInputs: ChecklistCoverageInputs = {
  sections: {
    methods: true,
    results: true,
    discussion: true,
    conclusion: true,
    ai_declaration: true,
    deviations: true,
  },
  hasCounters: true,
  hasCharacteristics: true,
  optionalPhasesOff: { risk_of_bias: true, certainty: true },
};

describe("deriveChecklist", () => {
  it("retorna exatamente os 27 itens, na ordem do seed", () => {
    const out = deriveChecklist(PRISMA_2020_ITEMS, fullInputs);
    expect(out).toHaveLength(27);
    expect(out.map((i) => i.itemCode)).toEqual(
      PRISMA_2020_ITEMS.map((i) => i.itemCode),
    );
  });

  it("marca itens de fases desligadas (Viés/Certeza) como not_applicable", () => {
    const out = deriveChecklist(PRISMA_2020_ITEMS, fullInputs);
    for (const code of ["11", "14", "15", "18", "21", "22"]) {
      expect(out.find((i) => i.itemCode === code)?.status).toBe(
        "not_applicable",
      );
    }
  });

  it("marca itens não gerados pelo sistema como pending (US4.3)", () => {
    const out = deriveChecklist(PRISMA_2020_ITEMS, fullInputs);
    for (const code of ["1", "2", "3", "12", "25", "26", "27"]) {
      expect(out.find((i) => i.itemCode === code)?.status).toBe("pending");
    }
  });

  it("met quando a seção existe; pending quando vazia (item 23 = Discussão)", () => {
    const met = deriveChecklist(PRISMA_2020_ITEMS, fullInputs).find(
      (i) => i.itemCode === "23",
    );
    expect(met?.status).toBe("met");
    expect(met?.sectionRef).toBe("Discussão");
    const noDisc = deriveChecklist(PRISMA_2020_ITEMS, {
      ...fullInputs,
      sections: { ...fullInputs.sections, discussion: false },
    }).find((i) => i.itemCode === "23");
    expect(noDisc?.status).toBe("pending");
  });

  it("characteristics/study_selection met conforme dados presentes (itens 10, 8)", () => {
    const out = deriveChecklist(PRISMA_2020_ITEMS, {
      ...fullInputs,
      hasCharacteristics: false,
      hasCounters: false,
    });
    expect(out.find((i) => i.itemCode === "10")?.status).toBe("pending");
    expect(out.find((i) => i.itemCode === "8")?.status).toBe("pending");
  });
});
