export interface CacheObservation {
  provider?: string;
  model?: string;
  thinking?: string;
  at: number;
  input: number;
  cacheRead: number;
}

const WINDOW = 8;
const MISSES = 4;
const GAP_MS = 5 * 60_000;
const MIN_PROMPT = 8_000;
const HIT_SHARE = 0.5;
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);

/**
 * Detects prompt-cache regressions: back-to-back requests to the same model and effort, with nothing in between
 * that legitimately invalidates the cache, should reuse the previous prompt. Provider-side misses are rare
 * (about 1-2%), so repeated misses in that situation mean something is rewriting the start of the prompt.
 */
export class CacheHealth {
  private previous?: { key: string; at: number; prompt: number };
  private windows = new Map<string, { miss: boolean; lost: number }[]>();
  private warned = new Map<string, string>();

  /** Compaction, navigation, reload, or a model/effort change legitimately invalidates the cache. */
  noteBreak(): void {
    this.previous = undefined;
  }

  reset(): void {
    this.previous = undefined;
    this.windows.clear();
    this.warned.clear();
  }

  /** Returns a warning the first time a model's recent back-to-back requests cross the miss threshold. */
  observe(observation: CacheObservation): string | undefined {
    const key = `${observation.provider ?? "unknown"}/${observation.model ?? "unknown"}/${observation.thinking ?? "unknown"}`;
    const prompt = observation.input + observation.cacheRead;
    const previous = this.previous;
    this.previous = { key, at: observation.at, prompt };
    if (!previous || previous.key !== key || observation.at - previous.at > GAP_MS || previous.prompt < MIN_PROMPT)
      return;
    const miss = observation.cacheRead < HIT_SHARE * previous.prompt;
    const window = [
      ...(this.windows.get(key) ?? []),
      { miss, lost: miss ? previous.prompt - observation.cacheRead : 0 },
    ].slice(-WINDOW);
    this.windows.set(key, window);
    const misses = window.filter((entry) => entry.miss).length;
    if (misses <= 1) this.warned.delete(key);
    if (misses < MISSES || this.warned.has(key)) return;
    const lost = window.reduce((sum, entry) => sum + entry.lost, 0);
    const message = `Freeflow: the prompt cache for ${observation.model} (${observation.thinking}) missed on ${misses} of the last ${window.length} back-to-back requests with nothing changed in between (~${tokens(lost)} tokens re-read). Something is rewriting the start of the prompt; check recently changed extensions or Freeflow settings.`;
    this.warned.set(key, message);
    return message;
  }

  status(): string[] {
    return [...this.warned.values()];
  }
}
