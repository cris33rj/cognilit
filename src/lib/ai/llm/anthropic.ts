import Anthropic from "@anthropic-ai/sdk";
import type {
  CostEstimate,
  EligibilityDerivation,
  LLMProvider,
  LlmSuggestion,
  OcrResult,
  ProtocolDraft,
  ProviderIdentity,
  ScreeningPreclassification,
} from "./types";
import { estimateScreeningCost } from "./cost";

const MODEL = "claude-opus-4-8"; // default D14
const PT_BR = "Responda SEMPRE em português brasileiro (pt-BR).";

function nowIso() {
  return new Date().toISOString();
}

/** Extrai o primeiro bloco de texto da resposta. */
function textOf(msg: Anthropic.Message): string {
  const block = msg.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  identity(): ProviderIdentity {
    return { provider: "anthropic", model: MODEL, version: MODEL };
  }

  private async ask(system: string, user: string): Promise<string> {
    const msg = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: `${PT_BR}\n${system}`,
      messages: [{ role: "user", content: user }],
    });
    return textOf(msg);
  }

  async deriveEligibility(input: {
    framework: string;
    questionText: string;
    fields: Record<string, unknown>;
  }): Promise<LlmSuggestion<EligibilityDerivation>> {
    const prompt = `Framework: ${input.framework}\nPergunta: ${input.questionText}\nCampos: ${JSON.stringify(input.fields)}\n\nRetorne JSON {"inclusion":[],"exclusion":[],"searchTerms":[]}.`;
    if (input.questionText.trim() === "") {
      return {
        output: { inclusion: [], exclusion: [], searchTerms: [] },
        provenance: {
          model: MODEL,
          version: MODEL,
          prompt_or_span: prompt,
          timestamp: nowIso(),
        },
        state: "pending",
        not_found: true,
      };
    }
    const raw = await this.ask(
      "Você é um metodologista de revisões sistemáticas.",
      prompt,
    );
    const parsed = safeParse<EligibilityDerivation>(raw, {
      inclusion: [],
      exclusion: [],
      searchTerms: [],
    });
    return {
      output: parsed,
      provenance: {
        model: MODEL,
        version: MODEL,
        prompt_or_span: prompt,
        timestamp: nowIso(),
      },
      state: "pending",
      not_found: false,
    };
  }

  async draftProtocol(input: {
    questionText: string;
    criteria: string[];
  }): Promise<LlmSuggestion<ProtocolDraft>> {
    const prompt = `Pergunta: ${input.questionText}\nCritérios: ${input.criteria.join("; ")}\n\nRascunhe um protocolo PRISMA-P em Markdown.`;
    const md = await this.ask(
      "Você redige protocolos PRISMA-P de revisões sistemáticas.",
      prompt,
    );
    return {
      output: { contentMarkdown: md },
      provenance: {
        model: MODEL,
        version: MODEL,
        prompt_or_span: prompt,
        timestamp: nowIso(),
      },
      state: "pending",
      not_found: md.trim() === "",
    };
  }

  async preclassifyScreening(input: {
    title: string;
    abstract: string | null;
    criteria: string[];
  }): Promise<LlmSuggestion<ScreeningPreclassification>> {
    const prompt = `Título: ${input.title}\nResumo: ${input.abstract ?? "(sem resumo)"}\nCritérios: ${input.criteria.join("; ")}\n\nRetorne JSON {"recommendation":"include|exclude","confidence":0..1,"reason":"..."}.`;
    const raw = await this.ask(
      "Você pré-classifica registros para triagem; NUNCA decide sozinho.",
      prompt,
    );
    const parsed = safeParse<ScreeningPreclassification>(raw, {
      recommendation: "include",
      confidence: 0.5,
      reason: "Não foi possível classificar.",
    });
    return {
      output: parsed,
      provenance: {
        model: MODEL,
        version: MODEL,
        prompt_or_span: prompt,
        timestamp: nowIso(),
      },
      state: "pending",
      not_found: false,
    };
  }

  async ocrPage(input: {
    imageBase64: string;
    mediaType: "image/png" | "image/jpeg";
    page: number;
  }): Promise<LlmSuggestion<OcrResult>> {
    const prompt = `Transcreva fielmente TODO o texto desta página de PDF escaneada (página ${input.page}). Preserve o idioma original. Responda só com o texto, sem comentários.`;
    const msg = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: "Você faz OCR fiel; não traduz, não resume.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mediaType,
                data: input.imageBase64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const text = textOf(msg);
    return {
      output: { text },
      provenance: {
        model: MODEL,
        version: MODEL,
        prompt_or_span: prompt,
        timestamp: nowIso(),
      },
      state: "pending",
      not_found: text.trim() === "", // página em branco ou OCR sem texto
    };
  }

  async estimateCost(input: {
    itemCount: number;
    kind: "ai_screening_batch";
  }): Promise<CostEstimate> {
    return estimateScreeningCost(input.itemCount);
  }
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as T) : fallback;
  } catch {
    return fallback;
  }
}
