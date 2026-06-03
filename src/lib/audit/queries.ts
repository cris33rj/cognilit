import { createClient } from "@/lib/supabase/server";

export interface AuditRow {
  id: string;
  created_at: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
}

/** Trilha de auditoria da Revisão, ordem cronológica (append-only — FR-035). */
export async function listAuditTrail(reviewId: string): Promise<AuditRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_entry")
    .select(
      "id, created_at, actor_type, actor_id, action, entity, entity_id, before, after",
    )
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditRow[];
}
