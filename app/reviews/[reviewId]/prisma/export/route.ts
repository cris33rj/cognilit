// app/reviews/[reviewId]/prisma/export/route.ts
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPrismaFlowModel } from "@/lib/prisma/flow-model";
import { renderPrismaSvg } from "@/lib/prisma/svg";
import { renderPrismaPng } from "@/lib/prisma/png";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // resvg-wasm precisa do runtime Node (A2)

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

  const model = await loadPrismaFlowModel(reviewId);
  const svg = renderPrismaSvg(model);
  const format =
    req.nextUrl.searchParams.get("format") === "png" ? "png" : "svg";

  if (format === "png") {
    const png = await renderPrismaPng(svg);
    return new Response(Buffer.from(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="prisma-${reviewId}.png"`,
      },
    });
  }
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="prisma-${reviewId}.svg"`,
    },
  });
}
