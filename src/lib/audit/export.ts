import type { AuditRow } from "./queries";

/** JSON sem perda — before/after preservados aninhados (A1). */
export function toAuditJson(rows: AuditRow[]): string {
  return JSON.stringify(rows, null, 2);
}

const CSV_COLUMNS = [
  "id",
  "created_at",
  "actor_type",
  "actor_id",
  "action",
  "entity",
  "entity_id",
  "before",
  "after",
] as const;

function csvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value).replace(/\\"/g, '"')
        : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV achatado para inspeção em planilha (A1). before/after viram JSON em célula. */
export function toAuditCsv(rows: AuditRow[]): string {
  const header = CSV_COLUMNS.join(",");
  const body = rows.map((r) =>
    CSV_COLUMNS.map((c) =>
      csvCell((r as unknown as Record<string, unknown>)[c]),
    ).join(","),
  );
  return [header, ...body].join("\r\n");
}
