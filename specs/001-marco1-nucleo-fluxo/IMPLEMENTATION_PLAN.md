# Fatia 10 — Indicador de processamento nos gatilhos síncronos de IA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa, cada
> uma em TDD. Os passos usam checkbox (`- [ ]`) para rastreio.
>
> **Escopo:** Fatia 10 do Marco 1 (`001-marco1-nucleo-fluxo`), melhoria de UX
> pós-Marco funcional. Branch isolado
> `build/001-marco1-nucleo-fluxo/10-ai-pending-feedback`.
> A sessão **NUNCA** faz `git merge`/`git push` para a feature ou `main`.
> *(Planos de fatias anteriores permanecem no histórico git e em
> `.superpowers/COMPLETION-fatia-N.md`.)*
>
> **Não** adiciona FR nem altera decisão assinada (D). Repagina comportamento
> existente: cobre a lacuna de feedback nos dois botões que disparam chamada de LLM
> **síncrona** (sem job/polling), onde hoje, após o clique, o usuário não sabe se a
> solicitação está em curso. Detalhe da fatia em `.superpowers/slicing.md` (§"Fatia 10").

**Goal:** Dar feedback de "processando" nos botões **"Derivar por IA"**
([CriteriaPanel](../../src/components/question/CriteriaPanel.tsx)) e **"Rascunhar por
IA"** ([ProtocolEditor](../../src/components/protocol/ProtocolEditor.tsx)): enquanto a
server action de IA não resolve, o botão desabilita, exibe um spinner e troca o rótulo;
ao resolver (sucesso **ou** erro) volta ao estado normal.

**Architecture:** Um único componente cliente reusável `AsyncActionButton`
(`src/components/ai/`) encapsula o estado de pendência com `useState` + `try/finally`
(robusto em React 18, onde `useTransition` não rastreia `await` de server action).
Os dois call-sites passam a usá-lo, preservando seus rótulos, `title`, `disabled` e o
efeito colateral de `msg`. O spinner é uma classe CSS no design system
(`app/globals.css`), com `@keyframes spin` e desligamento em
`prefers-reduced-motion: reduce` (mesma estratégia das animações `pulse`/`rise` já
existentes).

**Tech Stack:** React 18 (client component, `useState`), Tailwind 4 / CSS custom
(`app/globals.css`), Vitest + Testing Library (jsdom), `@testing-library/user-event`.

---

## File Structure

- **Create:** `src/components/ai/AsyncActionButton.tsx` — botão cliente genérico que
  mostra estado de pendência durante uma ação assíncrona. Responsabilidade única:
  feedback de "processando" (disabled + `aria-busy` + spinner + rótulo de pendência).
- **Modify:** `app/globals.css` — adiciona `@keyframes spin`, a classe `.btn-spinner`
  e a regra de `prefers-reduced-motion`.
- **Modify:** `src/components/question/CriteriaPanel.tsx` — troca o `<button>` "Derivar
  por IA" pelo `AsyncActionButton`.
- **Modify:** `src/components/protocol/ProtocolEditor.tsx` — troca o `<button>`
  "Rascunhar por IA" pelo `AsyncActionButton` (os botões "Salvar rascunho" e "Travar
  protocolo" **não** mudam — fora de escopo, escritas rápidas).
- **Create:** `tests/unit/ai/async-action-button.test.tsx` — unit do componente
  (matriz pendência → sucesso/erro, `disabled`, `aria-busy`).
- **Create:** `tests/unit/question/criteria-panel.test.tsx` — fiação do "Derivar por IA".
- **Create:** `tests/unit/protocol/protocol-editor.test.tsx` — fiação do "Rascunhar por IA".

> **Fora de escopo (não tocar):** job de pré-classificação de triagem
> (`ai_screening_batch`, já observável por polling); botões Aceitar/Editar/Rejeitar
> (`SuggestionActions`, escritas rápidas de banco); estimativa de custo prévia (FR-033);
> novos FR; dark mode.

> **Nota sobre `prefers-reduced-motion`:** o jsdom não aplica CSS, então a regra de
> mídia **não** é unit-testável. Ela é verificada por leitura da regra adicionada em
> `app/globals.css` (Task 2). Os testes unitários cobrem o estado de pendência e a
> acessibilidade do botão.

---

## Task 1: Componente `AsyncActionButton` (TDD)

**Files:**
- Create: `src/components/ai/AsyncActionButton.tsx`
- Test: `tests/unit/ai/async-action-button.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// tests/unit/ai/async-action-button.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AsyncActionButton } from "@/components/ai/AsyncActionButton";

// Cria uma promise controlável: o teste decide quando ela resolve/rejeita.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AsyncActionButton", () => {
  it("mostra pendência (disabled + aria-busy + rótulo) durante a ação e restaura no sucesso", async () => {
    const user = userEvent.setup();
    const d = deferred<void>();
    const onRun = vi.fn(() => d.promise);

    render(
      <AsyncActionButton
        idleLabel="Derivar por IA"
        pendingLabel="Derivando…"
        onRun={onRun}
        className="btn-primary"
      />,
    );

    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("Derivar por IA");
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "false");

    await user.click(btn);

    // Em curso: desabilitado, aria-busy, rótulo de pendência, spinner presente.
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Derivando…");
    expect(btn.querySelector(".btn-spinner")).not.toBeNull();

    await act(async () => {
      d.resolve();
      await d.promise;
    });

    // Restaurado.
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn).toHaveAttribute("aria-busy", "false");
    expect(btn).toHaveTextContent("Derivar por IA");
    expect(btn.querySelector(".btn-spinner")).toBeNull();
  });

  it("restaura o estado mesmo quando a ação rejeita (finally)", async () => {
    const user = userEvent.setup();
    const d = deferred<void>();
    const onRun = vi.fn(() => d.promise);

    render(
      <AsyncActionButton
        idleLabel="Rascunhar por IA"
        pendingLabel="Rascunhando…"
        onRun={onRun}
      />,
    );

    const btn = screen.getByRole("button");
    await user.click(btn);
    expect(btn).toBeDisabled();

    await act(async () => {
      d.reject(new Error("falha"));
      await d.promise.catch(() => {});
    });

    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn).toHaveTextContent("Rascunhar por IA");
    expect(btn).toHaveAttribute("aria-busy", "false");
  });

  it("respeita a prop disabled e não dispara onRun", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn(() => Promise.resolve());

    render(
      <AsyncActionButton
        idleLabel="Derivar por IA"
        pendingLabel="Derivando…"
        onRun={onRun}
        disabled
      />,
    );

    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -- tests/unit/ai/async-action-button.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ai/AsyncActionButton'`.

- [ ] **Step 3: Implementação mínima**

```tsx
// src/components/ai/AsyncActionButton.tsx
"use client";

import { useState } from "react";

export function AsyncActionButton({
  onRun,
  idleLabel,
  pendingLabel,
  disabled = false,
  title,
  className,
}: {
  /** Ação assíncrona disparada pelo clique. O botão fica pendente até resolver/rejeitar. */
  onRun: () => Promise<void>;
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled || pending}
      aria-busy={pending}
      title={title}
      onClick={async () => {
        setPending(true);
        try {
          await onRun();
        } finally {
          setPending(false);
        }
      }}
      className={className}
    >
      {pending && <span className="btn-spinner" aria-hidden="true" />}
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm run test -- tests/unit/ai/async-action-button.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/AsyncActionButton.tsx tests/unit/ai/async-action-button.test.tsx
git commit -m "feat(10): AsyncActionButton com estado de pendência reusável"
```

---

## Task 2: Spinner no design system (`app/globals.css`)

**Files:**
- Modify: `app/globals.css` (acrescentar `@keyframes spin` + `.btn-spinner`; estender o
  bloco `@media (prefers-reduced-motion: reduce)` existente)

- [ ] **Step 1: Adicionar `@keyframes spin` e a classe `.btn-spinner`**

Acrescente, logo após o bloco `@keyframes rise { ... }` (atualmente terminando na
linha ~214) e **antes** do `@media (prefers-reduced-motion: reduce)`:

```css
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.btn-spinner {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-right: 0.45em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 9999px;
  vertical-align: -0.1em;
  animation: spin 0.6s linear infinite;
}
```

- [ ] **Step 2: Desligar a animação em `prefers-reduced-motion`**

Dentro do bloco `@media (prefers-reduced-motion: reduce) { ... }` já existente,
acrescente a regra do spinner (mantém o glifo visível, só sem girar):

```css
  .btn-spinner {
    animation: none;
  }
```

O bloco final deve ficar assim:

```css
@media (prefers-reduced-motion: reduce) {
  [data-rise] {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .rail-node-current {
    animation: none;
  }
  .btn-spinner {
    animation: none;
  }
}
```

- [ ] **Step 3: Verificar lint/format do CSS**

Run: `npm run lint`
Expected: PASS (sem novos avisos).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(10): classe .btn-spinner no design system (respeita reduced-motion)"
```

---

## Task 3: Fiar "Derivar por IA" no `CriteriaPanel` (TDD)

**Files:**
- Modify: `src/components/question/CriteriaPanel.tsx:37-51` (substitui o `<button>`)
- Test: `tests/unit/question/criteria-panel.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// tests/unit/question/criteria-panel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Promise controlável para a action de IA.
let resolveDerive!: (v: { ok: true; notFound: false }) => void;
vi.mock("../../../app/reviews/[reviewId]/question/actions", () => ({
  deriveCriteria: vi.fn(
    () =>
      new Promise((res) => {
        resolveDerive = res;
      }),
  ),
  ratifyCriterion: vi.fn().mockResolvedValue({ ok: true }),
}));

import { CriteriaPanel } from "@/components/question/CriteriaPanel";

describe("CriteriaPanel — feedback do 'Derivar por IA'", () => {
  it("mostra 'Derivando…' enquanto processa e a mensagem ao concluir", async () => {
    const user = userEvent.setup();
    render(<CriteriaPanel reviewId="r1" criteria={[]} canDerive />);

    const btn = screen.getByRole("button", { name: "Derivar por IA" });
    await user.click(btn);

    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Derivando…");

    await act(async () => {
      resolveDerive({ ok: true, notFound: false });
    });

    await waitFor(() =>
      expect(screen.getByText("Sugestões geradas.")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Derivar por IA" }),
    ).not.toBeDisabled();
  });

  it("mantém o botão desabilitado quando canDerive é false", () => {
    render(<CriteriaPanel reviewId="r1" criteria={[]} canDerive={false} />);
    expect(
      screen.getByRole("button", { name: "Derivar por IA" }),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -- tests/unit/question/criteria-panel.test.tsx`
Expected: FAIL — o botão atual não expõe `aria-busy`/"Derivando…" (sem estado de pendência).

- [ ] **Step 3: Trocar o `<button>` pelo `AsyncActionButton`**

Em `src/components/question/CriteriaPanel.tsx`, adicione o import e substitua o
`<button>…Derivar por IA…</button>` (linhas 37-51) pelo componente. O bloco de
import (após a linha 5) ganha:

```tsx
import { AsyncActionButton } from "@/components/ai/AsyncActionButton";
```

O cabeçalho da seção fica:

```tsx
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium text-ink">
          Critérios e termos (sugeridos pela IA)
        </h2>
        <AsyncActionButton
          idleLabel="Derivar por IA"
          pendingLabel="Derivando…"
          disabled={!canDerive}
          title={canDerive ? "" : "Salve a pergunta e cadastre a chave de IA"}
          className="btn-primary disabled:opacity-50"
          onRun={async () => {
            const r = await deriveCriteria(reviewId);
            setNotFound(!!r.ok && !!r.notFound);
            setMsg(
              r.ok ? "Sugestões geradas." : "error" in r ? r.error : "Erro",
            );
          }}
        />
        {msg && <span className="text-xs text-ink-soft">{msg}</span>}
      </div>
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm run test -- tests/unit/question/criteria-panel.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/question/CriteriaPanel.tsx tests/unit/question/criteria-panel.test.tsx
git commit -m "feat(10): feedback de pendência no 'Derivar por IA' (CriteriaPanel)"
```

---

## Task 4: Fiar "Rascunhar por IA" no `ProtocolEditor` (TDD)

**Files:**
- Modify: `src/components/protocol/ProtocolEditor.tsx:27-38` (substitui o `<button>`)
- Test: `tests/unit/protocol/protocol-editor.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// tests/unit/protocol/protocol-editor.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let resolveDraft!: (v: { ok: true }) => void;
vi.mock("../../../app/reviews/[reviewId]/protocol/actions", () => ({
  draftProtocol: vi.fn(
    () =>
      new Promise((res) => {
        resolveDraft = res;
      }),
  ),
  saveProtocolDraft: vi.fn().mockResolvedValue({ ok: true }),
  lockProtocol: vi.fn().mockResolvedValue({ ok: true }),
}));

import { ProtocolEditor } from "@/components/protocol/ProtocolEditor";

describe("ProtocolEditor — feedback do 'Rascunhar por IA'", () => {
  it("mostra 'Rascunhando…' enquanto processa e a mensagem ao concluir", async () => {
    const user = userEvent.setup();
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown=""
        locked={false}
        canDraft
      />,
    );

    const btn = screen.getByRole("button", { name: "Rascunhar por IA" });
    await user.click(btn);

    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Rascunhando…");

    await act(async () => {
      resolveDraft({ ok: true });
    });

    await waitFor(() =>
      expect(screen.getByText("Rascunho gerado pela IA.")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Rascunhar por IA" }),
    ).not.toBeDisabled();
  });

  it("mantém 'Rascunhar por IA' desabilitado quando canDraft é false", () => {
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown=""
        locked={false}
        canDraft={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Rascunhar por IA" }),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -- tests/unit/protocol/protocol-editor.test.tsx`
Expected: FAIL — o botão atual não expõe `aria-busy`/"Rascunhando…".

- [ ] **Step 3: Trocar o `<button>` "Rascunhar por IA" pelo `AsyncActionButton`**

Em `src/components/protocol/ProtocolEditor.tsx`, adicione o import (após a linha 8):

```tsx
import { AsyncActionButton } from "@/components/ai/AsyncActionButton";
```

Substitua **somente** o primeiro `<button>` (linhas 27-38, "Rascunhar por IA") por:

```tsx
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
```

Os botões "Salvar rascunho" e "Travar protocolo" **permanecem inalterados**.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm run test -- tests/unit/protocol/protocol-editor.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/protocol/ProtocolEditor.tsx tests/unit/protocol/protocol-editor.test.tsx
git commit -m "feat(10): feedback de pendência no 'Rascunhar por IA' (ProtocolEditor)"
```

---

## Task 5: Verificação final da fatia (gate de CHECKPOINT 3)

**Files:** nenhum (verificação).

- [ ] **Step 1: Suite unit completa verde**

Run: `npm run test -- tests/unit`
Expected: PASS — incluindo os 7 novos testes (3 + 2 + 2) e **sem regressão** nas
suites existentes (`question-form`, `suggestion-chip`, etc.).

- [ ] **Step 2: Lint limpo**

Run: `npm run lint`
Expected: PASS (0 erros).

- [ ] **Step 3: Type-check limpo**

Run: `npx tsc --noEmit`
Expected: PASS (0 erros).

- [ ] **Step 4: Commit de fechamento (se houver ajuste pendente)**

```bash
git add -A
git commit -m "chore(10): fatia 10 verde — lint + tsc + unit" --allow-empty
```

> **PARAR — CHECKPOINT 3.** Apresentar ao desenvolvedor: branch
> `build/001-marco1-nucleo-fluxo/10-ai-pending-feedback`, o diff, e o resultado de
> `npm run test -- tests/unit` + `npm run lint` + `npx tsc --noEmit`. **Aguardar o
> merge manual.** Não iniciar nenhuma outra fatia.

---

## Self-Review

**1. Cobertura do escopo (slicing §"Fatia 10"):**
- "estado de pendência nos dois botões síncronos de IA" → Tasks 3 e 4.
- "desabilita, troca rótulo / spinner" → Task 1 (mecanismo) + Task 2 (spinner CSS).
- "respeita `prefers-reduced-motion`" → Task 2 Step 2 (regra CSS; nota sobre não ser
  unit-testável em jsdom).
- "padrão reusável alinhado a `src/components/ai/`" → `AsyncActionButton` em
  `src/components/ai/` (Task 1).
- "testes: desabilita/exibe pendência; volta ao normal em sucesso **e** erro" → Task 1
  (matriz sucesso/erro/disabled) + Tasks 3/4 (fiação).
- "não entra: FR-033, job de triagem, Aceitar/Editar/Rejeitar, novos FR" → respeitado;
  nenhum desses arquivos é tocado.

**2. Varredura de placeholders:** nenhum "TBD/TODO"; todo passo de código mostra o
código completo; comandos com saída esperada.

**3. Consistência de tipos/nomes:** `AsyncActionButton` usa as props
`onRun/idleLabel/pendingLabel/disabled/title/className` de forma idêntica em Task 1,
3 e 4. A classe `.btn-spinner` (Task 2) bate com o `querySelector(".btn-spinner")`
(Task 1) e com o `<span className="btn-spinner">` do componente. Rótulos de pendência
("Derivando…", "Rascunhando…") consistentes entre componente e testes.
