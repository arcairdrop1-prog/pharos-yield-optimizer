import test from "node:test";
import assert from "node:assert/strict";
import { persistRun } from "../src/store.js";

function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          const value = rows.get(args[0]);
          return value ? { payload: JSON.stringify(value) } : null;
        },
        async run() {
          const run = JSON.parse(args[6]);
          if (sql.includes("ON CONFLICT") && !rows.has(args[1])) rows.set(args[1], run);
          return { success: true };
        }
      };
    }
  };
}

test("request replay returns one persisted run", async () => {
  const db = fakeDb();
  const run = { id: "one", mode: "SIMULATED", capturedAt: "now", analysis: { decision: "STAY_PUT", engineVersion: "1" } };
  const first = await persistRun(db, run, "same");
  const second = await persistRun(db, { ...run, id: "two" }, "same");
  assert.equal(first.id, "one");
  assert.equal(second.id, "one");
  assert.equal(db.rows.size, 1);
});

test("concurrent request replay commits exactly one durable row", async () => {
  const db = fakeDb();
  const base = { mode: "SIMULATED", capturedAt: "now", analysis: { decision: "STAY_PUT", engineVersion: "1" } };
  const [a, b] = await Promise.all([
    persistRun(db, { ...base, id: "first" }, "concurrent"),
    persistRun(db, { ...base, id: "second" }, "concurrent")
  ]);
  assert.equal(a.id, b.id);
  assert.equal(db.rows.size, 1);
});
