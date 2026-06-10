import { createClient } from "@/lib/supabase/server";
import { listExtractionFields } from "@/lib/extraction/queries";
import { ExtractionFormBuilder } from "@/components/extraction/ExtractionFormBuilder";
import {
  ensureExtractionForm,
  addExtractionField,
  updateExtractionField,
  removeExtractionField,
  reorderExtractionFields,
} from "./actions";

export default async function ExtractionPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  // garante o form 1:1 antes de listar (idempotente, auditado só na criação)
  await ensureExtractionForm(reviewId);
  const supabase = await createClient();
  const fields = await listExtractionFields({ supabase }, reviewId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <ExtractionFormBuilder
        reviewId={reviewId}
        fields={fields}
        onAdd={addExtractionField}
        onUpdate={updateExtractionField}
        onRemove={removeExtractionField}
        onReorder={reorderExtractionFields}
      />
    </div>
  );
}
