/**
 * Keep the last prompt's system sections on runs Pi starts itself (Pi #10267).
 *
 * Pi applies the sections a `before_agent_start` handler sets only for a run a user prompt started. A run started by an
 * extension message (a background exit, a monitor event, a message from another session) rebuilds the sections from
 * Pi's base options, so Pi appends a system patch that removes those sections (Freeflow's, and other extensions' such
 * as Pi's own MCP servers), and puts them back with another patch at the next prompt. Both patches change the prompt the
 * provider caches, and in between the model loses the guidance it was given.
 *
 * `currentSections` reads the sections a request carries, as Pi renders them; the host records them from a request of
 * a run a prompt started, while Freeflow sets sections. `keepSections` removes exactly the reversals from the request:
 * a patch entry for a recorded section is dropped when it would move the section away from the recorded value while
 * the request still carries that value, or when it only restores the value the request already carries. Any other
 * change (a section the prompt's run did not have, a value the next prompt's run records) passes through. The stored
 * transcript is never changed.
 */
export type OwnSections = Readonly<Record<string, string>>;

/** The value of each section after replaying the transcript's system messages. */
export function currentSections(messages: readonly any[]): Record<string, string | null> {
  const current: Record<string, string | null> = {};
  for (const message of messages)
    if (message?.role === "system" && message.sections && typeof message.sections === "object")
      for (const [name, value] of Object.entries(message.sections)) current[name] = value as string | null;
  return current;
}

// One filtered copy per patch and section set, so a request reuses the object the previous request carried.
const copies = new WeakMap<object, Map<string, any>>();

/** The sections of the first system message, the head of the prompt. */
export function headSections(messages: readonly any[]): Record<string, string | null> | undefined {
  const head = messages.find((message) => message?.role === "system" && message.sections);
  return head ? { ...head.sections } : undefined;
}

function sameSections(a: Record<string, unknown>, b: Readonly<Record<string, unknown>>): boolean {
  const names = Object.keys(a);
  return names.length === Object.keys(b).length && names.every((name) => a[name] === b[name]);
}

/**
 * `version` changes whenever `own` does; it keys the reused copies without serialising the sections per request.
 * `head` is the head's sections when `own` was recorded: a head still equal to it is kept as it is, since later
 * patches carry any change; one that differs was rebuilt, and gets the recorded values.
 */
export function keepSections(
  messages: readonly any[],
  own: OwnSections | undefined,
  version = 0,
  head?: Readonly<Record<string, string | null>>,
): any[] {
  if (!own || !Object.keys(own).length) return [...messages];
  const key = String(version);
  const current: Record<string, string | null | undefined> = {};
  const out: any[] = [];
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
      for (const [name, value] of Object.entries(sections)) current[name] = value as string | null;
      if (!missing.length) {
        out.push(message);
        continue;
      }
      for (const [name, value] of missing) current[name] = value;
      out.push(reused(message, key, { ...sections, ...Object.fromEntries(missing) }));
      continue;
    }
    let kept: Record<string, unknown> | undefined;
    for (const [name, value] of Object.entries(sections)) {
      const wanted = own[name];
      const reverts = wanted !== undefined && current[name] === wanted && value !== wanted;
      const restates = value === current[name];
      if (wanted !== undefined && (reverts || restates)) {
        const trimmed = (kept ??= { ...sections });
        delete trimmed[name];
        continue;
      }
      current[name] = value as string | null;
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
function reused(message: any, key: string, sections: Record<string, unknown>): any {
  let byOwn = copies.get(message);
  if (!byOwn) copies.set(message, (byOwn = new Map()));
  let copy = byOwn.get(key);
  if (!copy) byOwn.set(key, (copy = { ...message, sections }));
  return copy;
}
