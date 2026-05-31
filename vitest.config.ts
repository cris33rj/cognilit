import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  // Load .env.local (and .env) so integration tests can reach Supabase.
  // loadEnv(mode, cwd, prefix="") loads ALL vars regardless of prefix.
  const env = loadEnv(mode ?? "test", process.cwd(), "");

  return {
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
      include: [
        "tests/unit/**/*.test.ts?(x)",
        "tests/integration/**/*.test.ts?(x)",
      ],
      exclude: ["tests/e2e/**", "node_modules/**"],
      env: {
        NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ?? "",
      },
    },
  };
});
