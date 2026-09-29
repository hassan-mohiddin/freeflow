const WINDOW = 8;
const MISSES = 4;
const GAP_MS = 5 * 60_000;
const MIN_PROMPT = 8_000;
const HIT_SHARE = 0.5;
const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);
/**
 * Detects prompt-cache regressions: back-to-back requests to the same model and effort, with nothing in between
 * that legitimately invalidates the cache, should reuse the previous prompt. Provider-side misses are uncommon
 * (about 2-4% of Codex requests in September 2026 sessions, with or without Freeflow), so repeated misses in that
 * situation mean something is rewriting the start of the prompt.
 * A routing profile that hands off and later resumes on the same model should likewise reuse its own
 * previous prompt while that prompt's cache entry lives.
 */
export class CacheHealth {
  previous;
  lanes = new Map();
  windows = new Map();
  warned = new Map();
  /** Compaction, navigation, or reload legitimately invalidates every cached prompt. */
  noteBreak() {
    this.previous = undefined;
    this.lanes.clear();
  }
  /** A model or effort change starts a new back-to-back run; a routing lane keeps its own prompt. */
  noteSwitch() {
    this.previous = undefined;
  }
  reset() {
    this.previous = undefined;
    this.lanes.clear();
    this.windows.clear();
    this.warned.clear();
  }
  /** Returns a warning the first time a model's recent comparable requests cross the miss threshold. */
  observe(observation) {
    const key = `${observation.provider ?? "unknown"}/${observation.model ?? "unknown"}/${observation.thinking ?? "unknown"}`;
    const prompt = observation.input + observation.cacheRead + (observation.cacheWrite ?? 0);
    const previous = this.previous;
    this.previous = { key, lane: observation.lane, at: observation.at, prompt };
    let basis;
    // Routing profiles see different views of the conversation, so one never reuses another's prompt.
    if (
      previous &&
      previous.key === key &&
      previous.lane === observation.lane &&
      observation.at - previous.at <= GAP_MS
    )
      basis = previous;
    else if (observation.lane) {
      const own = this.lanes.get(`${key}/${observation.lane}`);
      if (own && observation.at - own.at <= (observation.ttlMs ?? GAP_MS)) basis = own;
    }
    if (observation.lane) this.lanes.set(`${key}/${observation.lane}`, { at: observation.at, prompt });
    if (!basis || basis.prompt < MIN_PROMPT) return;
    const miss = observation.cacheRead < HIT_SHARE * basis.prompt;
    const window = [
      ...(this.windows.get(key) ?? []),
      { miss, lost: miss ? basis.prompt - observation.cacheRead : 0 },
    ].slice(-WINDOW);
    this.windows.set(key, window);
    const misses = window.filter((entry) => entry.miss).length;
    if (misses <= 1) this.warned.delete(key);
    if (misses < MISSES || this.warned.has(key)) return;
    const lost = window.reduce((sum, entry) => sum + entry.lost, 0);
    const message = `Freeflow: the prompt cache for ${observation.model} (${observation.thinking}) missed on ${misses} of the last ${window.length} requests that should have reused it (~${tokens(lost)} tokens re-read). Something is rewriting the start of the prompt or placing it out of the provider's reach; check recently changed extensions or Freeflow settings.`;
    this.warned.set(key, message);
    return message;
  }
  status() {
    return [...this.warned.values()];
  }
}
