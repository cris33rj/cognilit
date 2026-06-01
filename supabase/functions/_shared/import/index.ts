/**
 * Facade pública do módulo de import.
 *
 * Expõe:
 *  - `parserFor(format)` — roteador: devolve o BibliographicParser correto
 *  - `parseContent(format, content, opts?)` — wrapper de conveniência
 *  - Re-exporta todos os tipos de `./types` para que consumidores não
 *    precisem importar de sub-módulos internos.
 */

export type {
  SourceFormat,
  ParsedRecord,
  ParseError,
  ParseResult,
  BibliographicParser,
} from "./types";

import type { SourceFormat, BibliographicParser, ParseResult } from "./types";
import { csvParser } from "./csv";
import { risParser } from "./ris";
import { bibtexParser } from "./bibtex";

/** Mapa imutável formato → parser. */
const PARSERS: Record<SourceFormat, BibliographicParser> = {
  csv: csvParser,
  ris: risParser,
  bibtex: bibtexParser,
};

/**
 * Retorna o parser registrado para o formato solicitado.
 * Exaustivo por construção: `SourceFormat` é uma union fechada e `PARSERS`
 * cobre todos os membros — o TypeScript garante em tempo de compilação.
 */
export function parserFor(format: SourceFormat): BibliographicParser {
  return PARSERS[format];
}

/**
 * Rota o conteúdo bruto para o parser correto e devolve o `ParseResult`.
 *
 * @param format  - Formato do arquivo ("ris" | "bibtex" | "csv")
 * @param content - Conteúdo textual do arquivo
 * @param opts    - Opções opcionais repassadas ao parser
 *                  (ex.: `fieldMap` para CSV — FR-014)
 */
export function parseContent(
  format: SourceFormat,
  content: string,
  opts?: { fieldMap?: Record<string, string> },
): ParseResult {
  return parserFor(format).parse(content, opts);
}
