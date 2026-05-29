# Research — Marco 1: Núcleo do Fluxo

**Feature**: `001-marco1-nucleo-fluxo` | **Date**: 2026-05-29
**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

> Fase 0 do `/speckit.plan`. Resolve os pontos que a `spec.md` (§Assumptions) e o
> `checklists/requirements.md` deixaram **explicitamente** para o `/plan`. Cada
> decisão respeita a hierarquia `docs/CONTEXT.md` > `constitution.md` > `CLAUDE.md`
> e **não** introduz tecnologia fora da stack ratificada (constitution §Restrições).
> Decisões já travadas a montante (stack, providers de IA, RLS, jobs assíncronos
> como princípio) **não** são reabertas aqui — apenas materializadas.

---

## R1 — Método de autenticação (FR-001, FR-003)

- **Decision**: **Supabase Auth com e-mail/senha** (provider `email`), sessão via
  cookies httpOnly no App Router (helper `@supabase/ssr`). O `user.id` do
  `auth.users` é a identidade que as políticas RLS usam (`auth.uid()`).
- **Rationale**: a stack já fixa Supabase (Auth + RLS) na constitution. E-mail/senha
  é o mínimo suficiente para o pesquisador **solo** da v1 (D21) e dá o
  `auth.uid()` necessário para o isolamento por Revisão (Princípio IV) sem
  dependência externa. `@supabase/ssr` é o caminho oficial para sessões em Server
  Components / Server Actions / Route Handlers do Next.js 14.
- **Alternatives considered**:
  - *Magic link / OTP*: bom UX, mas adiciona fluxo de e-mail transacional sem ganho
    para a v1 solo; pode ser ligado depois (mesmo provider).
  - *OAuth (Google/GitHub)*: fora de escopo v1; nenhum requisito o pede.
  - *Auth próprio (NextAuth/Lucia)*: duplicaria o que o Supabase Auth já entrega e
    desalinharia do `auth.uid()` usado pela RLS — rejeitado.

---

## R2 — Limiar e estratégia de deduplicação (FR-018, FR-020, EdgeCase "DOI ausente")

- **Decision**: pipeline em **duas camadas**:
  1. **Exatas (automáticas, FR-018)**: chave de identidade = **DOI normalizado**
     (minúsculo, sem prefixo de URL) quando presente; na ausência, **título
     normalizado + ano** (`normalize`: lowercase, remoção de acentos/pontuação,
     colapso de espaços). Colisão de chave ⇒ remoção automática reversível.
  2. **Fuzzy (fila humana, FR-020)**: similaridade de **título** por
     **trigram (`pg_trgm`)** combinada a igualdade de ano. Faixa de decisão:
     - `similarity ≥ 0.92` **e** mesmo ano ⇒ candidato forte ⇒ entra na **fila**
       de confirmação (nunca remove sozinho).
     - `0.85 ≤ similarity < 0.92` ⇒ entra na fila com marcação "baixa confiança".
     - `< 0.85` ⇒ não é par.
     Limiares ficam em **constantes de configuração** (`DEDUP_FUZZY_*`), ajustáveis
     sem mudança de schema.
- **Rationale**: `pg_trgm` é nativo do Postgres/Supabase — zero dependência nova
  (constitution §Restrições). Manter o limiar em constante (não hard-coded em
  query) permite calibrar contra corpus real sem migration. O patamar 0.92 é
  conservador para evitar falso-merge automático; tudo fuzzy passa por humano (D6).
- **Alternatives considered**:
  - *Levenshtein puro (`fuzzystrmatch`)*: sensível a comprimento; pior para títulos
    longos que diferem em pontuação — preterido em favor de trigram.
  - *Embeddings para dedup*: o `EmbeddingProvider` é Marco 2 (D27/D28); usá-lo aqui
    violaria o escopo e adicionaria custo BYOK desnecessário — rejeitado.
  - *Auto-merge de fuzzy acima de um limiar*: contraria D6 (fuzzy é sempre humano) —
    rejeitado.

---

## R3 — Mecanismo de jobs assíncronos (FR-017, FR-024, Princípio VIII, D25)

- **Decision**: **fila persistida no Postgres** + **worker em Edge Function
  disparado por Supabase Cron (`pg_cron`)**, com estado por-item:
  - Tabelas `job` (cabeçalho: tipo, status, progresso, custo estimado/realizado) e
    `job_item` (unidade retomável: status `pending|done|failed`, payload, erro).
  - **Enqueue**: uma **Edge Function síncrona** valida a entrada, persiste o
    `job` + `job_item`s e retorna imediatamente (nunca processa — Princípio VIII).
  - **Worker**: Edge Function agendada (`pg_cron`, p.ex. a cada 10s) que pega um
    lote de `job_item` `pending`, processa **um a um** com commit por item
    (resiliente a falha por-item), atualiza progresso e re-tenta itens `failed` até
    um teto. Tempo de execução por invocação é **limitado** (processa N itens e
    devolve), respeitando o limite de Edge Function.
  - **Observabilidade na UI**: o painel de jobs **faz polling** (TanStack Query
    `refetchInterval`) da tabela `job`/`job_item` enquanto houver job ativo.
    (Supabase Realtime é otimização futura; polling é suficiente e mais simples
    para a v1.)
  - **Tipos de job no Marco 1**: `import_parse` (parsing de RIS/BibTeX/CSV grande,
    FR-017) e `ai_screening_batch` (pré-classificação de triagem por IA, FR-024).
- **Rationale**: mantém tudo dentro do Supabase (sem Trigger.dev/Inngest/etc. —
  nenhuma dependência nova). O padrão "Edge Function enfileira / worker agendado
  processa em lotes" é o canônico no Supabase e satisfaz literalmente o Princípio
  VIII (retomável, resiliente por-item, edge não faz trabalho pesado). Polling
  evita complexidade de canais Realtime na primeira fatia.
- **Alternatives considered**:
  - *Parsing 100% client-side*: viável para arquivos pequenos, mas não é retomável
    nem resiliente e não satisfaz o princípio para importações grandes — usado
    apenas para a **pré-visualização** (parse parcial leve no cliente), não para a
    persistência final.
  - *Trigger.dev / Inngest / fila externa*: dependência e superfície novas, fora da
    stack ratificada — rejeitado para a v1.
  - *Supabase Queues (pgmq)*: alternativa válida; preterida só para minimizar
    superfície na 1ª fatia — `job`/`job_item` em tabelas comuns é mais transparente
    para a trilha de auditoria e para o polling. Pode migrar para pgmq depois sem
    mudar o contrato externo.

---

## R4 — Parsing de formatos bibliográficos (FR-013, FR-014, FR-016)

- **Decision**: bibliotecas de parsing no **worker** (não em request síncrono):
  - **RIS**: parser dedicado (lib de RIS) ou parser próprio simples (RIS é
    linha-`TAG  - valor`); escolher na fatia, mas isolado atrás de um módulo
    `parsers/ris.ts`.
  - **BibTeX**: `@retorquere/bibtex-parser` (ou equivalente maduro), atrás de
    `parsers/bibtex.ts`.
  - **CSV**: `papaparse`, atrás de `parsers/csv.ts`, com **mapeamento de campos**
    configurável (FR-014).
  - Cada parser retorna um `ParsedRecord[]` normalizado + lista de erros por linha;
    arquivo malformado ⇒ erro claro, **nenhum** registro parcial persistido
    (FR-016) — persistência é transacional por job.
- **Rationale**: isolar cada formato atrás de um módulo com contrato único
  (`parse(content): { records, errors }`) mantém a engine de importação agnóstica
  ao formato e testável por unidade (constitution §Testes). A dependência concreta
  de cada lib entra como **tarefa explícita** no `IMPLEMENTATION_PLAN.md` da fatia
  (constitution: dependências novas só com tarefa explícita).
- **Alternatives considered**: parser único genérico — rejeitado; os três formatos
  têm gramáticas distintas demais.

---

## R5 — Cifragem da chave BYOK em repouso (FR-032, Princípio VII)

- **Decision**: a chave BYOK do `LLMProvider` é cifrada **em repouso** usando
  **Supabase Vault** (pgsodium) — armazena-se o secret no Vault e referencia-se o
  id na tabela do usuário/Revisão; **a chave nunca volta ao cliente em texto puro**
  e só é decifrada server-side (Edge Function) no momento da chamada ao provedor.
- **Rationale**: Vault é nativo do Supabase (sem dependência nova) e resolve
  "cifrada em repouso" sem gerência de chave-mestra própria. Alinha ao Princípio
  VII (BYOK cifrada) e mantém a decifragem fora do browser.
- **Alternatives considered**:
  - *Cifrar na aplicação com chave em env var*: exige gestão de chave-mestra e
    rotação manual; Vault entrega isso — preterido.
  - *Guardar em texto puro com RLS*: viola "cifrada em repouso" — rejeitado.

---

## R6 — Estado de fila reprodutível via URL (FR-037, Princípio III/EP-4)

- **Decision**: filtros, ordenação e seleção das filas do workbench vivem em
  **search params da URL** (Next.js App Router `searchParams` + `useSearchParams`),
  serializados de forma estável; recarregar/compartilhar a URL reabre a fila no
  mesmo estado.
- **Rationale**: materializa EP-4/Princípio III sem estado global extra; o App
  Router trata `searchParams` como entrada de Server Component, casando com o
  modelo de data fetching (react/nextjs best practices).
- **Alternatives considered**: estado só em memória/Zustand — não é reprodutível
  nem deep-linkável; rejeitado.

---

## R7 — Performance da fila (FR-028, SC-012, ~5.000 registros)

- **Decision**: **virtualização obrigatória** da fila com **TanStack Table +
  TanStack Virtual**; updates **otimistas com rollback** nas decisões de triagem
  (latência percebida ~zero); paginação/streaming de dados do servidor por janela.
- **Rationale**: ~5.000 linhas densas com navegação por teclado (P3) exigem
  virtualização para manter fluidez (DESIGN-DECISIONS §7.2). Updates otimistas são
  essenciais ao fluxo de varredura (P3) e já estão na stack (TanStack Query).
- **Alternatives considered**: render completo sem virtualização — quebra a SC-012;
  rejeitado.

---

## Resumo das decisões

| # | Tema | Decisão | Dependência nova? |
|---|------|---------|-------------------|
| R1 | Auth | Supabase Auth e-mail/senha + `@supabase/ssr` | Não (stack) |
| R2 | Dedup | Exatas por DOI/título+ano; fuzzy por `pg_trgm` ≥0.92, fila humana | Não (`pg_trgm` nativo) |
| R3 | Jobs assíncronos | `job`/`job_item` no Postgres + worker Edge Function via `pg_cron`; polling | Não (Supabase) |
| R4 | Parsers | RIS/BibTeX/CSV isolados em módulos no worker | Sim — por fatia, tarefa explícita |
| R5 | BYOK em repouso | Supabase Vault (pgsodium) | Não (Supabase) |
| R6 | Estado de fila | Search params da URL | Não (Next.js) |
| R7 | Performance | TanStack Virtual + updates otimistas | Sim — TanStack Virtual, tarefa explícita |

Nenhuma decisão reabre `docs/CONTEXT.md` nem contraria a constitution. Todas as
dependências novas (R4, R7) ficam condicionadas a **tarefa explícita** na fatia
correspondente (constitution §Portões de qualidade).
