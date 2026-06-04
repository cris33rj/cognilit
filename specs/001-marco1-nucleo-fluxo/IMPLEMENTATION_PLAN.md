# Incremento 8.1 — Bloqueio de remoção de motivo de exclusão em uso

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa, cada
> uma em TDD. Os passos usam checkbox (`- [ ]`) para rastreio.
>
> **Escopo:** Incremento 8.1 (follow-up da Fatia 8, já mergeada) do Marco 1
> (`001-marco1-nucleo-fluxo`). Branch isolado
> `build/001-marco1-nucleo-fluxo/8-1-block-in-use-reason-removal`.
> A sessão **NUNCA** faz `git merge`/`git push` para a feature ou `main`.
> *(Planos de fatias anteriores permanecem no histórico git e em
> `.superpowers/COMPLETION-fatia-N.md`.)*
>
> Deriva de `docs/CONTEXT.md` (D7, D15, D24), `spec.md` (FR-025, FR-026, FR-036) e do
> design aprovado nesta sessão. **Não** altera decisão assinada: TC continua exigindo
> motivo de lista configurável; o soft-delete que preserva o PRISMA (Fatia 8) permanece
> para motivos **não** usados. Detalhe da fatia em
> `.superpowers/slicing.md` (§"Incremento 8.1").

**Goal:** Impedir a remoção de um motivo de exclusão enquanto ele justificar artigos
excluídos no Texto completo, dando ao usuário um caminho autocontido (selo "em uso (N)"
+ popover com "Desfazer") para reverter essas exclusões e então liberar a remoção.

**Architecture:** A guarda autoritativa vive na RPC `set_exclusion_reason_active`
(único caminho de escrita) — recusa a desativação quando há `record.corpus_state =
'excluded_ft'` apontando para o motivo. Uma RPC de leitura nova, `list_reason_usage`,
devolve os artigos que usam o motivo com o `decision_id` da decisão de TC viva, para o
"Desfazer". A `listExclusionReasons` passa a trazer `usageCount` por motivo (reusando a
view `prisma_exclusion_breakdown`), e o `ScreeningQueue` troca "Remover" por um selo
"em uso (N)" que abre um popover com a lista de artigos.

**Tech Stack:** PostgreSQL (Supabase, RPC `security definer` + RLS via `is_review_member`),
Next.js 14 App Router (Server Actions), React 18 + TanStack Query, TypeScript strict,
Vitest (unit + integração contra o Supabase local).

---

## Estrutura de arquivos

- **Criar** `supabase/migrations/0009_block_in_use_reason_removal.sql` — recria
  `set_exclusion_reason_active` com a guarda de uso; cria `list_reason_usage`.
- **Modificar** `tests/integration/exclusion-reasons.test.ts` — testes de integração
  (banco direto) da guarda e da nova RPC.
- **Modificar** `src/lib/screening/queries.ts` — `usageCount` em `ExclusionReason`;
  `ReasonUsage`/`ReasonUsageRaw`; helpers puros `mergeUsageCounts`/`mapReasonUsageRow`;
  `listReasonUsage`.
- **Modificar** `tests/unit/screening/queries.test.ts` — unit dos helpers puros.
- **Modificar** `src/components/workbench/ScreeningQueue.tsx` — prop `onReasonUsage`,
  selo "em uso (N)", "Remover" desabilitado, popover com "Desfazer".
- **Modificar** `tests/unit/workbench/screening-queue.test.tsx` — atualiza mocks
  (campos novos) e adiciona testes do selo + popover.
- **Modificar** `app/reviews/[reviewId]/workbench/actions.ts` — Server Action
  `fetchReasonUsage`.
- **Modificar** `app/reviews/[reviewId]/workbench/page.tsx` — passa `onReasonUsage`.

---

## Task 1: Migration 0009 — guarda de uso + `list_reason_usage`

**Files:**
- Create: `supabase/migrations/0009_block_in_use_reason_removal.sql`
- Test: `tests/integration/exclusion-reasons.test.ts`

- [ ] **Step 1: Escrever os testes de integração que falham**

Acrescente ao final de `tests/integration/exclusion-reasons.test.ts` (as helpers
`signUpUser`, `serviceClient`, `seedActiveRecord` já existem no arquivo):

```ts
describe("set_exclusion_reason_active — bloqueia remoção de motivo EM USO (8.1)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let reasonId: string;
  let recordId: string;
  let decisionId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`xr_use_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Em uso" });
    reviewId = review.id;
    const { data: id } = await owner.rpc("add_exclusion_reason", {
      p_review_id: reviewId,
      p_label: "Motivo em uso",
    });
    reasonId = id as string;
    recordId = await seedActiveRecord(reviewId, "Estudo que usa o motivo");
    await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recordId,
      p_stage: "title_abstract",
      p_decision: "include",
    });
    const { data: did } = await owner.rpc("decide_screening", {
      p_review_id: reviewId,
      p_record_id: recordId,
      p_stage: "full_text",
      p_decision: "exclude",
      p_exclusion_reason_id: reasonId,
    });
    decisionId = did as string;
  });

  it("remover (desativar) um motivo em uso dispara erro e mantém o motivo ativo", async () => {
    const { error } = await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: reasonId,
      p_active: false,
    });
    expect(error).not.toBeNull();
    const svc = serviceClient();
    const { data: row } = await svc
      .from("exclusion_reason")
      .select("is_active")
      .eq("id", reasonId)
      .single();
    expect(row!.is_active).toBe(true);
  });

  it("list_reason_usage retorna o artigo + título + decision_id da decisão viva", async () => {
    const { data, error } = await owner.rpc("list_reason_usage", {
      p_reason_id: reasonId,
    });
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].record_id).toBe(recordId);
    expect(data![0].title).toBe("Estudo que usa o motivo");
    expect(data![0].decision_id).toBe(decisionId);
  });

  it("após reverter a exclusão, o motivo deixa de estar em uso e a remoção passa", async () => {
    await owner.rpc("reverse_screening", { p_decision_id: decisionId });
    const { data: usage } = await owner.rpc("list_reason_usage", {
      p_reason_id: reasonId,
    });
    expect(usage!.length).toBe(0);
    const { error } = await owner.rpc("set_exclusion_reason_active", {
      p_reason_id: reasonId,
      p_active: false,
    });
    expect(error).toBeNull();
    const svc = serviceClient();
    const { data: row } = await svc
      .from("exclusion_reason")
      .select("is_active, dismissed")
      .eq("id", reasonId)
      .single();
    expect(row!.is_active).toBe(false);
    expect(row!.dismissed).toBe(true);
  });
});

describe("list_reason_usage — RLS: não-membro não lista o uso (8.1)", () => {
  it("não-membro chamando list_reason_usage dispara erro", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`xr_lru_o_${s}@example.com`, "senha-teste-123"))
      .client;
    const intruder = (await signUpUser(`xr_lru_i_${s}@example.com`, "senha-teste-123"))
      .client;
    const { data: review } = await owner.rpc("create_review", { p_title: "RLS usage" });
    const { data: id } = await owner.rpc("add_exclusion_reason", {
      p_review_id: review.id,
      p_label: "Motivo X",
    });
    const { error } = await intruder.rpc("list_reason_usage", { p_reason_id: id });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os novos testes e confirmar que falham**

Run: `npm run test -- tests/integration/exclusion-reasons.test.ts`
Expected: FALHA — `list_reason_usage` não existe ainda (erro de função inexistente) e a
remoção de motivo em uso **não** dispara erro (a guarda ainda não foi adicionada).

- [ ] **Step 3: Escrever a migration 0009**

Crie `supabase/migrations/0009_block_in_use_reason_removal.sql`:

```sql
-- ============================================================
-- Marco 1 / Incremento 8.1 — Bloqueia remoção de motivo de exclusão EM USO.
-- set_exclusion_reason_active(p_active=false) passa a recusar a desativação
-- enquanto houver artigo excluído no Texto completo (corpus_state='excluded_ft')
-- apontando para o motivo. Acrescenta list_reason_usage para a UI listar esses
-- artigos (título + decision_id da decisão de TC viva) e oferecer "Desfazer".
-- RLS via is_review_member (0001). NÃO toca a view prisma_exclusion_breakdown (0007).
-- ============================================================

create or replace function public.set_exclusion_reason_active(
  p_reason_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason public.exclusion_reason;
  v_in_use int;
begin
  select * into v_reason from public.exclusion_reason where id = p_reason_id;
  if not found then
    raise exception 'exclusion reason not found';
  end if;
  if not public.is_review_member(v_reason.review_id) then
    raise exception 'not a member';
  end if;

  -- Bloqueia a REMOÇÃO (desativação) de um motivo em uso: há artigo excluído no
  -- Texto completo que o referencia. O usuário deve reverter essas exclusões antes
  -- (caminho via list_reason_usage + "Desfazer"). O PRISMA permanece íntegro.
  if not p_active then
    select count(*) into v_in_use
    from public.record r
    where r.ft_exclusion_reason_id = p_reason_id
      and r.corpus_state = 'excluded_ft';
    if v_in_use > 0 then
      raise exception 'exclusion reason in use';
    end if;
  end if;

  -- Ao REATIVAR, respeita o invariante de dedup por label normalizado:
  -- não pode haver dois motivos ATIVOS com o mesmo label na mesma Revisão.
  if p_active then
    if exists (
      select 1 from public.exclusion_reason er
      where er.review_id = v_reason.review_id
        and er.id <> p_reason_id
        and er.is_active
        and public.normalize_reason_label(er.label)
            = public.normalize_reason_label(v_reason.label)
    ) then
      raise exception 'another active reason already uses this label';
    end if;
  end if;

  -- Desativar = dispensar (decisão pegajosa: sync/seed não ressuscitam).
  -- Reativar = des-dispensar.
  update public.exclusion_reason
    set is_active = p_active, dismissed = not p_active
  where id = p_reason_id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    v_reason.review_id, 'human', auth.uid(), 'set_exclusion_reason_active',
    'exclusion_reason', p_reason_id,
    jsonb_build_object('is_active', v_reason.is_active, 'dismissed', v_reason.dismissed),
    jsonb_build_object('is_active', p_active, 'dismissed', not p_active)
  );
end;
$$;
grant execute on function public.set_exclusion_reason_active(uuid, boolean) to authenticated;

-- ============================================================
-- list_reason_usage — artigos excluídos no TC que usam o motivo, com o id da
-- decisão de TC viva (stage='full_text', is_reversed=false) para o "Desfazer".
-- Mesmo conjunto que o PRISMA reporta sob o motivo (corpus_state='excluded_ft').
-- ============================================================
create or replace function public.list_reason_usage(p_reason_id uuid)
returns table (
  record_id uuid,
  title text,
  decision_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_review_id uuid;
begin
  select review_id into v_review_id
  from public.exclusion_reason where id = p_reason_id;
  if v_review_id is null then
    raise exception 'exclusion reason not found';
  end if;
  if not public.is_review_member(v_review_id) then
    raise exception 'not a member';
  end if;

  return query
  select
    r.id,
    r.metadata ->> 'title',
    sd.id
  from public.record r
  left join lateral (
    select s.id
    from public.screening_decision s
    where s.record_id = r.id
      and s.stage = 'full_text'
      and s.is_reversed = false
    order by s.created_at desc
    limit 1
  ) sd on true
  where r.ft_exclusion_reason_id = p_reason_id
    and r.corpus_state = 'excluded_ft'
  order by r.metadata ->> 'title';
end;
$$;
grant execute on function public.list_reason_usage(uuid) to authenticated;
```

- [ ] **Step 4: Aplicar a migration e regenerar os tipos**

Run:
```bash
npx supabase db reset
npm run gen:types
```
Expected: `db reset` re-aplica todas as migrations (incluindo a 0009) sem erro;
`gen:types` atualiza `src/types/database.ts` com a função `list_reason_usage` (necessário
para o `tsc` aceitar `.rpc("list_reason_usage")` na Task 2).

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npm run test -- tests/integration/exclusion-reasons.test.ts`
Expected: PASSA — os 3 testes do bloco "EM USO" + o teste de RLS verdes; os testes
pré-existentes do arquivo continuam verdes (a guarda só atua quando `corpus_state =
'excluded_ft'`, e o teste pré-existente "soft-delete (linha permanece)" usa um motivo
recém-criado sem uso).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0009_block_in_use_reason_removal.sql tests/integration/exclusion-reasons.test.ts src/types/database.ts
git commit -m "feat(8.1): bloqueia remoção de motivo de exclusão em uso + list_reason_usage"
```

---

## Task 2: Camada de query — `usageCount` + `listReasonUsage` + helpers puros

**Files:**
- Modify: `src/lib/screening/queries.ts`
- Test: `tests/unit/screening/queries.test.ts`

- [ ] **Step 1: Escrever os testes unitários dos helpers puros (falham)**

Acrescente ao final de `tests/unit/screening/queries.test.ts` (ajuste a linha de import
existente para incluir os dois helpers novos):

```ts
import { mergeUsageCounts, mapReasonUsageRow } from "@/lib/screening/queries";

describe("mergeUsageCounts (8.1)", () => {
  it("atribui a contagem a cada motivo por id; 0 quando ausente", () => {
    const reasons = [
      { id: "a", label: "A", origin: "seed" as const, sourceCriterionId: null },
      { id: "b", label: "B", origin: "manual" as const, sourceCriterionId: null },
    ];
    const counts = [{ reasonId: "a", n: 3 }];
    const merged = mergeUsageCounts(reasons, counts);
    expect(merged.find((r) => r.id === "a")!.usageCount).toBe(3);
    expect(merged.find((r) => r.id === "b")!.usageCount).toBe(0);
  });
});

describe("mapReasonUsageRow (8.1)", () => {
  it("mapeia snake_case → camelCase; título nulo vira placeholder", () => {
    expect(
      mapReasonUsageRow({ record_id: "r1", title: "T", decision_id: "d1" }),
    ).toEqual({ recordId: "r1", title: "T", decisionId: "d1" });
    expect(
      mapReasonUsageRow({ record_id: "r2", title: null, decision_id: null }),
    ).toEqual({ recordId: "r2", title: "(sem título)", decisionId: null });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm run test -- tests/unit/screening/queries.test.ts`
Expected: FALHA na compilação — `mergeUsageCounts` e `mapReasonUsageRow` não existem.

- [ ] **Step 3: Implementar os tipos, helpers e as queries**

Em `src/lib/screening/queries.ts`, adicione `usageCount` à interface `ExclusionReason`:

```ts
export interface ExclusionReason {
  id: string;
  label: string;
  origin: "seed" | "criterion" | "manual";
  sourceCriterionId: string | null;
  usageCount: number;
}
```

Logo após a interface `ExclusionReason`, adicione:

```ts
export interface ReasonUsage {
  recordId: string;
  title: string;
  decisionId: string | null;
}

export interface ReasonUsageRaw {
  record_id: string;
  title: string | null;
  decision_id: string | null;
}

/** Mapeia uma linha crua de list_reason_usage para o shape da UI. */
export function mapReasonUsageRow(r: ReasonUsageRaw): ReasonUsage {
  return {
    recordId: r.record_id,
    title: r.title ?? "(sem título)",
    decisionId: r.decision_id,
  };
}

/** Funde as contagens de uso (do breakdown PRISMA) na lista de motivos. */
export function mergeUsageCounts(
  reasons: Omit<ExclusionReason, "usageCount">[],
  counts: { reasonId: string; n: number }[],
): ExclusionReason[] {
  const byReason = new Map(counts.map((c) => [c.reasonId, c.n]));
  return reasons.map((r) => ({ ...r, usageCount: byReason.get(r.id) ?? 0 }));
}
```

Substitua a função `listExclusionReasons` existente por esta versão (acrescenta a leitura
do breakdown e a fusão das contagens):

```ts
/** Motivos de exclusão configuráveis e ativos, com contagem de uso (FR-025). */
export async function listExclusionReasons(
  reviewId: string,
): Promise<ExclusionReason[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exclusion_reason")
    .select("id, label, origin, source_criterion_id")
    .eq("review_id", reviewId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const reasons = (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    origin: r.origin as ExclusionReason["origin"],
    sourceCriterionId: r.source_criterion_id,
  }));

  const { data: breakdown, error: bErr } = await supabase
    .from("prisma_exclusion_breakdown")
    .select("reason_id, n")
    .eq("review_id", reviewId);
  if (bErr) throw new Error(bErr.message);
  const counts = (breakdown ?? []).map((b) => ({
    reasonId: b.reason_id as string,
    n: Number(b.n),
  }));

  return mergeUsageCounts(reasons, counts);
}

/** Artigos excluídos no TC que usam um motivo (para o popover "em uso"). */
export async function listReasonUsage(reasonId: string): Promise<ReasonUsage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_reason_usage", {
    p_reason_id: reasonId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ReasonUsageRaw[]).map(mapReasonUsageRow);
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm run test -- tests/unit/screening/queries.test.ts`
Expected: PASSA — os dois novos blocos verdes, demais testes do arquivo inalterados.

- [ ] **Step 5: Commit**

```bash
git add src/lib/screening/queries.ts tests/unit/screening/queries.test.ts
git commit -m "feat(8.1): usageCount nos motivos + listReasonUsage (helpers puros)"
```

---

## Task 3: Componente — selo "em uso (N)", Remover desabilitado, popover

**Files:**
- Modify: `src/components/workbench/ScreeningQueue.tsx`
- Test: `tests/unit/workbench/screening-queue.test.tsx`

- [ ] **Step 1: Atualizar os mocks existentes e escrever os novos testes (falham)**

Em `tests/unit/workbench/screening-queue.test.tsx`:

(a) No `import type`, troque para incluir `ReasonUsage`:

```ts
import type { QueueRow, ReasonUsage } from "@/lib/screening/queries";
```

(b) No `loadReasons` padrão dentro de `renderQueue`, acrescente `usageCount: 0` ao objeto,
e adicione a prop `onReasonUsage` logo após `onReverse`:

```tsx
        loadReasons={vi.fn().mockResolvedValue([
          {
            id: "x1",
            label: "Fora do escopo",
            origin: "seed",
            sourceCriterionId: null,
            usageCount: 0,
          },
        ])}
        onAddReason={vi.fn().mockResolvedValue({ ok: true, id: "new1" })}
        onRemoveReason={vi.fn().mockResolvedValue({ ok: true })}
        onDecide={vi.fn().mockResolvedValue({ ok: true })}
        onReverse={vi.fn().mockResolvedValue({ ok: true })}
        onReasonUsage={vi.fn().mockResolvedValue([] as ReasonUsage[])}
```

(c) No teste "Fatia 8 — no Texto completo, o painel lista os motivos com marcador…",
acrescente `usageCount: 0` aos três objetos do `loadReasons` daquele teste.

(d) Acrescente os dois novos testes ao final do `describe("ScreeningQueue (US4)", …)`:

```ts
it("8.1 — motivo em uso mostra selo 'em uso (N)' e desabilita Remover", async () => {
  const loadReasons = vi.fn().mockResolvedValue([
    {
      id: "u1",
      label: "Motivo usado",
      origin: "seed",
      sourceCriterionId: null,
      usageCount: 2,
    },
  ]);
  renderQueue({ stage: "full_text", loadReasons });
  await screen.findByText("Motivo usado");
  expect(
    screen.getByRole("button", { name: /em uso \(2\)/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /remover motivo motivo usado/i }),
  ).toBeDisabled();
});

it("8.1 — clicar no selo lista os artigos e 'Desfazer' chama onReverse", async () => {
  const onReasonUsage = vi
    .fn()
    .mockResolvedValue([
      { recordId: "r1", title: "Artigo X", decisionId: "dec1" },
    ]);
  const onReverse = vi.fn().mockResolvedValue({ ok: true });
  const loadReasons = vi.fn().mockResolvedValue([
    {
      id: "u1",
      label: "Motivo usado",
      origin: "seed",
      sourceCriterionId: null,
      usageCount: 1,
    },
  ]);
  renderQueue({ stage: "full_text", loadReasons, onReasonUsage, onReverse });
  await screen.findByText("Motivo usado");
  await userEvent.click(screen.getByRole("button", { name: /em uso \(1\)/i }));
  expect(onReasonUsage).toHaveBeenCalledWith("u1");
  await userEvent.click(
    await screen.findByRole("button", { name: /desfazer exclusão de artigo x/i }),
  );
  expect(onReverse).toHaveBeenCalledWith("dec1");
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm run test -- tests/unit/workbench/screening-queue.test.tsx`
Expected: FALHA — `onReasonUsage` não é prop de `ScreeningQueue` (erro de tipo) e o selo
"em uso" / popover não existem.

- [ ] **Step 3: Implementar no componente**

Em `src/components/workbench/ScreeningQueue.tsx`:

(a) No bloco de import de tipos, acrescente `ReasonUsage`:

```ts
import type {
  ExclusionReason,
  QueueRow,
  ReasonUsage,
  ScreeningStage,
} from "@/lib/screening/queries";
```

(b) Na interface `ScreeningQueueProps`, adicione a prop (após `onReverse`):

```ts
  onReverse: (decisionId: string) => Promise<{ ok: boolean }>;
  onReasonUsage: (reasonId: string) => Promise<ReasonUsage[]>;
```

(c) Na desestruturação dos props da função `ScreeningQueue`, adicione `onReasonUsage`
(após `onReverse`):

```ts
  onReverse,
  onReasonUsage,
}: ScreeningQueueProps) {
```

(d) Junto aos demais `useState` (após a linha `const [error, setError] = useState<string | null>(null);`),
adicione o estado do popover:

```ts
  const [usagePopover, setUsagePopover] = useState<{
    reasonId: string;
    items: ReasonUsage[];
  } | null>(null);
```

(e) Logo após a função `handleRemoveReason`, adicione os dois handlers do popover:

```ts
  // Abre o popover com os artigos que usam um motivo em uso (8.1).
  async function openUsage(reasonId: string) {
    setError(null);
    try {
      const items = await onReasonUsage(reasonId);
      setUsagePopover({ reasonId, items });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao listar os artigos do motivo.",
      );
    }
  }

  // Desfaz uma exclusão de dentro do popover e re-busca o uso (atualiza selo + lista).
  async function reverseFromUsage(decisionId: string, reasonId: string) {
    setError(null);
    try {
      await onReverse(decisionId);
      await qc.invalidateQueries({ queryKey: ["screening"] });
      const items = await onReasonUsage(reasonId);
      setUsagePopover(items.length > 0 ? { reasonId, items } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao desfazer a decisão.");
    }
  }
```

(f) No `<li>` do mapa de motivos, substitua o botão "Remover" único por uma ramificação
selo/Remover. Troque este trecho:

```tsx
                <button
                  type="button"
                  className="rounded border px-2 py-0.5 text-xs text-ink-soft hover:bg-paper-2"
                  aria-label={`Remover motivo ${r.label}`}
                  onClick={() => void handleRemoveReason(r.id)}
                >
                  Remover
                </button>
```

por:

```tsx
                {r.usageCount > 0 ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-line bg-paper-2 px-2 py-0.5 text-xs text-ink-soft hover:bg-paper"
                      aria-label={`Ver os ${r.usageCount} artigos que usam o motivo ${r.label}`}
                      onClick={() => void openUsage(r.id)}
                    >
                      em uso ({r.usageCount})
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 text-xs text-ink-faint opacity-50"
                      aria-label={`Remover motivo ${r.label}`}
                      title="Reverta as exclusões que usam este motivo para poder removê-lo"
                      disabled
                    >
                      Remover
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rounded border px-2 py-0.5 text-xs text-ink-soft hover:bg-paper-2"
                    aria-label={`Remover motivo ${r.label}`}
                    onClick={() => void handleRemoveReason(r.id)}
                  >
                    Remover
                  </button>
                )}
```

(g) Imediatamente após o `</ul>` da lista de motivos (antes do `<div className="mt-2 flex items-center gap-2">`
que tem o input "Adicionar motivo…"), insira o popover:

```tsx
          {usagePopover && (
            <div
              role="dialog"
              aria-label="Artigos que usam o motivo"
              className="mt-2 rounded border border-line bg-paper-2 p-2"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">
                  Artigos que usam este motivo — reverta para liberar a remoção
                </span>
                <button
                  type="button"
                  className="text-xs text-ink-soft hover:underline"
                  onClick={() => setUsagePopover(null)}
                >
                  Fechar
                </button>
              </div>
              {usagePopover.items.length === 0 ? (
                <p className="text-xs text-ink-faint">Nenhum artigo usa este motivo.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {usagePopover.items.map((it) => (
                    <li
                      key={it.recordId}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex-1 truncate">{it.title}</span>
                      {it.decisionId && (
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs text-ink-soft hover:bg-paper"
                          aria-label={`Desfazer exclusão de ${it.title}`}
                          onClick={() =>
                            void reverseFromUsage(it.decisionId!, usagePopover.reasonId)
                          }
                        >
                          Desfazer
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm run test -- tests/unit/workbench/screening-queue.test.tsx`
Expected: PASSA — os dois novos testes verdes e todos os testes pré-existentes do arquivo
continuam verdes (os mocks atualizados em Step 1 mantêm os tipos válidos).

- [ ] **Step 5: Commit**

```bash
git add src/components/workbench/ScreeningQueue.tsx tests/unit/workbench/screening-queue.test.tsx
git commit -m "feat(8.1): selo 'em uso (N)' + popover de artigos com Desfazer no painel de motivos"
```

---

## Task 4: Fiação — Server Action `fetchReasonUsage` + página + verificação final

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/actions.ts`
- Modify: `app/reviews/[reviewId]/workbench/page.tsx`

- [ ] **Step 1: Adicionar a Server Action**

Em `app/reviews/[reviewId]/workbench/actions.ts`, no import de `@/lib/screening/queries`,
acrescente `listReasonUsage`:

```ts
import {
  listScreeningQueue,
  listExclusionReasons,
  listReasonUsage,
  type ScreeningStage,
} from "@/lib/screening/queries";
```

Logo após a action `fetchExclusionReasons`, adicione:

```ts
/** Artigos excluídos no TC que usam um motivo (popover "em uso" — 8.1). */
export async function fetchReasonUsage(reviewId: string, reasonId: string) {
  await requireMember(reviewId);
  return listReasonUsage(reasonId);
}
```

- [ ] **Step 2: Passar a prop na página**

Em `app/reviews/[reviewId]/workbench/page.tsx`, acrescente `fetchReasonUsage` ao import
de `./actions` e passe a prop ao `ScreeningQueue` (após `onReverse`):

```tsx
            onDecide={decideScreening.bind(null, reviewId)}
            onReverse={reverseScreening.bind(null, reviewId)}
            onReasonUsage={fetchReasonUsage.bind(null, reviewId)}
```

- [ ] **Step 3: Verificação completa (lint + typecheck + testes)**

Run:
```bash
npm run lint
npm run typecheck
npm run test
```
Expected: `lint` sem erros; `typecheck` sem erros (a prop `onReasonUsage` está fiada e
`list_reason_usage` está nos tipos gerados); **toda** a suíte Vitest verde (os blocos
novos de Task 1–3 + os pré-existentes).

- [ ] **Step 4: Commit**

```bash
git add app/reviews/[reviewId]/workbench/actions.ts app/reviews/[reviewId]/workbench/page.tsx
git commit -m "feat(8.1): fia fetchReasonUsage na superfície do workbench (TC)"
```

---

## Notas de verificação (self-review do plano)

- **Cobertura do design:** guarda autoritativa (Task 1) · RPC de uso para o popover
  (Task 1) · `usageCount` reusando `prisma_exclusion_breakdown` (Task 2) · selo "em uso"
  + Remover desabilitado + popover com Desfazer (Task 3) · fiação action/página (Task 4).
  Casos de borda do design: motivo só com decisões revertidas → `ft_exclusion_reason_id`
  null e `corpus_state` ≠ `excluded_ft` ⇒ `usageCount=0` e remoção liberada (coberto pelo
  3º teste de integração); motivo com 0 uso → caminho "Remover" como na Fatia 8 (mocks
  default + testes pré-existentes).
- **Consistência de tipos:** `ExclusionReason.usageCount: number` (Task 2) é consumido em
  `r.usageCount > 0` (Task 3) e fornecido por `mergeUsageCounts`/`listExclusionReasons`;
  `ReasonUsage{recordId,title,decisionId}` (Task 2) é o tipo de `onReasonUsage`/popover
  (Task 3) e do retorno de `fetchReasonUsage`/`listReasonUsage` (Tasks 2/4).
- **Por que a guarda no banco e não só na UI:** a RPC é o único caminho de escrita
  (0006/0008 sem policy de write direto); o desabilitar do botão é apenas UX. Os testes de
  integração batem direto no banco (não passam por `createClient()` server — ver memória
  [[integration-tests-cant-call-server-client-wrappers]]).
- **PRISMA intacto:** nenhuma alteração na view `prisma_exclusion_breakdown` (0007); a 0009
  só recria uma função e cria outra.
