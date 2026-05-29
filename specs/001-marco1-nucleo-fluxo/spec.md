# Feature Specification: Marco 1 — Núcleo do Fluxo

**Feature Branch**: `001-marco1-nucleo-fluxo`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Marco 1 — núcleo do fluxo. Fatia vertical fina ponta-a-ponta: Revisão + auth/RLS → Pergunta (SPIDER) → Protocolo (travamento) → Importação + registro de busca → Dedup → Triagem solo, tudo no workbench unificado. Não inclui ingestão/extração de PDF por IA (Marco 2) nem síntese/relatório (Marco 3)."

## Visão geral

Este marco entrega o **esqueleto andante** do Cognilit: um pesquisador solo
consegue, de ponta a ponta, criar uma Revisão isolada, formular sua pergunta com
um framework, rascunhar e travar o protocolo, registrar suas buscas e importar
referências, remover duplicatas e triar os registros em duas etapas — tudo dentro
de uma **bancada de triagem unificada**, com a IA sugerindo e o humano decidindo.
Cada saída de IA carrega proveniência e estado explícito; cada ação que muda o
estado da Revisão é auditável.

Marco 1 **não** inclui ingestão/extração de PDF por IA (Marco 2) nem
síntese/relatório/exportações (Marco 3).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar e acessar uma Revisão isolada (Priority: P1)

Um pesquisador se autentica, cria uma nova Revisão e passa a trabalhar dentro
dela. Os dados de uma Revisão nunca vazam para outra nem para outro usuário. O
criador é dono e único revisor da Revisão.

**Why this priority**: Nada no produto existe fora de uma Revisão (agregado-raiz).
O isolamento por usuário/Revisão é a fundação de segurança sobre a qual todo o
resto depende; sem ele, nenhuma outra história pode ser demonstrada com segurança.

**Independent Test**: Criar dois usuários, cada um com uma Revisão; confirmar que
um usuário não consegue ver nem alterar a Revisão do outro, e que o criador acessa
e nomeia a sua. Entrega valor isolado: um espaço de trabalho próprio e seguro.

**Acceptance Scenarios**:

1. **Given** um visitante não autenticado, **When** ele se cadastra/entra, **Then**
   acessa apenas as Revisões das quais é membro.
2. **Given** um usuário autenticado sem Revisões, **When** cria uma Revisão com
   título, **Then** torna-se Owner+Reviewer dela e ela aparece na sua lista.
3. **Given** dois usuários com Revisões distintas, **When** o usuário A tenta
   acessar a Revisão do usuário B (por navegação direta), **Then** o acesso é
   negado.
4. **Given** um usuário com várias Revisões, **When** ele troca de Revisão ativa,
   **Then** todo o contexto da tela passa a refletir a Revisão selecionada.

---

### User Story 2 - Importar referências e registrar a busca no workbench (Priority: P1)

Dentro da Revisão, o pesquisador abre o **modo Importar** da bancada e, no mesmo
ato mental, registra a estratégia de busca (string, base, data, nº de hits) e
importa o arquivo de referências (RIS, BibTeX ou CSV), com pré-visualização do
parse antes de confirmar.

**Why this priority**: É a entrada de dados que alimenta todo o pipeline. Sem
corpus importado e busca registrada, não há o que deduplicar ou triar, e o
fluxograma PRISMA não tem números.

**Independent Test**: Importar um arquivo RIS/BibTeX/CSV de exemplo, conferir a
pré-visualização, confirmar, e verificar que os registros aparecem na fila com a
busca registrada (base/data/hits). Entrega valor isolado: um corpus rastreável.

**Acceptance Scenarios**:

1. **Given** um arquivo RIS válido, **When** o usuário o carrega no modo Importar,
   **Then** vê uma pré-visualização dos registros parseados com mapeamento de
   campos antes de confirmar.
2. **Given** a pré-visualização exibida, **When** o usuário confirma, **Then** os
   registros entram na fila do corpus e o contador "identificados" do PRISMA sobe.
3. **Given** uma importação, **When** o usuário a realiza, **Then** registra ao
   lado a string de busca, a base consultada, a data e o nº de hits informado.
4. **Given** um arquivo malformado ou de formato não suportado, **When** o usuário
   tenta importar, **Then** recebe uma mensagem clara e nenhum registro parcial é
   persistido.
5. **Given** uma importação grande, **When** o parsing ocorre, **Then** a interface
   permanece responsiva e o progresso é visível.

---

### User Story 3 - Deduplicar o corpus no workbench (Priority: P1)

Ainda na mesma bancada, no **modo Duplicatas**, as duplicatas exatas já foram
removidas automaticamente (com log reversível) e o pesquisador confirma ou rejeita
os pares **fuzzy** apresentados lado a lado.

**Why this priority**: Deduplicação é etapa obrigatória do PRISMA e precede a
triagem; sem ela, o pesquisador triaria o mesmo estudo duas vezes e os números do
fluxograma ficariam errados.

**Independent Test**: Importar um corpus com duplicatas exatas e quase-duplicatas;
verificar que as exatas foram removidas automaticamente com log, que os pares
fuzzy aparecem para confirmação, e que toda remoção é reversível. Entrega valor
isolado: um corpus sem duplicatas, auditável.

**Acceptance Scenarios**:

1. **Given** um corpus com duplicatas exatas (mesmo DOI; ou título normalizado +
   ano), **When** a importação conclui, **Then** as exatas são removidas
   automaticamente e cada remoção fica registrada de forma reversível.
2. **Given** uma remoção automática, **When** o usuário a desfaz, **Then** o
   registro retorna ao corpus e a contagem é restaurada.
3. **Given** pares com alta similaridade mas não exatos, **When** o usuário abre o
   modo Duplicatas, **Then** vê os pares lado a lado e decide "mesma" (mescla) ou
   "distintas" (mantém).
4. **Given** uma mesclagem de par fuzzy, **When** o usuário a realiza, **Then** ela
   é registrada na trilha e pode ser desfeita.
5. **Given** decisões de dedup, **When** o usuário consulta os contadores PRISMA,
   **Then** o número de "duplicados" reflete exatas + fuzzy confirmadas.

---

### User Story 4 - Triar em duas etapas no workbench (Priority: P1)

Na mesma bancada, o pesquisador tria os registros em dois modos: **Título/Resumo**
(rápido, teclado-first, sem motivo de exclusão obrigatório) e **Texto completo**
(com motivo de exclusão obrigatório, de uma lista configurável). A IA
pré-classifica e oferece razão; o humano decide. A IA nunca exclui sozinha.

**Why this priority**: É o coração do Marco — a correção central do produto (a
triagem unificada, D32). É onde o pesquisador passa a maior parte do tempo e onde
o valor da IA-no-laço aparece.

**Independent Test**: Sobre um corpus deduplicado, triar registros por teclado em
Título/Resumo (incluir/excluir/dúvida), depois em Texto completo com motivo
obrigatório; verificar que a sugestão de IA aparece com razão e proveniência, que
o humano decide, e que os contadores PRISMA acompanham. Entrega valor isolado: um
conjunto de estudos triado e rastreável.

**Acceptance Scenarios**:

1. **Given** um corpus deduplicado, **When** o usuário entra no modo
   Título/Resumo, **Then** percorre a fila por teclado e marca cada registro como
   incluir, excluir ou dúvida, sem precisar do mouse.
2. **Given** um registro em triagem, **When** a IA o pré-classifica, **Then** sua
   sugestão (incluir/excluir + razão curta) aparece com tratamento visual distinto
   do dado humano e com proveniência acessível; a sugestão **não** altera o estado
   sozinha.
3. **Given** uma sugestão de IA, **When** o usuário aceita, edita ou rejeita,
   **Then** o estado da sugestão (`aceita`/`editada`/`rejeitada`) e a decisão
   humana ficam registrados.
4. **Given** um registro incluído em Título/Resumo, **When** o usuário entra no
   modo Texto completo e decide excluir, **Then** é obrigado a escolher um motivo
   de exclusão de uma lista configurável por projeto antes de confirmar.
5. **Given** exclusões com motivo no Texto completo, **When** o usuário consulta o
   PRISMA, **Then** a contagem de exclusões por razão reflete os motivos
   escolhidos.
6. **Given** uma decisão de triagem, **When** o usuário a desfaz, **Then** o
   registro volta ao estado anterior e a trilha registra a reversão.

---

### User Story 5 - Formular a pergunta com framework e derivação assistida por IA (Priority: P2)

O pesquisador escolhe um framework de pergunta (SPIDER por padrão; PICo/PEO/PCC ou
livre) e formula sua pergunta; a IA sugere critérios de elegibilidade e termos de
busca, que o humano ratifica.

**Why this priority**: Dá rigor metodológico ao corpus e origina os critérios de
elegibilidade que sustentam os motivos de exclusão da triagem. É valioso, mas a
bancada de importação/dedup/triagem já entrega um MVP demonstrável sem ele.

**Independent Test**: Criar uma pergunta com SPIDER; acionar a derivação assistida
por IA; verificar que os critérios/termos vêm como sugestão ratificável (com
estado e proveniência) e que o humano pode editar/aceitar. Entrega valor isolado:
uma pergunta estruturada com critérios ratificados.

**Acceptance Scenarios**:

1. **Given** uma Revisão nova, **When** o usuário abre a fase Pergunta, **Then** o
   framework padrão é SPIDER e ele pode trocar por PICo/PEO/PCC ou livre, com os
   campos adaptando-se ao framework.
2. **Given** uma pergunta formulada, **When** o usuário aciona a derivação por IA,
   **Then** recebe critérios de elegibilidade e termos de busca como **sugestões**
   com proveniência, nunca aplicados automaticamente.
3. **Given** sugestões de IA, **When** o usuário aceita, edita ou rejeita cada uma,
   **Then** os critérios ratificados ficam associados à Revisão e seu estado é
   registrado.

---

### User Story 6 - Rascunhar, editar e travar o protocolo PRISMA-P (Priority: P2)

A IA rascunha um protocolo PRISMA-P; o pesquisador edita; ao iniciar a triagem o
protocolo é **travado**. Mudanças após o travamento viram emendas versionadas e
datadas.

**Why this priority**: O travamento de protocolo é um requisito metodológico
(impede ajuste oportunista de critérios após ver os resultados). Importante, mas
depende da pergunta (US5) e fecha o ciclo de configuração antes da triagem.

**Independent Test**: Gerar rascunho do protocolo por IA, editar, travar ao
iniciar a triagem, e então fazer uma mudança verificando que ela é registrada como
emenda versionada e datada. Entrega valor isolado: um protocolo congelado e
auditável.

**Acceptance Scenarios**:

1. **Given** uma pergunta ratificada, **When** o usuário abre a fase Protocolo,
   **Then** a IA oferece um rascunho PRISMA-P editável (sugestão, não fato).
2. **Given** um protocolo editado, **When** o usuário inicia a triagem, **Then** o
   protocolo é travado e seu estado de "travado" fica visível.
3. **Given** um protocolo travado, **When** o usuário faz uma mudança, **Then** a
   mudança é registrada como emenda versionada e datada, sem sobrescrever a versão
   travada.
4. **Given** um protocolo, **When** o usuário solicita exportá-lo, **Then** obtém
   uma versão exportável para submissão manual externa.

---

### User Story 7 - Navegar pelo pipeline com trilho de fases e PRISMA vivo (Priority: P3)

O pesquisador navega pelas fases da Revisão por um trilho lateral que mostra o
estado de cada fase, e vê a qualquer momento uma barra PRISMA viva com os
contadores reais (identificados, duplicados, triados, incluídos, excluídos).

**Why this priority**: Dá orientação e confiança (onde estou, quanto progrediu),
mas as histórias P1/P2 funcionam mesmo com navegação mínima. É a moldura que
amarra o conjunto.

**Independent Test**: Percorrer uma Revisão com registros em vários estados;
verificar que o trilho reflete o estado de cada fase e que a barra PRISMA mostra
contadores reais que batem com o corpus. Entrega valor isolado: orientação contínua
e consistência número-a-número.

**Acceptance Scenarios**:

1. **Given** uma Revisão em andamento, **When** o usuário olha o trilho de fases,
   **Then** vê cada fase marcada como feita, em curso, pendente, travada ou
   opcional-desligada.
2. **Given** registros importados, deduplicados e triados, **When** o usuário olha
   a barra PRISMA, **Then** os contadores refletem o estado real do corpus em tempo
   real.
3. **Given** as fases opcionais (Risco de Viés, Certeza) desligadas, **When** o
   usuário vê o trilho, **Then** elas aparecem como desligadas e não bloqueiam o
   fluxo.

### Edge Cases

- **Importação vazia ou sem registros válidos**: o sistema informa que nada foi
  importado e não altera os contadores.
- **Arquivo com codificação/idioma inesperado**: o conteúdo de entrada multilíngue
  é aceito; os campos são preservados no idioma original.
- **DOI ausente**: a deduplicação de exatas recai sobre título normalizado + ano.
- **Tentativa de excluir no Texto completo sem motivo**: a ação é bloqueada até que
  um motivo seja escolhido.
- **Tentativa de editar protocolo travado**: permitida apenas como emenda
  versionada, nunca como sobrescrita silenciosa.
- **Sugestão de IA indisponível** (falha do provedor ou chave BYOK ausente): a
  triagem e demais fases continuam operáveis manualmente; a ausência da sugestão é
  sinalizada, não trava o fluxo.
- **Reversão de dedup após triagem do registro mesclado**: o sistema mantém a
  trilha coerente e impede estados órfãos.
- **Troca de Revisão ativa no meio de uma fila**: o estado da fila da Revisão
  anterior é preservado e reabrível.

## Requirements *(mandatory)*

### Functional Requirements

**Revisão, acesso e isolamento**

- **FR-001**: O sistema MUST permitir que um usuário se autentique antes de acessar
  qualquer Revisão.
- **FR-002**: O sistema MUST permitir criar uma Revisão com, no mínimo, um título;
  o criador MUST tornar-se Owner e Reviewer único dela.
- **FR-003**: O sistema MUST isolar todo dado por usuário/Revisão, de modo que um
  usuário só acesse Revisões das quais é membro.
- **FR-004**: O sistema MUST permitir que um usuário com múltiplas Revisões troque
  a Revisão ativa, refletindo a troca em todo o contexto da interface.
- **FR-005**: O sistema MUST modelar papéis de membro (Owner/Reviewer/Viewer) na
  estrutura de dados desde já, sem expor afordâncias de colaboração, conflito ou
  kappa na interface enquanto houver um único revisor.

**Pergunta e critérios (US5)**

- **FR-006**: O sistema MUST oferecer seleção de framework de pergunta com SPIDER
  como padrão e PICo, PEO, PCC e formato livre como alternativas, adaptando os
  campos ao framework escolhido.
- **FR-007**: O sistema MUST permitir que a IA derive critérios de elegibilidade e
  termos de busca a partir da pergunta, sempre como sugestão ratificável.
- **FR-008**: Usuários MUST poder aceitar, editar ou rejeitar cada sugestão de
  critério/termo, com o estado da decisão registrado.

**Protocolo (US6)**

- **FR-009**: O sistema MUST permitir que a IA rascunhe um protocolo PRISMA-P
  editável pelo humano.
- **FR-010**: O sistema MUST travar o protocolo ao iniciar a triagem e exibir esse
  estado.
- **FR-011**: O sistema MUST registrar qualquer mudança a um protocolo travado como
  emenda versionada e datada, sem sobrescrever a versão travada.
- **FR-012**: O sistema MUST permitir exportar o protocolo para submissão manual
  externa.

**Importação e registro de busca (US2)**

- **FR-013**: O sistema MUST importar referências nos formatos RIS, BibTeX e CSV.
- **FR-014**: O sistema MUST exibir uma pré-visualização do parse, com mapeamento
  de campos, antes de confirmar a importação.
- **FR-015**: O sistema MUST registrar, junto à importação, a estratégia de busca:
  string, base, data e nº de hits.
- **FR-016**: O sistema MUST rejeitar arquivos malformados ou de formato não
  suportado com mensagem clara, sem persistir registros parciais.
- **FR-017**: O sistema MUST executar o parsing de importações grandes sem
  bloquear a interface, com progresso visível.

**Deduplicação (US3)**

- **FR-018**: O sistema MUST remover automaticamente duplicatas exatas, usando DOI
  quando presente e, na sua ausência, título normalizado + ano.
- **FR-019**: Toda remoção automática MUST ser registrada de forma reversível.
- **FR-020**: O sistema MUST apresentar pares de alta similaridade (fuzzy) para
  confirmação humana lado a lado, com decisão "mesma" (mescla) ou "distintas".
- **FR-021**: Toda mesclagem de par fuzzy MUST ser registrada na trilha e ser
  reversível.

**Triagem (US4)**

- **FR-022**: O sistema MUST oferecer triagem em dois modos: Título/Resumo e Texto
  completo.
- **FR-023**: O sistema MUST permitir decidir incluir, excluir ou dúvida por
  teclado, sem exigir o mouse na triagem.
- **FR-024**: A IA MUST pré-classificar registros com razão curta, sem nunca
  alterar o estado de um registro sozinha.
- **FR-025**: O sistema MUST exigir motivo de exclusão **apenas** no Texto
  completo, a partir de uma lista configurável por projeto.
- **FR-026**: O sistema MUST permitir desfazer decisões de triagem, registrando a
  reversão.

**Workbench unificado (D32 / Princípio V) — restrição transversal**

- **FR-027**: O sistema MUST apresentar importação, deduplicação e triagem
  (Título/Resumo e Texto completo) como **modos de uma única superfície de
  trabalho**, nunca como telas de navegação separadas.
- **FR-028**: As filas MUST ser densas e orientadas a teclado, com atalhos para
  todas as ações de decisão e legenda de atalhos visível.
- **FR-029**: O sistema SHOULD oferecer ordenação opcional da fila (incluindo por
  pontuação de prioridade da IA) e filtros por estado/fonte/termo, sem que a
  ordenação substitua a decisão humana.

**IA-no-laço: proveniência, grounding e custo (transversal)**

- **FR-030**: Toda saída de IA MUST exibir um estado explícito
  (`pendente`/`aceita`/`editada`/`rejeitada`/`inferida`) com tratamento visual
  distinto de dado confirmado por humano.
- **FR-031**: Toda sugestão de IA MUST expor proveniência (modelo, versão,
  prompt/trecho-fonte, timestamp, estado).
- **FR-032**: O sistema MUST permitir cadastrar a chave BYOK do provedor de IA,
  armazenada cifrada, e operar as fases manualmente quando a IA estiver
  indisponível.
- **FR-033**: Antes de executar IA em lote, o sistema MUST exibir estimativa de
  custo/tokens e MUST acumular o consumo por Revisão/fase.
- **FR-034**: "Não encontrado" MUST ser um resultado válido e explicitamente
  renderizado de saída de IA, nunca um erro ou campo vazio ambíguo.

**Auditoria e PRISMA (transversal)**

- **FR-035**: O sistema MUST registrar em trilha append-only (ator humano|IA,
  timestamp, antes/depois) toda ação que muda o estado da Revisão, e MUST permitir
  exportar essa trilha.
- **FR-036**: O sistema MUST manter contadores PRISMA vivos (identificados,
  duplicados, triados, incluídos, excluídos por razão) refletindo o estado real do
  corpus em tempo real.
- **FR-037**: O sistema MUST preservar e reabrir o estado de navegação que afeta
  resultado (filtros, ordenação, seleção) de uma fila de triagem.

**Idioma (transversal)**

- **FR-038**: A interface e as saídas geradas pela IA MUST ser em pt-BR; conteúdo
  de entrada MUST ser aceito em múltiplos idiomas e o trecho-fonte MUST ser exibido
  no idioma original.

### Key Entities *(include if feature involves data)*

- **Revisão**: agregado-raiz; um projeto de revisão sistemática. Possui título,
  framework de pergunta, critérios de elegibilidade, protocolo, configuração de
  pipeline e pertence a um ou mais membros. Tudo o mais pertence a uma Revisão.
- **Membro**: associação entre usuário, Revisão e papel (Owner/Reviewer/Viewer).
  Na v1, o criador é Owner+Reviewer único.
- **Pergunta / Critérios**: o framework escolhido, a pergunta formulada, e os
  critérios de elegibilidade e termos de busca (com estado de ratificação e
  proveniência quando derivados por IA).
- **Protocolo**: rascunho PRISMA-P editável, com estado (rascunho/travado) e
  emendas versionadas e datadas.
- **Busca registrada**: a estratégia de uma importação — string, base, data, nº de
  hits.
- **Registro (record)**: referência bibliográfica importada, com seus metadados, a
  fonte/formato de origem, seu estado no corpus (ativo, duplicado, triado…) e a
  busca que o originou.
- **Decisão de dedup**: o resultado (automático ou humano) de comparar registros —
  remoção de exata ou mesclagem de par fuzzy —, reversível e auditável.
- **Decisão de triagem**: a decisão humana (incluir/excluir/dúvida) por etapa, o
  motivo de exclusão (Texto completo), e a sugestão de IA associada com seu estado.
- **Sugestão de IA**: saída de um agente, com proveniência (modelo, versão,
  prompt/trecho, timestamp) e estado (pendente/aceita/editada/rejeitada/inferida).
- **Entrada de auditoria**: registro append-only de uma mudança de estado (ator,
  timestamp, antes/depois).
- **Contadores PRISMA**: agregados derivados dos estados dos registros, vivos no
  shell e espelhados pelo futuro fluxograma.
- **Chave BYOK / consumo**: a chave de provedor de IA cifrada e a contabilidade de
  tokens/custo por Revisão/fase.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um pesquisador consegue, numa primeira sessão, ir de "Revisão criada"
  até "primeiros registros triados" sem precisar de ajuda externa, percorrendo
  importar → deduplicar → triar numa única superfície.
- **SC-002**: Importação, deduplicação e triagem são realizadas **sem trocar de
  tela** (uma única bancada por modos) — zero telas separadas para essas três
  capacidades.
- **SC-003**: Na triagem de Título/Resumo, o pesquisador decide cada registro
  usando apenas o teclado (incluir/excluir/dúvida/navegar/desfazer), sem necessidade
  do mouse.
- **SC-004**: Os contadores PRISMA exibidos batem, número a número, com o estado
  real do corpus em 100% das verificações (identificados = importados; duplicados =
  exatas + fuzzy confirmadas; etc.).
- **SC-005**: 100% das saídas de IA exibidas têm estado explícito e proveniência
  acessível; nenhuma decisão de estado da Revisão é tomada pela IA sem ratificação
  humana.
- **SC-006**: 100% das remoções de duplicatas (exatas e fuzzy) e das decisões de
  triagem são reversíveis e aparecem na trilha de auditoria exportável.
- **SC-007**: Toda exclusão em Texto completo tem um motivo registrado (0%
  exclusões sem motivo).
- **SC-008**: Antes de qualquer operação de IA em lote, o pesquisador vê uma
  estimativa de custo/tokens; o consumo acumulado fica disponível por Revisão/fase.
- **SC-009**: Um usuário nunca acessa dados de uma Revisão da qual não é membro (0
  vazamentos entre Revisões/usuários em testes de isolamento).
- **SC-010**: Após travado, um protocolo não pode ser sobrescrito; 100% das
  mudanças pós-travamento ficam como emendas versionadas e datadas.
- **SC-011**: A interface e as saídas de IA aparecem em pt-BR, com o trecho-fonte
  citado no idioma original.

## Assumptions

- **Autenticação**: usa um mecanismo padrão de autenticação de aplicação web
  (e-mail/senha ou equivalente); o método concreto é decisão do `/plan`. O
  importante para esta spec é que o acesso seja autenticado e escopado.
- **IA no Marco 1**: a IA é usada apenas para tarefas de **geração textual de
  apoio** (derivar critérios/termos na Pergunta; rascunhar o protocolo) e
  **pré-classificação na triagem** — sempre como sugestão ratificável. Não há
  ingestão nem extração de PDF neste marco (Marco 2).
- **Grounding na triagem**: como o Marco 1 não ingere PDFs, o grounding das
  sugestões de triagem ancora-se nos metadados/resumo importados, não em trechos de
  PDF; o grounding pleno em PDF entra no Marco 2.
- **Chave BYOK**: o cadastro da chave de provedor de LLM é necessário para as
  funções de IA deste marco; sem chave, as fases funcionam manualmente.
- **Limiar de dedup fuzzy**: o critério concreto de similaridade que separa "exata"
  de "fuzzy" e o que entra na fila de confirmação é decisão do `/plan`.
- **Solo na v1**: cegamento, kappa e fila de conflitos estão modelados no schema
  mas não operacionais; a interface não os expõe com um único revisor.
- **Lista de motivos de exclusão**: começa de um conjunto padrão configurável por
  projeto; a curadoria fina da lista é detalhe de implementação.
- **EmbeddingProvider / busca semântica (RAG)**: fora do Marco 1 (entra no Marco
  2); nenhuma história aqui depende de embeddings.

## Out of Scope (Marco 1)

- Ingestão de PDF, extração de dados por IA e busca semântica/RAG (Marco 2).
- Síntese qualitativa, redação assistida, fluxograma PRISMA renderizado e
  exportações DOCX/PDF/MD e de referências (Marco 3). O Marco 1 mantém os
  **contadores** PRISMA vivos, mas não gera o artefato de fluxograma.
- Fases opcionais Risco de Viés e Certeza (CERQual) — modeladas como desligáveis,
  não implementadas neste marco.
- Colaboração multi-revisor operacional, convites, kappa, arbitragem.
- Integração via API com bases bibliográficas (importação é manual).
- Meta-análise quantitativa; visualizações de grafo/nuvem de palavras; visualizador
  PDF lado a lado; LaTeX e estilos CSL além de APA 7.
