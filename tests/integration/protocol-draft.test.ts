// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { AnthropicProvider } from "@/lib/ai/llm/anthropic";

const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
const QUESTION =
  "Qual a eficácia de intervenções de telessaúde no controle glicêmico de adultos com diabetes tipo 2?";

describe("rascunho de protocolo — API Anthropic real (US6/FR-009)", () => {
  beforeAll(() => {
    // Decisão do usuário: SEM chave o teste FALHA (não faz skip).
    expect(
      apiKey,
      "ANTHROPIC_API_KEY ausente no ambiente de teste — necessário para o teste de API real",
    ).toBeTruthy();
  });

  it("draftProtocol (Anthropic real) retorna Markdown e proveniência", async () => {
    const provider = new AnthropicProvider(apiKey);
    const s = await provider.draftProtocol({
      questionText: QUESTION,
      criteria: [
        "Incluir: ensaios clínicos randomizados com adultos diagnosticados com diabetes tipo 2",
        "Excluir: estudos sem grupo de comparação",
      ],
    });

    // proveniência obrigatória, real (FR-031, §II)
    expect(s.provenance.model).toBeTruthy();
    expect(s.provenance.version).toBeTruthy();
    expect(s.provenance.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);

    expect(s.state).toBe("pending");
    expect(typeof s.output.contentMarkdown).toBe("string");
    expect(s.output.contentMarkdown.trim().length).toBeGreaterThan(0);
    expect(s.not_found).toBe(false);
  }, 60000);
});
