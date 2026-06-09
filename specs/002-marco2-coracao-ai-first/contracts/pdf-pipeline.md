# Contract — Ingestão de PDF + pipeline de texto (jobs + Storage)

**Feature**: `002-marco2-coracao-ai-first` | Princípio VIII (D25/D31), §IV | FR-001..008, R1/R2/R3/R7.

> **Estende** o contrato `async-jobs.md` do Marco 1 — mesma regra: Edge Function
> **só valida/persiste/enfileira**; o **worker** (`pg_cron`) processa item-a-item,
> commit por item, retomável e resiliente por-item. A UI **observa** por polling
> (TanStack Query). Novos `type`s de job. PDFs no Supabase Storage, escopados por
> Revisão (RLS).

## Upload + enqueue (Edge Function síncrona — `jobs-enqueue` estendida)

```
POST /functions/v1/jobs-enqueue
Auth: Bearer <supabase session>   (RLS valida membership)
Body:
{
  "review_id": "uuid",
  "type": "pdf_text_pipeline" | "ai_extraction_batch" | "embedding_batch",
  "payload": { ... }
}
```

- **`pdf_text_pipeline`** — `payload` referencia o(s) `document` recém-criado(s).
  O upload do binário vai ao Storage (path `review/<review_id>/record/<record_id>/<document_id>.pdf`,
  R7) **antes/junto** do enqueue; a Edge Function valida MIME `application/pdf` e
  integridade (FR-003) — arquivo inválido ⇒ **400** e **nenhum** `document`
  persistido. NUNCA faz parsing inline (§VIII/FR-005).
- **`ai_extraction_batch`** e **`embedding_batch`** — `payload` é um filtro/seleção
  de estudos (extração) ou de documentos/chunks (embeddings). Resposta inclui
  **`estimated_cost`** e a UI exige confirmação antes do worker rodar
  (FR-022/SC-006).

```
Response 202:
{ "job_id": "uuid", "status": "queued", "item_count": 1234,
  "estimated_cost": {...} | null }   // != null para os jobs de IA
Errors:
  400  PDF inválido/corrompido (FR-003) — nada persistido
  403  não-membro da Revisão (RLS)
```

## Worker (interno — `jobs-worker` via `pg_cron`, estendido)

Granularidade por-item (R3):

| `job.type` | `job_item` = | Processamento |
|------------|--------------|---------------|
| `pdf_text_pipeline` | 1 PDF (páginas como sub-passos) | extração nativa determinística (R1); páginas escaneadas → `ocrPage` multimodal (R2). Grava `text_layer` com `origin` (`nativo`/`ocr_ia`). Atualiza `document.processing_status`. |
| `ai_extraction_batch` | 1 estudo | `LLMProvider.extractFields` sobre a `text_layer` do estudo (texto direto, chunking interno R6). Cria `ai_suggestion` por campo. Grava `ai_usage(phase=extraction)`. |
| `embedding_batch` | 1 chunk/documento | `EmbeddingProvider.embed`; grava `embedding_chunk` (vetor + âncora). `ai_usage(phase=embedding)`, 2ª chave. |

- Commit **por item** ⇒ retomável; item que falha vira `failed` (com `error`,
  `attempts++`) **sem derrubar** o job (§VIII/FR-006/FR-021/FR-027).
- `document.processing_status`: `queued → processing → text_ready | partial | failed`
  (`partial` = algumas páginas/itens falharam). Reprocessar é explícito e auditável.
- Job termina `completed` (0 falhas) ou `completed_with_errors` (≥1 falha).

## Observe (polling — UI)

```
GET /rest/v1/job?review_id=eq.<id>&type=in.(pdf_text_pipeline,ai_extraction_batch,embedding_batch)&order=created_at.desc
GET /rest/v1/job_item?job_id=eq.<id>&status=eq.failed     -- itens com falha (visível)
GET /rest/v1/document?review_id=eq.<id>                   -- processing_status por PDF (FR-004)
```
`refetchInterval` enquanto `status ∈ {queued, running}`; para em estado terminal.

## Storage — RLS (R7, §IV)

- Bucket **privado**; path `review/<review_id>/record/<record_id>/<document_id>.pdf`.
- Política em `storage.objects`: deriva `review_id` do 1º segmento do path e exige
  `member(review_id, auth.uid())` — leitura/escrita só por membro (FR-002/SC-011).
- `document` espelha o objeto (metadados + `processing_status`) para joins e UI.

## Status state machine (job — herdada do Marco 1)
```
queued → running → completed
                 → completed_with_errors
                 → failed            (falha estrutural, não por-item)
```

## Testes mínimos (TDD)
- Upload de não-PDF/corrompido ⇒ 400 e **zero** `document` persistido (FR-003).
- `jobs-enqueue` nunca extrai texto inline (verificar ausência de side-effect §VIII).
- PDF com camada de texto ⇒ `text_layer.origin='nativo'`; escaneado ⇒ `'ocr_ia'`.
- Falha forçada em 1 PDF ⇒ job `completed_with_errors`, demais `done`; reinício do
  worker retoma os `pending`/`failed` (retomável, FR-006).
- Membro de outra Revisão não lê o objeto no Storage (isolamento, SC-011).
- `ai_extraction_batch`/`embedding_batch` sem confirmação de custo ⇒ worker não roda.
