CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('LIVE','SIMULATED')),
  captured_at TEXT NOT NULL,
  decision TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_captured_at ON runs(captured_at DESC);
