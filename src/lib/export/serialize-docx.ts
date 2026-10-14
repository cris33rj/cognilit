import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  WidthType,
} from "docx";
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

function textTable(header: string[], rows: string[][]): Table {
  const toRow = (cells: string[], bold = false) =>
    new TableRow({
      children: cells.map(
        (c) =>
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: c, bold })] }),
            ],
          }),
      ),
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [toRow(header, true), ...rows.map((r) => toRow(r))],
  });
}

export async function serializeDocx(
  input: MarkdownInput,
  references: string,
  prismaPng: Uint8Array | null,
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: input.reviewTitle, heading: HeadingLevel.TITLE }),
  ];

  for (const s of input.sections) {
    children.push(
      new Paragraph({
        text: SECTION_TITLES[s.kind] ?? s.kind,
        heading: HeadingLevel.HEADING_1,
      }),
    );
    for (const line of s.content.split("\n")) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }

  if (prismaPng) {
    children.push(
      new Paragraph({
        text: "Fluxograma PRISMA 2020",
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: Buffer.from(prismaPng),
            transformation: { width: 520, height: 700 },
          }),
        ],
      }),
    );
  }

  const { columns, rows } = input.characteristics;
  if (columns.length > 0) {
    children.push(
      new Paragraph({
        text: "Tabela de características dos estudos",
        heading: HeadingLevel.HEADING_1,
      }),
      textTable(
        columns,
        rows.map((r) => columns.map((c) => String(r.cells[c] ?? ""))),
      ),
    );
  }

  if (input.checklist.length > 0) {
    children.push(
      new Paragraph({
        text: "Checklist PRISMA 2020",
        heading: HeadingLevel.HEADING_1,
      }),
      textTable(
        ["Item", "Descrição", "Seção", "Status"],
        input.checklist.map((i) => [
          i.itemCode,
          i.label,
          i.sectionRef ?? "",
          STATUS_LABEL[i.status],
        ]),
      ),
    );
  }

  if (references) {
    children.push(
      new Paragraph({ text: "Referências", heading: HeadingLevel.HEADING_1 }),
    );
    for (const ref of references.split("\n")) {
      children.push(new Paragraph({ children: [new TextRun(ref)] }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
