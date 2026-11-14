// Where Freeflow's compaction notice comes: the one function every driver (Claude Code's mod, Pi, Codex)
// and Track Work's planner and estimate call. A host that compacts on its own has a point of its own, its compaction
// threshold in tokens: the notice comes a lead before it, and never past a ceiling. A host that gives none gets the
// notice at a share of its window, which is the same as before this module on every window up to the ceiling.

/** Tokens the notice comes before the host's own compaction point, where that point is known. */
export const LEAD_TOKENS = 20_000;
/** The most a notice comes at, in tokens, however large the window (where the host's point is known or unknown). */
export const CEILING_TOKENS = 750_000;
/** The share of the window the notice comes at where the host's point is not known. */
export const UNKNOWN_HOST_SHARE = 0.75;

/**
 * The notice point in tokens. `hostPoint` is the host's own compaction point in tokens (Claude Code's
 * autoCompactThreshold, Pi's window minus its reserve, Codex's model_auto_compact_token_limit), or null when unknown.
 * @param {{ window: number, hostPoint?: number | null }} options
 * @returns {number}
 */
export function noticePoint({ window, hostPoint = null }) {
  if (hostPoint === null || hostPoint === undefined)
    return Math.floor(Math.min(CEILING_TOKENS, UNKNOWN_HOST_SHARE * window));
  return Math.max(0, Math.floor(Math.min(CEILING_TOKENS, hostPoint - LEAD_TOKENS)));
}

/**
 * The notice point a script's planner or estimate uses: FREEFLOW_NOTICE_POINT in tokens, which the harness layer sets
 * beside FREEFLOW_CONTEXT_WINDOW where it knows the host's point; else the unknown-host formula for the window.
 * @param {number} window
 * @param {Record<string, string | undefined>} [env]
 * @returns {number}
 */
export function noticeFromEnv(window, env = process.env) {
  const value = Number(env.FREEFLOW_NOTICE_POINT);
  return Number.isInteger(value) && value > 0 ? value : noticePoint({ window });
}
