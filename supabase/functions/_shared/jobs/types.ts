import type { SourceFormat } from "../import/types";

export interface SearchInput {
  queryString: string;
  database: string;
  searchedOn: string; // ISO date (yyyy-mm-dd)
  hits: number;
}

export interface EnqueueImportInput {
  format: SourceFormat;
  content: string;
  fieldMap?: Record<string, string>;
  search: SearchInput;
}

export interface EnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
  estimated_cost: null; // import_parse não tem custo de IA
}

export interface WorkerResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

/** Erro de validação que o shell HTTP mapeia para 400 (FR-016). */
export class EnqueueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnqueueValidationError";
  }
}

/** Dependências injetáveis (mantém o núcleo portátil/testável). */
export interface JobDeps {
  // Cliente Supabase tipado (Node nos testes; Deno no shell).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}
