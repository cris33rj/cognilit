# Fatia 1 — Ingestão de PDF (US1-A) — COMPLETION

**Branch:** `build/002-marco2-coracao-ai-first/1-ingestao-pdf` (tip `f4c3bf9`)
**Base:** feature HEAD `8613cdd` (Marco 1 + artefatos da Sessão A)
**Estado:** ✅ Completa e **mergeada** na feature `002-marco2-coracao-ai-first`
(merge commit `0736b8c`, 2026-06-10). CHECKPOINT 3 concluído — dev fez o merge manual.

## O que foi entregue

Anexar PDFs a um estudo (`record` com `corpus_state ∈ {included_ts, included_ft}`)
pelo modo **Texto completo** do workbench. O binário é validado de forma síncrona
(MIME por magic bytes + tamanho ≤ 50 MiB + integridade `%%EOF`), guardado no Storage
privado escopado por Revisão (RLS por path) e um job `pdf_text_pipeline` é enfileirado
no estado `queued`. **Nenhum parsing pesado inline** (§VIII/FR-005) — o processamento
de texto é a Fatia 2.

## Tarefas (11) — todas com spec-review + code-review

| # | Entrega | Commit |
|---|---------|--------|
| 1 | Migração 0012: tabela `document` + enum `document_status` + RLS + bucket `pdfs` | `8cd65ac` |
| 2 | `ALTER job_type` + RPC `create_pdf_pipeline_job` (atômica, security definer) | `31d32e8` |
| 3 | Validação pura `validatePdfUpload` (MIME/tamanho/EOF) | `dbcb8b4` |
| 4 | Lib `attachPdfDocument` (validar + upload + RPC + cleanup de órfão) | `4a47d50` |
| 5 | Query `listDocuments` | `14a05b0` |
| 6 | Server Actions `attachPdf`/`fetchDocuments` + `bodySizeLimit` | `9420fc2` (+`66d16b0`) |
| 7 | `DocumentsPanel` (upload + lista + polling de status, a11y) | `254af38` |
| 8 | `DocumentsPanel` no modo `full_text` do `ScreeningQueue` (aditivo) | `fa19cf5` |
| 9 | Wiring das ações no `workbench/page.tsx` | `98daee1` |
| 10 | E2E: anexar PDF no modo Texto completo (US1) | `8ef259e` |

## Portões (CHECKPOINT 3) — evidência

- `npm run lint` → ✔ No ESLint warnings or errors
- `npm run typecheck` (`tsc --noEmit`) → 0 erros
- `npm test` → **59 arquivos / 254 testes**, todos verdes (baseline era 55/232; a fatia
  adicionou 4 arquivos de teste / +22 testes)
- `npm run test:e2e -- documents.spec.ts` → 1 passed

## Cobertura de requisitos

- **FR-001** anexo no `full_text`, valida `corpus_state` — RPC (Task 2) + UI (7–9)
- **FR-002** Storage escopado por Revisão, RLS por path (Task 1, isolamento testado em 1/4)
- **FR-003** rejeita não-PDF/corrompido, nada parcial — `validate.ts` + cleanup de órfão
- **FR-004** estado de processamento visível — `processing_status` + `listDocuments` + polling
- **FR-005** gatilho síncrono só valida/persiste/enfileira; **A4** teto 50 MiB
- **FR-029** auditoria `audit_entry action='attach_pdf'`
- **Princípio V** extensões aditivas; triagem intocada (auditado hunk-a-hunk na Task 8)

## Não-regressão

Arquivos do Marco 1 tocados são **estritamente aditivos**:
- `ScreeningQueue.tsx` — 2 props opcionais + painel lateral só no `full_text`; as únicas
  2 deleções são as 2 ternárias de `className` estendidas para incluir `full_text`.
- `workbench/page.tsx` (+4), `workbench/actions.ts` (+24), `next.config.mjs` (+3).
Migração é **0012**; ALTERs de enum são aditivos. Suite Marco 1 segue verde.

## Fora desta fatia (Fatia 2)

Extração de texto, `text_layer`, OCR, `page_count`, teto de 300 páginas, transições de
`processing_status` além de `queued`. Itens de backlog levantados em code-review e
deferidos: coluna `updated_at` em `document`, reconsiderar `byte_size` para `bigint`,
política de UPDATE/DELETE no Storage para fluxo de substituição.

## Infra do worktree (notas)

- Hook husky precisou de shebang (`6dfab32`) — corrigido; `npm install` regenerou o
  wrapper `.husky/_`.
- `.env.local` foi copiado do checkout principal para os testes de integração rodarem.
