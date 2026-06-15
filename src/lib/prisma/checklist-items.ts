import type { SectionKind } from "@/lib/report/types";

/** Regra de cobertura: como inferir o status do item a partir do estado do relatório. */
export type CoverageRule =
  | { type: "section"; kind: SectionKind } // met se a seção existe e não está vazia
  | { type: "study_selection" } // met se há contadores PRISMA (fluxograma)
  | { type: "characteristics" } // met se há tabela de características com dados
  | { type: "optional_off"; phase: "risk_of_bias" | "certainty" } // not_applicable (D19)
  | { type: "manual" }; // pending: sistema não gera este item na v1 (US4.3)

export interface ChecklistSeedItem {
  itemCode: string;
  /** Rótulo pt-BR exibido ao pesquisador. */
  label: string;
  /** Seção do relatório que cobre o item (referência exibida quando `met`). */
  sectionRef: string | null;
  rule: CoverageRule;
}

/**
 * 27 itens do PRISMA 2020 (nível superior). Mapeamento de cobertura → ver
 * "Decisão de design" no IMPLEMENTATION_PLAN.md (revisável no CHECKPOINT 2).
 */
export const PRISMA_2020_ITEMS: ChecklistSeedItem[] = [
  // TÍTULO / RESUMO / INTRODUÇÃO — não gerados pelo sistema na v1 → pending (US4.3)
  {
    itemCode: "1",
    label: "Título",
    sectionRef: null,
    rule: { type: "manual" },
  },
  {
    itemCode: "2",
    label: "Resumo",
    sectionRef: null,
    rule: { type: "manual" },
  },
  {
    itemCode: "3",
    label: "Justificativa",
    sectionRef: null,
    rule: { type: "manual" },
  },
  {
    itemCode: "4",
    label: "Objetivos",
    sectionRef: "Métodos",
    rule: { type: "section", kind: "methods" },
  },
  // MÉTODOS
  {
    itemCode: "5",
    label: "Critérios de elegibilidade",
    sectionRef: "Métodos",
    rule: { type: "section", kind: "methods" },
  },
  {
    itemCode: "6",
    label: "Fontes de informação",
    sectionRef: "Métodos",
    rule: { type: "section", kind: "methods" },
  },
  {
    itemCode: "7",
    label: "Estratégia de busca",
    sectionRef: "Métodos",
    rule: { type: "section", kind: "methods" },
  },
  {
    itemCode: "8",
    label: "Processo de seleção",
    sectionRef: "Resultados (fluxograma)",
    rule: { type: "study_selection" },
  },
  {
    itemCode: "9",
    label: "Processo de coleta de dados",
    sectionRef: "Métodos",
    rule: { type: "section", kind: "methods" },
  },
  {
    itemCode: "10",
    label: "Itens de dados",
    sectionRef: "Tabela de características",
    rule: { type: "characteristics" },
  },
  {
    itemCode: "11",
    label: "Avaliação do risco de viés nos estudos",
    sectionRef: null,
    rule: { type: "optional_off", phase: "risk_of_bias" },
  },
  {
    itemCode: "12",
    label: "Medidas de efeito",
    sectionRef: null,
    rule: { type: "manual" },
  },
  {
    itemCode: "13",
    label: "Métodos de síntese",
    sectionRef: "Métodos",
    rule: { type: "section", kind: "methods" },
  },
  {
    itemCode: "14",
    label: "Avaliação de viés de relato",
    sectionRef: null,
    rule: { type: "optional_off", phase: "risk_of_bias" },
  },
  {
    itemCode: "15",
    label: "Avaliação da certeza da evidência",
    sectionRef: null,
    rule: { type: "optional_off", phase: "certainty" },
  },
  // RESULTADOS
  {
    itemCode: "16",
    label: "Seleção dos estudos",
    sectionRef: "Resultados (fluxograma)",
    rule: { type: "study_selection" },
  },
  {
    itemCode: "17",
    label: "Características dos estudos",
    sectionRef: "Tabela de características",
    rule: { type: "characteristics" },
  },
  {
    itemCode: "18",
    label: "Risco de viés nos estudos",
    sectionRef: null,
    rule: { type: "optional_off", phase: "risk_of_bias" },
  },
  {
    itemCode: "19",
    label: "Resultados dos estudos individuais",
    sectionRef: "Resultados",
    rule: { type: "section", kind: "results" },
  },
  {
    itemCode: "20",
    label: "Resultados das sínteses",
    sectionRef: "Resultados",
    rule: { type: "section", kind: "results" },
  },
  {
    itemCode: "21",
    label: "Vieses de relato",
    sectionRef: null,
    rule: { type: "optional_off", phase: "risk_of_bias" },
  },
  {
    itemCode: "22",
    label: "Certeza da evidência",
    sectionRef: null,
    rule: { type: "optional_off", phase: "certainty" },
  },
  // DISCUSSÃO
  {
    itemCode: "23",
    label: "Discussão",
    sectionRef: "Discussão",
    rule: { type: "section", kind: "discussion" },
  },
  // OUTRAS INFORMAÇÕES
  {
    itemCode: "24",
    label: "Registro e protocolo",
    sectionRef: "Métodos",
    rule: { type: "section", kind: "methods" },
  },
  {
    itemCode: "25",
    label: "Apoio / financiamento",
    sectionRef: null,
    rule: { type: "manual" },
  },
  {
    itemCode: "26",
    label: "Conflitos de interesse",
    sectionRef: null,
    rule: { type: "manual" },
  },
  {
    itemCode: "27",
    label: "Disponibilidade de dados, código e materiais",
    sectionRef: null,
    rule: { type: "manual" },
  },
];
