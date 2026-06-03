import { getProtocol, listAmendments } from "@/lib/protocol/queries";
import { getByokStatus } from "@/lib/byok/queries";
import { ProtocolEditor } from "@/components/protocol/ProtocolEditor";
import { AmendmentList } from "@/components/protocol/AmendmentList";

export const dynamic = "force-dynamic";

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const [protocol, amendments, byok] = await Promise.all([
    getProtocol(reviewId),
    listAmendments(reviewId),
    getByokStatus(reviewId),
  ]);

  const initialMd =
    protocol && "contentMarkdown" in protocol.content
      ? (protocol.content.contentMarkdown ?? "")
      : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="title-serif">Protocolo PRISMA-P</h1>
        {protocol?.state === "locked" ? (
          <span className="rounded-full border border-line-strong bg-paper-2 px-2 py-0.5 text-xs text-ink-soft">
            🔒 Travado
            {protocol.locked_at
              ? ` em ${new Date(protocol.locked_at).toLocaleDateString("pt-BR")}`
              : ""}
          </span>
        ) : (
          <span className="rounded-full border border-accent bg-accent-wash px-2 py-0.5 text-xs text-accent-deep">
            Rascunho
          </span>
        )}
        <a
          href={`/reviews/${reviewId}/protocol/export`}
          className="ml-auto text-sm underline text-ink-soft"
        >
          Exportar (.md)
        </a>
      </div>

      <ProtocolEditor
        reviewId={reviewId}
        initialMarkdown={initialMd}
        locked={protocol?.state === "locked"}
        canDraft={byok.present}
      />

      <AmendmentList
        reviewId={reviewId}
        amendments={amendments}
        locked={protocol?.state === "locked"}
      />
    </div>
  );
}
