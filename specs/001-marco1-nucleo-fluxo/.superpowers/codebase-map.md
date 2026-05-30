# Codebase Map — Marco 1 (`001-marco1-nucleo-fluxo`)

**Produzido por:** Sessão B (mapeamento inicial — PRIMEIRO trabalho).
**Data:** 2026-05-30 (UTC).
**Método:** `git ls-files` + inspeção de raiz e diretórios-chave.

> Este mapa ancora a fatiação e o planejamento no **estado real** do
> repositório. Conclusão: o Marco 1 é **greenfield** — não há código de
> aplicação. Tudo o que a Sessão B construir é novo.

---

## 1. Veredito: greenfield

**Nenhum código de aplicação existe.** Ausentes na raiz:

- `package.json` / `node_modules/` — **projeto Node não inicializado**.
- `app/`, `src/`, `tests/` — **sem código-fonte**.
- `supabase/` — **sem migrations nem Edge Functions**.
- Sem `tsconfig.json`, `next.config.*`, config de Tailwind, ESLint,
  Prettier, Vitest ou Playwright.

Consequência para a fatiação: a **primeira fatia** terá de incluir o
bootstrap do projeto (Next.js + TS strict + Tailwind + toolchain de
testes/lint) **ou** isso é uma fatia-zero de fundação. Decisão fica para
o `brainstorming`. Não há trabalho herdado a preservar — a diretiva de
não-regressão (Marco ≥ 2) **não se aplica** aqui (primeiro marco).

---

## 2. O que existe hoje (inventário)

### Configuração de ambiente

- `.editorconfig` — utf-8, LF, indent 2 espaços, final newline, trim
  trailing. (Vincula o estilo de formatação do código futuro.)
- `.gitignore` — já ciente de Node, `.next/`, `coverage/`,
  `playwright-report/`, `test-results/`, `supabase/.branches|.temp`, e
  **`.worktrees/`** (worktrees isolados das fatias) e
  `.claude/settings.local.json` (perfil ativo não-versionado).
- `.env.example` — Supabase local (`NEXT_PUBLIC_SUPABASE_URL`,
  anon/service-role keys) + variáveis de BYOK. **Ver §4 — discrepância.**
- `.env.local` — presente, **não versionado** (gitignored). Não inspecionado.

### Documentação canônica e de design

- `docs/CONTEXT.md` — Discovery assinada (D1–D32). Canônico.
- `docs/DESIGN-DECISIONS.md` — insumo de UX/frontend (não-canônico;
  consumido na Sessão A, promovido aos artefatos). Origem das FR-039/040/041.
- `README.md` — stub (11 bytes).

### Spec-kit (`.specify/`)

- `memory/constitution.md` — 8 princípios, v1.0.0. Canônico.
- `templates/`, `scripts/` (bash + powershell), `workflows/`, extensão
  `git/`. Ferramental da Sessão A; não é código de produto.

### Artefatos da feature (`specs/001-marco1-nucleo-fluxo/`)

- `spec.md` (7 US, 41 FR, 13 SC), `plan.md`, `research.md` (R1–R7),
  `data-model.md` (entidades + RLS + máquina de estados + mapeamento
  PRISMA), `contracts/` (`llm-provider.md`, `async-jobs.md`,
  `import-parsers.md`), `quickstart.md`, `checklists/requirements.md`,
  `HANDOFF.md`.
- `.superpowers/` — este `codebase-map.md`. Ainda **sem** `slicing.md`,
  `IMPLEMENTATION_PLAN.md` (na raiz da feature), `COMPLETION.md`.

### Harness Claude (`.claude/`)

- `PROTOCOLS.md` — regras do Air-Gap Handoff.
- `profiles/` — `session-a-discovery.json`, `session-b-gsd.json`
  (legado), `session-c-superpowers.json` (legado; PROTOCOLS pede renomear
  para `session-b-build`). `scripts/activate-profile.sh`. `settings.json`.
- `skills_desativada/` — diretório não rastreado (skills speckit movidas
  para fora; estão como `D` no `git status`). Irrelevante para o build.

---

## 3. Layout-alvo (do plan.md — a materializar)

O `plan.md` §Project Structure define o destino (ainda inexistente):

```
app/            # Next.js App Router (RSC default)
  (auth)/ · reviews/ · reviews/[reviewId]/{question,protocol,workbench}/
src/
  components/{ai,workbench,shell}/ · hooks/ · lib/{ai/llm,import,dedup,
  jobs,supabase,prisma-counters}/ · types/
supabase/
  migrations/ · functions/{jobs-enqueue,jobs-worker}/
tests/
  unit/ · integration/ · e2e/
```

Invariante de estrutura (Princípio V / FR-027): **`workbench/` é
superfície única** com 4 modos (Importar | Duplicatas | T/R | Texto
completo). Nenhuma fatia pode quebrar isso em rotas separadas.

---

## 4. Discrepância a reconciliar — `.env.example` vs. design canônico

O `.env.example` descreve um esquema de BYOK que **não corresponde** ao
design canônico desta feature:

| `.env.example` (resíduo)                    | Canônico (R5 / data-model `byok_key`)                |
| ------------------------------------------- | ---------------------------------------------------- |
| `BYOK_MASTER_KEY` + cifragem por master-key | **Supabase Vault** (cifra em repouso)                |
| tabela `byok_keys`, `private.app_secrets`   | tabela `byok_key` + `vault_secret_id`                |
| `resolveLLMKey()`, `ANTHROPIC_BYOK_DEV`     | abstração `LLMProvider`, chave decifrada server-side |
| anotações "A4", "A7", "migration 0009"      | nenhuma migration existe (greenfield)                |

**Hipótese:** o `.env.example` é resíduo do **"build anterior" descartado**
(o mesmo citado na constitution §I _Rationale_ e em D32 — o build que
fragmentou a triagem). As migrations 0001–0009 que ele pressupõe **não
existem** no repositório.

**Regra:** a fonte de verdade é **R5 (Supabase Vault)** + `data-model.md`
`byok_key`. O `.env.example` **não é autoritativo**. Quando a fatia que
introduz BYOK for planejada (`writing-plans`), uma tarefa explícita deve
**reescrever o `.env.example`** para refletir o Vault, removendo
`BYOK_MASTER_KEY`/`app_secrets`/`byok_keys`. Sinalizar no `brainstorming`.

---

## 5. Implicações para a fatiação (insumo ao brainstorming)

- **Fundação primeiro:** sem `package.json` nem toolchain, a 1ª fatia (ou
  uma fatia-zero) inicializa Next.js + TS strict + Tailwind + Vitest +
  Playwright + ESLint/Prettier. Dependências entram **por tarefa explícita**
  (constitution §Portões).
- **Migration + RLS antes do código** (Princípio IV): a fatia de schema
  precede qualquer fatia que consuma o schema. RLS na 1ª migration.
- **`.env.example` é resíduo** — não derivar nada dele; reconciliar na
  fatia de BYOK (§4).
- **Nada a preservar:** greenfield, sem código herdado; a diretiva de
  não-regressão de marcos ≥ 2 não se aplica.
- **Itens A\* do HANDOFF** a alocar: A1 (formato export da trilha),
  A2 (orçamento de perf da fila ~5.000), A3 (libs de parsing RIS/BibTeX/CSV
  - TanStack Virtual, por tarefa explícita).
