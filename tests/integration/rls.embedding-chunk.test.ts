import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { seedDoc } from "./embedding-batch.test";
import { enqueueEmbeddingJob } from "@/lib/embedding/enqueue";
import { processEmbeddingJob } from "@/lib/embedding/batch-worker";
import { semanticSearch } from "@/lib/embedding/search";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";

describe("isolamento RLS de embedding_chunk (SC-008/SC-011)", () => {
  it("a busca de A nunca retorna chunk da Revisão de B", async () => {
    const svc = serviceClient();

    const { client: ca } = await signUpUser(
      `a_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: ra } = await ca.rpc("create_review", { p_title: "A" });
    const reviewA = ra!.id as string;
    await seedDoc(svc, reviewA, { pages: ["conteúdo exclusivo da revisão A"] });
    const ea = await enqueueEmbeddingJob({ supabase: ca }, reviewA, null);
    await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      ea.job_id,
    );

    const { client: cb } = await signUpUser(
      `b_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: rb } = await cb.rpc("create_review", { p_title: "B" });
    const reviewB = rb!.id as string;

    const hitsB = await semanticSearch(
      { supabase: cb, provider: new MockEmbeddingProvider() },
      reviewB,
      "conteúdo exclusivo da revisão A",
      10,
    );
    expect(hitsB).toHaveLength(0);

    await expect(
      semanticSearch(
        { supabase: cb, provider: new MockEmbeddingProvider() },
        reviewA,
        "qualquer",
        10,
      ),
    ).rejects.toThrow();

    const { data: leak } = await cb
      .from("embedding_chunk")
      .select("id")
      .eq("review_id", reviewA);
    expect((leak ?? []).length).toBe(0);
  });
});
