import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "@/lib/ai/llm/mock";

describe("MockLLMProvider.ocrPage (R2)", () => {
  it("retorna texto determinístico com proveniência e estado pending", async () => {
    const provider = new MockLLMProvider();
    const res = await provider.ocrPage({
      imageBase64: "ZmFrZQ==",
      mediaType: "image/png",
      page: 3,
    });
    expect(res.output.text).toContain("[OCR p.3]");
    expect(res.provenance).toHaveProperty("model");
    expect(res.state).toBe("pending");
    expect(res.not_found).toBe(false);
  });
});
