/**
 * Where Freeflow's notice comes. Pi compacts on its own once context passes the window minus its reserve, and stays as
 * the fallback for a full context. Freeflow's one notice a compaction cycle comes at 75% of the window, or a tenth of
 * the window before Pi's trigger if that is earlier, as on Claude Code (P5, T13), so the agent has room to reach a safe
 * point and checkpoint first; rows at 50, 60 and 70% show the context as it grows, below the notice (P80).
 */

export const DEFAULT_RESERVE_TOKENS = 16_384;
const NOTICE_SHARE = 0.75;
const TRIGGER_LEAD = 0.1;
/** Shares of the window a row shows, once each a cycle, below the notice point. */
export const ROWS_AT = [0.5, 0.6, 0.7] as const;

export interface Thresholds {
  window: number;
  /** Where Pi compacts on its own. */
  trigger: number;
  /** Where Freeflow's one notice a cycle comes. */
  notice: number;
}

/** Pi's effective reserve for a model: its per-model override, else the ordinary setting, else Pi's default. */
export function reserveTokens(settings: any, model: { provider?: string; id?: string } | undefined): number {
  const compaction = settings?.compaction ?? {};
  const override = model ? compaction.modelOverrides?.[`${model.provider}/${model.id}`] : undefined;
  const value = override?.reserveTokens ?? compaction.reserveTokens;
  return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_RESERVE_TOKENS;
}

export function thresholds(window: number, reserve: number): Thresholds {
  const trigger = Math.max(0, window - reserve);
  return {
    window,
    trigger,
    notice: Math.max(0, Math.floor(Math.min(window * NOTICE_SHARE, trigger - TRIGGER_LEAD * window))),
  };
}

/** The strictest thresholds across models that may receive the full history (the active model and routing workers). */
export function strictest(models: readonly any[], settings: any): Thresholds | undefined {
  const all = models
    .filter((model) => typeof model?.contextWindow === "number" && model.contextWindow > 0)
    .map((model) => thresholds(model.contextWindow, reserveTokens(settings, model)));
  if (!all.length) return undefined;
  return all.reduce((a, b) => (b.notice < a.notice ? b : a));
}
