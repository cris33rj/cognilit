import Anthropic from "@anthropic-ai/sdk";
import type {
  CostEstimate,
  EligibilityDerivation,
  ExtractedField,
  ExtractionFieldDef,
  ExtractionResult,
  LLMProvider,
  LlmSuggestion,
  OcrResult,
  ProtocolDraft,
  ProviderIdentity,
  ScreeningPreclassification,
  SynthesisFinding,
  SynthesizeThemesResult,
} from "./types";
import {
  estimateScreeningCost,
  estimateExtractionCost,
  estimateSynthesisCost,
} from "./cost";

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

  async estimateCost(
    input:
      | { itemCount: number; kind: "ai_screening_batch" }
      | { itemCount: number; kind: "ai_extraction_batch"; fieldCount: number }
      | { itemCount: number; kind: "synthesis_batch" },
  ): Promise<CostEstimate> {
    if (input.kind === "ai_extraction_batch") {
      return estimateExtractionCost(input.itemCount, input.fieldCount);
    }
    if (input.kind === "synthesis_batch") {
      return estimateSynthesisCost(input.itemCount);
    }
    return estimateScreeningCost(input.itemCount);
  }

  async synthesizeThemes(input: {
    findings: SynthesisFinding[];
    language: "pt-BR";
  }): Promise<SynthesizeThemesResult> {
    if (input.findings.length === 0) return { insufficientData: true };

    // Grounding refs are exchanged as stable 1-based indices: LLMs echo short
    // integers far more reliably than 36-char UUIDs. We map them back server-side
    // (a verbatim UUID is still accepted defensively). This preserves the §II
    // guarantee — a theme with no resolvable ref is dropped — without depending on
    // the model reproducing UUIDs exactly.
    const byIndex = new Map<number, string>();
    const byId = new Set<string>();
    const findingLines = input.findings
      .map((f, i) => {
        const n = i + 1;
        byIndex.set(n, f.extractionValueId);
        byId.add(f.extractionValueId);
        return `[${n}] campo=${f.fieldName} | valor=${JSON.stringify(f.value)}`;
      })
      .join("\n");

    const prompt =
      `Agrupe os achados abaixo em temas qualitativos para uma revisão sistemática.\n` +
      `REGRAS OBRIGATÓRIAS:\n` +
      `1. Cada tema DEVE conter pelo menos um findingRef.\n` +
      `2. findingRefs é a lista dos NÚMEROS [n] dos achados que sustentam o tema ` +
      `(ex.: [2, 5]). Use somente os números fornecidos; não invente.\n` +
      `3. Narrativa em pt-BR.\n` +
      `4. Não crie temas sem ancoragem nos achados.\n\n` +
      `Achados:\n${findingLines}\n\n` +
      `Retorne SOMENTE JSON: {"themes":[{"name":"...","narrative":"...","findingRefs":[1,2]}]}.`;

    const msg = await this.client.messages.create({
      model: MODEL,
      max_tokens: Math.min(8000, 1024 + input.findings.length * 200),
      system: `${PT_BR}\nVocê sintetiza achados de revisões sistemáticas em temas qualitativos; nunca inventa dados.`,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = textOf(msg);
    const parsed = safeParse<{
      themes: Array<{
        name?: string;
        narrative?: string;
        findingRefs?: Array<number | string>;
      }>;
    }>(raw, { themes: [] });

    const prov = {
      model: MODEL,
      version: MODEL,
      prompt_or_span: prompt,
      timestamp: nowIso(),
    };

    const rawThemes = Array.isArray(parsed.themes) ? parsed.themes : [];
    const themes = rawThemes
      .map((t) => {
        const refs = (t.findingRefs ?? [])
          .map((r) => {
            if (typeof r === "number") return byIndex.get(r) ?? null;
            const s = String(r).trim();
            if (byId.has(s)) return s; // already a verbatim extractionValueId
            const n = Number(s);
            return Number.isInteger(n) ? (byIndex.get(n) ?? null) : null;
          })
          .filter((id): id is string => id !== null);
        return {
          name: t.name ?? "",
          narrative: t.narrative ?? "",
          findingRefs: [...new Set(refs)], // §II/FR-007: only resolvable anchors
          provenance: prov,
        };
      })
      // Drop any theme whose findingRefs is empty after mapping (§II)
      .filter((t) => t.findingRefs.length > 0);

    if (themes.length === 0) {
      console.warn(
        `[synthesis] synthesizeThemes produced no usable themes: ` +
          `findings=${input.findings.length}, rawLen=${raw.length}, parsedThemes=${rawThemes.length}`,
      );
      return { insufficientData: true };
    }
    return { themes };
  }

  async extractFields(input: {
    fields: ExtractionFieldDef[];
    documentText: string;
    pageIndex?: { page: number; char_start: number; char_end: number }[];
  }): Promise<ExtractionResult> {
    const fieldSpec = input.fields
      .map(
        (f) =>
          `- ${f.name} (id=${f.id}, tipo=${f.type}${f.options ? `, opções=${f.options.join("|")}` : ""})`,
      )
      .join("\n");
    const prompt =
      `Extraia os campos abaixo SOMENTE a partir do texto do documento.\n` +
      `Para cada campo retorne um objeto: {"field_id","value","source_span","page","inferred"}.\n` +
      `Se o valor NÃO constar no texto, use value=null e source_span=null (não invente).\n` +
      `Marque inferred=true quando o valor for deduzido sem trecho literal.\n` +
      `O source_span deve ser citado no IDIOMA ORIGINAL do documento.\n\n` +
      `Campos:\n${fieldSpec}\n\nTexto:\n${input.documentText}\n\n` +
      `Retorne JSON {"fields":[...]}.`;
    const msg = await this.client.messages.create({
      model: MODEL,
      max_tokens: Math.min(8000, 1024 + input.fields.length * 256),
      system: `${PT_BR}\nVocê extrai dados de estudos para revisões sistemáticas; nunca inventa valores.`,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = textOf(msg);
    const parsed = safeParse<{ fields: Array<Record<string, unknown>> }>(raw, {
      fields: [],
    });
    const byId = new Map(parsed.fields.map((r) => [String(r.field_id), r]));
    const fields: ExtractedField[] = input.fields.map((f) => {
      const r = byId.get(f.id);
      const value =
        r && r.value !== null && r.value !== undefined ? r.value : null;
      const page = r && typeof r.page === "number" ? r.page : null;
      const span =
        r && typeof r.source_span === "string" ? r.source_span : null;
      const inferred = !!(r && r.inferred === true);
      if (value === null) {
        return {
          field_id: f.id,
          value: {
            value: null,
            source_span: null,
            page: null,
            reason: "not_found",
          },
          inferred,
          grounding: {
            text_layer_id: null,
            page: null,
            source_span: null,
            origin: null,
          },
        };
      }
      return {
        field_id: f.id,
        value: { value, source_span: span, page },
        inferred,
        grounding: {
          text_layer_id: null,
          page,
          source_span: span,
          origin: null,
        },
      };
    });
    return {
      fields,
      provenance: {
        model: MODEL,
        version: MODEL,
        prompt_or_span: prompt,
        timestamp: nowIso(),
      },
    };
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
