import { describe, it, expect } from "vitest";
import {
  parseQueueState,
  serializeQueueState,
  applyQueueView,
  type QueueViewState,
} from "@/lib/screening/queue-url";

type Row = {
  recordId: string;
  title: string;
  year: string | null;
  ts: string | null;
  ai: number | null;
};
const rows: Row[] = [
  { recordId: "a", title: "Beta", year: "2020", ts: null, ai: 0.3 },
  { recordId: "b", title: "Alpha", year: "2022", ts: "included", ai: 0.9 },
  { recordId: "c", title: "Gamma", year: "2019", ts: "excluded", ai: null },
];
const sel = (r: Row) => ({
  decision: r.ts as "included" | "excluded" | "maybe" | null,
  aiConfidence: r.ai,
});
const sortKey = (r: Row) => ({ title: r.title, year: r.year });

describe("queue-url (FR-037) — preservar/reabrir estado de fila", () => {
  it("default quando não há params", () => {
    expect(parseQueueState(new URLSearchParams())).toEqual({
      filter: "all",
      sort: "default",
    });
  });

  it("roundtrip serialize → parse preserva o estado", () => {
    const state: QueueViewState = { filter: "undecided", sort: "year" };
    const params = new URLSearchParams(serializeQueueState(state));
    expect(parseQueueState(params)).toEqual(state);
  });

  it("ignora valores inválidos caindo no default (robusto a URL adulterada)", () => {
    const p = new URLSearchParams({ qfilter: "lixo", qsort: "lixo" });
    expect(parseQueueState(p)).toEqual({ filter: "all", sort: "default" });
  });

  it("applyQueueView filtra por 'undecided' (sem decisão T/R)", () => {
    const out = applyQueueView(
      rows,
      { filter: "undecided", sort: "default" },
      sel,
      sortKey,
    );
    expect(out.map((r) => r.recordId)).toEqual(["a"]);
  });

  it("applyQueueView ordena por título e por ano", () => {
    const byTitle = applyQueueView(
      rows,
      { filter: "all", sort: "title" },
      sel,
      sortKey,
    );
    expect(byTitle.map((r) => r.title)).toEqual(["Alpha", "Beta", "Gamma"]);
    const byYear = applyQueueView(
      rows,
      { filter: "all", sort: "year" },
      sel,
      sortKey,
    );
    expect(byYear.map((r) => r.year)).toEqual(["2019", "2020", "2022"]);
  });

  it("applyQueueView ordena por ai_confidence (desc, nulls por último)", () => {
    const out = applyQueueView(
      rows,
      { filter: "all", sort: "ai_confidence" },
      sel,
      sortKey,
    );
    expect(out.map((r) => r.recordId)).toEqual(["b", "a", "c"]);
  });

  it("applyQueueView filtra por 'ai_suggested' (com sugestão da IA)", () => {
    const out = applyQueueView(
      rows,
      { filter: "ai_suggested", sort: "default" },
      sel,
      sortKey,
    );
    expect(out.map((r) => r.recordId)).toEqual(["a", "b"]);
  });
});
