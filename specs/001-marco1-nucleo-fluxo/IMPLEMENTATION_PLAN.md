# Fatia 15 — Painel de detalhe do registro na triagem T/R

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa, cada uma
> em TDD. Os passos usam checkbox (`- [ ]`) para rastreio.
>
> **Escopo:** Fatia 15 do Marco 1 (`001-marco1-nucleo-fluxo`), melhoria de UX pós-Marco.
> Branch isolado `build/001-marco1-nucleo-fluxo/15-record-detail-panel`. A sessão **NUNCA**
> faz `git merge`/`git push` para a feature ou `main`.
> *(Planos de fatias anteriores permanecem no histórico git e em `.superpowers/slicing.md`.)*

**Goal:** No modo **Título/Resumo** do workbench, exibir um painel de detalhe à direita da
fila que mostra os metadados ricos do registro focado — autores, periódico, DOI, idioma,
palavras-chave e resumo — **sem nenhuma sugestão de IA**.

**Architecture:** O dado já está no banco (`record.metadata` normalizado +
`record.raw` com os campos originais por formato). Um módulo puro `extractRawFields`
extrai periódico/palavras-chave/volume/issue/páginas do `raw` com chaves cientes do formato
(RIS/BibTeX/CSV). Uma query `getRecordDetail(recordId)` funde `metadata` + extração; uma
server action `fetchRecordDetail` a expõe com guarda de membership. A `ScreeningQueue` (já
client, já rastreia `focusIdx`) busca o detalhe do registro focado via TanStack Query (cache
por `recordId`, **sob demanda** — não incha o payload de ~5.000 linhas) e, **somente** no
estágio `title_abstract`, renderiza um componente presentacional `RecordDetail` ao lado da
fila num layout `[fila | detalhe]`. **Sem migration. Sem mexer no shell/`JobsPanel`. Sem
tocar a IA** (FR-024/D12 — o chip inline da fila permanece intacto).

**Tech Stack:** Next.js App Router (RSC + client islands), TS strict, Tailwind 4 (classes do
design system `.panel`/`panel-title`/`text-ink*`/`border-line`), Supabase server client
(`supabase-js`), TanStack Query/Virtual, Vitest + Testing Library (unit) e integração com
Supabase local (`tests/integration/helpers/supabase`), Playwright (e2e).

**Decisões herdadas do design (slicing.md §Fatia 15, A-15.1…A-15.4):**
- **A-15.1** — painel só no modo `title_abstract`; `full_text`/Duplicatas/Importar intactos.
- **A-15.2** — layout A (split local no `main`); shell/`JobsPanel` **não** são tocados.
- **A-15.3** — campos normalizados (`metadata`) + periódico/palavras-chave (+ volume/issue/
  páginas) extraídos de `record.raw` por formato; busca sob demanda ao focar.
- **A-15.4** — **sem IA no painel**; FR-024/D12 (chip inline da fila) preservados intactos.

---

## Estrutura de arquivos

- **Criar:** `src/lib/record/raw-fields.ts` — função pura `extractRawFields(format, raw)` →
  `{ journal, keywords, volume, issue, pages }`, com mapas de chave por formato.
- **Criar:** `src/lib/record/queries.ts` — `RECORD_DETAIL_SELECT` (string do select, exportada
  p/ o teste de integração reusar), tipos `RawRecordRow`/`RecordDetailData`, mapper puro
  `toRecordDetail`, e a query `getRecordDetail(recordId)`.
- **Criar:** `src/components/workbench/RecordDetail.tsx` — componente **client** presentacional
  puro (sem fetch): recebe `{ detail, isLoading }`, renderiza o painel ou estados vazio/loading.
- **Modificar:** `src/components/workbench/ScreeningQueue.tsx` — novo prop `loadDetail`, query
  do registro focado, e wrapper `[fila | detalhe]` **somente** no `title_abstract`.
- **Modificar:** `app/reviews/[reviewId]/workbench/actions.ts` — server action `fetchRecordDetail`.
- **Modificar:** `app/reviews/[reviewId]/workbench/page.tsx` — passar `loadDetail={fetchRecordDetail}`.
- **Criar:** `tests/unit/record/raw-fields.test.ts` — testes da extração por formato.
- **Criar:** `tests/unit/record/record-detail-mapper.test.ts` — testes de `toRecordDetail`.
- **Criar:** `tests/unit/workbench/record-detail.test.tsx` — testes de render do componente.
- **Modificar:** `tests/unit/workbench/screening-queue.test.tsx` — atualizar o harness (novo prop
  `loadDetail`) + 2 testes (painel presente no T/R, ausente no TC).
- **Criar:** `tests/integration/record-detail.test.ts` — prova a extração do `raw` contra o
  Supabase local (registro importado → periódico/palavras-chave) + isolamento RLS.
- **Criar:** `tests/fixtures/import/detail-rich.ris` — fixture RIS com `JO`/`KW`/`VL`/`IS`/`SP`/`EP`.
- **Modificar:** `tests/e2e/screening.spec.ts` — e2e do painel no T/R.

> **Pré-requisito de ambiente (execução):** os testes de **integração** e **e2e** precisam do
> Supabase local rodando e de `.env.local` **dentro do worktree** (arquivos não-versionados não
> são herdados pelo worktree — copiar da raiz). Se indisponível, registrar como **desvio** no
> CHECKPOINT 3 (não fingir verde). Os testes **unit** não precisam de Supabase.

---

## Task 1: `extractRawFields` — extração de campos do `raw` por formato (puro)

**Files:**
- Create: `src/lib/record/raw-fields.ts`
- Test: `tests/unit/record/raw-fields.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/unit/record/raw-fields.test.ts
import { describe, it, expect } from "vitest";
import { extractRawFields } from "@/lib/record/raw-fields";

describe("extractRawFields — RIS", () => {
  it("extrai JO/KW/VL/IS e combina SP–EP", () => {
    const out = extractRawFields("ris", {
      JO: "Journal of Wearable Tech",
      KW: ["edge AI", "wearables"],
      VL: "12",
      IS: "3",
      SP: "45",
      EP: "60",
    });
    expect(out.journal).toBe("Journal of Wearable Tech");
    expect(out.keywords).toEqual(["edge AI", "wearables"]);
    expect(out.volume).toBe("12");
    expect(out.issue).toBe("3");
    expect(out.pages).toBe("45–60");
  });

  it("KW único (string, não array) vira lista de um; JF é fallback de periódico", () => {
    const out = extractRawFields("ris", { JF: "Rev. X", KW: "único" });
    expect(out.journal).toBe("Rev. X");
    expect(out.keywords).toEqual(["único"]);
  });

  it("campos ausentes ⇒ nulos / lista vazia", () => {
    const out = extractRawFields("ris", { TI: "x" });
    expect(out).toEqual({
      journal: null,
      keywords: [],
      volume: null,
      issue: null,
      pages: null,
    });
  });
});

describe("extractRawFields — BibTeX", () => {
  it("journal + keywords (split por ; ou ,) + number como issue", () => {
    const out = extractRawFields("bibtex", {
      journal: "Computers & Education",
      keywords: "edtech; inclusão, ensino",
      volume: "5",
      number: "2",
      pages: "10-20",
    });
    expect(out.journal).toBe("Computers & Education");
    expect(out.keywords).toEqual(["edtech", "inclusão", "ensino"]);
    expect(out.issue).toBe("2");
    expect(out.pages).toBe("10-20");
  });
});

describe("extractRawFields — CSV", () => {
  it("cabeçalho case-insensitive (Journal/Keywords/Volume)", () => {
    const out = extractRawFields("csv", {
      Title: "x",
      Journal: "Nature",
      Keywords: "a; b",
      Volume: "1",
    });
    expect(out.journal).toBe("Nature");
    expect(out.keywords).toEqual(["a", "b"]);
    expect(out.volume).toBe("1");
  });
});

describe("extractRawFields — robustez", () => {
  it("raw não-objeto ⇒ tudo vazio sem lançar", () => {
    expect(extractRawFields("ris", null)).toEqual({
      journal: null,
      keywords: [],
      volume: null,
      issue: null,
      pages: null,
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm run test -- tests/unit/record/raw-fields.test.ts`
Expected: FAIL com "Cannot find module '@/lib/record/raw-fields'".

- [ ] **Step 3: Implementar o módulo**

```ts
// src/lib/record/raw-fields.ts
import type { SourceFormat } from "@shared/import/types";

export interface RawExtractedFields {
  journal: string | null;
  keywords: string[];
  volume: string | null;
  issue: string | null;
  pages: string | null;
}

type Raw = Record<string, unknown>;

/** Primeiro string não-vazio de um valor que pode ser string, número ou array. */
function firstStr(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstStr(x);
      if (s) return s;
    }
  }
  return null;
}

/** Lista de strings: array → achata; string → divide por ';' ou ','. */
function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(toList);
  if (typeof v === "string") {
    return v
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

/** Lookup case-insensitive da primeira chave candidata presente. */
function pick(raw: Raw, candidates: string[]): unknown {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(raw)) lower.set(k.toLowerCase(), v);
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit !== undefined && hit !== null) return hit;
  }
  return undefined;
}

interface KeyMap {
  journal: string[];
  keywords: string[];
  volume: string[];
  issue: string[];
  pages: string[];
  startPage: string[];
  endPage: string[];
}

const KEYS: Record<SourceFormat, KeyMap> = {
  ris: {
    journal: ["JO", "JF", "T2"],
    keywords: ["KW"],
    volume: ["VL"],
    issue: ["IS"],
    pages: [],
    startPage: ["SP"],
    endPage: ["EP"],
  },
  bibtex: {
    journal: ["journal", "journaltitle", "booktitle"],
    keywords: ["keywords", "keyword"],
    volume: ["volume"],
    issue: ["number", "issue"],
    pages: ["pages"],
    startPage: [],
    endPage: [],
  },
  csv: {
    journal: ["journal", "source", "publication", "journal title", "source title"],
    keywords: ["keywords", "keyword", "author keywords"],
    volume: ["volume", "vol"],
    issue: ["issue", "number", "no"],
    pages: ["pages", "page"],
    startPage: [],
    endPage: [],
  },
};

export function extractRawFields(
  format: SourceFormat,
  raw: unknown,
): RawExtractedFields {
  const r: Raw = raw && typeof raw === "object" ? (raw as Raw) : {};
  const keys = KEYS[format];
  let pages = firstStr(pick(r, keys.pages));
  if (!pages) {
    const sp = firstStr(pick(r, keys.startPage));
    const ep = firstStr(pick(r, keys.endPage));
    if (sp && ep) pages = `${sp}–${ep}`;
    else pages = sp ?? null;
  }
  return {
    journal: firstStr(pick(r, keys.journal)),
    keywords: toList(pick(r, keys.keywords)),
    volume: firstStr(pick(r, keys.volume)),
    issue: firstStr(pick(r, keys.issue)),
    pages,
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm run test -- tests/unit/record/raw-fields.test.ts`
Expected: PASS (todos os describes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/record/raw-fields.ts tests/unit/record/raw-fields.test.ts
git commit -m "feat(15): extractRawFields — periódico/palavras-chave do raw por formato"
```

---

## Task 2: `getRecordDetail` — query, tipos, mapper puro e fixture (+ integração)

**Files:**
- Create: `src/lib/record/queries.ts`
- Create: `tests/unit/record/record-detail-mapper.test.ts`
- Create: `tests/fixtures/import/detail-rich.ris`
- Test (integração): `tests/integration/record-detail.test.ts`

- [ ] **Step 1: Escrever o teste unitário do mapper que falha**

```ts
// tests/unit/record/record-detail-mapper.test.ts
import { describe, it, expect } from "vitest";
import { toRecordDetail, type RawRecordRow } from "@/lib/record/queries";

describe("toRecordDetail", () => {
  it("funde metadata normalizado + extração do raw", () => {
    const row: RawRecordRow = {
      id: "r1",
      source_format: "ris",
      metadata: {
        title: "Edge AI",
        authors: ["Smith, J."],
        year: 2021,
        doi: "10.1/x",
        abstract: "Resumo.",
        language: "en",
      },
      raw: { JO: "J. Wear", KW: ["edge AI"] },
    };
    const d = toRecordDetail(row);
    expect(d.title).toBe("Edge AI");
    expect(d.authors).toEqual(["Smith, J."]);
    expect(d.year).toBe(2021);
    expect(d.journal).toBe("J. Wear");
    expect(d.keywords).toEqual(["edge AI"]);
  });

  it("metadata/raw ausentes ⇒ defaults seguros", () => {
    const d = toRecordDetail({
      id: "r2",
      source_format: "csv",
      metadata: null,
      raw: null,
    });
    expect(d.title).toBe("(sem título)");
    expect(d.authors).toEqual([]);
    expect(d.journal).toBeNull();
    expect(d.keywords).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- tests/unit/record/record-detail-mapper.test.ts`
Expected: FAIL com "Cannot find module '@/lib/record/queries'".

- [ ] **Step 3: Implementar a query + tipos + mapper**

```ts
// src/lib/record/queries.ts
import { createClient } from "@/lib/supabase/server";
import type { SourceFormat } from "@shared/import/types";
import { extractRawFields } from "./raw-fields";

/** Select reusado pelo teste de integração (deve casar com a query abaixo). */
export const RECORD_DETAIL_SELECT = "id, source_format, metadata, raw";

interface RecordMetadata {
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  doi?: string | null;
  abstract?: string | null;
  language?: string | null;
}

export interface RawRecordRow {
  id: string;
  source_format: SourceFormat;
  metadata: RecordMetadata | null;
  raw: Record<string, unknown> | null;
}

export interface RecordDetailData {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  language: string | null;
  abstract: string | null;
  journal: string | null;
  keywords: string[];
  volume: string | null;
  issue: string | null;
  pages: string | null;
}

/** Funde metadata normalizado + campos extraídos do raw (puro, testável). */
export function toRecordDetail(row: RawRecordRow): RecordDetailData {
  const m = row.metadata ?? {};
  const extra = extractRawFields(row.source_format, row.raw ?? {});
  return {
    id: row.id,
    title: m.title ?? "(sem título)",
    authors: m.authors ?? [],
    year: m.year ?? null,
    doi: m.doi ?? null,
    language: m.language ?? null,
    abstract: m.abstract ?? null,
    journal: extra.journal,
    keywords: extra.keywords,
    volume: extra.volume,
    issue: extra.issue,
    pages: extra.pages,
  };
}

/** Detalhe rico de um registro (RLS por membership via server client). */
export async function getRecordDetail(
  recordId: string,
): Promise<RecordDetailData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("record")
    .select(RECORD_DETAIL_SELECT)
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toRecordDetail(data as unknown as RawRecordRow);
}
```

- [ ] **Step 4: Rodar o teste do mapper e ver passar**

Run: `npm run test -- tests/unit/record/record-detail-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Criar a fixture RIS rica**

```
TY  - JOUR
TI  - Edge AI on wearables
AU  - Smith, J.
AU  - Doe, A.
PY  - 2021
DO  - 10.1234/jwt.2021.5
AB  - Um estudo sobre IA na borda em dispositivos vestíveis.
LA  - en
JO  - Journal of Wearable Tech
KW  - edge AI
KW  - wearables
VL  - 12
IS  - 3
SP  - 45
EP  - 60
ER  -
```

Salvar em `tests/fixtures/import/detail-rich.ris`.

- [ ] **Step 6: Escrever o teste de integração**

```ts
// tests/integration/record-detail.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";
import {
  RECORD_DETAIL_SELECT,
  toRecordDetail,
  type RawRecordRow,
} from "@/lib/record/queries";

const ris = readFileSync("tests/fixtures/import/detail-rich.ris", "utf8");

describe("getRecordDetail — extração de periódico/palavras-chave do raw", () => {
  let userClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const u = await signUpUser(`detail_${Date.now()}@example.com`, "senha-teste-123");
    userClient = u.client;
    const { data: review } = await userClient.rpc("create_review", {
      p_title: "Detalhe",
    });
    reviewId = review.id;
    const res = await enqueueImportJob({ supabase: userClient }, reviewId, {
      format: "ris",
      content: ris,
      search: {
        queryString: "wearables",
        database: "ERIC",
        searchedOn: "2026-05-30",
        hits: 1,
      },
    });
    await processImportJob({ supabase: serviceClient() }, res.job_id);
  });

  it("o registro importado expõe periódico e palavras-chave do raw", async () => {
    const { data, error } = await serviceClient()
      .from("record")
      .select(RECORD_DETAIL_SELECT)
      .eq("review_id", reviewId)
      .limit(1)
      .single();
    if (error) throw new Error(error.message);
    const detail = toRecordDetail(data as unknown as RawRecordRow);
    expect(detail.journal).toBe("Journal of Wearable Tech");
    expect(detail.keywords).toContain("edge AI");
    expect(detail.authors.length).toBeGreaterThan(0);
    expect(detail.abstract).toBeTruthy();
    expect(detail.pages).toBe("45–60");
  });

  it("isolamento por review (RLS): outro usuário não lê o registro", async () => {
    const other = await signUpUser(
      `detail_other_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data } = await other.client
      .from("record")
      .select("id")
      .eq("review_id", reviewId);
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Rodar a integração e ver passar**

Run: `npm run test -- tests/integration/record-detail.test.ts`
Expected: PASS (requer Supabase local + `.env.local`; senão registrar desvio).

- [ ] **Step 8: Commit**

```bash
git add src/lib/record/queries.ts tests/unit/record/record-detail-mapper.test.ts tests/integration/record-detail.test.ts tests/fixtures/import/detail-rich.ris
git commit -m "feat(15): getRecordDetail — funde metadata + extração do raw (query/mapper/integração)"
```

---

## Task 3: `fetchRecordDetail` — server action com guarda de membership

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/actions.ts`

- [ ] **Step 1: Adicionar o import da query**

No topo de `actions.ts`, junto aos outros imports de `@/lib/...`, adicionar:

```ts
import { getRecordDetail } from "@/lib/record/queries";
```

- [ ] **Step 2: Adicionar a server action**

No bloco `// ---- Fetchers ... ----` (após `fetchScreeningQueue`), adicionar:

```ts
/** Detalhe rico de um registro para o painel mestre-detalhe do T/R (Fatia 15). */
export async function fetchRecordDetail(reviewId: string, recordId: string) {
  await requireMember(reviewId);
  return getRecordDetail(recordId);
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros. (A action é fina e segue o padrão de `fetchScreeningQueue`; coberta
funcionalmente pelo e2e da Task 6.)

- [ ] **Step 4: Commit**

```bash
git add "app/reviews/[reviewId]/workbench/actions.ts"
git commit -m "feat(15): fetchRecordDetail server action (guarda de membership)"
```

---

## Task 4: `RecordDetail` — componente presentacional (sem IA)

**Files:**
- Create: `src/components/workbench/RecordDetail.tsx`
- Test: `tests/unit/workbench/record-detail.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// tests/unit/workbench/record-detail.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecordDetail } from "@/components/workbench/RecordDetail";
import type { RecordDetailData } from "@/lib/record/queries";

const FULL: RecordDetailData = {
  id: "r1",
  title: "Edge AI on wearables",
  authors: ["Smith, J.", "Doe, A."],
  year: 2021,
  doi: "10.1/x",
  language: "en",
  abstract: "Um resumo detalhado do estudo.",
  journal: "Journal of Wearable Tech",
  keywords: ["edge AI", "wearables"],
  volume: "12",
  issue: "3",
  pages: "45–60",
};

describe("RecordDetail", () => {
  it("renderiza autores(ano), periódico, palavras-chave e resumo", () => {
    render(<RecordDetail detail={FULL} isLoading={false} />);
    expect(screen.getByText("Smith, J.; Doe, A. (2021)")).toBeInTheDocument();
    expect(screen.getByText("Journal of Wearable Tech")).toBeInTheDocument();
    expect(screen.getByText("edge AI")).toBeInTheDocument();
    expect(
      screen.getByText("Um resumo detalhado do estudo."),
    ).toBeInTheDocument();
  });

  it("omite campos ausentes sem quebrar", () => {
    render(
      <RecordDetail
        detail={{ ...FULL, journal: null, doi: null, keywords: [], abstract: null }}
        isLoading={false}
      />,
    );
    expect(screen.queryByText("Periódico")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Palavras-chave")).not.toBeInTheDocument();
  });

  it("NÃO renderiza nenhum vocabulário de IA (A-15.4)", () => {
    render(<RecordDetail detail={FULL} isLoading={false} />);
    expect(screen.queryByText(/sugest[ãa]o/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/aceitar|rejeitar/i)).not.toBeInTheDocument();
  });

  it("estado de carregamento e estado vazio", () => {
    const { rerender } = render(<RecordDetail detail={null} isLoading />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    rerender(<RecordDetail detail={null} isLoading={false} />);
    expect(
      screen.getByText("Selecione um registro para ver os detalhes."),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- tests/unit/workbench/record-detail.test.tsx`
Expected: FAIL com "Cannot find module '@/components/workbench/RecordDetail'".

- [ ] **Step 3: Implementar o componente**

```tsx
// src/components/workbench/RecordDetail.tsx
import type { RecordDetailData } from "@/lib/record/queries";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{value}</dd>
    </div>
  );
}

/**
 * Painel de detalhe do registro focado na triagem T/R (Fatia 15). Presentacional:
 * recebe o detalhe já resolvido; o fetch vive na ScreeningQueue. SEM vocabulário de
 * IA — o revisor lê título/resumo e decide (A-15.4).
 */
export function RecordDetail({
  detail,
  isLoading,
}: {
  detail: RecordDetailData | null;
  isLoading: boolean;
}) {
  const publication = [
    detail?.volume ? `v. ${detail.volume}` : null,
    detail?.issue ? `n. ${detail.issue}` : null,
    detail?.pages ? `p. ${detail.pages}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <aside
      className="panel flex w-[360px] shrink-0 flex-col gap-3 self-start"
      aria-label="Detalhe do registro"
    >
      {isLoading ? (
        <p className="text-sm text-ink-faint">Carregando…</p>
      ) : !detail ? (
        <p className="text-sm text-ink-faint">
          Selecione um registro para ver os detalhes.
        </p>
      ) : (
        <>
          <header className="flex flex-col gap-1">
            <span className="text-sm text-ink-soft">
              {detail.authors.length > 0
                ? detail.authors.join("; ")
                : "Autoria não informada"}
              {detail.year ? ` (${detail.year})` : ""}
            </span>
            <h2 className="panel-title">{detail.title}</h2>
          </header>

          <dl className="flex flex-col gap-1 text-sm">
            {detail.journal && <Field label="Periódico" value={detail.journal} />}
            {detail.doi && <Field label="DOI" value={detail.doi} />}
            {detail.language && <Field label="Idioma" value={detail.language} />}
            {publication && <Field label="Publicação" value={publication} />}
          </dl>

          {detail.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Palavras-chave">
              {detail.keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-full border border-line bg-paper-2 px-2 py-0.5 text-xs text-ink-soft"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {detail.abstract && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                Resumo
              </span>
              <p className="max-h-[40vh] overflow-auto whitespace-pre-line text-sm text-ink">
                {detail.abstract}
              </p>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- tests/unit/workbench/record-detail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/workbench/RecordDetail.tsx tests/unit/workbench/record-detail.test.tsx
git commit -m "feat(15): RecordDetail — painel presentacional de metadados (sem IA)"
```

---

## Task 5: Fiar o mestre-detalhe na `ScreeningQueue` (só T/R) + página + harness

**Files:**
- Modify: `src/components/workbench/ScreeningQueue.tsx`
- Modify: `app/reviews/[reviewId]/workbench/page.tsx`
- Test: `tests/unit/workbench/screening-queue.test.tsx`

- [ ] **Step 1: Atualizar o harness de teste com o novo prop e escrever os 2 testes que falham**

Em `tests/unit/workbench/screening-queue.test.tsx`, dentro de `renderQueue` (lista de props),
adicionar o novo prop ao `<ScreeningQueue ...>` **antes** de `{...over}`:

```tsx
        loadDetail={vi.fn().mockResolvedValue({
          id: "r1",
          title: "Estudo Alpha",
          authors: ["Autor X"],
          year: 2021,
          doi: null,
          language: "pt",
          abstract: "resumo alpha",
          journal: "Periódico Alpha",
          keywords: ["tema"],
          volume: null,
          issue: null,
          pages: null,
        })}
```

E adicionar dois testes ao final do `describe("ScreeningQueue (US4)", …)`:

```tsx
  it("T/R: mostra o painel de detalhe do registro focado", async () => {
    renderQueue({ stage: "title_abstract" });
    expect(
      await screen.findByLabelText("Detalhe do registro"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Periódico Alpha")).toBeInTheDocument();
  });

  it("Texto completo: NÃO mostra o painel de detalhe", async () => {
    renderQueue({ stage: "full_text" });
    await screen.findByRole("grid", { name: /fila de triagem/i });
    expect(
      screen.queryByLabelText("Detalhe do registro"),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- tests/unit/workbench/screening-queue.test.tsx`
Expected: FAIL — o painel não existe ainda (e o tipo de `loadDetail` não está nos props).

- [ ] **Step 3: Adicionar o import e o prop na `ScreeningQueue`**

Em `src/components/workbench/ScreeningQueue.tsx`:

(a) adicionar o import (junto aos imports de componentes):

```ts
import { RecordDetail } from "@/components/workbench/RecordDetail";
```

(b) ampliar o import de tipos de `@/lib/screening/queries` e importar o tipo do detalhe:

```ts
import type { RecordDetailData } from "@/lib/record/queries";
```

(c) na interface `ScreeningQueueProps`, adicionar (após `onReasonUsage`):

```ts
  loadDetail: (
    reviewId: string,
    recordId: string,
  ) => Promise<RecordDetailData | null>;
```

(d) destructurar `loadDetail` na assinatura do componente (após `onReasonUsage,`):

```ts
  onReasonUsage,
  loadDetail,
}: ScreeningQueueProps) {
```

- [ ] **Step 4: Adicionar a query do registro focado**

Logo após o `const visibleRows = useMemo(... )` (e antes de `const rowHeight = ...`), adicionar:

```ts
  // Detalhe rico do registro focado — só no T/R, buscado sob demanda (não incha a
  // fila de ~5.000 linhas). Cache por recordId (Fatia 15).
  const focusedRecordId = visibleRows[focusIdx]?.recordId ?? null;
  const detail = useQuery({
    queryKey: ["record-detail", reviewId, focusedRecordId],
    queryFn: () => loadDetail(reviewId, focusedRecordId as string),
    enabled: stage === "title_abstract" && !!focusedRecordId,
  });
```

- [ ] **Step 5: Envolver a grade num layout `[fila | detalhe]` no T/R**

Localizar o bloco da grade virtualizada que começa em:

```tsx
      {/* Grade virtualizada (FR-028, FR-041) */}
      <div
        ref={parentRef}
        role="grid"
        aria-label="Fila de triagem"
        tabIndex={0}
        className="h-[60vh] overflow-auto rounded border focus:outline focus:outline-2 focus:outline-accent"
      >
```

Trocar **apenas** essa abertura por (envolve a grade num wrapper e ajusta a className):

```tsx
      {/* Grade virtualizada (FR-028, FR-041) + painel de detalhe no T/R (Fatia 15) */}
      <div
        className={
          stage === "title_abstract" ? "flex items-start gap-4" : undefined
        }
      >
      <div
        ref={parentRef}
        role="grid"
        aria-label="Fila de triagem"
        tabIndex={0}
        className={`h-[60vh] overflow-auto rounded border focus:outline focus:outline-2 focus:outline-accent ${
          stage === "title_abstract" ? "min-w-0 flex-1" : ""
        }`}
      >
```

E, logo **após** o `</div>` de fechamento dessa grade (a linha `</div>` imediatamente antes
de `</div>` + `);` no fim do componente — o fechamento do `role="grid"`), adicionar o painel
e fechar o wrapper:

```tsx
        {/* fim da grade */}
      </div>
      {stage === "title_abstract" && (
        <RecordDetail detail={detail.data ?? null} isLoading={detail.isLoading} />
      )}
      </div>
```

> **Nota de execução:** o componente termina hoje com a sequência `</div>` (grade) → `</div>`
> (wrapper externo `flex flex-col gap-3`) → `);`. Inserir o novo painel + o novo `</div>` de
> wrapper **entre** o fechamento da grade e o `</div>` do wrapper externo. Conferir o balanço
> de tags com `npx tsc --noEmit` (Step 7).

- [ ] **Step 6: Passar `loadDetail` da página**

Em `app/reviews/[reviewId]/workbench/page.tsx`:

(a) no import das actions, adicionar `fetchRecordDetail` à lista:

```ts
  reverseScreening,
  fetchRecordDetail,
} from "./actions";
```

(b) no `<ScreeningQueue ... />`, adicionar o prop (após `onReasonUsage=...`):

```tsx
            onReasonUsage={fetchReasonUsage.bind(null, reviewId)}
            loadDetail={fetchRecordDetail}
```

- [ ] **Step 7: Rodar testes + tipos + lint**

Run: `npm run test -- tests/unit/workbench/screening-queue.test.tsx`
Expected: PASS (incl. os 2 novos testes; os antigos continuam verdes).

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add "src/components/workbench/ScreeningQueue.tsx" "app/reviews/[reviewId]/workbench/page.tsx" "tests/unit/workbench/screening-queue.test.tsx"
git commit -m "feat(15): mestre-detalhe no T/R — ScreeningQueue busca e exibe o detalhe do registro focado"
```

---

## Task 6: e2e — painel de detalhe no T/R (periódico/palavras-chave) e ausência no TC

**Files:**
- Modify: `tests/e2e/screening.spec.ts`

- [ ] **Step 1: Adicionar o teste e2e ao final do arquivo**

```ts
test("triagem T/R: painel de detalhe mostra periódico e palavras-chave do registro focado", async ({
  page,
}) => {
  test.setTimeout(90_000);

  // Setup próprio: importa a fixture rica (com JO/KW), não a sample.ris.
  const email = `e2e_detail_${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/);

  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão e2e detalhe");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);
  const reviewId = page.url().split("/reviews/")[1]?.split("/")[0];
  if (!reviewId) throw new Error("reviewId não encontrado na URL");

  await page.getByRole("link", { name: "Importar" }).click();
  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();
  await page.setInputFiles(
    "#import-file",
    path.resolve("tests/fixtures/import/detail-rich.ris"),
  );
  await expect(page.getByText("Edge AI on wearables")).toBeVisible();
  await page.getByPlaceholder("String de busca").fill("wearables e2e");
  await page.getByPlaceholder("Base consultada").fill("ERIC");
  await page.locator('input[type="date"]').fill("2026-05-30");
  await page.getByPlaceholder("Nº de hits").fill("1");
  await page.getByRole("button", { name: /confirmar importação/i }).click();
  await expect(page.getByLabel("Contadores PRISMA")).toContainText(
    "Identificados: 1",
    { timeout: 20_000 },
  );

  // T/R: o primeiro registro fica focado por padrão (focusIdx=0) → painel preenchido.
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);
  const detail = page.getByLabel("Detalhe do registro");
  await expect(detail).toBeVisible({ timeout: 15_000 });
  await expect(detail).toContainText("Journal of Wearable Tech");
  await expect(detail).toContainText("edge AI");

  // Texto completo: o painel de detalhe NÃO existe.
  await page.goto(`/reviews/${reviewId}/workbench?mode=full_text`);
  await expect(page.getByRole("grid", { name: /fila de triagem/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel("Detalhe do registro")).toHaveCount(0);
});
```

- [ ] **Step 2: Rodar o e2e**

Run: `npm run test:e2e -- screening.spec.ts`
Expected: PASS (requer app + Supabase local; senão registrar desvio no CHECKPOINT 3).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/screening.spec.ts
git commit -m "test(15): e2e do painel de detalhe no T/R (periódico/keywords) e ausência no TC"
```

---

## Task 7: Verificação final + preparação do CHECKPOINT 3

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte unit + integração completa**

Run: `npm run test`
Expected: tudo verde (incl. suites de triagem da Fatia 5 inalteradas).

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: ambos limpos.

- [ ] **Step 3: e2e completo (gate da Fatia 5 preservado)**

Run: `npm run test:e2e`
Expected: suites `screening*.spec.ts` (incl. perf/a11y) verdes; o chip de IA inline da fila
continua presente (FR-024/D12 intactos).

- [ ] **Step 4: Preparar o resumo do CHECKPOINT 3**

Reunir para o desenvolvedor: branch `build/001-marco1-nucleo-fluxo/15-record-detail-panel`,
o diff, e os resultados de `npm run test` + `npm run lint` + `npx tsc --noEmit` (+ e2e ou
desvio registrado). **PARAR** e aguardar o merge manual — não iniciar nenhuma fatia seguinte.

---

## Self-Review (autor do plano)

- **Cobertura do spec (slicing §Fatia 15):** A-15.1 (só T/R) → Task 5 (`stage === "title_abstract"`
  no wrapper e no `enabled` da query) + Task 6 (e2e prova ausência no TC). A-15.2 (layout A,
  shell intacto) → Task 5 não toca `layout.tsx`/`JobsPanel`. A-15.3 (campos + extração do raw)
  → Tasks 1–2. A-15.4 (sem IA no painel; FR-024/D12 intactos) → Task 4 (teste "NÃO renderiza IA")
  + nenhuma alteração no chip inline (Task 7 Step 3 reverifica).
- **Sem placeholders:** todo passo de código mostra o código completo; comandos com saída esperada.
- **Consistência de tipos:** `RecordDetailData` definido em Task 2 é o tipo usado em Tasks 4–5;
  `extractRawFields(format, raw)` (Task 1) é consumido por `toRecordDetail` (Task 2);
  `loadDetail` retorna `Promise<RecordDetailData | null>` em props (Task 5), action (Task 3) e
  harness de teste (Task 5 Step 1).
- **Migrations:** nenhuma — `record.metadata`/`record.raw` já existem; o `raw` das importações
  já está persistido (sem re-importar).
