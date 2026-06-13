import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "@/lib/ai/llm/mock";

const provider = new MockLLMProvider();

describe("LLMProvider — invariantes do contrato (§II/FR-031, §I)", () => {
  it("deriveEligibility retorna provenance completa e state=pending", async () => {
    const s = await provider.deriveEligibility({
      framework: "spider",
      questionText: "Qual o impacto de X em Y?",
      fields: {},
    });
    expect(s.provenance.model).toBeTruthy();
    expect(s.provenance.version).toBeTruthy();
    expect(s.provenance.prompt_or_span).toBeTruthy();
    expect(s.provenance.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(s.state).toBe("pending");
    expect(Array.isArray(s.output.inclusion)).toBe(true);
  });

  it("draftProtocol retorna provenance e markdown em pt-BR", async () => {
    const s = await provider.draftProtocol({
      questionText: "Pergunta",
      criteria: ["incluir A"],
    });
    expect(s.provenance.model).toBeTruthy();
    expect(s.state).toBe("pending");
    expect(s.output.contentMarkdown.length).toBeGreaterThan(0);
  });

  it("preclassifyScreening nunca omite provenance e nunca decide", async () => {
    const s = await provider.preclassifyScreening({
      title: "T",
      abstract: null,
      criteria: [],
    });
    expect(s.provenance.model).toBeTruthy();
    expect(["include", "exclude"]).toContain(s.output.recommendation);
    expect(s.output.confidence).toBeGreaterThanOrEqual(0);
    expect(s.output.confidence).toBeLessThanOrEqual(1);
  });

  it("not_found é resultado de 1ª classe quando a pergunta é vazia (FR-034)", async () => {
    const s = await provider.deriveEligibility({
      framework: "spider",
      questionText: "",
      fields: {},
    });
    expect(s.not_found).toBe(true);
  });
});

describe("synthesizeThemes (contrato)", () => {
  const provider = new MockLLMProvider();

  it("retorna insufficientData quando não há achados (FR-007)", async () => {
    const res = await provider.synthesizeThemes({
      findings: [],
      language: "pt-BR",
    });
    expect("insufficientData" in res && res.insufficientData).toBe(true);
  });

  it("nunca retorna tema sem findingRefs (§II)", async () => {
    const res = await provider.synthesizeThemes({
      findings: [
        {
          extractionValueId: "ev1",
          recordId: "r1",
          fieldName: "Desfecho",
          value: "x",
        },
        {
          extractionValueId: "ev2",
          recordId: "r2",
          fieldName: "Desfecho",
          value: "y",
        },
      ],
      language: "pt-BR",
    });
    if ("insufficientData" in res) throw new Error("esperava temas");
    expect(res.themes.length).toBeGreaterThan(0);
    for (const t of res.themes) {
      expect(t.findingRefs.length).toBeGreaterThan(0);
      expect(t.provenance.model).toBeTruthy();
      expect(t.narrative).toBeTruthy();
    }
  });

  it("estimateCost aceita o kind synthesis_batch", async () => {
    const est = await provider.estimateCost({
      kind: "synthesis_batch",
      itemCount: 5,
    });
    // 5 estudos × 1200 tokens/estudo (TOKENS_PER_STUDY_SYNTHESIS heuristic in cost.ts)
    expect(est.tokensEstimated).toBe(5 * 1200);
  });
});
