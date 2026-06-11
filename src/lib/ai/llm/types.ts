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

export interface OcrResult {
  text: string; // texto OCR da página, no idioma original (FR-015)
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

  /** OCR multimodal de uma página rasterizada (R2/FR-007/FR-008). Saída no idioma original. */
  ocrPage(input: {
    imageBase64: string;
    mediaType: "image/png" | "image/jpeg";
    page: number;
  }): Promise<LlmSuggestion<OcrResult>>;

  /** Preenche os campos do formulário a partir do TEXTO do documento (FR-012). pt-BR.
   *  documentText vem concatenada (chunking interno R6); NÃO usa RAG (Q1/§US3⟂US5). */
  extractFields(input: {
    fields: ExtractionFieldDef[];
    documentText: string;
    pageIndex?: { page: number; char_start: number; char_end: number }[];
  }): Promise<ExtractionResult>;

  /** Estimativa de custo ANTES de lote (FR-022, §VII/P5). */
  estimateCost(
    input:
      | { itemCount: number; kind: "ai_screening_batch" }
      | { itemCount: number; kind: "ai_extraction_batch"; fieldCount: number },
  ): Promise<CostEstimate>;
}

export type ExtractionFieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select";

export interface ExtractionFieldDef {
  id: string;
  name: string; // rótulo pt-BR
  type: ExtractionFieldType;
  options?: string[]; // quando type === 'select'
}

export interface ExtractedField {
  field_id: string;
  value: FactualValue<unknown>; // {value, source_span, page} | {value:null, reason:'not_found'}
  inferred: boolean; // true ⇒ state nasce 'inferred' (FR-014)
  grounding: {
    text_layer_id: string | null; // resolvido no lib (provider devolve null)
    page: number | null;
    source_span: string | null; // citado no idioma original (FR-015)
    origin: "nativo" | "ocr_ia" | null;
  };
}

export interface ExtractionResult {
  fields: ExtractedField[];
  provenance: Provenance; // OBRIGATÓRIO (FR-016/§II)
}

export class MissingByokError extends Error {
  constructor(reviewId: string) {
    super(`Nenhuma chave BYOK cadastrada para a Revisão ${reviewId}`);
    this.name = "MissingByokError";
  }
}
