# Fatia 8 — Motivos de exclusão derivados dos critérios de elegibilidade

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development
> para implementar tarefa a tarefa, cada uma em TDD.
>
> **Escopo:** Fatia 8 (pós-Marco funcional) do Marco 1 (`001-marco1-nucleo-fluxo`).
> Branch isolado `build/001-marco1-nucleo-fluxo/8-exclusion-reasons-from-criteria`.
> A sessão **NUNCA** faz `git merge`/`git push` para a feature ou `main`.
> *(Planos de fatias anteriores permanecem no histórico git e em
> `.superpowers/COMPLETION-fatia-N.md`.)*
>
> Deriva de `docs/CONTEXT.md` (D7, D15, D24), `spec.md` (FR-025, FR-036) e `plan.md`.
> **Não** altera decisões assinadas: T/R continua sem motivo; TC continua exigindo
> motivo de lista configurável (D7/FR-025). Esta fatia *cumpre* o "lista configurável
> por projeto" de D7, que hoje não tem UI de edição.

## Contexto

Três conceitos hoje desconectados em torno de "exclusão":

- `eligibility_criterion` (0002) — critérios de inclusão/exclusão + termos, derivados
  por IA e ratificados pelo humano; vivem só na tela Pergunta/Protocolo.
- `exclusion_reason` (0006) — motivos do Texto completo, hoje só *seedados* com 7
  rótulos genéricos (`seed_default_exclusion_reasons`), sem UI de edição.
- `ai_suggestion` — pré-classificação por registro.

**Objetivo:** os motivos de exclusão do Texto completo passam a ser **derivados dos
critérios de exclusão ratificados** (estilo Rayyan), mantendo a lista editável no
local de uso.

Critério de exclusão ratificado = `kind='exclusion'` AND
`ratification_state IN ('accepted','edited')`.

### Decisões de produto (fechadas com o usuário)
- Lista = **critérios derivados ratificados + seeds genéricos** (rede de segurança).
- Critério espelhado depois rejeitado/removido → **desativar só se não usado**.
- Dedup por **rótulo normalizado** (minúsculas + espaços colapsados).
- Adicionar e remover (soft-delete) motivos **inline** no modo Texto completo.
- Marcador visual distinguindo motivo **derivado de critério** vs. **genérico/manual**.

---

## Tarefa 1 — Camada de DB

Arquivo: `supabase/migrations/0008_exclusion_reasons_from_criteria.sql`.
TDD: escrever testes de integração primeiro, depois a migration; aplicar via
`supabase db reset` no Supabase local.

- **Colunas** em `exclusion_reason`:
  - `source_criterion_id uuid references public.eligibility_criterion (id) on delete set null` (não-nulo ⇒ derivado).
  - `origin text not null default 'seed'` check `in ('seed','criterion','manual')`.
  - índice único parcial `unique (review_id, source_criterion_id) where source_criterion_id is not null`.
- **`normalize_reason_label(text)`** imutável → `lower(btrim(regexp_replace($1,'\s+',' ','g')))`.
- **`seed_default_exclusion_reasons`** → idempotente **por rótulo** (insere cada
  genérico cujo rótulo normalizado ainda não exista ativo; `origin='seed'`). Mantém
  assinatura (tests existentes em `rls.screening.test.ts`/`screening.test.ts` chamam direto).
- **`sync_exclusion_reasons_from_criteria(p_review_id uuid)`** `security definer`:
  membership check; para cada critério de exclusão ratificado faz upsert do espelho
  (insere se não há espelho daquele critério **e** não há motivo ativo com rótulo
  normalizado igual; atualiza `label` se o texto do critério mudou); para espelhos cujo
  critério deixou de ser ratificado → `is_active=false` **só se não usado**
  (`not exists` em `record.ft_exclusion_reason_id`); escreve `audit_entry`.
- **`ensure_exclusion_reasons(p_review_id uuid)`** `security definer`: roda sync e
  depois seed (derivados primeiro; genéricos só preenchem o que falta — ordem importa
  para o dedup).
- **`add_exclusion_reason(p_review_id uuid, p_label text)`** `security definer`:
  `origin='manual'`, dedup por rótulo normalizado (no-op se já existe ativo),
  `sort_order = max+1`, audit.
- **`set_exclusion_reason_active(p_reason_id uuid, p_active boolean)`** `security
  definer`: flip de `is_active`, audit, não apaga linha.
- View `prisma_exclusion_breakdown` (0007) **não muda** (junta por id, sem filtrar is_active).

### Testes de integração (DB direto — não usar wrappers de server client; ver memória)
- ratificar 2 critérios de exclusão → `ensure_exclusion_reasons` → lista tem os 2
  derivados (`origin='criterion'`) + 7 seeds, sem duplicata literal.
- idempotência (rodar 2x não duplica).
- editar texto de critério → re-sync atualiza `label`.
- rejeitar critério não usado → `is_active=false`; rejeitar usado → permanece ativo.
- `add_exclusion_reason` dedup; `set_exclusion_reason_active` soft-delete.
- usar motivo derivado em `decide_screening(full_text, exclude)` →
  `prisma_exclusion_breakdown` com o rótulo do critério.
- RLS: não-membro não roda as novas RPCs.

---

## Tarefa 2 — Camada de app

- **`src/types/database.ts`**: novas RPCs + colunas (`npm run gen:types` ou edição
  manual seguindo o padrão vizinho).
- **`src/lib/screening/queries.ts`**: `ExclusionReason` ganha
  `origin: 'seed' | 'criterion' | 'manual'` e `sourceCriterionId: string | null`;
  `listExclusionReasons` seleciona `origin, source_criterion_id` (mantém filtro
  `is_active=true`, ordem `sort_order`).
- **`app/reviews/[reviewId]/workbench/actions.ts`**: `fetchExclusionReasons` chama
  `ensure_exclusion_reasons` (em vez de `seed_default_exclusion_reasons`); novas actions
  `addExclusionReason(reviewId, label)` e `removeExclusionReason(reviewId, reasonId)`
  (ambas `requireMember` + `revalidatePath`).
- **`src/components/workbench/ScreeningQueue.tsx`**: carregar `reasons` ao montar no
  modo `full_text`; painel "Motivos de exclusão" com marcador de origem (tag discreta
  "do critério" quando `origin==='criterion'`, reusando vocabulário visual de IA —
  SC-005), input de adicionar e botão remover (soft-delete); invalidar
  `["screening","reasons",reviewId]` após mutar. Seletor de exclusão existente
  (`pendingExclude`) segue igual, alimentado pela lista derivada+genérica.
- **`app/reviews/[reviewId]/workbench/page.tsx`**: passar as novas actions como props
  (mesmo padrão de `onDecide`/`onReverse`).
- **Testes**: unit do painel (`tests/unit/workbench/screening-queue.test.tsx`); e2e
  (`tests/e2e/screening.spec.ts`) excluir no TC com motivo derivado + add/remove inline.

---

## Gates (CHECKPOINT 3)
`npm test` verde, `npm run lint` limpo, `npm run typecheck` limpo. Apresentar branch +
diff e **parar** para merge manual do desenvolvedor.

## Fora de escopo
- Motivo de exclusão no T/R (emenda a D7/FR-025 → Sessão A).
- Dedup semântico (embeddings — Marco 2+).
- Tela de gerência de motivos fora do workbench.
