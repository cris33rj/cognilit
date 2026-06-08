# Fatia 13 — Polish do modo Importar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa, cada
> uma em TDD. Os passos usam checkbox (`- [ ]`) para rastreio.
>
> **Escopo:** Fatia 13 do Marco 1 (`001-marco1-nucleo-fluxo`), polish de UX pós-Marco.
> Branch isolado `build/001-marco1-nucleo-fluxo/13-import-mode-polish`. A sessão
> **NUNCA** faz `git merge`/`git push` para a feature ou `main`.
> *(Planos de fatias anteriores permanecem no histórico git e em `.superpowers/`.)*

**Goal:** Corrigir três defeitos de UX do modo Importar do workbench: o seletor de
arquivo nativo sem estilo, a string de busca vazia (havendo termos já derivados por IA),
e o campo `hits` em `0` (havendo a contagem do arquivo já conhecida no preview).

**Architecture:** Um controle de arquivo estilizado (label `.btn-primary` + input real
visualmente oculto via `sr-only`, preservando `id="import-file"`) substitui o input nativo
em `ImportPanel`. A página server do workbench passa a buscar os termos de busca derivados
(`getSuggestedQuery`) e injeta como `defaultValue` de `queryString`. A composição do seed é
uma função pura `composeSuggestedQuery`. Ao parsear o arquivo, `hits` é semeado com a
contagem de registros via `setValue`. Nenhuma server action, migration ou schema muda.

**Tech Stack:** React 18 + TS strict, Next.js App Router (RSC → client), Tailwind 4
(classes `.btn-primary`/`.control` + utilitário `sr-only`), `react-hook-form` + `zod`,
Vitest + Testing Library + `@testing-library/user-event@14` (jsdom). Supabase server client
para a leitura dos termos.

**Decisões herdadas do design (slicing.md §Fatia 13, A-13.x):**
- A-13.1 — single-file mantido (nenhuma seleção múltipla; 1 arquivo = 1 `search_id`).
- A-13.2 — `query_string` semeado a partir de `eligibility_criterion kind='search_term'`
  como sugestão **editável**; só semeia se houver termos.
- A-13.3 — `hits` semeado com `preview.length` no parse, editável.

**Invariante crítico (não pode quebrar):** o input de arquivo mantém `id="import-file"`;
o e2e `tests/e2e/import.spec.ts` usa `page.setInputFiles("#import-file", ...)` e
`getByPlaceholder("String de busca"|"Base consultada"|"Nº de hits")`. `sr-only` (clip, não
`display:none`) é compatível com `setInputFiles`. Esses placeholders e o id **permanecem**.

---

## Estrutura de arquivos

- **Criar:** `src/lib/search/suggest.ts` — função pura `composeSuggestedQuery(terms: string[]): string`.
  Responsabilidade única: normalizar (trim, descartar vazios, dedup preservando ordem) e
  unir os termos com `" OR "`. Sem I/O.
- **Modificar:** `src/lib/search/queries.ts` — adiciona `getSuggestedQuery(reviewId): Promise<string>`
  (lê `eligibility_criterion` `kind='search_term'` não-rejeitados via server client e aplica
  `composeSuggestedQuery`). *(Arquivo já contém o schema `searchSchema`; ver nota na Task 4.)*
- **Modificar:** `app/reviews/[reviewId]/workbench/page.tsx` — busca `getSuggestedQuery` e
  passa `suggestedQuery` ao `<ImportPanel>`.
- **Modificar:** `src/components/workbench/ImportPanel.tsx` — nova prop `suggestedQuery`;
  controle de arquivo estilizado + nome do arquivo; `defaultValue` do `queryString`;
  `setValue("hits", ...)` no parse.
- **Criar:** `tests/unit/search/suggest.test.ts` — testes de `composeSuggestedQuery`.
- **Criar:** `tests/unit/workbench/import-panel.test.tsx` — testes do controle de arquivo,
  do seed de `queryString` e do auto-preenchimento de `hits`.

> **Nota sobre `src/lib/search/`:** hoje há `src/lib/search/schema.ts` (com `searchSchema`).
> Confirme se existe `src/lib/search/queries.ts`. Se **não** existir, **crie-o** (a Task 4
> traz o conteúdo completo, incluindo os imports). Se existir, **adicione** `getSuggestedQuery`
> sem remover o conteúdo atual.

---

## Task 1: `composeSuggestedQuery` (função pura)

**Files:**
- Create: `src/lib/search/suggest.ts`
- Test: `tests/unit/search/suggest.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// tests/unit/search/suggest.test.ts
import { describe, it, expect } from "vitest";
import { composeSuggestedQuery } from "@/lib/search/suggest";

describe("composeSuggestedQuery", () => {
  it("une termos com ' OR '", () => {
    expect(
      composeSuggestedQuery(["active learning", "flipped classroom"]),
    ).toBe("active learning OR flipped classroom");
  });

  it("faz trim, descarta vazios e deduplica preservando a ordem", () => {
    expect(
      composeSuggestedQuery(["  a ", "", "b", "a", "   ", "b"]),
    ).toBe("a OR b");
  });

  it("retorna string vazia quando não há termos úteis", () => {
    expect(composeSuggestedQuery([])).toBe("");
    expect(composeSuggestedQuery(["", "   "])).toBe("");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `npm run test -- tests/unit/search/suggest.test.ts`
Expected: FAIL — `Cannot find module '@/lib/search/suggest'`.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/search/suggest.ts

/**
 * Compõe um seed editável de string de busca a partir de termos derivados por IA
 * (FR-007 / kind='search_term'). NÃO é a query booleana final — é ponto de partida
 * que o pesquisador edita por base. Termos alternativos ⇒ unidos por " OR ".
 */
export function composeSuggestedQuery(terms: string[]): string {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const t of terms) {
    const v = t.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    cleaned.push(v);
  }
  return cleaned.join(" OR ");
}
```

- [ ] **Step 4: Rodar o teste e confirmar verde**

Run: `npm run test -- tests/unit/search/suggest.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/suggest.ts tests/unit/search/suggest.test.ts
git commit -m "feat(13): composeSuggestedQuery — seed editável da string de busca"
```

---

## Task 2: `getSuggestedQuery` (leitura server-side)

**Files:**
- Modify/Create: `src/lib/search/queries.ts`

> Esta função é uma casca fina sobre o Supabase server client; é exercitada de fato
> pelos testes da página/painel (Tasks 3–5) e pelo e2e existente. Não tem teste unitário
> dedicado (mockar `createClient` aqui só testaria o mock). A lógica testável já vive em
> `composeSuggestedQuery` (Task 1).

- [ ] **Step 1: Adicionar (ou criar) `getSuggestedQuery`**

Se `src/lib/search/queries.ts` **não existir**, crie-o com este conteúdo. Se já existir,
**acrescente** a função e o import (sem remover o que houver):

```ts
// src/lib/search/queries.ts
import { createClient } from "@/lib/supabase/server";
import { composeSuggestedQuery } from "./suggest";

/**
 * Seed da string de busca para o modo Importar: termos de busca derivados por IA
 * (kind='search_term') ainda não rejeitados, compostos como sugestão editável (A-13.2).
 * Retorna "" quando não há termos.
 */
export async function getSuggestedQuery(reviewId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eligibility_criterion")
    .select("text, ratification_state")
    .eq("review_id", reviewId)
    .eq("kind", "search_term")
    .neq("ratification_state", "rejected")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const terms = ((data ?? []) as Array<{ text: string }>).map((r) => r.text);
  return composeSuggestedQuery(terms);
}
```

- [ ] **Step 2: Verificar tipo e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/search/queries.ts
git commit -m "feat(13): getSuggestedQuery — lê termos search_term e compõe o seed"
```

---

## Task 3: `ImportPanel` aceita `suggestedQuery` e semeia `queryString`

**Files:**
- Modify: `src/components/workbench/ImportPanel.tsx`
- Test: `tests/unit/workbench/import-panel.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// tests/unit/workbench/import-panel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportPanel } from "@/components/workbench/ImportPanel";

// As server actions importadas pelo painel não devem rodar no jsdom.
vi.mock("../../../app/reviews/[reviewId]/workbench/actions", () => ({
  enqueueImport: vi.fn(),
  runImportWorker: vi.fn(),
}));
// JobProgress usa o client Supabase do browser — stub para isolar o painel.
vi.mock("@/components/workbench/JobProgress", () => ({
  JobProgress: () => null,
}));

describe("ImportPanel — seed da string de busca", () => {
  it("pré-preenche 'String de busca' com suggestedQuery", () => {
    render(
      <ImportPanel reviewId="r1" suggestedQuery="active learning OR flipped" />,
    );
    expect(screen.getByPlaceholder("String de busca")).toHaveValue(
      "active learning OR flipped",
    );
  });

  it("deixa 'String de busca' vazia quando não há seed", () => {
    render(<ImportPanel reviewId="r1" suggestedQuery="" />);
    expect(screen.getByPlaceholder("String de busca")).toHaveValue("");
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm run test -- tests/unit/workbench/import-panel.test.tsx`
Expected: FAIL — `ImportPanel` não aceita `suggestedQuery` (input fica vazio / erro de tipo).

- [ ] **Step 3: Implementar — assinatura + defaultValue**

Em `src/components/workbench/ImportPanel.tsx`, altere a assinatura e o `defaultValues`.
Adicione também `setValue` ao destructuring do `useForm` (será usado na Task 5):

```tsx
export function ImportPanel({
  reviewId,
  suggestedQuery = "",
}: {
  reviewId: string;
  suggestedQuery?: string;
}) {
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<SourceFormat | null>(null);
  const [preview, setPreview] = useState<ParsedRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const { register, handleSubmit, setValue, formState } = useForm<SearchInput>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      queryString: suggestedQuery,
      database: "",
      searchedOn: "",
      hits: 0,
    },
  });
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npm run test -- tests/unit/workbench/import-panel.test.tsx`
Expected: PASS (2 testes desta task).

- [ ] **Step 5: Commit**

```bash
git add src/components/workbench/ImportPanel.tsx tests/unit/workbench/import-panel.test.tsx
git commit -m "feat(13): ImportPanel semeia String de busca com termos derivados (A-13.2)"
```

---

## Task 4: Página do workbench injeta `suggestedQuery`

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/page.tsx`

> Página server async — coberta pelo e2e `import.spec.ts` (que continua verde). Sem
> teste unitário de RSC (não há harness para Server Components neste projeto).

- [ ] **Step 1: Importar e buscar o seed**

No topo de `app/reviews/[reviewId]/workbench/page.tsx`, adicione o import:

```tsx
import { getSuggestedQuery } from "@/lib/search/queries";
```

Dentro do componente, **após** `const active = ...`, adicione (só é usado no modo import,
mas a busca é barata e evita branch assíncrono no JSX):

```tsx
  const suggestedQuery =
    active === "import" ? await getSuggestedQuery(reviewId) : "";
```

- [ ] **Step 2: Passar a prop ao painel**

Troque a renderização do modo import:

```tsx
        {active === "import" ? (
          <ImportPanel reviewId={reviewId} suggestedQuery={suggestedQuery} />
        ) : active === "duplicates" ? (
```

- [ ] **Step 3: Verificar tipo e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "app/reviews/[reviewId]/workbench/page.tsx"
git commit -m "feat(13): workbench page injeta suggestedQuery no ImportPanel"
```

---

## Task 5: Auto-preencher `hits` com a contagem do arquivo

**Files:**
- Modify: `src/components/workbench/ImportPanel.tsx`
- Test: `tests/unit/workbench/import-panel.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao arquivo de teste já criado na Task 3 (mantém os mocks do topo):

```tsx
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const RIS_TWO = [
  "TY  - JOUR",
  "TI  - Estudo Um",
  "PY  - 2020",
  "ER  - ",
  "TY  - JOUR",
  "TI  - Estudo Dois",
  "PY  - 2021",
  "ER  - ",
  "",
].join("\n");

describe("ImportPanel — auto-preenchimento de hits", () => {
  it("preenche 'Nº de hits' com a contagem de registros do arquivo", async () => {
    const user = userEvent.setup();
    render(<ImportPanel reviewId="r1" suggestedQuery="" />);

    const file = new File([RIS_TWO], "busca.ris", { type: "text/plain" });
    const input = document.querySelector<HTMLInputElement>("#import-file")!;
    await user.upload(input, file);

    await waitFor(() =>
      expect(screen.getByPlaceholder("Nº de hits")).toHaveValue(2),
    );
  });

  it("mostra o nome do arquivo escolhido no controle", async () => {
    const user = userEvent.setup();
    render(<ImportPanel reviewId="r1" suggestedQuery="" />);

    const file = new File([RIS_TWO], "busca.ris", { type: "text/plain" });
    const input = document.querySelector<HTMLInputElement>("#import-file")!;
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByText("busca.ris")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm run test -- tests/unit/workbench/import-panel.test.tsx`
Expected: FAIL — `hits` continua 0 e não há texto `busca.ris` (controle ainda nativo).

- [ ] **Step 3: Implementar — `setValue("hits", ...)` e `fileName` no `onFile`**

Em `onFile`, registre o nome do arquivo e semeie `hits` com a contagem. Versão completa
do handler:

```tsx
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setJobId(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const fmt = formatFromName(file.name.toLowerCase());
    if (!fmt) {
      setError("Formato não suportado. Use .ris, .bib ou .csv.");
      setPreview([]);
      setFormat(null);
      return;
    }
    const text = await file.text();
    setContent(text);
    setFormat(fmt);
    const result = parseContent(fmt, text); // preview client-side (FR-014)
    setPreview(result.records);
    setValue("hits", result.records.length); // A-13.3 — default editável
    if (result.records.length === 0) {
      setError(
        result.errors[0]?.message ??
          "Nenhum registro reconhecido neste arquivo.",
      );
    }
  }
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npm run test -- tests/unit/workbench/import-panel.test.tsx`
Expected: PASS — incluindo o teste do nome do arquivo (que só fica verde após a Task 6;
se rodar isolado agora, o `toHaveValue(2)` passa e o `busca.ris` ainda falha). **Ok seguir
para a Task 6 antes de exigir verde total deste arquivo.**

- [ ] **Step 5: Commit**

```bash
git add src/components/workbench/ImportPanel.tsx tests/unit/workbench/import-panel.test.tsx
git commit -m "feat(13): auto-preenche Nº de hits com a contagem do arquivo (A-13.3)"
```

---

## Task 6: Controle de arquivo estilizado (obs 1)

**Files:**
- Modify: `src/components/workbench/ImportPanel.tsx`

> O teste "mostra o nome do arquivo escolhido" (Task 5) fica verde aqui.

- [ ] **Step 1: Substituir o bloco do input nativo pelo controle estilizado**

Troque o `<div className="flex flex-col gap-1">…</div>` que envolve o `<input type="file">`
por este bloco. **Preserva** `id="import-file"`, `accept`, `onChange`; o input vira `sr-only`
e a label `.btn-primary` é a affordance visível; um `<span>` mostra o nome do arquivo ou o
estado vazio:

```tsx
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Arquivo de referências (RIS, BibTeX ou CSV)
        </span>
        <div className="flex items-center gap-3">
          <label
            htmlFor="import-file"
            className="btn-primary cursor-pointer self-start"
          >
            Escolher arquivo
          </label>
          <span
            className="text-sm text-ink-soft"
            aria-live="polite"
            data-testid="import-file-name"
          >
            {fileName ?? "Nenhum arquivo escolhido"}
          </span>
        </div>
        <input
          id="import-file"
          type="file"
          accept=".ris,.bib,.bibtex,.csv"
          onChange={onFile}
          className="sr-only"
        />
      </div>
```

- [ ] **Step 2: Rodar os testes do painel e confirmar verde total**

Run: `npm run test -- tests/unit/workbench/import-panel.test.tsx`
Expected: PASS — todos os testes do arquivo (seed, hits, nome do arquivo).

- [ ] **Step 3: Verificar tipo e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/workbench/ImportPanel.tsx
git commit -m "feat(13): controle de arquivo estilizado preservando id=import-file (obs 1)"
```

---

## Task 7: Verificação final da fatia

**Files:** nenhum (gate).

- [ ] **Step 1: Suíte unitária completa**

Run: `npm run test -- tests/unit`
Expected: PASS — incluindo os arquivos pré-existentes (nada regrediu).

- [ ] **Step 2: e2e de importação inalterado**

Run: `npm run test:e2e -- import.spec.ts`
Expected: PASS — `#import-file`, placeholders e o contador "Identificados: 2" continuam
funcionando (o `sr-only` não impede `setInputFiles`; o seed/hits não atrapalham o fluxo,
pois o teste preenche os campos explicitamente).

> Se `npm run test:e2e` exigir o servidor/Supabase local e não estiver disponível no
> ambiente do subagente, **registre isso como desvio** no CHECKPOINT 3 (não invente verde).

- [ ] **Step 3: Lint + type-check final**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Escrever o COMPLETION da fatia**

Crie `specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-13.md` registrando:
branch, commits, o que foi feito (obs 1/2/3), decisões (A-13.x), resultado de
`test`/`lint`/`tsc` e o estado do e2e. (Mesmo padrão dos `COMPLETION-fatia-N.md`
anteriores.) Atualize o checklist em `slicing.md`:
`- [x] Fatia 13 — Polish do modo Importar (CHECKPOINT 3 — aguardando merge manual)`.

- [ ] **Step 5: Commit do COMPLETION**

```bash
git add specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-13.md \
        specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md
git commit -m "docs(13): COMPLETION + slicing state — CHECKPOINT 3, aguardando merge"
```

---

## Self-review (cobertura × design)

- **Obs 1 (controle estilizado):** Task 6 — label `.btn-primary` + `sr-only` input,
  `id="import-file"` preservado; nome do arquivo exibido (Task 5/6). ✔
- **Obs 2 (seed da string):** Tasks 1–4 — `composeSuggestedQuery` (pura) + `getSuggestedQuery`
  (server) + injeção na página + `defaultValue` no painel. ✔
- **Obs 3 (hits auto):** Task 5 — `setValue("hits", result.records.length)`. ✔
- **A-13.1 (single-file):** nenhuma mudança no `accept`/`files?.[0]`. ✔
- **Invariante e2e:** `id="import-file"` + placeholders intactos; Task 7 Step 2 valida. ✔
- **Sem migration / sem schema / sem nova dep:** nada além de leitura de
  `eligibility_criterion` (já existente). ✔
- **Consistência de nomes:** `composeSuggestedQuery`, `getSuggestedQuery`, `suggestedQuery`,
  `fileName`, `setValue`, `import-file` usados de forma idêntica entre tasks. ✔
