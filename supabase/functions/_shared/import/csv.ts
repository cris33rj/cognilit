import Papa from "papaparse";
import type { BibliographicParser, ParsedRecord, ParseError } from "./types";

const DEFAULT_MAP: Record<string, string> = {
  title: "title",
  authors: "authors",
  year: "year",
  doi: "doi",
  abstract: "abstract",
  language: "language",
};

function splitAuthors(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function toYear(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export const csvParser: BibliographicParser = {
  format: "csv",
  parse(content, opts) {
    const map = { ...DEFAULT_MAP, ...(opts?.fieldMap ?? {}) };
    const errors: ParseError[] = [];
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });
    for (const e of parsed.errors) {
      errors.push({
        line: e.row ?? null,
        message: `Erro de CSV: ${e.message}`,
      });
    }
    const colTitle = map["title"] ?? "title";
    const colAuthors = map["authors"] ?? "authors";
    const colYear = map["year"] ?? "year";
    const colDoi = map["doi"] ?? "doi";
    const colAbstract = map["abstract"] ?? "abstract";
    const colLanguage = map["language"] ?? "language";

    const records: ParsedRecord[] = (parsed.data ?? [])
      .filter((row) => (row[colTitle] ?? "").trim().length > 0)
      .map((row) => ({
        title: (row[colTitle] ?? "").trim(),
        authors: splitAuthors(row[colAuthors]),
        year: toYear(row[colYear]),
        doi: (row[colDoi] ?? "").trim() || null,
        abstract: (row[colAbstract] ?? "").trim() || null,
        language: (row[colLanguage] ?? "").trim() || null,
        raw: row,
      }));
    return { records, errors, format: "csv" };
  },
};
