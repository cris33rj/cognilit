# Quickstart — Marco 1: Núcleo do Fluxo

**Feature**: `001-marco1-nucleo-fluxo` | **Date**: 2026-05-29

> Como subir e validar a fatia vertical do Marco 1 localmente. Pré-requisito: a
> Sessão B já executou as fatias (este doc descreve o estado-alvo, não a execução).
> Stack conforme constitution §Restrições.

## Pré-requisitos
- Node 18+ e npm
- Docker (para Supabase local) + Supabase CLI
- Uma chave de API do provedor de LLM (Anthropic/Claude) para as funções de IA
  (BYOK). Sem ela, as fases de IA operam manualmente (FR-032).

## Setup

```bash
npm install
supabase start                 # Postgres + Auth + Storage + Edge runtime locais
supabase db reset              # aplica migrations (RLS desde a 1ª — Princípio IV)
cp .env.example .env.local     # preencher SUPABASE_URL / ANON_KEY / SERVICE_ROLE
npm run dev                    # Next.js (App Router) em http://localhost:3000
```

Variáveis de ambiente esperadas (`.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (worker/Edge Functions)
- BYOK: a chave do LLM é cadastrada **pela UI** e cifrada no **Supabase Vault**
  (R5) — não vai em env var de produção.

## Smoke test do fluxo (corresponde aos Acceptance Scenarios)

1. **Auth + Revisão isolada (US1)**: cadastre dois usuários; cada um cria uma
   Revisão; confirme que A não acessa a Revisão de B por URL direta (espera 403/
   negação — SC-009).
2. **Pergunta (US5)**: na Revisão, escolha framework (SPIDER default), formule a
   pergunta; acione derivação por IA; veja critérios/termos como **sugestão**
   ratificável com proveniência (não aplicados sozinhos).
3. **Protocolo (US6)**: gere rascunho PRISMA-P por IA, edite. (Ainda `draft`.)
4. **Importar (US2)**: no **modo Importar** do workbench, registre a busca
   (string/base/data/hits) e carregue um `.ris`/`.bib`/`.csv` de exemplo; confira a
   **pré-visualização**; confirme; veja o contador "identificados" subir.
5. **Duplicatas (US3)**: importe um corpus com duplicatas; confirme que exatas
   foram removidas automaticamente (log reversível) e que pares fuzzy aparecem
   lado a lado; desfaça uma remoção e veja a contagem restaurar.
6. **Triagem Título/Resumo (US4)**: rode a pré-classificação de IA (job em lote —
   confirme a **estimativa de custo** antes); triar por teclado
   (`i`/`e`/`d`/`j`/`k`/`a`/`u`); marque um registro como **dúvida** e confirme que
   ele **não avança** ao Texto completo até ser resolvido (Q1).
7. **Travamento (US6)**: confirme que a **primeira decisão de triagem** travou o
   protocolo (`locked`); faça uma mudança e veja virar **emenda versionada/datada**
   (SC-010).
8. **Texto completo (US4)**: tente excluir sem motivo ⇒ bloqueado; escolha um
   motivo da lista configurável; veja a contagem de exclusões por razão no PRISMA.
9. **PRISMA vivo + trilho (US7)**: confira que os contadores batem número-a-número
   com o corpus (SC-004) e que o trilho reflete o estado das fases.
10. **Auditoria (transversal)**: exporte a trilha; confirme que toda decisão e
    reversão aparece append-only (SC-006).

## Verificação (portões de qualidade — constitution §Portões)

```bash
npm run lint          # deve passar (sem any)
npx tsc --noEmit      # type-check limpo
npm run test          # Vitest — unit; ≥80% nas funções de dedup/triagem/parsing
npm run test:e2e      # Playwright — fluxos críticos: importar, triar T/R e TC
```

## Notas
- Marco 1 **não** ingere PDF nem extrai dados por IA (Marco 2): o grounding das
  sugestões de triagem ancora em metadado/resumo importado (spec §Assumptions).
- O fluxograma PRISMA **renderizado** é Marco 3; aqui mantêm-se apenas os
  **contadores** vivos (Out of Scope da spec).
