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
        Use o trilho de fases para avançar pela Revisão: da pergunta ao
        relatório final.
      </p>
      <p className="mt-4">
        <a
          className="text-accent-deep hover:underline"
          href={`/reviews/${reviewId}/prisma`}
        >
          Ver fluxograma PRISMA 2020
        </a>
      </p>
    </section>
  );
}
