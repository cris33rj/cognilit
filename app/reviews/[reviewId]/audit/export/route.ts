import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listAuditTrail } from "@/lib/audit/queries";
import { toAuditJson, toAuditCsv } from "@/lib/audit/export";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Não autenticado", { status: 401 });
  const { data: member, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !member) return new Response("Acesso negado", { status: 403 });

  const format =
    req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const rows = await listAuditTrail(reviewId);
  const body = format === "csv" ? toAuditCsv(rows) : toAuditJson(rows);
  const contentType =
    format === "csv"
      ? "text/csv; charset=utf-8"
      : "application/json; charset=utf-8";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="auditoria-${reviewId}.${format}"`,
    },
  });
}
