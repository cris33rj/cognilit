# Slicing — Marco 2 (Coração AI-first)

> Decidido no `brainstorming` da Sessão B (CHECKPOINT 1). Define as **fronteiras das
> fatias** e a resolução dos itens de implementação **A1–A4** do `HANDOFF.md`. Ancorado
> no [`codebase-map.md`](./codebase-map.md), no [`data-model.md`](../data-model.md) e nos
> três contratos. **Não reabre produto** (canônico em `CONTEXT.md`/`constitution.md`).
>
> Regime: **uma fatia por vez**. Por fatia: `writing-plans` (CHECKPOINT 2) →
> `using-git-worktrees` → `subagent-driven-development` → **PARAR** (CHECKPOINT 3) →
> aguardar **merge manual do usuário** → próxima fatia. Branch:
> `build/002-marco2-coracao-ai-first/<n>-<slug>`. Nunca `merge`/`push` para a feature ou `main`.

---

## Estado de execução das fatias

> Tracking vivo (atualizar ao fim de cada CHECKPOINT 3 / merge). Detalhe por fatia em
> `COMPLETION-fatia-<n>.md`.

| Fatia | Branch | Estado | Merge |
|---|---|---|---|
| **F1** — Ingestão de PDF | `…/1-ingestao-pdf` | ✅ mergeada | `0736b8c` (2026-06-10) |
| **F2** — Pipeline de texto | `…/2-pipeline-texto` | ⏭️ próxima (writing-plans) | — |
| **F3** — Formulário de extração | `…/3-formulario-extracao` | ⬜ pendente | — |
| **F4** — Extração por IA | `…/4-extracao-ia` | ⬜ pendente | — |
| **F5** — Extração em lote | `…/5-extracao-lote` | ⬜ pendente | — |
| **F6** — Busca semântica/RAG | `…/6-busca-semantica` | ⬜ pendente | — |

---

## Resolução dos itens A1–A4 (esclarecidos no brainstorming, 2026-06-09)

### A1 — Padrão de worker dos jobs de IA → **server-side Node (espelhar screening)**
Achado §7-A do `codebase-map.md`: o caminho de IA do Marco 1 roda **inteiramente
server-side em Node**, não no Edge/`pg_cron`. Enqueue via RPC numa Server Action
(`enqueueScreeningBatch`→`create_screening_job`); run via Server Action `runScreeningWorker`
(`actions.ts:248`) que resolve `getLLMProvider` (fallback `MockLLMProvider`) e chama
`runScreeningWorkerWith(admin, provider, …)`. O `COMPLETION-fatia-5.md:102` registra que
integrar IA no Edge `jobs-worker`/Deno foi adiado porque *"a chamada ao `LLMProvider` Node
não roda no Deno edge sem adaptação"*.

**Decisão:** todos os jobs de IA do Marco 2 — `pdf_text_pipeline` (incl. OCR multimodal),
`ai_extraction_batch`, `embedding_batch` — seguem o padrão **server-side Node**: cada um
ganha `run<X>WorkerWith(admin, provider, …)` + Server Action que resolve o provider
(`getLLMProvider` / novo `getEmbeddingProvider`). A Edge `jobs-worker`/`pg_cron` permanece
**só com `import_parse`** (não estender). O gatilho síncrono de upload (Server Action/route)
**só valida/persiste/enfileira** (§VIII/FR-005); o trabalho pesado roda no worker Node, com
o modelo `job`/`job_item` (progresso, retomável, resiliente por-item). **Atribuído à Fatia 2**
(também a lib de extração nativa R1 e o limiar de densidade, a calibrar contra PDFs reais — D31).

### A2 — Parâmetros de embeddings → **defaults fixados na Fatia 6**
Voyage `voyage-3` (1024 dim); chunking **ancorado por página** (~512 tokens, ~15% overlap,
R6); índice **HNSW** `vector_cosine_ops` (`m=16`, `ef_construction=64`). Afináveis sem mudar
schema. Dep Voyage adicionada **por tarefa explícita** na Fatia 6. **Atribuído à Fatia 6.**

### A3 — Dimensão variável vs. HNSW de dimensão fixa → **explicitar na migration de pgvector**
`embedding_chunk` guarda `provider`/`model`/`dim` (dimensão variável, D28/FR-026); o índice
HNSW é por **dimensão fixa do provedor ativo** (default 1024). Trocar de provedor com outra
dimensão é **operação de reindexação/migração**, **não** caminho quente da v1 — registrar
como comentário explícito na migration. **Atribuído à Fatia 6.**

### A4 — Teto de tamanho/página por PDF → **50 MB / 300 páginas**
Validação **síncrona** no enqueue (além de MIME `application/pdf` + integridade), antes de
persistir/enfileirar; nunca parsing inline. Protege o worker e limita custo de OCR. Folga
para escaneados longos/teses; a estimativa de custo (FR-022) avisa antes de lotes.
**Atribuído à Fatia 1.**

---

## As 6 fatias

### Fatia 1 — Ingestão de PDF: Storage + anexo no workbench  *(US1-A)*
- **Branch:** `build/002-marco2-coracao-ai-first/1-ingestao-pdf`
- **Migration (0012):** `document` (+ RLS por membro); **Storage** bucket privado +
  policies em `storage.objects` por path `review/<review_id>/record/<record_id>/<id>.pdf`
  (R7); `ALTER TYPE job_type ADD VALUE 'pdf_text_pipeline'` (aditivo).
- **Escopo:**
  - Afordância de **upload de PDF no modo Texto completo do workbench** (extensão aditiva
    pré-autorizada; **não** refragmenta a triagem — Princípio V). Anexo só a `record` com
    `corpus_state ∈ {included_ts, included_ft}`.
  - Gatilho **síncrono** (Server Action/route) que **só** valida (MIME + integridade +
    **teto 50MB/300pg — A4**), persiste binário no Storage e **enfileira** job
    `pdf_text_pipeline` `queued` + cria `document` (FR-001/002/003/005). Inválido ⇒ erro
    claro, **nada** persistido (FR-003).
  - `document.processing_status` (FR-004) + lista de PDFs por estudo + polling (TanStack).
  - **Não** processa texto (isso é a Fatia 2).
- **FR:** 001, 002, 003, 004, 005 (parte síncrona). **A\*:** A4. **Achados:** §7-E.
- **Testes:** upload de não-PDF/corrompido ⇒ 400, zero `document`; PDF de uma Revisão não
  acessível de outra (RLS/Storage, SC-011); gatilho síncrono não faz parsing (§VIII).
- **Entregável isolado:** anexar e guardar PDFs escopados, com estado visível.

### Fatia 2 — Pipeline de texto assíncrono híbrido  *(US1-B)*
- **Branch:** `build/002-marco2-coracao-ai-first/2-pipeline-texto`
- **Migration (0013):** `text_layer` (+ RLS).
- **Nova dep (por tarefa explícita — constitution §Portões):** lib de extração nativa
  compatível (`unpdf`/`pdfjs-dist`, R1) — **validar contra PDFs reais do corpus** (D31).
- **Escopo:**
  - Worker **server-side Node** `runPdfPipelineWorkerWith(admin, provider, …)` (A1, espelha
    `runScreeningWorker`); commit por item (PDF; páginas como sub-passos), **retomável**,
    **resiliente por-item** (SC-007).
  - Extração **nativa determinística** por página; **detecção nativo vs escaneado** por
    **limiar de densidade de texto** (A1 — calibrar); páginas escaneadas → OCR via novo
    **`LLMProvider.ocrPage`** (multimodal). Grava `text_layer` com `origin` `nativo|ocr_ia`
    (FR-007/008); `page ≥ 1`, conteúdo no **idioma original** (FR-015).
  - `document.processing_status`: `processing → text_ready | partial | failed`.
- **FR:** 006, 007, 008 (+ encerra a parte assíncrona de 005). **A\*:** A1. **Achados:** §7-A, §7-D.
- **Testes:** PDF com camada → `origin='nativo'`; escaneado → `'ocr_ia'`; falha em 1 PDF/página
  ⇒ `completed_with_errors`/`partial`, demais `done`; reinício do worker retoma `pending`/`failed`.
- **Entregável isolado:** corpus de PDFs com texto pronto para IA, com proveniência por camada.

### Fatia 3 — Formulário de extração configurável  *(US2)*
- **Branch:** `build/002-marco2-coracao-ai-first/3-formulario-extracao`
- **Migration (0014):** `extraction_form` (**1:1** com `review` — Q2) + `extraction_field` (+ RLS).
- **Escopo:** form builder (campos tipados **text/number/date/boolean/select**, nome, ordem;
  `select`⇒`options` não-vazio); editar/remover campo com `audit_entry`, **sem** apagar
  silenciosamente `extraction_value` validado; engine **genérica** projetada para futuros
  instrumentos (viés/CERQual) **sem** implementá-los (FR-009/010/011). **Sem IA.**
- **FR:** 009, 010, 011. **A\*:** —. **Achados:** —.
- **Independência:** não depende de F1/F2; **precede** a Fatia 4.
- **Testes:** montar form, reordenar, editar/remover; pertence à Revisão; `select` exige opções.
- **Entregável isolado:** instrumento de extração configurado e reaproveitável.

### Fatia 4 — Extração por IA: grounding + proveniência + validação humana  *(US3)*
- **Branch:** `build/002-marco2-coracao-ai-first/4-extracao-ia`
- **Migration (0015):** `ALTER TYPE ai_target_kind ADD VALUE 'extraction'`; `extraction_value`
  (`record × field`, `final_value` jsonb, `state`, `ai_suggestion_id`, `superseded_by_id`) + RLS.
- **Escopo:**
  - **`LLMProvider.extractFields`** (texto **direto** da `text_layer`, chunking interno R6;
    **NÃO** consome embeddings — Q1/US3⟂US5) + `MockLLMProvider`; `estimateCost` ganha kind
    `ai_extraction_batch` (a infra de lote é a Fatia 5; aqui o contrato do método).
  - Extração **por estudo** (single): cria `ai_suggestion` (`target_kind='extraction'`,
    `grounding`→`text_layer` `{text_layer_id,page,source_span,origin}`, **not_found 1ª classe**
    FR-013, **inferred** FR-014, **proveniência obrigatória** FR-016).
  - Validação humana: **aceitar/editar/rejeitar** → `extraction_value.final_value` (humano;
    **FR-019 a IA nunca finaliza**; §I); **re-extração encosta sem sobrescrever** (FR-019a/Q4).
  - **Reusa `src/components/ai/*`** (SuggestionChip/ProvenancePopover/SuggestionActions/NotFound)
    — **sem** novo sistema visual (FR-020). pt-BR; trecho no original (FR-015).
  - **Fase Extração** no trilho (§7-C): `app/reviews/[reviewId]/extraction/`, `PhaseKey`
    aditivo em `phases.ts` com `completed` próprio (não quebrar a derivação T/R).
- **FR:** 012, 013, 014, 015, 016, 017, 017a, 018, 019, 019a, 020, 030. **A\*:** —. **Achados:** §7-C, §7-D.
- **Depende de:** Fatia 2 (`text_layer`) + Fatia 3 (formulário).
- **Testes:** `extractFields` com proveniência 100%; campo ausente ⇒ `not_found`; inferido ⇒
  `state='inferred'`; **não** lê `embedding_chunk` (US3⟂US5); re-extração ⇒ nova sugestão
  `pending`, `final_value` anterior intacto; aceitar/editar/rejeitar grava estado + `audit_entry`.
- **Entregável isolado:** estudo com dados extraídos e validados, rastreáveis ao PDF.

### Fatia 5 — Extração em lote + estimativa de custo + consumo  *(US4)*
- **Branch:** `build/002-marco2-coracao-ai-first/5-extracao-lote`
- **Migration (0016):** `ALTER TYPE job_type ADD VALUE 'ai_extraction_batch'`.
- **Escopo:** enqueue de lote (Server Action + RPC `create_extraction_job`, espelha
  `enqueueScreeningJob`) sobre seleção de estudos com PDF processado; **estimativa de
  custo/tokens antes + confirmação** (FR-022/SC-006); worker `runExtractionBatchWorkerWith`
  (Node, A1) — por item = 1 estudo; `ai_usage(phase='extraction')` (`phase` é text, **sem
  ALTER**); **resiliente por-item**, progresso/retomável (FR-021); **consumo acumulado por
  Revisão/fase** (FR-023); sem 1ª chave ⇒ sinaliza e permite extração manual, **não trava**.
- **FR:** 021, 022, 023. **A\*:** —. **Achados:** —.
- **Depende de:** Fatia 4.
- **Testes:** estimativa exibida antes da execução; falha por-item não derruba o lote;
  consumo atualizado; sem chave ⇒ sinalização clara, fluxo segue.
- **Entregável isolado:** extração de muitos estudos com custo previsível e controlado.

### Fatia 6 — Busca semântica / RAG  *(US5)*
- **Branch:** `build/002-marco2-coracao-ai-first/6-busca-semantica`
- **Migration (0017):** extensão `vector` (pgvector) + `embedding_chunk`
  (`vector(1024)`, `provider`/`model`/`dim`) + índice **HNSW** `vector_cosine_ops` + RLS;
  `ALTER TYPE job_type ADD VALUE 'embedding_batch'`; **`byok_key` 2ª chave (§7-B)** —
  adicionar `purpose` enum `llm|embedding`, incluir provider `voyage`, trocar unicidade para
  `(review_id, purpose)`, **parametrizar `set_byok_key`/`get_byok_secret`/`getByokStatus` por
  `purpose`** (mudança tocando código herdado — **exceção justificada** da não-regressão).
  Comentário explícito sobre **dimensão fixa do índice vs. dimensão variável do schema (A3)**.
- **Nova dep (por tarefa explícita):** cliente **Voyage AI** (R4).
- **Escopo:**
  - Novo **`EmbeddingProvider`** (`src/lib/ai/embedding/` — `types`/`mock`/`voyage`, espelha o
    padrão do LLM); **2ª chave BYOK** cifrada via Vault, **distinta** da do LLM (FR-028);
    defaults A2 (voyage-3/1024, chunking ancorado, HNSW cosseno).
  - `embedding_batch` worker **server-side Node** (A1); chunking **ancorado** de `text_layer`
    (R6); `embed`; `ai_usage(phase='embedding')`; resiliente por-item (FR-027).
  - Busca: query → `embedQuery` → pgvector **escopada por `review_id`** (RLS + filtro
    explícito, FR-025); retorna trechos ancorados **página/posição + estudo** (FR-024);
    surface `app/reviews/[reviewId]/search/`. Sem 2ª chave ⇒ **indisponível**, resto operável
    (FR-028).
- **FR:** 024, 025, 026, 027, 028, 030. **A\*:** A2, A3. **Achados:** §7-B.
- **Independência:** **independente de US3** (Q1) — ordenada por último; sua ausência não
  bloqueia F1–F5.
- **Testes:** `embed` ⇒ vetor de length === `dimension`; busca de A nunca retorna chunk de B
  (SC-008/011); resultado com `page`+`source_span` ancorados; sem 2ª chave ⇒ "indisponível",
  produto não trava; mock determinístico cobre busca sem rede.
- **Entregável isolado:** recuperação de evidência ancorada sobre o corpus da Revisão.

---

## Gate de cobertura (PROTOCOLS.md, Sessão B)

| Critério | Status |
|---|---|
| **Toda US coberta** | US1→F1+F2 · US2→F3 · US3→F4 · US4→F5 · US5→F6 ✅ |
| **União sem sobreposição** | cada FR-001..030 + 017a/019a atribuído a exatamente uma fatia (FR-029 audit + FR-030 visual são transversais, aplicados em cada fatia onde mudam estado/renderizam IA) ✅ |
| **Ordem respeita schema** | migrations 0012→0017 em ordem de dependência (document→text_layer→form→extraction_value→embedding); migration + RLS primeiro em cada fatia (Princípio IV) ✅ |
| **Cada A\* atribuído** | A1→F2 · A2→F6 · A3→F6 · A4→F1 ✅ |
| **Nenhuma tecnologia fora do plan.md** | libs novas (PDF parsing R1, Voyage R4, pgvector R5) só **por tarefa explícita** nas fatias 2 e 6; nada além do `plan.md` ✅ |
| **US3 ⟂ US5** | F4 não depende de F6; F6 ordenada depois (Q1) ✅ |
| **Não-regressão** | nenhuma fatia refatora workbench/triagem/`screening`/`import`; exceções aditivas: upload no modo Texto completo (F1), fase Extração no trilho (F4), 2ª chave em `byok_key` (F6, justificada); `ALTER`s de enum **aditivos** ✅ |

**Mapa FR → fatia (verificação):** 001-004→F1 · 005→F1(síncrono)/F2(assíncrono) · 006-008→F2 ·
009-011→F3 · 012-020→F4 · 021-023→F5 · 024-028→F6 · 029→F1–F6 (transversal) · 030→F4,F6.

---

## Dependências entre fatias (ordem de execução)

```
F1 (ingestão) ──► F2 (pipeline) ──► F4 (extração) ──► F5 (lote)
                                      ▲
F3 (formulário, independente) ───────┘
F6 (RAG) — independente de F4/F5; precisa de F2 (text_layer); ordenada por último.
```

Ordem de build recomendada: **F1 → F2 → F3 → F4 → F5 → F6**. (F3 é independente e poderia
vir antes; mantida após o pipeline por leitura natural ingestão→texto→formulário→extração.)

## Regime de execução por fatia (lembrete)
`writing-plans` (CHECKPOINT 2) → `using-git-worktrees` → `subagent-driven-development` (TDD,
commit no branch isolado da fatia) → **PARAR** (CHECKPOINT 3: branch + diff + testes +
`npm run lint` + `tsc --noEmit`) → aguardar **merge manual do usuário** → próxima fatia.
**Uma fatia por vez. Nunca encadear. Nunca `merge`/`push` para a feature ou `main`.**
