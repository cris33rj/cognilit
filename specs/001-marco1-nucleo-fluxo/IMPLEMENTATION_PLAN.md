# Fatia 12 — Visualização do markdown no editor de Protocolo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa, cada
> uma em TDD. Os passos usam checkbox (`- [ ]`) para rastreio.
>
> **Escopo:** Fatia 12 do Marco 1 (`001-marco1-nucleo-fluxo`), melhoria de UX
> pós-Marco. Branch isolado `build/001-marco1-nucleo-fluxo/12-protocol-markdown-preview`.
> A sessão **NUNCA** faz `git merge`/`git push` para a feature ou `main`.
> *(Planos de fatias anteriores permanecem no histórico git e em `.superpowers/`.)*

**Goal:** Dar ao editor de Protocolo PRISMA-P um modo "Visualizar" que renderiza o
markdown gerado pela IA como HTML formatado, com toggle Editar/Visualizar.

**Architecture:** Um componente puro `MarkdownPreview` (react-markdown + remark-gfm,
elementos mapeados às classes do design system, sem `rehype-raw`) consumido por
`ProtocolEditor`, que ganha estado de modo (`edit`/`preview`) e um toggle segmentado
no padrão `role="tablist"`/`tab` já usado no `ModeBar`. Toggle é puramente client-side;
nenhuma server action é tocada.

**Tech Stack:** React 18 + TS strict, Tailwind 4 (tokens `--color-*` → utilitários
`text-/bg-/border-*`), Vitest + Testing Library (jsdom), `react-markdown@^9`,
`remark-gfm@^4`.

**Decisões herdadas do design (slicing.md §Fatia 12, A-12.x):**
- A-12.1 — react-markdown + remark-gfm, `components` mapeados ao tema; **sem** `rehype-raw`.
- A-12.2 — modo inicial contextual: `locked ? "preview" : "edit"`.
- A-12.3 — preview lê o buffer vivo (`md`), incl. edições não salvas.
- A-12.4 — vazio → placeholder "Sem conteúdo.".

---

## Estrutura de arquivos

- **Criar:** `src/components/protocol/MarkdownPreview.tsx` — render puro de markdown→HTML
  temático. Props: `{ markdown: string }`. Sem estado, sem efeitos.
- **Modificar:** `src/components/protocol/ProtocolEditor.tsx` — adiciona estado `mode`,
  toggle `role="tablist"`, e troca `<textarea>`↔`<MarkdownPreview>`.
- **Criar:** `tests/unit/protocol/markdown-preview.test.tsx` — testes do componente puro.
- **Modificar:** `tests/unit/protocol/protocol-editor.test.tsx` — testes do toggle.
- **Modificar:** `package.json` / `package-lock.json` — deps `react-markdown`, `remark-gfm`.

---

## Task 1: Adicionar dependências (tarefa explícita — constitution §Portões)

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Instalar as duas dependências de runtime**

Run (na raiz do worktree da fatia):
```bash
npm install react-markdown@^9 remark-gfm@^4
```
Expected: `package.json#dependencies` passa a conter `react-markdown` e `remark-gfm`;
`package-lock.json` atualizado; `node_modules` populado.

- [ ] **Step 2: Verificar que entraram como dependencies (não devDependencies)**

Run:
```bash
node -e "const p=require('./package.json'); console.log(p.dependencies['react-markdown'], p.dependencies['remark-gfm'])"
```
Expected: imprime as duas versões (ex.: `^9.x.x ^4.x.x`), nenhuma `undefined`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(12): adiciona react-markdown + remark-gfm (preview do protocolo)"
```

---

## Task 2: Componente `MarkdownPreview` (TDD)

**Files:**
- Create: `tests/unit/protocol/markdown-preview.test.tsx`
- Create: `src/components/protocol/MarkdownPreview.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/unit/protocol/markdown-preview.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownPreview } from "@/components/protocol/MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renderiza markdown como HTML semântico (heading, item de lista, negrito)", () => {
    render(
      <MarkdownPreview markdown={"# Protocolo\n\n- item um\n\n**negrito**"} />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Protocolo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("item um").closest("li")).not.toBeNull();
    expect(screen.getByText("negrito").tagName).toBe("STRONG");
  });

  it("mostra placeholder discreto quando o conteúdo é vazio/só espaços", () => {
    render(<MarkdownPreview markdown={"   "} />);
    expect(screen.getByText("Sem conteúdo.")).toBeInTheDocument();
  });

  it("não materializa HTML cru como elemento ativo (anti-XSS, sem rehype-raw)", () => {
    const { container } = render(
      <MarkdownPreview markdown={'texto <img src=x onerror="alert(1)"> fim'} />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- tests/unit/protocol/markdown-preview.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/protocol/MarkdownPreview"`.

- [ ] **Step 3: Implementar o componente mínimo**

Criar `src/components/protocol/MarkdownPreview.tsx`:
```tsx
"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="font-serif text-2xl font-semibold text-ink">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-serif text-xl font-semibold text-ink">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-serif text-lg font-semibold text-ink">{children}</h3>
  ),
  p: ({ children }) => <p className="text-ink">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 text-ink">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 text-ink">{children}</ol>,
  li: ({ children }) => <li className="text-ink">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent pl-3 text-ink-soft">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent-deep underline"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="font-mono text-sm">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded bg-paper-2 p-3 font-mono text-sm text-ink">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <table className="w-full border-collapse text-sm text-ink">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-ink-faint px-2 py-1 text-left">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-ink-faint px-2 py-1">{children}</td>
  ),
};

export function MarkdownPreview({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <p className="text-sm text-ink-soft">Sem conteúdo.</p>;
  }
  return (
    <div
      className="flex flex-col gap-3"
      aria-label="Pré-visualização do protocolo"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- tests/unit/protocol/markdown-preview.test.tsx`
Expected: PASS (3 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/components/protocol/MarkdownPreview.tsx tests/unit/protocol/markdown-preview.test.tsx
git commit -m "feat(12): MarkdownPreview — render temático de markdown (sem rehype-raw)"
```

---

## Task 3: Toggle Editar/Visualizar no `ProtocolEditor` (TDD)

**Files:**
- Modify: `tests/unit/protocol/protocol-editor.test.tsx`
- Modify: `src/components/protocol/ProtocolEditor.tsx`

- [ ] **Step 1: Acrescentar o bloco de testes do toggle (que falha)**

Adicionar ao fim de `tests/unit/protocol/protocol-editor.test.tsx` (o mock das actions
no topo do arquivo permanece e cobre este bloco):
```tsx
describe("ProtocolEditor — toggle Editar/Visualizar", () => {
  it("alterna para Visualizar: renderiza o markdown e esconde o textarea", async () => {
    const user = userEvent.setup();
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown={"# Olá"}
        locked={false}
        canDraft
      />,
    );
    expect(
      screen.getByLabelText("Conteúdo do protocolo (Markdown)"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Olá" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Conteúdo do protocolo (Markdown)"),
    ).toBeNull();
  });

  it("protocolo travado abre em Visualizar por padrão", () => {
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown={"# Travado"}
        locked
        canDraft={false}
      />,
    );
    expect(screen.getByRole("tab", { name: "Visualizar" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Travado" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Conteúdo do protocolo (Markdown)"),
    ).toBeNull();
  });

  it("preview reflete a edição não salva do textarea (buffer vivo)", async () => {
    const user = userEvent.setup();
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown={""}
        locked={false}
        canDraft
      />,
    );
    await user.type(
      screen.getByLabelText("Conteúdo do protocolo (Markdown)"),
      "# Rascunho vivo",
    );
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Rascunho vivo" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- tests/unit/protocol/protocol-editor.test.tsx`
Expected: FAIL — não existe `tab` "Visualizar" (os 3 novos testes falham; os 2 antigos
continuam passando).

- [ ] **Step 3: Implementar o toggle no `ProtocolEditor`**

Substituir o conteúdo de `src/components/protocol/ProtocolEditor.tsx` por:
```tsx
"use client";

import { useState } from "react";
import {
  draftProtocol,
  saveProtocolDraft,
  lockProtocol,
} from "../../../app/reviews/[reviewId]/protocol/actions";
import { AsyncActionButton } from "@/components/ai/AsyncActionButton";
import { MarkdownPreview } from "@/components/protocol/MarkdownPreview";

type ViewMode = "edit" | "preview";

export function ProtocolEditor({
  reviewId,
  initialMarkdown,
  locked,
  canDraft,
}: {
  reviewId: string;
  initialMarkdown: string;
  locked: boolean;
  canDraft: boolean;
}) {
  const [md, setMd] = useState(initialMarkdown);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>(locked ? "preview" : "edit");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex gap-2">
        <AsyncActionButton
          idleLabel="Rascunhar por IA"
          pendingLabel="Rascunhando…"
          disabled={locked || !canDraft}
          title={canDraft ? "" : "Cadastre a chave de IA"}
          className="btn-primary disabled:opacity-50"
          onRun={async () => {
            const r = await draftProtocol(reviewId);
            setMsg(r.ok ? "Rascunho gerado pela IA." : (r.error ?? "Erro"));
          }}
        />
        <button
          type="button"
          disabled={locked}
          onClick={async () => {
            const r = await saveProtocolDraft(reviewId, md);
            setMsg(r.ok ? "Rascunho salvo." : (r.error ?? "Erro"));
          }}
          className="btn-primary disabled:opacity-50"
        >
          Salvar rascunho
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={async () => {
            if (
              !window.confirm(
                "Travar o protocolo? Mudanças passarão a ser emendas.",
              )
            )
              return;
            const r = await lockProtocol(reviewId);
            setMsg(r.ok ? "Protocolo travado." : (r.error ?? "Erro"));
          }}
          className="btn-primary disabled:opacity-50"
        >
          Travar protocolo
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Modo de exibição do protocolo"
        className="flex gap-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "edit"}
          onClick={() => setMode("edit")}
          className={`rounded px-3 py-1 text-sm ${
            mode === "edit" ? "bg-ink text-paper" : "hover:bg-paper-2"
          }`}
        >
          Editar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "preview"}
          onClick={() => setMode("preview")}
          className={`rounded px-3 py-1 text-sm ${
            mode === "preview" ? "bg-ink text-paper" : "hover:bg-paper-2"
          }`}
        >
          Visualizar
        </button>
      </div>

      {mode === "edit" ? (
        <textarea
          value={md}
          onChange={(e) => setMd(e.target.value)}
          readOnly={locked}
          rows={16}
          aria-label="Conteúdo do protocolo (Markdown)"
          className="control font-mono text-sm read-only:bg-paper-2"
        />
      ) : (
        <MarkdownPreview markdown={md} />
      )}

      {locked && (
        <p className="text-xs text-ink-soft">
          Protocolo travado: o conteúdo é imutável; registre mudanças como
          emendas abaixo.
        </p>
      )}
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa (arquivo do editor inteiro)**

Run: `npm test -- tests/unit/protocol/protocol-editor.test.tsx`
Expected: PASS — 5 testes (2 antigos de "Rascunhar por IA" + 3 novos do toggle).

- [ ] **Step 5: Commit**

```bash
git add src/components/protocol/ProtocolEditor.tsx tests/unit/protocol/protocol-editor.test.tsx
git commit -m "feat(12): ProtocolEditor — toggle Editar/Visualizar (default contextual)"
```

---

## Task 4: Gate de verificação da fatia

**Files:** nenhum novo (apenas verificação; corrigir inline se algo falhar).

- [ ] **Step 1: Suíte unitária inteira verde**

Run: `npm test`
Expected: PASS — todos os arquivos (os 2 novos testes da fatia + a suíte herdada
inalterada). Se algum teste herdado quebrar, é regressão desta fatia → corrigir antes
de seguir.

- [ ] **Step 2: Lint limpo**

Run: `npm run lint`
Expected: sem erros (`next lint`). Avisos pré-existentes inalterados.

- [ ] **Step 3: Type-check limpo**

Run: `npm run typecheck`
Expected: `tsc --noEmit` sem erros.

- [ ] **Step 4: Commit de fechamento (se houve ajustes) + parar no CHECKPOINT 3**

Se os steps 1–3 exigiram correções, commitar:
```bash
git add -A
git commit -m "chore(12): ajustes do gate de verificação (lint/tsc/test)"
```
Em seguida **PARAR** (CHECKPOINT 3): apresentar ao desenvolvedor o branch
`build/001-marco1-nucleo-fluxo/12-protocol-markdown-preview`, o diff, e a saída de
`npm test` + `npm run lint` + `npm run typecheck`. **Não** mergear, **não** iniciar
outra fatia.

---

## Self-review do plano (verificado)

- **Cobertura do spec (slicing §Fatia 12):** A-12.1 → Task 1+2 (deps + componente sem
  rehype-raw); A-12.2 → Task 3 (`mode = locked ? "preview" : "edit"` + teste do travado);
  A-12.3 → Task 3 (teste "buffer vivo"); A-12.4 → Task 2 (teste do placeholder). "Entra"
  (MarkdownPreview + toggle `role=tab`) → Tasks 2 e 3. Testes-chave do slicing → todos
  mapeados a um teste concreto.
- **Sem placeholders:** todo passo de código mostra o código completo; todo passo de
  comando mostra o comando e o resultado esperado.
- **Consistência de tipos/nomes:** `MarkdownPreview({ markdown })` definido na Task 2 é
  consumido com `markdown={md}` na Task 3; `ViewMode = "edit" | "preview"` usado
  uniformemente; `aria-label="Conteúdo do protocolo (Markdown)"` idêntico entre o
  componente e os testes; rótulos dos tabs ("Editar"/"Visualizar") idênticos entre
  implementação e testes.
