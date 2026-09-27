/**
 * Prompt-cache diagnostics for /freeflow status. The footer only shows current Freeflow settings, so
 * cache mechanics (keep-alive, context replay, effort baselines) report here instead.
 */
export class CacheMonitor {
  entries = new Map();
  set(key, text) {
    if (text) this.entries.set(key, text);
    else this.entries.delete(key);
  }
  lines() {
    return [...this.entries.values()];
  }
  reset() {
    this.entries.clear();
  }
}
