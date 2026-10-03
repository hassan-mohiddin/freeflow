/**
 * When compaction is due. Pi compacts on its own once context passes the window minus its reserve, and stays as the
 * fallback for a full context. Freeflow says "compact now" 25k tokens before that, leaving room to prepare after a
 * safe point, and warns earlier still: at 70% of the window, and at least 20k tokens before "compact now", so the
 * agent has room to reach a safe point first.
 */
export const DEFAULT_RESERVE_TOKENS = 16_384;
const WARNING_SHARE = 0.7;
const WARNING_LEAD = 20_000;
const COMPACT_NOW_HEADROOM = 25_000;
/** Pi's effective reserve for a model: its per-model override, else the ordinary setting, else Pi's default. */
export function reserveTokens(settings, model) {
  const compaction = settings?.compaction ?? {};
  const override = model ? compaction.modelOverrides?.[`${model.provider}/${model.id}`] : undefined;
  const value = override?.reserveTokens ?? compaction.reserveTokens;
  return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_RESERVE_TOKENS;
}
export function thresholds(window, reserve) {
  const trigger = Math.max(0, window - reserve);
  const compactNow = Math.max(0, trigger - COMPACT_NOW_HEADROOM);
  return {
    window,
    trigger,
    warning: Math.max(0, Math.min(Math.floor(window * WARNING_SHARE), compactNow - WARNING_LEAD)),
    compactNow,
  };
}
/** The strictest thresholds across models that may receive the full history (the active model and routing workers). */
export function strictest(models, settings) {
  const all = models
    .filter((model) => typeof model?.contextWindow === "number" && model.contextWindow > 0)
    .map((model) => thresholds(model.contextWindow, reserveTokens(settings, model)));
  if (!all.length) return undefined;
  return all.reduce((a, b) => (b.warning < a.warning ? b : a));
}
