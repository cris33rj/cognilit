import Link from "next/link";
import { listMyReviews } from "@/lib/reviews/queries";

export default async function ReviewsPage() {
  const reviews = await listMyReviews();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Minhas Revisões</h1>
        <Link
          href="/reviews/new"
          className="bg-black px-4 py-2 text-sm text-white"
        >
          Nova Revisão
        </Link>
      </div>
      {reviews.length === 0 ? (
        <p className="text-gray-500">Nenhuma revisão ainda.</p>
      ) : (
        <ul className="divide-y border">
          {reviews.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reviews/${r.id}`}
                className="block border p-3 hover:bg-gray-50"
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
