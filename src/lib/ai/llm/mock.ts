import type {
  CostEstimate,
  EligibilityDerivation,
  ExtractedField,
  ExtractionFieldDef,
  ExtractionResult,
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

  async estimateCost(
    input:
      | { itemCount: number; kind: "ai_screening_batch" }
      | { itemCount: number; kind: "ai_extraction_batch"; fieldCount: number },
  ): Promise<CostEstimate> {
    if (input.kind === "ai_extraction_batch") {
      const tokensEstimated = input.itemCount * input.fieldCount * 250;
      return {
        tokensEstimated,
        cost: { usd: (tokensEstimated / 1000) * 0.0025 },
      };
    }
    return {
      tokensEstimated: input.itemCount * 800,
      cost: { usd: input.itemCount * 0.002 },
    };
  }

  async extractFields(input: {
    fields: ExtractionFieldDef[];
    documentText: string;
    pageIndex?: { page: number; char_start: number; char_end: number }[];
  }): Promise<ExtractionResult> {
    // Determinístico: 'select' ⇒ inferido; nome contendo "ausente" ⇒ not_found;
    // demais ⇒ ancorado em página 1 com span simulado. Sem rede, pt-BR.
    const fields: ExtractedField[] = input.fields.map((f) => {
      const isAusente = /ausente/i.test(f.name);
      const isInferred = f.type === "select";
      if (isAusente) {
        return {
          field_id: f.id,
          value: {
            value: null,
            source_span: null,
            page: null,
            reason: "not_found",
          },
          inferred: false,
          grounding: {
            text_layer_id: null,
            page: null,
            source_span: null,
            origin: null,
          },
        };
      }
      const span = `[trecho simulado p/ ${f.name}]`;
      return {
        field_id: f.id,
        value: { value: `valor de ${f.name}`, source_span: span, page: 1 },
        inferred: isInferred,
        grounding: {
          text_layer_id: null,
          page: 1,
          source_span: span,
          origin: null,
        },
      };
    });
    return { fields, provenance: provenance("extract") };
  }
}
