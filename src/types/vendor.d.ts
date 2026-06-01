/**
 * Ambient type declarations for vendored/untyped dependencies.
 */

/** @retorquere/bibtex-parser v10 — no bundled .d.ts; types derived from observed output. */
declare module "@retorquere/bibtex-parser" {
  export interface BibtexCreator {
    lastName?: string;
    firstName?: string;
  }

  export type BibtexFieldValue =
    | string
    | BibtexCreator[]
    | string[]
    | number
    | boolean;

  export interface BibtexEntry {
    type: string;
    key: string;
    fields: Record<string, BibtexFieldValue | undefined>;
    mode: Record<string, string>;
    input: string;
  }

  export interface BibtexParseResult {
    entries: BibtexEntry[];
    errors: unknown[];
    comments: string[];
    strings: Record<string, string>;
    preamble: string[];
    jabref: unknown;
  }

  export interface BibtexParseOptions {
    verbatim?: string[];
    errorHandler?: (err: unknown) => void;
    caseProtection?: string;
  }

  export function parse(
    input: string,
    options?: BibtexParseOptions,
  ): BibtexParseResult;
}
