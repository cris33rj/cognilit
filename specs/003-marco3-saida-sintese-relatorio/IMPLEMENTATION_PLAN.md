# Fatia 6 — Exportação: DOCX/PDF + APA 7 (US5, parte 2) — fatia terminal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Contrato Sessão B**: commitar **somente** no branch isolado `build/003-marco3-saida-sintese-relatorio/6-export-docs`; **nunca** merge/push para a feature ou `main`. Ao fim, **PARAR** (CHECKPOINT 3) e aguardar merge do usuário.

**Goal:** Completar a exportação do Marco 3 adicionando os serializadores pesados — DOCX (`docx`), PDF (`pdfmake`, embutindo o PNG do fluxograma PRISMA + checklist + tabela de características) e formatação de citações/referências em APA 7 (`citeproc` + CSL) — ao **mesmo** job `report_export` já entregue na Fatia 5, fechando SC-005.

**Architecture:** A Fatia 5 deixou o job `report_export` resiliente por-formato (`item = um formato`), o bucket `exports`, a tabela `export_artifact`, o download e a UI prontos. Esta fatia **só estende o ponto único** `serializeFormat()` em `src/lib/export/batch-worker.ts` com os `case`s `docx` e `pdf`, mais três módulos novos puros (`serialize-docx.ts`, `serialize-pdf.ts`, `format-apa7.ts`) e os assets CSL. Reusa o conteúdo canônico já agregado por `loadExportInputs` (seções + características + checklist) e `listIncludedFtRecordsDetail` (referências). PNG do fluxograma vem de `loadPrismaFlowModel → renderPrismaSvg → renderPrismaPng` (Fatia 1, runtime Node). **Sem LLM, sem migration** (enum `export_format` já contém `docx`/`pdf` desde a Fatia 5).

**Tech Stack:** TypeScript strict, Next.js 14 App Router (worker Node server-side via server action `enqueueExport`, runtime nodejs), Supabase (Storage + RLS), Vitest (unit + integration node), Playwright (e2e SC-005). Novas libs (só por tarefa, previstas no `plan.md`): `docx`, `pdfmake`, `citeproc` + CSL APA 7 (estilo + locale pt-BR vendorizados).

---

## Decisões de implementação herdadas (não reabrir)

- **A2 (slicing §A2):** runtime de export é **worker Node server-side** (não Deno). `docx`/`pdfmake`/`@resvg/resvg-wasm` rodam no mesmo Node onde `unpdf`+`@napi-rs/canvas` já rasterizam PDFs. A validação A2 é **abrir o DOCX no Word e conferir o PDF** (fidelidade visual), espelhando a calibração de `rasterize.ts` do Marco 2 — **tarefa de verificação humana**, registrada no `COMPLETION`.
- **§II / FR-022 (citações):** metadados bibliográficos ausentes são **marcados, nunca inventados**. APA 7 tem convenções para ausências (data ausente → `(s.d.)`); campos sem convenção recebem marcador explícito pt-BR (`[autor não informado]`, `[título não informado]`). Espelha o `serializeBibtex` da Fatia 5 (omite o ausente).
- **Resiliência por-formato (FR-023):** já implementada no `processReportExportJob` (Fatia 5). Cada novo formato é só um `case` novo — falha de `docx`/`pdf` continua isolada por construção (`try/catch` por `job_item`).
- **`prisma_svg`/`prisma_png` ficam fora do job `report_export`** — possuem rota própria de download desde a Fatia 1 (`app/reviews/[reviewId]/prisma/export/route.ts`). Permanecem no `default: throw` do worker. **Não** são escopo desta fatia (SC-005 pede DOCX/PDF/MD + BibTeX/RIS).
- **MIME/EXT já mapeados** na Fatia 5 (`docx`, `pdf` presentes nos mapas `MIME`/`EXT` do `batch-worker.ts`). Verificar no Task 5, não recriar.
- **Sem migration:** enum `export_format` (`docx|pdf|md|bibtex|ris|prisma_svg|prisma_png`) e `job_type 'report_export'` já existem (migration `0021`, Fatia 5).

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `package.json` (modificar) | adicionar deps `docx`, `pdfmake`, `citeproc`. |
| `src/lib/export/csl/apa.csl` | estilo CSL APA 7 (vendorizado do repo oficial `citation-style-language/styles`). |
| `src/lib/export/csl/locales-pt-BR.xml` | locale CSL pt-BR (vendorizado de `citation-style-language/locales`). |
| `src/lib/export/format-apa7.ts` | `recordToCslJson(r)` + `formatCitationsApa7(records)` → lista de referências APA 7 (texto pt-BR), metadados ausentes marcados (§II/FR-022). |
| `src/lib/export/serialize-docx.ts` | `serializeDocx(input, references, prismaPng)` → `Buffer` via `docx` (seções + características + checklist + referências + imagem do fluxograma). |
| `src/lib/export/serialize-pdf.ts` | `serializePdf(input, references, prismaPng)` → `Buffer` via `pdfmake` (mesmo conteúdo; embute PNG). |
| `src/lib/export/batch-worker.ts` (modificar) | `serializeFormat`: novos `case "docx"` / `case "pdf"`; helper `loadDocInputs` agrega `loadExportInputs` + `listIncludedFtRecordsDetail` + PNG do fluxograma. |
| `src/components/report/ExportPanel.tsx` (modificar) | oferecer `docx` e `pdf` na seleção de formatos. |
| `tests/unit/export/format-apa7.test.ts` | APA 7: ordenação, formato canônico, marcação de metadados ausentes. |
| `tests/unit/export/serialize-docx.test.ts` | smoke: Buffer não-vazio, assinatura ZIP `PK`, contém texto das seções. |
| `tests/unit/export/serialize-pdf.test.ts` | smoke: Buffer não-vazio, assinatura `%PDF-`. |
| `tests/integration/export.test.ts` (modificar) | worker gera artefatos `docx`+`pdf` no bucket; embute fluxograma; resiliência. |
| `tests/e2e/export.spec.ts` (modificar) | SC-005: síntese→relatório→export dos 5 formatos numa operação. |

---

## Task 1: Adicionar dependências e vendorizar os assets CSL

**Files:**
- Modify: `package.json`
- Create: `src/lib/export/csl/apa.csl`
- Create: `src/lib/export/csl/locales-pt-BR.xml`

- [ ] **Step 1: Instalar as três libs (versões fixadas)**

Run:
```bash
npm install docx@^9.0.0 pdfmake@^0.2.10 citeproc@^2.4.63
npm install -D @types/pdfmake@^0.2.9
```
Expected: `package.json` ganha `docx`, `pdfmake`, `citeproc` em `dependencies` e `@types/pdfmake` em `devDependencies`; `package-lock.json` atualizado.

- [ ] **Step 2: Vendorizar o estilo APA 7 e o locale pt-BR**

Run:
```bash
mkdir -p src/lib/export/csl
curl -fsSL https://raw.githubusercontent.com/citation-style-language/styles/master/apa.csl -o src/lib/export/csl/apa.csl
curl -fsSL https://raw.githubusercontent.com/citation-style-language/locales/master/locales-pt-BR.xml -o src/lib/export/csl/locales-pt-BR.xml
```
Expected: dois arquivos XML não-vazios. Conferir:
```bash
head -c 200 src/lib/export/csl/apa.csl   # deve começar com <?xml ... <style ...
head -c 200 src/lib/export/csl/locales-pt-BR.xml
```

- [ ] **Step 3: Garantir que os assets CSL são lidos via fs no runtime Node**

O worker roda em runtime Node (server action). Confirmar que `src/lib/export/csl/*.{csl,xml}` é lido via `fs.readFileSync(path.join(process.cwd(), "src/lib/export/csl/apa.csl"), "utf-8")` (caminho absoluto a partir de `process.cwd()`), padrão já usado no projeto para assets server-side. **Não** usar `import` de XML.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/export/csl/
git commit -m "build(export): add docx, pdfmake, citeproc + CSL APA7 assets (F6)"
```

---

## Task 2: `format-apa7.ts` — citações APA 7 via citeproc (FR-022, §II)

**Files:**
- Create: `src/lib/export/format-apa7.ts`
- Test: `tests/unit/export/format-apa7.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { recordToCslJson, formatCitationsApa7 } from "@/lib/export/format-apa7";
import type { RecordDetailData } from "@/lib/record/queries";

function rec(over: Partial<RecordDetailData>): RecordDetailData {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Aprendizagem ativa em revisões sistemáticas",
    authors: ["Silva, Ana", "Souza, Bruno"],
    year: 2021,
    journal: "Revista de Métodos",
    volume: "12",
    issue: "3",
    pages: "45-60",
    doi: "10.1000/xyz123",
    ...over,
  };
}

describe("recordToCslJson", () => {
  it("mapeia autores 'Sobrenome, Nome' para family/given", () => {
    const csl = recordToCslJson(rec({}));
    expect(csl.author).toEqual([
      { family: "Silva", given: "Ana" },
      { family: "Souza", given: "Bruno" },
    ]);
    expect(csl.issued).toEqual({ "date-parts": [[2021]] });
    expect(csl.DOI).toBe("10.1000/xyz123");
    expect(csl.id).toBe(rec({}).id);
  });

  it("omite issued quando não há ano (sem inventar)", () => {
    const csl = recordToCslJson(rec({ year: null }));
    expect(csl.issued).toBeUndefined();
  });
});

describe("formatCitationsApa7", () => {
  it("formata uma lista de referências determinística e ordenada por autor", () => {
    const out = formatCitationsApa7([
      rec({ authors: ["Souza, Bruno"], title: "B-estudo", year: 2020 }),
      rec({ authors: ["Alves, Carla"], title: "A-estudo", year: 2019 }),
    ]);
    // APA ordena por sobrenome do 1º autor: Alves antes de Souza
    expect(out.indexOf("Alves")).toBeLessThan(out.indexOf("Souza"));
    expect(out).toContain("(2019)");
    expect(out).toContain("(2020)");
  });

  it("marca data ausente como (s.d.) — convenção APA pt-BR, não inventa", () => {
    const out = formatCitationsApa7([rec({ year: null })]);
    expect(out).toMatch(/\(s\.?d\.?\)/i);
  });

  it("marca autor ausente sem inventar", () => {
    const out = formatCitationsApa7([rec({ authors: [] })]);
    expect(out).toContain("[autor não informado]");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/export/format-apa7.test.ts`
Expected: FAIL — `Cannot find module '@/lib/export/format-apa7'`.

- [ ] **Step 3: Implementar `format-apa7.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error citeproc não traz tipos próprios
import CSL from "citeproc";
import type { RecordDetailData } from "@/lib/record/queries";

/** Item CSL-JSON mínimo derivado do record (Marco 1). */
export interface CslItem {
  id: string;
  type: "article-journal";
  title: string;
  author?: { family: string; given?: string }[];
  issued?: { "date-parts": number[][] };
  "container-title"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
}

/** "Sobrenome, Nome" → {family, given}. Sem nome → só family. */
function splitAuthor(a: string): { family: string; given?: string } {
  const [family, given] = a.split(",").map((p) => p.trim());
  return given ? { family, given } : { family };
}

/** Mapeia um record para CSL-JSON. Campos ausentes são OMITIDOS (§II). */
export function recordToCslJson(r: RecordDetailData): CslItem {
  const item: CslItem = {
    id: r.id,
    type: "article-journal",
    title: r.title || "[título não informado]",
  };
  if (r.authors.length > 0) item.author = r.authors.map(splitAuthor);
  if (r.year !== null) item.issued = { "date-parts": [[r.year]] };
  if (r.journal) item["container-title"] = r.journal;
  if (r.volume) item.volume = r.volume;
  if (r.issue) item.issue = r.issue;
  if (r.pages) item.page = r.pages;
  if (r.doi) item.DOI = r.doi;
  return item;
}

const CSL_DIR = path.join(process.cwd(), "src/lib/export/csl");
let styleXml: string | null = null;
let localeXml: string | null = null;

function loadAssets() {
  if (styleXml === null)
    styleXml = fs.readFileSync(path.join(CSL_DIR, "apa.csl"), "utf-8");
  if (localeXml === null)
    localeXml = fs.readFileSync(
      path.join(CSL_DIR, "locales-pt-BR.xml"),
      "utf-8",
    );
}

/**
 * Lista de referências APA 7 em pt-BR (texto), ordenada pelo estilo.
 * Metadados ausentes: data → (s.d.) pelo locale; autor ausente → marcador.
 */
export function formatCitationsApa7(records: RecordDetailData[]): string {
  if (records.length === 0) return "";
  loadAssets();

  const items: Record<string, CslItem> = {};
  for (const r of records) {
    const item = recordToCslJson(r);
    if (!item.author) {
      // marcador explícito (§II): não inventa, sinaliza ausência.
      item.author = [{ family: "[autor não informado]" }];
    }
    items[item.id] = item;
  }

  const sys = {
    retrieveLocale: () => localeXml as string,
    retrieveItem: (id: string) => items[id],
  };

  const engine = new CSL.Engine(sys, styleXml as string, "pt-BR");
  engine.updateItems(Object.keys(items));
  const bib = engine.makeBibliography();
  // bib[1] = array de entradas HTML; remove tags para a lista textual.
  const entries = (bib[1] as string[]).map((e) =>
    e.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  );
  return entries.join("\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/export/format-apa7.test.ts`
Expected: PASS (4 testes). Se a ordenação/locale produzir um marcador de "sem data" diferente de `(s.d.)`, ajustar a regex do teste ao texto real que o locale pt-BR emite (não alterar a lógica — o locale é a fonte canônica).

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/format-apa7.ts tests/unit/export/format-apa7.test.ts
git commit -m "feat(export): formatCitationsApa7 via citeproc + CSL APA7 (US5, FR-022)"
```

---

## Task 3: `serialize-docx.ts` — DOCX via `docx` (FR-020)

**Files:**
- Create: `src/lib/export/serialize-docx.ts`
- Test: `tests/unit/export/serialize-docx.test.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { serializeDocx } from "@/lib/export/serialize-docx";
import type { MarkdownInput } from "@/lib/export/queries";

const input: MarkdownInput = {
  reviewTitle: "Minha Revisão",
  sections: [
    { kind: "methods", content: "Texto de métodos." },
    { kind: "results", content: "Texto de resultados." },
  ],
  characteristics: {
    columns: ["Estudo", "Amostra"],
    rows: [{ cells: { Estudo: "Silva 2021", Amostra: "120" } }],
  },
  checklist: [
    { itemCode: "1", label: "Título", sectionRef: "Métodos", status: "met" },
  ],
};

describe("serializeDocx", () => {
  it("gera um Buffer DOCX (assinatura ZIP 'PK') não-vazio", async () => {
    const buf = await serializeDocx(input, "Silva, A. (2021). Estudo.", null);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("não falha quando o PNG do fluxograma é null", async () => {
    const buf = await serializeDocx(input, "", null);
    expect(buf.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/export/serialize-docx.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `serialize-docx.ts`**

```ts
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

/** Monta o relatório completo em DOCX. prismaPng embutido se presente (FR-020). */
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/export/serialize-docx.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/serialize-docx.ts tests/unit/export/serialize-docx.test.ts
git commit -m "feat(export): serializeDocx via docx — secoes+tabelas+fluxograma (US5, FR-020)"
```

---

## Task 4: `serialize-pdf.ts` — PDF via `pdfmake` embutindo o PNG (FR-020)

**Files:**
- Create: `src/lib/export/serialize-pdf.ts`
- Test: `tests/unit/export/serialize-pdf.test.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { serializePdf } from "@/lib/export/serialize-pdf";
import type { MarkdownInput } from "@/lib/export/queries";

const input: MarkdownInput = {
  reviewTitle: "Minha Revisão",
  sections: [{ kind: "methods", content: "Texto de métodos." }],
  characteristics: { columns: ["Estudo"], rows: [{ cells: { Estudo: "Silva 2021" } }] },
  checklist: [{ itemCode: "1", label: "Título", sectionRef: "Métodos", status: "met" }],
};

describe("serializePdf", () => {
  it("gera um Buffer PDF (assinatura '%PDF-') não-vazio", async () => {
    const buf = await serializePdf(input, "Silva, A. (2021). Estudo.", null);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/export/serialize-pdf.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Localizar os `.ttf` Roboto do pacote `pdfmake`**

Run: `find node_modules/pdfmake -name 'Roboto-*.ttf'`
Anotar o diretório real — é o valor a usar em `FONT_DIR` no Step 4 (o layout varia por versão do `pdfmake`).

- [ ] **Step 4: Implementar `serialize-pdf.ts`**

```ts
import path from "node:path";
import PdfPrinter from "pdfmake";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
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

// Diretório dos .ttf Roboto confirmado no Step 3.
const FONT_DIR = path.join(process.cwd(), "node_modules/pdfmake/build/fonts");
const fonts = {
  Roboto: {
    normal: path.join(FONT_DIR, "Roboto-Regular.ttf"),
    bold: path.join(FONT_DIR, "Roboto-Medium.ttf"),
    italics: path.join(FONT_DIR, "Roboto-Italic.ttf"),
    bolditalics: path.join(FONT_DIR, "Roboto-MediumItalic.ttf"),
  },
};

/** Monta o relatório completo em PDF. prismaPng embutido se presente (FR-020). */
export async function serializePdf(
  input: MarkdownInput,
  references: string,
  prismaPng: Uint8Array | null,
): Promise<Buffer> {
  const content: Content[] = [
    { text: input.reviewTitle, style: "title", margin: [0, 0, 0, 12] },
  ];

  for (const s of input.sections) {
    content.push({ text: SECTION_TITLES[s.kind] ?? s.kind, style: "h1", margin: [0, 10, 0, 4] });
    content.push({ text: s.content });
  }

  if (prismaPng) {
    content.push({ text: "Fluxograma PRISMA 2020", style: "h1", margin: [0, 10, 0, 4] });
    const b64 = Buffer.from(prismaPng).toString("base64");
    content.push({ image: `data:image/png;base64,${b64}`, width: 480 });
  }

  const { columns, rows } = input.characteristics;
  if (columns.length > 0) {
    content.push({ text: "Tabela de características dos estudos", style: "h1", margin: [0, 10, 0, 4] });
    content.push({
      table: {
        headerRows: 1,
        body: [columns, ...rows.map((r) => columns.map((c) => String(r.cells[c] ?? "")))],
      },
    });
  }

  if (input.checklist.length > 0) {
    content.push({ text: "Checklist PRISMA 2020", style: "h1", margin: [0, 10, 0, 4] });
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
    content.push({ text: "Referências", style: "h1", margin: [0, 10, 0, 4] });
    for (const ref of references.split("\n")) content.push({ text: ref, margin: [0, 0, 0, 4] });
  }

  const docDefinition: TDocumentDefinitions = {
    content,
    defaultStyle: { font: "Roboto", fontSize: 10 },
    styles: { title: { fontSize: 18, bold: true }, h1: { fontSize: 13, bold: true } },
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
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/unit/export/serialize-pdf.test.ts`
Expected: PASS. Se falhar por caminho de fonte, corrigir `FONT_DIR` com o diretório do Step 3 e re-rodar (o teste smoke detecta isso porque `createPdfKitDocument` lança se a fonte não resolve).

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/serialize-pdf.ts tests/unit/export/serialize-pdf.test.ts
git commit -m "feat(export): serializePdf via pdfmake — embute PNG do fluxograma (US5, FR-020)"
```

---

## Task 5: Ligar `docx`/`pdf` ao worker (`serializeFormat`)

**Files:**
- Modify: `src/lib/export/batch-worker.ts`
- Test: `tests/integration/export.test.ts`

- [ ] **Step 1: Ler o estado atual de `serializeFormat` e dos mapas MIME/EXT**

Run: `grep -nE "serializeFormat|MIME|EXT|prismaPng|loadExportInputs|listIncludedFtRecordsDetail" src/lib/export/batch-worker.ts`
Confirmar: o `switch` tem `md`/`bibtex`/`ris` + `default: throw`; `MIME`/`EXT` já contêm `docx` e `pdf` (Fatia 5). Se faltarem, adicioná-los.
Conferir também a assinatura de `loadPrismaFlowModel` em `src/lib/prisma/flow-model.ts` (espera-se `(deps, reviewId)` com `deps={supabase}`).

- [ ] **Step 2: Escrever o teste de integração do worker para docx/pdf (falhando)**

Adicionar a `tests/integration/export.test.ts` (reusando o helper de seed já presente no arquivo — relatório + ≥1 `included_ft` com valor ratificado):

```ts
it("worker gera artefatos docx e pdf no bucket (FR-020)", async () => {
  const { reviewId } = await seedReviewWithReport(); // reusar o helper de seed do arquivo
  await enqueueReportExportJob(userClient, reviewId, ["docx", "pdf"]);
  await runReportExportWorkerWith(admin, reviewId);

  const { data: arts } = await admin
    .from("export_artifact")
    .select("format, storage_path")
    .eq("review_id", reviewId);
  const formats = (arts ?? []).map((a) => a.format).sort();
  expect(formats).toEqual(["docx", "pdf"]);

  for (const a of arts ?? []) {
    const { data: blob } = await admin.storage.from("exports").download(a.storage_path);
    const buf = Buffer.from(await blob!.arrayBuffer());
    if (a.format === "docx") expect(buf.subarray(0, 2).toString("ascii")).toBe("PK");
    if (a.format === "pdf") expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  }
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/integration/export.test.ts -t "docx e pdf"`
Expected: FAIL — `formato 'docx' não suportado nesta versão` (cai no `default`).

- [ ] **Step 4: Estender `serializeFormat` com os dois `case`s + helper `loadDocInputs`**

Adicionar imports no topo de `batch-worker.ts`:
```ts
import { serializeDocx } from "./serialize-docx";
import { serializePdf } from "./serialize-pdf";
import { formatCitationsApa7 } from "./format-apa7";
import { loadPrismaFlowModel } from "@/lib/prisma/flow-model";
import { renderPrismaSvg } from "@/lib/prisma/svg";
import { renderPrismaPng } from "@/lib/prisma/png";
```
(`loadExportInputs` e `listIncludedFtRecordsDetail` já são importados de `./queries` na Fatia 5; reusar.)

Helper (agrega o conteúdo canônico + referências APA7 + PNG do fluxograma):
```ts
async function loadDocInputs(supabase: SupabaseClient, reviewId: string) {
  const [input, records, flowModel] = await Promise.all([
    loadExportInputs({ supabase }, reviewId),
    listIncludedFtRecordsDetail({ supabase }, reviewId),
    loadPrismaFlowModel({ supabase }, reviewId),
  ]);
  const references = formatCitationsApa7(records);
  let prismaPng: Uint8Array | null = null;
  try {
    prismaPng = await renderPrismaPng(renderPrismaSvg(flowModel));
  } catch {
    prismaPng = null; // PNG é enriquecimento; sua falha não derruba o formato.
  }
  return { input, references, prismaPng };
}
```

Novos `case`s dentro do `switch (format)` (antes do `default`):
```ts
    case "docx": {
      const { input, references, prismaPng } = await loadDocInputs(supabase, reviewId);
      return serializeDocx(input, references, prismaPng);
    }
    case "pdf": {
      const { input, references, prismaPng } = await loadDocInputs(supabase, reviewId);
      return serializePdf(input, references, prismaPng);
    }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/integration/export.test.ts -t "docx e pdf"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/batch-worker.ts tests/integration/export.test.ts
git commit -m "feat(export): liga docx/pdf ao worker report_export (US5, FR-020/SC-005)"
```

---

## Task 6: UI — oferecer DOCX e PDF no `ExportPanel`

**Files:**
- Modify: `src/components/report/ExportPanel.tsx`

- [ ] **Step 1: Localizar a lista de formatos oferecidos**

Run: `grep -nE "md|bibtex|ris|docx|pdf|FORMAT|formats|label" src/components/report/ExportPanel.tsx`
Confirmar onde está o array de formatos selecionáveis (Fatia 5 ofereceu só `md`/`bibtex`/`ris`).

- [ ] **Step 2: Adicionar `docx` e `pdf` à seleção**

Estender o array de opções para incluir `docx` (rótulo "DOCX") e `pdf` (rótulo "PDF"), na ordem `docx, pdf, md, bibtex, ris`. Manter o componente de seleção e o fluxo `useTransition`/erro intactos — só acrescentar as duas opções.

```tsx
const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: "docx", label: "DOCX" },
  { value: "pdf", label: "PDF" },
  { value: "md", label: "Markdown" },
  { value: "bibtex", label: "BibTeX" },
  { value: "ris", label: "RIS" },
];
```
(Se a Fatia 5 já definiu `FORMAT_OPTIONS`, apenas inserir as duas primeiras linhas.)

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add src/components/report/ExportPanel.tsx
git commit -m "feat(export): ExportPanel oferece DOCX e PDF (US5)"
```

---

## Task 7: e2e SC-005 — exportar os 5 formatos numa operação

**Files:**
- Modify: `tests/e2e/export.spec.ts`

- [ ] **Step 1: Estender o cenário existente para selecionar os 5 formatos**

O `export.spec.ts` (Fatia 5) já faz: signup → cria Revisão → seed `included_ft` + valor ratificado → gera relatório → ExportPanel. Estender a seleção para `DOCX`, `PDF`, `Markdown`, `BibTeX`, `RIS`, clicar Exportar uma única vez, aguardar "Exportação concluída." e verificar **5 links de download**. Baixar o `.docx` e o `.pdf` e checar a assinatura (`PK` / `%PDF-`).

```ts
for (const label of ["DOCX", "PDF", "Markdown", "BibTeX", "RIS"]) {
  await page.getByLabel(label).check();
}
await page.getByRole("button", { name: /Exportar/ }).click();
await expect(page.getByText("Exportação concluída.")).toBeVisible({ timeout: 60_000 });
await expect(page.getByRole("link", { name: /Baixar/ })).toHaveCount(5);
```
(Ajustar seletores aos rótulos/roles reais do `ExportPanel`.)

- [ ] **Step 2: NÃO rodar Playwright nesta sessão**

Conforme memory "no-unilateral-dep-swaps-or-e2e-runs": **não** executar Playwright aqui. Deixar o teste escrito e pedir ao desenvolvedor que rode `npx playwright test tests/e2e/export.spec.ts` no merge. Registrar isso no `COMPLETION`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/export.spec.ts
git commit -m "test(export): e2e SC-005 — export dos 5 formatos numa operacao (US5)"
```

---

## Task 8: Verificação final + COMPLETION + PARAR (CHECKPOINT 3)

**Files:**
- Create: `specs/003-marco3-saida-sintese-relatorio/.superpowers/COMPLETION-fatia-6.md`
- Modify: `specs/003-marco3-saida-sintese-relatorio/.superpowers/slicing.md`

- [ ] **Step 1: Suíte completa (última fatia — gate "Pronto quando")**

Run (sequencial, conforme memory "supabase-auth-degrades-under-parallel-suite"):
```bash
supabase stop && supabase start
npx vitest run --no-file-parallelism
npm run typecheck
npm run lint
```
Expected: tudo verde. Anotar a contagem de testes.

- [ ] **Step 2: Validação A2 (fidelidade real — verificação humana)**

Gerar um DOCX e um PDF reais (via a UI em dev ou um script de smoke), **abrir o DOCX no Word** e **conferir o PDF** num leitor: fluxograma visível, tabelas legíveis, referências APA 7 corretas. Registrar o resultado no `COMPLETION` (é a entrega-núcleo do item A2). Se a fidelidade falhar, abrir `BLOCKERS.md` antes de seguir.

- [ ] **Step 3: Escrever `COMPLETION-fatia-6.md`**

Resumir: deps `docx`/`pdfmake`/`citeproc` + assets CSL; `format-apa7`, `serialize-docx`, `serialize-pdf`; wiring no `serializeFormat`; UI; e2e SC-005 (a rodar pelo dev); resultados de suíte/typecheck/lint; resultado da validação A2; cobertura US5 completa (FR-020, FR-022, SC-005); status "build completo, aguardando merge (CHECKPOINT 3)".

- [ ] **Step 4: Atualizar a tabela de tracking em `slicing.md`**

Marcar a Fatia 6 como "🔨 build completo (aguardando merge)" — **não** registrar SHA de merge (o merge é do desenvolvedor; o SHA entra após o merge manual).

- [ ] **Step 5: Commit final + PARAR**

```bash
git add specs/003-marco3-saida-sintese-relatorio/.superpowers/COMPLETION-fatia-6.md \
        specs/003-marco3-saida-sintese-relatorio/.superpowers/slicing.md
git commit -m "docs(export): COMPLETION-fatia-6 (build complete, awaiting merge)"
```

**PARAR** (CHECKPOINT 3): apresentar ao desenvolvedor o branch `build/003-marco3-saida-sintese-relatorio/6-export-docs`, o diff, e os resultados de suíte + `npm run lint` + `npm run typecheck` + a validação A2. **Não** fazer merge/push. Como esta é a **fatia terminal**, após o merge o Marco 3 está completo.

---

## Self-Review (cobertura do escopo da Fatia 6)

- **DOCX (`docx`) com seções + características + checklist + fluxograma + referências (FR-020):** Task 3 + Task 5. ✓
- **PDF (`pdfmake`) embutindo o PNG do fluxograma + tabelas + referências (FR-020):** Task 4 + Task 5. ✓
- **APA 7 (`citeproc` + CSL); metadados ausentes marcados, não inventados (FR-022, §II):** Task 2. ✓
- **Mesmo job `report_export`, resiliência por-formato preservada (FR-023):** Task 5 (só novos `case`s; `try/catch` por item intacto). ✓
- **SC-005 (5 formatos numa operação):** Task 7 (e2e) + Task 5 (worker). ✓
- **Validação A2 (abrir no Word / conferir PDF):** Task 8 Step 2. ✓
- **Suíte completa (última fatia):** Task 8 Step 1. ✓
- **Sem migration / sem LLM:** enum e job já existem; export é determinístico. ✓
- **Novas libs só por tarefa, previstas no plan:** `docx`/`pdfmake`/`citeproc` — Task 1. ✓
- **Não-regressão:** só arquivos novos + edições pontuais em `batch-worker.ts`, `ExportPanel.tsx`, `export.spec.ts`, `export.test.ts`. `prisma_svg`/`prisma_png` permanecem fora do job (rota própria da Fatia 1). ✓
- **Consistência de tipos:** `MarkdownInput`, `RecordDetailData`, `ChecklistStatus`/`ChecklistItem`, `ExportFormat`, `PrismaFlowModel` usados de forma idêntica entre `queries`, serializadores e worker. ✓

**Pendências a confirmar na execução** (não bloqueiam o plano): (a) caminho real dos `.ttf` Roboto no pacote `pdfmake` instalado (Task 4, Step 3); (b) assinatura de `loadPrismaFlowModel` (Task 5, Step 1); (c) nome do helper de seed em `export.test.ts` (Task 5, Step 2); (d) marcador exato de "sem data" emitido pelo locale pt-BR (Task 2, Step 4).
