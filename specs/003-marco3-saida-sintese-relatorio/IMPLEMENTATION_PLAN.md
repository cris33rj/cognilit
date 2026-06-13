# Fatia 1 — Fluxograma PRISMA 2020 (US2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Contrato Sessão B**: commitar **somente** no branch isolado
> `build/003-marco3-saida-sintese-relatorio/1-prisma-flowchart`; **nunca** merge/push para
> a feature ou `main`. Ao fim, **PARAR** (CHECKPOINT 3) e aguardar merge do usuário.

**Goal:** Renderizar o fluxograma PRISMA 2020 da Revisão como **espelho determinístico**
das views `prisma_counter`/`prisma_exclusion_breakdown` (sem recontar, §VI), exibível
in-app e exportável em SVG e PNG, read-only, com sinalização de números parciais.

**Architecture:** Núcleo **puro** (`toFlowModel` mapeia os campos das views → caixas;
`renderPrismaSvg` emite SVG determinístico) separado de uma casca **IO** fina
(`loadPrismaFlowModel` lê as views; rota de download). PNG = rasterização do mesmo SVG via
`@resvg/resvg-wasm` no **runtime Node** (A2). Nenhuma tabela nova, nenhum LLM, nenhum
bucket — download direto por route handler (precedente `audit/export`).

**Tech Stack:** TypeScript strict, Next.js 14 App Router (Server Components + route
handler Node), `@resvg/resvg-wasm` (nova lib, R2), Vitest (unit/integração), Playwright
(e2e). Reusa `src/lib/prisma/queries.ts` (`getPrismaCounters`, `getExclusionBreakdown`).

---

## Mapeamento caixa PRISMA → fonte (SC-002, por construção)

Cada caixa do fluxograma é **função pura de campos das views** — consistência
número-a-número garantida por construção (§VI). Confirme este mapeamento no CHECKPOINT 2:

| Caixa PRISMA 2020 | Valor | Fonte (view) |
|-------------------|-------|--------------|
| Registros identificados | `identified` | `prisma_counter.identified` |
| Duplicados removidos | `duplicatesRemoved` | `prisma_counter.duplicates` |
| Registros triados (T/R) | `screened` = `identified − duplicates` | derivado (entram na triagem) |
| Excluídos na triagem (T/R) | `excludedScreening` | `prisma_counter.excluded_ts` |
| Avaliados em texto completo | `assessedFullText` | `prisma_counter.passed_ts` ("assessed for eligibility") |
| Excluídos no TC, por motivo | `excludedFullText[]` | `prisma_exclusion_breakdown(reason_label, n)` |
| Estudos incluídos | `included` | `prisma_counter.included_ft` |
| `partial` (números não finais) | bool | T/R e TC concluídos? (deriva de counters) |

Caixas de **fontes externas** (literatura cinzenta, citation searching, contato com
autores) **não existem** no modelo → ficam ocultas (FR-011a/Q4).

## File Structure

| Arquivo | Responsabilidade | Ação |
|---------|------------------|------|
| `src/lib/prisma/flow-model.ts` | tipos + `toFlowModel` (puro) + `loadPrismaFlowModel` (IO) | **Criar** |
| `src/lib/prisma/svg.ts` | `renderPrismaSvg(model)` puro, determinístico, read-only | **Criar** |
| `src/lib/prisma/png.ts` | `renderPrismaPng(svg)` via resvg-wasm (Node) | **Criar** |
| `src/components/prisma/PrismaFlowchart.tsx` | Server Component: SVG + banner parcial + links de download | **Criar** |
| `app/reviews/[reviewId]/prisma/page.tsx` | página da fase: carrega modelo → renderiza | **Criar** |
| `app/reviews/[reviewId]/prisma/export/route.ts` | GET `?format=svg\|png` com guarda de membro | **Criar** |
| `app/reviews/[reviewId]/page.tsx` | link "Fluxograma PRISMA" na home da Revisão | **Modificar** |
| `package.json` | dependência `@resvg/resvg-wasm` | **Modificar** |

Testes: `tests/unit/prisma/flow-model.test.ts`, `svg.test.ts`, `png.test.ts`,
`prisma-flowchart.test.tsx`; `tests/integration/prisma-flowchart.test.ts`;
`tests/e2e/prisma-flowchart.spec.ts`.

---

### Task 1: Adicionar a dependência `@resvg/resvg-wasm`

**Files:**
- Modify: `package.json` (+ lockfile)

- [ ] **Step 1: Instalar (tarefa explícita — única nova lib desta fatia)**

Run: `npm install @resvg/resvg-wasm`
Expected: `package.json` ganha `"@resvg/resvg-wasm": "^2.x"` em `dependencies`.

- [ ] **Step 2: Verificar que o pacote expõe o wasm e a API**

Run: `node -e "const r=require('@resvg/resvg-wasm'); console.log(typeof r.Resvg, typeof r.initWasm)"`
Expected: `function function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @resvg/resvg-wasm for PRISMA PNG rasterization (Fatia 1)"
```

---

### Task 2: `toFlowModel` + tipos + `loadPrismaFlowModel`

**Files:**
- Create: `src/lib/prisma/flow-model.ts`
- Test: `tests/unit/prisma/flow-model.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/unit/prisma/flow-model.test.ts
import { describe, it, expect } from "vitest";
import { toFlowModel } from "@/lib/prisma/flow-model";
import type { PrismaCounters, ExclusionCount } from "@/lib/prisma/queries";

const counters = (over: Partial<PrismaCounters> = {}): PrismaCounters => ({
  identified: 0, duplicates: 0, screened: 0, includedTs: 0, excludedTs: 0,
  maybeTs: 0, passedTs: 0, includedFt: 0, excludedFt: 0, ...over,
});

describe("toFlowModel — espelho das views (SC-002, §VI)", () => {
  it("mapeia cada caixa a partir dos campos da view", () => {
    const breakdown: ExclusionCount[] = [
      { reasonId: "r1", reasonLabel: "Fora do escopo", n: 3 },
      { reasonId: "r2", reasonLabel: "Idioma", n: 1 },
    ];
    const m = toFlowModel(
      counters({ identified: 20, duplicates: 5, excludedTs: 6, passedTs: 9,
        includedFt: 5, excludedFt: 4, screened: 15 }),
      breakdown,
    );
    expect(m.identified).toBe(20);
    expect(m.duplicatesRemoved).toBe(5);
    expect(m.screened).toBe(15); // identified - duplicates
    expect(m.excludedScreening).toBe(6);
    expect(m.assessedFullText).toBe(9);
    expect(m.excludedFullText).toEqual([
      { reason: "Fora do escopo", n: 3 },
      { reason: "Idioma", n: 1 },
    ]);
    expect(m.included).toBe(5);
  });

  it("partial=false quando T/R e TC fecharam", () => {
    // entrou na triagem = 18; todos com decisão terminal (screened>=18); TC: passed=10, incl+excl=10
    const m = toFlowModel(
      counters({ identified: 20, duplicates: 2, screened: 18, excludedTs: 8,
        passedTs: 10, includedFt: 7, excludedFt: 3 }),
      [],
    );
    expect(m.partial).toBe(false);
  });

  it("partial=true quando ainda há registros sem decisão de T/R", () => {
    const m = toFlowModel(
      counters({ identified: 20, duplicates: 2, screened: 5, passedTs: 0 }),
      [],
    );
    expect(m.partial).toBe(true);
  });

  it("partial=true quando o texto completo não fechou", () => {
    const m = toFlowModel(
      counters({ identified: 10, duplicates: 0, screened: 10, excludedTs: 4,
        passedTs: 6, includedFt: 2, excludedFt: 1 }), // 2+1 < 6
      [],
    );
    expect(m.partial).toBe(true);
  });

  it("Revisão vazia: tudo zero e não-parcial", () => {
    const m = toFlowModel(counters(), []);
    expect(m.identified).toBe(0);
    expect(m.included).toBe(0);
    expect(m.partial).toBe(false);
    expect(m.excludedFullText).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/unit/prisma/flow-model.test.ts`
Expected: FAIL — `Cannot find module '@/lib/prisma/flow-model'`.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/prisma/flow-model.ts
import {
  getPrismaCounters,
  getExclusionBreakdown,
  type PrismaCounters,
  type ExclusionCount,
} from "./queries";

export interface ExcludedFullTextReason {
  reason: string;
  n: number;
}

/** Modelo de caixas do fluxograma PRISMA 2020 — espelho das views (§VI). */
export interface PrismaFlowModel {
  identified: number;
  duplicatesRemoved: number;
  screened: number; // registros que entraram na triagem T/R = identified - duplicates
  excludedScreening: number;
  assessedFullText: number; // "assessed for eligibility" = passed_ts
  excludedFullText: ExcludedFullTextReason[];
  included: number;
  /** true quando T/R ou TC ainda não fecharam (FR-011) — números não finais. */
  partial: boolean;
}

/** Puro: mapeia campos das views → caixas. Consistência número-a-número por construção. */
export function toFlowModel(
  counters: PrismaCounters,
  breakdown: ExclusionCount[],
): PrismaFlowModel {
  const screened = Math.max(0, counters.identified - counters.duplicates);
  const tsComplete =
    counters.identified > 0 && counters.screened >= screened;
  const ftComplete =
    counters.passedTs > 0 &&
    counters.includedFt + counters.excludedFt >= counters.passedTs;
  const partial = counters.identified > 0 ? !(tsComplete && ftComplete) : false;

  return {
    identified: counters.identified,
    duplicatesRemoved: counters.duplicates,
    screened,
    excludedScreening: counters.excludedTs,
    assessedFullText: counters.passedTs,
    excludedFullText: breakdown.map((b) => ({ reason: b.reasonLabel, n: b.n })),
    included: counters.includedFt,
    partial,
  };
}

/** IO fina: lê as views (RLS escopa) e devolve o modelo. NÃO chamar em testes de
 *  integração (usa o server client de request) — testar `toFlowModel` puro. */
export async function loadPrismaFlowModel(
  reviewId: string,
): Promise<PrismaFlowModel> {
  const [counters, breakdown] = await Promise.all([
    getPrismaCounters(reviewId),
    getExclusionBreakdown(reviewId),
  ]);
  return toFlowModel(counters, breakdown);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/unit/prisma/flow-model.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prisma/flow-model.ts tests/unit/prisma/flow-model.test.ts
git commit -m "feat(prisma): toFlowModel maps PRISMA counters to flowchart boxes (US2)"
```

---

### Task 3: `renderPrismaSvg` — SVG determinístico, read-only

**Files:**
- Create: `src/lib/prisma/svg.ts`
- Test: `tests/unit/prisma/svg.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/unit/prisma/svg.test.ts
import { describe, it, expect } from "vitest";
import { renderPrismaSvg } from "@/lib/prisma/svg";
import type { PrismaFlowModel } from "@/lib/prisma/flow-model";

const model: PrismaFlowModel = {
  identified: 20, duplicatesRemoved: 5, screened: 15, excludedScreening: 6,
  assessedFullText: 9, excludedFullText: [{ reason: "Fora do escopo", n: 3 }],
  included: 5, partial: false,
};

describe("renderPrismaSvg — espelho read-only", () => {
  it("é um SVG bem-formado com viewBox", () => {
    const svg = renderPrismaSvg(model);
    expect(svg).toMatch(/^<svg[^>]+viewBox=/);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  it("contém os números de cada caixa", () => {
    const svg = renderPrismaSvg(model);
    for (const n of ["20", "5", "15", "6", "9", "5"]) {
      expect(svg).toContain(`n = ${n}`);
    }
    expect(svg).toContain("Fora do escopo");
    expect(svg).toContain("3");
  });

  it("é read-only: sem campos editáveis", () => {
    const svg = renderPrismaSvg(model);
    expect(svg).not.toContain("<input");
    expect(svg).not.toContain("<textarea");
    expect(svg).not.toContain("contenteditable");
    expect(svg).not.toContain("<foreignObject");
  });

  it("não renderiza caixas de fontes externas (FR-011a)", () => {
    const svg = renderPrismaSvg(model);
    expect(svg).not.toMatch(/cinzenta|citation searching|contato com autores/i);
  });

  it("marca 'parcial' quando partial=true", () => {
    expect(renderPrismaSvg({ ...model, partial: true })).toMatch(/parci/i);
    expect(renderPrismaSvg(model)).not.toMatch(/parci/i);
  });

  it("é determinístico", () => {
    expect(renderPrismaSvg(model)).toBe(renderPrismaSvg(model));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/unit/prisma/svg.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/prisma/svg.ts
import type { PrismaFlowModel } from "./flow-model";

const W = 520;
const BOX_W = 360;
const BOX_H = 56;
const X = (W - BOX_W) / 2;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function box(y: number, title: string, n: number): string {
  return `<rect x="${X}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="#ffffff" stroke="#334155"/>` +
    `<text x="${W / 2}" y="${y + 22}" text-anchor="middle" font-size="13" fill="#0f172a">${esc(title)}</text>` +
    `<text x="${W / 2}" y="${y + 41}" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f172a">n = ${n}</text>`;
}

function arrow(yFrom: number, yTo: number): string {
  return `<line x1="${W / 2}" y1="${yFrom}" x2="${W / 2}" y2="${yTo}" stroke="#334155" marker-end="url(#arrow)"/>`;
}

/** Template determinístico do fluxograma PRISMA 2020. Read-only (sem inputs). */
export function renderPrismaSvg(m: PrismaFlowModel): string {
  const gap = 34;
  let y = 20;
  const parts: string[] = [];

  const stack: [string, number][] = [
    ["Registros identificados", m.identified],
    ["Registros triados (T/R)", m.screened],
    ["Avaliados em texto completo", m.assessedFullText],
    ["Estudos incluídos", m.included],
  ];

  const positions: number[] = [];
  for (let i = 0; i < stack.length; i++) {
    positions.push(y);
    if (i > 0) parts.push(arrow(positions[i - 1] + BOX_H, y));
    parts.push(box(y, stack[i][0], stack[i][1]));
    y += BOX_H + gap;
  }

  // Caixas laterais de remoção/exclusão (à direita), ligadas às etapas.
  const sideX = X + BOX_W + 24;
  const side = (yTop: number, lines: string[]): string => {
    const h = 24 + lines.length * 16;
    return `<rect x="${sideX}" y="${yTop}" width="200" height="${h}" rx="6" fill="#f8fafc" stroke="#94a3b8"/>` +
      lines.map((ln, i) =>
        `<text x="${sideX + 10}" y="${yTop + 18 + i * 16}" font-size="11" fill="#334155">${esc(ln)}</text>`,
      ).join("");
  };

  parts.push(side(positions[0] + BOX_H + 6, [`Duplicados removidos: n = ${m.duplicatesRemoved}`]));
  parts.push(side(positions[1] + BOX_H + 6, [`Excluídos (T/R): n = ${m.excludedScreening}`]));
  const ftLines = m.excludedFullText.length
    ? ["Excluídos (TC), por motivo:", ...m.excludedFullText.map((e) => `• ${e.reason}: n = ${e.n}`)]
    : ["Excluídos (TC): n = 0"];
  parts.push(side(positions[2] + BOX_H + 6, ftLines));

  const totalH = y + 20 + (m.partial ? 24 : 0);
  const banner = m.partial
    ? `<text x="${W / 2}" y="${y + 6}" text-anchor="middle" font-size="12" fill="#b45309">Números parciais — triagem em andamento.</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + 240} ${totalH}" ` +
    `role="img" aria-label="Fluxograma PRISMA 2020">` +
    `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">` +
    `<path d="M0,0 L6,3 L0,6 Z" fill="#334155"/></marker></defs>` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    parts.join("") + banner + `</svg>`
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/unit/prisma/svg.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prisma/svg.ts tests/unit/prisma/svg.test.ts
git commit -m "feat(prisma): deterministic read-only PRISMA 2020 SVG renderer (US2)"
```

---

### Task 4: `renderPrismaPng` — rasterização via resvg-wasm (Node)

**Files:**
- Create: `src/lib/prisma/png.ts`
- Test: `tests/unit/prisma/png.test.ts`

- [ ] **Step 1: Escrever o teste que falha** (ambiente Node — resvg-wasm precisa de Node)

```ts
// tests/unit/prisma/png.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderPrismaPng } from "@/lib/prisma/png";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">' +
  '<rect width="100" height="40" fill="#fff"/><text x="10" y="24">n = 5</text></svg>';

describe("renderPrismaPng — rasteriza o SVG (A2, Node)", () => {
  it("retorna bytes PNG (assinatura 0x89 P N G)", async () => {
    const png = await renderPrismaPng(SVG);
    expect(png.length).toBeGreaterThan(8);
    expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/unit/prisma/png.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/prisma/png.ts
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

let wasmReady: Promise<void> | null = null;

/** Inicializa o wasm uma única vez (lê o binário do pacote, runtime Node — A2). */
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const require = createRequire(import.meta.url);
      const wasmPath = require.resolve("@resvg/resvg-wasm/index_bg.wasm");
      const bytes = await readFile(wasmPath);
      await initWasm(bytes);
    })();
  }
  return wasmReady;
}

/** Rasteriza o SVG do fluxograma em PNG. Mesma fonte do SVG (sem recontar). */
export async function renderPrismaPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/unit/prisma/png.test.ts`
Expected: PASS. (Se o wasm não inicializar no Node do ambiente, é blocker técnico —
abrir `BLOCKERS.md` e consultar antes de trocar de lib; ver A2/§0.1 do codebase-map.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/prisma/png.ts tests/unit/prisma/png.test.ts
git commit -m "feat(prisma): rasterize PRISMA SVG to PNG via resvg-wasm (US2/A2)"
```

---

### Task 5: Componente `PrismaFlowchart` (Server Component)

**Files:**
- Create: `src/components/prisma/PrismaFlowchart.tsx`
- Test: `tests/unit/prisma/prisma-flowchart.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// tests/unit/prisma/prisma-flowchart.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrismaFlowchart } from "@/components/prisma/PrismaFlowchart";
import type { PrismaFlowModel } from "@/lib/prisma/flow-model";

const model: PrismaFlowModel = {
  identified: 20, duplicatesRemoved: 5, screened: 15, excludedScreening: 6,
  assessedFullText: 9, excludedFullText: [], included: 5, partial: false,
};

describe("PrismaFlowchart", () => {
  it("renderiza o SVG com os números e os links de download", () => {
    render(<PrismaFlowchart reviewId="rev-1" model={model} />);
    expect(screen.getByLabelText("Fluxograma PRISMA 2020")).toBeInTheDocument();
    const svg = screen.getByRole("img", { name: "Fluxograma PRISMA 2020" });
    expect(svg.outerHTML).toContain("n = 20");
    expect(screen.getByRole("link", { name: /SVG/ })).toHaveAttribute(
      "href", "/reviews/rev-1/prisma/export?format=svg",
    );
    expect(screen.getByRole("link", { name: /PNG/ })).toHaveAttribute(
      "href", "/reviews/rev-1/prisma/export?format=png",
    );
  });

  it("mostra aviso de números parciais quando partial=true", () => {
    render(<PrismaFlowchart reviewId="rev-1" model={{ ...model, partial: true }} />);
    expect(screen.getByRole("status")).toHaveTextContent(/parci/i);
  });

  it("não mostra aviso quando os números são finais", () => {
    render(<PrismaFlowchart reviewId="rev-1" model={model} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/unit/prisma/prisma-flowchart.test.tsx`
Expected: FAIL — componente inexistente.

- [ ] **Step 3: Implementar o mínimo**

```tsx
// src/components/prisma/PrismaFlowchart.tsx
import { renderPrismaSvg } from "@/lib/prisma/svg";
import type { PrismaFlowModel } from "@/lib/prisma/flow-model";

export function PrismaFlowchart({
  reviewId,
  model,
}: {
  reviewId: string;
  model: PrismaFlowModel;
}) {
  const svg = renderPrismaSvg(model);
  return (
    <section aria-label="Fluxograma PRISMA 2020">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="title-serif text-xl">Fluxograma PRISMA 2020</h1>
        <a
          className="text-sm text-ink-soft hover:text-ink"
          href={`/reviews/${reviewId}/prisma/export?format=svg`}
        >
          Baixar SVG
        </a>
        <a
          className="text-sm text-ink-soft hover:text-ink"
          href={`/reviews/${reviewId}/prisma/export?format=png`}
        >
          Baixar PNG
        </a>
      </div>
      {model.partial && (
        <p
          role="status"
          className="mb-3 rounded border border-warn bg-accent-wash px-3 py-2 text-sm text-warn"
        >
          Números parciais — a triagem ainda não foi concluída.
        </p>
      )}
      <div
        className="overflow-auto rounded border border-line bg-paper-card p-4"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/unit/prisma/prisma-flowchart.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/prisma/PrismaFlowchart.tsx tests/unit/prisma/prisma-flowchart.test.tsx
git commit -m "feat(prisma): PrismaFlowchart server component with SVG + download links (US2)"
```

---

### Task 6: Página da fase + route handler de download

**Files:**
- Create: `app/reviews/[reviewId]/prisma/page.tsx`
- Create: `app/reviews/[reviewId]/prisma/export/route.ts`
- (cobertos pela integração/e2e das Tasks 7–8)

- [ ] **Step 1: Criar a página (Server Component)**

```tsx
// app/reviews/[reviewId]/prisma/page.tsx
import { loadPrismaFlowModel } from "@/lib/prisma/flow-model";
import { PrismaFlowchart } from "@/components/prisma/PrismaFlowchart";

export const dynamic = "force-dynamic";

export default async function PrismaFlowPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const model = await loadPrismaFlowModel(reviewId); // RLS escopa via views
  return <PrismaFlowchart reviewId={reviewId} model={model} />;
}
```

- [ ] **Step 2: Criar o route handler de download (guarda de membro — espelha audit/export)**

```ts
// app/reviews/[reviewId]/prisma/export/route.ts
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPrismaFlowModel } from "@/lib/prisma/flow-model";
import { renderPrismaSvg } from "@/lib/prisma/svg";
import { renderPrismaPng } from "@/lib/prisma/png";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // resvg-wasm precisa do runtime Node (A2)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Não autenticado", { status: 401 });
  const { data: member, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !member) return new Response("Acesso negado", { status: 403 });

  const model = await loadPrismaFlowModel(reviewId);
  const svg = renderPrismaSvg(model);
  const format = req.nextUrl.searchParams.get("format") === "png" ? "png" : "svg";

  if (format === "png") {
    const png = await renderPrismaPng(svg);
    return new Response(Buffer.from(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="prisma-${reviewId}.png"`,
      },
    });
  }
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="prisma-${reviewId}.svg"`,
    },
  });
}
```

- [ ] **Step 3: Type-check (sem teste unitário próprio; cobertos por e2e)**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "app/reviews/[reviewId]/prisma/page.tsx" "app/reviews/[reviewId]/prisma/export/route.ts"
git commit -m "feat(prisma): flowchart page + SVG/PNG download route (US2)"
```

---

### Task 7: Teste de integração — fidelidade número-a-número (SC-002) + RLS

**Files:**
- Test: `tests/integration/prisma-flowchart.test.ts`

- [ ] **Step 1: Escrever o teste** (lê as views direto via client do helper; `toFlowModel` puro)

```ts
// tests/integration/prisma-flowchart.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { toFlowModel } from "@/lib/prisma/flow-model";
import type { PrismaCounters, ExclusionCount } from "@/lib/prisma/queries";

describe("fluxograma PRISMA = espelho das views (SC-002/§VI)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let intruder: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    owner = (await signUpUser(`pf_o_${crypto.randomUUID()}@example.com`, "senha-teste-123")).client;
    intruder = (await signUpUser(`pf_i_${crypto.randomUUID()}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "PRISMA flow" });
    reviewId = review.id;

    const svc = serviceClient();
    const mk = (state: string, extra: Record<string, unknown> = {}) => ({
      review_id: reviewId, source_format: "ris",
      raw: { TI: `r-${state}-${Math.random()}` }, metadata: { title: `r-${state}` },
      corpus_state: state, ...extra,
    });
    const { error } = await svc.from("record").insert([
      mk("active"),
      mk("duplicate_exact"),
      mk("included_ts", { ts_decision: "included" }),
      mk("excluded_ts", { ts_decision: "excluded" }),
      mk("included_ft", { ts_decision: "included", ft_decision: "included" }),
      mk("excluded_ft", { ts_decision: "included", ft_decision: "excluded" }),
    ]);
    if (error) throw new Error(error.message);
  });

  it("toFlowModel reproduz exatamente os campos da view", async () => {
    const { data: c } = await owner.from("prisma_counter").select("*").eq("review_id", reviewId).single();
    const { data: bk } = await owner.from("prisma_exclusion_breakdown")
      .select("reason_id, reason_label, n").eq("review_id", reviewId);

    const counters: PrismaCounters = {
      identified: c!.identified, duplicates: c!.duplicates, screened: c!.screened,
      includedTs: c!.included_ts, excludedTs: c!.excluded_ts, maybeTs: c!.maybe_ts,
      passedTs: c!.passed_ts, includedFt: c!.included_ft, excludedFt: c!.excluded_ft,
    };
    const breakdown: ExclusionCount[] = (bk ?? []).map((r) => ({
      reasonId: r.reason_id ?? "", reasonLabel: r.reason_label ?? "", n: r.n ?? 0,
    }));
    const m = toFlowModel(counters, breakdown);

    expect(m.identified).toBe(c!.identified);
    expect(m.duplicatesRemoved).toBe(c!.duplicates);
    expect(m.screened).toBe(c!.identified - c!.duplicates);
    expect(m.excludedScreening).toBe(c!.excluded_ts);
    expect(m.assessedFullText).toBe(c!.passed_ts);
    expect(m.included).toBe(c!.included_ft);
  });

  it("RLS: intruso não-membro vê linha vazia → modelo zerado", async () => {
    const { data } = await intruder.from("prisma_counter").select("identified").eq("review_id", reviewId);
    expect((data ?? []).length).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/integration/prisma-flowchart.test.ts`
Expected: PASS (2 testes). (Requer Supabase local de pé — ver quickstart.md.)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/prisma-flowchart.test.ts
git commit -m "test(prisma): integration — flow model mirrors views + RLS (SC-002)"
```

---

### Task 8: Link na home da Revisão

**Files:**
- Modify: `app/reviews/[reviewId]/page.tsx`

- [ ] **Step 1: Adicionar o link ao fluxograma (substitui o parágrafo placeholder)**

```tsx
// app/reviews/[reviewId]/page.tsx
import { notFound } from "next/navigation";
import { getReviewById } from "@/lib/reviews/queries";

export const dynamic = "force-dynamic";

export default async function ReviewHomePage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const review = await getReviewById(reviewId);
  if (!review) {
    notFound();
  }
  return (
    <section>
      <h1 className="title-serif">{review.title}</h1>
      <p className="mt-2 text-ink-soft">
        Contexto da Revisão ativa. As fases (Pergunta, Protocolo, Workbench)
        entram nas próximas fatias.
      </p>
      <p className="mt-4">
        <a
          className="text-accent-deep hover:underline"
          href={`/reviews/${reviewId}/prisma`}
        >
          Ver fluxograma PRISMA 2020
        </a>
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "app/reviews/[reviewId]/page.tsx"
git commit -m "feat(prisma): link to PRISMA flowchart from review home (US2)"
```

---

### Task 9: e2e — visualizar e baixar o fluxograma

**Files:**
- Test: `tests/e2e/prisma-flowchart.spec.ts`

- [ ] **Step 1: Escrever o teste** (espelha `shell-prisma.spec.ts`)

```ts
// tests/e2e/prisma-flowchart.spec.ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function setupReview(page: import("@playwright/test").Page) {
  const email = `e2e_prisma_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/, { timeout: 15_000 });
  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão fluxograma e2e");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/, { timeout: 10_000 });
  return page.url().split("/reviews/")[1].split("/")[0];
}

function seed(reviewId: string) {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const mk = (state: string, extra: Record<string, unknown> = {}) => ({
    review_id: reviewId, source_format: "ris", raw: { TI: `r-${state}-${Math.random()}` },
    metadata: { title: `r-${state}` }, corpus_state: state, ...extra,
  });
  return svc.from("record").insert([
    mk("active"), mk("duplicate_exact"),
    mk("included_ts", { ts_decision: "included" }),
    mk("excluded_ts", { ts_decision: "excluded" }),
  ]);
}

test("fluxograma PRISMA: visualiza e baixa SVG/PNG (US2)", async ({ page }) => {
  test.setTimeout(90_000);
  const reviewId = await setupReview(page);
  const { error } = await seed(reviewId);
  expect(error).toBeNull();

  await page.goto(`/reviews/${reviewId}/prisma`);
  const fig = page.getByRole("img", { name: "Fluxograma PRISMA 2020" });
  await expect(fig).toBeVisible({ timeout: 15_000 });
  await expect(fig).toContainText("n = 4"); // Identificados

  const svgResp = await page.request.get(`/reviews/${reviewId}/prisma/export?format=svg`);
  expect(svgResp.status()).toBe(200);
  expect(svgResp.headers()["content-type"]).toContain("image/svg+xml");
  expect(svgResp.headers()["content-disposition"]).toContain(".svg");

  const pngResp = await page.request.get(`/reviews/${reviewId}/prisma/export?format=png`);
  expect(pngResp.status()).toBe(200);
  expect(pngResp.headers()["content-type"]).toContain("image/png");
  expect(pngResp.headers()["content-disposition"]).toContain(".png");
});
```

- [ ] **Step 2: Rodar**

Run: `npx playwright test tests/e2e/prisma-flowchart.spec.ts`
Expected: PASS (1 teste). (Requer app + Supabase local — ver quickstart.md.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/prisma-flowchart.spec.ts
git commit -m "test(prisma): e2e — view flowchart + download SVG/PNG (US2)"
```

---

### Task 10: Verificação final da fatia (portões de qualidade)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: sem erros/avisos.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Unit + integração da fatia**

Run: `npx vitest run tests/unit/prisma tests/integration/prisma-flowchart.test.ts`
Expected: todos verdes.

- [ ] **Step 4: e2e da fatia**

Run: `npx playwright test tests/e2e/prisma-flowchart.spec.ts`
Expected: verde.

- [ ] **Step 5: PARAR — CHECKPOINT 3**

Apresentar ao desenvolvedor: branch `build/003-marco3-saida-sintese-relatorio/1-prisma-flowchart`,
diff acumulado, resultado de testes + `npm run lint` + `tsc --noEmit`. **Aguardar o merge
manual.** Não iniciar a Fatia 2.

---

## Self-review (cobertura da spec — Fatia 1)

| Requisito | Task |
|-----------|------|
| FR-008 (contagens derivadas das views) | 2, 7 |
| FR-009 (export SVG + PNG, mesmos números) | 3, 4, 6, 9 |
| FR-010 (exclusões TC por motivo) | 2 (mapping), 3 (render) |
| FR-011 (sinalizar números parciais) | 2 (`partial`), 3, 5 |
| FR-011a (read-only, fontes externas zero/ocultas) | 3 (testes read-only/externas) |
| SC-002 (confere 100% com a trilha) | 7 (integração) |
| §VI espelho / não recontar | 2 (consome views, sem recontagem) |
| §VIII (Edge não renderiza pesado) | n/a — sem job; PNG no route Node sob demanda (leve, 1 imagem) |

**Sem placeholders. Sem tabela nova, sem LLM, sem bucket.** Migrations: nenhuma.
Nova dependência: `@resvg/resvg-wasm` (Task 1, explícita).
