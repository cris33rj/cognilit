// src/components/prisma/PrismaFlowchart.tsx
import { renderPrismaSvg } from "@/lib/prisma/svg";
import type { PrismaFlowModel } from "@/lib/prisma/flow-model";

export function PrismaFlowchart({
  reviewId,
  model,
}: {
  reviewId: string;
  model: PrismaFlowModel;
}) {
  const svg = renderPrismaSvg(model);
  return (
    <section>
      <div className="mb-4 flex items-center gap-4">
        <h1 className="title-serif text-xl">Fluxograma PRISMA 2020</h1>
        <a
          className="text-sm text-ink-soft hover:text-ink"
          href={`/reviews/${reviewId}/prisma/export?format=svg`}
        >
          Baixar SVG
        </a>
        <a
          className="text-sm text-ink-soft hover:text-ink"
          href={`/reviews/${reviewId}/prisma/export?format=png`}
        >
          Baixar PNG
        </a>
      </div>
      {model.partial && (
        <p
          role="status"
          className="mb-3 rounded border border-warn bg-accent-wash px-3 py-2 text-sm text-warn"
        >
          Números parciais — a triagem ainda não foi concluída.
        </p>
      )}
      <div
        className="overflow-auto rounded border border-line bg-paper-card p-4"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </section>
  );
}
