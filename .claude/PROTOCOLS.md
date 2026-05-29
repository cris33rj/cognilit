# Air-Gap Handoff Protocols

Este arquivo é a regra do jogo para todo trabalho feito via Claude Code
neste repositório. Toda sessão deve lê-lo no início. Ele descreve:

1. Os perfis de sessão e quando usar cada um
2. Os artefatos obrigatórios e seu formato
3. Os protocolos de entrada e saída de cada sessão
4. O protocolo de retorno (blockers)
5. Como gerar o `HANDOFF.md` de marcos futuros

---

## Mudança de arquitetura (2026-05-24)

Este protocolo foi originalmente desenhado para **três sessões**
(grill-me + spec-kit → GSD → Superpowers). Ele foi reduzido para
**duas sessões**. As razões, registradas para que a decisão não seja
reaberta sem motivo:

- **GSD foi descontinuado.** O projeto que era `gsd-build/get-shit-done`
  continua como **GSD Redux** em outro repositório, com sintaxe de
  comando diferente. Os comandos que este protocolo usava deixaram de
  existir com a mesma assinatura.
- **GSD e Superpowers faziam a mesma fase.** A antiga Sessão B (GSD:
  decompor em tasks atômicas) e a antiga Sessão C (Superpowers: executar
  com TDD) são, do ponto de vista do Superpowers, **um único fluxo**: a
  skill `writing-plans` produz o plano de tarefas e o motor de execução
  o executa. Manter dois plugins de spec-driven concorrentes era custo
  sem retorno.
- **Decisão:** o Superpowers absorve planejamento **e** execução. O
  Spec Kit permanece dono da Sessão A (é oficial, mantido pelo GitHub).

### As três decisões desta arquitetura (NÃO reabrir sem registro)

1. **Consolidação.** Planejamento e execução de programação pertencem a
   **uma única sessão** (Sessão B), conduzida pelo **Superpowers**.
   Nenhuma fase é delegada a outro plugin. GSD foi removido do fluxo.

2. **Execução fatiada — fatiação decidida pelo `brainstorming`.** O
   Superpowers v5 **não** tem mais um modo nativo de execução "em
   batches": no v5.0.0 o `executing-plans` deixou de fatiar e o
   `subagent-driven-development` passou a ser obrigatório em harnesses
   com subagente (Claude Code). Logo, o controle por pedaços **não** vem
   de um modo do plugin — vem da **fatiação do Marco em sub-projetos**.
   A skill `brainstorming` decide as fronteiras das fatias (ela já faz
   scope decomposition de pedidos multi-subsistema), dentro do perímetro
   de restrições que o `HANDOFF.md` impõe. Cada fatia roda seu próprio
   ciclo `writing-plans` → `subagent-driven-development`. O motor de
   execução é o `subagent-driven-development`; o `executing-plans` é
   apenas fallback para harnesses sem subagente e não se aplica aqui.

3. **Commit em branch isolado, parada obrigatória por fatia, merge
   manual.** O Superpowers commita (é parte do ciclo TDD), mas
   **somente em um branch de trabalho isolado por fatia**, nunca em
   `main` nem na branch da feature. **Ao fim de CADA fatia a Sessão B
   PARA**: apresenta o branch ao desenvolvedor e aguarda. O
   desenvolvedor revisa e faz o `merge` para a branch da feature.
   **Nenhuma fatia seguinte começa antes do merge da anterior.** A
   sessão **nunca** faz `merge` nem `push` para `main`/branch da
   feature — o merge é operação exclusiva do desenvolvedor.

> **Sobre a decisão 3 e o v5:** o `subagent-driven-development` do v5,
> por padrão, executa de forma contínua e só para em blocker. A parada
> obrigatória por fatia é imposta pelo `CLAUDE.md`, que tem **prioridade
> sobre as skills** na hierarquia do Superpowers (instruções do usuário
>
> > skills > system prompt). A instrução do `CLAUDE.md` vence a
> > diretiva de execução contínua da skill. Ver `CLAUDE.md` §"CONTRATO DE
> > ENTRADA DA SESSÃO B".

---

## Princípio fundamental

O handoff entre sessões só pode ser feito por **arquivo em disco**.
Cada sessão começa cega. Se uma decisão importante não está escrita
antes do `/exit`, ela vai sumir.

Consolidar duas sessões em uma **não elimina o air-gap** — apenas o
desloca. A Sessão B continua começando cega (é um processo Claude Code
novo, contexto zerado) e continua dependendo do `HANDOFF.md` como
contrato de entrada.

### Um handoff por feature — nada é sobrescrito

O `HANDOFF.md` **não** vive na raiz do repo e **não** é sobrescrito a
cada marco. Cada marco é uma feature, e o handoff é um artefato **dessa
feature**: ele mora em `specs/NNN-<slug>/HANDOFF.md`, ao lado da
`spec.md` e do `plan.md` daquela feature.

Consequências:

- O handoff do Marco 1 (`specs/001-.../HANDOFF.md`) permanece para
  sempre. A Sessão A do Marco 2 escreve um **novo**
  (`specs/002-.../HANDOFF.md`), sem tocar no anterior.
- Não há perda de histórico de intenção: o `COMPLETION.md` de um marco
  registra o _resultado_; o `HANDOFF.md` registra a _intenção_ e as
  _ambiguidades resolvidas_. Ambos persistem, lado a lado da spec.
- Qual feature está **ativa** é dito por um único ponteiro: o bloco
  `<!-- SPECKIT -->` no `CLAUDE.md`, que nomeia a feature ativa.
  `spec.md`, `plan.md`, contratos e `HANDOFF.md` são todos derivados
  desse ponteiro.

---

## Versões de ferramentas (pinned)

Este protocolo depende de comandos e skills específicos de duas
ferramentas. Apenas o Spec Kit é mantido pelo GitHub; **Superpowers é
plugin de terceiros** — tratado como dependência externa, pode mudar
sem aviso.

| Ferramenta   | Versão testada | Comandos/skills usados por este protocolo                                                                                                                               |
| ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec Kit CLI | `0.8.13`       | `/speckit.constitution`, `/speckit.specify`, `/speckit.clarify`, `/speckit.plan`, `/speckit.analyze`                                                                    |
| Superpowers  | `5.1.0`        | skills `using-superpowers`, `brainstorming`, `writing-plans`, `using-git-worktrees`, `subagent-driven-development`, `test-driven-development`, `requesting-code-review` |

**Notas de versão relevantes para este protocolo (Superpowers v5):**

- Os slash commands legados (`/brainstorm`, `/write-plan`,
  `/execute-plan`) **foram removidos no v5.1.0**. As skills são
  invocadas por nome (`superpowers:brainstorming`, etc.) ou disparam
  automaticamente a partir da intenção. Este protocolo **não usa slash
  commands do Superpowers**.
- `executing-plans` deixou de fatiar (v5.0.0) e é fallback para
  harnesses sem subagente. Em Claude Code o motor é
  `subagent-driven-development`.
- `subagent-driven-development` executa de forma contínua; a parada por
  fatia deste protocolo é imposta pelo `CLAUDE.md`.

**Antes da Sessão A**, confirmar que as versões instaladas batem com
esta tabela (`specify --version`; Superpowers via `/plugin`). Se
divergirem, validar que as skills acima ainda existem com o mesmo nome
e comportamento **antes** de iniciar a feature — uma divergência
descoberta no meio de uma sessão cega é um blocker caro.

---

## Perfis de sessão

| Perfil                | Plugins ativos      | Quando usar                                       |
| --------------------- | ------------------- | ------------------------------------------------- |
| `session-a-discovery` | grill-me + spec-kit | Início de feature: descoberta, spec, plan         |
| `session-b-build`     | Superpowers         | Fatiação + planejamento + execução de programação |

Troca de perfil **sempre** via:

```bash
./.claude/scripts/activate-profile.sh <profile-name>
```

seguido obrigatoriamente de `/exit` da sessão atual e nova invocação do `claude`.

> **Migração:** o perfil `session-c-superpowers` foi renomeado para
> `session-b-build` e o antigo `session-b-gsd` foi removido. Atualizar
> `./.claude/scripts/activate-profile.sh` de acordo.

---

## Artefatos obrigatórios

Localização canônica e formato. Não improvise nomes ou caminhos.
`NNN-<slug>` é a feature ativa apontada no bloco `<!-- SPECKIT -->` do
`CLAUDE.md`.

| Arquivo                                         | Quem produz                                   | Quem consome                                |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| `docs/CONTEXT.md`                               | Sessão A (grill-me)                           | A, B — referência permanente                |
| `.specify/memory/constitution.md`               | Sessão A (`/speckit.constitution`)            | A, B — referência permanente                |
| `specs/NNN-<slug>/spec.md`                      | Sessão A (`/speckit.specify`)                 | B                                           |
| `specs/NNN-<slug>/plan.md`                      | Sessão A (`/speckit.plan`)                    | B                                           |
| `specs/NNN-<slug>/HANDOFF.md`                   | Sessão A (Claude escreve manualmente)         | B                                           |
| `specs/NNN-<slug>/.superpowers/codebase-map.md` | Sessão B (mapeamento inicial)                 | B — referência durante o build              |
| `specs/NNN-<slug>/.superpowers/slicing.md`      | Sessão B (`brainstorming`, aprovado pelo dev) | B — guia de fatias; sobrevive a interrupção |
| `specs/NNN-<slug>/IMPLEMENTATION_PLAN.md`       | Sessão B (`writing-plans`, por fatia)         | B (revisão humana antes de cada fatia)      |
| `specs/NNN-<slug>/.superpowers/COMPLETION.md`   | Sessão B (Claude escreve manualmente)         | Human review; Sessão A de marcos futuros    |
| `specs/NNN-<slug>/.superpowers/BLOCKERS.md`     | Sessão B (sob demanda)                        | Sessão B no retorno / Sessão A              |

> **Regra de caminhos:** todo artefato de uma feature vive **dentro** de
> `specs/NNN-<slug>/`. A raiz do repo não acumula `HANDOFF.md`,
> `COMPLETION.md` ou `BLOCKERS.md` soltos. Os únicos artefatos de
> referência permanente fora de `specs/` são `docs/CONTEXT.md` e
> `.specify/memory/constitution.md`.

---

## Sessão A — Discovery + Spec

### Protocolo de entrada

Nenhum artefato prévio é exigido para o **primeiro marco**. Para marcos
seguintes, ver a seção "Marcos subsequentes" no fim deste arquivo.

### Trabalho a fazer

1. Invocar grill-me skill para alinhamento (mínimo 20 perguntas; não pular).
2. Escrever/atualizar `docs/CONTEXT.md` com glossário, decisões e casos de uso.
3. Rodar `/speckit.constitution` para gerar/atualizar
   `.specify/memory/constitution.md`. Destilar os invariantes não-negociáveis
   a partir do `docs/CONTEXT.md` (cada princípio rastreia para uma decisão D
   assinada; não inventar princípios genéricos).
4. Rodar `/speckit.specify` para gerar `specs/NNN-<slug>/spec.md`.
5. (Opcional, recomendado) Rodar `/speckit.clarify` para o agente caçar
   ambiguidades na spec antes do plano.
6. Rodar `/speckit.plan` para gerar `specs/NNN-<slug>/plan.md`.
7. Rodar `/speckit.analyze` para checar consistência entre
   `constitution.md`, `spec.md` e `plan.md`. Qualquer divergência
   apontada deve ser resolvida **antes** do `HANDOFF.md` — um handoff
   não sai com análise pendente.
8. **NÃO** rodar `/speckit.tasks`. A decomposição em tarefas é trabalho
   da Sessão B, feita pela skill `writing-plans` do Superpowers.
9. Atualizar o bloco `<!-- SPECKIT -->` do `CLAUDE.md` para apontar a
   nova feature ativa (`NNN-<slug>`).

### Protocolo de saída (obrigatório antes de `/exit`)

Escrever `specs/NNN-<slug>/HANDOFF.md`. A estrutura canônica está na
seção **"Estrutura do HANDOFF.md"** no fim deste arquivo — segui-la à
risca, porque o `HANDOFF.md` é o **contrato de entrada** da Sessão B.

Em seguida: `/exit`.

---

## Sessão B — Build (fatiação + planejamento + execução com Superpowers)

A Sessão B é a antiga Sessão B (GSD) + Sessão C (Superpowers) fundidas.
Ela fatia, planeja **e** executa, numa única sessão conduzida pelo
Superpowers.

### Protocolo de entrada — o contrato

A Sessão B começa cega. O carregamento do `CLAUDE.md` é a **única**
peça de contexto com garantia de carregamento automático; tudo o mais
depende de o Claude obedecer à instrução de ler. Por isso o protocolo
de entrada é, nesta ordem:

1. O `CLAUDE.md` (carregado automaticamente) identifica a feature ativa
   pelo bloco `<!-- SPECKIT -->` e instrui a leitura, **nesta ordem**,
   de:
   1. `specs/NNN-<slug>/HANDOFF.md` (carta de instruções / contrato da feature)
   2. `docs/CONTEXT.md`
   3. `.specify/memory/constitution.md`
   4. `specs/NNN-<slug>/spec.md`
   5. `specs/NNN-<slug>/plan.md`
   6. os contratos em `specs/NNN-<slug>/contracts/` (se houver)
2. **Confirmação obrigatória.** Antes de prosseguir para qualquer
   skill, o Claude **confirma ao usuário, em uma a três frases**, o que
   entendeu do `HANDOFF.md`: qual feature, qual marco, o que a Sessão A
   completou, e o que esta sessão deve fazer. Se algo não bate, **para
   e pergunta**. Essa confirmação é o que torna o contrato verificável
   em vez de presumido — não é opcional, não é cerimônia.
3. **Redirecionamento do `brainstorming`.** O design de produto **já foi
   feito** na Sessão A. O `CONTEXT.md`, `constitution.md` e `spec.md`
   são canônicos e estão sign-off. O `brainstorming`, nesta sessão,
   **não** re-elicita requisitos de produto. Ele tem dois trabalhos, e
   só dois: (a) esclarecer as **ambiguidades de implementação** listadas
   no `HANDOFF.md` (itens A1, A2, …); (b) **decidir a fatiação** do
   Marco em sub-projetos, dentro do perímetro de restrições do
   `HANDOFF.md`. Não há discovery nesta sessão.

### Sequência de skills do Superpowers (v5.1.0 — sem slash commands)

As skills são invocadas por nome (`superpowers:<skill>`) ou disparam a
partir da intenção descrita. **Não há slash commands** (`/brainstorm`
etc. foram removidos no v5.1.0). A sequência da Sessão B:

1. `using-superpowers` — bootstrap; já vem no contexto da sessão.
2. **Mapeamento da base de código** — gerar
   `specs/NNN-<slug>/.superpowers/codebase-map.md`. PRIMEIRO trabalho.
   Greenfield no Marco 1; para marcos ≥ 2, é o que ancora o plano no
   estado real e **impede re-execução** de trabalho herdado.
3. `brainstorming` — esclarece os itens A\* **e** decide a **fatiação**
   (ver "Fatiação" abaixo). Termina escrevendo
   `specs/NNN-<slug>/.superpowers/slicing.md` e **para para aprovação
   do usuário** (CHECKPOINT 1).
4. Para **cada fatia**, na ordem definida em `slicing.md`:
   a. `writing-plans` — produz/estende o `IMPLEMENTATION_PLAN.md` com
   as tarefas **daquela fatia** (CHECKPOINT 2 — usuário aprova o
   plano da fatia antes de qualquer código).
   b. `using-git-worktrees` — cria o branch/worktree isolado da fatia.
   No v5.1.0 esta skill **pede consentimento** antes de criar
   worktree; conceder.
   c. `subagent-driven-development` — executa as tarefas da fatia, com
   `test-driven-development` (RED-GREEN-REFACTOR) e
   `requesting-code-review` entre tarefas.
   d. Ao fim da fatia, **PARAR** (CHECKPOINT 3) — ver "Parada
   obrigatória por fatia".
   e. Só após o desenvolvedor mergear, ir para a próxima fatia.
5. Após a última fatia: escrever `COMPLETION.md` e `/exit`.

### Fatiação (decidida pelo `brainstorming`, dentro de um perímetro)

O `brainstorming` **decide as fronteiras** das fatias. O `HANDOFF.md`
**não** lista fatias — ele impõe o perímetro que qualquer fatiação
válida respeita. O perímetro mínimo (o `HANDOFF.md` pode acrescentar):

- **Fatiar é obrigatório.** O Marco é multi-subsistema; não deve virar
  um plano único. Se o `brainstorming` concluir que "cabe num spec só",
  isso é um desvio do protocolo — parar e consultar o usuário.
- **Respeitar dependências de schema.** A ordem das fatias respeita o
  `data-model.md`: migrations/schema antes do código que os consome.
- **Cada fatia é entregável e testável de ponta a ponta.** Uma fatia
  fecha com testes verdes, lint e type-check limpos. "Meia migration"
  não é fatia.
- **Apresentar a fatiação ao usuário antes de planejar** (CHECKPOINT 1).
  Nenhum `writing-plans` roda antes de o usuário aprovar a fatiação.

O `brainstorming` registra a fatiação aprovada em
`specs/NNN-<slug>/.superpowers/slicing.md`: lista ordenada de fatias,
cada uma com nome, escopo (o que entra / o que não entra), dependências,
e os itens A\* que ela endereça. Esse arquivo persiste — se a Sessão B
for interrompida e retomada, a fatiação aprovada não se perde.

### Gate de cobertura (antes de executar a 1ª fatia)

Depois de `slicing.md` aprovado e antes de executar, confirmar,
listando explicitamente:

- toda user story do `spec.md` está coberta por alguma fatia;
- a união das fatias cobre o Marco inteiro — nada do `spec.md` fica de
  fora, nada é duplicado entre fatias;
- a ordem das fatias respeita as dependências de schema;
- cada item A\* do `HANDOFF.md` está atribuído a uma fatia;
- nenhuma fatia introduz tecnologia/decisão ausente do `plan.md`.

Divergência aqui = parar e revisar com o usuário.

### Execução de cada fatia

Para a fatia corrente:

1. `writing-plans` produz as tarefas da fatia no `IMPLEMENTATION_PLAN.md`
   — tarefas pequenas (2–5 min), cada uma com caminhos de arquivo
   exatos, passos de verificação e critério de aceite. **Usuário aprova
   o plano da fatia** (CHECKPOINT 2).
2. `using-git-worktrees` cria o branch de trabalho isolado da fatia:
   `build/NNN-<slug>/<n>-<slug-da-fatia>` (a partir da branch da
   feature). Conceder consentimento quando a skill pedir.
3. `subagent-driven-development` executa as tarefas. Cada tarefa sob
   `test-driven-development` (RED → GREEN → REFACTOR).
   `requesting-code-review` revisa entre tarefas; problema crítico
   bloqueia.
4. O Superpowers commita no branch da fatia como parte do ciclo TDD
   (um commit por tarefa, mensagem `<tipo>: <resumo>`). A sessão
   **nunca** faz `merge` nem `push` para a branch da feature ou `main`.

### Parada obrigatória por fatia (CHECKPOINT 3)

Ao fim de **cada** fatia — sem exceção, mesmo que tudo tenha passado —
a Sessão B **PARA** e apresenta ao desenvolvedor:

- o branch da fatia e seus commits;
- o diff acumulado da fatia;
- resultado de testes da fatia (`vitest run <paths da fatia>`);
- resultado de `npm run lint` e `tsc --noEmit`.

A sessão **aguarda**. O desenvolvedor revisa o branch e faz o `merge`
manualmente para a branch da feature. **Nenhuma fatia seguinte começa
antes** de o desenvolvedor confirmar que mergeou. Confirmado o merge, a
sessão marca a fatia como concluída em `slicing.md` e
`IMPLEMENTATION_PLAN.md` e parte para a próxima.

A regra é absoluta: uma fatia por vez, merge entre cada uma. A Sessão B
não encadeia fatias.

### Restrições TS/JS específicas

- Lint (`npm run lint`) e type-check (`tsc --noEmit`) devem passar
  **antes de apresentar a fatia ao desenvolvedor**.
- Testes: rodar as suítes tocadas pela fatia; rodar a suíte completa na
  última fatia.
- Não atualizar dependências (`package.json`) sem tarefa explícita no
  `IMPLEMENTATION_PLAN.md` para isso.
- Tarefas de migration/schema DB precedem tarefas que usam o schema.
- Tarefas de componentes React listam seus arquivos de teste
  (`*.test.tsx`) e, se houver Storybook, os `*.stories.tsx`.

### Protocolo de saída (após a última fatia)

Escrever `specs/NNN-<slug>/.superpowers/COMPLETION.md`:

```markdown
# Feature complete: <slug>

## Summary

<N> fatias, <M> tarefas concluídas. Resumo do que foi construído em
3-5 linhas.

## Fatias

(Da slicing.md.)

- Fatia 1 — <nome> — branch build/NNN-<slug>/1-<slug> — mergeada em <ref>
- Fatia 2 — <nome> — branch build/NNN-<slug>/2-<slug> — mergeada em <ref>
- ...

## Deviations from IMPLEMENTATION_PLAN.md

- T-NNN: <o que mudou> — <justificativa>
  (ou: "None.")

## Follow-up suggested (from CONTEXT.md deferred list)

- <item 1>

## Verification report

- Unit tests: <N> added, all pass
- Integration tests: <N> added, all pass
- E2E tests (if any): <N> added, all pass
- Lint: clean
- Type-check: clean
- Manual smoke: <resultado>
- Merges: feitos pelo desenvolvedor após revisão de cada fatia
  (a sessão não fez merge); <N> fatias mergeadas.

## Ready for review: YES | NO
```

Em seguida: `/exit`.

> O `COMPLETION.md` permanece em `specs/NNN-<slug>/.superpowers/` para
> sempre. É a fonte que a Sessão A de um marco futuro usa para preencher
> a seção "Estado dos marcos anteriores" do próximo `HANDOFF.md`.

---

## Protocolo de retorno — Blockers

Se durante a Sessão B uma tarefa **não pode ser completada** (decisão
arquitetural faltando, dependência inesperada, premissa quebrada,
ambiguidade no `IMPLEMENTATION_PLAN.md` ou no `spec.md`):

### Passos

1. **Sessão B escreve `specs/NNN-<slug>/.superpowers/BLOCKERS.md`** com
   o template abaixo.
2. **Sessão B decide o destino do trabalho parcial** antes do `/exit`:
   - O trabalho parcial já está no branch de trabalho isolado da fatia
     (`build/NNN-<slug>/<n>-<slug>`) — ele **não** contamina a branch
     da feature nem `main`, porque a sessão nunca mergeia. O
     `BLOCKERS.md` registra em qual branch o trabalho parcial está e seu
     estado (testes passando/falhando, tarefa incompleta).
   - Em nenhum caso a branch da feature ou `main` recebem trabalho
     parcial.
3. **Sessão B faz `/exit`** sem marcar a tarefa/fatia como completa.
4. **Resolução do blocker — dois caminhos:**
   - **Ambiguidade de implementação** (cabe dentro do plano): reabrir a
     própria Sessão B (`session-b-build`), ler o `BLOCKERS.md` +
     `slicing.md` + `IMPLEMENTATION_PLAN.md` + `HANDOFF.md` +
     `CONTEXT.md` da feature, revisar o plano da fatia (ajustar tarefas,
     adicionar dependências, criar tarefa nova) e retomar.
   - **Defeito de spec/plan** (exige mudar `spec.md` ou `plan.md`):
     trocar para `session-a-discovery`, corrigir o artefato via Spec
     Kit, regenerar o `HANDOFF.md` da feature, e só então voltar à
     Sessão B.
5. Quem resolveu escreve, no fim do `BLOCKERS.md`:
   `## Resolved at: <timestamp>` + resumo da resolução.

### Template de `BLOCKERS.md`

```markdown
# Blocker — T-NNN (fatia <n> — <nome da fatia>)

## Opened at

<ISO 8601 UTC>

## Task affected

T-NNN: <título da task> — fatia <n>

## What was attempted

<descrição do que a Sessão B tentou fazer, em 3-7 linhas>

## What blocked

<descrição precisa do obstáculo: decisão faltando, premissa quebrada, etc.>

## Blocker class

[ ] Ambiguidade de implementação (resolve em session-b-build)
[ ] Defeito de spec/plan (exige session-a-discovery)

## Information needed to unblock

- <pergunta concreta 1>
- <pergunta concreta 2>

## Partial work location

- Branch: build/NNN-<slug>/<n>-<slug-da-fatia>
- Estado: <testes passando | testes falhando | tarefa incompleta>
- (A branch da feature e main NÃO foram tocadas.)

## Suggested resolution paths

1. <opção A>
2. <opção B>

---

## Resolved at

<preenchido no retorno>

## Resolution summary

<o que foi decidido, qual tarefa/artefato foi alterado>
```

---

## Marcos subsequentes (Marco 2, Marco 3, …)

Cada marco é uma **feature nova e isolada**. O Spec Kit gera um novo
diretório `specs/NNN-<slug>/` por marco; a `constitution.md` e o
`docs/CONTEXT.md` são **referência permanente compartilhada** e não são
recriados por marco (apenas emendados, se uma nova decisão D exigir).

O `HANDOFF.md` de cada marco vive **dentro** do diretório da sua
feature (`specs/NNN-<slug>/HANDOFF.md`) e **nunca sobrescreve** o de
outro marco. O handoff do Marco 1 permanece em
`specs/001-marco1-nucleo-fluxo/HANDOFF.md` para sempre.

### Por que não há re-execução de trabalho já feito

A garantia de que a Sessão B do Marco 2 **não reconstrói** o que o
Marco 1 já entregou vem de duas fontes, nesta ordem de confiança:

1. **Estado real do código** (fonte mais confiável). O mapeamento da
   base de código (`codebase-map.md`) é refeito a cada marco. Ele
   constata o que já existe no repositório. O `brainstorming` fatia e o
   `writing-plans` planeja **a partir desse estado real**, não do zero.
2. **Contrato explícito no `HANDOFF.md`** (reforço). O `HANDOFF.md` de
   um marco ≥ 2 declara que os marcos anteriores estão completos e
   mergeados, e instrui a sessão a construir **apenas** o que a nova
   spec adiciona.

### Diretivas para a Sessão A gerar o `HANDOFF.md` de marcos ≥ 2

Ao gerar o `specs/NNN-<slug>/HANDOFF.md` de um marco que **não** é o
primeiro, a Sessão A deve, além da estrutura canônica abaixo, incluir
obrigatoriamente:

1. **Seção `## Estado dos marcos anteriores`** — lista cada marco já
   concluído, sua branch/ref de merge, e uma linha do que ele entregou.
   Fonte: o `COMPLETION.md` de cada marco anterior (esses arquivos
   persistem; não foram sobrescritos).
2. **Diretiva de não-regressão** dentro de `## DO NOT` — texto literal:
   _"Os Marcos 1..N-1 estão completos e mergeados em `main`. NÃO
   reconstruir, NÃO refatorar e NÃO modificar código existente exceto
   onde uma tarefa do `IMPLEMENTATION_PLAN.md` desta feature o exigir
   explicitamente e com justificativa. Construir apenas o que o
   `spec.md` desta feature adiciona."_
3. **Mapeamento como primeiro passo** dentro de `## Next session needs`
   — o mapeamento da base de código deve ser o **primeiro** trabalho da
   Sessão B, antes do `brainstorming`, para ancorar a fatiação no estado
   real e herdado.
4. **Perímetro de fatiação** dentro de `## Perímetro de fatiação` — as
   restrições que o `brainstorming` do novo marco respeita ao fatiar
   (ver a seção de mesmo nome na estrutura abaixo).
5. **Reafirmação das três decisões de arquitetura** — apontar para a
   seção "As três decisões desta arquitetura" deste arquivo, para que a
   Sessão B do novo marco replique o mesmo regime (consolidação no
   Superpowers; execução fatiada com fatiação pelo `brainstorming`;
   commit em branch isolado por fatia + parada obrigatória + merge
   manual). Isto **replica automaticamente o ajuste** feito em
   2026-05-24 para todos os marcos futuros, sem reescrita manual.

> **Resumo da regra:** o `PROTOCOLS.md` é estável e vale para todos os
> marcos. O que muda por marco é o `HANDOFF.md` — gerado pela Sessão A,
> dentro de `specs/NNN-<slug>/`, seguindo as cinco diretivas acima. A
> Sessão A não inventa um protocolo novo a cada marco — ela instancia
> este. Nada de marco anterior é sobrescrito.

---

## Estrutura do HANDOFF.md

O `HANDOFF.md` é o **contrato de entrada** da Sessão B. A Sessão A o
escreve manualmente em `specs/NNN-<slug>/HANDOFF.md` antes do `/exit`.
Estrutura canônica:

```markdown
# Handoff A → B — <Marco N> — <nome da feature>

## Generated by

Session A (grill-me + spec-kit)

## Timestamp

<ISO 8601 UTC>

## Marco

Marco N de M. <uma linha sobre o objetivo deste marco>

## Stage complete

- [x] Discovery (grill-me) — docs/CONTEXT.md
- [x] Constitution (.specify/memory/constitution.md)
- [x] Specification (specs/NNN-<slug>/spec.md)
- [x] Planning (specs/NNN-<slug>/plan.md)
- [x] Consistency check (/speckit.analyze)
- [ ] Build (fatiação + plan + execução) ← Session B does this

## Files produced

(Abrir cada arquivo e registrar a âncora verificável — não estimar.)

- docs/CONTEXT.md — <N> linhas, decisões até D<NN>
- .specify/memory/constitution.md — <N> princípios, versão <X.Y.Z>
- specs/NNN-<slug>/spec.md — <N> user stories, última US-<NNN>
- specs/NNN-<slug>/plan.md — stack: <resumo>
- (contratos, research, data-model, etc., se houver)

## Estado dos marcos anteriores

(OBRIGATÓRIO para Marco ≥ 2; "N/A — primeiro marco" para o Marco 1.)
(Fonte: o COMPLETION.md de cada marco anterior.)

- Marco 1 — <slug> — mergeado em main (<ref>). Entregou: <uma linha>.

## Itens a endereçar na Sessão B

(Saídos do /speckit.analyze. Cada item A\* tem contexto suficiente para
virar tarefa/decisão. Nenhum CRITICAL deve sobrar aqui.)

### A1 — <título> (<severidade>, <tipo>)

- Onde: ...
- Lacuna/Conflito: ...
- Decisão a tomar / Tarefa esperada: ...
- Princípio em jogo: ...

(A2, A3, … conforme necessário)

## Perímetro de fatiação

O `brainstorming` da Sessão B decide as fronteiras das fatias. Esta
seção NÃO lista fatias — define as restrições que a fatiação respeita:

- Fatiar é obrigatório (Marco multi-subsistema; não vira plano único).
- A ordem das fatias respeita as dependências de schema do data-model.
- Cada fatia é entregável e testável de ponta a ponta.
- A união das fatias cobre o spec.md inteiro; sem sobreposição.
- Cada item A\* acima é atribuído a uma fatia.
- A fatiação é apresentada ao usuário para aprovação (CHECKPOINT 1)
  antes de qualquer writing-plans; é registrada em
  specs/NNN-<slug>/.superpowers/slicing.md.
- (Marco ≥ 2) Nenhuma fatia toca código de marcos anteriores exceto
  onde explicitamente exigido.
- <restrições adicionais específicas deste marco, se houver>

## Decisões já travadas (NÃO reabrir)

- D1–D<NN> (decisões de Discovery)
- Os <N> princípios da constitution
- <decisões de stack/clarify relevantes>

## Next session needs

1. Activate session-b-build profile:
   `./.claude/scripts/activate-profile.sh session-b-build`
2. `/exit` desta sessão e abrir nova com `claude`
3. O CLAUDE.md identifica a feature ativa e instrui a leitura ordenada
   dos artefatos. Ao terminar, CONFIRMAR em 1-3 frases o entendimento
   do handoff (se algo não bate, parar e perguntar).
4. Mapear a base de código → specs/NNN-<slug>/.superpowers/codebase-map.md.
5. `brainstorming` — esclarecer os itens A\* e DECIDIR A FATIAÇÃO dentro
   do perímetro acima; escrever slicing.md; PARAR para aprovação do
   usuário (CHECKPOINT 1).
6. Rodar o gate de cobertura (ver PROTOCOLS.md, Sessão B).
7. Para cada fatia, na ordem do slicing.md: writing-plans (CHECKPOINT 2)
   → using-git-worktrees → subagent-driven-development → PARAR
   (CHECKPOINT 3) → aguardar merge do usuário → próxima fatia.
8. Branch por fatia: build/NNN-<slug>/<n>-<slug-da-fatia>. A sessão
   nunca faz merge/push para a branch da feature ou main.

## Regime de arquitetura

Esta Sessão B segue as três decisões de PROTOCOLS.md §"As três decisões
desta arquitetura": (1) Superpowers conduz fatiação + plan + execução,
sem delegar a outro plugin; (2) execução fatiada — o brainstorming
decide as fatias; o motor é subagent-driven-development (executing-plans
é fallback de harness sem subagente); (3) commit em branch isolado por
fatia, parada obrigatória ao fim de cada fatia, merge manual pelo
desenvolvedor.

## DO NOT

- Re-rodar grill-me ou alterar docs/CONTEXT.md (canônico).
- Modificar specs/NNN-<slug>/spec.md sem registrar emenda explícita.
- Modificar .specify/memory/constitution.md sem mudança correspondente
  em docs/CONTEXT.md.
- Adicionar/trocar dependências fora do plan.md sem tarefa explícita.
- Rodar /speckit.tasks — a decomposição é a skill writing-plans.
- Re-elicitar requisitos de produto via brainstorming — o design está
  sign-off; o brainstorming só esclarece A\* e decide a fatiação.
- Tratar o Marco como plano único — fatiar é obrigatório.
- Encadear fatias — uma fatia por vez, com merge do usuário entre cada.
- Fazer git merge ou git push para a branch da feature ou main — o
  merge é operação exclusiva do desenvolvedor.
- (Marco ≥ 2) Reconstruir, refatorar ou modificar código de marcos
  anteriores exceto onde uma tarefa o exigir explicitamente.

## Estado do git ao gerar este handoff

- Branch: <nome>
- Working tree: <estado>
- Recomendação: commitar os artefatos da Sessão A antes do /exit.
```

---

## Quando consultar o usuário (regra geral)

Em qualquer sessão, **pare e pergunte** antes de:

- Modificar artefatos imutáveis (`spec.md` após sign-off, `CONTEXT.md`,
  `constitution.md`).
- Adicionar dependências novas ao `package.json`.
- Tocar em arquivos fora do escopo declarado pela tarefa/fatia.
- Decidir entre dois caminhos quando o `plan.md` ou o
  `IMPLEMENTATION_PLAN.md` não desambigua.
- Usar uma skill do Superpowers ou comando `/speckit.*` que não está na
  tabela "Versões de ferramentas (pinned)" — pode indicar que a
  ferramenta mudou.
- Concluir que o Marco "cabe num spec/plano único" — fatiar é
  obrigatório; concluir o contrário é desvio.
- Fazer `merge` para a branch da feature ou `main` (sempre do usuário).
- Iniciar uma fatia sem o merge da anterior confirmado.
- Pular um passo do protocolo ou um dos três checkpoints.

Não pare para:

- Decisões já registradas no `IMPLEMENTATION_PLAN.md` (critério de
  aceite, decisões embutidas na tarefa).
- Detalhes de implementação cobertos pelo critério de aceite da tarefa.
- Estilo de código (siga o que já existe no repo).
