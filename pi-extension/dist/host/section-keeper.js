/** The value of each section after replaying the transcript's system messages. */
export function currentSections(messages) {
  const current = {};
  for (const message of messages)
    if (message?.role === "system" && message.sections && typeof message.sections === "object")
      for (const [name, value] of Object.entries(message.sections)) current[name] = value;
  return current;
}
// One filtered copy per patch and section set, so a request reuses the object the previous request carried.
const copies = new WeakMap();
/** The sections of the first system message, the head of the prompt. */
export function headSections(messages) {
  const head = messages.find((message) => message?.role === "system" && message.sections);
  return head ? { ...head.sections } : undefined;
}
function sameSections(a, b) {
  const names = Object.keys(a);
  return names.length === Object.keys(b).length && names.every((name) => a[name] === b[name]);
}
/**
 * `version` changes whenever `own` does; it keys the reused copies without serialising the sections per request.
 * `head` is the head's sections when `own` was recorded: a head still equal to it is kept as it is, since later
 * patches carry any change; one that differs was rebuilt, and gets the recorded values.
 */
export function keepSections(messages, own, version = 0, head) {
  if (!own || !Object.keys(own).length) return [...messages];
  const key = String(version);
  const current = {};
  const out = [];
  let first = true;
  for (const message of messages) {
    const sections = message?.role === "system" ? message.sections : undefined;
    if (!sections || typeof sections !== "object") {
      out.push(message);
      continue;
    }
    // A head Pi rebuilt from its base options (after a compaction in a run it started) gets the recorded sections; the
    // head the recording saw stays as it is, so the prompt's start never changes.
    if (first) {
      first = false;
      const rebuilt = !head || !sameSections(sections, head);
      const missing = rebuilt ? Object.entries(own).filter(([name, value]) => sections[name] !== value) : [];
      for (const [name, value] of Object.entries(sections)) current[name] = value;
      if (!missing.length) {
        out.push(message);
        continue;
      }
      for (const [name, value] of missing) current[name] = value;
      out.push(reused(message, key, { ...sections, ...Object.fromEntries(missing) }));
      continue;
    }
    let kept;
    for (const [name, value] of Object.entries(sections)) {
      const wanted = own[name];
      const reverts = wanted !== undefined && current[name] === wanted && value !== wanted;
      const restates = value === current[name];
      if (wanted !== undefined && (reverts || restates)) {
        const trimmed = (kept ??= { ...sections });
        delete trimmed[name];
        continue;
      }
      current[name] = value;
    }
    if (!kept) {
      out.push(message);
      continue;
    }
    const empty =
      !Object.keys(kept).length &&
      !message.content?.length &&
      !message.toolsAdded?.length &&
      !message.toolsRemoved?.length;
    if (empty) continue;
    out.push(reused(message, key, kept));
  }
  return out;
}
/** The same copy for the same message and section set, so later requests carry the identical object. */
function reused(message, key, sections) {
  let byOwn = copies.get(message);
  if (!byOwn) copies.set(message, (byOwn = new Map()));
  let copy = byOwn.get(key);
  if (!copy) byOwn.set(key, (copy = { ...message, sections }));
  return copy;
}
