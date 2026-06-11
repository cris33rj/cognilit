# Contract — Extração por IA (`LLMProvider` estendido)

**Feature**: `002-marco2-coracao-ai-first` | Princípios I, II, VII | FR-012..019a, R8.

> **Estende** o contrato `LLMProvider` do Marco 1 (`specs/001-.../contracts/llm-provider.md`)
> — NÃO o substitui. Reaproveita `FactualValue`, `Provenance`, `SuggestionState`,
> `LlmSuggestion`. Ponto **único** de chamada de LLM (§VII): nenhuma feature
> instancia SDK direto. A extração lê o **texto do documento diretamente** (chunking
> interno para docs longos); **não** consome embeddings (clarificação Q1). Saída
> pt-BR; trecho-fonte no idioma original (D24).

## Tipos novos (TypeScript)

```ts
// src/lib/ai/llm/types.ts (adições)

export type ExtractionFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export interface ExtractionFieldDef {
  id: string;
  name: string;                 // rótulo pt-BR
  type: ExtractionFieldType;
  options?: string[];           // quando type === 'select'
}

export interface ExtractedField {
  field_id: string;
  value: FactualValue<unknown>; // {value, source_span, page} | {value:null, reason:'not_found'}
  inferred: boolean;            // true ⇒ state nasce 'inferred' (FR-014, ≠ ancorado)
  grounding: {                  // referencia a text_layer usada (FR-008/§II)
    text_layer_id: string | null;
    page: number | null;
    source_span: string | null; // citado no idioma original
    origin: 'nativo' | 'ocr_ia' | null;
  };
}

export interface ExtractionResult {
  fields: ExtractedField[];
  provenance: Provenance;       // OBRIGATÓRIO (FR-016/§II)
}

/** Página rasterizada para OCR multimodal (R2). */
export interface PageImage { page: number; imageBase64: string; mime: 'image/png' | 'image/jpeg'; }
```

## Interface (adições ao `LLMProvider`)

```ts
export interface LLMProvider {
  // ... métodos do Marco 1 (deriveEligibility, draftProtocol, preclassifyScreening, estimateCost)

  /** Preenche os campos do formulário a partir do TEXTO do documento (FR-012). pt-BR.
   *  documentText pode vir em chunks (R6) para docs longos; o provider NÃO usa RAG. */
  extractFields(input: {
    fields: ExtractionFieldDef[];
    documentText: string;           // texto extraído (text_layer concatenada/chunked)
    pageIndex?: { page: number; char_start: number; char_end: number }[]; // p/ ancorar span→página
  }): Promise<ExtractionResult>;

  /** OCR de uma página escaneada via LLM multimodal (R2). Resultado vira text_layer origin=ocr_ia. */
  ocrPage(input: { image: PageImage }): Promise<{ text: string; provenance: Provenance }>;
}
```

## `estimateCost` — kinds adicionais (FR-022, R9)

```ts
estimateCost(input:
  | { itemCount: number; kind: 'ai_screening_batch' }      // Marco 1
  | { itemCount: number; kind: 'ai_extraction_batch'; fieldCount: number }
): Promise<{ tokensEstimated: number; cost: Record<string, number> }>;
```

## Invariantes do contrato

- Toda saída factual é `FactualValue`: `{value, source_span, page}` **ou**
  `{value:null, reason:'not_found'}`. "Não encontrado" é 1ª classe (FR-013) — nunca
  erro nem vazio ambíguo.
- `inferred=true` ⇒ a `ai_suggestion` nasce `state='inferred'` e exige ratificação
  (FR-014); visualmente distinta de ancorado (§I).
- `provenance` preenchida em 100% das saídas (FR-016/§II) — ausência ⇒ teste falha.
- A IA **nunca** escreve `extraction_value.final_value`; só cria `ai_suggestion`
  `pending`/`inferred` (FR-019/§I). Ratificação humana é a única via ao valor final.
- `extractFields`/`ocrPage` rodam **no worker** do job (`ai_extraction_batch` /
  `pdf_text_pipeline`), nunca em request síncrono de UI (§VIII). BYOK (1ª chave)
  decifrada server-side via Vault.
- Re-extração: nova chamada gera novas `ai_suggestion` `pending` que **encostam** no
  `extraction_value` existente sem sobrescrever o validado (FR-019a/Q4).
- Saída pt-BR; `source_span` preservado no idioma original (D24/FR-015).

## Testes mínimos (TDD)

- `extractFields` retorna `provenance` em 100% das saídas; ausência ⇒ falha.
- Campo ausente no texto ⇒ `value:null, reason:'not_found'` (renderiza "não
  encontrado", nunca valor inventado).
- Campo inferido ⇒ `inferred=true` ⇒ sugestão `state='inferred'`.
- `extractFields` **não** lê embeddings/`embedding_chunk` (verificar ausência de
  dependência — US3 ⟂ US5, Q1).
- Re-extração sobre estudo validado ⇒ novo `ai_suggestion pending`, `final_value`
  anterior intacto (FR-019a).
- Mock provider cobre todos os caminhos sem rede (espelha `src/lib/ai/llm/mock.ts`).
