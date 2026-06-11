# Data Model — Marco 2: Coração AI-first

**Feature**: `002-marco2-coracao-ai-first` | **Date**: 2026-06-09
**Input**: [spec.md](./spec.md) §Key Entities, [research.md](./research.md), Marco 1 `data-model.md`

> Modelo lógico **incremental**: estende o schema do Marco 1 (migrations `0001`–`0011`),
> **não o reescreve**. Convenções (CLAUDE.md): identificadores em **inglês**; `enum`
> no banco; datas `DATE`. **RLS habilitada em TODAS as tabelas novas** (Princípio IV).
> Toda mudança de estado de Revisão gera `audit_entry` (Princípio III). Tipos exatos
> de coluna, índices finais e redação das políticas RLS são detalhe da migration
> (Sessão B). Novas migrations a partir de `0012`.

---

## O que é reusado do Marco 1 (NÃO recriar)

- **`ai_suggestion`** — entidade transversal de sugestão (provenance, state, not_found,
  grounding). Marco 2 a **estende** (novo `target_kind = extraction`; `grounding`
  passa a referenciar `text_layer` por página/span). Reuso obrigatório do vocabulário
  visual (FR-020, EP-3).
- **`job` / `job_item`** — infra de job assíncrono. Marco 2 **adiciona `type`s**.
- **`byok_key`** — chave BYOK via Vault. Marco 2 **adiciona a 2ª chave** (embeddings).
- **`ai_usage`** — contabilidade por Revisão/fase. Marco 2 adiciona `phase`s.
- **`audit_entry`** (insert-only), **`record`** (o "estudo" alvo do PDF), **`member`**
  (RLS), **`review`** (raiz) — usados como estão.

---

## Diagrama de relações (texto) — adições do Marco 2

```
review
  ├─1:N─ record  (estudo = record incluído na triagem; alvo do PDF)
  │        └─1:N─ document ─1:N─ text_layer            (camada de texto + origin)
  │                  └─1:N─ embedding_chunk            (vetor pgvector, ancorado)
  ├─1:1─ extraction_form ─1:N─ extraction_field         (um form por Revisão, D9)
  ├─1:N─ extraction_value  (record × field → valor humano + ai_suggestion)
  ├─1:N─ ai_suggestion     (estende target_kind=extraction; grounding→text_layer)
  ├─1:N─ job ─1:N─ job_item  (novos type: pdf_text_pipeline | ai_extraction_batch | embedding_batch)
  ├─1:N─ byok_key          (novo purpose=embedding; 2ª chave Voyage)
  └─1:N─ ai_usage          (novas phase: extraction | embedding)
```

RLS transversal: toda tabela nova com `review_id` é acessível só se existe
`member(review_id, user_id = auth.uid())`. PDFs no Storage: política em
`storage.objects` por path `review/<review_id>/...` (R7).

---

## Entidades novas

### document  *(PDF anexado — US1)*
- `id` (PK), `review_id` (FK), `record_id` (FK record) — **obrigatório**; o PDF
  pertence a um **estudo** (record incluído na triagem, spec §Assumptions).
- `storage_path` (text) — `review/<review_id>/record/<record_id>/<id>.pdf` (R7).
- `filename`, `byte_size` (int), `page_count` (int nullable até processar).
- `processing_status` enum `queued | processing | text_ready | failed | partial`
  (máquina de estados abaixo; FR-004).
- `created_at`
- **Validação**: anexo só a `record` que **passou em Título/Resumo** e está na/após
  a etapa de Texto completo (`corpus_state ∈ {included_ts, included_ft}`); o anexo é
  afordância do **modo Texto completo do workbench** (clarificação 2026-06-09),
  estendendo-o sem refragmentar (Princípio V). Arquivo MIME `application/pdf` e
  íntegro, senão rejeita no enqueue (FR-003) sem persistir `document`.
- **Alvo da extração (US3)**: a `ai_extraction_batch`/extração opera sobre
  **estudos** = `record` com `corpus_state = included_ft` (incluído após o Texto
  completo). PDF anexado em `included_ts` habilita a triagem de texto completo; a
  extração vem depois da inclusão final.
- **RLS**: membros da Revisão. **Storage**: política em `storage.objects` (R7).

### text_layer  *(camada de texto extraída — US1)*
- `id` (PK), `review_id` (FK), `document_id` (FK)
- `page` (int) — página de origem (1-based).
- `char_start`, `char_end` (int) — posição no texto da página (âncora de span).
- `content` (text) — texto da camada, **no idioma original** (D24/FR-015).
- `origin` enum `nativo | ocr_ia` (FR-008) — proveniência da camada.
- `created_at`
- **Uso**: fonte do **grounding** da extração (FR-012) e base do chunking (R6). O
  `source_span`+`page` de uma `ai_suggestion` de extração referencia a `text_layer`
  efetivamente usada (FR-008, §II).
- **Validação**: `origin` obrigatório; `page ≥ 1`.

### extraction_form  *(formulário configurável — US2/D9)*
- `id` (PK), `review_id` (FK, **1:1** — um por Revisão, clarificação Q2)
- `created_at`, `updated_at`
- **Regra**: a engine é genérica (instrumento configurável) e **reaproveitável** no
  futuro para risco de viés/CERQual como **instrumentos distintos** — não
  implementados neste marco (FR-011, glossário CONTEXT §2).

### extraction_field  *(campo tipado — US2/D9)*
- `id` (PK), `review_id` (FK), `form_id` (FK extraction_form)
- `name` (text), `order` (int)
- `type` enum `text | number | date | boolean | select` (FR-009)
- `options` (jsonb nullable) — valores para `type=select`.
- `created_at`, `updated_at`
- **Validação**: `type=select` ⇒ `options` não-vazio; `name` não-vazio.
- **Mudança de campo**: editar/remover registra `audit_entry`; não apaga
  silenciosamente `extraction_value` já validado (edge case da spec).

### extraction_value  *(valor extraído por estudo×campo — US3)*
- `id` (PK), `review_id` (FK), `record_id` (FK record/estudo), `field_id` (FK)
- `ai_suggestion_id` (FK ai_suggestion, nullable) — a sugestão que originou o valor.
- `final_value` (jsonb nullable) — **valor humano** após ratificação (FR-018).
- `state` enum `pending | accepted | edited | rejected | inferred` — espelha o
  estado da sugestão ratificada (FR-018).
- `superseded_by_id` (FK self, nullable) — re-extração: a nova sugestão **pendente**
  referencia/encosta no valor anterior **sem sobrescrevê-lo** (FR-019a, Q4).
- `created_at`, `updated_at`, `actor = human` (a IA nunca finaliza, FR-019/§I)
- **Validação**: `state ∈ {accepted, edited}` ⇒ `final_value` não-nulo. Re-extração
  cria nova `ai_suggestion` `pending` ligada ao mesmo `(record_id, field_id)`,
  **sem** alterar o `final_value` validado (Q4).

### embedding_chunk  *(trecho vetorizado — US5/D27/D28)*
- `id` (PK), `review_id` (FK), `document_id` (FK)
- `page` (int), `char_start`, `char_end` (int) — âncora (R6, FR-024).
- `content` (text) — o trecho.
- `origin` enum `nativo | ocr_ia` — herda da `text_layer`.
- `embedding` (`vector(1024)` — dimensão do provedor default; R5).
- `provider` (text), `model` (text), `dim` (int) — acomoda **dimensão variável**
  (D28/FR-026).
- `created_at`
- **Índice**: **HNSW** `vector_cosine_ops` sobre `embedding`; filtro por `review_id`
  (FR-025). Extensão `vector` habilitada em migration nova.
- **Validação**: `dim` = dimensão do vetor; gerado por `EmbeddingProvider` (R4).

## Entidades estendidas (ALTER, não recriar)

### ai_suggestion  *(estendida)*
- `target_kind`: **adicionar** `extraction` ao enum existente
  (`eligibility | protocol_draft | screening | extraction`).
- `target_id`: passa a referenciar também `extraction_value`/`(record,field)`.
- `grounding` (jsonb): no Marco 2 referencia `text_layer` — `{ text_layer_id, page,
  source_span, origin }` (FR-012/FR-008, §II). `not_found=true` quando o valor não
  consta no PDF (FR-013). `state=inferred` para campos inferidos (FR-014).
- `provenance` permanece **obrigatório** (modelo, versão, prompt/trecho, timestamp).

### job  *(estendida)*
- `type`: **adicionar** `pdf_text_pipeline | ai_extraction_batch | embedding_batch`
  ao enum (R3). `estimated_cost` preenchido para os de IA (FR-022).
- `job_item.payload`: por-item = um PDF (`pdf_text_pipeline`), um estudo
  (`ai_extraction_batch`) ou um chunk/documento (`embedding_batch`) — R3.

### byok_key  *(estendida)*
- **Adicionar** `purpose` enum `llm | embedding` (a 2ª chave é `embedding`,
  distinta e cifrada via Vault, FR-028). `provider`: incluir `voyage`. Unicidade
  sugerida: `(review_id|escopo, purpose)`.

### ai_usage  *(estendida)*
- `phase`: passa a aceitar `extraction` e `embedding` (texto livre já comporta;
  documentar valores). Custo da 2ª chave contabilizado em `phase=embedding`,
  separado do LLM (FR-023, R9).

---

## Máquina de estados — `document.processing_status`

```
queued ──(worker pega o PDF)──► processing
   processing ──(camada nativa extraída p/ todas as páginas)──► text_ready
   processing ──(páginas escaneadas → OCR multimodal ok)──────► text_ready (origin mistura nativo/ocr_ia)
   processing ──(algumas páginas falham; outras ok)───────────► partial
   processing ──(falha estrutural: PDF corrompido/ileg.)──────► failed
```
- Resiliência por-item: uma página/PDF que falha não derruba o job (§VIII/FR-006);
  `partial` sinaliza sucesso parcial. Reprocessar é explícito e auditável (edge case).
- Toda transição relevante grava `audit_entry` (§III).

## Máquina de estados — `extraction_value.state` (humano-no-laço)

```
(IA sugere) ─► pending ──► accepted        (FR-018; final_value = sugestão)
                         ├► edited          (final_value = valor humano editado)
                         ├► rejected        (sem final_value; sugestão descartada)
                         └► inferred→(ratif.)→ accepted|edited|rejected  (FR-014)
re-extração: nova ai_suggestion `pending` encosta no value existente,
             SEM sobrescrever final_value validado (FR-019a/Q4).
```
- A IA **nunca** move um campo para `accepted/edited` sozinha (FR-019/§I).

## Notas de RLS (resumo — detalhe na migration)
- Padrão: `USING (exists member where review_id = row.review_id and user_id = auth.uid())`
  em `document`, `text_layer`, `extraction_form`, `extraction_field`,
  `extraction_value`, `embedding_chunk`.
- `storage.objects`: política deriva `review_id` do path e exige `member` (R7).
- `embedding_chunk`: busca por similaridade **sempre** com `review_id = <atual>`
  no filtro, além da RLS (FR-025, SC-008/SC-011).
- `byok_key` (2ª chave): leitura do `vault_secret_id` por membro; decifragem só
  server-side (FR-028).

## Mapeamento Key Entities (spec) → tabelas
| Spec (Key Entity) | Tabela(s) |
|-------------------|-----------|
| PDF anexado (documento) | `document` (+ `storage.objects`) |
| Camada de texto extraída | `text_layer` |
| Formulário de extração | `extraction_form` + `extraction_field` |
| Campo de extração | `extraction_field` + `extraction_value` |
| Sugestão de IA (extração) | `ai_suggestion` (estendida, `target_kind=extraction`) |
| Job assíncrono | `job` + `job_item` (novos `type`s) |
| Trecho/embedding | `embedding_chunk` (pgvector + HNSW) |
| Chave BYOK de embeddings | `byok_key` (estendida, `purpose=embedding`) |
| Consumo de IA | `ai_usage` (novas `phase`s) |
