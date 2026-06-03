"use client";

import { createReview } from "../../../app/reviews/actions";

export function CreateReviewForm({ error }: { error?: string }) {
  return (
    <form action={createReview} className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <label className="flex flex-col gap-1">
        Título da Revisão
        <input name="title" type="text" required className="control" />
      </label>
      <button type="submit" className="btn-primary">
        Criar Revisão
      </button>
    </form>
  );
}
