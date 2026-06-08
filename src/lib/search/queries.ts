import { createClient } from "@/lib/supabase/server";
import { composeSuggestedQuery } from "./suggest";

/**
 * Seed da string de busca para o modo Importar: termos de busca derivados por IA
 * (kind='search_term') ainda não rejeitados, compostos como sugestão editável (A-13.2).
 * Retorna "" quando não há termos.
 */
export async function getSuggestedQuery(reviewId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eligibility_criterion")
    .select("text, ratification_state")
    .eq("review_id", reviewId)
    .eq("kind", "search_term")
    .neq("ratification_state", "rejected")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const terms = ((data ?? []) as Array<{ text: string }>).map((r) => r.text);
  return composeSuggestedQuery(terms);
}
