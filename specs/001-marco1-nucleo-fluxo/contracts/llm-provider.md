# Contract — `LLMProvider` abstraction

**Feature**: `001-marco1-nucleo-fluxo` | Princípio VII (D14), Princípio I, II.

> Ponto único de chamada de LLM. **Nenhum código de feature instancia um SDK de
> fornecedor diretamente** nem faz "raw write" de saída de IA (constitution §VII).
> A abstração fixa: idioma de saída pt-BR, contrato de saída factual, exposição de
> `model`/`version` para proveniência, e "não encontrado" como 1ª classe.

## Interface (TypeScript)

```ts
// src/lib/ai/llm/types.ts
export interface ProviderIdentity {
  provider: "anthropic" | string; // default: anthropic (Claude)
  model: string; // exposto à proveniência (FR-031)
  version: string;
}

export interface FactualValue<T> {
  value: T | null;
  source_span: string | null; // span do trecho-fonte (Marco 1: metadado/resumo)
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

export interface ScreeningPreclassification {
  recommendation: "include" | "exclude"; // nunca decide (FR-024)
  confidence: number; // 0..1
  reason: string; // razão curta, pt-BR
}

export interface LLMProvider {
  identity(): ProviderIdentity;

  /** Deriva critérios/termos a partir da pergunta (US5/FR-007). Saída pt-BR. */
  deriveEligibility(input: {
    framework: string;
    questionText: string;
    fields: Record<string, unknown>;
  }): Promise<
    LlmSuggestion<{
      inclusion: string[];
      exclusion: string[];
      searchTerms: string[];
    }>
  >;

  /** Rascunha protocolo PRISMA-P (US6/FR-009). Saída pt-BR. */
  draftProtocol(input: {
    questionText: string;
    criteria: string[];
  }): Promise<LlmSuggestion<{ contentMarkdown: string }>>;

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
  }): Promise<{ tokensEstimated: number; cost: Record<string, number> }>;
}
```

## Invariantes do contrato

- Toda saída de geração textual retorna `LlmSuggestion<T>` com `provenance`
  preenchida — sem exceção (§II/FR-031).
- `state` inicial é sempre `pending`; a IA **nunca** persiste estado de Revisão (§I).
- Idioma de saída: **pt-BR** (§Idioma/D24); trecho-fonte preservado no original.
- Chamadas que rodam em lote (`preclassifyScreening` sobre o corpus) são invocadas
  **pelo worker** do job `ai_screening_batch`, nunca em request síncrono de UI
  (§VIII). A chave BYOK é decifrada server-side via Vault (R5/FR-032).
- Default provider: **Claude (Anthropic)** (D14), trocável por configuração.

## Testes mínimos (TDD)

- Mock provider retorna `provenance` em 100% das saídas; ausência ⇒ teste falha.
- `not_found=true` renderiza "não encontrado" e nunca um valor inventado.
- `preclassifyScreening` jamais altera estado de `record` (verificar via ausência
  de side-effect).
