# CONTEXT — Aplicação de Revisão Sistemática de Literatura

> Artefato canônico produzido na **Sessão A (grill-me + spec-kit)**.
> Fonte de verdade para as Sessões B (GSD) e C (Superpowers).
> Não reabrir as decisões aqui assinadas sem registrar o motivo.

## Timestamp
- Discovery concluída: 2026-05-22

---

## 1. Visão do produto

Aplicação web **multiusuário** para conduzir **revisões sistemáticas de
literatura** ponta a ponta, seguindo as dez fases canônicas, com forte
automação por **IA (LLM) sob princípio "humano-no-laço"**.

- **Domínio primário:** Ciências Sociais / Humanas / Educação
  (influência **Campbell Collaboration**).
- **Núcleo agnóstico/configurável:** projetado para estender a outras áreas
  **não-saúde** sem reescrever o núcleo (normas, instrumentos e bases são
  "perfis"/"plugins").
- **Fora de escopo permanente da v1:** revisões de saúde/biologia/veterinária
  e suas normas (RoB 2, ROBINS-I, PROSPERO etc.).
- **Usuário-alvo:** pesquisador **solo** na v1; colaboração multi-revisor
  **modelada no schema** desde já, mas não operacional na v1.

---

## 2. Glossário

- **Revisão:** agregado-raiz do domínio. Um projeto de revisão sistemática.
  Tudo (busca, registros, triagem, extração, síntese…) pertence a uma Revisão.
  Um usuário pode ter várias.
- **Registro (record):** referência bibliográfica importada (de RIS/BibTeX/CSV).
- **Estudo:** registro que passou na triagem e é objeto de extração/avaliação.
- **Membro:** associação `usuário ↔ Revisão ↔ papel`. Papéis:
  **Owner / Reviewer / Viewer**.
- **Perfil metodológico:** conjunto plugável de checklists/instrumentos/normas
  (Campbell na v1; espaço para Kitchenham, JBI etc.).
- **Instrumento/Form configurável:** abstração única que serve tanto à
  **avaliação de risco de viés** quanto à **extração de dados** e ao **CERQual**
  (= conjunto de domínios/itens tipados com escala + justificativa).
- **Sugestão de IA:** saída de um agente LLM, sempre com **proveniência** e
  **estado** (pendente / aceita / editada / rejeitada).
- **Grounding (aterramento):** toda saída factual da IA referencia um trecho do
  PDF-fonte (span/página). "Não encontrado" é resposta de primeira classe.
- **Trilha de auditoria:** histórico append-only de toda ação que muda o estado
  da Revisão (ator humano|IA, timestamp, antes/depois).

---

## 3. Decisões assinadas (Discovery)

| # | Decisão | Status |
|---|---------|--------|
| D1 | Domínio primário = Ciências Sociais/Humanas/Educação; núcleo agnóstico/extensível a outras áreas não-saúde. | Assinada |
| D2 | Produto = web app **multiusuário**, rodável local, com caminho para deploy em nuvem. Todo dado escopado por usuário/Revisão com **RLS desde a 1ª migration**. | Assinada |
| D3 | **Stack default herdada** (ratificável no `/plan`, NÃO cravada na Discovery): Next.js + Supabase (Postgres + RLS + migrations versionadas) + Tailwind + React Hook Form/Zod. Código em inglês, UI em pt-BR. | Default |
| D4 | Esqueleto metodológico **orientado a norma (Opção A)**: **PRISMA 2020** como espinha de relato; **fluxograma PRISMA é entregável obrigatório**. Perfil Campbell plugável. | Assinada |
| D5 | Fase de busca = **(A) registro de estratégia + importação manual** (RIS/BibTeX/CSV). Integração via API (OpenAlex/Crossref/ERIC) = **futuro plugável** atrás de interface de "fonte". | Assinada |
| D6 | Deduplicação **(B)**: remoção automática de exatas (DOI; senão título normalizado+ano) com **log auditável e reversível**; **fila de confirmação humana** para pares fuzzy. | Assinada |
| D7 | Triagem em duas etapas (título/resumo → texto completo). **Modelada para N revisores + cegamento + kappa**, mas **operando solo na v1**. Conflitos/kappa só com ≥2 revisores. **Motivo de exclusão obrigatório só no texto completo** (lista configurável por projeto). | Assinada |
| D8 | Avaliação de risco de viés = **templates de instrumento configuráveis**; **MMAT** como seed default; **julgamento único por padrão**, dupla avaliação configurável; suporte a **grade ad-hoc justificada no protocolo**. | Assinada |
| D9 | Extração de dados = **formulário construído pelo usuário** (mesma engine de "form configurável" do risco de viés). Modelada para N revisores (dupla extração opcional), solo na v1. | Assinada |
| D10 | **PDFs ficam no app** (Supabase Storage) + **pipeline de extração de texto** (PDF→texto; visão p/ escaneados). Sem OCR avançado/visualizador lado-a-lado na v1 (possível v1.1). | Assinada |
| D11 | **Princípio AI-first com humano-no-laço:** entrada de dados por agente LLM sempre que possível; ação humana = validar/corrigir; entrada manual só onde julgamento é insubstituível. | Assinada |
| D12 | **Gradiente de autonomia da IA:** IA **autônoma só em extração factual**; em **todo julgamento** (triagem, risco de viés, síntese, certeza, redação) a IA **sugere e o humano ratifica**. | Assinada |
| D13 | **Proveniência obrigatória** em cada sugestão de IA: modelo, versão, prompt/trecho-fonte, timestamp, estado (pendente/aceita/editada/rejeitada). **Relatório final declara automaticamente onde a IA foi usada.** | Assinada |
| D14 | **Provedor LLM:** **BYOK** (chave do usuário, cifrada); **Claude (Anthropic) default** atrás de abstração `LLMProvider` trocável. | Assinada |
| D15 | Fase 1 = **frameworks de pergunta selecionáveis** (SPIDER/PICo/PEO/PCC + livre); **SPIDER default**; derivação **assistida por IA** de critérios de elegibilidade e termos de busca (humano ratifica). | Assinada |
| D16 | Fase 2 = protocolo **PRISMA-P**, **exportável** (submissão manual ao OSF/Campbell; sem API na v1); **travamento ao iniciar a triagem**; mudanças pós-travamento viram **emendas versionadas e datadas**. IA rascunha, humano edita. | Assinada |
| D17 | Fase 8 = **síntese qualitativa/narrativa + tabelas-resumo** (agrupamento temático e rascunho assistido por IA). **Meta-análise quantitativa = módulo futuro** (caminho: exportar p/ R/`metafor`). | Assinada |
| D18 | Fase 9 = **GRADE-CERQual** default, como **template configurável**, IA sugere/humano ratifica. **Fase opcional**, habilitável por projeto. | Assinada |
| D19 | **Pipeline de fases configurável:** núcleo fixo (Pergunta → Protocolo → Busca/Registro → Dedup → Triagem → Extração → Síntese → Redação); **opcionais ligáveis por projeto: Risco de Viés e Certeza**. Relatório/fluxograma se adaptam e declaram explicitamente o que não foi feito. | Assinada |
| D20 | Fase 10 = entregáveis: fluxograma PRISMA (SVG/PNG), checklist PRISMA auto-preenchido, tabela de características, figura de risco de viés (se ativa), **rascunho de relatório** com **desvios do protocolo** e **declaração de IA** auto-gerados, referências (BibTeX/RIS). Formatos: **DOCX + PDF + Markdown**. Citação: **APA 7** plugável (CSL). | Assinada |
| D21 | **Modelo multiusuário:** raiz = Revisão; membros com papéis **Owner/Reviewer/Viewer** modelados desde já (RLS por essa associação). v1: criador = Owner+Reviewer único, sem convites. Owner resolve conflitos (sem "Arbiter" dedicado agora). | Assinada |
| D22 | **Contrato anti-alucinação:** grounding obrigatório para fatos; **"não encontrado" como resposta válida**; sem preenchimento por inferência sem âncora. Campos **inferidos** (ex.: classificar desenho do estudo) são permitidos mas marcados com **estado de proveniência "inferido" (≠ ancorado)** e exigem ratificação humana. | Assinada |
| D23 | **Contabilidade de custo (BYOK):** painel de consumo de tokens por Revisão/fase + **estimativa pré-execução** para lotes. | Assinada |
| D24 | **Idioma:** conteúdo **multilíngue de entrada** (PT/EN/ES…); **saídas da IA em pt-BR**; **trecho-fonte sempre citado no original**; **idioma como critério de elegibilidade configurável** (vira motivo de exclusão). | Assinada |
| D25 | **Operações de IA em lote = jobs assíncronos**, com progresso visível, retomáveis e resilientes a falha por-item. Mecanismo concreto = decisão do `/plan`. | Assinada |
| D26 | **Auditoria/reprodutibilidade = requisito de domínio de primeira classe** (não log de debug): append-only, ator/timestamp/diff, **histórico exportável** como material suplementar. | Assinada |
| D27 | **RAG / busca semântica nos PDFs ingeridos = NA v1.** Retorna trechos mais similares a uma query, **escopada por Revisão** (RLS), ancorada (página/posição). | Assinada |
| D28 | **Embeddings:** default = **Voyage AI hospedado (2ª chave BYOK)**; abstração `EmbeddingProvider` deixa **modelo local in-process (transformers.js / bge-m3 / multilingual-e5) plugável**. **pgvector** + chunking ancorado; schema acomoda **dimensão variável** do vetor. | Assinada |
| D29 | Entregável "redação": **rascunho estruturado completo** — Métodos/Resultados **fiéis aos dados** (auto-gerados), Discussão/Conclusão como **ponto de partida editável**. Não é manuscrito final automático. | Assinada |
| D30 | **Nome do produto = "Cognilit".** Identidade adotada para o app de revisão sistemática descrito neste documento. Aplica-se a título de artefatos, UI e documentação. | Assinada |
| D31 | **Pipeline de texto de PDF é assíncrono e híbrido.** O parsing roda como job assíncrono (D25), nunca dentro de uma Edge Function de request síncrono — a Edge Function apenas valida, persiste no Storage e enfileira. Estratégia por tipo de documento: PDF com camada de texto → extração determinística; PDF escaneado → LLM multimodal como OCR. Toda camada de texto carrega origem de proveniência (`nativo` \| `ocr_ia`); o `source_span` de grounding referencia a camada efetivamente usada e a trilha registra qual foi. Mecanismo concreto do worker e biblioteca de extração = decisão do `/plan`, validada contra PDFs reais do corpus-alvo. **Revisa D10:** OCR de escaneados deixa de ser "possível v1.1" e entra na v1 via LLM multimodal. | Assinada |

---

## 4. Gradiente de autonomia da IA (referência rápida — D11/D12/D13/D22)

| Fase | Papel da IA | Decisão final |
|------|-------------|---------------|
| Extração de dados | Extrai automaticamente do PDF (factual, ancorado) | Humano valida/edita |
| Risco de viés | Sugere rating + justificativa citando trechos | Humano confirma |
| Triagem (título/resumo) | Pré-classifica incluir/excluir + razão (nunca exclui sozinha) | Humano decide |
| Triagem (texto completo) | Sugere + motivo de exclusão | Humano decide |
| Síntese | Rascunha temas/narrativa a partir dos dados | Humano edita |
| Redação | Rascunha seções do relatório | Humano edita |
| Certeza (CERQual) | Sugere nível + fundamentação | Humano confirma |
| Dedup fuzzy | Pode pontuar; regra (D6) decide | Humano confirma |

---

## 5. Marcos de construção (walking skeleton — D-marcos)

Estratégia: **fatia vertical fina ponta-a-ponta**, depois aprofundar.

1. **Marco 1 — núcleo do fluxo:** Revisão + auth/RLS → Pergunta (SPIDER) →
   Protocolo (travamento) → Importação + registro de busca → Dedup (B) →
   Triagem (solo).
2. **Marco 2 — coração AI-first:** ingestão de PDF + extração por IA com
   grounding e proveniência + validação humana. (RAG/busca semântica entra
   aqui ou logo após, reaproveitando o pipeline de texto.)
3. **Marco 3 — saída:** síntese qualitativa assistida → relatório/fluxograma
   PRISMA + exportações (DOCX/PDF/MD).
4. **Opcionais depois:** Risco de Viés e Certeza (CERQual) plugados quando o
   núcleo estiver firme.

---

## 6. Não-objetivos da v1 (conscientes e adiáveis)

1. Áreas de saúde/bio/vet e suas normas (RoB 2, ROBINS-I, PROSPERO).
2. Meta-análise quantitativa (forest plot, I²) — futuro.
3. Integração via API com bases (OpenAlex/Crossref/ERIC) — futuro plugável.
4. Colaboração ativa (convites, multi-revisor operando, kappa, fila de
   conflitos) — **modelada no schema**, não operacional na v1.
5. GRADE quantitativo — futuro (v1 tem CERQual opcional).
6. Visualizador PDF lado-a-lado — possível v1.1. (OCR de escaneados
   **deixou de ser não-objetivo**: ver D31 — entra na v1 via LLM multimodal.)
7. LaTeX e estilos CSL além de APA 7 — futuro.
8. Deploy em nuvem gerenciado — arquitetura permite, foco v1 é local.
9. App instalável (Tauri/desktop) — caminho descartado (é web).
10. **Grafos de palavras e nuvens de palavras** — retirados do escopo,
    a repensar depois.

---

## 7. Casos de uso (alto nível)

- **UC1 — Iniciar revisão:** usuário cria Revisão, escolhe framework (SPIDER),
  formula a pergunta; IA sugere critérios de elegibilidade e termos de busca;
  humano ratifica.
- **UC2 — Definir e travar protocolo:** IA rascunha protocolo PRISMA-P;
  humano edita; ao iniciar a triagem, protocolo é congelado; mudanças viram
  emendas versionadas.
- **UC3 — Registrar busca e importar:** usuário registra string/base/data/hits;
  importa RIS/BibTeX/CSV; sistema deduplica (exatas auto + fila fuzzy).
- **UC4 — Triagem solo:** triagem rápida título/resumo (incluir/excluir/dúvida,
  atalhos); IA pré-classifica; humano decide. Texto completo com motivo de
  exclusão obrigatório.
- **UC5 — Ingestão e extração AI-first:** usuário anexa PDFs; agente extrai
  campos do formulário configurável com grounding; humano valida.
- **UC6 — Busca semântica (RAG):** usuário consulta o corpus da Revisão; sistema
  retorna trechos mais similares, ancorados ao PDF/estudo.
- **UC7 — Risco de viés (opcional):** instrumento MMAT/ad-hoc; IA sugere;
  humano confirma; gera figura.
- **UC8 — Síntese qualitativa:** IA agrupa temas e rascunha narrativa a partir
  dos dados extraídos; humano edita; gera tabelas-resumo.
- **UC9 — Certeza (opcional, CERQual):** IA sugere nível por achado; humano
  confirma.
- **UC10 — Redação e exportação:** sistema monta rascunho estruturado completo
  (Métodos/Resultados fiéis, Discussão editável) + fluxograma PRISMA + checklist
  + declaração de IA + desvios; exporta DOCX/PDF/MD; referências APA 7.

---

## 8. Funcionalidades futuras (parkeadas, não esquecidas)

- Integração via API com bases bibliográficas.
- Colaboração multi-revisor ativa (convites, kappa, arbitragem).
- Meta-análise quantitativa + GRADE.
- Embeddings locais como default (transformers.js).
- Grafos de co-ocorrência e nuvens de palavras.
- Visualizador PDF lado-a-lado.
- LaTeX e múltiplos estilos CSL.
- Outros perfis metodológicos (Kitchenham/SE, JBI, scoping reviews).