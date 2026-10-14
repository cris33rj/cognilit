# Project conventions for Claude Code

Este projeto (**Cognilit**) usa o workflow **Air-Gap Handoff** com
**duas sessões**: Sessão A (grill-me + spec-kit) para discovery/spec, e
Sessão B (Superpowers) para fatiação + planejamento + execução de
programação.

**Antes de qualquer ação, leia `.claude/PROTOCOLS.md`.** Ele define os
artefatos obrigatórios, os protocolos de entrada/saída de cada sessão,
o protocolo de retorno em caso de blocker, e as três decisões de
arquitetura que regem todo o trabalho neste repositório.

**Fonte de verdade de produto:** `docs/CONTEXT.md` contém as decisões de
Discovery assinadas (D1–D31). Spec, plan e plano de implementação devem
derivar dele. Hierarquia de autoridade em caso de conflito:
`docs/CONTEXT.md` > `.specify/memory/constitution.md` > este arquivo >
`specs/NNN-<slug>/plan.md`.

**Insumo de design (não-canônico):** `docs/DESIGN-DECISIONS.md` reúne decisões
de UX/frontend destiladas das ferramentas de RSL de mercado. É **consumido na
Sessão A** (spec-kit) e promovido a `constitution.md`/`spec.md`/`plan.md`. NÃO é
fonte de verdade, NÃO entra na lista de leitura da Sessão B (que lê os artefatos
canônicos que o absorvem), e suas emendas (§9) só têm força após ratificação na
Sessão A.

---

## CONTRATO DE ENTRADA DA SESSÃO B (ler antes de qualquer skill)

Esta seção tem **prioridade sobre o comportamento default de qualquer
plugin ou skill**, incluindo as instruções de bootstrap e as skills do
Superpowers. A hierarquia de prioridade do próprio Superpowers confirma
isto: instruções do usuário (este arquivo) > skills > system prompt.
Onde esta seção contraria o comportamento default de uma skill, **esta
seção vence**.

Se você (Claude) está iniciando uma sessão de build, execute o que
segue **antes** de acionar `brainstorming`, `writing-plans` ou qualquer
outra skill.

### 0. Identificar a feature ativa

A feature ativa é a nomeada no bloco `<!-- SPECKIT -->` no fim deste
arquivo, no formato `NNN-<slug>`. **Todos** os caminhos abaixo são
derivados dela: handoff, spec, plan e contratos vivem dentro de
`specs/NNN-<slug>/`. Não existe `HANDOFF.md` na raiz do repo.

### 1. Leitura ordenada obrigatória

Sendo `NNN-<slug>` a feature ativa, leia, **nesta ordem exata**, antes
de prosseguir:

1. `specs/NNN-<slug>/HANDOFF.md` — contrato da feature; carta de
   instruções desta sessão
2. `docs/CONTEXT.md` — Discovery assinada (decisões D)
3. `.specify/memory/constitution.md` — invariantes não-negociáveis
4. `specs/NNN-<slug>/spec.md` — especificação da feature ativa
5. `specs/NNN-<slug>/plan.md` — plano técnico da feature ativa
6. os contratos em `specs/NNN-<slug>/contracts/`, se existirem

### 2. Confirmação obrigatória antes de prosseguir

Terminada a leitura, **pare** e confirme ao usuário, em **uma a três
frases**, o que entendeu do `HANDOFF.md`: qual feature, qual marco, o
que a Sessão A já completou, e o que esta sessão deve fazer. Se algo não
bate com os artefatos, **pare e pergunte** — não prossiga.

Esta confirmação não é cerimônia: o `CLAUDE.md` é a única peça com
carregamento automático garantido; a leitura dos demais arquivos
depende de você obedecer a esta instrução. A confirmação em voz alta é
o que torna o contrato **verificável** em vez de presumido.

### 3. Papel do `brainstorming` nesta sessão

O design de produto **já foi feito** na Sessão A. `CONTEXT.md`,
`constitution.md` e `spec.md` estão sign-off e são canônicos.

O `brainstorming`, aqui, **NÃO** re-elicita requisitos de produto, não
refaz discovery, não re-pergunta o que o `CONTEXT.md` já decidiu. Ele
tem **dois** trabalhos, e só dois:

- **(a)** esclarecer as **ambiguidades de implementação** listadas no
  `HANDOFF.md` (itens A1, A2, …);
- **(b)** decidir a **fatiação** do Marco em sub-projetos, dentro do
  perímetro de restrições da seção `## Perímetro de fatiação` do
  `HANDOFF.md`.

O `brainstorming` termina escrevendo
`specs/NNN-<slug>/.superpowers/slicing.md` e **para para o usuário
aprovar a fatiação** (CHECKPOINT 1). Nenhum `writing-plans` roda antes
dessa aprovação.

### 4. As três decisões de arquitetura (regime desta sessão)

Detalhadas em `.claude/PROTOCOLS.md` §"As três decisões desta
arquitetura". Em resumo:

- **Consolidação.** O Superpowers conduz **fatiação, planejamento E
  execução** numa única sessão. Nenhuma fase é delegada a outro plugin.
  (GSD foi removido do fluxo.)
- **Execução fatiada.** O Superpowers v5 não tem modo nativo de execução
  "em batches". O controle por pedaços vem da **fatiação do Marco**: o
  `brainstorming` decide as fatias; cada fatia roda seu próprio ciclo
  `writing-plans` → `subagent-driven-development`. O motor de execução é
  o `subagent-driven-development` (`executing-plans` é fallback para
  harnesses sem subagente — não se aplica ao Claude Code).
- **Commit em branch isolado, parada obrigatória por fatia, merge
  manual.** Você (Claude) commita como parte do ciclo TDD, mas
  **somente** no branch de trabalho isolado da fatia,
  `build/NNN-<slug>/<n>-<slug-da-fatia>`. Você **NUNCA** faz `git merge`
  nem `git push` para a branch da feature ou `main`.

### 5. Parada obrigatória entre fatias — sobrepõe a skill

O `subagent-driven-development` do v5, por padrão, executa de forma
**contínua** e só para em blocker. **Este contrato sobrepõe esse
comportamento.** A regra desta sessão é absoluta:

- Ao fim de **cada** fatia — sem exceção, mesmo com tudo verde — você
  **PARA** (CHECKPOINT 3). Apresenta ao desenvolvedor o branch da fatia,
  o diff, e o resultado de testes + `npm run lint` + `tsc --noEmit`.
- Você **aguarda**. O desenvolvedor revisa e faz o `merge` manualmente.
- **Nenhuma fatia seguinte começa** antes de o desenvolvedor confirmar
  o merge. Você **não encadeia fatias**. Uma fatia por vez.

Se uma skill instruir execução contínua através de fatias, **esta seção
vence** — pare na fronteira de cada fatia.

### 6. Artefatos de saída — onde escrever

Todos os artefatos que esta sessão produz vivem **dentro** de
`specs/NNN-<slug>/`, nunca na raiz: o `IMPLEMENTATION_PLAN.md` solto em
`specs/NNN-<slug>/`; o `codebase-map.md`, o `slicing.md`, o
`COMPLETION.md` e eventuais `BLOCKERS.md` em
`specs/NNN-<slug>/.superpowers/`. Handoffs e completions de marcos
anteriores **não são sobrescritos** — cada feature guarda os seus.

### 7. Sequência de skills (Superpowers v5.1.0 — sem slash commands)

Os slash commands legados foram removidos no v5.1.0. Invoque as skills
por nome (`superpowers:<skill>`) ou deixe-as disparar pela intenção. A
sequência: mapear base de código → `brainstorming` (A\* + fatiação,
CHECKPOINT 1) → por fatia: `writing-plans` (CHECKPOINT 2) →
`using-git-worktrees` → `subagent-driven-development` → PARAR
(CHECKPOINT 3) → aguardar merge → próxima fatia.

---

## Stack tecnológica

- **Frontend:** React 18+ com TypeScript, Tailwind CSS 4, TanStack Table (tabelas de triagem), TanStack Query (cache/sincronização de dados do servidor)
- **Backend/BaaS:** Supabase (PostgreSQL, Auth, Row Level Security, pgvector, Edge Functions, Storage)
- **Framework:** Next.js 14+ (App Router)
- **Linguagem:** TypeScript (strict mode) em todo o projeto
- **Testes:** Vitest (unit), Playwright (e2e)
- **Observabilidade:** Sentry (monitoramento de erros em produção)
- **Deploy:** Vercel com possibilidade de deploy também em vps da hostinger
- **Monorepo:** Não — projeto single-app

## Convenções de código

### Geral

- Idioma do código (variáveis, funções, componentes, tipos): **inglês**
- Idioma da interface (labels, mensagens, textos): **português brasileiro (pt-BR)**
- Datas: armazenar como `DATE` no banco, exibir como `dd/mm/aaaa` na UI

### TypeScript

- Strict mode habilitado
- Preferir `interface` sobre `type` para objetos
- Usar `enum` apenas no banco; no frontend, usar `as const` + union types
- Sem `any` — usar `unknown` quando necessário

### React / Next.js

- Componentes funcionais com hooks
- Server Components por padrão; `'use client'` somente quando necessário
- Colocar lógica de negócio em hooks customizados (`use*.ts`)
- Formulários com React Hook Form + Zod para validação
- Nomenclatura de componentes: PascalCase, um componente por arquivo

### Supabase

- Todas as tabelas com Row Level Security (RLS) habilitado
- Queries tipadas via `supabase-js` com tipos gerados
- Migrations versionadas em `supabase/migrations/`
- Edge Functions **apenas para trabalho curto e síncrono**: validação,
  orquestração, deduplicação de exatas, enfileiramento de jobs. Uma
  Edge Function nunca executa trabalho pesado ou de duração imprevisível.
- Trabalho pesado ou demorado — parsing de PDF, geração de embeddings em
  lote, exportação de relatório — roda como **job assíncrono** (ver D25,
  D31): retomável, resiliente a falha por-item, com status persistido.
  A Edge Function de upload só enfileira; o worker processa.

### Dados bibliográficos

- Parsing de formatos de importação: RIS, BibTeX, CSV
- Geração do fluxograma PRISMA (SVG/PNG) e exportação do relatório em DOCX, PDF e Markdown; referências bibliográficas exportadas em BibTeX/RIS.
- Bibliotecas de parsing executadas no worker assíncrono, não em Edge
  Functions (ver D31)

### IA — LLM e Embeddings

O projeto tem **dois provedores de IA independentes**, cada um atrás de
sua própria abstração trocável e cada um com sua própria chave BYOK
cifrada. Não confundir os dois eixos.

**LLMProvider** (geração — triagem, extração, síntese, redação, CERQual)

- Toda chamada a LLM passa pela abstração `LLMProvider`; nenhum código
  de feature instancia um SDK de fornecedor diretamente.
- Default: **Claude (Anthropic)**. Provedor trocável via configuração.
- Chave do usuário (**BYOK, 1ª chave**), cifrada em repouso.
- O `LLMProvider` é o ponto único que: expõe `modelo` e `versão` para a
  camada de proveniência; fixa o idioma de saída em pt-BR; e garante o
  contrato de saída factual (`{value, source_span, page}` ou
  `{value: null, reason: "not_found"}`). Não há "raw write" de saída
  de IA que contorne essa camada.

**EmbeddingProvider** (busca semântica / RAG)

- Provedor de embeddings via abstração `EmbeddingProvider` (trocável).
- Default: **Voyage AI** hospedado (**BYOK, 2ª chave**, cifrada em
  repouso, distinta da chave do LLM). Modelo local in-process
  (transformers.js / bge-m3 / multilingual-e5) plugável como
  alternativa futura.
- Vetores persistidos no Supabase via pgvector; o schema acomoda
  **dimensão variável** do vetor (o provedor define a dimensão).
  Índice HNSW para busca por similaridade.

### Estilo

- Tailwind utility-first; sem CSS custom exceto para animações específicas
- Design system com variáveis CSS para cores do tema
- Responsivo mobile-first
- Suporte a dark mode via `class` strategy do Tailwind

### Testes

- Cada regra de negócio deve ter testes unitários dedicados
- Testes e2e para fluxos críticos da v1: importar referências, triagem (título/resumo e texto completo), ingestão e extração por IA, exportação do relatório.
- Coverage mínimo: 80% nas funções críticas de deduplicação, triagem e parsing de metadado

### Qualidade de código

- ESLint com regras para TypeScript e React; `eslint-config-next` como base
- Prettier para formatação automática
- Type-check (`tsc --noEmit`) como passo de verificação
- Pre-commit hooks (Husky + lint-staged) — lint e formatação nos arquivos alterados
- CI (GitHub Actions): lint, type-check e testes obrigatórios antes do deploy

<!-- SPECKIT START -->
Feature ativa: `003-marco3-saida-sintese-relatorio`.

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan at
`specs/003-marco3-saida-sintese-relatorio/plan.md` (and its Phase 1 artifacts:
`research.md`, `data-model.md`, `contracts/`, `quickstart.md`).
<!-- SPECKIT END -->
