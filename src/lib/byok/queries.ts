import { createClient } from "@/lib/supabase/server";

export interface ByokStatus {
  present: boolean;
  provider: string | null;
}

export async function getByokStatus(reviewId: string): Promise<ByokStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("byok_key")
    .select("provider")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { present: !!data, provider: data?.provider ?? null };
}
