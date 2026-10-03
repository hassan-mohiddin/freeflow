/**
 * The active branch, walked once per leaf. Pi only appends entries, so the branch ending at a given leaf never
 * changes; every reader that asks again before the leaf moves gets the same frozen array. Pi's own getBranch walks
 * the whole tree on each call, and Freeflow asks for the branch dozens of times per request (see
 * dev-docs/guides/performance.md).
 */
type Reader = { getBranch?(): readonly any[]; getLeafId?(): string | null };

// Keyed by the reader and its getBranch function, so a reader whose source is swapped is walked again.
const cache = new WeakMap<object, { leaf: string | null; source: unknown; branch: readonly any[] }>();

export function cachedBranch(reader: Reader | undefined | null): readonly any[] {
  if (!reader?.getBranch) return [];
  // Without a leaf id the branch cannot be keyed; fall back to Pi's walk.
  if (!reader.getLeafId) return reader.getBranch();
  const leaf = reader.getLeafId();
  const hit = cache.get(reader);
  if (hit && hit.leaf === leaf && hit.source === reader.getBranch) return hit.branch;
  const branch = Object.freeze([...reader.getBranch()]);
  cache.set(reader, { leaf, source: reader.getBranch, branch });
  return branch;
}
