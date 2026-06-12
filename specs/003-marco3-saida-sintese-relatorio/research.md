# Research — Marco 3: Saída (síntese, relatório/fluxograma PRISMA, exportações)

**Feature**: `003-marco3-saida-sintese-relatorio` | **Date**: 2026-06-12
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), constitution, Marco 1–2 (`data-model.md`, migrations `0001`–`0017`)

> Resolve os pontos que o `CONTEXT.md` deixou explicitamente ao `/plan` (D17, D20, D25,
> D29) e as decisões técnicas do marco. Formato por item: **Decisão · Justificativa ·
> Alternativas rejeitadas**. Todas dentro da stack ratificada (constitution §Restrições)
> e ancoradas no código real dos Marcos 1–2.

---

## R1 — Geração da síntese qualitativa (clustering temático + narrativa)

**Decisão**: A síntese roda como job assíncrono `synthesis_batch`. O worker reúne os
`extraction_value` **validados** (`state ∈ {accepted, edited, inferred-ratificado}`) dos
estudos incluídos (`record.corpus_state = included_ft`) e chama o `LLMProvider`
estendido (`synthesizeThemes`) para propor **temas** e, por tema, uma **narrativa**
rascunhada e uma **tabela-resumo**. Cada tema e cada afirmação nascem como
`ai_suggestion` (`target_kind = synthesis_theme`) no estado `pending`, com **grounding
em nível de achado**: o tema referencia os `extraction_value` específicos que o
sustentam (tabela `theme_finding`, R-grounding/Q3). Granularidade de resiliência: o item
do job é o **estudo** (contribuição de cada estudo ao pool de achados); falha de um
estudo não derruba o lote (§VIII). O clustering final é uma etapa de agregação sobre o
pool; se o corpus for grande, é feito em sub-lotes (map-reduce) preservando as âncoras.

**Justificativa**: respeita o gradiente de autonomia (§I — a IA sugere temas/narrativa, o
humano ratifica) e o contrato anti-alucinação (§II — toda narrativa ancora em achados
reais já extraídos, nunca em inferência sem âncora). Reusa a infra `job`/`job_item` e o
`LLMProvider` já existentes (não inventa motor novo).

**Alternativas rejeitadas**: (a) clustering por embeddings/k-means sobre os PDFs — reusa
o `EmbeddingProvider` do Marco 2 mas perde a explicabilidade e o grounding em achado
(temas viram clusters opacos); rejeitada por §II. (b) síntese síncrona no request —
viola §VIII para corpora reais. (c) gerar a narrativa sem registrar `theme_finding` —
quebraria o grounding fino exigido pela clarificação Q3.

---

## R2 — Fluxograma PRISMA 2020 (render + exportação SVG/PNG)

**Decisão**: O fluxograma é **derivado, não recontado**: consome as views existentes
`prisma_counter` e `prisma_exclusion_breakdown` (`0007`), que já são a **fonte única** dos
contadores vivos do shell (Princípio VI). `src/lib/prisma/` ganha um *builder* que mapeia
essas linhas para o **modelo de caixas do PRISMA 2020** e emite **SVG por template
determinístico** (string SVG, sem lib de layout). O fluxograma in-app é um Server
Component que renderiza esse SVG (síncrono, leve, read-only). A **exportação PNG** (e o
empacotamento no DOCX/PDF) é feita no `report_export` job via **`@resvg/resvg-wasm`**
(rasteriza SVG→PNG em WASM, compatível com Deno). As caixas de fontes fora da busca em
base ficam em **zero/ocultas** na v1 (clarificação Q4); nenhum campo manual (FR-011a).

**Justificativa**: garante a consistência **número-a-número** entre UI e entregável **por
construção** (§VI) — o entregável é o espelho da mesma fonte, não um artefato gerado do
zero. SVG por template é determinístico e testável; `@resvg/resvg-wasm` evita chromium/
binário externo (incompatível com Edge Function, §VIII).

**Alternativas rejeitadas**: (a) recalcular contagens no Marco 3 — duplicaria a fonte e
arriscaria divergência (defeito de domínio que o §VI proíbe). (b) PNG via headless
chromium/`puppeteer` — indisponível no runtime Deno do worker. (c) lib de diagramas
(mermaid/d3) — overkill; o PRISMA 2020 tem layout fixo e conhecido.

---

## R3 — Geração de documentos (DOCX, PDF, Markdown) no worker

**Decisão**: A exportação roda como job `report_export`; o worker monta um **conteúdo
estruturado canônico** (do `report` + seções + fluxograma PNG + tabela de características
+ checklist) e o serializa por formato com **bibliotecas puras-JS Deno-compatíveis**:
**Markdown** por montagem direta (canônico/intermediário); **DOCX** via `docx`; **PDF**
via `pdfmake` (document-definition puro-JS, embute o PNG do fluxograma). Cada formato é um
**item de job** — falha de um formato não derruba os outros (FR-023, resiliência por-
formato). Os artefatos vão para o bucket `exports` (R8). **Validar contra saída real**
(fidelidade visual e abertura no Word/leitores) é tarefa de fatia, como o Marco 2 validou
as libs de PDF contra o corpus.

**Justificativa**: mantém todo o trabalho pesado no worker existente (§VIII) sem
introduzir um host Node separado — preserva a infra dos Marcos 1–2 sem refator. Libs
puras-JS rodam no Deno via `npm:` specifier (como `unpdf`/`@anthropic-ai/sdk` já fazem).

**Risco/alternativa registrada**: se `docx`/`pdfmake` não atingirem fidelidade suficiente
no runtime Deno, a alternativa é um **worker Node dedicado** (Vercel background / serviço
à parte) só para export — decisão a reavaliar na fatia de export com base na saída real;
não é assumida agora para evitar complexidade prematura. (b) `pandoc`/`typst` (binário
externo) — rejeitado: indisponível em Edge Function. (c) `@react-pdf/renderer` —
Node-cêntrico, menos previsível em Deno que `pdfmake`.

---

## R4 — Citações APA 7 (CSL) e exportação BibTeX/RIS

**Decisão**: A formatação de citações e da lista de referências usa **`citeproc`**
(citeproc-js, puro-JS) com o **estilo CSL APA 7** empacotado; a entrada é **CSL-JSON**
derivada dos metadados bibliográficos já presentes no `record` (importados no Marco 1).
A exportação **BibTeX** e **RIS** usa **serializadores próprios** (`src/lib/export/`),
testados por unidade contra casos canônicos — os formatos são bem-especificados e o
projeto já tem `@retorquere/bibtex-parser` para o caminho de leitura; gerar não requer
nova dependência pesada. Campos bibliográficos ausentes são **marcados** (não inventados),
coerente com §II (edge case "citação sem metadados completos").

**Justificativa**: `citeproc`+CSL é o padrão de fato para APA 7 plugável (D20 prevê CSL);
serializadores próprios para BibTeX/RIS dão controle e testabilidade sem acoplar a lib de
geração. APA 7 é o **único** estilo da v1 (constitution §Restrições) — sem outros CSL.

**Alternativas rejeitadas**: (a) formatar APA 7 à mão sem CSL — frágil e não-plugável,
contraria D20. (b) usar uma lib de geração BibTeX externa — dependência extra para um
formato trivial de serializar e testar.

---

## R5 — Checklist PRISMA 2020 (itens + cobertura)

**Decisão**: Os **27 itens do PRISMA 2020** (com subitens) são **dados de referência**
(seed estático em `src/lib/prisma/` + snapshot por Revisão em `prisma_checklist_item`).
Cada item mapeia para uma **seção do relatório**; o estado (`met | pending |
not_applicable`) é **computado** a partir da presença da seção/dado correspondente (ex.:
item de "fontes de informação" → seção Métodos preenchida; itens de Risco de Viés →
`not_applicable` quando a fase está desligada, D19). O snapshot é gravado na geração para
o pesquisador ver e auditar.

**Justificativa**: o conjunto de itens PRISMA 2020 é fixo e normativo (seed); a cobertura
é derivada do estado real (auto-preenchido, D20/FR-018). `not_applicable` realiza a regra
de **declarar explicitamente o que não foi feito** (D19/§VI).

**Alternativas rejeitadas**: (a) checklist puramente derivado sem snapshot — perde o
rastro histórico (auditoria, §III). (b) itens como texto livre — impede a checagem
automática de cobertura.

---

## R6 — Tabela de características dos estudos

**Decisão**: A tabela de características é **derivação pura** dos `extraction_value`
(`final_value`) × `extraction_field` para os estudos incluídos — uma view/consulta em
`src/lib/prisma/` (ou `report/`), **sem tabela nova**. Uma linha por `record`
(`included_ft`), colunas = campos do `extraction_form` da Revisão (Marco 2). Embutida no
relatório e nas exportações.

**Justificativa**: os dados já existem e estão ratificados; recriá-los violaria a não-
regressão. Derivar garante que a tabela reflete o estado real da extração.

**Alternativas rejeitadas**: materializar uma tabela própria — duplicação de fonte,
risco de divergência com a extração.

---

## R7 — Regeneração do relatório preservando edições humanas (Q1)

**Decisão**: Cada `report_section` carrega `edit_state ∈ {ai_generated, human_edited,
deterministic}`. A regeneração **só reescreve** seções `ai_generated` e
`deterministic` (estas últimas sempre refletem dados atuais); seções `human_edited` são
**preservadas** e a UI **avisa** quais foram mantidas (FR-016/Q1). Editar uma seção move
seu estado para `human_edited`. A operação é registrada na trilha (§III).

**Justificativa**: implementa diretamente a clarificação Q1 e o humano-no-laço (§I) —
nenhuma sobrescrita silenciosa do trabalho humano (§III).

**Alternativas rejeitadas**: (a) versionar o documento inteiro a cada regeneração —
rejeitada na clarificação (schema mais pesado, fora do escopo). (b) regenerar tudo com
confirmação — perde edições por seção; menos seguro.

---

## R8 — Storage dos artefatos exportados (bucket + RLS)

**Decisão**: Novo bucket privado **`exports`**; cada artefato em
`review/<review_id>/report/<report_id>/<format>/<id>.<ext>`. Política em
`storage.objects` deriva `review_id` do path e exige `member` (mesmo padrão R7 do Marco
2). A tabela `export_artifact` indexa os artefatos (formato, path, job, timestamp).

**Justificativa**: reusa o padrão de Storage RLS já validado no Marco 2 (§IV);
artefatos grandes não cabem em coluna de tabela e precisam de download direto.

**Alternativas rejeitadas**: guardar bytes em coluna `bytea` — ruim para arquivos
grandes e download. Bucket público — viola o isolamento por Revisão (§IV).

---

## R9 — Fronteira de IA, custo e contabilidade (Métodos/Resultados determinísticos)

**Decisão**: **Só** a síntese (R1) e o rascunho de **Discussão/Conclusão** consomem o
`LLMProvider`. **Métodos, Resultados, declaração de IA e desvios do protocolo são
montagem determinística** (sem LLM): Métodos/Resultados a partir de pergunta/critérios/
protocolo/contagens/síntese ratificada; declaração de IA a partir das `ai_suggestion`
usadas nas fases (screening/extraction/synthesis/report) com sua proveniência; desvios a
partir das **emendas versionadas/datadas** do protocolo (Marco 1, `0002`). `estimateCost`
roda **antes** do `synthesis_batch` e do `report_draft` (FR-006); o consumo é gravado em
`ai_usage` nas phases `synthesis` e `report` (FR-026/§VII).

**Justificativa**: maximiza a **fidelidade factual** (§II/D29 — Métodos/Resultados fiéis
aos dados, não "alucináveis") e minimiza custo/risco de IA. A declaração de IA precisa ser
**factual e completa** (D13) — montá-la deterministicamente das tabelas é mais confiável
que pedir a um LLM.

**Alternativas rejeitadas**: (a) rascunhar Métodos/Resultados via LLM — arrisca
divergência dos dados reais (anti-§II) e gasto desnecessário. (b) pedir ao LLM para
listar onde a IA foi usada — a fonte de verdade são as `ai_suggestion`, não a memória do
modelo.

---

## Síntese das decisões → próximos artefatos

- **Tabelas novas** (data-model): `synthesis`, `theme`, `theme_finding`, `report`,
  `report_section`, `prisma_checklist_item`, `export_artifact`.
- **ALTERs aditivos**: `ai_suggestion.target_kind` (+`synthesis_theme`, +`report_section`);
  `job.type` (+`synthesis_batch`, +`report_draft`, +`report_export`); `ai_usage.phase`
  (+`synthesis`, +`report`).
- **Reuso sem recriar**: views `prisma_counter`/`prisma_exclusion_breakdown`,
  `extraction_value`/`extraction_field`, `record`, `protocol`+emendas, `ai_suggestion`,
  `job`/`job_item`, `ai_usage`, `LLMProvider`, vocabulário visual de IA, padrão de Storage
  RLS.
- **Novas dependências** (só por tarefa explícita): `docx`, `pdfmake`,
  `@resvg/resvg-wasm`, `citeproc` (+ CSL APA 7).
- **Contratos** (Fase 1): `synthesis.md`, `report.md`, `prisma-export.md`.
