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
