import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

describe("BYOK via Supabase Vault (R5/FR-032)", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const u = await signUpUser(`k_${stamp}@example.com`, "senha-teste-123");
    client = u.client;
    const { data: r } = await client.rpc("create_review", {
      p_title: "R BYOK",
    });
    reviewId = r.id;
  });

  it("set_byok_key grava metadados e cifra o segredo no Vault", async () => {
    const { error } = await client.rpc("set_byok_key", {
      p_review_id: reviewId,
      p_provider: "anthropic",
      p_api_key: "sk-ant-teste-123",
    });
    expect(error).toBeNull();
    const { data } = await client
      .from("byok_key")
      .select("provider, vault_secret_id")
      .eq("review_id", reviewId)
      .single();
    expect(data!.provider).toBe("anthropic");
    expect(data!.vault_secret_id).toBeTruthy();
  });

  it("authenticated NÃO pode chamar get_byok_secret (decifragem só server-side)", async () => {
    const { error } = await client.rpc("get_byok_secret", {
      p_review_id: reviewId,
    });
    expect(error).not.toBeNull(); // permissão negada
  });

  it("service_role decifra o segredo original", async () => {
    const admin = serviceClient();
    const { data, error } = await admin.rpc("get_byok_secret", {
      p_review_id: reviewId,
    });
    expect(error).toBeNull();
    expect(data?.[0]?.api_key).toBe("sk-ant-teste-123");
  });
});
