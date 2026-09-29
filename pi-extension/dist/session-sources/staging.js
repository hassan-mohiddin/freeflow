const SLOT = Symbol.for("freeflow.control-stages");
const KEPT = 8;
const stages = (globalThis[SLOT] ??= new Map());
/** The stage for this session, created when first needed. */
export function sessionStage(reader) {
  const sessionId = reader?.getSessionId?.();
  if (!sessionId) return;
  let stage = stages.get(sessionId);
  if (!stage) {
    stages.set(sessionId, (stage = { events: [] }));
    for (const key of stages.keys()) if (stages.size > KEPT) stages.delete(key);
  }
  return stage;
}
/** What is staged for this session, without creating a stage. */
export function stagedFor(reader) {
  const sessionId = reader?.getSessionId?.();
  return sessionId ? stages.get(sessionId) : undefined;
}
/** Hand everything staged for this session to its owners to write now, leaving the stage empty. */
export function takeStage(reader) {
  const stage = stagedFor(reader);
  if (!stage) return { events: [] };
  const staged = { events: stage.events, overrides: stage.overrides };
  stage.events = [];
  delete stage.overrides;
  return staged;
}
