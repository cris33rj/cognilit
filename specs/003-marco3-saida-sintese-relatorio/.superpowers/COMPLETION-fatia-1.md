# Fatia 1 — Fluxograma PRISMA 2020 (US2) — COMPLETION

**Branch:** `build/003-marco3-saida-sintese-relatorio/1-prisma-flowchart` (tip `1944b1f`)
**Base:** feature HEAD `c3ae862` (Marcos 1–2 + artefatos da Sessão A do Marco 3)
**Estado:** ✅ Completa e **mergeada** na feature `003-marco3-saida-sintese-relatorio`
(merge commit `82e8990`, 2026-06-13). CHECKPOINT 3 concluído — dev fez o merge manual.

## O que foi entregue

Geração in-app do **fluxograma PRISMA 2020**, espelho número-a-número das views
`prisma_counter` / `prisma_exclusion_breakdown` (fonte única, §VI — **sem recontagem**).
`buildPrismaFlowModel` consome as views e produz o modelo de caixas (`partial:boolean`
para fases ainda abertas, FR-011; exclusões discriminadas por motivo, FR-010);
`renderPrismaSvg(model)` é um template **determinístico e read-only** (caixas de fontes
externas zero/ocultas, FR-011a). Renderização como Server Component; export **SVG**
(serialização direta) e **PNG** (`@resvg/resvg-wasm`) via **route handler de download**
— **sem bucket, sem LLM, sem migration** (consome só views herdadas). Marco 3 começa
de-riscando a rasterização cedo (insumo para A2 da Fatia 6).

## Tarefas — entrega (commits, `c3ae862..82e8990`, sem merge)

| Entrega | Commit |
|---------|--------|
| `build`: adiciona `@resvg/resvg-wasm` para rasterização PNG | `8588cb7` |
| `toFlowModel` mapeia contadores PRISMA → caixas do fluxograma (US2) | `0fbe08c` |
| Renderer SVG PRISMA 2020 determinístico e read-only (US2) | `020c6f0` |
| Rasterização SVG→PNG via resvg-wasm (US2/A2) | `9af1730` |
| Asserções non-null em `svg.ts` p/ `tsc` strict (`noUncheckedIndexedAccess`) | `9e505af` |
| `PrismaFlowchart` server component + SVG + links de download (US2) | `c9d43bc` |
| Página do fluxograma + route de download SVG/PNG (US2) | `fc0cfad` |
| Integration: modelo espelha as views + RLS (SC-002) | `8cb503a` |
| Link para o fluxograma a partir da home da revisão (US2) | `583eec0` |
| E2E: ver fluxograma + baixar SVG/PNG (US2) | `3b24e99` |
| `fix`: carregar resvg wasm Node-side sem o webpack empacotar o `.wasm` | `9005eca` |
| `fix`: carregar resvg wasm via path de `process.cwd()` p/ build prod do Next | `1944b1f` |

## Arquivos (17 alterados, +780 — todos aditivos)

- **Lógica:** `src/lib/prisma/flow-model.ts`, `src/lib/prisma/svg.ts`,
  `src/lib/prisma/png.ts`
- **UI:** `src/components/prisma/PrismaFlowchart.tsx`,
  `app/reviews/[reviewId]/prisma/page.tsx`,
  `app/reviews/[reviewId]/prisma/export/route.ts`,
  `app/reviews/[reviewId]/page.tsx` (+8, link aditivo)
- **Build:** `package.json`, `package-lock.json`, `next.config.mjs` (+5, config do wasm)
- **Testes:** `tests/unit/prisma/flow-model.test.ts`, `tests/unit/prisma/svg.test.ts`,
  `tests/unit/prisma/png.test.ts`, `tests/unit/prisma/prisma-flowchart.test.tsx`,
  `tests/integration/prisma-flowchart.test.ts`, `tests/e2e/prisma-flowchart.spec.ts`

## Portões (CHECKPOINT 3)

CHECKPOINT 3 aprovado pelo dev (merge manual `82e8990`). Cobertura de testes da fatia:
unit (views→modelo de caixas, `partial`, fontes externas ocultas; SVG; PNG; componente),
integration (números == views, RLS — SC-002) e e2e (ver fluxograma + download SVG/PNG).
`@resvg/resvg-wasm` validado no runtime Node — de-risca A2.

## Cobertura de requisitos

- **FR-008/FR-009** fluxograma PRISMA 2020 renderizado in-app — `flow-model.ts` + `svg.ts`
- **FR-010** exclusões discriminadas por motivo — `buildPrismaFlowModel`
- **FR-011** `partial` para fases abertas — modelo + template
- **FR-011a** caixas de fontes externas zero **ocultas** — `renderPrismaSvg`
- **SC-002** números == views `prisma_counter`/`prisma_exclusion_breakdown` — integration
- **§VI** espelho número-a-número, **sem recontagem**

## Não-regressão

Estritamente aditivo: nenhuma view/tabela dos Marcos 1–2 alterada; sem migration
(consome views herdadas). `page.tsx` da revisão ganha só um link; `next.config.mjs`
ganha config p/ carregar o `.wasm` Node-side. Suítes dos Marcos 1–2 intocadas.

## Fora desta fatia

Síntese (Fatia 2), relatório (Fatia 3), checklist/características (Fatia 4) e o
**embed do PNG do fluxograma** no DOCX/PDF (Fatia 6, FR-020). Persistência em Storage
não se aplica (download direto, sem bucket).

## Notas de implementação

O carregamento do `@resvg/resvg-wasm` exigiu dois fixes para conviver com o webpack do
Next: evitar que o bundler empacotasse o `.wasm` (`9005eca`) e carregá-lo por path de
`process.cwd()` para o build de produção (`1944b1f`). Precedente de download seguido:
`protocol/export/route.ts`, `audit/export/route.ts`.
