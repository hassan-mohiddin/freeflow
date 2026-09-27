/**
 * Keep a remembered cache entry reachable. A provider only reads an entry that lies within its
 * lookback window of some breakpoint, so when a request extends an earlier one by more than that
 * window (for example after another model's turns were inserted), the earlier entry is lost even
 * though the prefix is unchanged. Placing a breakpoint on the earlier request's final entry lets
 * the request read it, and only the new tail is written.
 */
export function planAnchor(prior, current, limits) {
  let entry;
  for (const layout of prior) {
    const end = layout.breakpoints.at(-1);
    if (end === undefined || end >= current.chain.length || layout.chain[end] !== current.chain[end]) continue;
    if (entry === undefined || end > entry) entry = end;
  }
  if (entry === undefined || current.breakpoints.includes(entry)) return;
  const reach = current.breakpoints.find((position) => position > entry);
  if (reach === undefined || reach - entry <= limits.lookback - limits.margin) return;
  if (current.breakpoints.length < limits.maxBreakpoints) return { add: entry };
  const remove = current.yieldable.find((position) => position < entry && current.breakpoints.includes(position));
  return remove === undefined ? undefined : { add: entry, remove };
}
