export interface SummaryFinding {
  recordId: string;
  recordLabel: string;
  fieldName: string;
  finalValue: unknown;
}

export interface ThemeSummaryTable {
  columns: string[];
  rows: { recordId: string; label: string; cells: Record<string, unknown> }[];
}

/** A1: estudos×campos, derivada estritamente dos achados (theme_finding). Recomputável. */
export function buildThemeSummaryTable(
  findings: SummaryFinding[],
): ThemeSummaryTable {
  const columns: string[] = [];
  for (const f of findings)
    if (!columns.includes(f.fieldName)) columns.push(f.fieldName);

  const byRecord = new Map<
    string,
    { label: string; cells: Record<string, unknown> }
  >();
  for (const f of findings) {
    const row = byRecord.get(f.recordId) ?? { label: f.recordLabel, cells: {} };
    row.cells[f.fieldName] = f.finalValue;
    byRecord.set(f.recordId, row);
  }

  const rows = [...byRecord.entries()].map(([recordId, r]) => ({
    recordId,
    label: r.label,
    cells: Object.fromEntries(
      columns.map((c) => [c, c in r.cells ? r.cells[c] : null]),
    ),
  }));
  return { columns, rows };
}
