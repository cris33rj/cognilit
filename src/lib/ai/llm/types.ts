export interface ProviderIdentity {
  provider: "anthropic" | string; // default: anthropic (Claude)
  model: string; // exposto à proveniência (FR-031)
  version: string;
}

export interface FactualValue<T> {
  value: T | null;
  source_span: string | null; // Marco 1: metadado/resumo
  page: number | null; // null no Marco 1 (sem PDF)
  reason?: "not_found"; // quando value === null (FR-034)
}

export interface Provenance {
  model: string;
  version: string;
  prompt_or_span: string;
  timestamp: string; // ISO 8601
}

export type SuggestionState =
  | "pending"
  | "accepted"
  | "edited"
  | "rejected"
  | "inferred";

export interface LlmSuggestion<T> {
  output: T;
  provenance: Provenance; // OBRIGATÓRIO (FR-031, §II)
  state: SuggestionState; // nasce 'pending' (§I)
  not_found: boolean; // §II / FR-034
}

export interface EligibilityDerivation {
  inclusion: string[];
  exclusion: string[];
  searchTerms: string[];
}

export interface ProtocolDraft {
  contentMarkdown: string;
}

export interface ScreeningPreclassification {
  recommendation: "include" | "exclude"; // nunca decide (FR-024)
  confidence: number; // 0..1
  reason: string; // razão curta, pt-BR
}

export interface CostEstimate {
  tokensEstimated: number;
  cost: Record<string, number>;
}

export interface LLMProvider {
  identity(): ProviderIdentity;

  /** Deriva critérios/termos a partir da pergunta (US5/FR-007). Saída pt-BR. */
  deriveEligibility(input: {
    framework: string;
    questionText: string;
    fields: Record<string, unknown>;
  }): Promise<LlmSuggestion<EligibilityDerivation>>;

  /** Rascunha protocolo PRISMA-P (US6/FR-009). Saída pt-BR. */
  draftProtocol(input: {
    questionText: string;
    criteria: string[];
  }): Promise<LlmSuggestion<ProtocolDraft>>;

  /** Pré-classifica um registro na triagem (FR-024). Ancora em metadado/resumo. */
  preclassifyScreening(input: {
    title: string;
    abstract: string | null;
    criteria: string[];
  }): Promise<LlmSuggestion<ScreeningPreclassification>>;

  /** Estimativa de custo ANTES de lote (FR-033, §VII/P5). */
  estimateCost(input: {
    itemCount: number;
    kind: "ai_screening_batch";
  }): Promise<CostEstimate>;
}

export class MissingByokError extends Error {
  constructor(reviewId: string) {
    super(`Nenhuma chave BYOK cadastrada para a Revisão ${reviewId}`);
    this.name = "MissingByokError";
  }
}
