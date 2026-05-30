# Data Model — Marco 1: Núcleo do Fluxo

**Feature**: `001-marco1-nucleo-fluxo` | **Date**: 2026-05-29
**Input**: [spec.md](./spec.md) §Key Entities, [research.md](./research.md)

> Modelo lógico derivado da spec. Convenções (CLAUDE.md): identificadores em
> **inglês**; `enum` permitido **no banco**; datas como `DATE` (exibição
> `dd/mm/aaaa`). **RLS habilitado em TODAS as tabelas desde a 1ª migration**
> (Princípio IV). Toda mudança de estado de Revisão gera entrada em `audit_entry`
> (Princípio III). Schema modela N revisores (D21) mas a v1 opera solo.
>
> Tipos concretos de coluna, índices finais e a redação exata das políticas RLS
> são detalhe da migration (Sessão B). Aqui fixamos entidades, campos, relações,
> regras de validação e transições de estado.

---

## Diagrama de relações (texto)

```
auth.users (Supabase)
   └─1:1─ profile
            └─1:N─ member ─N:1─ review            (associação usuário↔revisão↔papel)
                              review
                                ├─1:1─ question ─1:N─ eligibility_criterion
                                ├─1:1─ protocol ─1:N─ protocol_amendment
                                ├─1:N─ search
                                ├─1:N─ record ──────────────┐
                                │        ├─1:N─ dedup_decision (A/B refs a record)
                                │        ├─1:N─ screening_decision
                                │        └─1:N─ ai_suggestion
                                ├─1:N─ exclusion_reason      (lista configurável)
                                ├─1:N─ job ─1:N─ job_item
                                ├─1:1─ byok_key  (ref. Supabase Vault)
                                ├─1:N─ ai_usage  (contabilidade de tokens)
                                ├─1:N─ audit_entry (append-only)
                                └─(view)─ prisma_counter (derivado)
```

Regra transversal de RLS: **toda** tabela com `review_id` é acessível somente se
existe `member(review_id, user_id = auth.uid())`. `profile` é acessível pelo
próprio usuário. `audit_entry` é **insert-only** (sem update/delete por política).

---

## Entidades

### profile

Espelha `auth.users`; dados de aplicação do usuário.

- `id` (PK = `auth.users.id`)
- `display_name`
- `created_at`
- **RLS**: `id = auth.uid()`.

### review _(agregado-raiz — Revisão)_

- `id` (PK)
- `title` (obrigatório, FR-002)
- `pipeline_config` (jsonb) — fases opcionais ligadas/desligadas (D19); na v1
  Viés/Certeza desligadas.
- `active_screening_started_at` (nullable) — marca quando a triagem iniciou
  (dispara o travamento do protocolo, FR-010).
- `created_by` (FK profile)
- `created_at`
- **RLS**: existe `member` com `auth.uid()` para este `review_id`.
- **Validação**: `title` não-vazio.

### member _(usuário ↔ Revisão ↔ papel)_

- `id` (PK)
- `review_id` (FK), `user_id` (FK profile)
- `role` enum `owner | reviewer | viewer` (D21)
- `created_at`
- **Unicidade**: `(review_id, user_id)` único.
- **Regra v1**: ao criar uma `review`, cria-se automaticamente um **único** `member`
  com `role=owner`; esse papel **confere também a capacidade de reviewer** (não há
  linha `member` separada com `role=reviewer` na v1). O valor `reviewer` do enum fica
  **latente** para o cenário multi-revisor futuro, quando o mesmo usuário/Revisão
  poderá ter múltiplas linhas `member`. Assim, "Owner+Reviewer único" da FR-002 é
  modelado como uma só linha `owner`, não como dupla associação. Convites e múltiplos
  membros: latentes, sem UI (Princípio IV).
- **RLS**: membro vê os membros da própria Revisão; escrita de membros restrita ao
  `owner` (latente na v1).

### question _(Pergunta + framework — US5)_

- `id` (PK), `review_id` (FK, 1:1)
- `framework` enum `spider | pico | peo | pcc | free` (default `spider`, FR-006)
- `fields` (jsonb) — campos adaptados ao framework escolhido
- `question_text`
- `created_at`, `updated_at`
- **Validação**: `framework` default `spider`; `fields` coerente com o framework.

### eligibility*criterion *(critérios/termos derivados — US5)\_

- `id` (PK), `review_id` (FK), `question_id` (FK)
- `kind` enum `inclusion | exclusion | search_term`
- `text`
- `origin` enum `human | ai` — quando `ai`, **exige** `ai_suggestion` associada
  e ratificação (FR-007/FR-008, Princípio I).
- `ratification_state` enum `pending | accepted | edited | rejected` (default
  `pending` quando `origin=ai`).
- `created_at`
- **Validação**: `origin=ai` ⇒ há `ai_suggestion_id`; só vale como critério ativo
  se `ratification_state ∈ {accepted, edited}`.

### protocol _(PRISMA-P — US6)_

- `id` (PK), `review_id` (FK, 1:1)
- `content` (jsonb/markdown) — rascunho editável
- `state` enum `draft | locked` (FR-010)
- `locked_at` (nullable) — preenchido no travamento.
- `origin` enum `ai_draft | human` — rascunho inicial por IA exige `ai_suggestion`.
- `created_at`, `updated_at`
- **Transição**: `draft → locked` disparada pela **primeira `screening_decision`**
  da Revisão (FR-010, clarificação Q5). Após `locked`, `content` é **imutável**;
  mudanças só via `protocol_amendment` (FR-011).

### protocol*amendment *(emenda versionada — US6)\_

- `id` (PK), `review_id` (FK), `protocol_id` (FK)
- `version` (int, sequencial por protocolo)
- `change` (jsonb/markdown) — o que mudou
- `dated_at` (DATE)
- `created_at`
- **Validação**: só existe se `protocol.state = locked`; não sobrescreve `content`
  travado (FR-011, SC-010).

### search _(Busca registrada — US2)_

- `id` (PK), `review_id` (FK)
- `query_string`, `database` (base consultada), `searched_on` (DATE),
  `hits` (int)
- `created_at`
- **Relação**: cada `record` referencia a `search` que o originou.
- **Validação**: `hits ≥ 0`; `searched_on` válida.

### record _(Registro bibliográfico — US2/US3/US4)_

- `id` (PK), `review_id` (FK), `search_id` (FK nullable)
- `source_format` enum `ris | bibtex | csv`
- `raw` (jsonb) — campos originais preservados (idioma original, FR-038)
- `metadata` (jsonb normalizado: title, authors, year, doi, abstract, language…)
- `doi_normalized` (nullable, indexado) — chave de dedup exata
- `title_norm` (gerado/normalizado) + `year` — chave de dedup exata alternativa
- `corpus_state` enum (máquina de estados abaixo)
- `ts_decision` enum `included | excluded | maybe | null` (Título/Resumo)
- `ft_decision` enum `included | excluded | null` (Texto completo)
- `ft_exclusion_reason_id` (FK exclusion_reason, nullable)
- `created_at`, `updated_at`
- **Validação**:
  - `ft_decision=excluded` ⇒ `ft_exclusion_reason_id` **obrigatório** (FR-025).
  - avanço para Texto completo só se `ts_decision=included` (clarificação Q1);
    `ts_decision=maybe` **bloqueia** avanço até virar `included|excluded`.
- **Índices**: `pg_trgm` em `title_norm` (dedup fuzzy, R2); `doi_normalized`.

### dedup*decision *(Decisão de dedup — US3)\_

- `id` (PK), `review_id` (FK)
- `kind` enum `exact_auto | fuzzy_human`
- `record_a_id` (FK), `record_b_id` (FK nullable p/ exact contra chave)
- `similarity` (float, nullable; preenchido em fuzzy)
- `outcome` enum `removed | merged | kept_distinct`
- `is_reversed` (bool, default false) + `reversed_at` (nullable)
- `created_at`, `actor` enum `system | human`
- **Regra**: `exact_auto` é criado pelo sistema (FR-018), **reversível** (FR-019).
  `fuzzy_human` vem da fila lado a lado (FR-020), reversível (FR-021). Toda
  criação/reversão ⇒ `audit_entry`. Reversão é **por item, a qualquer momento**
  (clarificação Q4) e cria nova `audit_entry` (não apaga a anterior).

### screening*decision *(Decisão de triagem — US4)\_

- `id` (PK), `review_id` (FK), `record_id` (FK)
- `stage` enum `title_abstract | full_text`
- `decision` enum `include | exclude | maybe` (`maybe` só em `title_abstract`)
- `exclusion_reason_id` (FK, obrigatório quando `stage=full_text` e
  `decision=exclude`, FR-025)
- `ai_suggestion_id` (FK nullable) — sugestão que acompanhou a decisão
- `is_reversed` (bool) + `reversed_at`
- `created_at`, `actor = human` (a IA nunca decide — Princípio I, FR-024)
- **Regra**: a **primeira** `screening_decision` da Revisão dispara
  `protocol.state → locked` (FR-010). Reversão por item a qualquer momento
  (Q4) ⇒ nova `audit_entry`.

### exclusion*reason *(lista configurável por projeto — US4)\_

- `id` (PK), `review_id` (FK)
- `label`, `is_active` (bool), `order` (int)
- **Seed**: conjunto padrão configurável (spec §Assumptions); curadoria fina é
  implementação.

### ai*suggestion *(Sugestão de IA — transversal)\_

- `id` (PK), `review_id` (FK)
- `target_kind` enum `eligibility | protocol_draft | screening` (Marco 1)
- `target_id` (id do alvo: criterion/protocol/record)
- `output` (jsonb) — recomendação + razão curta
- `provenance` (jsonb) — **obrigatório**: `model`, `version`, `prompt_or_span`,
  `timestamp` (Princípio II, FR-031)
- `state` enum `pending | accepted | edited | rejected | inferred` (FR-030)
- `grounding` (jsonb nullable) — no Marco 1 ancora em metadado/resumo importado
  (spec §Assumptions), não em PDF
- `not_found` (bool) — "não encontrado" como resultado de 1ª classe (FR-034)
- `created_at`
- **Validação**: `provenance` não-nulo; `state` default `pending`.

### audit*entry *(trilha append-only — transversal)\_

- `id` (PK), `review_id` (FK)
- `actor_type` enum `human | ai | system`, `actor_id` (nullable)
- `action` (texto), `entity` + `entity_id`
- `before` (jsonb), `after` (jsonb)
- `created_at`
- **RLS/Política**: **insert-only** — sem `UPDATE`/`DELETE` (Princípio III, FR-035).
  Exportável.

### job + job*item *(jobs assíncronos — R3, Princípio VIII)\_

**job**

- `id` (PK), `review_id` (FK)
- `type` enum `import_parse | ai_screening_batch`
- `status` enum `queued | running | completed | completed_with_errors | failed`
- `progress` (int 0–100, derivado de job_item)
- `estimated_cost` (jsonb nullable — tokens/custo, FR-033) / `actual_cost` (jsonb)
- `created_at`, `started_at`, `finished_at`

**job_item**

- `id` (PK), `job_id` (FK), `review_id` (FK)
- `status` enum `pending | done | failed`
- `payload` (jsonb) — unidade de trabalho (uma referência a parsear, um record a
  pré-classificar)
- `error` (text nullable), `attempts` (int)
- **Regra**: worker processa item-a-item com commit por item (resiliência por-item,
  Princípio VIII). Falha de um item ⇒ `failed`, não derruba o `job`.

### byok*key *(chave BYOK — R5, FR-032)\_

- `id` (PK), `review_id` (FK) _(ou escopo por usuário — decisão de migration; o
  contrato é "uma chave de LLM por escopo de uso")_
- `provider` enum `anthropic | …` (default `anthropic`, D14)
- `vault_secret_id` — referência ao **Supabase Vault** (chave cifrada; nunca em
  texto puro no schema, R5)
- `created_at`
- **RLS**: somente membros da Revisão; o segredo só é decifrado server-side.

### ai*usage *(contabilidade de custo — FR-033, P5)\_

- `id` (PK), `review_id` (FK), `phase` (texto: question/protocol/screening)
- `tokens_in`, `tokens_out`, `cost` (jsonb)
- `job_id` (FK nullable), `created_at`
- **Uso**: alimenta consumo acumulado por Revisão/fase (SC-008).

### prisma*counter *(derivado — VIEW, não tabela)\_

- Contadores vivos (VI/EP-2): `identified`, `duplicates` (exatas + fuzzy
  confirmadas), `screened`, `included`, `excluded_by_reason` (agrupado).
- **Implementação**: **view/consulta agregada** sobre `record`/`dedup_decision`/
  `screening_decision` — fonte única de verdade; o futuro fluxograma é espelho
  (não há contador "guardado" que possa divergir, SC-004).

---

## Máquina de estados do `record.corpus_state`

```
imported
   │ (dedup exata: chave colide)            → duplicate_exact   ──(reverter)──┐
   │                                                                          │
   ▼                                                                          │
 active ◄──────────────────────────────────────────────────────────────────┘
   │ (par fuzzy confirmado "mesma" → mescla) → duplicate_fuzzy ──(reverter)── active
   │
   │ triagem Título/Resumo (FR-022/023)
   ├── ts_decision=excluded ───────────────→ excluded_ts        ──(desfazer)── active
   ├── ts_decision=maybe ──────────────────→ maybe_ts (pendente; NÃO avança, Q1)
   └── ts_decision=included ───────────────→ included_ts
                                                │ triagem Texto completo (FR-022)
                                                ├── ft_decision=excluded (+motivo) → excluded_ft  ──(desfazer)── included_ts
                                                └── ft_decision=included ──────────→ included_ft
```

Regras de transição:

- `maybe_ts` é **terminal-pendente**: precisa virar `excluded_ts` ou `included_ts`
  antes de qualquer avanço (clarificação Q1). Não conta como "triado" final no
  PRISMA (VI).
- Toda transição grava `audit_entry` (III) e é **reversível por item** (Q4);
  reverter cria nova `audit_entry`, nunca apaga histórico.
- A 1ª transição de triagem **na Revisão** trava o protocolo (FR-010, Q5).

## Contagem PRISMA (mapeamento — SC-004)

| Contador            | Fonte                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| identificados       | `count(record)` importados (= soma de hits/registros)                                      |
| duplicados          | `dedup_decision.outcome=removed` (exata) + `merged` (fuzzy confirmada) não revertidas      |
| triados             | records com `ts_decision ∈ {included,excluded}` (exclui `maybe` pendente)                  |
| incluídos           | `corpus_state = included_ft` (ou `included_ts` se TC não aplicável)                        |
| excluídos por razão | `screening_decision(stage=full_text, decision=exclude)` agrupado por `exclusion_reason_id` |

## Notas de RLS (resumo — detalhe na migration)

- Padrão: `USING (exists member where review_id = row.review_id and user_id = auth.uid())`.
- `audit_entry`: `INSERT` permitido a membros; **sem** `UPDATE`/`DELETE`.
- `byok_key`: leitura do `vault_secret_id` por membro; decifragem só server-side.
- `profile`: `id = auth.uid()`.
