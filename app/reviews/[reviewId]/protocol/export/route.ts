import { getProtocol } from "@/lib/protocol/queries";
import { protocolToMarkdown } from "@/lib/protocol/markdown";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;
  const protocol = await getProtocol(reviewId); // RLS garante o escopo
  if (!protocol)
    return new Response("Protocolo não encontrado", { status: 404 });

  const md = protocolToMarkdown(protocol.content);
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="protocolo-${reviewId}.md"`,
    },
  });
}
