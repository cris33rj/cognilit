<!--
SYNC IMPACT REPORT
==================
Version change: TEMPLATE (uninitialized) → 1.0.0
Bump rationale: Primeira ratificação concreta. O arquivo era o template
  com placeholders; passa a constitution real do Cognilit. MAJOR=1 marca
  a adoção inicial dos invariantes.

Principles defined (8):
  I.   Humano-no-laço com gradiente de autonomia da IA   (D11, D12; P1)
  II.  Grounding e proveniência — contrato anti-alucinação (D13, D22, D31; P2)
  III. Auditabilidade e reprodutibilidade de 1ª classe    (D26, D6; P4, EP-4)
  IV.  Isolamento por Revisão com RLS desde a origem       (D2, D21)
  V.   Triagem unificada num único workbench               (D32/EP-1; D6, D7)
  VI.  PRISMA como espinha viva                            (D4, D20; EP-2)
  VII. IA atrás de abstrações trocáveis com BYOK transparente (D14, D28; P5, EP-3)
  VIII.Trabalho pesado é job assíncrono resiliente          (D25, D31)

Added sections:
  - Restrições adicionais (stack, idioma D24/P6, pipeline configurável D19, escopo v1)
  - Fluxo de desenvolvimento e portões de qualidade (Air-Gap, TDD, lint/type-check)
  - Governança

Removed sections: nenhuma (template substituído integralmente).

Templates requiring updates:
  ✅ .specify/templates/plan-template.md   — Constitution Check é genérico; compatível, sem edição necessária
  ✅ .specify/templates/spec-template.md   — compatível; sem edição necessária
  ✅ .specify/templates/tasks-template.md  — compatível; sem edição necessária
  ⚠  Bloco <!-- SPECKIT --> em CLAUDE.md   — apontar feature ativa (passo final da Sessão A, fora deste comando)

Follow-up TODOs: nenhum placeholder diferido.
-->

# Constitution do Cognilit

Cognilit é uma aplicação web multiusuário para conduzir revisões sistemáticas
de literatura (RSL) ponta a ponta, em Ciências Sociais/Humanas/Educação, com
forte automação por IA sob o princípio humano-no-laço. Esta constitution fixa
os invariantes não-negociáveis do produto. Cada princípio rastreia para uma
decisão de Discovery assinada (`docs/CONTEXT.md`, D1–D31) ou para uma emenda de
design ratificada (`docs/DESIGN-DECISIONS.md`, §9). Em conflito, a hierarquia de
autoridade é `docs/CONTEXT.md` > esta constitution > `CLAUDE.md` >
`specs/NNN-<slug>/plan.md`.

## Princípios fundamentais

### I. Humano-no-laço com gradiente de autonomia (D11, D12)

A IA **sugere**; o humano **ratifica**. A IA é autônoma **apenas em extração
factual ancorada** — e mesmo essa saída nasce no estado `pendente de validação`.
Em **todo julgamento** (triagem, risco de viés, síntese, certeza, redação) a IA
propõe e o humano decide; a IA **NUNCA** muda o estado de uma Revisão sozinha.

Toda saída de IA carrega um **estado explícito e visível** na UI: `pendente` ·
`aceita` · `editada` · `rejeitada` · `inferida`. Sugestão de IA recebe tratamento
visual distinto de dado confirmado por humano (cor/ícone/borda); os dois NUNCA se
confundem. A triagem por IA pré-classifica mas **nunca exclui um registro
sozinha**.

*Rationale:* o build anterior fracassou porque a IA tomou decisões de produto e
de tela. O gradiente de autonomia é a salvaguarda de domínio que torna a
automação confiável para o pesquisador.

### II. Grounding e proveniência — contrato anti-alucinação (D13, D22, D31)

Toda saída **factual** da IA referencia um trecho-fonte verificável: `source_span`
+ página. O contrato de saída factual é `{value, source_span, page}` **ou**
`{value: null, reason: "not_found"}` — **"não encontrado" é resposta de primeira
classe**, renderizada explicitamente, nunca como erro ou campo vazio ambíguo. É
proibido preencher por inferência sem âncora.

Campos **inferidos** (ex.: classificar o desenho do estudo) são permitidos, mas
marcados com estado de proveniência `inferido` (≠ `ancorado`) e **exigem
ratificação humana**. Toda sugestão de IA persiste **proveniência obrigatória**:
modelo, versão, prompt/trecho-fonte, timestamp e estado. A camada de texto do PDF
carrega sua origem (`nativo` | `ocr_ia`) e o grounding referencia a camada
efetivamente usada. O relatório final **declara automaticamente** onde a IA foi
usada e em que estado.

*Rationale:* RSL exige rastreabilidade científica. Sem grounding obrigatório a
saída da IA é inverificável e o produto perde valor metodológico.

### III. Auditabilidade e reprodutibilidade de primeira classe (D26, D6)

A trilha de auditoria é **requisito de domínio, não log de debug**. Toda ação que
muda o estado de uma Revisão é registrada de forma **append-only** (ator
humano|IA, timestamp, antes/depois) e a trilha é **exportável** como material
suplementar. Operações onde o domínio exige reversibilidade — notadamente a
deduplicação de exatas e a mesclagem de pares (D6) — são **auditáveis e
reversíveis**, com log.

O estado de navegação que afeta resultado (filtros, ordenação, seleção das filas)
é **reprodutível via URL** (EP-4): uma fila triada é reabrível no mesmo estado.

*Rationale:* reprodutibilidade é o que separa uma RSL de uma busca informal; a
ferramenta deve produzir o rastro que o método científico exige.

### IV. Isolamento por Revisão com RLS desde a origem (D2, D21)

A **Revisão** é o agregado-raiz; todo dado pertence a uma Revisão e é escopado por
usuário/Revisão. **Row Level Security é habilitado desde a 1ª migration** — não é
retrofit. O acesso é mediado pela associação `usuário ↔ Revisão ↔ papel`
(`Owner` / `Reviewer` / `Viewer`), **modelada no schema desde já**. Na v1 o criador
é `Owner`+`Reviewer` único, sem convites; colaboração multi-revisor, cegamento,
kappa e fila de conflitos ficam latentes no schema, **não operacionais na v1**, e
a UI não exibe afordâncias de conflito/kappa enquanto houver um único revisor.

*Rationale:* segurança de dados de pesquisa e o caminho multiusuário não podem ser
adicionados depois sem reescrever o núcleo.

### V. Triagem unificada num único workbench (EP-1 → D32; D6, D7)

Importação, deduplicação e triagem (título/resumo **e** texto completo) ocorrem
numa **única superfície de trabalho**, com troca de **modos** — **NUNCA** em telas
separadas. Dedup e triagem são capacidades sobre o mesmo corpus de registros, não
destinos de navegação distintos. As filas são densas e orientadas a teclado:
toda ação de decisão tem atalho e o mouse é opcional na triagem.

O motivo de exclusão é **obrigatório apenas no texto completo** (lista
configurável por projeto) e alimenta a contagem PRISMA. Nenhuma fatiação de
implementação pode **refragmentar** a triagem em telas separadas.

*Rationale:* a fragmentação da triagem foi o erro emblemático do build anterior.
Esta é a correção central do produto e um invariante de forma, não só de função.

### VI. PRISMA como espinha viva (D4, D20)

O esqueleto metodológico é **orientado à norma PRISMA 2020**. Os contadores PRISMA
(identificados · duplicados · triados · incluídos · excluídos por razão) são
**estado vivo** no shell, sempre reais e visíveis. O **fluxograma PRISMA é
entregável obrigatório** e é o **espelho** desses contadores — não um artefato
gerado do zero no fim. A consistência número-a-número entre o que o usuário vê e o
entregável é garantida por construção (EP-2).

*Rationale:* o fluxograma PRISMA é o coração do relato de uma RSL; divergência
entre a UI e o entregável é um defeito de domínio comum que o produto deve evitar.

### VII. IA atrás de abstrações trocáveis com BYOK transparente (D14, D28)

O projeto tem **dois eixos de IA independentes**, cada um atrás de sua própria
abstração trocável e cada um com sua própria chave BYOK cifrada em repouso e
distinta:

- **`LLMProvider`** (geração): default **Claude (Anthropic)**. É o ponto único que
  expõe modelo/versão para a proveniência, fixa a saída em pt-BR e garante o
  contrato de saída factual.
- **`EmbeddingProvider`** (busca semântica/RAG): default **Voyage AI** hospedado;
  vetores em **pgvector** com dimensão variável definida pelo provedor.

**Nenhum código de feature instancia um SDK de fornecedor diretamente** nem
contorna essas abstrações ("raw write" de saída de IA é proibido). Operações de IA
em lote exibem **estimativa de custo/tokens antes de executar** e **consumo
acumulado por Revisão/fase** (P5); o usuário nunca é surpreendido por gasto da
própria chave. O vocabulário visual de IA (suggestion chip, provenance popover,
grounding highlight, accept/edit/reject, badge "inferido") é **um único sistema
reusado em todas as fases** (EP-3), nunca reinventado por fase.

*Rationale:* trocabilidade protege contra lock-in; BYOK transparente respeita o
custo do usuário; um vocabulário visual único dá coerência ao produto.

### VIII. Trabalho pesado é job assíncrono resiliente (D25, D31)

Trabalho pesado ou de duração imprevisível — parsing de PDF, geração de embeddings
em lote, exportação de relatório — roda como **job assíncrono**: progresso
visível, **retomável** e **resiliente a falha por-item** (uma falha não derruba o
lote). Uma **Edge Function nunca executa trabalho pesado**: ela apenas valida,
persiste no Storage e **enfileira**; o **worker processa**. O parsing de PDF é
híbrido: camada de texto nativa → extração determinística; PDF escaneado → LLM
multimodal como OCR — sempre com origem de proveniência registrada.

*Rationale:* trabalho longo dentro de um request síncrono quebra sob corpora
reais; a separação enfileira/processa é o que torna o produto operável em escala.

## Restrições adicionais

**Stack (D3 — herdada, ratificada no plan).** Next.js 14+ (App Router), React 18+,
TypeScript strict, Tailwind 4, TanStack Table/Query, React Hook Form + Zod,
Supabase (Postgres + RLS + migrations versionadas + Storage + Edge Functions),
Vitest + Playwright, Sentry. Single-app (não monorepo). Código (identificadores,
funções, tipos) em **inglês**.

**Idioma (D24, P6).** Conteúdo de entrada é multilíngue (PT/EN/ES…). A **UI e
todas as saídas geradas pela IA são pt-BR**. O **trecho-fonte citado é sempre
exibido no idioma original** do documento. Idioma é critério de elegibilidade
configurável (vira motivo de exclusão). Datas: `DATE` no banco, `dd/mm/aaaa` na UI.

**Pipeline de fases configurável (D19).** Núcleo fixo (Pergunta → Protocolo →
Busca/Registro → Dedup → Triagem → Extração → Síntese → Redação) + opcionais
ligáveis por projeto (**Risco de Viés**, **Certeza/CERQual**). Fases desligadas
somem do trilho e o relatório **declara explicitamente** o que não foi feito.

**Escopo permanente fora da v1 (D1, §6 do CONTEXT).** Áreas de saúde/bio/vet e suas
normas (RoB 2, ROBINS-I, PROSPERO); meta-análise quantitativa; integração via API
com bases; colaboração multi-revisor operacional; grafos/nuvens de palavras;
visualizador PDF lado-a-lado; LaTeX e CSL além de APA 7. Reabrir qualquer um exige
emenda a `docs/CONTEXT.md` via Sessão A.

## Fluxo de desenvolvimento e portões de qualidade

**Regime Air-Gap Handoff (duas sessões).** Sessão A (grill-me + spec-kit) faz
discovery/spec; Sessão B (Superpowers) faz fatiação + planejamento + execução. O
handoff é por arquivo em disco. As regras operacionais estão em
`.claude/PROTOCOLS.md` e no contrato de entrada da Sessão B em `CLAUDE.md`; esta
constitution não as duplica, apenas as torna vinculantes.

**Disciplina de testes (NÃO-NEGOCIÁVEL).** Cada regra de negócio tem testes
unitários dedicados; o desenvolvimento segue TDD (RED → GREEN → REFACTOR). Testes
e2e cobrem os fluxos críticos da v1 (importar, triar título/resumo e texto
completo, ingestão+extração por IA, exportação). Coverage mínimo **80%** nas
funções críticas de deduplicação, triagem e parsing de metadado.

**Portões de qualidade.** `npm run lint` e `tsc --noEmit` **devem passar** antes de
apresentar qualquer fatia para revisão. Sem `any` (usar `unknown`). Server
Components por padrão; `'use client'` só onde necessário. Lógica de negócio em
hooks `use*.ts`; um componente por arquivo; PascalCase. Migrations/schema precedem
o código que os consome. Dependências novas só com tarefa explícita no plano.

**Commit isolado por fatia, merge manual.** A execução commita apenas em branch de
trabalho isolado (`build/NNN-<slug>/<n>-<slug-da-fatia>`); **nunca** faz `merge` ou
`push` para a branch da feature ou `main`. O merge é operação exclusiva do
desenvolvedor, após parada obrigatória ao fim de cada fatia.

## Governança

Esta constitution está **subordinada a `docs/CONTEXT.md`** (Discovery assinada) e
**supera** `CLAUDE.md` e os `plan.md` de features em caso de conflito. Todo
princípio aqui rastreia para uma decisão D ou emenda ratificada; nenhum princípio
genérico é admitido.

**Emendas.** Uma emenda exige: (1) uma mudança correspondente em `docs/CONTEXT.md`
quando alterar produto, ou a ratificação de uma emenda proposta de
`docs/DESIGN-DECISIONS.md` §9; (2) atualização desta constitution via
`/speckit.constitution` na Sessão A; (3) incremento de versão semântica e registro
no Sync Impact Report.

**Versionamento.** MAJOR: remoção/redefinição incompatível de princípio ou
governança. MINOR: novo princípio/seção ou expansão material de guia. PATCH:
clarificação, redação, correção não-semântica.

**Conformidade.** `/speckit.plan` e `/speckit.analyze` verificam que spec e plan
não violam estes princípios; divergência apontada deve ser resolvida **antes** do
`HANDOFF.md`. Na Sessão B, a fatiação e os planos respeitam estes invariantes —
em especial o Princípio V (triagem não refragmentada). Complexidade que aparente
contrariar um princípio deve ser justificada ou eliminada.

**Version**: 1.0.0 | **Ratified**: 2026-05-29 | **Last Amended**: 2026-05-29
