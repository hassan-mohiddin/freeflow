/*
 * The inbound channel: content that reaches the model from outside the turn (a background command's exit, and later
 * monitor events and messages from other sessions). One delivery rule for all of them:
 * - while the agent works, a notice is steered in after the current tool batch;
 * - while it is idle, a notice that should wake it starts a turn as Freeflow's own message (Pi drops Freeflow's
 *   system sections on such a run, Pi #10267; host/section-keeper.ts keeps them in the request);
 * - a notice that should not wake the agent waits for the next turn, and so does every notice to a session that has
 *   never had a prompt: Pi builds the system prompt only for prompts, so a turn started there would have none;
 * Notices from one source within a batching window join one notice, and a source that sends faster than its limit is
 * stopped with one notice saying so. Pi sends every custom message to the model in the user role, so a notice marks
 * its source itself: a `<freeflow-notice>` tag for Freeflow's own (freeflowNotice()), a `<message>` tag for a message
 * from another session. Notices are appended to the conversation; nothing earlier changes.
 */
import { Text } from "@earendil-works/pi-tui";
/** The marker Freeflow's notices carried before the tag; saved sessions still contain it, so rows still read it. */
export const LEGACY_NOTICE_PREFIX = "[Freeflow notice, not from the user]";
/**
 * Text that came from outside Freeflow (a command's output, another session's message) with every `<freeflow-notice`
 * tag in it broken, so it can neither close a notice nor open one that looks like Freeflow's.
 */
export function withoutNoticeTags(text) {
  return text.replace(/<(\/?)(freeflow-notice)/gi, "<\\$1$2");
}
/**
 * Freeflow's own notice as the model reads it. Pi gives the model every custom message in the user role; the tag, which
 * Freeflow's guidance explains, says the text is Freeflow's and not the user's. The text cannot open or close the tag.
 */
export function freeflowNotice(type, text) {
  return `<freeflow-notice type="${type}">\n${withoutNoticeTags(text)}\n</freeflow-notice>`;
}
/** A notice's text without its tag, or without the old prefix. */
export function noticeBody(content) {
  return content
    .replace(/^\s*<freeflow-notice[^>]*>\n?/, "")
    .replace(/\n?<\/freeflow-notice>\s*$/, "")
    .split(LEGACY_NOTICE_PREFIX)
    .join("")
    .trim();
}
export class Inbound {
  host;
  pending = new Map();
  sent = new Map();
  limited = new Set();
  constructor(host) {
    this.host = host;
  }
  /** Deliver one notice now, or, with a batch key, after its window together with the others for that key. */
  deliver(notice, batch) {
    if (!batch) return void this.send(notice);
    if (this.limited.has(batch.key)) return;
    const pending = this.pending.get(batch.key);
    if (pending) {
      pending.notices.push(notice);
      return;
    }
    const timer = setTimeout(() => this.flush(batch.key), batch.windowMs ?? 200);
    this.pending.set(batch.key, { notices: [notice], timer, batch });
  }
  /** Deliver what a key has pending now, before its window ends: its source finished and has more to say after it. */
  flush(key) {
    const pending = this.pending.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(key);
    this.sendBatch(pending);
  }
  /** Forget a source: drop what it has pending and its limit state. */
  close(key) {
    const pending = this.pending.get(key);
    if (pending) clearTimeout(pending.timer);
    this.pending.delete(key);
    this.sent.delete(key);
    this.limited.delete(key);
  }
  /** Drop everything pending, at session end. */
  reset() {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.sent.clear();
    this.limited.clear();
  }
  sendBatch({ notices, batch }) {
    const now = Date.now();
    const recent = (this.sent.get(batch.key) ?? []).filter((at) => now - at < 60_000);
    if (batch.perMinute !== undefined && recent.length >= batch.perMinute) {
      this.limited.add(batch.key);
      batch.onLimit?.();
      return;
    }
    this.sent.set(batch.key, [...recent, now]);
    const [first] = notices;
    this.send({
      customType: first.customType,
      content: batch.join ? batch.join(notices) : notices.map((notice) => notice.content).join("\n"),
      details: { ...first.details, batched: notices.length },
      wake: notices.some((notice) => notice.wake),
    });
  }
  send(notice) {
    const message = { customType: notice.customType, content: notice.content, display: true, details: notice.details };
    const wake = notice.wake && this.host.canWake?.() !== false;
    const asMessage = () =>
      Promise.resolve(
        this.host.sendMessage(message, wake ? { triggerTurn: true, deliverAs: "steer" } : { triggerTurn: false }),
      ).catch(() => {});
    // Always Freeflow's own message, never the user's: keepSections holds Freeflow's system sections on the run it
    // starts (Pi #10267), which once made idle notices go out as user messages.
    return asMessage();
  }
}
/**
 * A notice in the transcript: one line naming its source and what happened, expanding to the whole notice. The model
 * receives the same text either way.
 */
export function renderNotice(label) {
  return (message, options, theme) => {
    const content = typeof message?.content === "string" ? message.content : "";
    const body = noticeBody(content);
    const paint = (color, text) => (theme?.fg ? theme.fg(color, text) : text);
    // Blank lines separate a notice's parts; the row skips them.
    const lines = body.split("\n").filter((line) => line.trim() !== "");
    // A heading that ends in ":" introduces lines (a monitor's events): the row shows the first of them too.
    const introduces = (lines[0] ?? "").endsWith(":") && lines.length > 1;
    const more = introduces && lines.length > 2 ? ` (+${lines.length - 2} more)` : "";
    // A long first line (a compaction notice is one paragraph) shows its first sentence; the rest is on expand.
    const opening = lines[0] ?? "";
    const sentence = opening.length > 140 ? opening.slice(0, opening.search(/\.(\s|$)/) + 1) || opening : opening;
    const first = introduces ? `${lines[0]} ${lines[1]}${more}` : sentence;
    // "Background command bg1 completed" reads as label plus the rest; anything else gets the label in front.
    const rest = first.toLowerCase().startsWith(label.toLowerCase()) ? first.slice(label.length).trimStart() : first;
    const head = `${paint("customMessageLabel", label)} ${paint("muted", rest)}`;
    return new Text(options?.expanded && (body.includes("\n") || first !== body) ? `${head}\n\n${body}` : head, 0, 0);
  };
}
