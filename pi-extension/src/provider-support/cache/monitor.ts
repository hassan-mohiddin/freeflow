/**
 * Prompt-cache diagnostics for /freeflow status. The footer only shows current Freeflow settings, so
 * cache mechanics (keep-alive, context replay, effort baselines) report here instead.
 */
export class CacheMonitor {
  private entries = new Map<string, string>();

  set(key: string, text: string | undefined): void {
    if (text) this.entries.set(key, text);
    else this.entries.delete(key);
  }

  lines(): string[] {
    return [...this.entries.values()];
  }

  reset(): void {
    this.entries.clear();
  }
}
