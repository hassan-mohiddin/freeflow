// Keyed by the reader and its getBranch function, so a reader whose source is swapped is walked again.
const cache = new WeakMap();
export function cachedBranch(reader) {
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
