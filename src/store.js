export async function persistRun(db, run, requestKey) {
  await db.prepare("INSERT INTO runs(id,request_key,mode,captured_at,decision,engine_version,payload) VALUES(?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING")
    .bind(run.id, requestKey, run.mode, run.capturedAt, run.analysis.decision, run.analysis.engineVersion, JSON.stringify(run)).run();
  const stored = await db.prepare("SELECT payload FROM runs WHERE request_key=?").bind(requestKey).first();
  if (!stored) throw new Error("Run persistence did not return the committed row.");
  return JSON.parse(stored.payload);
}
