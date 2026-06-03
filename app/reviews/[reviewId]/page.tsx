import { notFound } from "next/navigation";
import { getReviewById } from "@/lib/reviews/queries";

export const dynamic = "force-dynamic";

export default async function ReviewHomePage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const review = await getReviewById(reviewId);
  if (!review) {
    notFound();
  }
  return (
    <section>
      <h1 className="title-serif">{review.title}</h1>
      <p className="mt-2 text-ink-soft">
        Contexto da Revisão ativa. As fases (Pergunta, Protocolo, Workbench)
        entram nas próximas fatias.
      </p>
    </section>
  );
}
