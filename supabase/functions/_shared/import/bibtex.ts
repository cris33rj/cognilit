import { parse } from "@retorquere/bibtex-parser";
import type { BibliographicParser, ParsedRecord, ParseError } from "./types";

/** Shape of a creator object as returned by @retorquere/bibtex-parser v10. */
interface Creator {
  lastName?: string;
  firstName?: string;
}

/**
 * Format a creator object as "LastName, FirstName".
 * Falls back to whichever part is present.
 */
function formatCreator(c: unknown): string {
  if (typeof c !== "object" || c === null) return String(c);
  const { lastName, firstName } = c as Creator;
  if (lastName && firstName) return `${lastName}, ${firstName}`;
  if (lastName) return lastName;
  if (firstName) return firstName;
  return "";
}

/**
 * Extract the author list from entry.fields.author.
 *
 * In v10, `fields.author` is an Array<{lastName, firstName}> when present.
 * If the field is absent, returns an empty array.
 */
function authorsFrom(authorField: unknown): string[] {
  if (!Array.isArray(authorField)) return [];
  return authorField.map(formatCreator).filter((s) => s.length > 0);
}

/**
 * Coerce a field value to string | null.
 * v10 returns literal fields as plain strings; title is also a string.
 */
function asString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  return null;
}

function toYear(value: unknown): number | null {
  const s = asString(value);
  if (!s) return null;
  const m = s.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Convert an entry's fields to a plain Record<string, unknown> for `raw`,
 * omitting undefined values.
 */
function rawFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export const bibtexParser: BibliographicParser = {
  format: "bibtex",
  parse(content) {
    const errors: ParseError[] = [];

    if (!content.trim()) {
      errors.push({
        line: 1,
        message:
          "Arquivo BibTeX inválido: conteúdo vazio (nenhuma entrada encontrada).",
      });
      return { records: [], errors, format: "bibtex" };
    }

    const result = parse(content, {
      verbatim: [],
      errorHandler: () => {
        // library's own error handler; errors surface via result.errors
      },
    });

    // Propagate library-level errors (unknown format issues)
    for (const e of result.errors ?? []) {
      errors.push({
        line: null,
        message: `Erro de parsing BibTeX: ${String(e)}`,
      });
    }

    const records: ParsedRecord[] = (result.entries ?? []).map((entry) => {
      const fields = (entry.fields ?? {}) as Record<string, unknown>;
      return {
        title: asString(fields["title"]) ?? "",
        authors: authorsFrom(fields["author"]),
        year: toYear(fields["year"]),
        doi: asString(fields["doi"]),
        abstract: asString(fields["abstract"]),
        language: asString(fields["language"]),
        raw: rawFields(fields),
      };
    });

    if (records.length === 0 && errors.length === 0) {
      errors.push({
        line: null,
        message:
          "Arquivo BibTeX inválido: nenhuma entrada reconhecida (esperado '@tipo{chave, ...}').",
      });
    }

    return { records, errors, format: "bibtex" };
  },
};
