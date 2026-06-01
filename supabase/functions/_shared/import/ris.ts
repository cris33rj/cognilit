import type { BibliographicParser, ParsedRecord, ParseError } from "./types";

const TAG_RE = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/;

const TITLE_TAGS = ["TI", "T1"];
const AUTHOR_TAGS = ["AU", "A1"];
const YEAR_TAGS = ["PY", "Y1"];
const ABSTRACT_TAGS = ["AB", "N2"];

function emptyAccum(): Record<string, string[]> {
  return {};
}

function buildRecord(fields: Record<string, string[]>): ParsedRecord {
  const first = (tags: string[]): string | null => {
    for (const t of tags) if (fields[t]?.length) return fields[t]![0]!;
    return null;
  };
  const all = (tags: string[]): string[] => {
    const out: string[] = [];
    for (const t of tags) if (fields[t]) out.push(...fields[t]!);
    return out;
  };
  const yearRaw = first(YEAR_TAGS);
  const yearMatch = yearRaw?.match(/\d{4}/);
  return {
    title: first(TITLE_TAGS) ?? "",
    authors: all(AUTHOR_TAGS),
    year: yearMatch ? parseInt(yearMatch[0], 10) : null,
    doi: first(["DO"]),
    abstract: first(ABSTRACT_TAGS),
    language: first(["LA"]),
    raw: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v.length === 1 ? v[0]! : v]),
    ),
  };
}

export const risParser: BibliographicParser = {
  format: "ris",
  parse(content) {
    const errors: ParseError[] = [];
    const records: ParsedRecord[] = [];
    const lines = content.split(/\r\n|\r|\n/);

    let fields = emptyAccum();
    let lastTag: string | null = null;
    let sawAnyTag = false;
    let openRecord = false;

    lines.forEach((line) => {
      if (line.trim() === "") return;
      const m = line.match(TAG_RE);
      if (!m) {
        // linha de continuação do último campo
        if (lastTag && fields[lastTag]?.length) {
          const arr = fields[lastTag]!;
          arr[arr.length - 1] = `${arr[arr.length - 1]} ${line.trim()}`;
        }
        return;
      }
      const [, tag, value] = m;
      sawAnyTag = true;
      if (tag === "TY") {
        fields = emptyAccum();
        openRecord = true;
        lastTag = null;
        return;
      }
      if (tag === "ER") {
        if (openRecord) records.push(buildRecord(fields));
        fields = emptyAccum();
        openRecord = false;
        lastTag = null;
        return;
      }
      (fields[tag!] ??= []).push((value ?? "").trim());
      lastTag = tag!;
    });

    if (!sawAnyTag) {
      errors.push({
        line: 1,
        message:
          "Arquivo RIS inválido: nenhuma tag reconhecida (esperado 'TY  - ...').",
      });
    } else if (openRecord && records.length === 0) {
      errors.push({
        line: lines.length,
        message: "Arquivo RIS inválido: registro sem marcador de fim 'ER  -'.",
      });
    }

    return { records, errors, format: "ris" };
  },
};
