# Fatiação — Marco 1 (`001-marco1-nucleo-fluxo`)

**Produzido por:** Sessão B (`brainstorming`).
**Data:** 2026-05-30 (UTC).
**Estado:** ✅ Aprovada pelo desenvolvedor em 2026-05-30 (CHECKPOINT 1 concluído).
Próximo passo: `writing-plans` da Fatia 1 — **apenas sob autorização explícita**.

> Decide as **fronteiras** das fatias dentro do perímetro do HANDOFF/plan.
> Cada fatia é entregável e testável ponta-a-ponta (lint + `tsc --noEmit` +
> testes verdes). Branch por fatia:
> `build/001-marco1-nucleo-fluxo/<n>-<slug>`. A sessão **nunca** mergeia —
> o desenvolvedor faz o merge entre cada fatia.

**Formato escolhido:** 6 fatias, **ordem-pipeline** (D19), greenfield.

---

## Decisões de implementação resolvidas (A1/A2/A3)

- **A1 — export da trilha de auditoria (FR-035): JSON + CSV.** JSON sem
  perda (campos `before`/`after` jsonb preservados aninhados) **e** CSV
  achatado para inspeção em planilha. Vira critério de aceite na **Fatia 6**.
- **A2 — orçamento de performance da fila (~5.000 registros, SC-012):
  rigoroso.** Limiares testáveis (critério e2e/perf da **Fatia 5**):
  - decisão → render **< 100 ms** (update otimista com rollback);
  - scroll mantém **~60 fps** com 5.000 linhas virtualizadas;
  - navegação por tecla (próximo/anterior) **< 50 ms**;
  - render inicial da fila **< 1 s** para 5.000 registros.
  *(Não altera `spec.md`; o limiar vive no `IMPLEMENTATION_PLAN.md` da fatia.)*
- **A3 — libs de parsing (FR-013): papaparse + lib BibTeX + RIS próprio.**
  CSV = `papaparse`; BibTeX = lib madura (formato complexo, não reinventar);
  RIS = parser próprio simples (formato tagged, line-oriented). Os **nomes
  exatos das dependências são pinados por tarefa explícita** no
  `writing-plans` da **Fatia 3** (constitution §Portões). `TanStack Virtual`
  (R7) idem, por tarefa explícita na **Fatia 5**.

---

## Fatias (ordem de execução)

### Fatia 1 — Fundação & Revisão isolada
- **Branch:** `build/001-marco1-nucleo-fluxo/1-fundacao-revisao`
- **US:** US1 (P1). **FR:** 001–005, base de 035 (tabela append-only).
- **Entra:**
  - Scaffold do projeto greenfield: Next.js 14 App Router, TS strict,
    Tailwind 4, Vitest, Playwright, ESLint (`eslint-config-next`) + Prettier,
    Husky + lint-staged. `tsconfig`, `next.config`, configs de teste/lint.
  - Supabase local (CLI), `@supabase/supabase-js` + `@supabase/ssr`,
    clients server/client.
  - **1ª migration com RLS** (Princípio IV): `profile`, `review`, `member`,
    `audit_entry` (insert-only) + políticas RLS; helper de inserção de
    auditoria reutilizável.
  - Auth Supabase **e-mail/senha** (R1); rota `(auth)`.
  - `reviews/` (lista), criação de Revisão (criador → `member role=owner`,
    FR-002), troca de Revisão ativa (FR-004) e `reviews/[reviewId]/layout.tsx`
    **mínimo** (seletor de Revisão + contexto ativo).
- **Não entra:** trilho de fases e PRISMA vivos (Fatia 6); workbench (Fatia 3);
  qualquer IA.
- **Depende de:** nada (primeira fatia).
- **Testes-chave:** isolamento RLS entre 2 usuários/Revisões (SC-009,
  integração); auth; criação/troca de Revisão.

### Fatia 2 — Pergunta + Protocolo (+ plumbing de IA/BYOK)
- **Branch:** `build/001-marco1-nucleo-fluxo/2-pergunta-protocolo`
- **US:** US5, US6 (P2). **FR:** 006–012, 030–034 (vocabulário de estado/
  proveniência e BYOK introduzidos aqui).
- **Entra:**
  - Abstração **`LLMProvider`** (`src/lib/ai/llm/`) + adapter Anthropic
    (default, D14); contrato factual `{value,source_span,page}`/`not_found`;
    saída pt-BR. **Nenhum SDK direto fora desta camada.**
  - **BYOK via Supabase Vault** (R5/FR-032): tabela `byok_key` +
    `vault_secret_id`; decifragem server-side. **Reconciliar `.env.example`**
    (remover `BYOK_MASTER_KEY`/`app_secrets`/`byok_keys` — resíduo do build
    anterior; ver codebase-map §4) — **tarefa explícita**.
  - Migration: `question`, `eligibility_criterion`, `protocol`,
    `protocol_amendment`, `ai_suggestion`, `byok_key`, `ai_usage` + RLS.
  - US5: seleção de framework (SPIDER default + PICo/PEO/PCC/livre, FR-006);
    derivação IA de critérios/termos como **sugestão ratificável**
    (aceitar/editar/rejeitar com estado e proveniência, FR-007/008).
  - US6: rascunho PRISMA-P por IA editável (FR-009); estado `draft|locked`
    visível; **emendas versionadas e datadas** (FR-011); **export** do
    protocolo (serialização Markdown/PDF, FR-012). O **gatilho** de travamento
    pela 1ª decisão de triagem é **fiado na Fatia 5** (a operação "lock" e o
    teste direto de travamento ficam aqui).
  - Vocabulário visual de IA inicial (`src/components/ai/`): suggestion chip,
    provenance popover, accept/edit/reject — reusado depois (EP-3).
- **Não entra:** pré-classificação em lote (Fatia 5); ingestão de PDF (Marco 2).
- **Depende de:** Fatia 1 (review/member/RLS/auditoria).
- **Skills de implementação:** `frontend-design` (vocabulário de IA),
  `react-best-practices`, `nextjs-best-practices` (fronteiras RSC/Client).
- **Testes-chave:** `LLMProvider` mock retorna `provenance` em 100% das saídas;
  `not_found` renderizado; travamento direto do protocolo; emenda não
  sobrescreve versão travada (SC-010).

### Fatia 3 — Workbench shell + Importação & registro de busca
- **Branch:** `build/001-marco1-nucleo-fluxo/3-workbench-importacao`
- **US:** US2 (P1). **FR:** 013–017, 027 (superfície única estabelecida).
  **A3.**
- **Entra:**
  - **Superfície única `app/reviews/[reviewId]/workbench/page.tsx`** + barra
    de modos (Importar | Duplicatas | T/R | Texto completo). Só **Importar**
    funcional; os demais modos presentes-mas-inertes. **Invariante Princípio V:
    nenhuma rota separada.**
  - Infra de **jobs assíncronos** (`src/lib/jobs/` + Edge Functions
    `jobs-enqueue` e `jobs-worker` via `pg_cron`, contrato `async-jobs.md`):
    Edge só valida/persiste/enfileira; worker processa item-a-item, resiliente
    por-item, retomável; UI observa por polling (TanStack Query).
  - Migration: `search`, `record` (+ `doi_normalized`, `title_norm`, índices
    incl. `pg_trgm` para a fatia seguinte) + RLS.
  - Parsers `src/lib/import/` (contrato `import-parsers.md`): RIS/BibTeX/CSV
    rodando **no worker** (`import_parse`); **preview** client-side antes de
    confirmar (FR-014); arquivo malformado ⇒ erro claro, **zero persistência
    parcial** (FR-016). Libs por **tarefa explícita** (A3).
  - Registro de busca (string/base/data/hits, FR-015) no mesmo modo Importar.
  - PRISMA "identificados" começa a refletir o corpus.
- **Não entra:** dedup (Fatia 4); triagem (Fatia 5).
- **Depende de:** Fatia 1. (Não depende de 2.)
- **Skills:** `react-best-practices`, `nextjs-best-practices`, `frontend-design`
  (barra de modos / superfície do workbench).
- **Testes-chave:** fixtures RIS/BibTeX/CSV (≥80% no parsing, constitution
  §Testes); malformado ⇒ 0 records (FR-016); enqueue não processa (§VIII);
  e2e "importar".

### Fatia 4 — Deduplicação no workbench
- **Branch:** `build/001-marco1-nucleo-fluxo/4-deduplicacao`
- **US:** US3 (P1). **FR:** 018–021, 026 (granularidade de reversão).
- **Entra:**
  - Migration: `dedup_decision` + RLS.
  - Remoção automática de **exatas** ao concluir a importação (DOI; senão
    `title_norm` + ano, R2), com log **reversível** (FR-018/019).
  - Fila **fuzzy** `pg_trgm` (≥ 0.92 + mesmo ano, R2) lado-a-lado:
    "mesma" (mescla) / "distintas" (FR-020); mescla reversível (FR-021).
  - **Modo Duplicatas** ativado na superfície do workbench (mesma página).
  - Reversão **por item, a qualquer momento** ⇒ nova `audit_entry` (FR-026, Q4).
  - PRISMA "duplicados" = exatas + fuzzy confirmadas (não revertidas).
- **Não entra:** triagem.
- **Depende de:** Fatia 3 (`record`, workbench, índices `pg_trgm`).
- **Skills:** `react-best-practices`, `frontend-design` (par lado-a-lado).
- **Testes-chave:** ≥80% em dedup; exatas auto + reversão; fuzzy fila;
  contadores; estado órfão impedido (edge case).

### Fatia 5 — Triagem em duas etapas + IA-no-laço
- **Branch:** `build/001-marco1-nucleo-fluxo/5-triagem`
- **US:** US4 (P1). **FR:** 022–026, 028, 029, 039, 040, 041, 024/033 (lote+
  custo). **A2.**
- **Entra:**
  - Migration: `screening_decision`, `exclusion_reason` (seed configurável) + RLS.
  - **Fila virtualizada** (TanStack Table + **TanStack Virtual**, tarefa
    explícita) **teclado-first** (FR-028); orçamento **A2** como critério
    e2e/perf.
  - Modos **T/R** (incluir/excluir/dúvida, sem motivo) e **Texto completo**
    (motivo obrigatório de lista configurável, FR-025) — **na mesma
    superfície** (Princípio V). "Dúvida" = pendente, bloqueia avanço (Q1).
  - **`ai_screening_batch`** como job (reusa infra da Fatia 3) chamando
    `LLMProvider.preclassifyScreening` **no worker**; **estimativa de custo
    prévia** (FR-033) + `ai_usage` acumulado (SC-008); sugestões anexadas aos
    registros; a IA **nunca decide** (FR-024).
  - **Gatilho de travamento do protocolo** na **1ª** `screening_decision`
    (FR-010) — fia a operação "lock" da Fatia 2.
  - Multi-seleção + **ações em lote** (FR-039, decisões humanas, mesmas regras);
    **densidade** compacto/confortável (FR-040); **a11y** ARIA/foco/teclado
    (FR-041, SC-013).
  - Reversão de triagem por item ⇒ `audit_entry` (FR-026).
- **Não entra:** trilho/PRISMA completos e export de auditoria (Fatia 6).
- **Depende de:** Fatia 4 (corpus deduplicado), Fatia 2 (protocolo p/ lock;
  critérios p/ IA; `LLMProvider`/BYOK), Fatia 3 (jobs infra).
- **Skills:** `frontend-design` (workbench, vocabulário de IA),
  `react-best-practices` (virtualização + updates otimistas), `nextjs-best-practices`.
- **Testes-chave:** e2e "triar T/R" e "triar Texto completo"; perf A2;
  a11y (SC-013); IA não altera estado (contrato `LLMProvider`); travamento
  disparado na 1ª decisão.

### Fatia 6 — Shell, trilho & PRISMA vivo + export de auditoria
- **Branch:** `build/001-marco1-nucleo-fluxo/6-shell-prisma-auditoria`
- **US:** US7 (P3). **FR:** 035 (export), 036, 037. **A1.**
- **Entra:**
  - **Trilho de fases** no `reviews/[reviewId]/layout.tsx` (feito/em curso/
    pendente/travado/opcional-desligado), incl. Viés/Certeza como desligadas
    (D19, não bloqueiam).
  - **Barra PRISMA viva** ligada à **view `prisma_counter`** (fonte única,
    SC-004); painel de jobs e de custo no shell.
  - **Estado de fila na URL** (FR-037, R6/EP-4): filtros/ordenação/seleção
    reabríveis no mesmo estado.
  - **Export da trilha de auditoria** em **JSON + CSV** (A1, FR-035).
- **Não entra:** fluxograma PRISMA renderizado e exportações DOCX/PDF/MD
  (Marco 3 — spec §Out of Scope; aqui só contadores e export de auditoria).
- **Depende de:** Fatias 1–5 (todos os contadores e estados existirem).
- **Skills:** `frontend-design`, `react-best-practices`, `nextjs-best-practices`.
- **Testes-chave:** PRISMA bate número-a-número com o corpus (SC-004);
  reabertura de estado de fila por URL; export de auditoria JSON+CSV
  (reversões aparecem, SC-006).

---

## Gate de cobertura (verificação — PROTOCOLS §Sessão B)

- **User stories cobertas:** US1→F1 · US2→F3 · US3→F4 · US4→F5 · US5→F2 ·
  US6→F2 · US7→F6. **As 7 cobertas, sem sobreposição.**
- **União das fatias = Marco inteiro:** todas as 41 FR alocadas; nada do
  `spec.md` fora; nada duplicado. (Transversais FR-027/030–038 distribuídas
  ao primeiro consumidor e completadas na F6.)
- **Ordem respeita dependências de schema** (`data-model.md`): F1 (raiz+RLS)
  → F2 (question/protocol) → F3 (search/record+jobs) → F4 (dedup) → F5
  (screening, depende de protocol+record+jobs) → F6 (view derivada). Migrations
  sempre precedem o código que as consome.
- **Itens A\* atribuídos:** A1→F6, A2→F5, A3→F3. (C1/U1/A1-modeling já
  resolvidos na Sessão A.)
- **Nenhuma tecnologia fora do `plan.md`/`research.md`:** stack ratificada;
  dependências novas (papaparse, lib BibTeX, TanStack Virtual) **só por tarefa
  explícita**.
- **Workbench não-refragmentado** (Princípio V): superfície única nasce na F3;
  F4 e F5 adicionam **modos**, nunca rotas/telas.

## Estado das fatias

- [x] Fatia 1 — Fundação & Revisão isolada (mergeada)
- [x] Fatia 2 — Pergunta + Protocolo (mergeada)
- [x] Fatia 3 — Workbench shell + Importação (mergeada — commit `114da4f`)
- [ ] Fatia 4 — Deduplicação (em preparação — `writing-plans`/CHECKPOINT 2)
- [ ] Fatia 5 — Triagem 2 etapas + IA-no-laço
- [ ] Fatia 6 — Shell, trilho & PRISMA vivo + export de auditoria
