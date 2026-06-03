import { describe, it, expect } from "vitest";
import { toAuditJson, toAuditCsv } from "@/lib/audit/export";
import type { AuditRow } from "@/lib/audit/queries";

const rows: AuditRow[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-06-01T10:00:00.000Z",
    actor_type: "human",
    actor_id: "aaaa",
    action: "decide_screening",
    entity: "record",
    entity_id: "rec-1",
    before: { corpus_state: "active", ts_decision: null },
    after: { corpus_state: "excluded_ts", ts_decision: "excluded" },
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    created_at: "2026-06-01T10:05:00.000Z",
    actor_type: "human",
    actor_id: "aaaa",
    action: "reverse_screening",
    entity: "record",
    entity_id: "rec-1",
    before: { corpus_state: "excluded_ts" },
    after: { corpus_state: "active", reason: 'campo, com vírgula e "aspas"' },
  },
];

describe("export da trilha de auditoria (A1 / FR-035)", () => {
  it("JSON é sem perda: before/after preservados aninhados", () => {
    const parsed = JSON.parse(toAuditJson(rows));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].after.ts_decision).toBe("excluded");
    expect(parsed[1].action).toBe("reverse_screening");
  });

  it("CSV achata before/after e escapa vírgulas/aspas (RFC 4180)", () => {
    const csv = toAuditCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "id,created_at,actor_type,actor_id,action,entity,entity_id,before,after",
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('""aspas""');
    expect(csv).toContain("reverse_screening");
  });

  it("lida com trilha vazia", () => {
    expect(JSON.parse(toAuditJson([]))).toEqual([]);
    expect(toAuditCsv([]).split("\r\n")).toHaveLength(1);
  });
});
