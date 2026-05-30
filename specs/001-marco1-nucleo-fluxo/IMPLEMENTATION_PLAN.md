# Fatia 1 — Fundação & Revisão isolada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Escopo:** esta é a **Fatia 1 de 6** do Marco 1 (`001-marco1-nucleo-fluxo`).
> Fronteiras, dependências e gate de cobertura em
> [.superpowers/slicing.md](./.superpowers/slicing.md). NÃO planejar/implementar
> capacidades de outras fatias (workbench, importação, dedup, triagem, IA, jobs).
>
> **Branch de trabalho:** `build/001-marco1-nucleo-fluxo/1-fundacao-revisao`
> (criado via `superpowers:using-git-worktrees`). A sessão **NUNCA** faz `git merge`
> nem `git push` para a feature branch ou `main` — o merge é manual do desenvolvedor
> ao fim da fatia (CHECKPOINT 3).

**Goal:** Um pesquisador solo se autentica (e-mail/senha), cria uma Revisão isolada (tornando-se `owner`), lista e troca sua Revisão ativa — com isolamento garantido por RLS desde a 1ª migration e toda criação registrada na trilha append-only.

**Architecture:** App Next.js 14 (App Router, Server Components por padrão) sobre Supabase como BaaS. Auth Supabase e-mail/senha com sessão por cookies httpOnly via `@supabase/ssr` (middleware + clients server/client). Isolamento por `member(review_id, user_id)` aplicado por **RLS em todas as tabelas na 1ª migration** (Princípio IV). Criação de Revisão é uma RPC Postgres `SECURITY DEFINER` que insere `review` + `member(role=owner)` + `audit_entry` atomicamente (FR-002, FR-035). Greenfield: esta fatia também materializa todo o toolchain (TS strict, Tailwind 4, Vitest, Playwright, ESLint/Prettier, Husky).

**Tech Stack:** Next.js 14 (App Router) · React 18 · TypeScript strict · Tailwind CSS 4 · `@supabase/supabase-js` + `@supabase/ssr` · Supabase CLI (Postgres local + RLS) · Vitest + Testing Library (unit/integration) · Playwright (e2e) · ESLint (`eslint-config-next`) + Prettier · Husky + lint-staged.

---

## Decisões canônicas que regem esta fatia (não reabrir)

Derivadas de [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md),
[research.md](./research.md) e [constitution.md](../../.specify/memory/constitution.md):

- **R1 — Auth:** Supabase Auth provider `email` (e-mail/senha), sessão por cookies httpOnly com `@supabase/ssr`. `auth.uid()` é a identidade da RLS.
- **Princípio IV — RLS desde a origem:** TODA tabela com `review_id` exige `member(review_id, user_id = auth.uid())`. `profile` é acessível pelo próprio usuário. `audit_entry` é **insert-only** (sem `UPDATE`/`DELETE` por política).
- **FR-002 / data-model `member`:** ao criar uma `review`, cria-se **uma única** linha `member` com `role=owner` (que confere a capacidade de reviewer na v1). O valor `reviewer` do enum fica **latente**.
- **FR-035 / Princípio III:** toda ação que muda o estado da Revisão grava `audit_entry` (ator, timestamp, antes/depois). Nesta fatia: a criação da Revisão.
- **Idioma (FR-038):** código/identificadores em **inglês**; UI (labels, mensagens) em **pt-BR**.
- **Convenções (CLAUDE.md):** `interface` p/ objetos; sem `any` (usar `unknown`); `enum` só no banco (no front, `as const` + union types); Server Components por padrão, `'use client'` só onde necessário; dark mode via estratégia `class` do Tailwind.
- **Portões (constitution §Portões):** toda dependência nova entra por **tarefa explícita** (Tasks 1–7 listam cada `npm install`).

## Fora do escopo desta fatia (outras fatias)

Workbench e qualquer modo (Importar/Duplicatas/T-R/Texto completo); importação/parsers; dedup; triagem; `LLMProvider`/IA/BYOK; infra de jobs/Edge Functions; trilho de fases vivo; barra PRISMA viva; export de auditoria; reconciliação do `.env.example` (→ Fatia 2). Tabelas além de `profile`, `review`, `member`, `audit_entry` (→ fatias seguintes). O `reviews/[reviewId]/layout.tsx` aqui é **mínimo** (seletor de Revisão + contexto ativo), sem trilho/PRISMA.

## Pré-requisitos do ambiente

- **Docker Desktop** rodando (o Supabase CLI sobe Postgres/Auth локально em containers).
- **Node.js ≥ 20** e **npm ≥ 10**.
- Estilo de arquivo já fixado por `.editorconfig` (utf-8, LF, indent 2 espaços, newline final) — respeitar.

## File Structure (criada nesta fatia)

| Arquivo | Responsabilidade |
|---------|------------------|
| `package.json`, `tsconfig.json`, `next.config.mjs`, `.eslintrc.json`, `.prettierrc.json`, `.prettierignore` | Toolchain e configuração do projeto |
| `postcss.config.mjs`, `app/globals.css` | Tailwind 4 (PostCSS + tema/dark mode `class`) |
| `vitest.config.ts`, `vitest.setup.ts` | Runner de testes unit/integration + matchers do Testing Library |
| `playwright.config.ts`, `tests/e2e/*.spec.ts` | E2E dos fluxos da fatia |
| `app/layout.tsx`, `app/page.tsx` | Shell raiz + redirecionamento inicial |
| `middleware.ts` | Refresh de sessão Supabase + proteção de rotas |
| `src/lib/supabase/server.ts`, `client.ts`, `middleware.ts` | Clients `@supabase/ssr` (Server Component / Client / middleware) |
| `src/types/database.ts` | Tipos gerados do schema Supabase (sem `any`) |
| `supabase/config.toml` (gerado), `supabase/migrations/0001_foundation_rls.sql` | Schema + RLS + funções (`profile`, `review`, `member`, `audit_entry`) |
| `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(auth)/actions.ts` | Auth e-mail/senha (Server Actions) |
| `app/auth/signout/route.ts` | Logout |
| `app/reviews/page.tsx`, `app/reviews/actions.ts` | Lista de Revisões (US1) + action `createReview` (RPC) |
| `app/reviews/new/page.tsx`, `src/components/reviews/CreateReviewForm.tsx` | Criação de Revisão (RHF + Zod) |
| `app/reviews/[reviewId]/layout.tsx`, `page.tsx` | Shell mínimo da Revisão ativa + seletor |
| `src/components/reviews/ReviewSwitcher.tsx` | Troca de Revisão ativa (FR-004) |
| `src/lib/reviews/queries.ts` | Leituras tipadas de `review`/`member` |
| `tests/integration/rls.review.test.ts` | Isolamento RLS entre 2 usuários (SC-009) |

---

## Task 1: Inicializar projeto Node + Next.js 14 + TypeScript strict

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `next-env.d.ts` (gerado), `app/layout.tsx`, `app/page.tsx`, `.gitignore` (já existe — não sobrescrever)

- [ ] **Step 1: Inicializar `package.json` e instalar Next/React/TS (dependências explícitas)**

Run:
```bash
npm init -y
npm install next@^14.2.0 react@^18.3.0 react-dom@^18.3.0
npm install -D typescript@^5.4.0 @types/node@^20 @types/react@^18 @types/react-dom@^18
```

- [ ] **Step 2: Definir scripts e campos no `package.json`**

Substituir o `package.json` gerado por (mantendo as versões resolvidas no Step 1):
```json
{
  "name": "cognilit",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```
> Preservar as chaves `dependencies`/`devDependencies` que o npm escreveu nos Steps anteriores.

- [ ] **Step 3: Criar `tsconfig.json` (strict, alias `@/*` → `src/*`)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Criar `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 5: Criar `app/layout.tsx` (root layout, lang pt-BR)**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cognilit",
  description: "Plataforma de revisão sistemática assistida por IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Criar `app/page.tsx` (placeholder — redireciona em Task 9)**

```tsx
export default function HomePage() {
  return <main>Cognilit</main>;
}
```

- [ ] **Step 7: Criar `app/globals.css` mínimo (Tailwind entra na Task 2)**

```css
/* Tailwind será adicionado na Task 2 */
```

- [ ] **Step 8: Verificar typecheck e build**

Run: `npm run typecheck && npm run build`
Expected: typecheck sem erros; build conclui com a rota `/` estática.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs app/ next-env.d.ts
git commit -m "chore: scaffold Next.js 14 + TypeScript strict"
```

---

## Task 2: Configurar Tailwind CSS 4 (PostCSS + dark mode `class`)

**Files:**
- Create: `postcss.config.mjs`
- Modify: `app/globals.css`, `app/page.tsx`

- [ ] **Step 1: Instalar Tailwind 4 (dependências explícitas)**

Run:
```bash
npm install -D tailwindcss@^4.0.0 @tailwindcss/postcss@^4.0.0 postcss@^8.4.0
```

- [ ] **Step 2: Criar `postcss.config.mjs`**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 3: Substituir `app/globals.css` (import Tailwind + dark via `class`)**

```css
@import "tailwindcss";

/* Estratégia de dark mode por classe (CLAUDE.md §Estilo) */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --color-bg: #ffffff;
  --color-fg: #0a0a0a;
}
```

- [ ] **Step 4: Aplicar uma classe utilitária em `app/page.tsx` para validar o pipeline**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center text-2xl font-semibold">
      Cognilit
    </main>
  );
}
```

- [ ] **Step 5: Verificar que o build processa o CSS do Tailwind**

Run: `npm run build`
Expected: build conclui sem erro de PostCSS; nenhum aviso de plugin Tailwind ausente.

- [ ] **Step 6: Commit**

```bash
git add postcss.config.mjs app/globals.css app/page.tsx
git commit -m "chore: configure Tailwind CSS 4 with class-based dark mode"
```

---

## Task 3: Configurar Vitest + Testing Library

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `tests/unit/smoke.test.ts`

- [ ] **Step 1: Instalar Vitest e Testing Library (dependências explícitas)**

Run:
```bash
npm install -D vitest@^2.0.0 @vitejs/plugin-react@^4.3.0 jsdom@^24.0.0 \
  @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.4.0 \
  @testing-library/user-event@^14.5.0
```

- [ ] **Step 2: Criar `vitest.config.ts` (jsdom + alias `@` + exclui e2e)**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/unit/**/*.test.ts?(x)", "tests/integration/**/*.test.ts?(x)"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
```

- [ ] **Step 3: Criar `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Escrever um teste de smoke que falha primeiro**

`tests/unit/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Rodar o teste**

Run: `npm test`
Expected: PASS — 1 teste passa, confirmando que o runner está configurado.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts vitest.setup.ts tests/unit/smoke.test.ts package.json package-lock.json
git commit -m "chore: configure Vitest with Testing Library"
```

---

## Task 4: Configurar Playwright (e2e)

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`
- Modify: `.gitignore` (apenas se faltar `playwright/.cache` — já cobre `playwright-report/`, `test-results/`)

- [ ] **Step 1: Instalar Playwright e os browsers**

Run:
```bash
npm install -D @playwright/test@^1.45.0
npx playwright install chromium
```

- [ ] **Step 2: Criar `playwright.config.ts` (sobe o dev server, base URL local)**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Escrever o smoke e2e**

`tests/e2e/smoke.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("home renderiza o nome do produto", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Cognilit")).toBeVisible();
});
```

- [ ] **Step 4: Rodar o e2e**

Run: `npm run test:e2e`
Expected: PASS — 1 teste; o `webServer` sobe o `next dev` e a home responde.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/smoke.spec.ts package.json package-lock.json
git commit -m "chore: configure Playwright e2e harness"
```

---

## Task 5: Configurar ESLint + Prettier

**Files:**
- Create: `.eslintrc.json`, `.prettierrc.json`, `.prettierignore`

- [ ] **Step 1: Instalar ESLint/Prettier (dependências explícitas)**

Run:
```bash
npm install -D eslint@^8.57.0 eslint-config-next@^14.2.0 \
  prettier@^3.3.0 eslint-config-prettier@^9.1.0
```

- [ ] **Step 2: Criar `.eslintrc.json` (base Next + desliga conflitos com Prettier)**

```json
{
  "extends": ["next/core-web-vitals", "next/typescript", "prettier"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

- [ ] **Step 3: Criar `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 80,
  "endOfLine": "lf"
}
```

- [ ] **Step 4: Criar `.prettierignore`**

```
.next
node_modules
coverage
playwright-report
test-results
supabase/.branches
supabase/.temp
src/types/database.ts
```

- [ ] **Step 5: Rodar lint, typecheck e checagem de formatação**

Run: `npm run lint && npm run typecheck && npx prettier --check .`
Expected: lint sem erros; typecheck limpo; Prettier reporta arquivos formatados (rodar `npx prettier --write .` se necessário e re-commitar a formatação).

- [ ] **Step 6: Commit**

```bash
git add .eslintrc.json .prettierrc.json .prettierignore package.json package-lock.json
git commit -m "chore: configure ESLint + Prettier"
```

---

## Task 6: Configurar Husky + lint-staged (pre-commit)

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json` (campo `lint-staged` + script `prepare`)

- [ ] **Step 1: Instalar e inicializar Husky + lint-staged**

Run:
```bash
npm install -D husky@^9.0.0 lint-staged@^15.0.0
npx husky init
```

- [ ] **Step 2: Adicionar `prepare` e bloco `lint-staged` ao `package.json`**

Adicionar ao `package.json`:
```json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,css,md}": ["prettier --write"]
  }
}
```

- [ ] **Step 3: Definir o hook `.husky/pre-commit`**

Substituir o conteúdo de `.husky/pre-commit` por:
```sh
npx lint-staged
```

- [ ] **Step 4: Verificar que o hook roda**

Run (cria e desfaz um arquivo de teste):
```bash
echo "export const x = 1" > tmp_lintcheck.ts && git add tmp_lintcheck.ts && git commit -m "test: husky" ; git reset --soft HEAD~1 2>/dev/null ; git restore --staged tmp_lintcheck.ts ; rm tmp_lintcheck.ts
```
Expected: o commit dispara `lint-staged` sem erros. (O `reset`/`rm` limpa o arquivo de teste.)

- [ ] **Step 5: Commit**

```bash
git add .husky/pre-commit package.json package-lock.json
git commit -m "chore: add Husky pre-commit running lint-staged"
```

---

## Task 7: Inicializar Supabase local + clients `@supabase/ssr`

**Files:**
- Create: `supabase/config.toml` (gerado por `supabase init`), `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/middleware.ts`, `.env.local` (não versionado)
- Modify: nenhum

- [ ] **Step 1: Instalar libs Supabase + CLI (dependências explícitas)**

Run:
```bash
npm install @supabase/supabase-js@^2.43.0 @supabase/ssr@^0.3.0
npm install -D supabase@^1.180.0
```

- [ ] **Step 2: Inicializar o projeto Supabase local**

Run: `npx supabase init`
Expected: cria `supabase/config.toml` e a pasta `supabase/`. Responder "n" se perguntar sobre VS Code/Deno settings.

- [ ] **Step 3: Subir o stack local e capturar as chaves**

Run: `npx supabase start`
Expected: containers sobem; o comando imprime `API URL` (`http://127.0.0.1:54321`), `anon key` e `service_role key`. Anotar para o próximo step.

- [ ] **Step 4: Criar `.env.local` (NÃO versionado — já em `.gitignore`)**

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key do step 3>
SUPABASE_SERVICE_ROLE_KEY=<service_role key do step 3>
```
> NÃO tocar `.env.example` nesta fatia — sua reconciliação (resíduo BYOK) é tarefa explícita da Fatia 2 (codebase-map §4).

- [ ] **Step 5: Criar `src/lib/supabase/server.ts` (client de Server Components / Actions)**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component sem resposta mutável — ignorável
            // quando o middleware já cuida do refresh da sessão.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 6: Criar `src/lib/supabase/client.ts` (client de browser)**

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 7: Criar `src/lib/supabase/middleware.ts` (refresh de sessão)**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rotas protegidas: sem usuário fora de (auth) → redireciona ao login.
  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path === "/" ||
    path.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 8: Verificar typecheck**

Run: `npm run typecheck`
Expected: sem erros nos três clients.

- [ ] **Step 9: Commit**

```bash
git add supabase/config.toml src/lib/supabase/ package.json package-lock.json
git commit -m "chore: init Supabase local and @supabase/ssr clients"
```

---

## Task 8: 1ª migration — schema + RLS (`profile`, `review`, `member`, `audit_entry`)

**Files:**
- Create: `supabase/migrations/0001_foundation_rls.sql`

**Notas de design (data-model.md):** RLS em TODAS as tabelas; `audit_entry` insert-only; isolamento via helper `is_review_member()` `SECURITY DEFINER` (evita recursão de RLS na própria `member`); criação de Revisão por RPC atômica `create_review()`; `profile` criado por trigger em `auth.users`.

- [ ] **Step 1: Criar a migration com extensões, tabelas, funções e políticas**

`supabase/migrations/0001_foundation_rls.sql`:
```sql
-- ============================================================
-- Marco 1 / Fatia 1 — Fundação: profile, review, member, audit_entry
-- RLS habilitado em TODAS as tabelas (Princípio IV).
-- ============================================================

create extension if not exists "pgcrypto";

-- enums (enum permitido no banco — CLAUDE.md)
create type member_role as enum ('owner', 'reviewer', 'viewer');
create type audit_actor_type as enum ('human', 'ai', 'system');

-- ---------- profile ----------
create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- ---------- review (agregado-raiz) ----------
create table public.review (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  pipeline_config jsonb not null default '{}'::jsonb,
  active_screening_started_at timestamptz,
  created_by uuid not null references public.profile (id),
  created_at timestamptz not null default now()
);

-- ---------- member (usuário ↔ revisão ↔ papel) ----------
create table public.member (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  role member_role not null,
  created_at timestamptz not null default now(),
  unique (review_id, user_id)
);

-- ---------- audit_entry (append-only) ----------
create table public.audit_entry (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  actor_type audit_actor_type not null,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_entry_review_idx on public.audit_entry (review_id, created_at);
create index member_user_idx on public.member (user_id);

-- ============================================================
-- Helper: is_review_member (SECURITY DEFINER evita recursão de RLS)
-- ============================================================
create or replace function public.is_review_member(p_review_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.member m
    where m.review_id = p_review_id
      and m.user_id = auth.uid()
  );
$$;

-- ============================================================
-- Trigger: cria profile ao criar auth.users
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RPC: create_review — review + member(owner) + audit_entry (atômico)
-- ============================================================
create or replace function public.create_review(p_title text)
returns public.review
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.review;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  insert into public.review (title, created_by)
  values (btrim(p_title), auth.uid())
  returning * into v_review;

  insert into public.member (review_id, user_id, role)
  values (v_review.id, auth.uid(), 'owner');

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    v_review.id, 'human', auth.uid(), 'create_review', 'review', v_review.id,
    null, to_jsonb(v_review)
  );

  return v_review;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profile enable row level security;
alter table public.review enable row level security;
alter table public.member enable row level security;
alter table public.audit_entry enable row level security;

-- profile: o próprio usuário
create policy profile_select_own on public.profile
  for select using (id = auth.uid());
create policy profile_update_own on public.profile
  for update using (id = auth.uid()) with check (id = auth.uid());

-- review: membros leem; escrita direta negada (criação via RPC SECURITY DEFINER)
create policy review_select_member on public.review
  for select using (public.is_review_member(id));

-- member: membros da mesma revisão leem; escrita via RPC apenas
create policy member_select_same_review on public.member
  for select using (public.is_review_member(review_id));

-- audit_entry: membros leem; INSERT por membros; SEM update/delete (append-only)
create policy audit_select_member on public.audit_entry
  for select using (public.is_review_member(review_id));
create policy audit_insert_member on public.audit_entry
  for insert with check (public.is_review_member(review_id));

-- Permitir execução da RPC pelo papel autenticado
grant execute on function public.create_review(text) to authenticated;
```

- [ ] **Step 2: Aplicar a migration ao banco local**

Run: `npx supabase db reset`
Expected: a migration `0001_foundation_rls.sql` aplica sem erro; saída confirma "Applying migration 0001_foundation_rls.sql".

- [ ] **Step 3: Gerar os tipos TypeScript do schema**

Run: `npx supabase gen types typescript --local > src/types/database.ts`
Expected: cria `src/types/database.ts` com `Database` contendo `profile`, `review`, `member`, `audit_entry` e a função `create_review`.

- [ ] **Step 4: Verificar typecheck**

Run: `npm run typecheck`
Expected: sem erros (o arquivo gerado é válido; está em `.prettierignore`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_foundation_rls.sql src/types/database.ts
git commit -m "feat: foundation schema with RLS (profile, review, member, audit_entry)"
```

---

## Task 9: Auth e-mail/senha — rotas `(auth)`, Server Actions e middleware

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(auth)/actions.ts`, `app/auth/signout/route.ts`, `middleware.ts`
- Modify: `app/page.tsx`

- [ ] **Step 1: Escrever o e2e que falha primeiro (cadastro → redireciona a /reviews)**

`tests/e2e/auth.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

function uniqueEmail() {
  return `user_${Date.now()}@example.com`;
}

test("cadastro autentica e leva à lista de Revisões", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(uniqueEmail());
  await page.getByLabel("Senha").fill("senha-super-secreta-123");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/reviews/);
  await expect(
    page.getByRole("heading", { name: "Minhas Revisões" }),
  ).toBeVisible();
});

test("rota protegida sem sessão redireciona ao login", async ({ page }) => {
  await page.goto("/reviews");
  await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test:e2e -- auth.spec.ts`
Expected: FAIL — rotas `/signup`, `/login`, `/reviews` ainda não existem.

- [ ] **Step 3: Criar o middleware raiz**

`middleware.ts`:
```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 4: Criar as Server Actions de auth**

`app/(auth)/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent("Credenciais inválidas")}`);
  }
  redirect("/reviews");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    redirect(`/signup?error=${encodeURIComponent("Não foi possível criar a conta")}`);
  }
  redirect("/reviews");
}
```
> Pré-requisito de ambiente de teste: em `supabase/config.toml`, `[auth.email] enable_confirmations = false` (default local) para que `signUp` já crie a sessão. Confirmar que está desabilitado.

- [ ] **Step 5: Criar a página de login**

`app/(auth)/login/page.tsx`:
```tsx
import { signIn } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Entrar</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={signIn} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          E-mail
          <input name="email" type="email" required className="border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Senha
          <input name="password" type="password" required className="border p-2" />
        </label>
        <button type="submit" className="bg-black p-2 text-white">
          Entrar
        </button>
      </form>
      <a href="/signup" className="text-sm underline">
        Criar conta
      </a>
    </main>
  );
}
```

- [ ] **Step 6: Criar a página de cadastro**

`app/(auth)/signup/page.tsx`:
```tsx
import { signUp } from "../actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Criar conta</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={signUp} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          E-mail
          <input name="email" type="email" required className="border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Senha
          <input name="password" type="password" required className="border p-2" />
        </label>
        <button type="submit" className="bg-black p-2 text-white">
          Criar conta
        </button>
      </form>
      <a href="/login" className="text-sm underline">
        Já tenho conta
      </a>
    </main>
  );
}
```

- [ ] **Step 7: Criar a rota de logout**

`app/auth/signout/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
}
```

- [ ] **Step 8: Fazer a home redirecionar conforme a sessão**

`app/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/reviews" : "/login");
}
```

- [ ] **Step 9: Rodar o e2e (depende de `/reviews` existir — Task 10 conclui o fluxo)**

> O segundo teste (`rota protegida → /login`) já deve passar agora. O primeiro (`cadastro → /reviews`) passa após a Task 10. Rodar apenas o de proteção aqui:

Run: `npm run test:e2e -- auth.spec.ts -g "redireciona ao login"`
Expected: PASS.

- [ ] **Step 10: Verificar lint/typecheck e commit**

Run: `npm run lint && npm run typecheck`
```bash
git add middleware.ts "app/(auth)" app/auth app/page.tsx tests/e2e/auth.spec.ts
git commit -m "feat: email/password auth with route protection"
```

---

## Task 10: Lista de Revisões + criação (RPC) — US1 / FR-002

**Files:**
- Create: `app/reviews/page.tsx`, `app/reviews/actions.ts`, `app/reviews/new/page.tsx`, `src/components/reviews/CreateReviewForm.tsx`, `src/lib/reviews/queries.ts`
- Modify: nenhum

- [ ] **Step 1: Instalar RHF + Zod (dependências explícitas)**

Run:
```bash
npm install react-hook-form@^7.52.0 zod@^3.23.0 @hookform/resolvers@^3.7.0
```

- [ ] **Step 2: Escrever o unit test do schema Zod (falha primeiro)**

`tests/unit/reviews/create-review-schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createReviewSchema } from "@/lib/reviews/schema";

describe("createReviewSchema", () => {
  it("rejeita título vazio", () => {
    const result = createReviewSchema.safeParse({ title: "   " });
    expect(result.success).toBe(false);
  });

  it("aceita título válido e faz trim", () => {
    const result = createReviewSchema.safeParse({ title: "  Minha RSL  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Minha RSL");
    }
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- create-review-schema`
Expected: FAIL — `@/lib/reviews/schema` não existe.

- [ ] **Step 4: Criar o schema Zod**

`src/lib/reviews/schema.ts`:
```ts
import { z } from "zod";

export const createReviewSchema = z.object({
  title: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Informe um título para a Revisão")),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- create-review-schema`
Expected: PASS.

- [ ] **Step 6: Criar as leituras tipadas de Revisões**

`src/lib/reviews/queries.ts`:
```ts
import { createClient } from "@/lib/supabase/server";

export interface ReviewListItem {
  id: string;
  title: string;
  created_at: string;
}

export async function listMyReviews(): Promise<ReviewListItem[]> {
  const supabase = await createClient();
  // RLS garante que só voltam Revisões das quais o usuário é membro.
  const { data, error } = await supabase
    .from("review")
    .select("id, title, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
```

- [ ] **Step 7: Criar a action `createReview` (chama a RPC)**

`app/reviews/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createReviewSchema } from "@/lib/reviews/schema";

export async function createReview(formData: FormData) {
  const parsed = createReviewSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) {
    redirect(`/reviews/new?error=${encodeURIComponent("Informe um título")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_review", {
    p_title: parsed.success ? parsed.data.title : "",
  });

  if (error || !data) {
    redirect(`/reviews/new?error=${encodeURIComponent("Falha ao criar a Revisão")}`);
  }

  redirect(`/reviews/${data.id}`);
}
```

- [ ] **Step 8: Criar a página da lista de Revisões**

`app/reviews/page.tsx`:
```tsx
import Link from "next/link";
import { listMyReviews } from "@/lib/reviews/queries";

export default async function ReviewsPage() {
  const reviews = await listMyReviews();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Minhas Revisões</h1>
        <Link href="/reviews/new" className="bg-black px-3 py-2 text-white">
          Nova Revisão
        </Link>
      </div>
      {reviews.length === 0 ? (
        <p className="text-gray-600">
          Você ainda não tem Revisões. Crie a primeira.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reviews/${r.id}`}
                className="block border p-3 hover:bg-gray-50"
              >
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 9: Criar o formulário de criação (client) e a página `new`**

`src/components/reviews/CreateReviewForm.tsx`:
```tsx
"use client";

import { createReview } from "@/app/reviews/actions";

export function CreateReviewForm({ error }: { error?: string }) {
  return (
    <form action={createReview} className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <label className="flex flex-col gap-1">
        Título da Revisão
        <input name="title" type="text" required className="border p-2" />
      </label>
      <button type="submit" className="bg-black p-2 text-white">
        Criar Revisão
      </button>
    </form>
  );
}
```

`app/reviews/new/page.tsx`:
```tsx
import { CreateReviewForm } from "@/components/reviews/CreateReviewForm";

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">Nova Revisão</h1>
      <CreateReviewForm error={error} />
    </main>
  );
}
```

- [ ] **Step 10: Rodar o fluxo completo de auth+criação (e2e da Task 9 agora passa)**

Run: `npm run test:e2e -- auth.spec.ts`
Expected: PASS — ambos os testes (cadastro chega em `/reviews` com o heading "Minhas Revisões"; proteção redireciona).

- [ ] **Step 11: Lint/typecheck e commit**

Run: `npm run lint && npm run typecheck && npm test`
```bash
git add app/reviews src/components/reviews src/lib/reviews tests/unit/reviews package.json package-lock.json
git commit -m "feat: list and create reviews via create_review RPC (US1, FR-002)"
```

---

## Task 11: Isolamento RLS entre usuários — teste de integração (SC-009)

**Files:**
- Create: `tests/integration/rls.review.test.ts`, `tests/integration/helpers/supabase.ts`

- [ ] **Step 1: Criar o helper de clients de teste (anon por usuário + service role)**

`tests/integration/helpers/supabase.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function anonClient(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signUpUser(email: string, password: string) {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return { client, userId: data.user!.id };
}
```

- [ ] **Step 2: Escrever o teste de isolamento (falha primeiro se a RLS estiver frouxa)**

`tests/integration/rls.review.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";

describe("RLS — isolamento de Revisões (SC-009)", () => {
  let aClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let bClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewIdA: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const a = await signUpUser(`a_${stamp}@example.com`, "senha-teste-123");
    const b = await signUpUser(`b_${stamp}@example.com`, "senha-teste-123");
    aClient = a.client;
    bClient = b.client;

    const { data, error } = await aClient.rpc("create_review", {
      p_title: "Revisão do A",
    });
    if (error) throw error;
    reviewIdA = data.id;
  });

  it("A enxerga a própria Revisão", async () => {
    const { data } = await aClient
      .from("review")
      .select("id, title")
      .eq("id", reviewIdA);
    expect(data?.length).toBe(1);
  });

  it("B NÃO enxerga a Revisão de A (0 vazamentos)", async () => {
    const { data } = await bClient
      .from("review")
      .select("id, title")
      .eq("id", reviewIdA);
    expect(data ?? []).toHaveLength(0);
  });

  it("B NÃO enxerga o membership de A", async () => {
    const { data } = await bClient
      .from("member")
      .select("id")
      .eq("review_id", reviewIdA);
    expect(data ?? []).toHaveLength(0);
  });

  it("B NÃO consegue inserir audit_entry na Revisão de A", async () => {
    const { error } = await bClient.from("audit_entry").insert({
      review_id: reviewIdA,
      actor_type: "human",
      action: "tamper",
      entity: "review",
      entity_id: reviewIdA,
    });
    expect(error).not.toBeNull();
  });

  it("audit_entry registrou a criação da Revisão de A", async () => {
    const { data } = await aClient
      .from("audit_entry")
      .select("action, entity")
      .eq("review_id", reviewIdA);
    expect(
      (data ?? []).some(
        (e) => e.action === "create_review" && e.entity === "review",
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar com o banco local de pé**

Run: `npx supabase start && npm test -- rls.review`
Expected: PASS — A vê sua Revisão; B não vê review/member; insert de B em audit_entry falha; a criação de A gerou `audit_entry`.

> Se algum teste de vazamento passar (B enxerga dados de A), é regressão de RLS na migration — corrigir a política antes de prosseguir (não relaxar o teste).

- [ ] **Step 4: Commit**

```bash
git add tests/integration
git commit -m "test: RLS isolation between users (SC-009) and audit trail on review creation"
```

---

## Task 12: Shell mínimo da Revisão ativa + troca de Revisão — FR-004

**Files:**
- Create: `app/reviews/[reviewId]/layout.tsx`, `app/reviews/[reviewId]/page.tsx`, `src/components/reviews/ReviewSwitcher.tsx`
- Modify: `src/lib/reviews/queries.ts` (adicionar `getReviewById`)

- [ ] **Step 1: Escrever o e2e de troca de Revisão ativa (falha primeiro)**

`tests/e2e/review-switch.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("cria duas Revisões e troca a ativa pelo seletor", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(`switch_${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("senha-super-secreta-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/);

  for (const title of ["Revisão Alpha", "Revisão Beta"]) {
    await page.getByRole("link", { name: "Nova Revisão" }).click();
    await page.getByLabel("Título da Revisão").fill(title);
    await page.getByRole("button", { name: "Criar Revisão" }).click();
    await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);
  }

  // No contexto de uma Revisão, o seletor mostra a ativa e permite trocar.
  await expect(page.getByRole("heading", { name: "Revisão Beta" })).toBeVisible();
  await page.getByRole("combobox", { name: "Revisão ativa" }).selectOption({
    label: "Revisão Alpha",
  });
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Revisão Alpha" })).toBeVisible();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test:e2e -- review-switch.spec.ts`
Expected: FAIL — `[reviewId]/layout.tsx`, `page.tsx` e o seletor não existem.

- [ ] **Step 3: Adicionar `getReviewById` às queries**

Acrescentar a `src/lib/reviews/queries.ts`:
```ts
export async function getReviewById(
  reviewId: string,
): Promise<ReviewListItem | null> {
  const supabase = await createClient();
  // RLS: retorna null (PGRST116) se o usuário não for membro.
  const { data, error } = await supabase
    .from("review")
    .select("id, title, created_at")
    .eq("id", reviewId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}
```

- [ ] **Step 4: Criar o seletor de Revisão ativa (client)**

`src/components/reviews/ReviewSwitcher.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import type { ReviewListItem } from "@/lib/reviews/queries";

export function ReviewSwitcher({
  reviews,
  activeId,
}: {
  reviews: ReviewListItem[];
  activeId: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Revisão ativa"
      value={activeId}
      onChange={(e) => router.push(`/reviews/${e.target.value}`)}
      className="border p-2"
    >
      {reviews.map((r) => (
        <option key={r.id} value={r.id}>
          {r.title}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 5: Criar o layout mínimo da Revisão (seletor + contexto ativo)**

`app/reviews/[reviewId]/layout.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getReviewById, listMyReviews } from "@/lib/reviews/queries";
import { ReviewSwitcher } from "@/components/reviews/ReviewSwitcher";

export default async function ReviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const active = await getReviewById(reviewId);
  if (!active) {
    notFound();
  }
  const reviews = await listMyReviews();

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 border-b p-4">
        <a href="/reviews" className="text-sm underline">
          Minhas Revisões
        </a>
        <ReviewSwitcher reviews={reviews} activeId={active.id} />
        <form action="/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="text-sm underline">
            Sair
          </button>
        </form>
      </header>
      <div className="p-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Criar a página da Revisão ativa (placeholder de contexto)**

`app/reviews/[reviewId]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getReviewById } from "@/lib/reviews/queries";

export default async function ReviewHomePage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const review = await getReviewById(reviewId);
  if (!review) {
    notFound();
  }
  return (
    <section>
      <h1 className="text-2xl font-semibold">{review.title}</h1>
      <p className="mt-2 text-gray-600">
        Contexto da Revisão ativa. As fases (Pergunta, Protocolo, Workbench)
        entram nas próximas fatias.
      </p>
    </section>
  );
}
```

- [ ] **Step 7: Rodar o e2e de troca**

Run: `npm run test:e2e -- review-switch.spec.ts`
Expected: PASS — o seletor mostra a Revisão ativa e a troca navega para a outra, com o heading refletindo a seleção (FR-004).

- [ ] **Step 8: Verificação final da fatia (todos os portões)**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: lint limpo; `tsc --noEmit` sem erros; todos os unit/integration verdes; todos os e2e verdes.

- [ ] **Step 9: Commit**

```bash
git add "app/reviews/[reviewId]" src/components/reviews/ReviewSwitcher.tsx src/lib/reviews/queries.ts tests/e2e/review-switch.spec.ts
git commit -m "feat: active review shell and switcher (FR-004)"
```

---

## CHECKPOINT 3 — Fim da Fatia 1 (parada obrigatória)

Concluída a Task 12, **PARAR** (CLAUDE.md §5). Apresentar ao desenvolvedor:
- o branch `build/001-marco1-nucleo-fluxo/1-fundacao-revisao` e o diff completo;
- a saída de `npm test`, `npm run test:e2e`, `npm run lint` e `npm run typecheck`.

**Aguardar o merge manual do desenvolvedor.** NÃO iniciar a Fatia 2. NÃO fazer `git merge`/`git push`.

---

## Self-Review (cobertura desta fatia vs. slicing.md)

- **US1 (P1) — criar/acessar Revisão isolada:** Tasks 9–12 (auth, lista, criação, troca, isolamento RLS). ✓
- **FR-001** (autenticar antes de acessar): Task 9 (middleware + auth). ✓
- **FR-002** (criar Revisão com título; criador vira owner): Task 8 (RPC `create_review` + `member` owner) + Task 10. ✓
- **FR-003** (isolamento por usuário/Revisão): Task 8 (RLS) + Task 11 (teste SC-009). ✓
- **FR-004** (trocar Revisão ativa refletindo o contexto): Task 12. ✓
- **FR-005** (modelar papéis Owner/Reviewer/Viewer sem afordância de colaboração): Task 8 (`member_role` enum; UI só usa `owner`). ✓
- **FR-035** (base — trilha append-only; registrar criação): Task 8 (`audit_entry` insert-only + RPC grava criação) + Task 11 (teste). ✓ *(export da trilha → Fatia 6, A1.)*
- **SC-009** (0 vazamentos entre Revisões/usuários): Task 11. ✓
- **Migration + RLS primeiro** (Princípio IV): Task 8 precede o código que consome o schema (Tasks 10–12). ✓
- **Scaffold greenfield** (codebase-map §1): Tasks 1–7. ✓
- **Fora de escopo respeitado:** sem workbench/modos, sem importação/dedup/triagem, sem IA/BYOK, sem jobs, `layout.tsx` mínimo (sem trilho/PRISMA), `.env.example` não tocado. ✓

**Dependências novas declaradas por tarefa explícita** (constitution §Portões): Next/React/TS (T1), Tailwind 4 (T2), Vitest+TL (T3), Playwright (T4), ESLint/Prettier (T5), Husky/lint-staged (T6), `@supabase/*`+CLI (T7), RHF+Zod (T10). Nenhuma fora do `plan.md`/`research.md`.
