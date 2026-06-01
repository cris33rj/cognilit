import { parseContent } from "../import/index";
import {
  type EnqueueImportInput,
  type EnqueueResult,
  type JobDeps,
  EnqueueValidationError,
} from "./types";

/**
 * Valida e enfileira uma importação (D-F3.4). Parseia para validar:
 * 0 registros válidos ⇒ EnqueueValidationError (FR-016, zero persistência).
 * Caso contrário, cria search + job + job_items atômicos via RPC create_import_job.
 * NÃO insere records — isso é trabalho do worker (§VIII).
 */
export async function enqueueImportJob(
  deps: JobDeps,
  reviewId: string,
  input: EnqueueImportInput,
): Promise<EnqueueResult> {
  const result = parseContent(input.format, input.content, {
    fieldMap: input.fieldMap,
  });

  if (result.records.length === 0) {
    const detail = result.errors[0]?.message ?? "nenhum registro válido.";
    throw new EnqueueValidationError(
      `Importação rejeitada: ${detail} Nenhum registro foi salvo.`,
    );
  }

  const { data, error } = await deps.supabase.rpc("create_import_job", {
    p_review_id: reviewId,
    p_format: input.format,
    p_search: input.search,
    p_items: result.records,
  });
  if (error) throw new Error(error.message);

  return {
    job_id: data.id,
    status: "queued",
    item_count: result.records.length,
    estimated_cost: null,
  };
}
