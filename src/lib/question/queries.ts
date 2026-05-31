import { createClient } from "@/lib/supabase/server";
import type { Framework } from "./schema";

export interface QuestionRow {
  id: string;
  framework: Framework;
  question_text: string;
  fields: Record<string, string>;
}

export interface CriterionRow {
  id: string;
  kind: "inclusion" | "exclusion" | "search_term";
  text: string;
  origin: "human" | "ai";
  ratification_state: "pending" | "accepted" | "edited" | "rejected";
  ai_suggestion_id: string | null;
}

export async function getQuestion(
  reviewId: string,
): Promise<QuestionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question")
    .select("id, framework, question_text, fields")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as QuestionRow | null;
}

export async function listCriteria(reviewId: string): Promise<CriterionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eligibility_criterion")
    .select("id, kind, text, origin, ratification_state, ai_suggestion_id")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CriterionRow[];
}
