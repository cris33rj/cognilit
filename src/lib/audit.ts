import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/types/database";

export interface AuditInput {
  reviewId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
}

export function buildAuditRow(input: AuditInput): TablesInsert<"audit_entry"> {
  return {
    review_id: input.reviewId,
    actor_type: "human",
    actor_id: input.actorId,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId,
    before: (input.before ?? null) as TablesInsert<"audit_entry">["before"],
    after: (input.after ?? null) as TablesInsert<"audit_entry">["after"],
  };
}

/** Insere uma entrada de auditoria (append-only). Lança em erro de RLS. */
export async function writeAudit(
  supabase: SupabaseClient<Database>,
  input: AuditInput,
): Promise<void> {
  const { error } = await supabase
    .from("audit_entry")
    .insert(buildAuditRow(input));
  if (error) throw new Error(error.message);
}
