import { describe, it, expect } from "vitest";
import { setupReview, seedDoc } from "./embedding-batch.test";
import { enqueueEmbeddingJob } from "@/lib/embedding/enqueue";
import { processEmbeddingJob } from "@/lib/embedding/batch-worker";
import { semanticSearch } from "@/lib/embedding/search";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";

describe("semanticSearch (US5/FR-024)", () => {
  it("retorna trechos ancorados (page + source_span + estudo)", async () => {
    const { client, reviewId, svc } = await setupReview();
    const { recordId } = await seedDoc(svc, reviewId, {
      pages: ["Amostra de 42 participantes adultos."],
    });
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      enq.job_id,
    );

    const hits = await semanticSearch(
      { supabase: client, provider: new MockEmbeddingProvider() },
      reviewId,
      "quantos participantes",
      5,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.page).toBeGreaterThanOrEqual(1);
    expect(hits[0]!.source_span.length).toBeGreaterThan(0);
    expect(hits[0]!.record_id).toBe(recordId);
    expect(typeof hits[0]!.similarity).toBe("number");
  });
});
