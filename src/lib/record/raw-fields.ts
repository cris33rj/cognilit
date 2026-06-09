import type { SourceFormat } from "@shared/import/types";

export interface RawExtractedFields {
  journal: string | null;
  keywords: string[];
  volume: string | null;
  issue: string | null;
  pages: string | null;
}

type Raw = Record<string, unknown>;

/** Primeiro string não-vazio de um valor que pode ser string, número ou array. */
function firstStr(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstStr(x);
      if (s) return s;
    }
  }
  return null;
}

/** Lista de strings: array → achata; string → divide por ';' ou ','. */
function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(toList);
  if (typeof v === "string") {
    return v
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

/** Lookup case-insensitive da primeira chave candidata presente. */
function pick(raw: Raw, candidates: string[]): unknown {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(raw)) lower.set(k.toLowerCase(), v);
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit !== undefined && hit !== null) return hit;
  }
  return undefined;
}

interface KeyMap {
  journal: string[];
  keywords: string[];
  volume: string[];
  issue: string[];
  pages: string[];
  startPage: string[];
  endPage: string[];
}

const KEYS: Record<SourceFormat, KeyMap> = {
  ris: {
    journal: ["JO", "JF", "T2"],
    keywords: ["KW"],
    volume: ["VL"],
    issue: ["IS"],
    pages: [],
    startPage: ["SP"],
    endPage: ["EP"],
  },
  bibtex: {
    journal: ["journal", "journaltitle", "booktitle"],
    keywords: ["keywords", "keyword"],
    volume: ["volume"],
    issue: ["number", "issue"],
    pages: ["pages"],
    startPage: [],
    endPage: [],
  },
  csv: {
    journal: [
      "journal",
      "source",
      "publication",
      "journal title",
      "source title",
    ],
    keywords: ["keywords", "keyword", "author keywords"],
    volume: ["volume", "vol"],
    issue: ["issue", "number", "no"],
    pages: ["pages", "page"],
    startPage: [],
    endPage: [],
  },
};

export function extractRawFields(
  format: SourceFormat,
  raw: unknown,
): RawExtractedFields {
  const r: Raw = raw && typeof raw === "object" ? (raw as Raw) : {};
  const keys = KEYS[format];
  let pages = firstStr(pick(r, keys.pages));
  if (!pages) {
    const sp = firstStr(pick(r, keys.startPage));
    const ep = firstStr(pick(r, keys.endPage));
    if (sp && ep) pages = `${sp}–${ep}`;
    else pages = sp ?? null;
  }
  return {
    journal: firstStr(pick(r, keys.journal)),
    keywords: toList(pick(r, keys.keywords)),
    volume: firstStr(pick(r, keys.volume)),
    issue: firstStr(pick(r, keys.issue)),
    pages,
  };
}
