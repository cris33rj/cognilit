# Contract — Synthesis (LLMProvider estendido + grounding)

**Feature**: `003-marco3-saida-sintese-relatorio` | US1 | FR-001..007, FR-005a, FR-024, FR-026

> Interface **lógica** (não assinatura final). A síntese só fala com IA via `LLMProvider`
> (§VII): nenhum código de feature instancia o SDK Anthropic direto, nenhum "raw write".
> Toda saída factual ancora em achado real (§II); a IA **sugere**, o humano ratifica (§I).

## LLMProvider — métodos adicionados (`src/lib/ai/llm/`)

```ts
interface LLMProvider {
  // ... métodos dos Marcos 1–2 (extractFields, ocrPage, estimateCost, ...) — REUSADOS

  // Agrupa achados validados em temas + narrativa rascunhada, em pt-BR.
  // ENTRADA: achados já ratificados (final_value) com sua origem (extraction_value_id).
  // SAÍDA: temas, cada um com narrativa e as referências de achado que o sustentam.
  synthesizeThemes(input: {
    findings: Array<{
      extractionValueId: string;   // âncora de grounding (nível de achado, Q3)
      recordId: string;
      fieldName: string;
      value: unknown;              // final_value ratificado
    }>;
    language: "pt-BR";             // fixo (D24)
  }): Promise<{
    themes: Array<{
      name: string;
      narrative: string;                 // pt-BR
      findingRefs: string[];             // extractionValueId[] que ancoram o tema
      provenance: Provenance;            // modelo, versão, prompt/trecho, timestamp
    }>;
  } | { insufficientData: true }>;       // "dados insuficientes" 1ª classe (FR-007)
}
```

- `estimateCost` (já existe) é chamado **antes** do `synthesis_batch` (FR-006); o consumo
  é gravado em `ai_usage` (phase `synthesis`, FR-026).
- `synthesizeThemes` **nunca** retorna tema sem `findingRefs` não-vazio — sem âncora, não
  há tema (§II/FR-007). Corpus sem achados → `{ insufficientData: true }`.

## Job — `synthesis_batch` (reusa `job`/`job_item`, §VIII)

- **Enfileiramento** (Edge `jobs-enqueue`, só valida + enfileira): valida que a Revisão
  tem `extraction_value` validados; cria `job(type=synthesis_batch, estimated_cost)`.
- **Item** = um **estudo** (`record` incluído): o worker coleta os achados do estudo no
  pool. Falha de um estudo **não** derruba o lote (resiliência por-item, FR-005).
- **Agregação**: o worker chama `synthesizeThemes` sobre o pool (map-reduce em sub-lotes
  se grande) e persiste `theme` (`state=pending`) + `theme_finding` (grounding) +
  `ai_suggestion(target_kind=synthesis_theme)`.
- **Estados**: `synthesis.status` `generating → ready | failed | draft(insuficiente)`.

## Operações de ratificação (humano-no-laço — server actions)

```ts
acceptTheme(themeId): void           // state → accepted
editTheme(themeId, { name?, narrative? }): void   // state → human_edited (edited)
rejectTheme(themeId): void           // state → rejected (mantido p/ trilha, US1.3)
mergeThemes(themeIds[]): Theme       // funde; registra audit
splitTheme(themeId, parts[]): Theme[]// divide
reorderThemes(orderedIds[]): void
```

- Toda operação grava `audit_entry` (insert-only, §III) com ator humano + antes/depois.
- A IA **nunca** chama estas operações (§I); re-gerar a síntese **preserva** temas
  `accepted/edited` pelo humano (Q2).

## Invariantes verificáveis
- [ ] Nenhum `theme` ativo sem ≥1 `theme_finding` (grounding obrigatório, §II).
- [ ] `synthesizeThemes` retorna `insufficientData` quando não há achados (FR-007).
- [ ] `ai_usage(phase=synthesis)` registrado a cada execução; `estimateCost` precede.
- [ ] Toda narrativa em pt-BR; trechos-fonte (nos achados) no idioma original (D24).
- [ ] RLS: síntese/tema/grounding só acessíveis a `member` da Revisão.
