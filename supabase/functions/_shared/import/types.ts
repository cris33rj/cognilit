export type SourceFormat = "ris" | "bibtex" | "csv";

export interface ParsedRecord {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  abstract: string | null;
  language: string | null; // original (FR-038)
  raw: Record<string, unknown>; // campos originais íntegros
}

export interface ParseError {
  line: number | null;
  message: string; // pt-BR, claro (FR-016)
}

export interface ParseResult {
  records: ParsedRecord[];
  errors: ParseError[];
  format: SourceFormat;
}

export interface BibliographicParser {
  format: SourceFormat;
  parse(
    content: string,
    opts?: { fieldMap?: Record<string, string> },
  ): ParseResult;
}
