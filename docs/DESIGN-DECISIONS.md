# DESIGN-DECISIONS — Cognilit (frontend-first)

> Artefato de design **pré-spec**. Destila o melhor das ferramentas de RSL de
> mercado e o traduz em decisões coerentes de UX, frontend e (onde necessário)
> backend/infra, usando `docs/CONTEXT.md` (D1–D31) e `CLAUDE.md` como linha de
> base.
>
> **O que este documento é:** insumo da Sessão A (spec-kit) — alimenta
> `constitution.md` → `spec.md` → `plan.md`. Corrige de antemão os erros de UX do
> build anterior (sobretudo a triagem fragmentada).
>
> **O que este documento NÃO é:** não é spec, não é plano de implementação, não
> substitui o spec-kit, e **não** altera `CONTEXT.md`, `CLAUDE.md` ou
> `PROTOCOLS.md`. Ajustes recomendados ao CONTEXT.md aparecem **apenas** como
> *emendas propostas* na §9, para ratificação via Sessão A.
>
> **Autoridade:** subordinado ao `CONTEXT.md`. Hierarquia em caso de conflito:
> `CONTEXT.md` > `constitution.md` > `CLAUDE.md` > `plan.md` > este documento.
> Onde algo aqui parecer contrariar o CONTEXT.md, o CONTEXT.md vence e o item
> migra para a §9 como proposta.

- **Data:** 2026-05-29
- **Feature ativa de referência:** `001-marco1-nucleo-fluxo`
- **Idioma:** decisões em pt-BR; identificadores/código em inglês (convenção do
  `CLAUDE.md`).

---

## Sumário

1. [Preâmbulo & autoridade](#1-preâmbulo--autoridade)
2. [Princípios de design transversais](#2-princípios-de-design-transversais)
3. [Arquitetura de informação & app shell](#3-arquitetura-de-informação--app-shell)
4. [A correção central — Workbench unificado de triagem](#4-a-correção-central--workbench-unificado-de-triagem)
5. [Padrões de UX da IA-no-laço](#5-padrões-de-ux-da-ia-no-laço)
6. [DNA de design por fase](#6-dna-de-design-por-fase)
7. [Decisões técnicas de frontend](#7-decisões-técnicas-de-frontend)
8. [Touchpoints de backend/infra](#8-touchpoints-de-backendinfra)
9. [Emendas propostas ao CONTEXT.md / CLAUDE.md](#9-emendas-propostas-ao-contextmd--claudemd)
10. [Como alimenta o spec-kit (e o papel das skills)](#10-como-alimenta-o-spec-kit-e-o-papel-das-skills)
11. [Apêndice — Scan de mercado](#11-apêndice--scan-de-mercado)

---

## 1. Preâmbulo & autoridade

### Por que este documento existe

O build anterior do Cognilit foi abandonado porque a IA tomou decisões de produto
e de tela insatisfatórias. O caso emblemático: **a triagem de artigos importados
foi fragmentada em várias telas** (uma para importar, outra para deduplicar, outra
para triar). O revisor real não pensa assim — ele quer **uma bancada única** onde
importa, vê duplicatas, decide inclusão/exclusão e avança para texto completo sem
trocar de contexto. É o modelo do **Parsifal** e o que **Rayyan/Covidence** fazem
de melhor na prática.

Este documento fixa essas decisões de UX **antes** do spec-kit, para que a Sessão
A as transforme em invariantes (constitution) e user stories (spec), e a Sessão B
as execute sem reinventar — nem refragmentar.

### Rastreabilidade

Toda decisão de design aqui ou (a) deriva de uma decisão D assinada no CONTEXT.md
— citada como `(D7)` etc. —, ou (b) é uma recomendação nova que **não consta** do
CONTEXT.md e portanto aparece como **emenda proposta** na §9. Nada neste documento
"cria fato" sobre produto sem passar pela §9.

---

## 2. Princípios de design transversais

Seis princípios que governam **todas** as telas. Derivam diretamente das decisões
de Discovery e são o "tom" do produto.

### P1 — Human-in-the-loop é visível, não implícito (D11, D12)
A IA **sugere**; o humano **ratifica**. Toda saída de IA carrega um **estado
explícito** na UI: `pendente` · `aceita` · `editada` · `rejeitada` · `inferida`.
A IA nunca muda o estado de uma Revisão sozinha — exceto extração factual ancorada
(D12), e mesmo essa fica "pendente de validação" por padrão. Visualmente: sugestão
da IA tem tratamento distinto de dado confirmado pelo humano (cor/ícone/borda),
nunca se confundem.

### P2 — Grounding é cidadão de primeira classe (D22, D31)
Todo fato afirmado pela IA referencia um **trecho-fonte** (span + página). A UI
expõe esse vínculo de forma clicável (abre o trecho original). **"Não encontrado"
é um estado de primeira classe** — renderizado como resposta legítima, nunca como
erro ou campo vazio ambíguo. Campos *inferidos* (ex.: classificar desenho do
estudo) recebem badge **"inferido ≠ ancorado"** (D22) e exigem ratificação.

### P3 — Densidade de dados + teclado primeiro
RSL é trabalho de **varredura em massa** (centenas a milhares de registros). As
telas de fila (dedup, triagem) são **densas, orientadas a teclado**, como
Rayyan e Covidence — não cards espaçados de dashboard. Atalhos para todas as ações
de decisão; o mouse é opcional na triagem. Densidade configurável (compacto/
confortável).

### P4 — Auditabilidade aparente (D26)
A trilha append-only (ator humano|IA, timestamp, antes/depois) **não é log de
debug** — é requisito de domínio. A UI expõe histórico por registro/Revisão e o
torna **exportável** como material suplementar. Toda ação que muda estado é
audível e reversível onde a decisão (D6) o exige.

### P5 — Custo BYOK é transparente (D23)
Operações de IA em lote mostram **estimativa de custo/tokens antes de executar** e
**consumo acumulado por Revisão/fase**. O usuário nunca é surpreendido por gasto
da própria chave. Medidor de custo visível no shell.

### P6 — pt-BR na UI, original no trecho-fonte (D24)
Toda a interface e as **saídas geradas pela IA** são pt-BR. O **trecho-fonte
citado é sempre exibido no idioma original** do documento. Idioma é critério de
elegibilidade configurável (vira motivo de exclusão).

---

## 3. Arquitetura de informação & app shell

### O "Workspace da Revisão"

A unidade de trabalho é a **Revisão** (agregado-raiz, CONTEXT §2). Tudo acontece
*dentro* de uma Revisão. O shell persistente dá contexto contínuo: em que Revisão
estou, em que fase, quanto progrediu o PRISMA, que jobs rodam, quanto custou.

A navegação é por **fase do pipeline** (D19), não por "telas soltas". O pipeline é
**configurável**: núcleo fixo (Pergunta → Protocolo → Busca/Registro → Dedup →
Triagem → Extração → Síntese → Redação) + opcionais ligáveis (Risco de Viés,
Certeza/CERQual). Fases desligadas somem do trilho e o relatório declara que não
foram feitas.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Cognilit   [▸ Revisão: "Inclusão digital no EM" ▾]      ⚙  ◔ Custo: 1.2M tok │
├──────────────┬────────────────────────────────────────────────────────────┤
│ FASES        │                                                              │
│ ● Pergunta   │     (área de conteúdo da fase ativa)                         │
│ ● Protocolo🔒│                                                              │
│ ● Busca      │                                                              │
│ ◐ Triagem    │                                                              │
│ ○ Extração   │                                                              │
│ ○ Síntese    │                                                              │
│ ○ Redação    │                                                              │
│ ┄┄┄┄┄┄┄┄┄┄┄┄ │                                                              │
│ ⊙ Viés (off) │                                                              │
│ ⊙ Certeza off│                                                              │
├──────────────┴────────────────────────────────────────────────────────────┤
│ PRISMA: 412 ident · 88 dups · 324 triados · 41 incluídos    │ ⏳ 2 jobs ▸  │
└───────────────────────────────────────────────────────────────────────────┘
```

Elementos do shell:
- **Seletor de Revisão** (topo-esquerda): troca de Revisão sem sair do app.
- **Trilho de fases** (esquerda): estado por fase (`●` feita · `◐` em curso ·
  `○` pendente · `🔒` travada · `⊙ off` opcional desligada). Reflete D19.
- **Barra PRISMA viva** (rodapé): contadores que alimentam o fluxograma final —
  sempre visíveis, sempre reais. O fluxograma PRISMA não é gerado "no fim"; ele é
  o **espelho** desta contagem (D4, D20).
- **Painel de jobs** (rodapé-direita): progresso de operações assíncronas (D25/
  D31) — abrível, com falha por-item visível.
- **Medidor de custo** (topo-direita): consumo BYOK (D23).

---

## 4. A correção central — Workbench unificado de triagem

> Esta é a maior decisão de UX do produto e a correção direta do erro do build
> anterior. **Importar, deduplicar e triar acontecem numa única superfície**, com
> troca de *modo* — não em telas separadas.

### Princípio

O revisor opera sobre **um corpus de registros** que progride por estados. As
"fases" Dedup (D6) e Triagem (D7) do CONTEXT.md são **capacidades** sobre esse
mesmo corpus, não destinos de navegação distintos. A UI deve refletir o **objeto**
(o corpus) e oferecer **modos de trabalho** sobre ele.

Inspirações (ver §11): **Parsifal** (fluxo unificado e enxuto) · **Rayyan**
(triagem por teclado, sugestão de IA, realce de termos de inclusão/exclusão) ·
**Covidence** (fila de dedup com decisão lado a lado; pipeline visível) ·
**ASReview** (priorização por *active learning* como ordenação **opcional** da
fila — "ver os mais prováveis primeiro").

### Anatomia: mestre-detalhe com barra de modos

```
┌── Triagem ───────────────────────────────────────────────────────────────────┐
│ [ Importar ]  [ Duplicatas (12) ]  [ Título/Resumo ]  [ Texto completo ]  ⌕    │ ← modos
├───────────────────────────────────────┬────────────────────────────────────────┤
│ FILA (324)        ordenar: IA ▾  ⚙     │  DETALHE                                │
│ ┌───────────────────────────────────┐ │  Smith et al. (2021)                    │
│ │▎● Smith 2021  Digital inclusion…  │ │  "Digital inclusion in secondary…"      │
│ │  ○ Souza 2020 Inclusão digital…   │ │  Periódico · 2021 · DOI:10.x/y          │
│ │  ◐ Lee 2019   A framework for…    │ │ ┌────────────────────────────────────┐  │
│ │  ✓ Costa 2022 Letramento digi…    │ │ │ 🤖 Sugestão IA: INCLUIR  (0.86)     │  │
│ │  ✕ Diaz 2018  Unrelated topic…    │ │ │ Razão: trata de EM + inclusão digi… │  │
│ │  …                                │ │ │ trecho: "…secondary education…" p.2 │  │
│ └───────────────────────────────────┘ │ │ [✓ Aceitar] [✎ Editar] [✕ Rejeitar] │  │
│ filtros: estado ▾  fonte ▾  termo ⌕   │ └────────────────────────────────────┘  │
│ seleção: 3 ▸ [ações em lote ▾]        │  Decisão: ( ) Incluir (•) Excluir (×)Dúv │
├───────────────────────────────────────┴────────────────────────────────────────┤
│ ⌨  i incluir · e excluir · d dúvida · j/k navegar · a aceitar IA · u desfazer   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Esquerda (mestre):** fila virtualizada (TanStack Table) com estado por linha,
  ordenação (incl. por score de IA — ASReview-like, **opcional**), filtros por
  estado/fonte/termo, seleção múltipla → **ações em lote**.
- **Direita (detalhe):** metadados do registro + **sugestão da IA com proveniência
  e grounding** (P1/P2) + controle de **decisão humana**. A IA **nunca** decide
  sozinha na triagem (D12, tabela §4 do CONTEXT).
- **Rodapé:** legenda de **atalhos** (P3). Decisão é uma tecla.

### Modo "Importar"
Upload/colagem de **RIS / BibTeX / CSV** (D5) com pré-visualização do parse,
mapeamento de campos, e **registro da estratégia de busca** (string, base, data,
nº de hits) lado a lado — porque importação e registro de busca são o mesmo ato
mental. Parsing pesado roda como **job assíncrono** (D31), não trava a tela.

### Modo "Duplicatas" (D6)
Exatas (DOI; senão título normalizado + ano) já removidas **automaticamente** com
**log reversível**; este modo é a **fila de confirmação humana dos pares fuzzy**.
Decisão lado a lado (Covidence-like):

```
┌── Duplicatas · par 3 de 12 ──────────────────────────────────────────────┐
│ A  Smith, J. (2021) Digital inclusion in…   RIS · Scopus   DOI:10.x/y     │
│ B  Smith J (2021) Digital Inclusion in …    CSV · WoS      DOI:10.x/y     │
│    similaridade 0.94  · mesmo DOI                                          │
│    [ São a mesma (mesclar →A) ]  [ São distintas ]  [ pular ]   u desfazer │
└────────────────────────────────────────────────────────────────────────────┘
```
Toda mesclagem é **auditável e reversível** (D6, P4).

### Modo "Título/Resumo" (D7)
Triagem rápida (incluir/excluir/dúvida), teclado-first, IA **pré-classifica** com
razão (nunca exclui sozinha). **Sem** motivo de exclusão obrigatório nesta etapa
(D7).

### Modo "Texto completo" (D7)
Triagem de texto completo com **motivo de exclusão obrigatório** (lista
configurável por projeto — D7). O motivo escolhido **alimenta o fluxograma PRISMA**
(contagem de exclusões por razão).

```
┌── Texto completo · Lee 2019 ─────────────────────────────────────────────┐
│ Decisão: ( ) Incluir  (•) Excluir                                         │
│ Motivo (obrigatório p/ excluir):  [ População fora do escopo        ▾ ]   │
│   ▸ Idioma não elegível · Desenho inadequado · Sem texto completo · …      │
│ 🤖 IA sugere excluir — motivo: "amostra de ensino superior, não EM" p.4   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Modelado para N revisores, operando solo na v1 (D7, D21)
Cegamento, kappa e fila de conflitos estão **no schema** desde já, mas **não
operacionais na v1**. A UI **não** exibe afordâncias de conflito/kappa enquanto há
um único revisor — mas os componentes são desenhados para acomodá-las sem
reescrita (ex.: a coluna "decisão" comporta múltiplos julgamentos depois).

---

## 5. Padrões de UX da IA-no-laço

Um **vocabulário visual único** para IA, reutilizado em **todas** as fases
(triagem, extração, viés, síntese, CERQual, redação). Construí-lo uma vez e reusar
é o que dá coerência ao produto e satisfaz D11–D13/D22.

| Componente | O que faz | Decisão |
|---|---|---|
| **Suggestion chip** | Mostra a recomendação da IA (ex.: INCLUIR · 0.86) + razão curta. Tratamento visual distinto de dado humano. | D11/D12 |
| **Accept / Edit / Reject** | Trio de ação fixo em toda sugestão. "Editar" preserva o original + registra diff. | D12/D26 |
| **Provenance popover** | Modelo, versão, prompt/trecho-fonte, timestamp, estado. Abre a partir de qualquer saída de IA. | D13 |
| **Grounding highlight** | Abre o trecho-fonte (span/página) no original; mostra origem da camada de texto (`nativo` \| `ocr_ia`). | D22/D31 |
| **"Não encontrado"** | Estado de primeira classe, renderizado explicitamente. | D22 |
| **Badge "inferido"** | Marca campos inferidos (≠ ancorados); força ratificação. | D22 |
| **Custo pré-lote** | Antes de rodar IA em lote: estimativa de tokens/custo + confirmação. | D23/D25 |
| **Declaração de IA** | Agregador que o relatório final lê: onde a IA foi usada, com que estado. | D13/D20 |

> Implementação como **biblioteca de componentes** (`ai/` no design system), não
> como código repetido por fase. Ver §7.

---

## 6. DNA de design por fase

Profundidade maior nas fases do **Marco 1** (Pergunta → Protocolo → Busca → Dedup
→ Triagem); fases posteriores entram com DNA + referências (aprofundadas nos
respectivos marcos/sessões A futuras).

### 6.1 Pergunta / Framework — Marco 1 (D15)
- **Seletor de framework** (SPIDER default; PICo/PEO/PCC + livre). A UI adapta os
  campos ao framework escolhido.
- **Derivação assistida por IA** de critérios de elegibilidade e termos de busca;
  humano ratifica (padrão §5).
- Roubar de: **Covidence/JBI SUMARI** (estrutura guiada de pergunta).

### 6.2 Protocolo / PRISMA-P — Marco 1 (D16)
- IA **rascunha** o protocolo PRISMA-P; humano edita.
- **Travamento ao iniciar a triagem** (estado `🔒` no trilho); mudanças
  pós-travamento viram **emendas versionadas e datadas** (P4).
- **Exportável** (submissão manual a OSF/Campbell; sem API na v1).
- Roubar de: **Covidence** (protocolo como gate do fluxo).

### 6.3 Busca / Registro — Marco 1 (D5)
- **Registro reprodutível** da busca: string, base, data, nº de hits — por base.
- Importação manual RIS/BibTeX/CSV (integração via API = futuro plugável atrás de
  interface "fonte").
- Integrado ao **modo Importar** do workbench (§4).
- Roubar de: **EndNote/Zotero/Rayyan** (import robusto e tolerante a formatos).

### 6.4 Dedup — Marco 1 (D6) → ver §4 (modo "Duplicatas").

### 6.5 Triagem — Marco 1 (D7) → ver §4 (modos T/R e Texto completo).

### 6.6 Extração de dados — Marco 2 (D9)
- **Form configurável construído pelo usuário** (mesma engine de "form
  configurável" do risco de viés — CONTEXT §2). IA extrai campos **com grounding**
  (P2); humano valida.
- Layout: documento/trecho à esquerda, campos do form à direita; cada campo com
  suggestion chip + provenance + grounding.
- Roubar de: **DistillerSR** (formulários de extração ricos) · **JBI SUMARI**.

### 6.7 Risco de viés — opcional (D8)
- **Templates de instrumento configuráveis**; **MMAT** como seed default;
  julgamento único por padrão, dupla avaliação configurável; grade ad-hoc
  justificada no protocolo. (Fora de escopo permanente: RoB 2/ROBINS-I — CONTEXT
  §1.)
- Gera **figura de risco de viés** (D20).
- Roubar de: **RevMan/Covidence** (matriz domínio × estudo).

### 6.8 Síntese qualitativa — Marco 3 (D17)
- **Agrupamento temático + tabelas-resumo**; IA rascunha narrativa a partir dos
  dados extraídos; humano edita. Meta-análise quantitativa = futuro (exportar p/
  R/`metafor`).
- Roubar de: **EPPI-Reviewer** (síntese e agrupamento).

### 6.9 Certeza / CERQual — opcional (D18)
- **GRADE-CERQual** default, template configurável; IA sugere nível + fundamentação
  por achado; humano confirma. Habilitável por projeto.

### 6.10 Redação & Exportação — Marco 3 (D20, D29)
- **Rascunho estruturado completo**: Métodos/Resultados fiéis aos dados
  (auto-gerados), Discussão/Conclusão como ponto de partida editável (D29).
- Entregáveis: **fluxograma PRISMA (SVG/PNG)** — espelho da barra viva do shell
  (§3) —, checklist PRISMA auto-preenchido, tabela de características, figura de
  viés (se ativa), **declaração de IA** (§5) e **desvios do protocolo**
  auto-gerados, referências (BibTeX/RIS).
- Formatos: **DOCX + PDF + Markdown**. Citação: **APA 7** plugável (CSL).

### 6.11 Descoberta visual — **parkeada** (CONTEXT §6/§8)
**Litmaps · Connected Papers · Nested Knowledge** trazem grafos de citação e mapas
de literatura excelentes — mas grafos/nuvens de palavras e visualizador PDF
lado-a-lado estão **fora da v1** (CONTEXT §6 itens 6/10, §8). Registrados aqui só
como **inspiração futura**; nenhuma decisão v1 depende deles.

---

## 7. Decisões técnicas de frontend

Alinhadas ao stack do `CLAUDE.md` (Next.js 14+ App Router, React 18+, TS strict,
Tailwind 4, TanStack Table/Query, RHF+Zod, Supabase).

### 7.1 Fronteiras Server/Client (Next.js App Router)
- **Server Components por padrão**; `'use client'` **somente** nas superfícies
  interativas: workbench de triagem, forms configuráveis, popovers de IA.
- Carregamento de listas e metadados via Server Components / Server Actions onde
  couber; mutações de decisão via rota/action tipada.

### 7.2 Estado
- **TanStack Query** para dados de servidor (cache, invalidação, sincronização).
- **Estado de filtros/seleção/ordenação na URL** (search params) — deep-link e
  **reprodutibilidade** (uma fila triada é reabrível no mesmo estado; reforça P4).
- **TanStack Table** para as filas densas; **virtualização** para corpora grandes
  (milhares de registros sem perder fluidez de teclado).

### 7.3 Updates otimistas
- Triagem usa **updates otimistas com rollback** (latência percebida ~zero): a
  decisão por teclado aplica na hora; falha reverte e sinaliza. Essencial para o
  fluxo de varredura (P3).

### 7.4 Formulários
- **React Hook Form + Zod** para o **form configurável** (extração/viés) e todos os
  formulários. Schema Zod é a fonte de validação compartilhável com o backend.

### 7.5 Design system
- **Tailwind 4** com **tokens CSS** (cores do tema como variáveis), **dark mode via
  `class`**, **escala de densidade** (compacto/confortável).
- **Desktop-otimizado** para o trabalho de varredura (filas), **mobile-first** como
  baseline responsivo para telas de leitura/consulta. Sem CSS custom exceto
  animações específicas.
- **Biblioteca de componentes de IA** (`ai/`: suggestion chip, provenance popover,
  grounding highlight, accept/edit/reject) — §5 reusada em todas as fases.

### 7.6 Acessibilidade
- Navegação por **teclado completa** nas filas, **foco visível**, **ARIA** em
  listas/grids e nos popovers. Atalhos documentados na própria UI (rodapé do
  workbench).

### 7.7 Organização de código (convenções do CLAUDE.md)
- Lógica de negócio em **hooks `use*.ts`**; **um componente por arquivo**;
  **PascalCase**; sem `any` (`unknown` quando necessário); `interface` > `type`
  para objetos.

---

## 8. Touchpoints de backend/infra

Sem desenhar schema (isso é Sessão A `/plan` + `data-model.md`). Apenas o que o
**frontend exige** existir e como ele observa.

### 8.1 Jobs assíncronos (D25, D31)
- Trabalho pesado (parse de PDF, embeddings em lote, exportação) roda como **job
  assíncrono**: progresso visível, **retomável**, **resiliente a falha por-item**.
  A **Edge Function só valida/persiste/enfileira**; o worker processa.
- A UI **observa** o job (realtime ou polling — decisão concreta do `/plan`) e
  mostra progresso, itens com falha, e ação de **retomar**.
- Mecanismo concreto do worker e biblioteca de extração = **decisão do `/plan`**,
  validada contra PDFs reais do corpus-alvo (D31).

### 8.2 Proveniência & auditoria como dado lido pela UI (D13, D26)
- Cada sugestão de IA persiste modelo/versão/prompt-ou-trecho/timestamp/estado.
- Trilha **append-only** (ator, timestamp, antes/depois) é **exportável**. A UI a
  lê para os componentes de §5 e para a "Declaração de IA" do relatório.

### 8.3 BYOK — dois provedores independentes (D14, D28)
- **`LLMProvider`** (Claude default; geração) e **`EmbeddingProvider`** (Voyage AI
  default; busca semântica) — abstrações trocáveis, **duas chaves BYOK distintas**,
  cifradas em repouso. A UI tem onde: cadastrar chaves, escolher provedor/modelo,
  ver versão (para proveniência) e custo.
- Vetores em **pgvector**, **dimensão variável** (o provedor define), índice HNSW
  (D28). Busca semântica (RAG) escopada por Revisão (D27) — Marco 2.

### 8.4 RLS por Revisão (D2, D21)
- **RLS desde a 1ª migration**; todo dado escopado por usuário/Revisão. Modelo
  multiusuário (Owner/Reviewer/Viewer) **no schema** desde já; v1 = criador é
  Owner+Reviewer único, sem convites. Implicação de UI: queries sempre filtram por
  Revisão ativa; afordâncias de papel ficam latentes na v1.

---

## 9. Emendas propostas ao CONTEXT.md / CLAUDE.md

> **NÃO aplicadas.** Recomendações para o usuário ratificar via Sessão A
> (`/speckit.constitution` / `/speckit.specify`). Cada uma com: o que muda, por
> quê, decisão D afetada, impacto.

### EP-1 — Nova decisão **D32: Triagem unificada num único workbench** (UX invariante)
- **O que muda:** elevar a "bancada única de triagem" (§4) a **invariante de UX**:
  importação, deduplicação e triagem (T/R + texto completo) ocorrem numa só
  superfície, por modos, nunca em telas separadas.
- **Por quê:** corrige o erro central do build anterior; alinha ao mental model do
  revisor (Parsifal/Rayyan/Covidence).
- **Afeta:** complementa D6 e D7 (capacidades) com uma restrição de **forma de
  apresentação**; não as contradiz.
- **Impacto:** vira **princípio na `constitution.md`** e user story na `spec.md`;
  o `brainstorming` da Sessão B **não pode** fatiar de modo a refragmentar a
  triagem.

### EP-2 — **Barra PRISMA viva** como invariante
- **O que muda:** os contadores PRISMA são **estado vivo** no shell (§3), e o
  fluxograma final é o **espelho** desses contadores — não um artefato gerado do
  zero no fim.
- **Por quê:** garante consistência número-a-número entre o que o usuário vê e o
  entregável obrigatório (D4/D20); evita divergência (erro comum em ferramentas).
- **Afeta:** detalha D4/D20 (forma, não escopo).
- **Impacto:** requisito não-funcional na spec; toca data-model (contadores
  derivados de estados de registro).

### EP-3 — **Vocabulário visual único de IA** como invariante de consistência
- **O que muda:** os componentes de §5 (suggestion chip, provenance, grounding,
  accept/edit/reject, badge "inferido") são **um único sistema** reusado em todas
  as fases.
- **Por quê:** D11–D13/D22 exigem o *comportamento*; esta emenda fixa a
  *consistência de apresentação* para que cada fase não reinvente a roda.
- **Afeta:** detalha D11/D12/D13/D22.
- **Impacto:** princípio na constitution ("padrões de IA são compartilhados");
  decisão de stack na `plan.md` (biblioteca `ai/`).

### EP-4 — **Estado de UI reprodutível via URL** como reforço de auditabilidade
- **O que muda:** filtros/ordenação/seleção das filas vivem na URL (§7.2).
- **Por quê:** reforça D26 (reprodutibilidade) na própria navegação.
- **Afeta:** complementa D26.
- **Impacto:** decisão técnica na `plan.md`; baixo risco.

> Se o usuário **não** ratificar alguma EP, ela permanece como recomendação de UX
> sem força de invariante — mas a §4 (workbench unificado) é a que o usuário já
> sinalizou como prioritária e motiva todo este documento.

---

## 10. Como alimenta o spec-kit (e o papel das skills)

### Mapa para a Sessão A
| Seção deste doc | Vira… | Onde |
|---|---|---|
| §2 Princípios · §9 EP-1/EP-2/EP-3 | **Invariantes** (princípios) | `constitution.md` |
| §3 IA/shell · §4 workbench · §6 fases | **User stories** | `spec.md` (cobre UC1–UC10 do CONTEXT) |
| §7 técnico · §8 touchpoints · §9 EP-4 | **Decisões de stack/arquitetura** | `plan.md` (+ `data-model.md`) |

Sequência recomendada (dentro do fluxo Air-Gap, sem tocar o PROTOCOLS.md):
`/speckit.constitution` → `/speckit.specify` → `/speckit.clarify` →
`/speckit.plan` → `/speckit.analyze` → escrever `HANDOFF.md` → Sessão B.

### Papel das skills instaladas

| Skill | Útil? | Onde, e em que sessão |
|---|---|---|
| `frontend-design` | **Sim, central** | Telas de alta-fi e componentes (sobretudo o workbench). Sessão B (execução); já útil aqui para o vocabulário visual de §5. |
| `react-best-practices` | **Sim** | §7 — componentes, data fetching, performance de filas grandes (virtualização). Sessão A (`plan`) e Sessão B. |
| `nextjs-best-practices` | **Sim** | §7.1 — fronteiras RSC/Client, App Router, roteamento. Sessão A (`plan`) e Sessão B. |
| `senior-architect` | **Sim** | ADRs das decisões de alto nível e do regime de jobs assíncronos (§8); formaliza §9. Sessão A. |
| `database-designer` | **Depois** | Não nesta fase de UX; é Sessão A (`/plan`/`data-model`) — schema de proveniência, auditoria, pgvector. |
| `database-schema-designer` | **Depois** | Idem — ERD/normalização do schema multiusuário + RLS. Sessão A (`/plan`). |

**Conclusão:** para *este* artefato (frontend/UX), as skills relevantes são
**frontend-design, react-best-practices, nextjs-best-practices e
senior-architect**. As de **database** entram depois, na fase de `/plan` da Sessão
A, quando o schema (proveniência, auditoria, pgvector, RLS) for desenhado. Nenhuma
skill substitui o spec-kit — todas operam dentro do fluxo Air-Gap das duas sessões.

---

## 11. Apêndice — Scan de mercado

Por ferramenta: o que faz de melhor e o que o Cognilit **adota / adapta / rejeita**.

| Ferramenta | Força principal | Cognilit |
|---|---|---|
| **Parsifal** | Fluxo enxuto e **unificado** de condução da RSL; protocolo→busca→seleção coesos | **Adota** o modelo de bancada unificada (§4 / EP-1) |
| **Rayyan** | Triagem por **teclado**, sugestão de IA, **realce de termos** de inclusão/exclusão, colaboração cega | **Adota** triagem teclado-first + sugestão IA (§4/§5); cegamento **modelado** mas off na v1 (D7/D21) |
| **Covidence** | **Pipeline visível**, fila de **dedup lado a lado**, protocolo como gate, extração/viés integrados | **Adota** dedup lado a lado e pipeline visível (§3/§4) |
| **EPPI-Reviewer** | Síntese e **agrupamento temático**, mineração de texto | **Adapta** na síntese (§6.8) |
| **DistillerSR** | **Formulários de extração** ricos e configuráveis, automação | **Adapta** no form configurável (§6.6) |
| **ASReview** | **Active learning** — prioriza os registros mais prováveis | **Adapta** como **ordenação opcional** da fila (§4); não substitui a decisão humana (D12) |
| **JBI SUMARI** | Pergunta guiada, instrumentos metodológicos | **Adapta** no seletor de framework e instrumentos (§6.1/§6.7) |
| **RevMan** | Matriz e **figuras de risco de viés**, foco Cochrane | **Adapta** a matriz de viés (§6.7); normas de saúde (RoB 2/ROBINS-I) **rejeitadas** (fora de escopo, CONTEXT §1) |
| **Zotero / Mendeley / EndNote** | **Gestão de referências**, import robusto (RIS/BibTeX/CSV), de-dup | **Adota** import tolerante a formatos (§6.3); gestão completa de biblioteca **fora de escopo** (o Cognilit é condutor de RSL, não gerenciador de referências) |
| **Litmaps / Connected Papers / Nested Knowledge** | **Mapas/grafos** de literatura e citação, descoberta visual | **Rejeita na v1** (parkeado — CONTEXT §6/§8); inspiração futura (§6.11) |

---

### Próximo passo (fora deste documento)
Levar **§9** (emendas) e **§10** (mapa) para a Sessão A: `/speckit.constitution`
destila §2/§9 em invariantes; `/speckit.specify` converte §3–§6 em user stories;
`/speckit.plan` materializa §7/§8 em decisões de stack e `data-model.md`.
