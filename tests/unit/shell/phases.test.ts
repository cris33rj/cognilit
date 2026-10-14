import { describe, it, expect } from "vitest";
import { computePhaseStates, type PhaseInput } from "@/lib/shell/phases";

const base: PhaseInput = {
  hasQuestion: false,
  protocolStatus: "none",
  identified: 0,
  duplicates: 0,
  screenedTs: 0,
  includedTs: 0,
  passedTs: 0,
  includedFt: 0,
  excludedFt: 0,
  extractionRatified: false,
  synthesisReady: false,
  reportReady: false,
};
const by = (phases: ReturnType<typeof computePhaseStates>) =>
  Object.fromEntries(phases.map((p) => [p.key, p.status]));

describe("computePhaseStates — trilho de fases (US7)", () => {
  it("Revisão vazia: pergunta é a fase atual, resto pendente", () => {
    const s = by(computePhaseStates("rev1", base));
    expect(s.question).toBe("current");
    expect(s.protocol).toBe("pending");
    expect(s.import).toBe("pending");
  });

  it("protocolo travado aparece como 'locked' (distinto de 'done')", () => {
    const s = by(
      computePhaseStates("rev1", {
        ...base,
        hasQuestion: true,
        protocolStatus: "locked",
      }),
    );
    expect(s.question).toBe("done");
    expect(s.protocol).toBe("locked");
  });

  it("Viés e Certeza são sempre opcionais-desligadas e não bloqueiam (D19)", () => {
    const s = by(computePhaseStates("rev1", base));
    expect(s.risk_of_bias).toBe("optional_off");
    expect(s.certainty).toBe("optional_off");
  });

  it("com corpus importado e nada triado, triagem T/R é a fase atual", () => {
    const s = by(
      computePhaseStates("rev1", {
        ...base,
        hasQuestion: true,
        protocolStatus: "locked",
        identified: 10,
        duplicates: 2,
      }),
    );
    expect(s.import).toBe("done");
    expect(s.screening_ts).toBe("current");
  });

  it("Triagem TC fica 'done' quando todos que passaram no T/R têm decisão (includedTs===0)", () => {
    // Cenário do bug: 15 passaram no T/R e TODOS avançaram (13 incluídos + 2
    // excluídos no TC) ⇒ includedts (inventário) cai a 0. A conclusão deve usar
    // passedTs (cumulativo), senão a fase nunca fecha.
    const s = by(
      computePhaseStates("rev1", {
        ...base,
        hasQuestion: true,
        protocolStatus: "locked",
        identified: 20,
        duplicates: 2,
        screenedTs: 18,
        passedTs: 15,
        includedTs: 0,
        includedFt: 13,
        excludedFt: 2,
      }),
    );
    expect(s.screening_ts).toBe("done");
    expect(s.screening_ft).toBe("done");
  });

  it("Triagem TC fica 'current' enquanto há registros que passaram sem decisão de TC", () => {
    const s = by(
      computePhaseStates("rev1", {
        ...base,
        hasQuestion: true,
        protocolStatus: "locked",
        identified: 20,
        duplicates: 2,
        screenedTs: 18,
        passedTs: 15,
        includedTs: 5,
        includedFt: 8,
        excludedFt: 2,
      }),
    );
    expect(s.screening_ft).toBe("current");
  });

  it("hrefs apontam para as rotas reais da Revisão", () => {
    const phases = computePhaseStates("rev-xyz", {
      ...base,
      hasQuestion: true,
    });
    expect(phases.find((p) => p.key === "question")!.href).toBe(
      "/reviews/rev-xyz/question",
    );
    expect(phases.find((p) => p.key === "screening_ts")!.href).toBe(
      "/reviews/rev-xyz/workbench?mode=title_abstract",
    );
  });

  describe("Síntese — fase pós-extração (US1)", () => {
    it("fase 'synthesis' existe no trilho", () => {
      const phases = computePhaseStates("rev1", base);
      expect(phases.find((p) => p.key === "synthesis")).toBeDefined();
    });

    it("href de synthesis aponta para /reviews/:id/synthesis", () => {
      const phases = computePhaseStates("rev-abc", base);
      expect(phases.find((p) => p.key === "synthesis")!.href).toBe(
        "/reviews/rev-abc/synthesis",
      );
    });

    it("synthesis fica 'locked' enquanto extração não está ratificada", () => {
      const s = by(
        computePhaseStates("rev1", {
          ...base,
          extractionRatified: false,
          synthesisReady: false,
        }),
      );
      expect(s.synthesis).toBe("locked");
    });

    it("synthesis fica disponível (não-locked) quando extractionRatified=true e síntese pendente", () => {
      const s = by(
        computePhaseStates("rev1", {
          ...base,
          hasQuestion: true,
          protocolStatus: "locked",
          identified: 20,
          duplicates: 2,
          screenedTs: 18,
          passedTs: 15,
          includedTs: 0,
          includedFt: 13,
          excludedFt: 2,
          extractionRatified: true,
          synthesisReady: false,
        }),
      );
      expect(s.synthesis).not.toBe("locked");
    });

    it("synthesis fica 'done' quando synthesisReady=true", () => {
      const s = by(
        computePhaseStates("rev1", {
          ...base,
          hasQuestion: true,
          protocolStatus: "locked",
          identified: 20,
          duplicates: 2,
          screenedTs: 18,
          passedTs: 15,
          includedTs: 0,
          includedFt: 13,
          excludedFt: 2,
          extractionRatified: true,
          synthesisReady: true,
        }),
      );
      expect(s.synthesis).toBe("done");
    });

    it("synthesis vem depois de extraction no trilho", () => {
      const phases = computePhaseStates("rev1", base);
      const extractionIdx = phases.findIndex((p) => p.key === "extraction");
      const synthesisIdx = phases.findIndex((p) => p.key === "synthesis");
      expect(synthesisIdx).toBeGreaterThan(extractionIdx);
    });
  });

  describe("fase report no trilho", () => {
    it("aparece após Síntese e fica locked até a síntese concluir", () => {
      const phases = computePhaseStates("rev1", {
        ...base,
        synthesisReady: false,
      });
      const report = phases.find((p) => p.key === "report")!;
      expect(report).toBeDefined();
      expect(report.status).toBe("locked");
    });

    it("conclui quando reportReady=true", () => {
      const phases = computePhaseStates("rev1", {
        ...base,
        extractionRatified: true,
        synthesisReady: true,
        reportReady: true,
      });
      const report = phases.find((p) => p.key === "report")!;
      expect(report.status).toBe("done");
    });

    it("report vem depois de synthesis no trilho", () => {
      const phases = computePhaseStates("rev1", base);
      const synthesisIdx = phases.findIndex((p) => p.key === "synthesis");
      const reportIdx = phases.findIndex((p) => p.key === "report");
      expect(reportIdx).toBeGreaterThan(synthesisIdx);
    });

    it("href de report aponta para /reviews/:id/report", () => {
      const phases = computePhaseStates("rev-abc", base);
      expect(phases.find((p) => p.key === "report")!.href).toBe(
        "/reviews/rev-abc/report",
      );
    });
  });
});
