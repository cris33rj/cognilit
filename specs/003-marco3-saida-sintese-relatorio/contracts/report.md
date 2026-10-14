# Contract — Report (geração, declaração de IA, desvios, regeneração)

**Feature**: `003-marco3-saida-sintese-relatorio` | US3 | FR-012..017, FR-024

> O relatório é montado em três trilhas: **factual determinística** (Métodos, declaração
> de IA, desvios — **sem LLM**, §II/R9); **Resultados**, que é montado **sem novo passe de
> LLM** mas **embute a narrativa de síntese de IA já ratificada (US1)** ao lado das tabelas
> factuais; e **assistida por IA** (Discussão/Conclusão — rascunho próprio que o humano
> edita, §I). Regeneração **preserva** seções editadas pelo humano (Q1/R7).

## Montagem sem novo passe de LLM (`src/lib/report/`)

```ts
// Métodos: factual, fiel aos dados (D29). SEM LLM.
buildMethodsSection(reviewId): { content: string /* md, pt-BR */ }
  // pergunta (SPIDER), critérios de elegibilidade, protocolo, fontes/strings de busca,
  // fluxo de triagem — tudo de tabelas dos Marcos 1–2.
buildResultsSection(reviewId): { content: string }
  // contagens (views PRISMA) + tabela de características (derivada de extraction_value ×
  // extraction_field, R6) + a NARRATIVA DE SÍNTESE DE IA JÁ RATIFICADA (temas/narrativa,
  // US1). O texto coerente é de origem IA (produzido e ratificado na Síntese); o relatório
  // o EMBUTE — não faz um segundo passe de LLM (humano-no-laço, §I/§II).

// Declaração de IA: factual, das ai_suggestion usadas (D13). SEM LLM.
buildAiDeclaration(reviewId): { content: string }
  // enumera cada fase com sugestão de IA (screening/extraction/synthesis/report) +
  // proveniência (modelo, versão, estado). Fonte de verdade = ai_suggestion, não o LLM.

// Desvios do protocolo: das emendas versionadas/datadas (D16). SEM LLM.
buildDeviations(reviewId): { content: string }
  // lista emendas pós-travamento do protocolo (Marco 1, migration 0002), datadas.

// Declaração de fases desligadas (D19): Viés/Certeza OFF → declara explicitamente.
buildOptionalPhasesDeclaration(reviewId): { content: string }
```

- Estas seções nascem `edit_state = deterministic`; a regeneração **sempre** as atualiza
  para refletir o estado atual (não há divergência com os dados).

## Trilha assistida por IA (`LLMProvider` — §VII)

```ts
interface LLMProvider {
  // Rascunha Discussão/Conclusão como ponto de partida editável (D29). pt-BR.
  draftReportSection(input: {
    kind: "discussion" | "conclusion";
    context: { methods: string; results: string; themes: ThemeSummary[] };
    language: "pt-BR";
  }): Promise<{ content: string; provenance: Provenance }>;
}
```

- Roda no job `report_draft` (item = uma seção IA); `estimateCost` antes; `ai_usage`
  phase `report`. Nasce `edit_state = ai_generated`, `state = pending` na `ai_suggestion`.

## Regeneração (Q1/R7 — FR-016)

```ts
regenerateReport(reviewId): {
  regenerated: SectionKind[];   // deterministic + ai_generated
  preserved: SectionKind[];     // human_edited — NÃO sobrescritas; UI avisa
}
editReportSection(sectionId, content): void   // edit_state → human_edited; audit_entry
```

- Regra: regeneração reescreve `deterministic` e `ai_generated`; **preserva**
  `human_edited` e **avisa** quais manteve (FR-016). Nenhuma sobrescrita silenciosa (§III).

## Invariantes verificáveis
- [ ] Métodos/declaração-IA/desvios são montados **sem** chamada a LLM; **Resultados** é
      montado sem **novo** passe de LLM, embutindo a síntese de IA já ratificada (US1) (R9).
- [ ] Declaração de IA enumera 100% das fases com `ai_suggestion` usada (FR-013/SC-003).
- [ ] Desvios listam 100% das emendas pós-travamento (FR-014/SC-004).
- [ ] Viés/Certeza desligadas → relatório **declara** a ausência (FR-015/SC-009).
- [ ] Regeneração preserva toda seção `human_edited` (FR-016); registra `audit_entry`.
- [ ] Todo conteúdo em pt-BR (D24); trechos-fonte no original.
- [ ] RLS: relatório/seções só acessíveis a `member` da Revisão.
