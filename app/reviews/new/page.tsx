import { CreateReviewForm } from "@/components/reviews/CreateReviewForm";

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-6">
      <p className="eyebrow mb-1">Revisão</p>
      <h1 className="title-serif mb-4">Nova Revisão</h1>
      <CreateReviewForm error={error} />
    </main>
  );
}
