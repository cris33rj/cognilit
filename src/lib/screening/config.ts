// Orçamento de performance da fila — item A2 / SC-012 (ajustável sem schema).
export const SCREENING_PERF_BUDGET = {
  decisionToRenderMs: 100, // decisão → render (update otimista)
  keyNavMs: 50, // navegação por tecla (próximo/anterior)
  initialRenderMs: 1000, // render inicial com ~5.000 registros
} as const;

// Densidades de exibição (FR-040). rowHeight alimenta a virtualização.
export const DENSITIES = [
  { key: "compact", label: "Compacto", rowHeight: 36 },
  { key: "comfortable", label: "Confortável", rowHeight: 56 },
] as const;
export type Density = (typeof DENSITIES)[number]["key"];

// Atalhos de teclado (FR-023/028). Exibidos na legenda (ShortcutLegend).
export const SHORTCUTS = [
  { key: "i", action: "include", label: "Incluir" },
  { key: "e", action: "exclude", label: "Excluir" },
  { key: "d", action: "maybe", label: "Dúvida" },
  { key: "u", action: "undo", label: "Desfazer" },
  { key: "j", action: "next", label: "Próximo" },
  { key: "k", action: "prev", label: "Anterior" },
  { key: "x", action: "select", label: "Selecionar (lote)" },
] as const;
export type ShortcutAction = (typeof SHORTCUTS)[number]["action"];
