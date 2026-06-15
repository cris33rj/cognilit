// @vitest-environment node
// (AnthropicProvider instancia o SDK Anthropic, que recusa ambiente "browser"
//  como o jsdom; este arquivo é lógica pura e não precisa de DOM.)
import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { AnthropicProvider } from "@/lib/ai/llm/anthropic";

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

describe("draftReportSection (contrato §VII)", () => {
  const provider = new MockLLMProvider();

  it("rascunha Discussão com provenance completa e pt-BR", async () => {
    const r = await provider.draftReportSection({
      kind: "discussion",
      context: {
        methods: "## Métodos\n...",
        results: "## Resultados\n...",
        themes: [{ name: "Tema A", narrative: "Narrativa do tema A" }],
      },
      language: "pt-BR",
    });
    expect(r.content.length).toBeGreaterThan(0);
    expect(r.provenance.model).toBeTruthy();
    expect(r.provenance.version).toBeTruthy();
    expect(r.provenance.prompt_or_span).toBeTruthy();
    expect(r.provenance.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("estimateCost aceita report_draft", async () => {
    const e = await provider.estimateCost({
      kind: "report_draft",
      itemCount: 2,
    });
    expect(e.tokensEstimated).toBeGreaterThan(0);
    expect(typeof e.cost).toBe("object");
  });
});

describe("AnthropicProvider.synthesizeThemes — mapeamento de findingRefs", () => {
  const findings = [
    {
      extractionValueId: "ev-1",
      recordId: "r1",
      fieldName: "Desfecho",
      value: "x",
    },
    {
      extractionValueId: "ev-2",
      recordId: "r2",
      fieldName: "Desfecho",
      value: "y",
    },
  ];

  // Constrói um provider com o cliente Anthropic substituído por um stub que
  // devolve um texto fixo — exercita só o parse/mapeamento, sem rede.
  function providerReturning(jsonText: string) {
    const p = new AnthropicProvider("test-key");
    (
      p as unknown as {
        client: { messages: { create: () => Promise<unknown> } };
      }
    ).client = {
      messages: {
        create: async () => ({ content: [{ type: "text", text: jsonText }] }),
      },
    };
    return p;
  }

  it("mapeia findingRefs inteiros (índices 1..N) de volta aos extractionValueId", async () => {
    const p = providerReturning(
      '{"themes":[{"name":"T","narrative":"n","findingRefs":[1,2]}]}',
    );
    const res = await p.synthesizeThemes({ findings, language: "pt-BR" });
    if ("insufficientData" in res) throw new Error("esperava temas");
    expect(res.themes[0]!.findingRefs).toEqual(["ev-1", "ev-2"]);
  });

  it("descarta tema cujos refs não resolvem ⇒ insufficientData (§II/FR-007)", async () => {
    const p = providerReturning(
      '{"themes":[{"name":"T","narrative":"n","findingRefs":[99]}]}',
    );
    const res = await p.synthesizeThemes({ findings, language: "pt-BR" });
    expect("insufficientData" in res && res.insufficientData).toBe(true);
  });

  it("também aceita UUID verbatim como ref (defensivo)", async () => {
    const p = providerReturning(
      '{"themes":[{"name":"T","narrative":"n","findingRefs":["ev-2"]}]}',
    );
    const res = await p.synthesizeThemes({ findings, language: "pt-BR" });
    if ("insufficientData" in res) throw new Error("esperava temas");
    expect(res.themes[0]!.findingRefs).toEqual(["ev-2"]);
  });
});
