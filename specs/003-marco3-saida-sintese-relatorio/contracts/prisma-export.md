# Contract — PRISMA flowchart, checklist, características e exportações

**Feature**: `003-marco3-saida-sintese-relatorio` | US2/US4/US5 | FR-008..011a, FR-018..023

> O fluxograma é o **espelho** das views PRISMA (fonte única, §VI) — não recalcula. As
> exportações pesadas (DOCX/PDF/PNG) rodam no worker (§VIII), por-formato resilientes.

## Fluxograma PRISMA 2020 (US2 — `src/lib/prisma/`)

```ts
// Modelo de caixas derivado das views existentes (0007). REUSO, não recontar (§VI).
buildPrismaFlowModel(reviewId): {
  identified: number; duplicatesRemoved: number; screened: number;
  excludedScreening: number; assessedFullText: number;
  excludedFullText: Array<{ reason: string; n: number }>;  // prisma_exclusion_breakdown
  included: number;
  partial: boolean;                 // true se fases não concluídas (FR-011)
}
renderPrismaSvg(model): string      // SVG por template determinístico, read-only (FR-011a)
// Caixas de fontes fora da busca em base ficam em zero/ocultas na v1 (Q4/FR-011a).
```

- Fonte = `prisma_counter` + `prisma_exclusion_breakdown` (`security_invoker`, herdam RLS).
- **In-app**: Server Component renderiza o SVG (síncrono, leve). **Sem campos manuais.**
- **Export SVG** = serialização direta do SVG. **Export PNG** = rasterização via
  `@resvg/resvg-wasm` no worker (R2), como item do `report_export`.
- Invariante §VI: os números do SVG/PNG **conferem 100%** com os contadores do shell
  (mesma fonte) — SC-002.

## Checklist PRISMA 2020 (US4 — `prisma_checklist_item`)

```ts
computePrismaChecklist(reviewId): Array<{
  itemCode: string; label: string; sectionRef?: string;
  status: "met" | "pending" | "not_applicable";   // FR-018
}>
```

- 27 itens (seed estático, R5). `status` computado da cobertura no relatório;
  `not_applicable` para itens de fases desligadas (Viés/Certeza, D19). Snapshot gravado.

## Tabela de características (US4 — derivada, R6)

```ts
buildCharacteristicsTable(reviewId): {
  columns: string[];                         // campos do extraction_form (Marco 2)
  rows: Array<{ recordId: string; cells: Record<string, unknown> }>;  // 1 linha por estudo included_ft
}
```

- **Derivação pura** de `extraction_value` × `extraction_field` — sem tabela nova (R6).

## Exportações (US5 — job `report_export`, §VIII)

```ts
// Edge jobs-enqueue: valida + enfileira (só isso). Worker gera os artefatos.
enqueueExport(reviewId, { formats: ExportFormat[] }): { jobId: string }
type ExportFormat = "docx" | "pdf" | "md" | "bibtex" | "ris" | "prisma_svg" | "prisma_png";

// Worker (Deno) — libs puras-JS (R3/R4):
serializeMarkdown(reportContent): string                 // montagem direta
serializeDocx(reportContent): Uint8Array                 // `docx`
serializePdf(reportContent, prismaPng): Uint8Array       // `pdfmake` (embute PNG)
serializeBibtex(records): string                         // serializador próprio (R4)
serializeRis(records): string                            // serializador próprio (R4)
formatCitationsApa7(records): CslOutput                  // `citeproc` + CSL APA 7 (R4)
```

- **Item = um formato** → falha de um formato não derruba os demais (FR-023, resiliência
  por-formato). Artefatos → bucket `exports` (`export_artifact` + `storage.objects`, R8).
- DOCX/PDF embutem fluxograma (PNG), checklist e tabela de características (FR-020).
- Citações/referências em **APA 7** (FR-022); metadados ausentes são **marcados**, não
  inventados (§II). BibTeX/RIS cobrem todos os estudos `included_ft` (FR-021).

## Invariantes verificáveis
- [ ] Números do fluxograma (SVG/PNG) == contadores do shell, por construção (SC-002/§VI).
- [ ] Fluxograma read-only, sem campos manuais; fontes externas zero/ocultas (FR-011a/Q4).
- [ ] Exportação produz DOCX+PDF+MD equivalentes + BibTeX+RIS numa operação (SC-005).
- [ ] Falha de um formato não impede os outros (FR-023); job retomável (§VIII).
- [ ] RLS: `export_artifact` e bucket `exports` só acessíveis a `member` da Revisão.
- [ ] Checklist marca `not_applicable` para fases desligadas (D19/SC-009).
