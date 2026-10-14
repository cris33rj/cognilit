/**
 * TDD: batch-worker tests for processSynthesisJob.
 *
 * Uses a minimal in-memory fake SupabaseClient faithful to the chained call
 * patterns the worker actually makes.  MockLLMProvider is the real mock from
 * @/lib/ai/llm/mock (deterministic, no network).
 *
 * Scenarios:
 *   1. Happy path — aggregates findings into ≥1 theme, inserts theme+
 *      theme_finding+ai_suggestion, updates synthesis to 'ready', inserts
 *      ai_usage with phase==='synthesis', returns status 'completed'.
 *   2. Empty pool (item with no accepted findings) — no themes, synthesis
 *      updated to 'draft', job 'completed'.
 *   3. Resilience — one study's collectRatifiedFindings throws; that job_item
 *      is marked 'failed', the batch still completes (not aborted).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockLLMProvider } from "@/lib/ai/llm/mock";

// ── Fake Supabase builder ────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/**
 * A chainable query builder whose terminal methods (.maybeSingle, .single,
 * implicit resolution) return the rows captured in the in-memory store.
 */
class FakeQueryBuilder {
  private _table: string;
  private _store: FakeStore;
  private _filters: Array<{ col: string; op: string; val: unknown }> = [];
  private _selectCols: string = "*";
  private _insertRows: Row[] | null = null;
  private _updateData: Row | null = null;
  private _deleteMode = false;
  private _countOpts: { count?: string; head?: boolean } = {};
  private _returning = false;

  constructor(table: string, store: FakeStore) {
    this._table = table;
    this._store = store;
  }

  select(cols: string, opts?: { count?: string; head?: boolean }) {
    this._selectCols = cols;
    if (opts) this._countOpts = opts;
    return this;
  }

  eq(col: string, val: unknown) {
    this._filters.push({ col, op: "eq", val });
    return this;
  }

  in(col: string, vals: unknown[]) {
    this._filters.push({ col, op: "in", val: vals });
    return this;
  }

  neq(col: string, val: unknown) {
    this._filters.push({ col, op: "neq", val });
    return this;
  }

  order(_col: string) {
    return this;
  }

  insert(rows: Row | Row[]) {
    this._insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(data: Row) {
    this._updateData = data;
    return this;
  }

  delete() {
    this._deleteMode = true;
    return this;
  }

  single() {
    return this._execute({ single: true });
  }

  maybeSingle() {
    return this._execute({ maybe: true });
  }

  /** Allows `await supabase.from(...).insert(...).select('id').single()` */
  // re-expose for chained .select().single() after insert
  private _execute(opts: { single?: boolean; maybe?: boolean } = {}): {
    data: unknown;
    error: null | { message: string };
    count?: number;
  } {
    const table = this._table;

    // ── INSERT ───────────────────────────────────────────────────────────────
    if (this._insertRows) {
      const inserted: Row[] = this._insertRows.map((r) => ({
        id: `fake-${Math.random().toString(36).slice(2)}`,
        created_at: new Date().toISOString(),
        ...r,
      }));
      this._store.push(table, ...inserted);
      if (opts.single) return { data: inserted[0], error: null };
      return { data: inserted, error: null };
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (this._updateData) {
      const rows = this._applyFilters(this._store.rows(table));
      rows.forEach((r) => Object.assign(r, this._updateData));
      this._store.recordUpdate(table, this._updateData as Row, rows);
      if (opts.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (this._deleteMode) {
      const toDelete = this._applyFilters(this._store.rows(table));
      this._store.deleteRows(table, toDelete);
      return { data: toDelete, error: null };
    }

    // ── SELECT ───────────────────────────────────────────────────────────────
    const rows = this._applyFilters(this._store.rows(table));

    if (this._countOpts.count === "exact") {
      return { data: null, error: null, count: rows.length };
    }

    if (opts.single) {
      if (rows.length === 0)
        return { data: null, error: { message: "no rows" } };
      return { data: rows[0], error: null };
    }
    if (opts.maybe) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  // Implicit await (thenable) — covers `await supabase.from('x').update(...).eq('id', y)`
  then(resolve: (v: unknown) => void) {
    resolve(this._execute());
  }

  private _applyFilters(rows: Row[]): Row[] {
    return rows.filter((row) =>
      this._filters.every(({ col, op, val }) => {
        if (op === "eq") return row[col] === val;
        if (op === "neq") return row[col] !== val;
        if (op === "in") return (val as unknown[]).includes(row[col]);
        return true;
      }),
    );
  }
}

class FakeStore {
  private _tables: Map<string, Row[]> = new Map();
  private _updates: Map<string, Array<{ data: Row; affected: Row[] }>> =
    new Map();

  rows(table: string): Row[] {
    if (!this._tables.has(table)) this._tables.set(table, []);
    return this._tables.get(table)!;
  }

  push(table: string, ...rows: Row[]) {
    this.rows(table).push(...rows);
  }

  deleteRows(table: string, toDelete: Row[]) {
    const current = this.rows(table);
    const deleteSet = new Set(toDelete);
    this._tables.set(
      table,
      current.filter((r) => !deleteSet.has(r)),
    );
  }

  recordUpdate(table: string, data: Row, affected: Row[]) {
    if (!this._updates.has(table)) this._updates.set(table, []);
    this._updates.get(table)!.push({ data, affected });
  }

  allRows(table: string): Row[] {
    return [...this.rows(table)];
  }

  updated(table: string): Array<{ data: Row; affected: Row[] }> {
    return this._updates.get(table) ?? [];
  }
}

function makeSupabase(store: FakeStore) {
  return {
    from: (table: string) => new FakeQueryBuilder(table, store),
    rpc: vi.fn(),
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const REVIEW_ID = "review-1";
const JOB_ID = "job-1";
const RECORD_A = "record-a";
const RECORD_B = "record-b";
const EV_A1 = "ev-a1";
const EV_A2 = "ev-a2";
const EV_B1 = "ev-b1";

/** Seed the store with a minimal job + job_items */
function seedStore(
  store: FakeStore,
  items: Array<{ id: string; recordId: string }>,
) {
  store.push("job", {
    id: JOB_ID,
    review_id: REVIEW_ID,
    type: "synthesis_batch",
    status: "queued",
    started_at: null,
    progress: 0,
  });
  for (const it of items) {
    store.push("job_item", {
      id: it.id,
      job_id: JOB_ID,
      review_id: REVIEW_ID,
      status: "pending",
      payload: { record_id: it.recordId },
      attempts: 0,
      error: null,
    });
  }
  // seed records so label lookup works
  store.push("record", {
    id: RECORD_A,
    review_id: REVIEW_ID,
    title_norm: "Study Alpha",
    metadata: { title: "Study Alpha" },
  });
  store.push("record", {
    id: RECORD_B,
    review_id: REVIEW_ID,
    title_norm: "Study Beta",
    metadata: { title: "Study Beta" },
  });
}

// ── Mock collectRatifiedFindings ─────────────────────────────────────────────
//
// The worker imports collectRatifiedFindings from @/lib/synthesis/queries.
// We vi.mock it so we control what each record returns without needing a
// real Supabase connection.

vi.mock("@/lib/synthesis/queries", () => ({
  collectRatifiedFindings: vi.fn(),
}));

import { collectRatifiedFindings } from "@/lib/synthesis/queries";
import { processSynthesisJob } from "@/lib/synthesis/batch-worker";

// ─────────────────────────────────────────────────────────────────────────────

describe("processSynthesisJob", () => {
  let store: FakeStore;
  let provider: MockLLMProvider;

  beforeEach(() => {
    store = new FakeStore();
    provider = new MockLLMProvider();
    vi.clearAllMocks();
  });

  // ── Scenario 1: happy path ─────────────────────────────────────────────────
  it("aggregates findings into themes, inserts ai_usage with phase=synthesis, returns completed", async () => {
    seedStore(store, [
      { id: "item-a", recordId: RECORD_A },
      { id: "item-b", recordId: RECORD_B },
    ]);

    const findingsA = [
      {
        extractionValueId: EV_A1,
        recordId: RECORD_A,
        fieldName: "Intervenção",
        value: "CBT",
      },
      {
        extractionValueId: EV_A2,
        recordId: RECORD_A,
        fieldName: "Desfecho",
        value: "Redução ansiedade",
      },
    ];
    const findingsB = [
      {
        extractionValueId: EV_B1,
        recordId: RECORD_B,
        fieldName: "Intervenção",
        value: "EMDR",
      },
    ];

    vi.mocked(collectRatifiedFindings)
      .mockResolvedValueOnce(findingsA)
      .mockResolvedValueOnce(findingsB);

    const supabase = makeSupabase(store) as unknown as Parameters<
      typeof processSynthesisJob
    >[0]["supabase"];
    const result = await processSynthesisJob({ supabase, provider }, JOB_ID);

    // job result
    expect(result.job_id).toBe(JOB_ID);
    expect(result.status).toBe("completed");
    expect(result.done).toBe(2);
    expect(result.failed).toBe(0);

    // themes inserted (MockLLMProvider groups by fieldName: Intervenção and Desfecho)
    const themes = store.allRows("theme");
    expect(themes.length).toBeGreaterThanOrEqual(1);

    // each theme has a synthesis_id and name
    for (const t of themes) {
      expect(t.synthesis_id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.state).toBe("pending");
    }

    // theme_finding rows inserted (at least 3 total: 2 from A + 1 from B)
    const tfs = store.allRows("theme_finding");
    expect(tfs.length).toBeGreaterThanOrEqual(1);
    const allEvIds = tfs.map((tf) => tf.extraction_value_id);
    expect(allEvIds).toContain(EV_A1);
    expect(allEvIds).toContain(EV_B1);

    // ai_suggestion inserted for each theme
    const suggestions = store.allRows("ai_suggestion");
    expect(suggestions.length).toBe(themes.length);
    for (const s of suggestions) {
      expect(s.target_kind).toBe("synthesis_theme");
      expect(s.state).toBe("pending");
    }

    // ai_usage inserted with phase = 'synthesis'
    const usages = store.allRows("ai_usage");
    expect(usages.length).toBe(1);
    expect(usages[0]).toBeDefined();
    const usage = usages[0]!;
    expect(usage.phase).toBe("synthesis");
    expect(usage.review_id).toBe(REVIEW_ID);
    expect(usage.job_id).toBe(JOB_ID);

    // synthesis row updated to 'ready'
    const synthUpdates = store.updated("synthesis");
    const readyUpdate = synthUpdates.find((u) => u.data.status === "ready");
    expect(readyUpdate).toBeTruthy();
  });

  // ── Scenario 2: empty pool ─────────────────────────────────────────────────
  it("sets synthesis to draft when no findings collected", async () => {
    seedStore(store, [{ id: "item-a", recordId: RECORD_A }]);

    vi.mocked(collectRatifiedFindings).mockResolvedValueOnce([]);

    const supabase = makeSupabase(store) as unknown as Parameters<
      typeof processSynthesisJob
    >[0]["supabase"];
    const result = await processSynthesisJob({ supabase, provider }, JOB_ID);

    expect(result.status).toBe("completed");

    // no themes
    expect(store.allRows("theme").length).toBe(0);

    // synthesis status = draft
    const synthUpdates = store.updated("synthesis");
    const draftUpdate = synthUpdates.find((u) => u.data.status === "draft");
    expect(draftUpdate).toBeTruthy();
  });

  // ── Scenario 4: insufficientData — LLM called but returned no themes ────────
  it("sets synthesis to draft and records ai_usage when provider returns insufficientData", async () => {
    seedStore(store, [{ id: "item-a", recordId: RECORD_A }]);

    vi.mocked(collectRatifiedFindings).mockResolvedValueOnce([
      {
        extractionValueId: EV_A1,
        recordId: RECORD_A,
        fieldName: "Intervenção",
        value: "CBT",
      },
    ]);

    // Override synthesizeThemes to return insufficientData
    const insufficientProvider = {
      ...provider,
      synthesizeThemes: vi.fn().mockResolvedValue({ insufficientData: true }),
      identity: () => provider.identity(),
    };

    const supabase = makeSupabase(store) as unknown as Parameters<
      typeof processSynthesisJob
    >[0]["supabase"];
    const result = await processSynthesisJob(
      {
        supabase,
        provider: insufficientProvider as unknown as typeof provider,
      },
      JOB_ID,
    );

    expect(result.status).toBe("completed");

    // No theme rows should have been inserted
    expect(store.allRows("theme").length).toBe(0);

    // synthesis updated to 'draft'
    const synthUpdates = store.updated("synthesis");
    const draftUpdate = synthUpdates.find((u) => u.data.status === "draft");
    expect(draftUpdate).toBeTruthy();

    // ai_usage IS recorded (because the LLM was called)
    const usages = store.allRows("ai_usage");
    expect(usages.length).toBe(1);
    expect(usages[0]).toBeDefined();
    const usage = usages[0]!;
    expect(usage.phase).toBe("synthesis");
    expect(usage.review_id).toBe(REVIEW_ID);
    expect(usage.job_id).toBe(JOB_ID);
  });

  // ── Scenario 5: regeneration-preservation (FR-005a) ──────────────────────
  it("deletes pending themes but preserves accepted themes on re-run", async () => {
    seedStore(store, [{ id: "item-a", recordId: RECORD_A }]);

    // Seed an existing synthesis row
    const SYNTHESIS_ID = "synth-existing";
    store.push("synthesis", {
      id: SYNTHESIS_ID,
      review_id: REVIEW_ID,
      status: "ready",
    });

    // Seed pre-existing themes: one accepted, one pending
    const ACCEPTED_THEME_ID = "theme-accepted";
    const PENDING_THEME_ID = "theme-pending-old";
    store.push("theme", {
      id: ACCEPTED_THEME_ID,
      review_id: REVIEW_ID,
      synthesis_id: SYNTHESIS_ID,
      name: "Accepted Theme",
      state: "accepted",
    });
    store.push("theme", {
      id: PENDING_THEME_ID,
      review_id: REVIEW_ID,
      synthesis_id: SYNTHESIS_ID,
      name: "Old Pending Theme",
      state: "pending",
    });

    vi.mocked(collectRatifiedFindings).mockResolvedValueOnce([
      {
        extractionValueId: EV_A1,
        recordId: RECORD_A,
        fieldName: "Intervenção",
        value: "CBT",
      },
    ]);

    const supabase = makeSupabase(store) as unknown as Parameters<
      typeof processSynthesisJob
    >[0]["supabase"];
    await processSynthesisJob({ supabase, provider }, JOB_ID);

    const allThemes = store.allRows("theme");

    // The accepted theme must still exist
    const acceptedStillExists = allThemes.some(
      (t) => t.id === ACCEPTED_THEME_ID && t.state === "accepted",
    );
    expect(acceptedStillExists).toBe(true);

    // The old pending theme must have been deleted
    const oldPendingStillExists = allThemes.some(
      (t) => t.id === PENDING_THEME_ID,
    );
    expect(oldPendingStillExists).toBe(false);

    // Fresh themes were inserted with state 'pending'
    const freshThemes = allThemes.filter(
      (t) =>
        t.id !== ACCEPTED_THEME_ID &&
        t.id !== PENDING_THEME_ID &&
        t.state === "pending",
    );
    expect(freshThemes.length).toBeGreaterThanOrEqual(1);
  });

  // ── Scenario 3: per-item resilience ────────────────────────────────────────
  it("marks failing study as failed but continues batch, does not abort", async () => {
    seedStore(store, [
      { id: "item-a", recordId: RECORD_A },
      { id: "item-b", recordId: RECORD_B },
    ]);

    // RECORD_A throws; RECORD_B succeeds
    vi.mocked(collectRatifiedFindings)
      .mockRejectedValueOnce(new Error("DB timeout"))
      .mockResolvedValueOnce([
        {
          extractionValueId: EV_B1,
          recordId: RECORD_B,
          fieldName: "Intervenção",
          value: "EMDR",
        },
      ]);

    const supabase = makeSupabase(store) as unknown as Parameters<
      typeof processSynthesisJob
    >[0]["supabase"];
    const result = await processSynthesisJob({ supabase, provider }, JOB_ID);

    // batch completes with errors (1 done, 1 failed)
    expect(result.done).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.status).toBe("completed_with_errors");

    // the failing item_a was marked failed — check updates recorded for job_item
    const itemUpdates = store.updated("job_item");
    const failUpdate = itemUpdates.find((u) => u.data.status === "failed");
    expect(failUpdate).toBeTruthy();
    expect(failUpdate?.data.error).toContain("DB timeout");

    // themes were still produced from RECORD_B
    const themes = store.allRows("theme");
    expect(themes.length).toBeGreaterThanOrEqual(1);
  });
});
