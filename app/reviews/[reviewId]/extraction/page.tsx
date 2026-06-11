import { createClient } from "@/lib/supabase/server";
import {
  listExtractionFields,
  listStudies,
  listExtractionValues,
  listExtractionBatchCandidates,
} from "@/lib/extraction/queries";
import { ExtractionFormBuilder } from "@/components/extraction/ExtractionFormBuilder";
import { ExtractionRunner } from "@/components/extraction/ExtractionRunner";
import { ExtractionBatchRunner } from "@/components/extraction/ExtractionBatchRunner";
import {
  ensureExtractionForm,
  addExtractionField,
  updateExtractionField,
  removeExtractionField,
  reorderExtractionFields,
  runExtraction,
  ratifyExtractionValue,
  estimateExtractionBatch,
  runExtractionBatch,
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
  const studies = await listStudies({ supabase }, reviewId);
  const batchCandidates = await listExtractionBatchCandidates(
    { supabase },
    reviewId,
  );
  const valuesByStudy = await Promise.all(
    studies.map((s) => listExtractionValues({ supabase }, reviewId, s.id)),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <ExtractionFormBuilder
        reviewId={reviewId}
        fields={fields}
        onAdd={addExtractionField}
        onUpdate={updateExtractionField}
        onRemove={removeExtractionField}
        onReorder={reorderExtractionFields}
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Extração em lote</h2>
        <p className="text-sm text-ink-soft">
          Rode a extração por IA sobre vários estudos de uma vez. A estimativa
          de custo aparece antes da execução.
        </p>
        <div className="panel p-4">
          <ExtractionBatchRunner
            reviewId={reviewId}
            candidates={batchCandidates}
            onEstimate={estimateExtractionBatch}
            onRun={runExtractionBatch}
          />
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold">Estudos para extração</h2>
        {studies.length === 0 && (
          <p className="text-sm text-ink-faint">
            Nenhum estudo incluído no Texto completo ainda.
          </p>
        )}
        {studies.map((s, i) => (
          <div key={s.id} className="panel space-y-3 p-4">
            <h3 className="text-sm font-semibold">{s.title}</h3>
            <ExtractionRunner
              reviewId={reviewId}
              recordId={s.id}
              fields={fields}
              values={valuesByStudy[i]!}
              onRun={runExtraction}
              onRatify={ratifyExtractionValue}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
