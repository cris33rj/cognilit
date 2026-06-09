# Feature Specification: Marco 2 — Coração AI-first

**Feature Branch**: `002-marco2-coracao-ai-first`

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "Marco 2 de 3 — 'coração AI-first'. Constrói SOBRE o Marco 1 (Revisão + auth/RLS, registros, triagem no workbench unificado, trilha de auditoria, plumbing LLMProvider/BYOK), sem refazê-lo. Deriva de docs/CONTEXT.md §5 e das decisões D9, D10, D11, D12, D13, D22, D23, D24, D25, D27, D28, D31; respeita a constitution (Princípios I, II, III, IV, VII, VIII). Capacidades: ingestão de PDF; pipeline de texto assíncrono e híbrido; motor de formulário de extração configurável; extração por IA com grounding e proveniência; validação humana no laço; operação em lote como job assíncrono com estimativa de custo; busca semântica (RAG). Fora de escopo: síntese/relatório/exportações (Marco 3); risco de viés e CERQual; visualizador de PDF lado-a-lado (v1.1); integração via API e colaboração multi-revisor operacional."

## Visão geral

Este marco é o **coração AI-first** do Cognilit. Sobre o esqueleto andante do
Marco 1 — Revisão isolada (auth + RLS), corpus triado no workbench unificado,
trilha de auditoria e plumbing de `LLMProvider`/BYOK — o Marco 2 dá ao
pesquisador o que torna o produto valioso de fato: anexar os PDFs dos estudos
incluídos, ter seu texto extraído por um **pipeline assíncrono e híbrido**,
montar um **formulário de extração configurável**, e deixar um **agente LLM
preencher os campos a partir do PDF** — sempre com **grounding** (trecho-fonte +
página), **proveniência obrigatória** e **estado explícito**, sob **validação
humana no laço**: a IA sugere, o humano ratifica, a IA nunca finaliza sozinha.
Operações em lote rodam como **jobs assíncronos** com **estimativa de custo
antes de executar** e **consumo acumulado por Revisão/fase**. Por fim, uma
**busca semântica (RAG)** sobre os PDFs ingeridos retorna os trechos mais
similares, ancorados à página/posição e escopados à Revisão.

Marco 2 **constrói sobre** o Marco 1 e **não o refaz**. Reusa o vocabulário
visual de IA já estabelecido (suggestion chip, provenance popover, grounding
highlight, accept/edit/reject, badge "inferido") em vez de reinventá-lo.

Marco 2 **não** inclui síntese/narrativa, tabelas-resumo, relatório, fluxograma
PRISMA renderizado nem exportações (Marco 3); **não** inclui risco de viés nem
Certeza/CERQual (fases opcionais, depois do núcleo); **não** inclui visualizador
de PDF lado-a-lado (v1.1).

## Clarifications

### Session 2026-06-09

- Q: A extração por IA depende da busca semântica/embeddings para localizar trechos no PDF, ou processa o texto diretamente? → A: **Direta** — a extração lê o texto do documento diretamente (com chunking interno para docs longos, mecanismo decidido no `/plan`); a recuperação semântica (RAG) é capacidade **independente** (US5). US3 (P1) não depende do stack de embeddings (US5, P2).
- Q: Quantos formulários de extração uma Revisão pode ter? → A: **Um único** formulário de extração por Revisão (análogo à lista de motivos de exclusão do Marco 1). A engine permanece genérica para acomodar futuros instrumentos (risco de viés/CERQual) como fases distintas.
- Q: Qual o alvo de escala de PDFs por Revisão (para dimensionar o pipeline assíncrono e o gate de performance)? → A: **Centenas (~500 PDFs por Revisão)**, dezenas de páginas cada — fração do corpus de ~5.000 registros do Marco 1 incluída como estudos após o texto completo.
- Q: Quando a extração por IA é re-executada sobre um estudo que já tem valores validados, o que acontece? → A: As **novas sugestões entram como pendentes ao lado dos valores validados**, sem sobrescrever; o humano decide. Preserva ratificação humana e trilha de auditoria.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Anexar PDFs e extrair seu texto por pipeline assíncrono híbrido (Priority: P1)

Dentro de uma Revisão, o pesquisador anexa um ou mais PDFs a um **estudo** (um
registro que passou na triagem). Os arquivos são guardados no armazenamento
escopado por Revisão. O texto de cada PDF é extraído por um **pipeline
assíncrono e híbrido**: a parte síncrona apenas valida, guarda e enfileira; um
worker processa em segundo plano. PDFs com camada de texto recebem extração
determinística; PDFs escaneados passam por LLM multimodal como OCR. Cada camada
de texto guarda sua **origem de proveniência** (`nativo` ou `ocr_ia`). O job é
retomável, resiliente a falha por-item, e seu progresso é visível.

**Why this priority**: Sem o texto dos PDFs ingeridos não há extração por IA nem
busca semântica — tudo o mais neste marco depende desta fundação. É a entrada de
dados do "coração AI-first".

**Independent Test**: Anexar a um estudo um PDF com camada de texto e um PDF
escaneado; verificar que ambos são guardados escopados à Revisão, que o texto de
cada um é extraído de forma assíncrona com progresso visível, que a origem de
proveniência (`nativo`/`ocr_ia`) é registrada por camada, e que interromper e
retomar o job não reprocessa o que já foi feito. Entrega valor isolado: um
corpus de PDFs com texto pronto para IA.

**Acceptance Scenarios**:

1. **Given** um estudo incluído na triagem, **When** o pesquisador anexa um ou
   mais PDFs, **Then** os arquivos são guardados escopados à Revisão e ficam
   associados ao estudo, com um estado de processamento visível.
2. **Given** um PDF com camada de texto, **When** o pipeline o processa,
   **Then** o texto é extraído de forma determinística e a camada é marcada com
   origem `nativo`.
3. **Given** um PDF escaneado (sem camada de texto), **When** o pipeline o
   processa, **Then** o texto é obtido via LLM multimodal como OCR e a camada é
   marcada com origem `ocr_ia`.
4. **Given** um lote de PDFs em processamento, **When** o job é interrompido e
   retomado, **Then** ele continua de onde parou e uma falha em um PDF não
   impede o processamento dos demais.
5. **Given** um arquivo que não é PDF ou está corrompido, **When** o pesquisador
   tenta anexá-lo, **Then** recebe uma mensagem clara e nada parcial é
   persistido.
6. **Given** o gatilho síncrono de upload, **When** o arquivo é recebido,
   **Then** ele apenas valida, guarda e enfileira — o parsing pesado nunca roda
   dentro desse gatilho síncrono.

---

### User Story 2 - Montar um formulário de extração configurável (Priority: P1)

O pesquisador monta, para a sua Revisão, o seu **formulário de extração** (um
único por Revisão) composto de **campos tipados** (texto, número, data, booleano,
escolha de lista, etc.).
Esse formulário define o que a IA vai extrair de cada estudo e o que o humano vai
validar. A mesma engine de "formulário configurável" é projetada para servir, no
futuro, ao risco de viés e ao CERQual — mas essas fases não são implementadas
aqui.

**Why this priority**: A extração por IA (US3) não tem o que preencher sem um
formulário definido. O formulário é a estrutura de dados que o agente preenche e
o humano valida; precede logicamente a extração.

**Independent Test**: Montar um formulário com campos de tipos diferentes,
reordená-los e editá-los; verificar que o formulário pertence à Revisão e que
serve de base para a extração. Entrega valor isolado: um instrumento de extração
configurado, reaproveitável.

**Acceptance Scenarios**:

1. **Given** uma Revisão, **When** o pesquisador abre a configuração do
   formulário de extração, **Then** pode adicionar campos tipados (ao menos:
   texto, número, data, booleano e escolha de lista), nomeá-los e ordená-los.
2. **Given** um formulário com campos, **When** o pesquisador edita ou remove um
   campo, **Then** a mudança é registrada e o formulário permanece consistente.
3. **Given** um formulário configurado, **When** a extração por IA é acionada
   (US3), **Then** ela opera exatamente sobre os campos definidos no formulário.
4. **Given** a engine de formulário configurável, **When** projetada, **Then**
   ela é genérica o bastante para acomodar futuramente risco de viés/CERQual sem
   reescrita do núcleo (sem implementar essas fases neste marco).

---

### User Story 3 - Extração por IA com grounding, proveniência e validação humana no laço (Priority: P1)

Para um estudo com PDF processado, o pesquisador aciona a **extração por IA**: um
agente LLM preenche os campos do formulário a partir do texto do PDF. Toda saída
**factual** referencia um **trecho-fonte** (`source_span` + página); **"não
encontrado"** é um resultado de primeira classe; campos **inferidos** (ex.:
classificar o desenho do estudo) são marcados com estado `inferido` (≠ ancorado)
e exigem ratificação. A saída é em pt-BR e o trecho-fonte é citado no idioma
original. Cada sugestão carrega **proveniência obrigatória** (modelo, versão,
prompt/trecho-fonte, timestamp, estado). Para cada sugestão o humano pode
**aceitar, editar ou rejeitar**; os estados são `pendente`/`aceita`/`editada`/
`rejeitada`/`inferida`. **A IA nunca finaliza um campo sozinha.**

**Why this priority**: É o valor central do marco — a automação AI-first com
humano-no-laço. É onde o pesquisador economiza tempo sem abrir mão da
rastreabilidade científica.

**Independent Test**: Sobre um estudo com PDF processado e um formulário
definido, acionar a extração; verificar que cada campo preenchido cita
trecho-fonte + página (ou "não encontrado" explícito), que campos inferidos
aparecem marcados como tal, que cada sugestão expõe proveniência completa, e que
aceitar/editar/rejeitar registra o estado — sem que a IA finalize qualquer campo
sozinha. Entrega valor isolado: um estudo com dados extraídos e validados,
rastreáveis ao PDF.

**Acceptance Scenarios**:

1. **Given** um estudo com texto de PDF disponível e um formulário definido,
   **When** o pesquisador aciona a extração, **Then** o agente preenche os campos
   como **sugestões**, nunca como valores finais aplicados automaticamente.
2. **Given** um campo factual preenchido pela IA, **When** o pesquisador o
   inspeciona, **Then** vê o **trecho-fonte** (span + página) que ancora o valor,
   citado no idioma original do documento.
3. **Given** um campo cujo valor não consta no PDF, **When** a IA o processa,
   **Then** o resultado é **"não encontrado"** explicitamente renderizado, nunca
   um erro nem um campo vazio ambíguo.
4. **Given** um campo inferido (sem âncora direta), **When** a IA o sugere,
   **Then** ele é marcado com estado `inferido` (visualmente distinto de
   ancorado) e exige ratificação humana.
5. **Given** uma sugestão de extração, **When** o pesquisador a inspeciona,
   **Then** vê a proveniência completa: modelo, versão, prompt/trecho-fonte,
   timestamp e estado.
6. **Given** uma sugestão, **When** o pesquisador a aceita, edita ou rejeita,
   **Then** o estado (`aceita`/`editada`/`rejeitada`) e o valor final humano
   ficam registrados na trilha de auditoria.
7. **Given** o conjunto de sugestões de um estudo, **When** o pesquisador não
   ratifica, **Then** nenhum valor é tratado como final — a IA não finaliza o
   estudo sozinha.
8. **Given** as superfícies de sugestão da extração, **When** renderizadas,
   **Then** reusam o vocabulário visual de IA do Marco 1 (suggestion chip,
   provenance popover, grounding highlight, accept/edit/reject, badge
   "inferido"), sem um novo sistema visual.

---

### User Story 4 - Extrair em lote com estimativa de custo e contabilidade de consumo (Priority: P2)

O pesquisador aciona a extração por IA **em lote** sobre vários estudos de uma
vez. A operação roda como **job assíncrono** (progresso visível, retomável,
resiliente a falha por-item). **Antes de executar**, o sistema exibe uma
**estimativa de custo/tokens**; o **consumo acumulado** fica disponível por
Revisão/fase. O pesquisador nunca é surpreendido pelo gasto da própria chave.

**Why this priority**: Extrair estudo a estudo entrega valor (US3), mas a escala
real de uma RSL exige operação em lote com previsibilidade de custo. É essencial
para uso prático, porém depende do contrato de extração de US3.

**Independent Test**: Selecionar vários estudos com PDF processado e acionar a
extração em lote; verificar que uma estimativa de custo/tokens é exibida antes
da execução, que o job mostra progresso e é retomável, que uma falha por-item
não derruba o lote, e que o consumo acumulado por Revisão/fase é atualizado.
Entrega valor isolado: extração de muitos estudos com custo previsível e
controlado.

**Acceptance Scenarios**:

1. **Given** uma seleção de estudos com PDF processado, **When** o pesquisador
   aciona a extração em lote, **Then** vê uma **estimativa de custo/tokens antes**
   de a execução começar e precisa confirmar.
2. **Given** um lote em execução, **When** o pesquisador o acompanha, **Then** vê
   progresso visível e o job é retomável após interrupção.
3. **Given** um item do lote que falha, **When** o erro ocorre, **Then** os
   demais itens continuam sendo processados (resiliência por-item) e a falha é
   sinalizada.
4. **Given** lotes executados, **When** o pesquisador consulta a contabilidade,
   **Then** vê o **consumo acumulado de tokens/custo por Revisão e por fase**.
5. **Given** a chave BYOK ausente ou o provedor indisponível, **When** o
   pesquisador tenta o lote, **Then** recebe sinalização clara e pode operar a
   extração manualmente, sem que o fluxo trave.

---

### User Story 5 - Buscar semanticamente no corpus de PDFs (RAG) (Priority: P2)

O pesquisador faz uma **consulta em linguagem natural** sobre os PDFs ingeridos
da Revisão; o sistema retorna os **trechos mais similares**, ancorados à
página/posição e ao estudo de origem. A consulta é escopada por Revisão (um
usuário nunca busca no corpus de outra). Os vetores usam o `EmbeddingProvider`
(default Voyage AI hospedado, 2ª chave BYOK distinta da do LLM, cifrada),
persistidos com dimensão definida pelo provedor.

**Why this priority**: A busca semântica multiplica o valor do corpus ingerido
(localizar evidência sem ler tudo), mas a ingestão+extração já entregam o núcleo
AI-first demonstrável. É valiosa e reaproveita o pipeline de texto, porém vem
depois do contrato de extração.

**Independent Test**: Sobre um corpus de PDFs processados, fazer uma consulta
semântica; verificar que retornam trechos similares ancorados à página/posição e
ao estudo, que a busca é escopada à Revisão (zero vazamento entre Revisões), e
que a geração de embeddings roda como job assíncrono. Entrega valor isolado:
recuperação de evidência ancorada sobre o corpus da Revisão.

**Acceptance Scenarios**:

1. **Given** um corpus de PDFs com texto extraído, **When** o pesquisador faz
   uma consulta em linguagem natural, **Then** recebe os trechos mais similares,
   cada um ancorado à **página/posição** e ao **estudo** de origem.
2. **Given** dois usuários com Revisões distintas, **When** um faz uma busca
   semântica, **Then** os resultados vêm **apenas** do corpus da sua própria
   Revisão (escopo por RLS, zero vazamento).
3. **Given** PDFs recém-processados, **When** os embeddings são gerados,
   **Then** isso ocorre como **job assíncrono** (progresso, retomável,
   resiliente por-item).
4. **Given** o `EmbeddingProvider`, **When** os vetores são persistidos,
   **Then** a dimensão do vetor é a definida pelo provedor (dimensão variável
   acomodada pelo schema), usando a 2ª chave BYOK cifrada e distinta da chave do
   LLM.
5. **Given** a 2ª chave BYOK ausente, **When** o pesquisador tenta a busca
   semântica, **Then** recebe sinalização clara e o restante do produto continua
   operável.

### Edge Cases

- **PDF sem texto e sem ser reconhecível como escaneado**: o sistema sinaliza o
  estado de processamento e não inventa texto; o estudo permanece sem camada de
  texto utilizável, de forma explícita.
- **PDF parcialmente escaneado** (algumas páginas com texto, outras imagem): cada
  página/camada carrega sua própria origem (`nativo`/`ocr_ia`); o grounding
  referencia a camada efetivamente usada.
- **Estudo sem PDF anexado**: a extração por IA não é acionável até haver texto
  disponível; a ausência é sinalizada, não trava o fluxo.
- **PDF muito grande / lote extenso**: o processamento permanece assíncrono e
  retomável; a interface não bloqueia e o progresso é visível.
- **Sugestão de IA indisponível** (falha do provedor ou chave BYOK ausente): a
  extração e a busca semântica sinalizam a indisponibilidade; a extração pode ser
  feita manualmente sobre o formulário; o fluxo não trava.
- **Reprocessar um PDF / re-executar a extração**: o reprocessamento é explícito e
  auditável; as novas sugestões entram como **pendentes ao lado** dos valores já
  validados, sem sobrescrever — o humano decide qual prevalece (ver FR-019a).
- **Editar o formulário após extrações existentes**: mudanças no formulário não
  apagam silenciosamente valores já validados; o sistema mantém a trilha coerente
  e sinaliza campos afetados.
- **"Não encontrado" vs. campo realmente vazio**: os dois estados são distintos e
  renderizados de forma inequívoca.
- **Custo estimado divergente do real**: a estimativa é prévia e aproximada; o
  consumo acumulado reflete o gasto real por Revisão/fase.
- **Tentativa de acessar PDF de outra Revisão** (navegação direta): o acesso é
  negado pelo isolamento do armazenamento.

## Requirements *(mandatory)*

### Functional Requirements

**Ingestão e armazenamento de PDF (US1)**

- **FR-001**: O sistema MUST permitir anexar um ou mais PDFs a um **estudo** (um
  registro incluído na triagem), associando cada PDF ao estudo dentro da Revisão.
- **FR-002**: O sistema MUST armazenar os PDFs em armazenamento **escopado por
  Revisão**, de modo que um PDF de uma Revisão nunca seja acessível a partir de
  outra Revisão ou por usuário que não é membro (RLS).
- **FR-003**: O sistema MUST rejeitar arquivos que não sejam PDF ou estejam
  corrompidos com mensagem clara, sem persistir conteúdo parcial.
- **FR-004**: O sistema MUST exibir, por PDF, um **estado de processamento**
  (ex.: enfileirado, processando, concluído, falho) visível ao pesquisador.

**Pipeline de texto assíncrono e híbrido (US1 — D31/D25)**

- **FR-005**: O gatilho síncrono de upload (Edge Function) MUST apenas **validar,
  persistir no armazenamento e enfileirar**; ele MUST NOT executar o parsing
  pesado de texto inline.
- **FR-006**: A extração de texto MUST rodar como **job assíncrono** processado
  por um worker: com progresso visível, **retomável** e **resiliente a falha
  por-item** (uma falha não derruba o lote).
- **FR-007**: O sistema MUST aplicar estratégia **híbrida** por tipo de
  documento: PDF com camada de texto → **extração determinística**; PDF escaneado
  → **LLM multimodal como OCR**.
- **FR-008**: Cada camada de texto extraída MUST registrar sua **origem de
  proveniência** (`nativo` | `ocr_ia`); o grounding (FR-012) MUST referenciar a
  camada efetivamente usada e a trilha de auditoria MUST registrar qual foi.

**Formulário de extração configurável (US2 — D9)**

- **FR-009**: O sistema MUST permitir que o pesquisador monte um **formulário de
  extração** composto de **campos tipados**, no mínimo: texto, número, data,
  booleano e escolha de lista; com nome e ordenação por campo.
- **FR-010**: O sistema MUST permitir editar e remover campos do formulário,
  mantendo o formulário consistente e a mudança registrada.
- **FR-011**: Cada Revisão MUST ter **um único** formulário de extração
  (configurável por projeto, análogo à lista de motivos de exclusão do Marco 1); a
  engine de "formulário configurável" MUST ser projetada para acomodar futuramente
  risco de viés/CERQual como **instrumentos/fases distintos**, **sem** reescrever
  o núcleo (essas fases não são implementadas neste marco).

**Extração por IA: grounding e proveniência (US3 — D11/D12/D13/D22/D24)**

- **FR-012**: A IA MUST preencher os campos do formulário a partir do texto do
  PDF como **sugestões**; toda saída **factual** MUST referenciar um trecho-fonte
  (`source_span` + página).
- **FR-013**: **"Não encontrado"** MUST ser um resultado de primeira classe,
  explicitamente renderizado, nunca um erro nem um campo vazio ambíguo.
- **FR-014**: Campos **inferidos** (sem âncora direta) MUST ser marcados com
  estado de proveniência `inferido` (≠ ancorado) e MUST exigir ratificação
  humana.
- **FR-015**: A saída textual da IA MUST ser em **pt-BR**, e o **trecho-fonte**
  citado MUST ser exibido no **idioma original** do documento.
- **FR-016**: Toda sugestão de extração MUST persistir **proveniência
  obrigatória**: modelo, versão, prompt/trecho-fonte, timestamp e estado.
- **FR-017**: Toda chamada de geração por IA MUST passar pela abstração
  `LLMProvider` (herdada do Marco 1); nenhum código de feature instancia um SDK
  de fornecedor diretamente nem contorna essa camada.
- **FR-017a**: A extração por IA MUST operar sobre o **texto do documento
  diretamente** (com chunking interno para documentos longos, mecanismo decidido
  no `/plan`); ela MUST NOT depender da busca semântica/embeddings (US5) para
  localizar trechos. A recuperação semântica é capacidade **independente**, de
  modo que US3 (P1) é testável e entregável sem o stack de embeddings (US5, P2).

**Validação humana no laço (US3 — D11/D12)**

- **FR-018**: Para cada sugestão de extração, o sistema MUST permitir
  **aceitar, editar ou rejeitar**, com estados
  `pendente`/`aceita`/`editada`/`rejeitada`/`inferida` explícitos e visíveis.
- **FR-019**: A IA MUST NOT finalizar/persistir um valor como final sozinha; o
  valor final de um campo só muda por **ação humana** de ratificação.
- **FR-019a**: Quando a extração por IA é re-executada sobre um estudo que já tem
  valores validados, as novas sugestões MUST entrar como **pendentes ao lado** dos
  valores validados, **sem sobrescrevê-los**; o humano decide qual prevalece. A
  re-execução e a decisão resultante MUST constar na trilha de auditoria.
- **FR-020**: As superfícies de sugestão da extração MUST **reusar o vocabulário
  visual de IA do Marco 1** (suggestion chip, provenance popover, grounding
  highlight, accept/edit/reject, badge "inferido"), sem reinventar um sistema
  visual próprio.

**Operação em lote, custo e consumo (US4 — D25/D23)**

- **FR-021**: O sistema MUST permitir acionar a extração por IA **em lote** sobre
  uma seleção de estudos; a operação MUST rodar como **job assíncrono** (progresso
  visível, retomável, resiliente a falha por-item).
- **FR-022**: Antes de executar um lote de IA (extração ou geração de
  embeddings), o sistema MUST exibir uma **estimativa de custo/tokens** e exigir
  confirmação.
- **FR-023**: O sistema MUST acumular e exibir o **consumo de tokens/custo por
  Revisão e por fase**.

**Busca semântica / RAG (US5 — D27/D28)**

- **FR-024**: O sistema MUST permitir uma **consulta semântica** em linguagem
  natural sobre os PDFs ingeridos, retornando os **trechos mais similares**
  ancorados à **página/posição** e ao **estudo** de origem.
- **FR-025**: A busca semântica MUST ser **escopada por Revisão** (RLS): os
  resultados vêm apenas do corpus da Revisão do usuário, sem vazamento entre
  Revisões.
- **FR-026**: Os embeddings MUST ser gerados via abstração `EmbeddingProvider`
  (default **Voyage AI** hospedado), persistidos com **dimensão variável**
  definida pelo provedor e busca por similaridade por índice apropriado.
- **FR-027**: A geração de embeddings em lote MUST rodar como **job assíncrono**
  (progresso, retomável, resiliente por-item).
- **FR-028**: A chave de embeddings MUST ser uma **2ª chave BYOK**, cifrada em
  repouso e **distinta** da chave do `LLMProvider`; sem ela, a busca semântica é
  sinalizada como indisponível e o restante do produto permanece operável.

**Proveniência, auditoria e idioma (transversal)**

- **FR-029**: Toda ação que muda o estado da Revisão neste marco (anexar/remover
  PDF, processar texto, configurar formulário, aceitar/editar/rejeitar sugestão,
  reprocessar) MUST entrar na **trilha de auditoria append-only** herdada do
  Marco 1 (ator humano|IA, timestamp, antes/depois) e ser exportável.
- **FR-030**: O grounding e a proveniência exibidos neste marco MUST seguir o
  mesmo contrato do Marco 1; sugestão de IA recebe tratamento visual distinto de
  dado confirmado por humano, e os dois nunca se confundem.

### Key Entities *(include if feature involves data)*

- **PDF anexado (documento)**: arquivo guardado no armazenamento, pertencente a
  um **estudo** de uma Revisão, com estado de processamento. Um estudo pode ter
  vários PDFs.
- **Camada de texto extraída**: o texto de um PDF, ancorável por página/posição,
  com **origem de proveniência** (`nativo` | `ocr_ia`). Base do grounding e dos
  embeddings.
- **Formulário de extração (instrumento configurável)**: conjunto ordenado de
  **campos tipados**, **um por Revisão**; engine genérica reaproveitável como
  instrumentos distintos no futuro (risco de viés/CERQual).
- **Campo de extração**: definição (nome, tipo) e, quando preenchido, o valor
  final humano associado à sugestão de IA e seu estado.
- **Sugestão de IA (extração)**: saída do agente para um campo —
  `{value, source_span, página}` ou `{value: null, reason: "not_found"}` — com
  estado (`pendente`/`aceita`/`editada`/`rejeitada`/`inferida`) e proveniência
  (modelo, versão, prompt/trecho, timestamp). Reusa a entidade de sugestão do
  Marco 1.
- **Job assíncrono**: unidade de trabalho pesado (pipeline de texto, extração em
  lote, geração de embeddings) com estado, progresso, retomabilidade e
  resiliência por-item.
- **Trecho/embedding**: chunk de texto ancorado (página/posição) associado a um
  vetor de **dimensão variável** (definida pelo provedor), persistido para busca
  por similaridade.
- **Chave BYOK de embeddings**: 2ª chave de provedor de IA, cifrada e distinta da
  chave do LLM.
- **Consumo de IA**: contabilidade de tokens/custo acumulada por Revisão e por
  fase, com estimativa prévia para lotes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um estudo com PDF anexado tem seu texto extraído e fica pronto para
  extração por IA **sem nenhuma intervenção manual no parsing** — o pesquisador só
  anexa e acompanha o progresso.
- **SC-002**: PDFs escaneados (sem camada de texto) também ficam com texto
  extraído (via OCR), e a origem de cada camada (`nativo`/`ocr_ia`) é distinguível
  em 100% das camadas.
- **SC-003**: 100% das saídas factuais da IA exibem trecho-fonte (página + span)
  **ou** "não encontrado" explícito; 0% de campos preenchidos por inferência sem
  âncora e sem a marca `inferido`.
- **SC-004**: Nenhum valor extraído é tratado como final sem ratificação humana
  (0 finalizações automáticas pela IA).
- **SC-005**: 100% das sugestões de IA exibem proveniência completa (modelo,
  versão, prompt/trecho, timestamp, estado).
- **SC-006**: Antes de qualquer lote de IA (extração ou embeddings), o
  pesquisador vê uma estimativa de custo/tokens; o consumo acumulado fica
  disponível por Revisão/fase em 100% dos casos.
- **SC-007**: Um job de pipeline/extração/embeddings interrompido é **retomável**
  e uma falha por-item **não derruba** o lote (verificável injetando uma falha em
  um item).
- **SC-008**: A busca semântica retorna trechos ancorados (página/posição e
  estudo) e é escopada à Revisão — **0 vazamentos** entre Revisões/usuários em
  testes de isolamento.
- **SC-009**: O vocabulário visual de IA do Marco 1 é **reusado** na extração
  (zero novos sistemas visuais de sugestão/proveniência/grounding criados).
- **SC-010**: A UI e as saídas geradas pela IA aparecem em **pt-BR**, com o
  trecho-fonte citado no idioma original do documento.
- **SC-011**: Um PDF de uma Revisão **nunca** é acessível a partir de outra
  Revisão (0 vazamentos no armazenamento em testes de isolamento).
- **SC-012**: O gatilho síncrono de upload nunca executa parsing pesado inline —
  100% do trabalho pesado de texto ocorre no worker assíncrono.
- **SC-013**: O pipeline de texto, a extração em lote e a geração de embeddings
  processam um corpus da ordem de **~500 PDFs por Revisão** (dezenas de páginas
  cada) de forma assíncrona, retomável e resiliente por-item, sem bloquear a
  interface — verificável como gate de performance dos testes.

## Assumptions

- **Construção sobre o Marco 1**: auth, RLS, modelo de Revisão/Membro, corpus
  triado, trilha de auditoria, vocabulário visual de IA e a abstração
  `LLMProvider`/BYOK (1ª chave) já existem e são reaproveitados; este marco não os
  refaz.
- **PDFs anexam a estudos**: o alvo do anexo de PDF é um **estudo** (registro que
  passou na triagem do Marco 1), conforme o input. Anexar PDFs a registros ainda
  não triados está fora de escopo deste marco.
- **Detecção de tipo de PDF**: a distinção entre PDF com camada de texto e PDF
  escaneado é feita automaticamente pelo pipeline; o mecanismo concreto e a
  biblioteca de extração são decisão do `/plan`, validados contra PDFs reais do
  corpus-alvo (D31).
- **Sem visualizador de PDF lado-a-lado**: o "grounding highlight" reusa o
  vocabulário do Marco 1 exibindo o **trecho-fonte citado + página**; ele **não**
  renderiza um overlay sobre uma página de PDF (o visualizador lado-a-lado é v1.1,
  fora deste marco).
- **Formulário por Revisão**: o formulário de extração é configurável por projeto
  (Revisão), análogo à lista de motivos de exclusão do Marco 1; a curadoria fina
  de campos default é detalhe de implementação.
- **Mecanismo de job assíncrono e do worker**: o mecanismo concreto (fila, worker,
  storage de estado) é decisão do `/plan` (D25/D31), respeitando o invariante de
  que a Edge Function só enfileira.
- **EmbeddingProvider e dimensão do vetor**: default Voyage AI hospedado; o schema
  acomoda dimensão variável; modelo local in-process fica plugável como
  alternativa **futura** (não implementado aqui). A busca semântica (US5) é
  **independente** da extração (US3): a extração não consome embeddings.
- **Escala do corpus de PDFs**: o alvo de dimensionamento é **~500 PDFs por
  Revisão** (dezenas de páginas cada), fração dos ~5.000 registros do Marco 1
  incluída como estudos após o texto completo. O limite concreto de tamanho/página
  por arquivo é decisão do `/plan`.
- **Estimativa de custo é aproximada**: a estimativa prévia de tokens/custo é uma
  aproximação; a contabilidade acumulada reflete o consumo real.
- **Chave BYOK ausente**: sem a 1ª chave (LLM) a extração roda manualmente; sem a
  2ª chave (embeddings) a busca semântica fica indisponível; em ambos os casos o
  restante do produto permanece operável.

## Out of Scope (Marco 2)

- Síntese qualitativa/narrativa, tabelas-resumo, rascunho de relatório, fluxograma
  PRISMA renderizado e exportações (DOCX/PDF/MD) e de referências (BibTeX/RIS) →
  **Marco 3**. O Marco 2 mantém o grounding/proveniência por estudo, mas não gera
  os entregáveis de saída.
- Fases opcionais **Risco de Viés** e **Certeza/CERQual** → depois do núcleo. A
  engine de formulário configurável é projetada para acomodá-las, mas elas **não**
  são implementadas neste marco.
- **Visualizador de PDF lado-a-lado** → v1.1.
- Integração via API com bases bibliográficas; colaboração multi-revisor
  operacional (convites, cegamento, kappa, fila de conflitos) → diferidos
  (modelados no schema, não operacionais na v1).
- Meta-análise quantitativa; grafos/nuvens de palavras; embeddings locais como
  default; LaTeX e estilos CSL além de APA 7 → futuro.
- **Não reabrir** decisões D nem princípios da constitution; **não refatorar**
  código do Marco 1 exceto onde uma tarefa de implementação o exigir
  explicitamente e com justificativa.
