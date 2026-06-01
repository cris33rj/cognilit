import { createClient } from "@/lib/supabase/server";
import type { ProtocolContent } from "./markdown";

export interface ProtocolRow {
  id: string;
  content: ProtocolContent;
  state: "draft" | "locked";
  locked_at: string | null;
  origin: "ai_draft" | "human";
}

export interface AmendmentRow {
  id: string;
  version: number;
  change: Record<string, unknown>;
  dated_at: string;
}

export async function getProtocol(
  reviewId: string,
): Promise<ProtocolRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol")
    .select("id, content, state, locked_at, origin")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ProtocolRow | null;
}

export async function listAmendments(
  reviewId: string,
): Promise<AmendmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol_amendment")
    .select("id, version, change, dated_at")
    .eq("review_id", reviewId)
    .order("version", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AmendmentRow[];
}
