"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getEmbeddingProvider,
  MissingEmbeddingKeyError,
} from "@/lib/ai/embedding";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";
import { enqueueEmbeddingJob } from "@/lib/embedding/enqueue";
import { runEmbeddingBatchWorkerWith } from "@/lib/embedding/batch-run";
import { semanticSearch } from "@/lib/embedding/search";
import { listEmbeddingCandidates } from "@/lib/embedding/queries";
import type { SemanticHit } from "@/lib/ai/embedding/types";

async function requireMember(reviewId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  return data === true;
}

/** Resolve o provider: BYOK 2ª chave quando há; Mock como fallback dev/sem-chave. */
async function resolveProvider(reviewId: string) {
  try {
    return await getEmbeddingProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingEmbeddingKeyError)
      return new MockEmbeddingProvider();
    throw e;
  }
}

export async function estimateEmbeddingBatch(reviewId: string) {
  if (!(await requireMember(reviewId)))
    return { ok: false as const, error: "Sem acesso." };
  const supabase = await createClient();
  const candidates = await listEmbeddingCandidates({ supabase }, reviewId);
  const provider = await resolveProvider(reviewId);
  const estimate = await provider.estimateCost({
    chunkCount: candidates.length * 3,
  });
  return { ok: true as const, documentCount: candidates.length, estimate };
}

export async function runEmbeddingBatch(
  reviewId: string,
  documentIds: string[] | null,
) {
  if (!(await requireMember(reviewId)))
    return { ok: false as const, error: "Sem acesso." };
  const supabase = await createClient();
  const admin = createAdminClient();
  let provider: Awaited<ReturnType<typeof getEmbeddingProvider>>;
  try {
    provider = await getEmbeddingProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingEmbeddingKeyError) {
      return {
        ok: false as const,
        unavailable: true,
        error: "Cadastre a chave de embeddings.",
      };
    }
    throw e;
  }
  const enq = await enqueueEmbeddingJob({ supabase }, reviewId, documentIds);
  await runEmbeddingBatchWorkerWith(admin, provider, reviewId);
  revalidatePath(`/reviews/${reviewId}/search`);
  return { ok: true as const, jobId: enq.job_id, itemCount: enq.item_count };
}

export async function semanticSearchAction(
  reviewId: string,
  query: string,
): Promise<
  | { ok: true; hits: SemanticHit[] }
  | { ok: false; unavailable?: boolean; error: string }
> {
  if (!(await requireMember(reviewId)))
    return { ok: false, error: "Sem acesso." };
  if (query.trim() === "") return { ok: true, hits: [] };
  const supabase = await createClient();
  let provider: Awaited<ReturnType<typeof getEmbeddingProvider>>;
  try {
    provider = await getEmbeddingProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingEmbeddingKeyError) {
      return {
        ok: false,
        unavailable: true,
        error:
          "Busca semântica indisponível: cadastre a 2ª chave (embeddings).",
      };
    }
    throw e;
  }
  const hits = await semanticSearch(
    { supabase, provider },
    reviewId,
    query,
    10,
  );
  return { ok: true, hits };
}

export async function saveEmbeddingKey(reviewId: string, formData: FormData) {
  const { saveByokKey } = await import("@/lib/byok/actions");
  return saveByokKey(reviewId, formData, {
    purpose: "embedding",
    provider: "voyage",
  });
}
