/**
 * Provider-neutral view of one request's prompt-cache layout, in lookback positions.
 * An API adapter maps its payload to this shape; the planner never sees provider fields.
 */
export interface CacheLayout {
  /** Cumulative fingerprint of the prompt through each position, excluding cache markers. */
  chain: string[];
  /** Positions carrying a cache breakpoint, ascending. */
  breakpoints: number[];
  /** Breakpoints whose entry another breakpoint already covers, most dispensable first. */
  yieldable: number[];
}

export interface CacheLimits {
  maxBreakpoints: number;
  /** How many positions a breakpoint walks back to find an earlier entry. */
  lookback: number;
  /** Safety margin for counting differences between our positions and the provider's. */
  margin: number;
}

export interface AnchorPlan {
  add: number;
  remove?: number;
}

/**
 * Keep a remembered cache entry reachable. A provider only reads an entry that lies within its
 * lookback window of some breakpoint, so when a request extends an earlier one by more than that
 * window (for example after another model's turns were inserted), the earlier entry is lost even
 * though the prefix is unchanged. Placing a breakpoint on the earlier request's final entry lets
 * the request read it, and only the new tail is written.
 */
export function planAnchor(
  prior: readonly CacheLayout[],
  current: CacheLayout,
  limits: CacheLimits,
): AnchorPlan | undefined {
  let entry: number | undefined;
  for (const layout of prior) {
    const end = layout.breakpoints.at(-1);
    if (end === undefined || end >= current.chain.length || layout.chain[end] !== current.chain[end]) continue;
    if (entry === undefined || end > entry) entry = end;
  }
  if (entry === undefined || current.breakpoints.includes(entry)) return;
  const reach = current.breakpoints.find((position) => position > entry!);
  if (reach === undefined || reach - entry <= limits.lookback - limits.margin) return;
  if (current.breakpoints.length < limits.maxBreakpoints) return { add: entry };
  const remove = current.yieldable.find((position) => position < entry! && current.breakpoints.includes(position));
  return remove === undefined ? undefined : { add: entry, remove };
}
