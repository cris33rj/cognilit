# COMPLETION — Fatia 5: Exportação infra + Markdown/BibTeX/RIS (US5, parte 1)

**Feature**: `003-marco3-saida-sintese-relatorio` (Marco 3 — Saída)
**Branch**: `build/003-marco3-saida-sintese-relatorio/5-export-light` (a partir de `e56ce4c`, feature HEAD)
**Data**: 2026-06-15
**Status**: ✅ **Mergeada** na feature via merge commit `06afab4` (parents `e56ce4c` + build tip `a899dba`, 2026-06-15). Build completo e CHECKPOINT 3 concluído.

---

## O que foi entregue (US5 parte 1 — FR-020 parte MD, FR-021, FR-023)

Infraestrutura de exportação do relatório + três serializadores leves próprios (Markdown,
BibTeX, RIS), com persistência em bucket privado e download. DOCX/PDF/APA7 ficam para a
Fatia 6 (mesmo job `report_export`).

### Migration `0021_report_export.sql` (aditiva)
- `alter type job_type add value 'report_export'`.
- enum `export_format` (docx|pdf|md|bibtex|ris|prisma_svg|prisma_png) — completo já na v1
  (Fatia 6 reaproveita sem `ALTER`).
- tabela `export_artifact` (report_id e job_id nullable; `unique (job_id, format)` p/
  upsert idempotente; RLS `is_review_member` `for all`).
- bucket privado `exports` (`file_size_limit` 50 MB) + 3 policies em `storage.objects`
  (select/insert/delete) derivando `review_id` de `(storage.foldername(name))[2]` — espelha
  o bucket de PDFs do Marco 2 (`0012`).
- RPC `create_report_export_job(p_review_id, p_formats text[])` — SECURITY DEFINER, só
  **enfileira** (§VIII): valida membership, rejeita formato inválido (cast), bloqueia job
  duplicado em andamento, cria 1 `job_item` por formato, grava `audit_entry`.

### Worker Node (`src/lib/export/`), espelha o quarteto do report
- `enqueue.ts` — `enqueueReportExportJob` (chama a RPC com o **client do usuário**).
- `batch-worker.ts` — `processReportExportJob`: **item = um formato** (resiliência por-formato,
  FR-023 — falha de um não derruba os demais); serializa md/bibtex/ris, faz upload no bucket
  `exports`, faz **upsert** de `export_artifact` por `(job_id, format)` (idempotente/retomável);
  `_finalizeJob` recomputa status/progress de **todos** os itens. Formatos de Fatia 6
  (docx/pdf/prisma_*) caem no `default` → item falha isolado.
- `batch-run.ts` — `runReportExportWorkerWith(admin, reviewId)` (client **admin/service**).
- `queries.ts` — `listIncludedFtRecordsDetail` (todos os `included_ft`, FR-021),
  `loadExportInputs` (seções+características+checklist p/ o MD), `loadExportArtifacts` (UI).

### Serializadores próprios (R4 — sem libs novas)
- `serializeMarkdown` — título + seções (pt-BR) + **embute tabela de características e
  checklist PRISMA** (FR-020 parte MD); escapa `|`/quebras nas células.
- `serializeBibtex` / `serializeRis` — cobrem todos os `included_ft` (FR-021);
  **campos ausentes são OMITIDOS, nunca inventados** (§II).

### App
- Server action `enqueueExport(reviewId, formats)` em `report/actions.ts` — enfileira com o
  **client membro**, roda o worker com o **admin**, `revalidatePath`. Sem IA, sem custo.
- Route handler `app/reviews/[reviewId]/report/export/[artifactId]/route.ts` — GET autenticado
  (`is_review_member`), download do bucket via client do usuário (RLS por path),
  `Content-Disposition: attachment`.
- `src/components/report/ExportPanel.tsx` — seleção de formatos (md/bibtex/ris), botão
  Exportar (useTransition, trata erro), lista de artefatos com links de download; montado em
  `report/page.tsx` reusando o mesmo client e o `Promise.all` existente.

---

## Verificação (gate "Pronto quando")

- **Vitest (suíte completa)**: **459/459 passam** (101 arquivos) — rodada sequencial
  (`--no-file-parallelism`). Inclui:
  - unit dos serializadores: `serialize-bibtex` (3), `serialize-ris` (3), `serialize-markdown` (4).
  - integração `export.test.ts` (7): RPC enfileira 1 item/formato + audita; rejeita formato
    inválido; rejeita 2º job ativo; RLS `export_artifact`; worker gera 3 artefatos + objetos no
    bucket + job `completed`; resiliência por-formato (`completed_with_errors`, docx falha
    isolada); retomável (re-rodar não duplica artefato).
- **`npm run typecheck`**: limpo. **`npm run lint`**: limpo.
- **e2e/Playwright**: `tests/e2e/export.spec.ts` (adicionado a pedido) — **1 passed** contra build
  de produção: signup → cria Revisão → seed `included_ft`+valor ratificado → gera relatório →
  ExportPanel (seleciona MD/BibTeX/RIS) → Exportar → "Exportação concluída." → 3 links de
  download → baixa o `.md`. Exercita o split de cliente real (membro enfileira, admin roda o
  worker) que os testes de integração não cobrem.

> Nota operacional: durante a 1ª rodada paralela da suíte completa, o container de auth
> (GoTrue) do Supabase local degradou sob carga de signups concorrentes
> (`AuthRetryableFetchError`), causando 16 timeouts em testes **não relacionados**
> (synthesis/extraction/embedding/pdf). Resolvido com `supabase stop && start` + rodada
> sequencial: **tudo verde**. Não é regressão da fatia.

---

## Revisões aplicadas (2 estágios por tarefa + holística final)
- F1: `file_size_limit` no bucket + teste do guard de job duplicado.
- F3: correção da asserção `endsWith` do teste RIS (trimEnd) + reforço de omissão de tags.
- F4: `cell()` no `itemCode` do checklist.
- F5: **export_artifact upsert idempotente** (`unique (job_id, format)`) + erro de `report`
  surfaced + teste de retomabilidade.
- F7: MIME map completo (docx/pdf/svg/png) no download.
- F8: ExportPanel limpa mensagem e trata erro (M1/M2).
- Revisão holística final: **Ready to merge**, sem changes requested.

---

## Cobertura / escopo
- **US5 parcial**: FR-021 (BibTeX/RIS cobrindo `included_ft`), FR-023 (resiliência por-formato),
  FR-020 (parte MD). ✅
- **Fora de escopo (corretamente ausente)**: DOCX/PDF/APA7 (Fatia 6) — pré-estagiados no enum
  e no MIME map do download; `serializeFormat` faz `default: throw` (falha isolada).
- **Não-regressão Marcos 1–3**: apenas arquivos novos + 2 edições pontuais
  (`report/actions.ts`, `report/page.tsx`); `src/types/database.ts` puramente aditivo.

## Commits (branch da fatia, base `e56ce4c`)
`ea851f9` migration · `0cc4f30` review F1 · `d2d32bd` bibtex · `83dd094`/`f48a968`/`4b87053` ris
· `5368656`/`840fb9e` markdown · `6c42bb2`/`94c95ec` worker · `ce8de19` action · `4ec47b6`/`20ba70d`
download · `a8d6e42`/`3d63471` UI.

## Próximo
Após o merge manual desta fatia na branch da feature, registrar o SHA no `slicing.md` e
iniciar a **Fatia 6** (Export DOCX/PDF + APA 7 — fatia terminal: libs `docx`/`pdfmake`/
`citeproc`+CSL, e2e SC-005, suíte completa).
