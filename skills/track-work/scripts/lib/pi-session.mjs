// Pi's session file (Pi 1.4.0's docs/session-format.md): JSONL whose first line is the header, `{"type":"session"}`,
// and whose entries form a tree through `id` and `parentId`. The conversation is the active branch: the path from the
// newest entry back to the root. The readers here follow that branch only, so a branch left with /tree is not read.

/** Whether a transcript's text is a Pi session file: its first line is Pi's session header. */
export function isPiSession(text) {
  const first = text.slice(0, text.indexOf("\n") < 0 ? text.length : text.indexOf("\n"));
  try {
    return JSON.parse(first)?.type === "session";
  } catch {
    return false;
  }
}

/** The active branch's entries, oldest first. */
export function piBranch(text) {
  const byId = new Map();
  let leaf = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof entry?.id !== "string") continue;
    byId.set(entry.id, entry);
    leaf = entry;
  }
  const branch = [];
  const seen = new Set();
  for (let entry = leaf; entry && !seen.has(entry.id); entry = byId.get(entry.parentId)) {
    seen.add(entry.id);
    branch.push(entry);
  }
  return branch.reverse();
}

const NOTICE = /^\s*<freeflow-notice[\s>]/;

const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((block) => (block?.type === "text" ? block.text : block?.type === "image" ? "[an image]" : ""))
          .filter(Boolean)
          .join("\n")
      : "";

/** The messages the user typed on the active branch; Freeflow's notices, sent in the user's turn, are left out. */
export function piUserMessages(text) {
  return piBranch(text)
    .filter((entry) => entry.type === "message" && entry.message?.role === "user")
    .map((entry) => ({ at: entry.timestamp ?? null, text: textOf(entry.message.content).replace(/\s+$/, "") }))
    .filter((message) => message.text.trim() && !NOTICE.test(message.text));
}

/**
 * The active branch's tool results, oldest first, each with its tool call's ID, the call's name and arguments, its
 * text, time and whether it failed; `cycleFrom` is the index of the first result after the branch's last compaction.
 */
export function piToolResults(text) {
  const calls = new Map();
  const results = [];
  let cycleFrom = null;
  for (const entry of piBranch(text)) {
    if (entry.type === "compaction") {
      cycleFrom = results.length;
      continue;
    }
    if (entry.type !== "message") continue;
    const message = entry.message ?? {};
    if (message.role === "assistant" && Array.isArray(message.content))
      for (const block of message.content)
        if (block?.type === "toolCall") calls.set(block.id, { name: block.name, input: block.arguments ?? {} });
    if (message.role === "toolResult") {
      const call = calls.get(message.toolCallId) ?? { name: message.toolName ?? "a tool call", input: {} };
      results.push({
        id: message.toolCallId,
        name: call.name,
        input: call.input,
        text: textOf(message.content),
        at: entry.timestamp ?? null,
        error: message.isError === true,
      });
    }
  }
  return { results, cycleFrom };
}
