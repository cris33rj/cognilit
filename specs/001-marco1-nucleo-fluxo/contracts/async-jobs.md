# Contract — Async jobs (enqueue + observe)

**Feature**: `001-marco1-nucleo-fluxo` | Princípio VIII (D25), R3.

> Edge Function **só valida/persiste/enfileira**; o **worker** (Edge Function via
> `pg_cron`) processa item-a-item. A UI **observa** por polling. Tipos de job no
> Marco 1: `import_parse`, `ai_screening_batch`.

## Enqueue (Edge Function síncrona)

```
POST /functions/v1/jobs-enqueue
Auth: Bearer <supabase session>  (RLS valida membership)
Body:
{
  "review_id": "uuid",
  "type": "import_parse" | "ai_screening_batch",
  "payload": { ... }          // import: arquivo/refs; screening: filtro do corpus
}
Response 202:
{
  "job_id": "uuid",
  "status": "queued",
  "item_count": 1234,
  "estimated_cost": { "tokens": 0, "cost": {...} } | null   // != null p/ IA (FR-033)
}
Errors:
  400 formato inválido / arquivo malformado (FR-016) — nenhum registro persistido
  403 não-membro da Revisão (RLS)
```

Regra: para `ai_screening_batch`, a resposta **inclui `estimated_cost`** e a UI
exige confirmação do usuário antes de o worker rodar (FR-033, SC-008). O enqueue
nunca processa itens (§VIII).

## Observe (polling — UI)

```
GET /rest/v1/job?review_id=eq.<id>&order=created_at.desc   (PostgREST + RLS)
→ [{ id, type, status, progress, estimated_cost, actual_cost, ... }]

GET /rest/v1/job_item?job_id=eq.<id>&status=eq.failed
→ itens com falha (resiliência por-item visível — §VIII)
```

UI usa TanStack Query com `refetchInterval` enquanto `status ∈ {queued, running}`;
para ao chegar em `completed | completed_with_errors | failed`.

## Worker (interno — via `pg_cron`)

- Seleciona lote de `job_item.status='pending'`, processa **um a um**, commit por
  item; `job.progress` recalculado; item que falha vira `failed` (com `error`,
  `attempts++`) sem derrubar o job.
- Job termina `completed` (0 falhas) ou `completed_with_errors` (≥1 falha).
- **Retomável**: reinício do worker continua dos `pending`/`failed` elegíveis.

## Status state machine

```
queued → running → completed
                 → completed_with_errors
                 → failed   (falha estrutural, não por-item)
```

## Testes mínimos (TDD)

- Enqueue de arquivo malformado ⇒ 400 e **zero** records persistidos (FR-016).
- Falha forçada em 1 item ⇒ job `completed_with_errors`, demais itens `done`.
- `ai_screening_batch` sem confirmação de custo ⇒ worker não processa.
