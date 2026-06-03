import { describe, it, expect } from "vitest";
import { computePhaseStates, type PhaseInput } from "@/lib/shell/phases";

const base: PhaseInput = {
  hasQuestion: false,
  protocolStatus: "none",
  identified: 0,
  duplicates: 0,
  screenedTs: 0,
  includedTs: 0,
  includedFt: 0,
  excludedFt: 0,
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
});
