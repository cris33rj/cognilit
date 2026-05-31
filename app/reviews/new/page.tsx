import { CreateReviewForm } from "@/components/reviews/CreateReviewForm";

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">Nova Revisão</h1>
      <CreateReviewForm error={error} />
    </main>
  );
}
