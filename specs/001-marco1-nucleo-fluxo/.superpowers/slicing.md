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

> **Adendo (2026-06-03):** **Fatia 7 — Design System + Polish Visual** acrescentada
> após o Marco funcional, aprovada pelo desenvolvedor a partir de protótipo visual
> ([docs/prototypes/protocolo-spider.html](../../../docs/prototypes/protocolo-spider.html)).
> É uma fatia **transversal de UI** (não pipeline): não adiciona FR de produto,
> repagina o que já existe. CHECKPOINT 1 desta fatia: aprovado nesta sessão.

> **Adendo (2026-06-04):** **Fatia 8 — Motivos de exclusão derivados dos critérios**
> acrescentada após constatação de necessidade de melhoria, aprovada pelo
> desenvolvedor. **Não** é fatia de produto nova: **não** altera decisão assinada
> (D7/FR-025 — T/R sem motivo, TC com motivo de lista configurável permanecem); ela
> *cumpre* o "lista configurável por projeto" de D7, que até então não tinha UI de
> edição. Conecta os critérios de exclusão ratificados (Pergunta/Protocolo) à lista de
> motivos da Triagem de Texto completo. Detalhe em
> [COMPLETION-fatia-8.md](./COMPLETION-fatia-8.md).

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

### Fatia 7 — Design System + Polish Visual
- **Branch:** `build/001-marco1-nucleo-fluxo/7-design-system-polish`
- **Natureza:** fatia **transversal de UI** (pós-Marco funcional). **Não** adiciona
  FR de produto; repagina o que já existe sob uma identidade visual única.
- **Entra:**
  - **Design system** em `app/globals.css` (Tailwind 4): tokens `@theme` (paleta
    papel-quente + tinta + acento vermillion/verde-petróleo; fontes serif/sans/mono)
    + `@layer components` (`.btn-primary`, `.control`, `.panel`, `.field`/`.glyph`,
    `.metric`, trilho/readout) espelhando o protótipo aprovado. Tema **claro**; tokens
    estruturados para dark futuro (não implementado nesta fatia).
  - **Fontes** Fraunces + Hanken Grotesk + IBM Plex Mono via `next/font` (self-hosted,
    sem CDN) em `app/layout.tsx`. **Sem novas deps de runtime.**
  - **Iniciais marginais + expansão de acrônimo por framework** em `QuestionForm`
    (mapas `FIELD_GLYPH`/`FRAMEWORK_ACRONYM`): spider/pico/peo/pcc cada um expande o
    **seu** acrônimo; `free` (Livre) sem iniciais.
  - **Aplicação uniforme** a TODAS as páginas/componentes existentes: shell
    (`layout`, `PhaseRail`, `PrismaBar`, `JobsPanel`, `ReviewSwitcher`), formulários
    (pergunta/protocolo/auth/listas), vocabulário visual de IA (`src/components/ai/`)
    e workbench (`ModeBar` + painéis).
- **Não entra:** dark mode; mudança de comportamento, copy ou rotas; novas FR;
  fluxograma PRISMA/exports DOCX-PDF-MD (Marco 3).
- **Depende de:** Fatias 1–6 mergeadas (repagina a superfície inteira).
- **Skills:** `frontend-design`, `react-best-practices`, `nextjs-best-practices`.
- **Testes-chave (gate):** **suites e2e/unit das Fatias 3–6 verdes e inalteradas**
  (repaginação preserva textos/atributos/`data-*`/`aria-*` — invariante central);
  contraste **WCAG AA**; `prefers-reduced-motion` desliga animações; teclado preservado.

### Fatia 8 — Motivos de exclusão derivados dos critérios
- **Branch:** `build/001-marco1-nucleo-fluxo/8-exclusion-reasons-from-criteria`
- **Natureza:** fatia de **melhoria pós-Marco funcional**, acrescentada após
  constatação de necessidade. **Não** adiciona FR nem altera decisão assinada
  (D7/FR-025 intactos); *cumpre* o "lista configurável por projeto" de D7, que não
  tinha UI de edição. Deriva de `docs/CONTEXT.md` (D7, D15, D24) e `spec.md` (FR-025, FR-036).
- **Entra:**
  - Motivos de TC **derivados dos critérios de exclusão ratificados**
    (`kind='exclusion'`, ratificação aceita/editada), espelhados em `exclusion_reason`
    (`origin='criterion'`, `source_criterion_id`) via
    `sync_exclusion_reasons_from_criteria` (migration `0008`).
  - Lista = derivados + seeds genéricos, **dedup por rótulo normalizado**
    (`normalize_reason_label`); seed agora idempotente por rótulo.
  - **Adicionar motivo manual inline** (dedup) e **remover** (soft-delete, preserva
    PRISMA): RPCs `add_exclusion_reason`/`set_exclusion_reason_active`; actions
    `addExclusionReason`/`removeExclusionReason`.
  - Órfão (critério des-ratificado) → desativa só se não usado; re-ratificar reativa.
  - **Painel "Motivos de exclusão"** no modo Texto completo do workbench, com marcador
    "do critério" reusando o vocabulário visual de IA (SC-005).
- **Não entra:** motivo de exclusão no T/R (emenda a D7/FR-025 → Sessão A); dedup
  semântico de motivos (exige embeddings — Marco 2+).
- **Depende de:** Fatia 2 (`eligibility_criterion`, ratificação), Fatia 5
  (`exclusion_reason`, workbench Texto completo), Fatia 7 (vocabulário visual).
- **Skills:** `frontend-design`, `react-best-practices`, `nextjs-best-practices`.
- **Testes-chave:** 158 testes/40 arquivos verdes (incl. 12 novos em
  `tests/integration/exclusion-reasons.test.ts`); e2e `screening.spec.ts` (exclusão TC +
  add/remove inline); PRISMA intacto (view `0007` não tocada).

#### Incremento 8.1 — Bloqueio de remoção de motivo em uso (2026-06-04)
- **Branch:** `build/001-marco1-nucleo-fluxo/8-1-block-in-use-reason-removal`
- **Motivação:** após a Fatia 8, o "Remover" fazia soft-delete de um motivo **sem aviso**
  mesmo quando ele já justificava exclusões de TC. O dado sobrevivia (PRISMA intacto via
  view `0007`), mas o usuário ficava sem feedback e sem caminho para reverter as exclusões
  que (deveriam) travar a remoção. Decisão do desenvolvedor: **bloquear** a remoção
  enquanto o motivo estiver em uso, com caminho autocontido para revertê-lo.
- **Entra:**
  - **Guarda autoritativa** em `set_exclusion_reason_active` (nova migration `0009`):
    com `p_active=false`, se houver registro `corpus_state='excluded_ft'` com
    `ft_exclusion_reason_id = p_reason_id` → `raise exception 'exclusion reason in use'`.
    Mesmo conjunto que o PRISMA reporta sob o motivo.
  - **RPC de leitura** `list_reason_usage(p_reason_id)` → `{record_id, title, decision_id}`
    dos artigos `excluded_ft` que usam o motivo, com o `decision_id` da decisão de TC viva
    (`stage='full_text', is_reversed=false`) — id que o "Desfazer" consome. `security
    definer` + `is_review_member`.
  - **`listExclusionReasons`** passa a trazer `usageCount` por motivo, reaproveitando a
    view `prisma_exclusion_breakdown` (left join por `reason_id`; sem N+1). Query/action
    nova `listReasonUsage`/`fetchReasonUsage`.
  - **UI (`ScreeningQueue`, painel de motivos):** com `usageCount>0`, troca "Remover" por
    selo **"em uso (N)"** e **desabilita "Remover"** (tooltip explicativo); clicar no selo
    abre **popover** com os N títulos + "Desfazer" inline (reusa `handleReverse`). Ao zerar
    o uso, "Remover" habilita.
- **Não entra:** mudança no comportamento de soft-delete para motivos **não** usados
  (segue como na Fatia 8); alteração na view `0007`.
- **Depende de:** Fatia 8 (mergeada).
- **Testes-chave:** integração (banco direto) — `set_exclusion_reason_active` lança com
  motivo em uso e passa após reverter; `list_reason_usage` retorna registros + decision ids
  corretos. Unit (componente) — selo "em uso (N)" + "Remover" desabilitado; popover lista
  artigos; "Desfazer" chama `onReverse`. PRISMA intacto.

### Fatia 9 — Correção da semântica PRISMA (fluxo cumulativo) (2026-06-05)
- **Branch:** `build/001-marco1-nucleo-fluxo/9-prisma-flow-semantics`
- **Natureza:** fatia de **correção pós-Marco funcional**. **Não** adiciona FR
  nem altera decisão assinada. Corrige a implementação da Fatia 6: a barra PRISMA
  e o trilho de fases misturavam semântica de **inventário** (`corpus_state`, um
  estado por registro) com a semântica de **fluxo cumulativo** que o PRISMA exige.
  Isso significa que **SC-004 não estava de fato cumprido** em semântica de fluxo.
- **Motivação:** observado pelo desenvolvedor — com todos os artigos avançados ao
  Texto Completo, `Incluídos (T/R)` mostrava **0** (deveria mostrar o total que
  passou no T/R, p.ex. 15) porque `included_ts` só conta os que passaram e *ainda
  aguardam* TC; e `Excluídos (T/R)` não era exibido apesar de já calculado.
- **Entra:**
  - **Coluna derivada `passed_ts`** na view `prisma_counter` (nova migration
    `0010`, `create or replace view` — não toca `prisma_exclusion_breakdown`):
    `passed_ts = count(corpus_state in ('included_ts','included_ft','excluded_ft'))`.
    `maybe_ts` (dúvida) **não** entra — não passou no T/R (bloqueia avanço, Q1).
    Fonte única preservada (SC-004); `security_invoker` e grants mantidos.
  - **`PrismaCounters`/`getPrismaCounters`** (`src/lib/prisma/queries.ts`): campo
    `passedTs` lido de `passed_ts`.
  - **`PrismaBar`**: `Incluídos (T/R)` passa a usar `passedTs` (cumulativo) e nova
    entrada `Excluídos (T/R)` (`excludedTs`), reordenadas no fluxo PRISMA.
  - **Trilho (`phases.ts`)**: o predicado de conclusão de "Triagem TC" passa de
    `includedTs` (inventário, nunca verdadeiro na conclusão) para `passedTs`
    cumulativo — mesma raiz, segundo consumidor.
  - **`src/types/database.ts`**: `passed_ts` no Row de `prisma_counter`.
- **Não entra:** semântica de `screened`; relabel de `Incluídos (T/R)` (Ajuste D);
  alteração de `prisma_exclusion_breakdown` ou da view `0007`.
- **Depende de:** Fatia 6 (mergeada — view `prisma_counter`, `PrismaBar`, `phases`).
- **Testes-chave:** integração (banco direto) — `prisma_counter.passed_ts` bate
  número-a-número (= `included_ts + included_ft + excluded_ft`); unit — `PrismaBar`
  exibe `Incluídos (T/R)`=`passedTs` e `Excluídos (T/R)`=`excludedTs`; `phases`
  marca "Triagem TC" como `done` com `passedTs>0` e todos decididos
  (`includedTs===0`). `lint` + `tsc` limpos.

### Fatia 10 — Indicador de processamento nos gatilhos síncronos de IA (2026-06-05)
- **Branch:** `build/001-marco1-nucleo-fluxo/10-ai-pending-feedback`
- **Natureza:** fatia de **melhoria de UX pós-Marco funcional**, acrescentada após
  constatação do desenvolvedor. **Não** adiciona FR nem altera decisão assinada (D);
  repagina comportamento existente. Cobre a lacuna de feedback nos dois botões que
  fazem chamada de LLM **síncrona** (sem job/polling), onde hoje, após o clique, o
  usuário não sabe se a solicitação está em curso — só percebe quando a resposta é
  gerada.
- **Entra:**
  - Estado de pendência (`useTransition`/`isPending`) em **"Derivar por IA"**
    ([CriteriaPanel.tsx](../../../src/components/question/CriteriaPanel.tsx)) e
    **"Rascunhar por IA"**
    ([ProtocolEditor.tsx](../../../src/components/protocol/ProtocolEditor.tsx)):
    durante a chamada o botão **desabilita**, troca o rótulo / mostra spinner, e
    respeita `prefers-reduced-motion` (sem animação quando reduzido). Padrão de
    feedback reusável, alinhado ao vocabulário visual de IA (`src/components/ai/`).
- **Não entra:** estimativa de custo prévia (FR-033, já na Fatia 5); job de
  pré-classificação de triagem (`ai_screening_batch`, já observável por polling);
  botões Aceitar/Editar/Rejeitar (escritas rápidas de banco); novos FR; dark mode.
- **Depende de:** Fatia 2 (os dois botões existem) e Fatia 7 (design system) mergeadas.
- **Skills:** `frontend-design`, `react-best-practices`.
- **Testes-chave:** unit — botão desabilita e exibe estado de pendência enquanto a
  action não resolve; volta ao normal após resolver (sucesso **e** erro); rótulo/aria
  refletem o estado; `prefers-reduced-motion` desliga a animação.

### Fatia 11 — Re-derivação segura de critérios (idempotência + guarda de fase) (2026-06-05)
- **Branch:** `build/001-marco1-nucleo-fluxo/11-criteria-rederivation-guard`
- **Natureza:** fatia de **correção/melhoria pós-Marco funcional**, acrescentada após
  constatação do desenvolvedor. **Não** adiciona FR nem altera decisão assinada (D);
  **reforça** FR-007/008 (ratificação), FR-010 (trava na 1ª decisão de triagem) e
  FR-011 (emendas). Deriva de `docs/CONTEXT.md` e `spec.md`.
- **Motivação:** `deriveCriteria` ([app/reviews/[reviewId]/question/actions.ts](../../../app/reviews/%5BreviewId%5D/question/actions.ts))
  faz `insert` **cego** a cada clique (novo `ai_suggestion` + lote de
  `eligibility_criterion` todos `pending`), sem idempotência nem guarda de fase. Dois
  sintomas: **(1)** clicar N× duplica/dobra os critérios; **(2)** voltar de uma fase
  adiante (ex.: T/R) e re-derivar despeja pendentes sobre uma base **já comprometida**
  (protocolo travado, motivos de exclusão derivados na Fatia 8).
- **Decisões de implementação resolvidas (A-11.x), aprovadas pelo desenvolvedor:**
  - **A-11.1 — sinal de fase = `protocol.state='locked'`** (canônico: a trava ocorre na
    1ª decisão de triagem, FR-010). A página passa a ler o estado do protocolo.
  - **A-11.2 — supersede:** antes de inserir, apaga `eligibility_criterion` com
    `origin='ai' AND ratification_state='pending'` do review; **preserva** humanos e
    ratificados (`accepted`/`edited`/`rejected`). Mantém `ai_suggestion` (proveniência).
  - **A-11.3 — dedupe inteligente:** o lote novo é deduplicado por **rótulo
    normalizado** (reusa o normalizador da Fatia 8) contra os critérios sobreviventes —
    a IA não re-propõe o que já foi aceito/editado nem re-empurra o que foi rejeitado.
  - **A-11.4 — guarda autoritativa server-side** no caminho de derivação (recusa quando
    travado), **+** desabilitação na UI. Forma fina (action vs. RPC transacional
    reusando o padrão das Fatias 8/8.1) decidida no `writing-plans`.
  - **A-11.5 — pós-trava = bloquear + nota** apontando a **emenda de protocolo**
    (FR-011) na página do Protocolo (mecanismo já existe na Fatia 2). **Sem** nova UI de
    emenda na Pergunta.
- **Entra:**
  - **Camada 1 (idempotência):** supersede de pendentes (A-11.2) + dedupe (A-11.3) no
    `deriveCriteria`; auditoria registra a regeração (`derive_criteria`, before/after).
  - **Camada 2 (affordance):** o botão vira **"Regerar sugestões"** quando já há
    critérios de IA, com **confirmação** ("substitui as sugestões ainda não ratificadas;
    seus aceitos/editados permanecem"). Sem critérios de IA → continua "Derivar por IA".
  - **Camada 3 (guarda de fase):** `question/page.tsx` lê o estado do protocolo; travado
    ⇒ botão desabilitado + nota apontando emenda (A-11.5); guarda server-side (A-11.4).
- **Não entra:** UI de emenda inline na Pergunta (segue no Protocolo); dedup **semântico**
  por embeddings (Marco 2+); motivo de exclusão no T/R (emenda a D7 → Sessão A);
  alteração de `LLMProvider.deriveEligibility` ou do contrato factual.
- **Depende de:** Fatia 2 (`question`/`eligibility_criterion`/`protocol`/ratificação/
  `LLMProvider`), Fatia 5 (trava do protocolo na 1ª decisão, FR-010), Fatia 8
  (normalizador de rótulo), Fatia 10. **Todas mergeadas.**
- **Skills:** `react-best-practices`, `nextjs-best-practices`, `frontend-design`
  (affordance "Regerar"/confirmação).
- **Testes-chave:**
  - **integração (banco direto):** regerar 2× converge para **um** conjunto pendente
    (não dobra); ratificados preservados; dedupe não re-propõe rótulo já aceito/rejeitado;
    derivação **recusa** quando `protocol.state='locked'`.
  - **unit (componente):** botão exibe "Regerar sugestões" + confirmação quando há
    critérios de IA; desabilitado com nota quando travado; primeira derivação inalterada.
  - `lint` + `tsc --noEmit` limpos.

### Fatia 12 — Visualização do markdown no editor de Protocolo (2026-06-05)
- **Branch:** `build/001-marco1-nucleo-fluxo/12-protocol-markdown-preview`
- **Natureza:** melhoria de **UX pós-Marco funcional**, acrescentada após constatação do
  desenvolvedor. **Não** adiciona FR nem altera decisão assinada (D); melhora a
  usabilidade do `ProtocolEditor` (Fatia 2), que hoje mostra o markdown gerado pela IA
  com os marcadores crus. Deriva de `spec.md`/design system.
- **Motivação:** o campo do protocolo é um `<textarea>` único
  ([src/components/protocol/ProtocolEditor.tsx](../../../src/components/protocol/ProtocolEditor.tsx));
  o `.md` aparece sem formatação. Falta um modo de leitura renderizado.
- **Decisões de implementação resolvidas (A-12.x), aprovadas pelo desenvolvedor:**
  - **A-12.1 — renderização:** `react-markdown` + `remark-gfm`, com `components` mapeando
    os elementos (`h1/h2/h3/ul/ol/li/strong/em/blockquote/code/pre/a/table`) às classes do
    design system (`text-ink`, `text-ink-soft`, …). **Sem** `rehype-raw` (anti-XSS). Reset
    opinativo do `prose` descartado por destoar do tema paper/ink.
  - **A-12.2 — modo padrão contextual:** `mode = locked ? "preview" : "edit"`. Rascunho
    abre em Editar (autor escrevendo); travado abre em Visualizar (read-only). Toggle
    disponível nos dois estados.
  - **A-12.3 — preview lê o buffer vivo** (`md` no estado, incl. edições não salvas);
    WYSIWYG do que se está escrevendo, não a versão persistida.
  - **A-12.4 — conteúdo vazio:** placeholder discreto ("Sem conteúdo.").
- **Entra:**
  - Novo componente puro `src/components/protocol/MarkdownPreview.tsx` (recebe
    `markdown: string`).
  - `ProtocolEditor` ganha estado `mode` + toggle segmentado "Editar · Visualizar"
    (`role="tab"`/`aria-selected`, padrão ARIA já usado no projeto); `edit` → `<textarea>`
    atual, `preview` → `<MarkdownPreview>`.
- **Não entra (YAGNI):** editor rico/WYSIWYG, barra de formatação, render das emendas,
  mudança no export `.md` (já existe), syntax highlighting de code fences.
- **Depende de:** Fatia 2 (`ProtocolEditor`) e Fatia 7 (design system). **Ambas mergeadas.**
- **Dependências novas (autorizadas por esta tarefa — A-12.1):** `react-markdown`,
  `remark-gfm`. Desvio registrado conforme constituição ("deps novas só por tarefa
  explícita").
- **Skills:** `react-best-practices`, `nextjs-best-practices`, `frontend-design`.
- **Testes-chave:**
  - **unit (componente):** alterna edit↔preview ao clicar o toggle; `# Título` vira
    `role="heading"`; default contextual (travado→preview, rascunho→edit); preview reflete
    edição não salva; HTML cru no markdown **não** vira elemento ativo (sem `rehype-raw`).
  - `lint` + `tsc --noEmit` limpos.
### Fatia 13 — Polish do modo Importar (2026-06-08)
- **Branch:** `build/001-marco1-nucleo-fluxo/13-import-mode-polish`
- **Natureza:** polish de **UX pós-Marco funcional**, acrescentada após constatação do
  desenvolvedor. **Não** adiciona FR nem altera decisão assinada (D); **sem migration**.
  Mesmo padrão das Fatias 7/10/12. Cobre três defeitos do modo Importar
  ([src/components/workbench/ImportPanel.tsx](../../../src/components/workbench/ImportPanel.tsx)).
- **Motivação:** o modo Importar usa um `<input type="file">` **nativo, sem estilo** (não
  passou pela repaginação da Fatia 7); a string de busca começa vazia mesmo havendo termos
  já derivados por IA na Pergunta; e o campo `hits` mostra `0` mesmo após o preview já
  conhecer a contagem de registros do arquivo.
- **Decisões de implementação resolvidas (A-13.x), aprovadas pelo desenvolvedor:**
  - **A-13.1 — single-file mantido.** Não se introduz seleção de múltiplos arquivos; o
    modelo atual (1 arquivo = 1 registro de busca = 1 `search_id`) permanece.
  - **A-13.2 — string de busca semeada, não imposta.** O `query_string` é pré-preenchido
    a partir dos `eligibility_criterion` com `kind='search_term'` do review como **sugestão
    editável** (ponto de partida; não é a query booleana final por base). Só semeia se
    houver termos; o autor pode sobrescrever.
  - **A-13.3 — `hits` semeado pela contagem do arquivo, editável.** Ao parsear, `hits`
    recebe `preview.length`; o autor pode ajustar (a base pode reportar nº diferente do
    exportado). Default ≠ trava.
- **Entra:**
  - **Controle de arquivo estilizado:** substitui o input nativo por um controle do design
    system (input real visualmente oculto + label `htmlFor="import-file"` com `.field`/`.btn`),
    mostrando o nome do arquivo escolhido (ou "Nenhum arquivo escolhido" enquanto vazio).
    **Mantém** `accept`, `onChange`, single-file e o **`id="import-file"`** (invariante: os
    e2e de `import.spec.ts` setam o arquivo nesse id — não pode quebrar).
  - **String de busca semeada (A-13.2):** a página (server) busca os termos e passa
    `suggestedQuery` ao `ImportPanel`; vira `defaultValue` de `queryString`.
  - **`hits` auto-preenchido (A-13.3):** `setValue("hits", preview.length)` no parse.
- **Não entra (YAGNI):** múltiplos arquivos; composição de query booleana por base;
  edição do registro de busca após confirmar; nova FR; dark mode.
- **Depende de:** Fatia 2 (`eligibility_criterion`/`search_term`), Fatia 3 (modo Importar,
  `ImportPanel`, `search`), Fatia 7 (design system). **Todas mergeadas.**
- **Skills:** `frontend-design`, `react-best-practices`, `nextjs-best-practices`.
- **Testes-chave:**
  - **unit (componente):** controle exibe o nome do arquivo escolhido; `queryString`
    semeado quando há `search_term` (e vazio quando não há); `hits` reflete a contagem
    após o parse e permanece editável.
  - **e2e `import.spec.ts` verde e inalterado** (repaginação preserva `id`/atributos).
  - `lint` + `tsc --noEmit` limpos.

### Fatia 14 — Histórico de buscas importadas (2026-06-08)
- **Branch:** `build/001-marco1-nucleo-fluxo/14-import-history-list`
- **Natureza:** **leitura** pós-Marco funcional, acrescentada após constatação do
  desenvolvedor. **Não** adiciona FR nem altera decisão assinada (D); **sem migration**;
  **não desfaz nada** — apenas lista. Não toca auditoria (FR-035 append-only) nem PRISMA.
- **Motivação:** não há hoje nenhuma visão das importações já feitas. O desenvolvedor pediu
  uma lista simples (sem reversão) para conferir o que já entrou no corpus.
- **Decisão de escopo (aprovada pelo desenvolvedor):** a ideia original de "desfazer
  importação" foi **descartada** desta fatia por ser destrutiva e colidir com decisões
  downstream (dedup/triagem), com a trava do protocolo (FR-010) e com a trilha de auditoria
  append-only. Fica como possível fatia futura, com regras próprias. Esta fatia é só o
  **histórico read-only**.
- **Entra:**
  - **Query nova** `listSearches(reviewId)` ([src/lib/search/queries.ts](../../../src/lib/search/queries.ts)):
    lê `search` + contagem de `record` por `search_id` via `select('*, record(count)')` do
    PostgREST (sem N+1, **sem migration**). RLS já cobre por membership; passa por
    `requireMember`.
  - **Painel "Importações anteriores"** no **modo Importar** do workbench (mesma superfície
    — Princípio V, nenhuma rota nova), **read-only**, uma linha por busca com: **base de
    dados** (`database`), **data da importação** (`created_at`, exibida `dd/mm/aaaa`) e
    **quantidade de artigos** (contagem de `record`). Vazio → estado discreto
    ("Nenhuma importação ainda."). Tema do design system.
- **Não entra (YAGNI):** desfazer/reverter importação; editar o registro de busca; expandir
  artigos da busca; paginação/filtro; nova FR.
- **Depende de:** Fatia 3 (`search`/`record`/workbench/modo Importar), Fatia 7 (design
  system). **Ambas mergeadas.**
- **Skills:** `react-best-practices`, `nextjs-best-practices`, `frontend-design`.
- **Testes-chave:**
  - **integração (banco direto):** `listSearches` retorna **uma linha por busca** com a
    contagem de `record` correta (estável mesmo após dedup, que altera `corpus_state` e não
    apaga linhas); isolamento por review (RLS).
  - **unit (componente):** painel renderiza uma linha por busca com `database`, data
    `dd/mm/aaaa` e contagem; estado vazio quando não há importações.
  - `lint` + `tsc --noEmit` limpos.

### Fatia 15 — Painel de detalhe do registro na triagem T/R (2026-06-08)
- **Branch:** `build/001-marco1-nucleo-fluxo/15-record-detail-panel`
- **Natureza:** melhoria de **UX pós-Marco funcional**, acrescentada após constatação do
  desenvolvedor. **Não** adiciona FR; ao contrário, **cumpre FR-041/D32** — a superfície
  "detalhe" do mestre-detalhe (DESIGN-DECISIONS §"Anatomia: mestre-detalhe") que as Fatias
  1–6 deixaram parcial (entregaram só o lado "mestre"/fila). **Sem migration** — o dado já
  está em `record.metadata` e `record.raw`. Deriva de `spec.md` (FR-041, FR-038) e
  [docs/DESIGN-DECISIONS.md](../../../docs/DESIGN-DECISIONS.md) §"Anatomia".
- **Motivação:** hoje a fila de triagem só exibe `title` + `year` por linha
  ([ScreeningQueue.tsx](../../../src/components/workbench/ScreeningQueue.tsx)); autores,
  periódico, DOI, idioma, resumo e palavras-chave — presentes no banco — não chegam a ser
  exibidos. Falta o painel de detalhe que o design canônico prescreve.
- **Decisões de implementação resolvidas (A-15.x), aprovadas pelo desenvolvedor:**
  - **A-15.1 — escopo: só Título/Resumo.** O painel aparece apenas no modo `title_abstract`.
    Texto completo, Duplicatas e Importar ficam **intactos**.
  - **A-15.2 — layout A (split local, shell intacto).** O `main` do workbench no T/R passa a
    `[fila | detalhe]`; o `JobsPanel` (Consumo de IA / jobs / Exportar auditoria) permanece na
    faixa de 268px do shell. **Nenhuma** mudança no `app/reviews/[reviewId]/layout.tsx`
    compartilhado (layout B — gaveta do JobsPanel / cirurgia no shell — descartado).
  - **A-15.3 — campos: normalizados + periódico/palavras-chave do `raw`.** Título, autores,
    ano, DOI, idioma, resumo saem de `metadata`; periódico, palavras-chave (+ volume/issue/
    páginas quando houver) são extraídos de `record.raw` com leitura **ciente do formato**
    (RIS `JO`/`JF`/`T2`+`KW`; BibTeX `journal`/`keywords`; CSV cabeçalhos case-insensitive).
    Sem re-importar (o `raw` já está persistido). **Busca sob demanda ao focar** (TanStack
    Query, cache por `recordId`) — não incha o payload de ~5.000 linhas (orçamento A2).
  - **A-15.4 — sem IA no painel; FR-024/D12 preservados intactos.** O painel **não** renderiza
    sugestão de IA (o revisor lê título+resumo e decide). O **chip de IA inline na fila do
    T/R** (FR-024/D12, pré-classificação anexada) permanece **exatamente como hoje** — **nada**
    da IA é tocado, **sem** emenda à Sessão A.
- **Entra:**
  - **Módulo puro** `src/lib/record/raw-fields.ts`: `extractRawFields(format, raw)` →
    `{ journal, keywords[], volume?, issue?, pages? }`, mapas de chave por formato; nulos
    graciosos. Testável isolado (≥80%, constitution §Testes).
  - **Query** `getRecordDetail(recordId)` (`src/lib/record/queries.ts`): lê `metadata` +
    `source_format` + `raw`, aplica a extração; RLS por membership (`requireMember`); server
    action `fetchRecordDetail`.
  - **Componente** `src/components/workbench/RecordDetail.tsx`: autores (ano) · título ·
    periódico · DOI · idioma · palavras-chave · resumo rolável; campos ausentes omitidos;
    tema do design system; `role`/labels ARIA, foco visível (espírito FR-041).
  - **`ScreeningQueue` (T/R):** emite o `recordId` focado (já rastreia `focusIdx`) e renderiza
    o `RecordDetail` ao lado **somente** no estágio `title_abstract`. Sem painel no `full_text`.
- **Não entra (YAGNI):** painel no Texto completo/Duplicatas/Importar; layout B (gaveta do
  JobsPanel / cirurgia no shell); edição de metadados; IA no painel ou qualquer mudança no
  chip inline (seria emenda a D12 → Sessão A); conteúdo de PDF/texto completo (Marco 2); nova FR.
- **Depende de:** Fatia 3 (`record`/`raw`/workbench/modos), Fatia 5 (`ScreeningQueue`,
  `focusIdx`, modo T/R), Fatia 7 (design system). **Todas mergeadas.**
- **Skills:** `frontend-design`, `react-best-practices`, `nextjs-best-practices`.
- **Testes-chave:**
  - **unit:** `extractRawFields` por formato — RIS `KW` único vs. array, `JO`/`JF`/`T2`;
    BibTeX `keywords` (split `;`/`,`) e `journal`; CSV cabeçalho case-insensitive; campos
    ausentes → nulos.
  - **integração (banco direto):** `getRecordDetail` devolve normalizados + extraídos do raw;
    isolamento por review (RLS).
  - **unit (componente):** `RecordDetail` renderiza os campos, **omite** ausentes, mostra
    resumo; **sem** bloco de IA. `ScreeningQueue`: focar linha (`j`/`k`) atualiza o detalhe.
  - **e2e:** T/R foca um registro → painel mostra periódico/palavras-chave; modo `full_text`
    **sem** painel (inalterado).
  - **gate:** suites e2e/perf/a11y de triagem (Fatia 5) **verdes e inalteradas**; chip de IA
    inline preservado; `lint` + `tsc --noEmit` limpos.

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
- [x] Fatia 4 — Deduplicação (mergeada — merge `82dcab5`)
- [x] Fatia 5 — Triagem 2 etapas + IA-no-laço (CHECKPOINT 3 — mergeada)
- [x] Fatia 6 — Shell, trilho & PRISMA vivo + export de auditoria (CHECKPOINT 3 — mergeada)
- [x] Fatia 7 — Design System + Polish Visual (CHECKPOINT 3 — mergeada — merge `bc962a8`)
- [x] Fatia 8 — Motivos de exclusão derivados dos critérios (CHECKPOINT 3 — mergeada — merge `8a55408`)
- [x] Fatia 8-1 — Remoção segura de motivo de exclusão em uso (CHECKPOINT 3 — mergeada — merge `92c4421`)
- [x] Fatia 9 — Correção da semântica PRISMA (fluxo cumulativo) (CHECKPOINT 3 — mergeada — merge `c9c4e64`)
- [x] Fatia 10 — Indicador de processamento nos gatilhos síncronos de IA (CHECKPOINT 3 — mergeada — merge `468f878`)
- [x] Fatia 11 — Re-derivação segura de critérios (idempotência + guarda de fase) (CHECKPOINT 3 — mergeada — merge `14aa0dc`)
- [x] Fatia 12 — Visualização do markdown no editor de Protocolo (CHECKPOINT 3 — mergeada — merge `21192d3`)
- [x] Fatia 13 — Polish do modo Importar (CHECKPOINT 3 — mergeada — merge `dc7c84f`)
- [x] Fatia 14 — Histórico de buscas importadas (CHECKPOINT 3 — mergeada — merge `6d9c355`)
- [x] Fatia 15 — Painel de detalhe do registro na triagem T/R (CHECKPOINT 3 — mergeada — merge `70f76c5`)
