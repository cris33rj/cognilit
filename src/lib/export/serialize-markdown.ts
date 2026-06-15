import type { MarkdownInput } from "./queries";
import type { ChecklistStatus } from "@/lib/prisma/checklist";

const SECTION_TITLES: Record<string, string> = {
  methods: "Métodos",
  results: "Resultados",
  discussion: "Discussão",
  conclusion: "Conclusão",
  ai_declaration: "Declaração de uso de IA",
  deviations: "Desvios do protocolo",
};

const STATUS_LABEL: Record<ChecklistStatus, string> = {
  met: "Atendido",
  pending: "Pendente",
  not_applicable: "Não aplicável",
};

/** Escapa pipes/quebras para não quebrar células de tabela markdown. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Monta o relatório completo em Markdown (seções + características + checklist). */
export function serializeMarkdown(input: MarkdownInput): string {
  const parts: string[] = [`# ${input.reviewTitle}`];

  for (const s of input.sections) {
    parts.push(`## ${SECTION_TITLES[s.kind] ?? s.kind}\n\n${s.content}`);
  }

  // Tabela de características (FR-020)
  const { columns, rows } = input.characteristics;
  if (columns.length > 0) {
    const header = `| ${columns.map(cell).join(" | ")} |`;
    const sep = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows
      .map((r) => `| ${columns.map((c) => cell(r.cells[c])).join(" | ")} |`)
      .join("\n");
    parts.push(
      `## Tabela de características dos estudos\n\n${header}\n${sep}\n${body}`,
    );
  }

  // Checklist PRISMA 2020
  if (input.checklist.length > 0) {
    const header = `| Item | Descrição | Seção | Status |`;
    const sep = `| --- | --- | --- | --- |`;
    const body = input.checklist
      .map(
        (i) =>
          `| ${i.itemCode} | ${cell(i.label)} | ${cell(i.sectionRef ?? "")} | ${STATUS_LABEL[i.status]} |`,
      )
      .join("\n");
    parts.push(`## Checklist PRISMA 2020\n\n${header}\n${sep}\n${body}`);
  }

  return parts.join("\n\n") + "\n";
}
