import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { runExtractionForRecord } from "./extract";

/** Wrapper desacoplado da resolução de BYOK (admin + provider já resolvidos). */
export async function runExtractionForRecordWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
  recordId: string,
): Promise<{ created: number }> {
  return runExtractionForRecord({ supabase, provider }, reviewId, recordId);
}
