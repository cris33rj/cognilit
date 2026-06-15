// app/reviews/[reviewId]/report/export/[artifactId]/route.ts
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXT: Record<string, string> = {
  md: "md",
  bibtex: "bib",
  ris: "ris",
  docx: "docx",
  pdf: "pdf",
  prisma_svg: "svg",
  prisma_png: "png",
};
const MIME: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  bibtex: "application/x-bibtex; charset=utf-8",
  ris: "application/x-research-info-systems; charset=utf-8",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reviewId: string; artifactId: string }> },
) {
  const { reviewId, artifactId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Não autenticado", { status: 401 });
  const { data: member, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !member) return new Response("Acesso negado", { status: 403 });

  const { data: art } = await supabase
    .from("export_artifact")
    .select("format, storage_path")
    .eq("id", artifactId)
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!art) return new Response("Artefato não encontrado", { status: 404 });

  const { format, storage_path } = art as {
    format: string;
    storage_path: string;
  };
  const { data: blob, error: dlErr } = await supabase.storage
    .from("exports")
    .download(storage_path);
  if (dlErr || !blob) return new Response("Falha no download", { status: 500 });

  const buf = Buffer.from(await blob.arrayBuffer());
  return new Response(buf, {
    headers: {
      "Content-Type": MIME[format] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="relatorio-${reviewId}.${EXT[format] ?? "bin"}"`,
    },
  });
}
