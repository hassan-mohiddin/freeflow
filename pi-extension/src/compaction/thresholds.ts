import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Where Freeflow's notice comes. Pi compacts on its own once context passes the window minus its reserve, and stays as
 * the fallback for a full context. The notice and the rows come from Track Work's notice5.mjs, the one formula every
 * driver shares (a lead before Pi's trigger, under a ceiling; P5, T13), loaded from Freeflow's package as the gates
 * are: until it has loaded there is no notice and no row, and the scripts' copy is the same formula.
 */

export const DEFAULT_RESERVE_TOKENS = 16_384;

export interface Thresholds {
  window: number;
  /** Where Pi compacts on its own. */
  trigger: number;
  /** Where Freeflow's one notice a cycle comes. */
  notice: number;
}

/** What Pi's extension uses of notice5.mjs. */
interface NoticeModule {
  noticePoint(options: { window: number; hostPoint?: number | null }): number;
  rowAt(tokens: number, window: number, point: number): number | null;
}

let notice: NoticeModule | undefined;

/** Loads notice5.mjs from Freeflow's package once; until it has loaded, no notice and no row is due. */
export function loadNotice(packageRoot: string): Promise<void> {
  return import(pathToFileURL(join(packageRoot, "skills", "track-work", "scripts", "lib", "notice5.mjs")).href)
    .then((loaded) => {
      notice = loaded as NoticeModule;
    })
    .catch(() => {
      notice = undefined;
    });
}

/** Pi's effective reserve for a model: its per-model override, else the ordinary setting, else Pi's default. */
export function reserveTokens(settings: any, model: { provider?: string; id?: string } | undefined): number {
  const compaction = settings?.compaction ?? {};
  const override = model ? compaction.modelOverrides?.[`${model.provider}/${model.id}`] : undefined;
  const value = override?.reserveTokens ?? compaction.reserveTokens;
  return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_RESERVE_TOKENS;
}

/** The thresholds of a window under a reserve, or undefined until notice5.mjs has loaded. */
export function thresholds(window: number, reserve: number): Thresholds | undefined {
  if (!notice) return undefined;
  const trigger = Math.max(0, window - reserve);
  return { window, trigger, notice: notice.noticePoint({ window, hostPoint: trigger }) };
}

/** The share of the window the highest row crossed shows (0.5, 0.6 or 0.7), below the notice point, or undefined. */
export function rowAt(tokens: number, { window, notice: point }: Thresholds): number | undefined {
  return notice?.rowAt(tokens, window, point) ?? undefined;
}

/** The strictest thresholds across models that may receive the full history. */
export function strictest(models: readonly any[], settings: any): Thresholds | undefined {
  const all = models
    .filter((model) => typeof model?.contextWindow === "number" && model.contextWindow > 0)
    .map((model) => thresholds(model.contextWindow, reserveTokens(settings, model)))
    .filter((each): each is Thresholds => each !== undefined);
  if (!all.length) return undefined;
  return all.reduce((a, b) => (b.notice < a.notice ? b : a));
}
