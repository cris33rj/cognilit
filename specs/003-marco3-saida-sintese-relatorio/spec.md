# Feature Specification: Marco 3 — Saída (síntese qualitativa, relatório e fluxograma PRISMA, exportações)

**Feature Branch**: `003-marco3-saida-sintese-relatorio`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Marco 3 — Saída: síntese qualitativa assistida + relatório e fluxograma PRISMA + exportações. Derivado de docs/CONTEXT.md (D4, D17, D19, D20, D29) e dos marcos já entregues."

## Contexto do marco

Este é o **terceiro e último marco do walking skeleton da v1** (CONTEXT.md §5).
Os marcos anteriores já entregaram o caminho de entrada de dados:

- **Marco 1 — núcleo do fluxo:** Revisão + auth/RLS → Pergunta (SPIDER) →
  Protocolo (travamento/emendas) → Importação + registro de busca → Dedup →
  Triagem (solo).
- **Marco 2 — coração AI-first:** ingestão de PDF, extração por IA com
  grounding e proveniência, validação humana, e busca semântica (RAG).

O Marco 3 fecha o ciclo: transforma os **dados extraídos e validados** num
**produto entregável** — uma síntese narrativa, um relatório estruturado, o
fluxograma PRISMA obrigatório, e os artefatos exportáveis que o pesquisador
submete. Nada aqui re-elicita ou reconstrói o que os Marcos 1–2 entregaram;
este marco **consome** o corpus de estudos incluídos e seus dados de extração.

O princípio de autonomia da IA (D12) governa todo o marco: na **síntese** e na
**redação** a IA **sugere e o humano ratifica**; nenhuma seção é publicada sem
edição humana. Métodos e Resultados são **fiéis aos dados** (auto-gerados a
partir de fatos já ancorados no Marco 2); Discussão e Conclusão são **ponto de
partida editável** (D29).

## Clarifications

### Session 2026-06-12

- Q: Ao regenerar o relatório após edições humanas, o que acontece com as edições? → A: **Preservar por seção** — regenera apenas as seções não-editadas, preserva as editadas pelo humano e avisa quais foram mantidas (exige estado de edição por seção).
- Q: Como a síntese de uma Revisão é persistida ao longo de re-gerações? → A: **Única síntese mutável por Revisão** — re-gerar atualiza a existente preservando edições humanas; o histórico vive na trilha de auditoria (D26), sem versionamento de execuções.
- Q: A narrativa de cada tema da síntese ancora em quê? → A: **Em campos/valores extraídos específicos** (nível de achado), reusando os `{value, source_span, page}` produzidos no Marco 2 — grounding fino, não nível de estudo inteiro.
- Q: Como tratar as caixas PRISMA 2020 de registros de fontes fora da busca em base (literatura cinzenta, citation searching, contato com autores)? → A: **Fluxograma 100% auto-derivado** das contagens do sistema (todos os registros entram por importação com fonte registrada, D5); as caixas de fontes externas ficam em zero/ocultas na v1; fluxograma read-only, sem campos manuais.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Síntese qualitativa assistida por IA (Priority: P1)

O pesquisador, com a triagem e a extração de dados concluídas, pede ao sistema
uma **primeira leitura temática** do conjunto de estudos incluídos. A IA agrupa
os achados em **temas candidatos**, rascunha uma **narrativa** por tema a partir
dos dados extraídos, e monta **tabelas-resumo**. O pesquisador renomeia,
funde, divide e reordena temas; edita a narrativa; e ratifica o resultado. Cada
afirmação da IA carrega proveniência (de quais estudos/campos extraídos ela
deriva) e estado (pendente/aceita/editada/rejeitada).

**Why this priority**: A síntese é o insumo do relatório (US3) e a primeira
peça de valor do marco — entrega sentido sobre o corpus mesmo antes de existir
relatório final. É também onde a automação por IA gera mais economia de tempo
para o pesquisador. Sem ela, o Marco 3 não tem matéria-prima narrativa.

**Independent Test**: Com uma Revisão que tenha ≥3 estudos incluídos e dados de
extração validados, acionar "Gerar síntese" e verificar que o sistema produz
temas agrupados + narrativa rascunhada + tabela-resumo, todos editáveis e com
proveniência; salvar edições e confirmar persistência.

**Acceptance Scenarios**:

1. **Given** uma Revisão com estudos incluídos e dados de extração validados,
   **When** o pesquisador aciona a geração de síntese, **Then** o sistema
   apresenta um conjunto de temas candidatos com narrativa rascunhada e
   tabela-resumo por tema, cada item marcado como sugestão de IA pendente.
2. **Given** uma síntese rascunhada pela IA, **When** o pesquisador renomeia um
   tema, funde dois temas e edita a narrativa, **Then** o sistema persiste as
   edições e atualiza o estado de proveniência para "editada".
3. **Given** um tema sugerido que o pesquisador considera inválido, **When** ele
   o rejeita, **Then** o tema sai da síntese ativa mas permanece registrado na
   trilha de auditoria como sugestão rejeitada.
4. **Given** uma Revisão sem nenhum estudo incluído na triagem, **When** o
   pesquisador aciona a síntese, **Then** o sistema informa que não há dados
   suficientes e não gera temas vazios.
5. **Given** uma operação de síntese sobre muitos estudos, **When** ela é
   acionada, **Then** ela roda como job assíncrono com progresso visível,
   retomável e resiliente a falha por-item, e apresenta estimativa de custo
   antes de executar.

---

### User Story 2 - Fluxograma PRISMA 2020 com números reais (Priority: P1)

O pesquisador precisa do **fluxograma PRISMA 2020** — entregável obrigatório da
metodologia (D4). O sistema monta o diagrama automaticamente a partir dos
**números reais de cada fase** da Revisão: registros importados por fonte,
duplicados removidos, registros triados no título/resumo, excluídos com motivo,
avaliados em texto completo, excluídos com motivo, e estudos finalmente
incluídos. O pesquisador visualiza o diagrama e o exporta como imagem.

**Why this priority**: É o único entregável **obrigatório** por norma neste
marco e é independente da síntese — depende apenas das contagens de fase já
produzidas nos Marcos 1–2. Entrega valor sozinho (um pesquisador pode querer só
o fluxograma) e é o artefato de maior risco metodológico se os números não
baterem com o estado real da Revisão.

**Independent Test**: Com uma Revisão que passou por importação, dedup e
triagem, abrir o fluxograma PRISMA e verificar que cada caixa exibe a contagem
correta conforme a trilha de auditoria da Revisão; exportar como SVG e PNG e
confirmar que os arquivos refletem os mesmos números.

**Acceptance Scenarios**:

1. **Given** uma Revisão com importação, dedup e triagem registradas, **When** o
   pesquisador abre o fluxograma PRISMA, **Then** cada fase exibe a contagem
   real derivada da trilha de auditoria (importados, duplicados removidos,
   triados, excluídos por motivo, incluídos).
2. **Given** o fluxograma renderizado, **When** o pesquisador o exporta,
   **Then** o sistema gera arquivos SVG e PNG com os mesmos números exibidos.
3. **Given** uma Revisão cujos motivos de exclusão no texto completo foram
   registrados, **When** o fluxograma é gerado, **Then** os ramos de exclusão
   discriminam a contagem por motivo.
4. **Given** uma Revisão em que a triagem ainda não terminou, **When** o
   pesquisador abre o fluxograma, **Then** o sistema sinaliza que os números são
   parciais e identifica quais fases ainda não fecharam.

---

### User Story 3 - Relatório estruturado completo com declaração de IA e desvios (Priority: P2)

O pesquisador gera o **rascunho do relatório** da revisão. O sistema monta um
documento estruturado: **Métodos** e **Resultados** auto-gerados e **fiéis aos
dados** (pergunta, critérios, protocolo, contagens, síntese ratificada);
**Discussão** e **Conclusão** como **ponto de partida editável**. O relatório
inclui, gerados automaticamente: a **declaração de uso de IA** (onde a IA foi
usada, com proveniência) e os **desvios do protocolo** (emendas versionadas e
datadas desde o travamento). O relatório **declara explicitamente o que não foi
feito** quando fases opcionais (Risco de Viés, Certeza) estão desligadas.

**Why this priority**: É o entregável-síntese do marco, mas depende da síntese
(US1) e das contagens (US2). Entrega o valor central — um manuscrito-base — mas
só faz sentido após existir matéria-prima. A declaração de IA e os desvios são
requisitos de integridade metodológica (D13, D16) que não podem ser opcionais.

**Independent Test**: Com uma Revisão que tenha síntese ratificada e protocolo
com ao menos uma emenda, gerar o relatório e verificar que as seções
Métodos/Resultados refletem os dados reais, que a Discussão é editável, que a
declaração de IA lista as etapas onde houve sugestão de IA, e que os desvios
listam as emendas datadas.

**Acceptance Scenarios**:

1. **Given** uma Revisão com pergunta, protocolo, triagem e síntese ratificada,
   **When** o pesquisador gera o relatório, **Then** as seções Métodos e
   Resultados são preenchidas com os dados reais da Revisão e a Discussão/
   Conclusão aparecem como texto editável de partida.
2. **Given** sugestões de IA usadas em triagem, extração e síntese, **When** o
   relatório é gerado, **Then** a declaração de uso de IA enumera
   automaticamente cada etapa assistida por IA com sua proveniência.
3. **Given** um protocolo travado com emendas posteriores, **When** o relatório
   é gerado, **Then** a seção de desvios lista cada emenda versionada e datada.
4. **Given** uma Revisão com as fases opcionais Risco de Viés e Certeza
   desligadas, **When** o relatório é gerado, **Then** ele declara
   explicitamente que essas análises não foram conduzidas, em vez de omiti-las.
5. **Given** um relatório gerado, **When** o pesquisador edita a Discussão e
   salva, **Then** as edições persistem e uma nova geração não as sobrescreve
   silenciosamente (o sistema preserva ou avisa antes de regenerar).

---

### User Story 4 - Checklist PRISMA e tabela de características dos estudos (Priority: P2)

O pesquisador precisa dos artefatos de conformidade que acompanham o relatório:
um **checklist PRISMA 2020 auto-preenchido** (cada item marcado e referenciando
onde no relatório ele é atendido) e uma **tabela de características** dos estudos
incluídos (uma linha por estudo, colunas derivadas do formulário de extração).

**Why this priority**: São entregáveis de conformidade exigidos por D20,
independentes entre si e da redação livre. Agregam valor de auditoria e
submissão, mas são secundários ao relatório e ao fluxograma.

**Independent Test**: Com estudos incluídos e relatório gerado, abrir o
checklist PRISMA e a tabela de características e verificar que o checklist marca
os itens atendidos com referência à seção, e que a tabela tem uma linha por
estudo incluído com os campos de extração.

**Acceptance Scenarios**:

1. **Given** um relatório gerado, **When** o pesquisador abre o checklist
   PRISMA, **Then** cada item PRISMA aparece marcado como atendido/não-atendido
   com referência ao trecho do relatório que o cobre.
2. **Given** estudos incluídos com dados de extração, **When** o pesquisador
   abre a tabela de características, **Then** há uma linha por estudo e as
   colunas correspondem aos campos do formulário de extração da Revisão.
3. **Given** um item PRISMA que o relatório atual não cobre, **When** o checklist
   é gerado, **Then** esse item é marcado como pendente, não como atendido.

---

### User Story 5 - Exportação multi-formato do relatório e das referências (Priority: P3)

O pesquisador exporta o produto final. O sistema gera o **relatório em DOCX, PDF
e Markdown**, embutindo fluxograma, checklist e tabela de características; e
exporta as **referências bibliográficas dos estudos incluídos em BibTeX e RIS**.
A formatação de citações segue **APA 7**. A exportação é um **job assíncrono**
(trabalho pesado), com progresso visível e resultado baixável.

**Why this priority**: É a entrega final, mas depende de todos os artefatos
anteriores existirem. Tem o menor risco metodológico (é transformação de
formato) e por isso fecha a cadeia de prioridade.

**Independent Test**: Com um relatório gerado e estudos incluídos, acionar a
exportação e verificar que o sistema produz os três formatos do relatório (DOCX,
PDF, MD) com o mesmo conteúdo, mais arquivos de referências em BibTeX e RIS, e
que as citações no corpo seguem APA 7.

**Acceptance Scenarios**:

1. **Given** um relatório gerado com fluxograma e tabelas, **When** o
   pesquisador exporta, **Then** o sistema produz DOCX, PDF e Markdown com
   conteúdo equivalente e os artefatos visuais embutidos.
2. **Given** estudos incluídos, **When** o pesquisador exporta referências,
   **Then** o sistema gera arquivos BibTeX e RIS com todos os estudos incluídos.
3. **Given** um relatório com citações, **When** ele é exportado, **Then** as
   citações e a lista de referências seguem o estilo APA 7.
4. **Given** uma exportação de um relatório grande, **When** ela é acionada,
   **Then** roda como job assíncrono com progresso visível e o resultado fica
   disponível para download ao concluir, resiliente a falha por-formato.

---

### Edge Cases

- **Síntese sem dados suficientes:** Revisão sem estudos incluídos, ou com
  estudos sem dados de extração — o sistema informa a insuficiência e não
  fabrica temas/narrativa sem âncora (contrato anti-alucinação, D22).
- **Fluxograma com fases incompletas:** triagem não concluída — números
  parciais sinalizados, não apresentados como finais.
- **Regeneração destrutiva:** o pesquisador editou seções e regenera o
  relatório — o sistema preserva ou avisa antes de sobrescrever edições humanas.
- **Pipeline configurável:** fases opcionais (Risco de Viés, Certeza)
  desligadas — relatório, checklist e fluxograma se adaptam e declaram o que
  não foi feito, em vez de deixar lacunas silenciosas (D19).
- **Falha por-item em job em lote:** um estudo falha durante a síntese ou um
  formato falha na exportação — o job continua para os demais e reporta o item
  com falha; é retomável (D25).
- **Estimativa de custo antes de execução:** operações de IA em lote
  apresentam estimativa de tokens/custo antes de rodar (D23).
- **Citação sem metadados completos:** estudo incluído sem todos os campos
  bibliográficos — a citação APA 7 marca o que falta em vez de inventar dados.
- **Multilíngue:** estudos em idiomas diferentes — a saída da IA é em pt-BR e o
  trecho-fonte é citado no original (D24).

## Requirements *(mandatory)*

### Functional Requirements

**Síntese qualitativa (US1)**

- **FR-001**: O sistema MUST gerar, sob demanda, uma síntese qualitativa a
  partir dos dados de extração validados dos estudos incluídos de uma Revisão,
  produzindo temas agrupados, narrativa por tema e tabelas-resumo.
- **FR-002**: Cada elemento da síntese gerado por IA MUST carregar proveniência
  (modelo, versão, timestamp, estado pendente/aceita/editada/rejeitada) e MUST
  ancorar em **campos/valores de extração específicos** (nível de achado),
  referenciando os `{value, source_span, page}` produzidos no Marco 2 — não
  apenas o estudo inteiro.
- **FR-003**: O pesquisador MUST poder renomear, fundir, dividir, reordenar,
  editar e rejeitar temas e narrativa, com as alterações persistidas.
- **FR-004**: O sistema MUST registrar toda aceitação, edição e rejeição de
  sugestão de síntese na trilha de auditoria append-only.
- **FR-005**: O sistema MUST executar a geração de síntese como job assíncrono
  retomável, resiliente a falha por-item, com progresso visível.
- **FR-005a**: Cada Revisão MUST ter **uma única síntese mutável**; re-gerar
  atualiza a síntese existente preservando as edições humanas, e o histórico de
  alterações vive na trilha de auditoria (sem versionamento de execuções).
- **FR-006**: O sistema MUST apresentar estimativa de custo (tokens) antes de
  executar a geração de síntese em lote.
- **FR-007**: O sistema MUST recusar-se a gerar temas/narrativa sem dados de
  extração de origem (sem preenchimento por inferência sem âncora).

**Fluxograma PRISMA (US2)**

- **FR-008**: O sistema MUST gerar o fluxograma PRISMA 2020 derivando as
  contagens de cada fase (importados por fonte, duplicados removidos, triados,
  excluídos por motivo, avaliados em texto completo, incluídos) da trilha de
  auditoria real da Revisão.
- **FR-009**: O sistema MUST permitir exportar o fluxograma como SVG e PNG, com
  os arquivos refletindo exatamente os números exibidos.
- **FR-010**: O fluxograma MUST discriminar a contagem de exclusões por motivo
  quando os motivos de exclusão do texto completo estiverem registrados.
- **FR-011**: O sistema MUST sinalizar quando os números do fluxograma são
  parciais (fases ainda não concluídas) em vez de apresentá-los como finais.
- **FR-011a**: O fluxograma MUST ser **100% auto-derivado** das contagens do
  sistema e read-only (sem campos manuais); as caixas PRISMA de registros de
  fontes fora da busca em base (literatura cinzenta, citation searching, contato
  com autores) ficam em zero/ocultas na v1.

**Relatório estruturado (US3)**

- **FR-012**: O sistema MUST gerar um relatório estruturado com seções Métodos e
  Resultados auto-geradas e fiéis aos dados reais da Revisão, e Discussão/
  Conclusão como texto editável de partida.
- **FR-013**: O relatório MUST incluir uma declaração de uso de IA auto-gerada
  que enumere cada etapa assistida por IA (triagem, extração, síntese, redação)
  com proveniência.
- **FR-014**: O relatório MUST incluir uma seção de desvios do protocolo que
  liste as emendas versionadas e datadas desde o travamento do protocolo.
- **FR-015**: O relatório MUST declarar explicitamente as fases opcionais não
  conduzidas (Risco de Viés, Certeza) quando desligadas, adaptando-se ao
  pipeline configurável da Revisão.
- **FR-016**: O pesquisador MUST poder editar as seções do relatório, com as
  edições persistidas em **estado por seção**; uma regeneração MUST regenerar
  apenas as seções não-editadas, **preservar** as seções editadas pelo humano e
  **avisar** quais foram mantidas.
- **FR-017**: O sistema MUST registrar a geração e as edições do relatório na
  trilha de auditoria.

**Checklist e tabela de características (US4)**

- **FR-018**: O sistema MUST gerar um checklist PRISMA 2020 auto-preenchido, com
  cada item marcado como atendido/pendente e referenciando onde no relatório ele
  é coberto.
- **FR-019**: O sistema MUST gerar uma tabela de características dos estudos
  incluídos, com uma linha por estudo e colunas derivadas do formulário de
  extração da Revisão.

**Exportações (US5)**

- **FR-020**: O sistema MUST exportar o relatório em DOCX, PDF e Markdown, com
  conteúdo equivalente e fluxograma, checklist e tabela de características
  embutidos.
- **FR-021**: O sistema MUST exportar as referências bibliográficas dos estudos
  incluídos em BibTeX e RIS.
- **FR-022**: O sistema MUST formatar citações e a lista de referências segundo
  APA 7.
- **FR-023**: O sistema MUST executar a exportação do relatório como job
  assíncrono, com progresso visível, resultado baixável e resiliência a falha
  por-formato.

**Transversais**

- **FR-024**: Toda saída textual de IA (síntese, redação) MUST estar em pt-BR;
  trechos-fonte citados MUST preservar o idioma original.
- **FR-025**: Todos os artefatos e operações deste marco MUST respeitar o
  escopo por Revisão e a RLS (um pesquisador só acessa os dados da sua Revisão).
- **FR-026**: O sistema MUST manter a contabilidade de consumo de tokens por
  Revisão/fase para as operações de IA deste marco (síntese, redação).

### Key Entities *(include if feature involves data)*

- **Síntese**: agregado da leitura temática de uma Revisão. Contém temas
  ordenados, cada um com narrativa, tabela-resumo associada, proveniência e
  estado. **Uma única síntese mutável por Revisão** (sem versionamento de
  execuções); o histórico de alterações fica na trilha de auditoria.
- **Tema**: unidade de agrupamento da síntese. Nome, narrativa, **campos/valores
  de extração de origem** (grounding em nível de achado), estado de proveniência,
  ordem.
- **Relatório**: documento estruturado da Revisão. Seções (Métodos, Resultados,
  Discussão, Conclusão), declaração de IA, desvios do protocolo, **estado de
  edição por seção** (regeneração preserva seções editadas pelo humano). Um por
  Revisão, regenerável.
- **Fluxograma PRISMA**: representação das contagens de fase da Revisão,
  **auto-derivada e read-only** a partir da trilha de auditoria; exportável como
  imagem. Caixas de fontes externas (fora da busca em base) em zero/ocultas na
  v1.
- **Checklist PRISMA**: conjunto de itens PRISMA 2020 com estado atendido/
  pendente e referência à seção do relatório.
- **Tabela de características**: matriz estudo × campo de extração dos estudos
  incluídos.
- **Job de saída**: operação assíncrona (síntese em lote, exportação) com
  status, progresso, resultado por-item e estimativa/consumo de custo.
- **Exportação**: artefato gerado (DOCX/PDF/MD/BibTeX/RIS) associado a uma
  Revisão e a um relatório, com formato e timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partir de uma Revisão com estudos incluídos e dados de extração
  validados, o pesquisador obtém uma síntese temática rascunhada (temas +
  narrativa + tabela-resumo) em uma única ação, sem digitar a narrativa do zero.
- **SC-002**: As contagens exibidas no fluxograma PRISMA conferem 100% com a
  trilha de auditoria da Revisão em cada fase.
- **SC-003**: 100% das etapas em que a IA foi usada aparecem declaradas
  automaticamente no relatório, sem o pesquisador precisar listá-las manualmente.
- **SC-004**: 100% das emendas do protocolo posteriores ao travamento aparecem
  na seção de desvios do relatório.
- **SC-005**: O pesquisador exporta o relatório final nos três formatos (DOCX,
  PDF, Markdown) e as referências em BibTeX e RIS a partir de uma única Revisão,
  numa única operação de exportação.
- **SC-006**: Nenhuma afirmação factual da síntese ou do relatório existe sem
  origem rastreável aos dados extraídos; "não encontrado / dados insuficientes"
  é apresentado em vez de conteúdo inventado.
- **SC-007**: Toda saída textual de IA é apresentada em pt-BR e os trechos-fonte
  são citados no idioma original.
- **SC-008**: Operações de IA em lote (síntese) e exportações concluem como jobs
  assíncronos retomáveis: a interrupção de um item não impede os demais e o job
  é reiniciável sem refazer o trabalho já concluído.
- **SC-009**: Quando fases opcionais estão desligadas, o relatório, o checklist
  e o fluxograma declaram explicitamente o que não foi conduzido — nenhuma
  lacuna silenciosa.

## Assumptions

- **A edição do relatório é em nível de seção** (editar texto por seção, salvar,
  regenerar com preservação/aviso), não um editor WYSIWYG completo de
  processador de texto — coerente com D29 ("ponto de partida editável") sem
  expandir escopo para um editor de documentos.
- **A síntese reusa a engine de IA do Marco 2** (abstração `LLMProvider`,
  BYOK, grounding/proveniência) — nenhum novo provedor ou chave é introduzido
  por este marco.
- **As contagens de fase já existem** como subproduto auditável dos Marcos 1–2
  (importação, dedup, triagem); o fluxograma as lê, não as recalcula a partir
  de dados brutos.
- **A tabela de características deriva do formulário de extração configurável**
  definido no Marco 2; este marco não cria uma nova engine de formulário.
- **APA 7 é o único estilo de citação da v1**; outros estilos CSL e LaTeX são
  futuro (CONTEXT.md §6/§8), fora deste marco.
- **Risco de Viés e Certeza (CERQual) ficam fora deste marco** (fases opcionais
  pós-núcleo, D19); o relatório apenas declara sua ausência quando desligadas.
- **Meta-análise quantitativa fica fora** (futuro, D17/§6); a síntese é
  qualitativa/narrativa.
- **A geração de imagens e documentos pesados (fluxograma, DOCX/PDF) e a síntese
  em lote rodam no worker assíncrono**, não em request síncrono (D25/D31); o
  mecanismo concreto é decisão do `/speckit.plan`.
- **Operação solo na v1**: um único pesquisador (Owner) por Revisão conduz
  síntese, redação e exportação; colaboração multi-revisor permanece modelada
  no schema mas não operacional (D21).

## Dependencies

- **Marco 1 (mergeado em `main`)**: Revisão/auth/RLS, pergunta, protocolo
  (travamento/emendas), importação/registro de busca, dedup, triagem — fornece
  pergunta, critérios, protocolo, contagens de fase e estudos incluídos.
- **Marco 2 (mergeado em `main`)**: ingestão de PDF, extração por IA com
  grounding/proveniência, validação humana, busca semântica — fornece os dados
  de extração validados que a síntese e o relatório consomem, e a abstração
  `LLMProvider` reusada na síntese/redação.
- **Decisões de Discovery canônicas**: D4 (PRISMA obrigatório), D11–D13
  (AI-first, gradiente de autonomia, proveniência), D16 (emendas), D17
  (síntese qualitativa), D19 (pipeline configurável / opcionais), D20
  (entregáveis e formatos), D22 (anti-alucinação), D23 (custo), D24 (idioma),
  D25 (jobs assíncronos), D26 (auditoria), D29 (redação como ponto de partida).
