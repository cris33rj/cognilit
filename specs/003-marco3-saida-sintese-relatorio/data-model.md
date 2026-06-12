# Data Model — Marco 3: Saída (síntese, relatório/fluxograma PRISMA, exportações)

**Feature**: `003-marco3-saida-sintese-relatorio` | **Date**: 2026-06-12
**Input**: [spec.md](./spec.md) §Key Entities, [research.md](./research.md), Marco 1–2 `data-model.md`

> Modelo lógico **incremental**: estende o schema dos Marcos 1–2 (migrations `0001`–`0017`),
> **não o reescreve**. Convenções (CLAUDE.md): identificadores em **inglês**; `enum` no
> banco; datas `DATE`. **RLS habilitada em TODAS as tabelas novas** (Princípio IV). Toda
> mudança de estado de Revisão gera `audit_entry` (Princípio III). Tipos exatos de coluna,
> índices finais e redação das políticas RLS são detalhe da migration (Sessão B). Novas
> migrations a partir de `0018`.

---

## O que é reusado dos Marcos 1–2 (NÃO recriar)

- **Views `prisma_counter` / `prisma_exclusion_breakdown`** (`0007`) — **fonte única** dos
  contadores PRISMA. O fluxograma do Marco 3 **consome** essas views (Princípio VI); não
  há tabela de contagem nova.
- **`record`** (o "estudo": `corpus_state = included_ft` = incluído após Texto completo) —
  alvo da síntese, da tabela de características e das referências.
- **`extraction_value` / `extraction_field`** (`0014`/`0015`) — fonte dos achados (para a
  síntese, com grounding em nível de achado) e da tabela de características. Reuso, não
  recriar.
- **`protocol`** + **emendas versionadas/datadas** (`0002`) — fonte dos **desvios do
  protocolo** no relatório.
- **`ai_suggestion`** (`0002`+) — entidade transversal de sugestão (provenance, state,
  not_found, grounding). Marco 3 a **estende** (`target_kind` += `synthesis_theme`,
  `report_section`). Reuso do vocabulário visual (EP-3).
- **`job` / `job_item`** — infra de job assíncrono. Marco 3 **adiciona `type`s**.
- **`ai_usage`** — contabilidade por Revisão/fase. Marco 3 adiciona `phase`s.
- **`audit_entry`** (insert-only), **`member`** (RLS), **`review`** (raiz) — usados como
  estão. Padrão de **Storage RLS por path** (`0012`) — reusado para o bucket `exports`.

---

## Diagrama de relações (texto) — adições do Marco 3

```
review
  ├─1:1─ synthesis ─1:N─ theme ─1:N─ theme_finding ──► extraction_value   (grounding nível de achado, Q3)
  │                          └─(ai_suggestion target_kind=synthesis_theme)
  ├─1:1─ report ─1:N─ report_section                                       (edit_state por seção, Q1)
  │                       └─(ai_suggestion target_kind=report_section, p/ Discussão/Conclusão)
  ├─1:N─ prisma_checklist_item   (snapshot dos 27 itens PRISMA 2020 + cobertura)
  ├─1:N─ export_artifact ──► storage.objects (bucket `exports`)            (DOCX/PDF/MD/BibTeX/RIS/SVG/PNG)
  ├─(views) prisma_counter / prisma_exclusion_breakdown                    (fonte do fluxograma — REUSO)
  ├─1:N─ job ─1:N─ job_item  (novos type: synthesis_batch | report_draft | report_export)
  └─1:N─ ai_usage            (novas phase: synthesis | report)
```

RLS transversal: toda tabela nova com `review_id` é acessível só se existe
`member(review_id, user_id = auth.uid())`. Artefatos no Storage: política em
`storage.objects` por path `review/<review_id>/...` no bucket `exports` (R8).

---

## Entidades novas

### synthesis  *(agregado da síntese — US1)*
- `id` (PK), `review_id` (FK, **1:1** — uma síntese mutável por Revisão, clarificação Q2/FR-005a)
- `status` enum `draft | generating | ready | failed` — reflete o `synthesis_batch`.
- `created_at`, `updated_at`
- **Regra**: re-gerar **atualiza** a síntese existente preservando temas/narrativa
  editados pelo humano (análoga ao relatório, R7); o histórico vive na trilha de
  auditoria (sem versionamento de execuções, Q2). Gerar sem dados de extração validados é
  recusado (FR-007) — `status` não avança e a UI informa "dados insuficientes".

### theme  *(tema da síntese — US1)*
- `id` (PK), `review_id` (FK), `synthesis_id` (FK synthesis)
- `name` (text), `narrative` (text, **pt-BR** — D24/FR-024), `order` (int)
- `summary_table` (jsonb nullable) — tabela-resumo do tema (linhas/colunas derivadas dos
  achados; pode ser recomputada).
- `ai_suggestion_id` (FK ai_suggestion, nullable) — a sugestão que originou o tema.
- `state` enum `pending | accepted | edited | rejected` (FR-002) — humano-no-laço.
- `created_at`, `updated_at`
- **Validação**: `name` não-vazio; `state=rejected` mantém o registro para a trilha mas o
  tema sai da síntese ativa (acceptance scenario US1.3). Operações renomear/fundir/dividir/
  reordenar persistem e registram `audit_entry`.

### theme_finding  *(grounding tema → achado — US1, Q3)*
- `id` (PK), `review_id` (FK), `theme_id` (FK theme)
- `extraction_value_id` (FK extraction_value) — o **achado específico** que sustenta o
  tema (grounding em nível de achado, clarificação Q3/FR-002).
- `order` (int)
- `created_at`
- **Regra**: a narrativa do tema referencia estes achados; é o que torna a síntese
  **verificável** (§II). Apagar um `extraction_value` reflete aqui sem deixar grounding
  órfão (FK on delete trata; registra na trilha).

### report  *(relatório estruturado — US3)*
- `id` (PK), `review_id` (FK, **1:1** — um por Revisão, regenerável)
- `status` enum `draft | drafting | ready | failed`
- `created_at`, `updated_at`
- **Regra**: regenerar preserva as seções `human_edited` (R7/Q1); a UI avisa quais foram
  mantidas (FR-016).

### report_section  *(seção do relatório — US3)*
- `id` (PK), `review_id` (FK), `report_id` (FK report)
- `kind` enum `methods | results | discussion | conclusion | ai_declaration | deviations`
- `content` (text, markdown, **pt-BR**)
- `edit_state` enum `deterministic | ai_generated | human_edited` (R7/Q1):
  - `deterministic` — Métodos/Resultados/declaração-IA/desvios: montados de dados reais,
    **sem LLM** (R9); regeneração sempre atualiza para refletir o estado atual.
  - `ai_generated` — Discussão/Conclusão rascunhadas por IA; regeneração pode reescrever.
  - `human_edited` — editada pelo humano; **preservada** na regeneração (FR-016).
- `ai_suggestion_id` (FK ai_suggestion, nullable) — presente para seções de origem IA
  (Discussão/Conclusão), com proveniência (§II).
- `order` (int), `updated_at`
- **Validação**: uma seção por `kind` por `report`. Editar move `edit_state → human_edited`
  e registra `audit_entry`. Seções `ai_declaration`/`deviations` nunca são `ai_generated`
  (são factuais/determinísticas — R9).

### prisma_checklist_item  *(checklist PRISMA 2020 auto-preenchido — US4)*
- `id` (PK), `review_id` (FK)
- `item_code` (text) — código do item PRISMA 2020 (seed dos 27 itens, R5).
- `label` (text), `section_ref` (text nullable) — seção do relatório que atende o item.
- `status` enum `met | pending | not_applicable` (FR-018):
  - `not_applicable` realiza a declaração explícita de fase desligada (Viés/Certeza, D19).
- `computed_at`
- **Regra**: snapshot gravado na geração do relatório; `status` computado da presença da
  seção/dado correspondente (R5). `pending` quando o relatório não cobre o item (US4.3).

### export_artifact  *(artefato exportado — US5)*
- `id` (PK), `review_id` (FK), `report_id` (FK report, **nullable** — exportação de
  referências pode ser independente do relatório)
- `format` enum `docx | pdf | md | bibtex | ris | prisma_svg | prisma_png` (FR-020/021/009)
- `storage_path` (text) — `review/<review_id>/report/<report_id>/<format>/<id>.<ext>` (R8).
- `job_id` (FK job, nullable) — o `report_export` que o gerou.
- `created_at`
- **RLS**: membros da Revisão. **Storage**: política em `storage.objects` do bucket
  `exports`, `review_id` derivado do path (R8). Falha de um formato não impede os demais
  (resiliência por-formato, FR-023).

---

## Entidades estendidas (ALTER aditivo, não recriar)

### ai_suggestion  *(estendida)*
- `target_kind`: **adicionar** `synthesis_theme`, `report_section` ao enum existente
  (`eligibility | protocol_draft | screening | extraction | synthesis_theme | report_section`).
- `target_id`: passa a referenciar `theme` e `report_section`.
- `grounding` (jsonb): para `synthesis_theme`, referencia os `extraction_value` de origem
  (nível de achado, Q3); `not_found`/"dados insuficientes" para corpus sem achados (FR-007).
- `provenance` permanece **obrigatório** (modelo, versão, prompt/trecho, timestamp, state).

### job  *(estendida)*
- `type`: **adicionar** `synthesis_batch | report_draft | report_export` ao enum.
  `estimated_cost` preenchido para os de IA (`synthesis_batch`, `report_draft`; FR-006).
- `job_item.payload`: por-item = um **estudo** (`synthesis_batch`, R1), uma **seção IA**
  (`report_draft`), ou um **formato** (`report_export` — resiliência por-formato, FR-023).

### ai_usage  *(estendida)*
- `phase`: passa a aceitar `synthesis` e `report` (FR-026/R9). Métodos/Resultados/
  declaração-IA/desvios **não** geram `ai_usage` (são determinísticos, sem LLM).

---

## Máquina de estados — `synthesis.status`

```
draft ──(usuário aciona; estimateCost ok)──► generating
  generating ──(synthesis_batch conclui; temas pending criados)──► ready
  generating ──(sem achados validados)─────────────────────────► draft (UI: "dados insuficientes", FR-007)
  generating ──(falha estrutural do lote)──────────────────────► failed (retomável, §VIII)
ready ──(re-gerar)──► generating   (preserva temas human-edited; histórico na trilha, Q2)
```

## Máquina de estados — `theme.state` (humano-no-laço)

```
(IA sugere) ─► pending ──► accepted        (tema entra na síntese ativa)
                         ├► edited          (narrative/name editados pelo humano)
                         └► rejected        (sai da síntese ativa; mantido p/ trilha, US1.3)
```
- A IA **nunca** move um tema para `accepted/edited` sozinha (§I).

## Máquina de estados — `report_section.edit_state` (regeneração — Q1/R7)

```
deterministic  ──(regenerar)──► deterministic   (sempre reflete dados atuais: métodos/resultados/decl-IA/desvios)
ai_generated   ──(regenerar)──► ai_generated     (Discussão/Conclusão podem ser reescritas)
ai_generated   ──(humano edita)──► human_edited
human_edited   ──(regenerar)──► human_edited     (PRESERVADA; UI avisa que foi mantida, FR-016)
```

---

## Notas de RLS (resumo — detalhe na migration)
- Padrão: `USING (exists member where review_id = row.review_id and user_id = auth.uid())`
  em `synthesis`, `theme`, `theme_finding`, `report`, `report_section`,
  `prisma_checklist_item`, `export_artifact`.
- `storage.objects` (bucket `exports`): política deriva `review_id` do path e exige
  `member` (R8) — mesmo padrão do bucket de PDFs do Marco 2 (`0012`).
- Views PRISMA (`prisma_counter`/`prisma_exclusion_breakdown`): já com
  `security_invoker = true` — o fluxograma herda a RLS de `record`/`exclusion_reason`
  sem nova política (consistência número-a-número garantida pela fonte única, §VI).

---

## Mapeamento Key Entities (spec) → tabelas
| Spec (Key Entity) | Tabela(s) / Fonte |
|-------------------|-------------------|
| Síntese | `synthesis` |
| Tema | `theme` (+ `theme_finding` para o grounding) |
| Relatório | `report` + `report_section` |
| Fluxograma PRISMA | views `prisma_counter` + `prisma_exclusion_breakdown` (REUSO) → SVG/PNG; `export_artifact` p/ os arquivos |
| Checklist PRISMA | `prisma_checklist_item` |
| Tabela de características | **derivada** de `extraction_value` × `extraction_field` (sem tabela nova, R6) |
| Job de saída | `job` + `job_item` (novos `type`s) |
| Exportação | `export_artifact` (+ `storage.objects` bucket `exports`) |
| Sugestão de IA (tema/seção) | `ai_suggestion` (estendida, `target_kind` += `synthesis_theme`/`report_section`) |
| Consumo de IA | `ai_usage` (novas `phase`s `synthesis`/`report`) |
