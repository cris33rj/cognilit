import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Cliente service-role: usado APENAS server-side para operações que
// exigem privilégio (ex.: decifrar a BYOK via get_byok_secret — D-F2.4).
// Nunca importar em código client.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
