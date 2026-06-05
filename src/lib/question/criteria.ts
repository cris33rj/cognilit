export interface CriterionItem {
  kind: "inclusion" | "exclusion" | "search_term";
  text: string;
}

/**
 * Achata a saída factual do LLM (`deriveEligibility`) em itens `{kind,text}` para a
 * RPC `regenerate_eligibility_criteria`. Função pura — sem I/O, fácil de testar.
 */
export function criteriaItemsFromOutput(output: {
  inclusion: string[];
  exclusion: string[];
  searchTerms: string[];
}): CriterionItem[] {
  return [
    ...output.inclusion.map((text) => ({ kind: "inclusion" as const, text })),
    ...output.exclusion.map((text) => ({ kind: "exclusion" as const, text })),
    ...output.searchTerms.map((text) => ({
      kind: "search_term" as const,
      text,
    })),
  ];
}
