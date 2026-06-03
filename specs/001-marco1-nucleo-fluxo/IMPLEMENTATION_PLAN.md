# Fatia 7 — Design System + Polish Visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Escopo:** **Fatia 7** (transversal de UI, pós-Marco funcional) do Marco 1
> (`001-marco1-nucleo-fluxo`). Fronteiras e gate em
> [.superpowers/slicing.md](./.superpowers/slicing.md). Repagina o que já existe sob
> a identidade do protótipo aprovado
> ([docs/prototypes/protocolo-spider.html](../../docs/prototypes/protocolo-spider.html)).
> **NÃO** adiciona FR de produto, **não** muda copy/rotas/comportamento, **não**
> implementa dark mode (só estrutura tokens para ele).
> *(O plano da Fatia 6 permanece no histórico git e em `.superpowers/COMPLETION-fatia-6.md`.)*
>
> **Branch de trabalho:** `build/001-marco1-nucleo-fluxo/7-design-system-polish`
> (criar via `superpowers:using-git-worktrees`). A sessão **NUNCA** faz `git merge`
> nem `git push` — merge manual do desenvolvedor no CHECKPOINT 3.
>
> **⚠️ Antes de despachar subagentes:** comite este `IMPLEMENTATION_PLAN.md` e o
> `slicing.md` **dentro do worktree da fatia** antes de executar — edições
> não-commitadas no checkout principal não são visíveis aos subagentes do worktree.

**Goal:** Aplicar um design system coeso ("instrumento de pesquisa editorial") a todas
as páginas e componentes já entregues, sem alterar comportamento nem quebrar testes.

**Architecture:** Tailwind 4 com tokens em `@theme` (cores + fontes) e classes de
componente em `@layer components` no `globals.css`, espelhando o protótipo. Fontes via
`next/font` (self-hosted). Os componentes existentes trocam utilitários soltos pelas
classes do design system; nenhum primitivo React novo. Iniciais marginais + expansão de
acrônimo por framework no `QuestionForm`.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript strict, Tailwind CSS 4,
`next/font/google`, Vitest + Testing Library (jsdom), Playwright.

---

## INVARIANTE CENTRAL (gate da fatia)

A repaginação **só troca `className` e adiciona wrappers visuais**. É **proibido**
remover/renomear ou alterar:

- **Textos visíveis e formato**: contadores PRISMA (`Identificados: N`, `Duplicados: N`,
  `Triados: N`, `Incluídos (T/R): N`, `Incluídos (TC): N`, `Excluídos (TC): N`), consumo
  (`Consumo de IA — entrada: N tokens · saída: N tokens`, `Nenhum job em andamento.`),
  exports (`Exportar auditoria (JSON)`, `CSV`), labels de framework e de campo pt-BR.
- **Atributos/roles**: `aria-label` (`"Revisão ativa"`, `"Contadores PRISMA"`,
  `"Trilho de fases"`, `"Modos do workbench"`, `"Jobs e consumo"`), `role="tab"`/`"tablist"`,
  `aria-selected`, `aria-current="step"`, `aria-live="polite"`, `data-status`,
  `data-ai-state`, e `disabled={!hydrated}` no `ReviewSwitcher`.

**Regra de teste por tarefa de restyle:** rodar a suite de regressão indicada **antes**
(verde) e **depois** (continua verde). Quebra por texto/atributo = invariante violada,
corrigir mantendo o gancho — nunca editando o teste para acomodar a mudança visual.

**Comandos globais:** `npm test` · `npm run lint` · `npm run typecheck` ·
`npm run test:e2e` (e2e exige Supabase local + app; rodar no CHECKPOINT 3).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `app/globals.css` | **Núcleo**: tokens `@theme` + classes `@layer components`. |
| `app/layout.tsx` | Carregar 3 fontes via `next/font`, expor CSS vars, classes base do `body`. |
| `src/components/question/QuestionForm.tsx` | Iniciais marginais + expansão de acrônimo. |
| `tests/unit/question/question-form.test.tsx` | **Novo** teste de componente (acrônimos). |
| `app/reviews/[reviewId]/layout.tsx` | Shell: header + grid 3 colunas. |
| `src/components/shell/{PhaseRail,PrismaBar,JobsPanel}.tsx` | Trilho, readout, painéis. |
| `src/components/reviews/{ReviewSwitcher,CreateReviewForm}.tsx` | Seletor (pill), form. |
| `src/components/ai/{SuggestionChip,SuggestionActions,ProvenancePopover,NotFound,ByokKeyForm}.tsx`, `state.ts` | Vocabulário visual de IA. |
| `src/components/workbench/{ModeBar,ImportPanel,ImportPreview,DuplicatesPanel,JobProgress,ScreeningQueue,ShortcutLegend}.tsx` | Workbench. |
| `src/components/{question/CriteriaPanel,protocol/ProtocolEditor,protocol/AmendmentList}.tsx` | Pergunta/Protocolo. |
| `app/page.tsx`, `app/(auth)/{login,signup}/page.tsx`, `app/reviews/page.tsx`, `app/reviews/new/page.tsx`, `app/reviews/[reviewId]/{page,question/page,protocol/page,workbench/page}.tsx` | Páginas. |

---

## Task 1: Design tokens + classes de componente (`globals.css`)

**Files:**
- Modify: `app/globals.css` (substitui o stub de 2 variáveis)

- [ ] **Step 1: Escrever o `globals.css` completo**

```css
@import "tailwindcss";

/* Dark mode por classe — placeholder; tema dark NÃO implementado nesta fatia. */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* Papel quente + tinta quente — instrumento editorial */
  --color-paper: #f4f1e9;
  --color-paper-2: #ede8db;
  --color-paper-card: #fbf9f4;
  --color-ink: #1a1a17;
  --color-ink-soft: #4a463d;
  --color-ink-faint: #8c8676;
  --color-line: #d8d2c3;
  --color-line-strong: #c3bca8;
  --color-accent: #c2461e;
  --color-accent-deep: #9e3414;
  --color-accent-wash: #f4e3d7;
  --color-done: #2c4a47;
  --color-done-wash: #dfe7e1;
  --color-warn: #b07a12;

  /* Fontes — as vars --font-* são definidas por next/font em app/layout.tsx */
  --font-serif: var(--font-fraunces), Georgia, serif;
  --font-sans: var(--font-hanken), system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;
}

:root {
  --r: 3px;
  --shadow: 0 1px 0 rgba(26, 26, 23, 0.04), 0 12px 32px -18px rgba(26, 26, 23, 0.28);
}

body {
  background-color: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans);
  background-image:
    radial-gradient(120% 80% at 80% -10%, rgba(194, 70, 30, 0.06), transparent 60%),
    radial-gradient(90% 70% at -10% 110%, rgba(44, 74, 71, 0.05), transparent 55%);
}

@layer components {
  .btn-primary {
    font-weight: 600;
    color: var(--color-paper);
    background: var(--color-ink);
    border: 1px solid var(--color-ink);
    padding: 0.6rem 1.3rem;
    border-radius: var(--r);
    cursor: pointer;
    transition: 0.18s;
    box-shadow: var(--shadow);
  }
  .btn-primary:hover {
    background: var(--color-accent-deep);
    border-color: var(--color-accent-deep);
  }

  .control {
    width: 100%;
    font-size: 0.95rem;
    color: var(--color-ink);
    background: var(--color-paper-card);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--r);
    padding: 0.6rem 0.8rem;
    transition: 0.18s;
  }
  .control:hover {
    background: #fff;
  }
  .control:focus,
  .control:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-wash);
    background: #fff;
  }

  .select-wrap {
    position: relative;
  }
  .select-wrap::after {
    content: "▾";
    position: absolute;
    right: 0.8rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-ink-faint);
    pointer-events: none;
    font-size: 0.8rem;
  }

  .panel {
    background: var(--color-paper-card);
    border: 1px solid var(--color-line);
    border-radius: var(--r);
    padding: 1.1rem 1.2rem;
    box-shadow: var(--shadow);
  }
  .panel-title {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--color-ink-faint);
    font-weight: 700;
  }

  .field {
    position: relative;
    padding-left: 3.4rem;
  }
  .field-glyph {
    position: absolute;
    left: 0;
    top: -0.15rem;
    width: 2.6rem;
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 2rem;
    line-height: 1;
    color: var(--color-line-strong);
    text-align: center;
    user-select: none;
    transition: 0.2s;
  }
  .field-glyph small {
    font-size: 1.15rem;
  }
  .field:focus-within .field-glyph {
    color: var(--color-accent);
  }

  .metric-label {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-faint);
    font-weight: 600;
  }
  .metric-value {
    font-family: var(--font-mono);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .eyebrow {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-accent);
    font-weight: 600;
  }
  .title-serif {
    font-family: var(--font-serif);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .rail-node {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    border: 1.5px solid var(--color-line-strong);
    background: var(--color-paper);
    transition: 0.18s;
  }
  .rail-node-done {
    background: var(--color-done);
    border-color: var(--color-done);
  }
  .rail-node-current {
    background: var(--color-accent);
    border-color: var(--color-accent);
    box-shadow: 0 0 0 4px var(--color-accent-wash);
    animation: pulse 2.4s ease-in-out infinite;
  }
  .rail-node-off {
    border-style: dashed;
  }
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 4px var(--color-accent-wash); }
  50% { box-shadow: 0 0 0 7px rgba(194, 70, 30, 0.08); }
}

[data-rise] {
  opacity: 0;
  transform: translateY(10px);
  animation: rise 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
}
@keyframes rise {
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  [data-rise] { animation: none; opacity: 1; transform: none; }
  .rail-node-current { animation: none; }
}
```

- [ ] **Step 2: Verificar build do CSS / type-check**

Run: `npm run typecheck && npm run lint`
Expected: PASS (sem erros; o `@theme`/`@layer` é válido no Tailwind 4).

- [ ] **Step 3: Smoke visual rápido**

Run: `npm run dev` e abrir `/` — confirmar fundo papel quente (não branco puro). Encerrar.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(ui): design tokens e classes de componente (Fatia 7)"
```

---

## Task 2: Fontes via `next/font` (`app/layout.tsx`)

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Reescrever o root layout com as 3 fontes**

```tsx
import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cognilit",
  description: "Plataforma de revisão sistemática assistida por IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${hanken.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Verificar que as fontes carregam (build offline, sem CDN runtime)**

Run: `npm run build`
Expected: PASS; `next/font` baixa as fontes em build-time (sem `<link>` externo no HTML).

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(ui): fontes Fraunces/Hanken/Plex Mono via next/font (Fatia 7)"
```

---

## Task 3: Frameworks — iniciais marginais + expansão de acrônimo (`QuestionForm`) — TDD

**Files:**
- Create: `tests/unit/question/question-form.test.tsx`
- Modify: `src/components/question/QuestionForm.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionForm } from "@/components/question/QuestionForm";

describe("QuestionForm — acrônimos por framework", () => {
  it("SPIDER: mostra as iniciais marginais e a expansão do acrônimo", () => {
    render(
      <QuestionForm
        reviewId="r1"
        initial={{ framework: "spider", question_text: "", fields: {} }}
      />,
    );
    expect(screen.getByTestId("framework-acronym")).toHaveTextContent(
      "Sample · Phenomenon of Interest · Design · Evaluation · Research type",
    );
    const glyphs = screen.getAllByTestId("field-glyph").map((g) => g.textContent);
    expect(glyphs).toEqual(["S", "PI", "D", "E", "R"]);
    expect(screen.getByText("Amostra")).toBeInTheDocument();
  });

  it("PICO: expande o próprio acrônimo com suas iniciais", () => {
    render(
      <QuestionForm
        reviewId="r1"
        initial={{ framework: "pico", question_text: "", fields: {} }}
      />,
    );
    expect(screen.getByTestId("framework-acronym")).toHaveTextContent(
      "Population · Intervention · Comparison · Outcome",
    );
    const glyphs = screen.getAllByTestId("field-glyph").map((g) => g.textContent);
    expect(glyphs).toEqual(["P", "I", "C", "O"]);
  });

  it("Livre: sem iniciais e sem expansão de acrônimo", () => {
    render(
      <QuestionForm
        reviewId="r1"
        initial={{ framework: "free", question_text: "", fields: {} }}
      />,
    );
    expect(screen.queryByTestId("framework-acronym")).toBeNull();
    expect(screen.queryAllByTestId("field-glyph")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `npm test -- tests/unit/question/question-form.test.tsx`
Expected: FAIL (`framework-acronym`/`field-glyph` ainda não existem).

- [ ] **Step 3: Implementar no `QuestionForm.tsx`**

Adicionar os dois mapas (após `FIELD_LABEL`):

```tsx
const FIELD_GLYPH: Record<string, string> = {
  sample: "S",
  phenomenon: "PI",
  design: "D",
  evaluation: "E",
  researchType: "R",
  population: "P",
  intervention: "I",
  comparison: "C",
  outcome: "O",
  exposure: "E",
  concept: "C",
  context: "C",
};

const FRAMEWORK_ACRONYM: Partial<Record<Framework, string>> = {
  spider: "Sample · Phenomenon of Interest · Design · Evaluation · Research type",
  pico: "Population · Intervention · Comparison · Outcome",
  peo: "Population · Exposure · Outcome",
  pcc: "Population · Concept · Context",
};
```

Trocar o `<select>` do framework por `.control` dentro de `.select-wrap` e, **logo após
o `</label>` do framework**, renderizar a expansão (quando houver):

```tsx
{FRAMEWORK_ACRONYM[framework] && (
  <p data-testid="framework-acronym" className="font-mono text-xs text-ink-faint">
    {FRAMEWORK_ACRONYM[framework]}
  </p>
)}
```

Trocar o `map` dos campos para usar `.field` + `.field-glyph` (preservando label e input):

```tsx
{FRAMEWORK_FIELDS[framework].map((key) => {
  const g = FIELD_GLYPH[key] ?? "";
  return (
    <label key={key} className="field flex flex-col gap-1 text-sm">
      <span data-testid="field-glyph" className="field-glyph" aria-hidden>
        {g.length > 1 ? (
          <>
            {g[0]}
            <small>{g.slice(1)}</small>
          </>
        ) : (
          g
        )}
      </span>
      {FIELD_LABEL[key] ?? key}
      <input
        value={fields[key] ?? ""}
        onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))}
        className="control"
      />
    </label>
  );
})}
```

Trocar `className="border p-2"` do textarea por `className="control"` e o botão
`bg-black px-3 py-1 text-sm text-white` por `className="btn-primary self-start"`.
(Os textos `Framework`, `Pergunta`, `Salvar pergunta`, `FIELD_LABEL`/`FRAMEWORK_LABEL`
permanecem idênticos.)

- [ ] **Step 4: Rodar o teste e confirmar verde**

Run: `npm test -- tests/unit/question/question-form.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Regressão de schema/derivação**

Run: `npm test -- tests/unit/question tests/integration/question-derivation.test.ts`
Expected: PASS (inalterado).

- [ ] **Step 6: Commit**

```bash
git add tests/unit/question/question-form.test.tsx src/components/question/QuestionForm.tsx
git commit -m "feat(question): iniciais marginais e expansão de acrônimo por framework (Fatia 7)"
```

---

## Task 4: Shell — header + grid (`app/reviews/[reviewId]/layout.tsx`)

**Files:**
- Modify: `app/reviews/[reviewId]/layout.tsx`

- [ ] **Step 1: Restyle preservando estrutura e textos**

Manter imports, `Promise.all`, e os componentes. Trocar **apenas** o JSX de apresentação:
- Header: `className="flex items-center gap-6 border-b border-line bg-paper-card/70 px-6 py-4 sticky top-0 z-20 backdrop-blur"`; wordmark `Cognilit` em `.title-serif` antes dos links; links `Minhas Revisões`/`Nova Revisão`/`Sair` mantêm `href`/`action` e texto, trocando `text-sm underline` por `text-sm text-ink-soft hover:text-ink`.
- Corpo: trocar `flex gap-6 p-6` por grid 3 colunas:
  `className="mx-auto grid max-w-[1320px] grid-cols-[248px_minmax(0,1fr)_268px] items-start"`.
- `<main className="min-w-0 flex-1">` → `<main className="min-w-0 p-8">`.

**Não** alterar: `<a href="/reviews">`, `<a href="/reviews/new">`, o `<form action="/auth/signout">`, a ordem `PrismaBar` → grid(`PhaseRail`/main/`JobsPanel`).

- [ ] **Step 2: Regressão do shell**

Run: `npm test -- tests/unit/shell/shell-components.test.tsx`
Expected: PASS (textos/estrutura preservados).

- [ ] **Step 3: Commit**

```bash
git add "app/reviews/[reviewId]/layout.tsx"
git commit -m "feat(ui): shell editorial (header + grid 3 colunas) (Fatia 7)"
```

---

## Task 5: `PhaseRail` — trilho com nós e pulse

**Files:**
- Modify: `src/components/shell/PhaseRail.tsx`

- [ ] **Step 1: Restyle preservando `STATUS_LABEL`, `data-status`, `aria-current`**

Manter os mapeamentos e a estrutura `<nav aria-label="Trilho de fases">`/`<ol>`/`<li>`.
Substituir `STATUS_CLASS` e adicionar um nó visual por item:

```tsx
const STATUS_CLASS: Record<PhaseStatus, string> = {
  done: "text-ink",
  current: "font-semibold text-accent-deep",
  pending: "text-ink-faint",
  locked: "text-warn",
  optional_off: "text-ink-faint line-through opacity-60",
};
const NODE_CLASS: Record<PhaseStatus, string> = {
  done: "rail-node rail-node-done",
  current: "rail-node rail-node-current",
  pending: "rail-node",
  locked: "rail-node",
  optional_off: "rail-node rail-node-off",
};
```

No `content`, prefixar o texto com `<span className={NODE_CLASS[p.status]} aria-hidden />`
dentro de um wrapper `flex items-start gap-3`. **Manter** `({STATUS_LABEL[p.status]})`,
`data-status={p.status}`, `aria-current`, e o `<nav aria-label="Trilho de fases" ...>`.
Trocar `w-48 shrink-0 border-r pr-4` por `border-r border-line p-6`.

- [ ] **Step 2: Regressão**

Run: `npm test -- tests/unit/shell/shell-components.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/PhaseRail.tsx
git commit -m "feat(ui): trilho de fases com nós e pulse (Fatia 7)"
```

---

## Task 6: `PrismaBar` — readout com números mono e setas de vazão

**Files:**
- Modify: `src/components/shell/PrismaBar.tsx`

- [ ] **Step 1: Restyle preservando o array `items` e os textos exatos**

**NÃO** alterar os labels (`Identificados`…`Excluídos (TC)`), o `aria-live="polite"`,
o `aria-label="Contadores PRISMA"`, nem o formato `label: N` (manter `{": "}` e `<strong>{n}</strong>`).
Trocar só as classes:
- container: `className="flex flex-wrap items-center gap-6 border-b border-line bg-gradient-to-b from-paper-2 to-paper px-6 py-2"` (mantendo `aria-live`/`aria-label`).
- cada `<span>` métrica: label em `<span className="metric-label">` e número
  `<strong className="metric-value">{n}</strong>` — **sem** mudar textos. Opcional: setas
  `→` decorativas entre itens via `aria-hidden`.

- [ ] **Step 2: Regressão (a Fatia 6 testa PRISMA número-a-número)**

Run: `npm test -- tests/unit/shell/shell-components.test.tsx`
Expected: PASS (números e labels idênticos).

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/PrismaBar.tsx
git commit -m "feat(ui): readout PRISMA com números monoespaçados (Fatia 7)"
```

---

## Task 7: `JobsPanel` — cards de IA/jobs/auditoria

**Files:**
- Modify: `src/components/shell/JobsPanel.tsx`

- [ ] **Step 1: Restyle preservando todas as strings e o `aria-label="Jobs e consumo"`**

**NÃO** alterar: `Consumo de IA — entrada: {tokensIn} tokens · saída: {tokensOut} tokens`,
`Nenhum job em andamento.`, `Exportar auditoria (JSON)`, `CSV`, nem os `href` de export.
Envolver cada bloco (consumo / jobs / auditoria) em `<div className="panel">`. Trocar
`underline` dos links por `text-accent-deep hover:underline`. Manter
`<aside aria-label="Jobs e consumo">`. (Evitar introduzir novos textos visíveis que os
e2e possam capturar por engano; wrappers visuais > novos rótulos.)

- [ ] **Step 2: Regressão**

Run: `npm test -- tests/unit/shell/shell-components.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/JobsPanel.tsx
git commit -m "feat(ui): painel de IA/jobs/auditoria em cards (Fatia 7)"
```

---

## Task 8: `ReviewSwitcher` + `CreateReviewForm`

**Files:**
- Modify: `src/components/reviews/ReviewSwitcher.tsx`, `src/components/reviews/CreateReviewForm.tsx`

- [ ] **Step 1: Restyle preservando `aria-label="Revisão ativa"` e `disabled={!hydrated}`**

`ReviewSwitcher`: envolver o `<select>` em `<span className="select-wrap">`, trocar
`border p-2` por `control appearance-none pr-8 font-semibold`. **Preservar** `aria-label`,
`disabled={!hydrated}`, `defaultValue`, `onChange`, e o comentário sobre hidratação.
`CreateReviewForm`: inputs `→ .control`, botão `→ .btn-primary`. Textos/validação intactos.

- [ ] **Step 2: Regressão**

Run: `npm test -- tests/unit tests/integration/shell-usage.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/reviews/ReviewSwitcher.tsx src/components/reviews/CreateReviewForm.tsx
git commit -m "feat(ui): seletor de revisão (pill) e form de criação (Fatia 7)"
```

---

## Task 9: Vocabulário visual de IA (`src/components/ai/` + `state.ts`)

**Files:**
- Modify: `src/components/ai/state.ts`, `SuggestionChip.tsx`, `SuggestionActions.tsx`, `ProvenancePopover.tsx`, `NotFound.tsx`, `ByokKeyForm.tsx`

- [ ] **Step 1: Tokenizar `SUGGESTION_STATE_CLASS` e restilizar**

Em `state.ts`, reescrever `SUGGESTION_STATE_CLASS` com tokens (ex.: sugerido/IA em acento:
`border-accent text-accent-deep bg-accent-wash`; aceito: `border-done text-done bg-done-wash`;
rejeitado: `border-line text-ink-faint`). **Preservar** `SUGGESTION_STATE_LABEL` (textos) e,
em `SuggestionChip`, o `data-ai-state` e a marca `✦`. Demais componentes: botões
`→ .btn-primary`/utilitárias de token, popover em `.panel`. Sem mudar textos nem `aria-*`.

- [ ] **Step 2: Regressão (há teste do chip)**

Run: `npm test -- tests/unit/ai`
Expected: PASS (`data-ai-state` e labels preservados).

- [ ] **Step 3: Commit**

```bash
git add src/components/ai
git commit -m "feat(ui): vocabulário visual de IA sob os tokens do design system (Fatia 7)"
```

---

## Task 10: Workbench (`ModeBar` + painéis)

**Files:**
- Modify: `src/components/workbench/{ModeBar,ImportPanel,ImportPreview,DuplicatesPanel,JobProgress,ScreeningQueue,ShortcutLegend}.tsx`

- [ ] **Step 1: Restyle preservando `role`/`aria-selected` e textos**

`ModeBar`: aba ativa `bg-black text-white` → `bg-ink text-paper`; inativa `hover:bg-gray-100`
→ `hover:bg-paper-2`; desabilitada `text-gray-400` → `text-ink-faint`. **Preservar**
`role="tablist"`/`role="tab"`, `aria-selected`, `aria-disabled`, `title`, `href`, labels
(`Importar`, `Duplicatas`, `Título/Resumo`, `Texto completo`). Painéis: inputs `→ .control`,
botões `→ .btn-primary`, contêineres `→ .panel`. **Preservar** textos e qualquer `data-*`
usado nos e2e de import/dedup/screening.

- [ ] **Step 2: Regressão unit do workbench**

Run: `npm test -- tests/unit/workbench`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/workbench
git commit -m "feat(ui): workbench (barra de modos + painéis) no design system (Fatia 7)"
```

---

## Task 11: Páginas restantes + Pergunta/Protocolo

**Files:**
- Modify: `app/page.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/reviews/page.tsx`, `app/reviews/new/page.tsx`, `app/reviews/[reviewId]/page.tsx`, `app/reviews/[reviewId]/{question,protocol,workbench}/page.tsx`, `src/components/question/CriteriaPanel.tsx`, `src/components/protocol/{ProtocolEditor,AmendmentList}.tsx`

- [ ] **Step 1: Aplicar tokens/classes uniformemente**

Padrão por arquivo: títulos `→ .title-serif`/`.eyebrow`; inputs/textarea/select `→ .control`
(select dentro de `.select-wrap`); botões primários `→ .btn-primary`; blocos/cartões `→ .panel`;
cores soltas (`text-gray-*`, `bg-black`, `text-red-600`…) `→` tokens (`text-ink-soft`,
`bg-ink`, `text-accent-deep`…). **Não** mudar textos, `href`, `action`, validação, nem `aria-*`.
Login/signup mantêm mensagens de erro e `name`s dos campos.

- [ ] **Step 2: Type-check + lint + unit completos**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS (todas as suites unit/integration verdes).

- [ ] **Step 3: Commit**

```bash
git add app src/components/question/CriteriaPanel.tsx src/components/protocol
git commit -m "feat(ui): páginas, pergunta e protocolo no design system (Fatia 7)"
```

---

## Task 12: Gate final — regressão e2e + visual + a11y (CHECKPOINT 3)

**Files:** nenhum (verificação)

- [ ] **Step 1: Suite completa**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 2: e2e (Supabase local + app)**

Run: `npm run test:e2e`
Expected: PASS — `tests/e2e/{import,dedup,screening,shell-prisma}.spec.ts` **inalterados**.
Se algo quebrar por texto/atributo, corrigir o componente (restaurar o gancho), **nunca** o teste.

- [ ] **Step 3: Verificação visual (browser MCP ou `npm run dev`)**

Capturar `question` (alternando os 5 frameworks — confirmar S·PI·D·E·R, P·I·C·O, P·E·O,
P·C·C e Livre sem iniciais), `protocol` e `workbench`. Confirmar a estética do protótipo
aplicada uniformemente.

- [ ] **Step 4: A11y**

Verificar contraste WCAG AA (texto ink sobre paper; accent sobre paper) e navegação por
teclado; confirmar que `prefers-reduced-motion` desliga `rise`/`pulse`.

- [ ] **Step 5: PARAR no CHECKPOINT 3**

Apresentar ao desenvolvedor: branch `build/001-marco1-nucleo-fluxo/7-design-system-polish`,
o diff, e os resultados de testes + lint + typecheck + screenshots. **Aguardar merge manual.**
**Nunca** `git merge`/`git push`.

---

## Self-Review

- **Cobertura do plano vs. plano aprovado:** ✅ tokens+fontes (T1–T2), frameworks/acrônimos
  (T3, com `free` sem iniciais), shell (T4–T8), IA (T9), workbench (T10), páginas/protocolo
  (T11), gate e2e+visual+a11y (T12).
- **Invariantes:** textos PRISMA/consumo/export, `aria-*`, `role`, `data-status`,
  `data-ai-state`, `disabled={!hydrated}` repetidos em cada tarefa relevante.
- **Consistência de nomes:** classes (`.control`, `.btn-primary`, `.panel`, `.field`/
  `.field-glyph`, `.rail-node*`, `.metric-*`, `.title-serif`, `.eyebrow`, `.select-wrap`)
  definidas em T1 e referenciadas igualmente adiante; vars de fonte (`--font-fraunces`/
  `--font-hanken`/`--font-plex-mono`) batem entre T1 (`@theme`) e T2 (`next/font`).
- **Sem deps novas:** `next/font` é nativo do Next; nada adicionado ao `package.json`.
