import { createClient } from "@/lib/supabase/server";

export interface JobRow {
  id: string;
  type: string;
  status: string;
  progress: number;
  created_at: string;
}

export async function listJobs(reviewId: string): Promise<JobRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job")
    .select("id, type, status, progress, created_at")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function countRecords(reviewId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("record")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
