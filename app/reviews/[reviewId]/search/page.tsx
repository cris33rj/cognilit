import { getByokStatus } from "@/lib/byok/queries";
import { listEmbeddingCandidates } from "@/lib/embedding/queries";
import { createClient } from "@/lib/supabase/server";
import { SemanticSearch } from "./SemanticSearch";
import { runEmbeddingBatch, saveEmbeddingKey } from "./actions";

export default async function SearchPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const status = await getByokStatus(reviewId, "embedding");
  const supabase = await createClient();
  const candidates = await listEmbeddingCandidates({ supabase }, reviewId);

  async function runBatch() {
    "use server";
    await runEmbeddingBatch(reviewId, null);
  }

  async function saveKey(formData: FormData) {
    "use server";
    await saveEmbeddingKey(reviewId, formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Busca semântica</h1>
        <p className="text-sm text-gray-600">
          Recupere trechos dos PDFs por significado, ancorados à página e ao
          estudo.
        </p>
      </header>

      <section className="rounded border border-gray-200 p-4">
        <h2 className="text-sm font-medium">
          Chave de embeddings (2ª chave BYOK)
        </h2>
        {status.present ? (
          <p className="mt-1 text-sm text-green-700">
            Chave cadastrada ({status.provider}).
          </p>
        ) : (
          <form action={saveKey} className="mt-2 flex gap-2">
            <input
              name="apiKey"
              type="password"
              placeholder="Chave Voyage AI"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
              Salvar
            </button>
          </form>
        )}
      </section>

      <section className="rounded border border-gray-200 p-4">
        <h2 className="text-sm font-medium">Indexação</h2>
        <p className="mt-1 text-sm text-gray-600">
          {candidates.length} documento(s) processado(s) ainda não indexado(s).
        </p>
        <form action={runBatch} className="mt-2">
          <button
            disabled={!status.present || candidates.length === 0}
            className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Gerar embeddings
          </button>
        </form>
      </section>

      <section>
        <SemanticSearch reviewId={reviewId} searchEnabled={status.present} />
      </section>
    </div>
  );
}
