import { describe, it, expect, beforeAll } from "vitest";
import { serviceClient, signUpUser } from "./helpers/supabase";

async function newReview(
  client: Awaited<ReturnType<typeof signUpUser>>["client"],
  title: string,
) {
  const { data, error } = await client.rpc("create_review", { p_title: title });
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function seedRecord(
  reviewId: string,
  corpusState: string,
): Promise<string> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo PDF" },
      corpus_state: corpusState,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

describe("RLS — document (Fatia 1, SC-011)", () => {
  let aClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let bClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewA: string;
  let recordA: string;
  let docId: string;

  beforeAll(async () => {
    const s = Date.now();
    aClient = (await signUpUser(`doca_${s}@example.com`, "senha-teste-123"))
      .client;
    bClient = (await signUpUser(`docb_${s}@example.com`, "senha-teste-123"))
      .client;
    reviewA = await newReview(aClient, "Revisão A");
    recordA = await seedRecord(reviewA, "included_ft");

    // Insere um document diretamente (service role) para testar leitura sob RLS.
    const svc = serviceClient();
    const { data, error } = await svc
      .from("document")
      .insert({
        review_id: reviewA,
        record_id: recordA,
        storage_path: `review/${reviewA}/record/${recordA}/seed.pdf`,
        filename: "seed.pdf",
        byte_size: 1234,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    docId = data.id;
  });

  it("membro da Revisão lê o document", async () => {
    const { data, error } = await aClient
      .from("document")
      .select("id, processing_status")
      .eq("id", docId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.processing_status).toBe("queued");
  });

  it("não-membro NÃO lê o document de outra Revisão", async () => {
    const { data } = await bClient
      .from("document")
      .select("id")
      .eq("id", docId)
      .maybeSingle();
    expect(data).toBeNull();
  });
});
