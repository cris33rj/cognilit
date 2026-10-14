import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  // Load .env.local (and .env) so integration tests can reach Supabase.
  // loadEnv(mode, cwd, prefix="") loads ALL vars regardless of prefix.
  const env = loadEnv(mode ?? "test", process.cwd(), "");

  // Integration tests need a running local Supabase. Without its URL, skip them
  // with a clear notice instead of failing every suite on a missing client URL.
  const hasSupabase = Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!hasSupabase) {
    console.warn(
      "[vitest] NEXT_PUBLIC_SUPABASE_URL is not set: skipping tests/integration. " +
        "Run `npx supabase start` and fill .env.local to include them.",
    );
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@shared": fileURLToPath(
          new URL("./supabase/functions/_shared", import.meta.url),
        ),
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./vitest.setup.ts"],
      // Integration tests make many round trips to a real local Supabase; the
      // 5s default is too tight when suites run in parallel.
      testTimeout: 30_000,
      include: [
        "tests/unit/**/*.test.ts?(x)",
        "tests/integration/**/*.test.ts?(x)",
      ],
      exclude: [
        "tests/e2e/**",
        "node_modules/**",
        ...(hasSupabase ? [] : ["tests/integration/**"]),
      ],
      env: {
        NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ?? "",
      },
    },
  };
});
