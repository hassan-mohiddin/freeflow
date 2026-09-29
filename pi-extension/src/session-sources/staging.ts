/**
 * Control changes made between prompts (manual holds, releases, session presets, delegation mode, and session
 * setting overrides) affect no request until the next prompt, so Freeflow stages them and writes only their net
 * effect when that prompt starts; a burst of switches records one change, or none when it ends where it began.
 * Stages live on globalThis because a reload re-creates the extension, and are keyed by session so a stale
 * binding of another session can never touch the current one. Changes staged in a session the user leaves
 * without prompting are not written: Pi only appends to the current session.
 */
export interface Stage {
  events: unknown[];
  overrides?: Record<string, unknown>;
}

interface Reader {
  getSessionId(): string;
}

const SLOT = Symbol.for("freeflow.control-stages");
const KEPT = 8;
const stages = ((globalThis as { [SLOT]?: Map<string, Stage> })[SLOT] ??= new Map());

/** The stage for this session, created when first needed. */
export function sessionStage(reader: Reader | undefined): Stage | undefined {
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
export function stagedFor(reader: Reader | undefined): Stage | undefined {
  const sessionId = reader?.getSessionId?.();
  return sessionId ? stages.get(sessionId) : undefined;
}

/** Hand everything staged for this session to its owners to write now, leaving the stage empty. */
export function takeStage(reader: Reader | undefined): Stage {
  const stage = stagedFor(reader);
  if (!stage) return { events: [] };
  const staged = { events: stage.events, overrides: stage.overrides };
  stage.events = [];
  delete stage.overrides;
  return staged;
}
