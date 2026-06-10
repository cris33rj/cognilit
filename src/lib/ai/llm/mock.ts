import type {
  CostEstimate,
  EligibilityDerivation,
  LLMProvider,
  LlmSuggestion,
  OcrResult,
  ProtocolDraft,
  ProviderIdentity,
  ScreeningPreclassification,
} from "./types";

function provenance(prompt: string) {
  return {
    model: "mock-llm",
    version: "0.0.0",
    prompt_or_span: prompt,
    timestamp: new Date().toISOString(),
  };
}

function suggestion<T>(
  output: T,
  prompt: string,
  notFound = false,
): LlmSuggestion<T> {
  return {
    output,
    provenance: provenance(prompt),
    state: "pending",
    not_found: notFound,
  };
}

/** Provider determinístico para testes e modo sem-chave em dev. Saída pt-BR. */
export class MockLLMProvider implements LLMProvider {
  identity(): ProviderIdentity {
    return { provider: "anthropic", model: "mock-llm", version: "0.0.0" };
  }

  async deriveEligibility(input: {
    framework: string;
    questionText: string;
    fields: Record<string, unknown>;
  }): Promise<LlmSuggestion<EligibilityDerivation>> {
    if (input.questionText.trim() === "") {
      return suggestion<EligibilityDerivation>(
        { inclusion: [], exclusion: [], searchTerms: [] },
        "derive:empty",
        true,
      );
    }
    return suggestion<EligibilityDerivation>(
      {
        inclusion: ["Estudos sobre o tema da pergunta"],
        exclusion: ["Estudos fora do escopo"],
        searchTerms: ["termo1", "termo2"],
      },
      `derive:${input.framework}`,
    );
  }

  async draftProtocol(input: {
    questionText: string;
    criteria: string[];
  }): Promise<LlmSuggestion<ProtocolDraft>> {
    return suggestion<ProtocolDraft>(
      {
        contentMarkdown: `# Protocolo PRISMA-P\n\n## Pergunta\n${input.questionText}\n`,
      },
      "draft:protocol",
    );
  }

  async preclassifyScreening(_: {
    title: string;
    abstract: string | null;
    criteria: string[];
  }): Promise<LlmSuggestion<ScreeningPreclassification>> {
    return suggestion<ScreeningPreclassification>(
      {
        recommendation: "include",
        confidence: 0.5,
        reason: "Sugestão simulada",
      },
      "preclassify",
    );
  }

  async ocrPage(input: {
    imageBase64: string;
    mediaType: "image/png" | "image/jpeg";
    page: number;
  }): Promise<LlmSuggestion<OcrResult>> {
    return suggestion<OcrResult>(
      { text: `[OCR p.${input.page}] texto simulado` },
      `ocr:p${input.page}`,
    );
  }

  async estimateCost(input: {
    itemCount: number;
    kind: "ai_screening_batch";
  }): Promise<CostEstimate> {
    return {
      tokensEstimated: input.itemCount * 800,
      cost: { usd: input.itemCount * 0.002 },
    };
  }
}
