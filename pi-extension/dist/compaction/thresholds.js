import { join } from "node:path";
import { pathToFileURL } from "node:url";
/**
 * Where Freeflow's notice comes. Pi compacts on its own once context passes the window minus its reserve, and stays as
 * the fallback for a full context. The notice comes from Track Work's notice5.mjs, the one formula every driver shares
 * (a lead before Pi's trigger, under a ceiling; P5, T13), loaded from Freeflow's package as the gates are: until it has
 * loaded there is no notice, and the scripts' copy is the same formula.
 */
export const DEFAULT_RESERVE_TOKENS = 16_384;
let notice;
/** Loads notice5.mjs from Freeflow's package once; until it has loaded, no notice is due. */
export function loadNotice(packageRoot) {
  return import(pathToFileURL(join(packageRoot, "skills", "track-work", "scripts", "lib", "notice5.mjs")).href)
    .then((loaded) => {
      notice = loaded;
    })
    .catch(() => {
      notice = undefined;
    });
}
/** Pi's effective reserve for a model: its per-model override, else the ordinary setting, else Pi's default. */
export function reserveTokens(settings, model) {
  const compaction = settings?.compaction ?? {};
  const override = model ? compaction.modelOverrides?.[`${model.provider}/${model.id}`] : undefined;
  const value = override?.reserveTokens ?? compaction.reserveTokens;
  return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_RESERVE_TOKENS;
}
/** The thresholds of a window under a reserve, or undefined until notice5.mjs has loaded. */
export function thresholds(window, reserve) {
  if (!notice) return undefined;
  const trigger = Math.max(0, window - reserve);
  return { window, trigger, notice: notice.noticePoint({ window, hostPoint: trigger }) };
}
/** The strictest thresholds across models that may receive the full history. */
export function strictest(models, settings) {
  const all = models
    .filter((model) => typeof model?.contextWindow === "number" && model.contextWindow > 0)
    .map((model) => thresholds(model.contextWindow, reserveTokens(settings, model)))
    .filter((each) => each !== undefined);
  if (!all.length) return undefined;
  return all.reduce((a, b) => (b.notice < a.notice ? b : a));
}
