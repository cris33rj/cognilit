# COMPLETION — Fatia 6: Exportação DOCX/PDF + APA 7 (US5, parte 2) — fatia terminal

**Feature**: `003-marco3-saida-sintese-relatorio` (Marco 3 — Saída)
**Branch**: `build/003-marco3-saida-sintese-relatorio/6-export-docs` (a partir de `3fedbae`, feature HEAD)
**Data**: 2026-06-15
**Status**: 🔨 **Build completo — aguardando merge manual** (CHECKPOINT 3). A sessão NÃO faz merge/push.

---

## O que foi entregue (US5 parte 2 — FR-020, FR-022, SC-005)

Os serializadores pesados de exportação, ligados ao **mesmo** job `report_export` já entregue
na Fatia 5. Nenhuma migration (o enum `export_format` e `job_type 'report_export'` já existem,
`0021`). Sem LLM (export é determinístico). Esta é a **fatia terminal** — com o merge, o
Marco 3 fecha.

### Novas dependências (por tarefa, previstas no `plan.md`)
- `docx@^9.7.1`, `pdfmake@^0.2.23`, `citeproc@^2.4.63` (+ `@types/pdfmake` dev).
- Assets CSL vendorizados: `src/lib/export/csl/apa.csl` (estilo APA 7, 85 KB) e
  `locales-pt-BR.xml` (locale pt-BR, 27 KB), lidos via `fs.readFileSync(process.cwd()/…)`.

### `formatCitationsApa7` (`src/lib/export/format-apa7.ts`) — FR-022, §II
- `recordToCslJson` mapeia `RecordDetailData` → CSL-JSON; **campos ausentes omitidos**
  (autor → marcador `[autor não informado]`; data ausente → `(s.d.)` pelo locale) —
  **nunca inventados** (§II). Sufixos de autor (`Smith, Jr., John`) preservados (1ª vírgula
  = fronteira família/nome).
- `citeproc` + CSL APA 7, locale pt-BR. **Saída em texto puro** (`setOutputFormat("text")`)
  para evitar entidades HTML no separador (`&` em vez de `&#38;`) — fidelidade.
- Guarda `makeBibliography()` retornando `false` (não quebra com lista vazia interna).

### `serializeDocx` (`src/lib/export/serialize-docx.ts`) — FR-020
- `docx` lib. Título → seções (mesmos `SECTION_TITLES`/`STATUS_LABEL` do `serialize-markdown`)
  → **imagem do fluxograma** (`ImageRun type:"png"`, só se PNG presente) → tabela de
  características → checklist PRISMA → referências APA 7. `Packer.toBuffer` → `Buffer`.

### `serializePdf` (`src/lib/export/serialize-pdf.ts`) — FR-020
- `pdfmake` server-side. Mesmo conteúdo/ordem; **embute o PNG do fluxograma** como data-URL
  base64. **Fontes Roboto** resolvidas decodificando `pdfmake/build/vfs_fonts` (base64 →
  `Buffer`) — pdfkit usa `fs` real, então bare-filenames/`vfs` não funcionam; os Buffers são
  passados direto ao `PdfPrinter`. **Sem dependência de `process.cwd()`/arquivos soltos** →
  seguro no runtime do worker. Coleta de stream `data/end/error`.

### Worker (`src/lib/export/batch-worker.ts`) — wiring
- `serializeFormat`: novos `case "docx"`/`case "pdf"`; helper `loadDocInputs` agrega
  `loadExportInputs` + `listIncludedFtRecordsDetail` (→ `formatCitationsApa7`) + PNG do
  fluxograma. PNG via derivação direta das views (`prisma_counter`/`prisma_exclusion_breakdown`)
  + `toFlowModel` puro (NÃO usa `loadPrismaFlowModel`, que é server-client/cookies — não roda
  no worker) → `renderPrismaSvg` → `renderPrismaPng`. Falha do PNG cai em `null` (enriquecimento,
  não derruba o formato). Erros de DB das views são **propagados** (sem fluxograma zerado
  silencioso). `EXT`/`MIME` estendidos com docx/pdf (não estavam, ao contrário da nota da F5).
- Resiliência por-formato (FR-023) **intacta** — só novos `case`s; `try/catch` por `job_item`.
- `prisma_svg`/`prisma_png` permanecem fora do job (`default: throw`) — têm rota própria desde
  a Fatia 1.

### UI (`src/components/report/ExportPanel.tsx`)
- DOCX e PDF acrescentados às opções (ordem docx, pdf, md, bibtex, ris); rótulos md/bibtex/ris
  preservados; fluxo `useTransition`/erro intacto (+4 linhas).

---

## Verificação (gate "Pronto quando")

- **Vitest (suíte completa)**: **469/469 passam** (104 arquivos) — rodada sequencial
  (`--no-file-parallelism`). Inclui:
  - unit novos: `format-apa7` (7: mapeamento, omissão de issued, sufixo de autor, ordenação,
    (s.d.), `[autor não informado]`, texto-puro sem entidade HTML), `serialize-docx` (2),
    `serialize-pdf` (1).
  - integração `export.test.ts`: novo caso "worker gera artefatos docx e pdf no bucket (FR-020)"
    (baixa do bucket e confere assinaturas PK/`%PDF-`); resiliência por-formato atualizada para
    usar **`prisma_svg`** como formato deliberadamente não suportado (docx passou a ser suportado).
- **`npm run typecheck`**: limpo. **`npm run lint`**: limpo.
- **Validação A2 (libs pesadas — núcleo da fatia)**: smoke real (descartável, não commitado)
  gerou DOCX e PDF reais **com fluxograma embutido**: PNG 7.658 B; DOCX 14.074 B (vs 9.203 B
  sem imagem) e PDF 28.814 B (vs 22.483 B sem imagem) → o PNG **realmente embute** em ambos.
  Referência APA 7 conferida: `Silva, A., & Costa, J. (2021). Aprendizagem ativa em RSL.
  Revista de Métodos, 12(3), 45–60. https://doi.org/10.1000/abc` (en-dash, DOI, `&` literal).
  > **Pendente de revisão humana no merge**: abrir o DOCX no Word e conferir o PDF num leitor
  > (fidelidade visual fina) — encerra o item A2 conforme o plan. A geração e o embed já estão
  > provados por teste; falta apenas o olho humano sobre o layout.
- **A2 (bundling Next) — corrigido**: ao abrir `/reviews/[id]/report` no dev, o `pdfmake` →
  `@foliojs-fork/pdfkit` → `fontkit`/`linebreak` lê `.trie` por `fs` no module-eval; o webpack
  do Next bundlava o JS sem copiar os `.trie` → `ENOENT data.trie`. Corrigido adicionando os
  4 pacotes a `experimental.serverComponentsExternalPackages` em `next.config.mjs` (mesmo
  precedente do `@resvg/resvg-wasm` da Fatia 1). Verificado por **`next build` limpo** (rota
  `report` compila + "Collecting build traces" sem ENOENT). Requer `.next` fresco + restart do
  dev server.
- **e2e SC-005 (`tests/e2e/export.spec.ts`)**: novo teste escrito (seleciona os 5 formatos,
  1 operação, 5 links, baixa .docx/.pdf e confere PK/`%PDF-`). **NÃO executado nesta sessão**
  (Playwright roda o desenvolvedor no merge): `npx playwright test tests/e2e/export.spec.ts`.

> Nota operacional: a 1ª tentativa de rodar a suíte completa pegou o Postgres local em
> *recovery mode* após um `supabase stop/start` cujo start abortou no healthcheck do storage.
> Isso causou 1 falha transitória no `byok.test.ts` (não relacionado à fatia). Resolvido com
> `supabase stop && start` limpo (+ `db reset`/restart até GoTrue servir 200): **tudo verde**.
> Não é regressão da fatia.

---

## Revisões aplicadas (spec + qualidade por tarefa)
- **F2 (apa7)**: `splitAuthor` preserva sufixo após múltiplas vírgulas; guarda
  `makeBibliography()` vazio. (review → `3621445`)
- **F5 (worker)**: `loadDocInputs` propaga erro de DB das views PRISMA (evita fluxograma
  zerado silencioso). (review → `1156983`)
- **A2**: APA 7 em texto puro (`setOutputFormat`) — corrige `&#38;`→`&` no separador de
  autores; +teste de regressão. (`6f4cf61`)
- DOCX/PDF aprovados em revisão combinada (spec + qualidade) sem changes requested.

---

## Cobertura / escopo
- **US5 completa**: FR-020 (DOCX/PDF/MD equivalentes + fluxograma/checklist/características
  embutidos), FR-022 (APA 7; metadados ausentes marcados), SC-005 (5 formatos numa operação). ✅
- **Não-regressão Marcos 1–3**: só arquivos novos + edições pontuais (`batch-worker.ts`,
  `ExportPanel.tsx`, `export.test.ts`, `export.spec.ts`). Loop de resiliência/upload/finalize
  da F5 intacto.

## Commits (branch da fatia, base `3fedbae`)
`64cf551` deps+CSL · `39e5711`/`3621445` apa7 · `cb6b223` docx · `98ac44a` pdf · `e0d1a94`/`1156983`
worker · `bb3785c` UI · `36460b9` e2e · `307d0e2` resiliência (prisma_svg) · `6f4cf61` A2 fidelity.

## Próximo
Após o merge manual desta fatia na branch da feature, registrar o SHA no `slicing.md`. Como
esta é a **fatia terminal**, o **Marco 3 fica completo** com o merge. O desenvolvedor deve
rodar o e2e (`export.spec.ts`) e a validação A2 visual (abrir DOCX/PDF) como parte do merge.
