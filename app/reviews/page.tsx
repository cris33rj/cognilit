import Link from "next/link";
import { listMyReviews } from "@/lib/reviews/queries";

export default async function ReviewsPage() {
  const reviews = await listMyReviews();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="title-serif">Minhas Revisões</h1>
        <Link href="/reviews/new" className="btn-primary">
          Nova Revisão
        </Link>
      </div>
      {reviews.length === 0 ? (
        <p className="text-ink-soft">Nenhuma revisão ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reviews/${r.id}`}
                className="panel block text-ink hover:border-line-strong"
              >
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
