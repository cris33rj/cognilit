# Contract — Bibliographic import parsers

**Feature**: `001-marco1-nucleo-fluxo` | FR-013/014/016, R4.

> Um módulo por formato, contrato único. Roda **no worker** (`import_parse`), nunca
> em request síncrono. Parse parcial leve no cliente é permitido **apenas** para a
> pré-visualização (FR-014); a persistência final é do worker, transacional.

## Interface (TypeScript)

```ts
// src/lib/import/types.ts
export type SourceFormat = "ris" | "bibtex" | "csv";

export interface ParsedRecord {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  abstract: string | null;
  language: string | null; // preservar original (FR-038)
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
  /** CSV aceita mapeamento de campos (FR-014). */
  parse(
    content: string,
    opts?: { fieldMap?: Record<string, string> },
  ): ParseResult;
}
```

## Regras

- **Arquivo malformado / formato não suportado** ⇒ `errors` populado e
  **nenhuma** persistência parcial (FR-016): o worker só persiste se o parse do
  arquivo é íntegro o suficiente segundo a política da fatia (ex.: 0 registros
  válidos ⇒ aborta com mensagem).
- Normalização para dedup (`doi_normalized`, `title_norm`) é derivada de
  `ParsedRecord` na ingestão (R2), não no parser.
- Idioma/codificação inesperados: conteúdo aceito, campos no idioma original
  (FR-038, edge case).

## Testes mínimos (TDD)

- Fixtures válidas RIS/BibTeX/CSV ⇒ `records.length` esperado, `errors` vazio.
- Fixture malformada ⇒ `errors` não-vazio, persistência abortada.
- CSV com `fieldMap` ⇒ campos mapeados corretamente.
- Coverage **≥ 80%** no parsing de metadado (constitution §Testes).
