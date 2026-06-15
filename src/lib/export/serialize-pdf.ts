import PdfPrinter from "pdfmake";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import type { MarkdownInput } from "./queries";
import type { ChecklistStatus } from "@/lib/prisma/checklist";

// vfs_fonts.js ships Roboto fonts as base64-encoded strings (no loose .ttf files in this pdfmake version).
// PDFFontFactory accepts Buffer directly, so we decode each font once at module load.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsFonts = require("pdfmake/build/vfs_fonts") as Record<string, string>;

function vfsToBuffer(key: string): Buffer {
  const b64 = vfsFonts[key];
  if (!b64) throw new Error(`pdfmake vfs_fonts: font key "${key}" not found`);
  return Buffer.from(b64, "base64");
}

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

// Fonts are passed as pre-decoded Buffers — no file-system lookup needed.
// This is the reliable mechanism for this pdfmake version (no loose TTF files).
const fonts = {
  Roboto: {
    normal: vfsToBuffer("Roboto-Regular.ttf"),
    bold: vfsToBuffer("Roboto-Medium.ttf"),
    italics: vfsToBuffer("Roboto-Italic.ttf"),
    bolditalics: vfsToBuffer("Roboto-MediumItalic.ttf"),
  },
};

export async function serializePdf(
  input: MarkdownInput,
  references: string,
  prismaPng: Uint8Array | null,
): Promise<Buffer> {
  const content: Content[] = [
    { text: input.reviewTitle, style: "title", margin: [0, 0, 0, 12] },
  ];

  for (const s of input.sections) {
    content.push({
      text: SECTION_TITLES[s.kind] ?? s.kind,
      style: "h1",
      margin: [0, 10, 0, 4],
    });
    content.push({ text: s.content });
  }

  if (prismaPng) {
    content.push({
      text: "Fluxograma PRISMA 2020",
      style: "h1",
      margin: [0, 10, 0, 4],
    });
    const b64 = Buffer.from(prismaPng).toString("base64");
    content.push({ image: `data:image/png;base64,${b64}`, width: 480 });
  }

  const { columns, rows } = input.characteristics;
  if (columns.length > 0) {
    content.push({
      text: "Tabela de características dos estudos",
      style: "h1",
      margin: [0, 10, 0, 4],
    });
    content.push({
      table: {
        headerRows: 1,
        body: [
          columns,
          ...rows.map((r) => columns.map((c) => String(r.cells[c] ?? ""))),
        ],
      },
    });
  }

  if (input.checklist.length > 0) {
    content.push({
      text: "Checklist PRISMA 2020",
      style: "h1",
      margin: [0, 10, 0, 4],
    });
    content.push({
      table: {
        headerRows: 1,
        body: [
          ["Item", "Descrição", "Seção", "Status"],
          ...input.checklist.map((i) => [
            i.itemCode,
            i.label,
            i.sectionRef ?? "",
            STATUS_LABEL[i.status],
          ]),
        ],
      },
    });
  }

  if (references) {
    content.push({
      text: "Referências",
      style: "h1",
      margin: [0, 10, 0, 4],
    });
    for (const ref of references.split("\n")) {
      content.push({ text: ref, margin: [0, 0, 0, 4] });
    }
  }

  const docDefinition: TDocumentDefinitions = {
    content,
    defaultStyle: { font: "Roboto", fontSize: 10 },
    styles: {
      title: { fontSize: 18, bold: true },
      h1: { fontSize: 13, bold: true },
    },
  };

  const printer = new PdfPrinter(fonts);
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (c: Buffer) => chunks.push(c));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}
