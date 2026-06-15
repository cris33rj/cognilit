import type { SupabaseClient } from "@supabase/supabase-js";
import { listExtractionFields, listStudies } from "@/lib/extraction/queries";

export interface CharacteristicsTable {
  columns: string[];
  rows: Array<{ recordId: string; cells: Record<string, unknown> }>;
}

interface FieldLite {
  id: string;
  name: string;
}
interface StudyLite {
  id: string;
  title: string;
}
interface ValueLite {
  recordId: string;
  fieldId: string;
  finalValue: unknown;
}

const STUDY_COLUMN = "Estudo";

/**
 * Normaliza `extraction_value.final_value` em um valor exibível na célula.
 * Contrato (A1, espelha `SummaryTable.cellText`): `{value, source_span, page}` —
 * extrai `.value` quando objeto; passa escalares adiante; nulo/ausente ⇒ null.
 */
function extractCellValue(finalValue: unknown): unknown {
  const value =
    finalValue !== null &&
    typeof finalValue === "object" &&
    "value" in finalValue
      ? (finalValue as { value: unknown }).value
      : finalValue;
  return value ?? null;
}

/** Pura: monta colunas (Estudo + campos) e 1 linha por estudo, célula = valor ratificado. */
export function assembleCharacteristics(
  fields: FieldLite[],
  studies: StudyLite[],
  values: ValueLite[],
): CharacteristicsTable {
  const columns = [STUDY_COLUMN, ...fields.map((f) => f.name)];
  const fieldNameById = new Map(fields.map((f) => [f.id, f.name]));

  const rows = studies.map((s) => {
    const cells: Record<string, unknown> = { [STUDY_COLUMN]: s.title };
    for (const f of fields) cells[f.name] = null; // default explícito
    for (const v of values) {
      if (v.recordId !== s.id) continue;
      const name = fieldNameById.get(v.fieldId);
      if (name) cells[name] = extractCellValue(v.finalValue);
    }
    return { recordId: s.id, cells };
  });

  return { columns, rows };
}

interface Deps {
  supabase: SupabaseClient;
}

/** IO: deriva a tabela de características dos estudos included_ft (sem tabela nova, R6). */
export async function buildCharacteristicsTable(
  deps: Deps,
  reviewId: string,
): Promise<CharacteristicsTable> {
  const { supabase } = deps;
  const [fields, studies] = await Promise.all([
    listExtractionFields(deps, reviewId),
    listStudies(deps, reviewId),
  ]);

  const { data: valueRows, error } = await supabase
    .from("extraction_value")
    .select("record_id, field_id, final_value")
    .eq("review_id", reviewId)
    .in("state", ["accepted", "edited"]);
  if (error) throw new Error(error.message);

  const values: ValueLite[] = (
    (valueRows ?? []) as {
      record_id: string;
      field_id: string;
      final_value: unknown;
    }[]
  ).map((r) => ({
    recordId: r.record_id,
    fieldId: r.field_id,
    finalValue: r.final_value,
  }));

  return assembleCharacteristics(
    fields.map((f) => ({ id: f.id, name: f.name })),
    studies.map((s) => ({ id: s.id, title: s.title })),
    values,
  );
}
