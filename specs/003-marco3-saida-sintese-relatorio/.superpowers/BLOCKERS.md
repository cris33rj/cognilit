# Blocker — Fatia 1 (Fluxograma PRISMA) — rasterização PNG: `@resvg/resvg-wasm` × bundler Next

## Opened at

2026-06-12T00:00:00Z

## Task affected

Task 4/6/9 (Fatia 1) — `src/lib/prisma/png.ts` + route `prisma/export?format=png` + e2e.

## What was attempted

`png.ts` usa `@resvg/resvg-wasm` (lib nomeada no `plan.md` R2): `createRequire(import.meta.url)
.resolve("@resvg/resvg-wasm/index_bg.wasm")` → `readFile` → `initWasm(bytes)` → `new Resvg(svg)
.render().asPng()`. Os **testes unitários** (vitest, ambiente Node) passam. Mas o **build do
Next** (webServer do Playwright) falha:

```
./node_modules/@resvg/resvg-wasm/index_bg.wasm
Module parse failed ... module is not flagged as WebAssembly module for webpack.
Import trace: index_bg.wasm ← src/lib/prisma/png.ts ← app/reviews/[reviewId]/prisma/export/route.ts
```

Tentativa de correção 1: `experimental.serverComponentsExternalPackages: ["@resvg/resvg-wasm"]`
em `next.config.mjs` — **não resolveu**: o webpack ainda traça o **subpath** `require.resolve(
".../index_bg.wasm")` e tenta bundlar o `.wasm` como módulo.

## What blocked

O webpack 5 (Next 14.2) não compila o `.wasm` referenciado estaticamente por `require.resolve`
em `png.ts` sem habilitar `experiments.asyncWebAssembly`, e mesmo externalizando o pacote o
subpath do wasm continua sendo traçado. Manter o wasm exigiria yak-shaving de config de webpack
+ alterar como o `.wasm` é carom carregado, com risco de divergência runtime (initWasm manual ×
instanciação do webpack).

## Blocker class

[x] Ambiguidade de implementação (resolve em session-b-build) — escolha de lib de rasterização.
[ ] Defeito de spec/plan.

## Resolution

**MANTER `@resvg/resvg-wasm`** (lib aprovada no CHECKPOINT 2) e corrigir apenas o lado do
**bundler do Next**. A troca para `@resvg/resvg-js` foi considerada e **rejeitada pelo usuário**
(não trocar a dependência aprovada). Causa real: o webpack do Next traça o **literal**
`require.resolve("@resvg/resvg-wasm/index_bg.wasm")` em `png.ts` e tenta bundlar o `.wasm`.

Correção em duas frentes (sem mexer em `package.json`):

1. `src/lib/prisma/png.ts`: montar o specifier do `.wasm` em **runtime**
   (`["@resvg","resvg-wasm","index_bg.wasm"].join("/")`) — o webpack não consegue analisar
   estaticamente, então não traça/bundla o `.wasm`; ele é lido do `node_modules` em runtime Node.
2. `next.config.mjs`: `experimental.serverComponentsExternalPackages: ["@resvg/resvg-wasm"]` —
   o pacote fica fora do bundle do servidor e é `require()`-ado do `node_modules` em runtime
   (route handler com `runtime = "nodejs"`, A2).

`render().asPng()` continua retornando bytes PNG (assinatura preservada — teste unitário verde).

> Nota de incidente: o comando de troca de lib chegou a mutar `package.json` (resvg-wasm saiu)
> antes de ser cancelado; recuperado com `git checkout 8588cb7 -- package.json package-lock.json`
> + `npm install`, restaurando o estado aprovado (`@resvg/resvg-wasm ^2.6.2`).

## Resolved at

2026-06-12 (mesma sessão B, inline — não houve `/exit`).

## Resolution summary

`@resvg/resvg-wasm` mantido. Atrito do bundler resolvido por specifier dinâmico em `png.ts` +
`serverComponentsExternalPackages` no `next.config.mjs` (mudança aditiva, justificada por
consumir a dep nova num route Node). Unit + integração + tsc verdes; **e2e a verificar na
revisão do desenvolvedor** (não rodado nesta sessão). Deviation do plano: `next.config.mjs` e
`png.ts` ajustados além do texto literal das Tasks 4/6 — registrar no `COMPLETION.md`.
