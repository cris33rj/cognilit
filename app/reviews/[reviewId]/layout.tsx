import { notFound } from "next/navigation";
import { getReviewById, listMyReviews } from "@/lib/reviews/queries";
import { ReviewSwitcher } from "@/components/reviews/ReviewSwitcher";

export const dynamic = "force-dynamic";

export default async function ReviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const active = await getReviewById(reviewId);
  if (!active) {
    notFound();
  }
  const reviews = await listMyReviews();
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 border-b p-4">
        <a href="/reviews" className="text-sm underline">
          Minhas Revisões
        </a>
        <a href="/reviews/new" className="text-sm underline">
          Nova Revisão
        </a>
        <ReviewSwitcher reviews={reviews} activeId={active.id} />
        <nav className="flex gap-3 text-sm">
          <a href={`/reviews/${active.id}/question`} className="underline">
            Pergunta
          </a>
          <a href={`/reviews/${active.id}/protocol`} className="underline">
            Protocolo
          </a>
        </nav>
        <form action="/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="text-sm underline">
            Sair
          </button>
        </form>
      </header>
      <div className="p-6">{children}</div>
    </div>
  );
}
