# Fatia 14 — Histórico de buscas importadas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa, cada
> uma em TDD. Os passos usam checkbox (`- [ ]`) para rastreio.
>
> **Escopo:** Fatia 14 do Marco 1 (`001-marco1-nucleo-fluxo`), leitura pós-Marco.
> Branch isolado `build/001-marco1-nucleo-fluxo/14-import-history-list`. A sessão
> **NUNCA** faz `git merge`/`git push` para a feature ou `main`.
> *(Planos de fatias anteriores permanecem no histórico git e em `.superpowers/`.)*

**Goal:** Mostrar, no modo Importar do workbench, uma lista **read-only** das importações
já feitas — uma linha por busca com base de dados, data da importação (`dd/mm/aaaa`) e
quantidade de artigos.

**Architecture:** Uma query server `listSearches(reviewId)` lê a tabela `search` com a
contagem de `record` embutida via PostgREST (`record(count)`) — **sem migration**. Um
componente de servidor puro `ImportHistory` recebe os dados e renderiza a lista (ou um
estado vazio). A página server do workbench busca e injeta os dados no modo Importar. As
server actions de importação já chamam `revalidatePath` do workbench, então a lista
re-renderiza após uma importação concluir. **Nenhuma reversão/edição** (descartada no
CHECKPOINT 1): só leitura. Não toca auditoria nem PRISMA.

**Tech Stack:** Next.js App Router (RSC), TS strict, Tailwind 4 (classes do design system
`.panel`/`panel-title`/`text-ink*`), Supabase server client (`supabase-js`), Vitest +
Testing Library (unit) e integração com Supabase local (`tests/integration/helpers/supabase`).

**Decisões herdadas do design (slicing.md §Fatia 14):**
- **Read-only.** Sem desfazer/reverter importação, sem editar registro de busca, sem
  expandir artigos, sem paginação/filtro. (A reversão destrutiva fica como possível fatia
  futura, com regras próprias.)
- **Single source:** a contagem vem de `record(count)` por `search_id` (estável mesmo após
  dedup, que altera `corpus_state` e **não** apaga linhas).
- **Data exibida = `created_at`** da busca (timestamp da importação), formatada
  `dd/mm/aaaa` com `toLocaleDateString("pt-BR")` (padrão do projeto, cf. `AmendmentList`).

---

## Estrutura de arquivos

- **Modificar:** `src/lib/search/queries.ts` — adiciona `SEARCH_SUMMARY_SELECT` (string do
  select PostgREST, exportada p/ o teste de integração reusar), a interface `SearchSummary`,
  a função pura `toSearchSummaries`, e a query `listSearches`. (Arquivo já existe — criado na
  Fatia 13; **acrescentar**, não remover.)
- **Criar:** `src/components/workbench/ImportHistory.tsx` — componente **de servidor** puro
  (sem `"use client"`): recebe `searches: SearchSummary[]`, renderiza lista ou estado vazio.
- **Modificar:** `app/reviews/[reviewId]/workbench/page.tsx` — busca `listSearches` no modo
  import e renderiza `<ImportHistory>` abaixo do `<ImportPanel>`.
- **Criar:** `tests/unit/search/import-history-mapper.test.ts` — testes de `toSearchSummaries`.
- **Criar:** `tests/unit/workbench/import-history.test.tsx` — testes de render do componente.
- **Criar:** `tests/integration/import-history.test.ts` — prova o embedding `record(count)`
  contra o Supabase local (uma linha por busca, contagem correta).

> **Pré-requisito de ambiente (execução):** os testes de **integração** precisam do Supabase
> local rodando e de `.env.local` **dentro do worktree** (arquivos não-versionados não são
> herdados pelo worktree — copiar da raiz). Se indisponível, registrar como **desvio** no
> CHECKPOINT 3 (não fingir verde). Os testes **unit** não precisam de Supabase.

---

## Task 1: `toSearchSummaries` + tipos + select (pura + contrato da query)

**Files:**
- Modify: `src/lib/search/queries.ts`
- Test: `tests/unit/search/import-history-mapper.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/unit/search/import-history-mapper.test.ts
import { describe, it, expect } from "vitest";
import { toSearchSummaries } from "@/lib/search/queries";

describe("toSearchSummaries", () => {
  it("mapeia campos e extrai a contagem de record(count)", () => {
    const out = toSearchSummaries([
      {
        id: "s1",
        database: "ERIC",
        created_at: "2026-05-30T10:00:00Z",
        record: [{ count: 12 }],
      },
    ]);
    expect(out).toEqual([
      {
        id: "s1",
        database: "ERIC",
        createdAt: "2026-05-30T10:00:00Z",
        recordCount: 12,
      },
    ]);
  });

  it("trata record vazio ou nulo como contagem 0", () => {
    const out = toSearchSummaries([
      { id: "a", database: "PubMed", created_at: "2026-01-01T00:00:00Z", record: [] },
      { id: "b", database: "Scopus", created_at: "2026-01-02T00:00:00Z", record: null },
    ]);
    expect(out.map((s) => s.recordCount)).toEqual([0, 0]);
  });

  it("preserva a ordem das linhas recebidas", () => {
    const out = toSearchSummaries([
      { id: "x", database: "A", created_at: "2026-01-03T00:00:00Z", record: [{ count: 1 }] },
      { id: "y", database: "B", created_at: "2026-01-02T00:00:00Z", record: [{ count: 2 }] },
    ]);
    expect(out.map((s) => s.id)).toEqual(["x", "y"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm run test -- tests/unit/search/import-history-mapper.test.ts`
Expected: FAIL — `toSearchSummaries` não existe.

- [ ] **Step 3: Implementar — acrescentar ao fim de `src/lib/search/queries.ts`**

Não remova nada do arquivo (ele já tem `getSuggestedQuery`/`composeSuggestedQuery`).
Acrescente:

```ts
/** Select PostgREST do histórico: campos da busca + contagem embutida de records. */
export const SEARCH_SUMMARY_SELECT = "id, database, created_at, record(count)";

export interface SearchSummary {
  id: string;
  database: string;
  createdAt: string;
  recordCount: number;
}

interface RawSearchRow {
  id: string;
  database: string;
  created_at: string;
  record: { count: number }[] | null;
}

/**
 * Achata as linhas do `SEARCH_SUMMARY_SELECT` em `SearchSummary`. Função pura: extrai a
 * contagem de `record(count)` (`record[0].count`, ou 0 quando ausente). Sem I/O.
 */
export function toSearchSummaries(rows: RawSearchRow[]): SearchSummary[] {
  return rows.map((r) => ({
    id: r.id,
    database: r.database,
    createdAt: r.created_at,
    recordCount: r.record?.[0]?.count ?? 0,
  }));
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npm run test -- tests/unit/search/import-history-mapper.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Verificar tipo e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/search/queries.ts tests/unit/search/import-history-mapper.test.ts
git commit -m "feat(14): toSearchSummaries + SEARCH_SUMMARY_SELECT (contagem por busca)"
```

---

## Task 2: `listSearches` (leitura server-side)

**Files:**
- Modify: `src/lib/search/queries.ts`

> Casca fina sobre o Supabase server client (usa `cookies()` indiretamente) — **não** tem
> teste unitário direto (o mapper já é testado na Task 1; o embedding é provado na Task 5).
> Segue o padrão de `src/lib/dedup/queries.ts`.

- [ ] **Step 1: Acrescentar `listSearches` ao fim de `src/lib/search/queries.ts`**

```ts
/**
 * Histórico de importações da Revisão (Fatia 14, read-only): uma linha por `search`,
 * mais recente primeiro, com a contagem de `record` associada. RLS cobre por membership.
 */
export async function listSearches(reviewId: string): Promise<SearchSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("search")
    .select(SEARCH_SUMMARY_SELECT)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // Embedded-count select widens the inferred type além das generics do supabase-js.
  return toSearchSummaries((data ?? []) as unknown as RawSearchRow[]);
}
```

(`createClient` já está importado no topo do arquivo desde a Fatia 13 — não duplicar.)

- [ ] **Step 2: Verificar tipo e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/search/queries.ts
git commit -m "feat(14): listSearches — histórico de buscas com contagem (read-only)"
```

---

## Task 3: Componente `ImportHistory` (servidor, puro)

**Files:**
- Create: `src/components/workbench/ImportHistory.tsx`
- Test: `tests/unit/workbench/import-history.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// tests/unit/workbench/import-history.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportHistory } from "@/components/workbench/ImportHistory";
import type { SearchSummary } from "@/lib/search/queries";

const SEARCHES: SearchSummary[] = [
  {
    id: "s1",
    database: "ERIC",
    createdAt: "2026-05-30T12:00:00Z",
    recordCount: 12,
  },
  {
    id: "s2",
    database: "PubMed",
    createdAt: "2026-04-02T12:00:00Z",
    recordCount: 5,
  },
];

describe("ImportHistory", () => {
  it("mostra uma linha por importação com base, data dd/mm/aaaa e contagem", () => {
    render(<ImportHistory searches={SEARCHES} />);
    expect(screen.getByText("ERIC")).toBeInTheDocument();
    expect(screen.getByText("PubMed")).toBeInTheDocument();
    // datas no formato dd/mm/aaaa (sem fixar TZ — checa o formato e o ano)
    const dates = screen.getAllByText(/\d{2}\/\d{2}\/\d{4}/);
    expect(dates).toHaveLength(2);
    // contagens exibidas
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it("mostra estado vazio quando não há importações", () => {
    render(<ImportHistory searches={[]} />);
    expect(screen.getByText("Nenhuma importação ainda.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm run test -- tests/unit/workbench/import-history.test.tsx`
Expected: FAIL — módulo `ImportHistory` não existe.

- [ ] **Step 3: Implementar `src/components/workbench/ImportHistory.tsx`**

Componente **de servidor** (sem `"use client"`), puro. Usa as classes do design system.

```tsx
import type { SearchSummary } from "@/lib/search/queries";

/**
 * Histórico read-only das importações (Fatia 14): uma linha por busca, com base de dados,
 * data da importação (dd/mm/aaaa) e quantidade de artigos. Sem ações.
 */
export function ImportHistory({ searches }: { searches: SearchSummary[] }) {
  return (
    <section className="panel flex flex-col gap-3" aria-label="Importações anteriores">
      <h2 className="panel-title">Importações anteriores</h2>
      {searches.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhuma importação ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {searches.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-4 border-t border-line pt-2 text-sm first:border-t-0 first:pt-0"
            >
              <span className="font-medium text-ink">{s.database}</span>
              <span className="text-ink-faint">
                {new Date(s.createdAt).toLocaleDateString("pt-BR")}
              </span>
              <span className="text-ink-soft">
                {s.recordCount} artigo{s.recordCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npm run test -- tests/unit/workbench/import-history.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Verificar tipo e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/workbench/ImportHistory.tsx tests/unit/workbench/import-history.test.tsx
git commit -m "feat(14): ImportHistory — lista read-only de importações (obs 4)"
```

---

## Task 4: Wiring na página do workbench

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/page.tsx`

> Página server async — coberta pelo e2e existente; sem teste unitário de RSC.

- [ ] **Step 1: Importar `listSearches` e `ImportHistory`**

No topo de `app/reviews/[reviewId]/workbench/page.tsx`, junto aos imports existentes:

```tsx
import { ImportHistory } from "@/components/workbench/ImportHistory";
import { getSuggestedQuery, listSearches } from "@/lib/search/queries";
```

(Substitui a linha de import atual `import { getSuggestedQuery } from "@/lib/search/queries";`
por essa que agrega `listSearches`; adiciona o import do componente.)

- [ ] **Step 2: Buscar o histórico no modo import**

Logo após a linha `const suggestedQuery = active === "import" ? await getSuggestedQuery(reviewId) : "";`, adicione:

```tsx
  const searches =
    active === "import" ? await listSearches(reviewId) : [];
```

- [ ] **Step 3: Renderizar `<ImportHistory>` abaixo do `<ImportPanel>`**

Troque o ramo do modo import de:

```tsx
        {active === "import" ? (
          <ImportPanel reviewId={reviewId} suggestedQuery={suggestedQuery} />
        ) : active === "duplicates" ? (
```

para:

```tsx
        {active === "import" ? (
          <div className="flex flex-col gap-6">
            <ImportPanel reviewId={reviewId} suggestedQuery={suggestedQuery} />
            <ImportHistory searches={searches} />
          </div>
        ) : active === "duplicates" ? (
```

- [ ] **Step 4: Verificar tipo e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/reviews/[reviewId]/workbench/page.tsx"
git commit -m "feat(14): workbench page renderiza ImportHistory no modo Importar"
```

---

## Task 5: Teste de integração — embedding `record(count)`

**Files:**
- Create: `tests/integration/import-history.test.ts`

> Prova, contra o Supabase local, que o `SEARCH_SUMMARY_SELECT` retorna **uma linha por
> busca** com a contagem de records correta. Reusa os helpers e o caminho real de importação
> (`enqueueImportJob` + `processImportJob`) já usados em `tests/integration/jobs.import.test.ts`.
> Importa `SEARCH_SUMMARY_SELECT`/`toSearchSummaries` do módulo (apenas importar **não**
> dispara `cookies()`; só **chamar** `createClient` dispararia — e não o chamamos aqui).

- [ ] **Step 1: Escrever o teste**

```ts
// tests/integration/import-history.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";
import {
  SEARCH_SUMMARY_SELECT,
  toSearchSummaries,
  type SearchSummary,
} from "@/lib/search/queries";

const ris = readFileSync("tests/fixtures/import/sample.ris", "utf8");

async function summaries(reviewId: string): Promise<SearchSummary[]> {
  const { data, error } = await serviceClient()
    .from("search")
    .select(SEARCH_SUMMARY_SELECT)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return toSearchSummaries((data ?? []) as unknown as Parameters<typeof toSearchSummaries>[0]);
}

describe("histórico de importações — embedding record(count)", () => {
  let userClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`hist_${stamp}@example.com`, "senha-teste-123");
    userClient = u.client;
    const { data: review } = await userClient.rpc("create_review", {
      p_title: "Histórico",
    });
    reviewId = review.id;
  });

  it("uma importação ⇒ uma linha com a contagem de records (= 2)", async () => {
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search: {
        queryString: "active learning",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 2,
      },
    });
    await processImportJob({ supabase: serviceClient() }, res.job_id);

    const out = await summaries(reviewId);
    expect(out).toHaveLength(1);
    expect(out[0].database).toBe("ERIC");
    expect(out[0].recordCount).toBe(2);
  });

  it("uma segunda importação ⇒ duas linhas, mais recente primeiro", async () => {
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search: {
        queryString: "flipped classroom",
        database: "PubMed",
        searchedOn: "2026-06-01",
        hits: 2,
      },
    });
    await processImportJob({ supabase: serviceClient() }, res.job_id);

    const out = await summaries(reviewId);
    expect(out).toHaveLength(2);
    expect(out[0].database).toBe("PubMed"); // ordenado por created_at desc
    expect(out.every((s) => s.recordCount === 2)).toBe(true);
  });
});
```

- [ ] **Step 2: Garantir ambiente e rodar**

Garanta que o Supabase local está rodando e que o worktree tem `.env.local`
(copiar da raiz se faltar — ver pré-requisito). Então:

Run: `npm run test -- tests/integration/import-history.test.ts`
Expected: PASS (2 testes). Se o Supabase local não estiver disponível no ambiente do
subagente, **PARE e reporte** (status BLOCKED/NEEDS_CONTEXT) — não comente o teste nem
finja verde.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/import-history.test.ts
git commit -m "test(14): integração prova embedding record(count) no histórico"
```

---

## Task 6: Verificação final da fatia (gate)

**Files:** nenhum (gate).

- [ ] **Step 1: Suíte unitária completa**

Run: `npm run test -- tests/unit`
Expected: PASS — incluindo os pré-existentes (nada regrediu) + os novos (mapper + componente).

- [ ] **Step 2: Integração do histórico**

Run: `npm run test -- tests/integration/import-history.test.ts`
Expected: PASS (2). (Se ambiente sem Supabase: registrar desvio no CHECKPOINT 3.)

- [ ] **Step 3: e2e de importação inalterado**

Run: `npm run test:e2e -- import.spec.ts`
Expected: PASS — a lista não altera o fluxo de importar; `#import-file` e placeholders
intactos. (Mesma dependência de servidor/Supabase; se indisponível, registrar desvio.)

- [ ] **Step 4: Lint + type-check final**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Escrever o COMPLETION da fatia**

Crie `specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-14.md` (mesmo padrão dos
anteriores): branch, commits, o que foi feito (obs 4 read-only), decisões, resultado de
`test`/`integração`/`e2e`/`lint`/`tsc`, e estado do ambiente. Atualize o checklist em
`slicing.md`:
`- [x] Fatia 14 — Histórico de buscas importadas (CHECKPOINT 3 — aguardando merge manual)`.

- [ ] **Step 6: Commit do COMPLETION**

```bash
git add specs/001-marco1-nucleo-fluxo/.superpowers/COMPLETION-fatia-14.md \
        specs/001-marco1-nucleo-fluxo/.superpowers/slicing.md
git commit -m "docs(14): COMPLETION + slicing state — CHECKPOINT 3, aguardando merge"
```

---

## Self-review (cobertura × design)

- **Obs 4 (lista read-only):** Task 3 (componente) + Task 4 (wiring) — base, data
  `dd/mm/aaaa`, contagem; estado vazio. ✔
- **Query/contagem:** Tasks 1–2 (`toSearchSummaries`, `SEARCH_SUMMARY_SELECT`,
  `listSearches`) + Task 5 (integração prova o embedding). ✔
- **Sem reversão/edição/paginação (YAGNI):** não há ação no componente. ✔
- **Sem migration / sem schema / sem nova dep:** só leitura de `search`+`record`. ✔
- **Princípio V (superfície única):** `ImportHistory` é um painel **no modo Importar** da
  mesma página; nenhuma rota nova. ✔
- **Atualização pós-import:** `enqueueImport`/`runImportWorker` já `revalidatePath` do
  workbench ⇒ re-render server traz a nova busca. ✔
- **Consistência de nomes:** `SearchSummary`, `toSearchSummaries`, `SEARCH_SUMMARY_SELECT`,
  `listSearches`, `ImportHistory`, `searches` — idênticos entre tasks. ✔
