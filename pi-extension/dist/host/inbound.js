/*
 * The inbound channel: content that reaches the model from outside the turn (a background command's exit, and later
 * monitor events and messages from other sessions). One delivery rule for all of them:
 * - while the agent works, a notice is steered in after the current tool batch;
 * - while it is idle, a notice that should wake it starts a turn as a user message, so Freeflow's system sections
 *   survive (a run an extension message starts loses them from its second request, Pi #10267); if a run started
 *   meanwhile, it is steered in instead;
 * - a notice that should not wake the agent waits for the next turn.
 * Notices from one source within a batching window join one notice, and a source that sends faster than its limit is
 * stopped with one notice saying so. Every notice starts with NOTICE_PREFIX, so the model never reads it as the
 * user's words. Notices are appended to the conversation; nothing earlier changes.
 */
import { Text } from "@earendil-works/pi-tui";
export const NOTICE_PREFIX = "[Freeflow notice, not from the user]";
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
    const asMessage = () =>
      Promise.resolve(
        this.host.sendMessage(
          message,
          notice.wake ? { triggerTurn: true, deliverAs: "steer" } : { triggerTurn: false },
        ),
      ).catch(() => {});
    if (!notice.wake || this.host.isIdle() !== true) return asMessage();
    try {
      return Promise.resolve(this.host.sendUserMessage(notice.content)).catch(asMessage);
    } catch {
      return asMessage();
    }
  }
}
/**
 * A notice in the transcript: one line naming its source and what happened, expanding to the whole notice. The model
 * receives the same text either way.
 */
export function renderNotice(label) {
  return (message, options, theme) => {
    const content = typeof message?.content === "string" ? message.content : "";
    const body = content.split(NOTICE_PREFIX).join("").trim();
    const paint = (color, text) => (theme?.fg ? theme.fg(color, text) : text);
    const first = body.split("\n")[0] ?? "";
    // "Background command bg1 completed" reads as label plus the rest; anything else gets the label in front.
    const rest = first.toLowerCase().startsWith(label.toLowerCase()) ? first.slice(label.length).trimStart() : first;
    const head = `${paint("customMessageLabel", label)} ${paint("muted", rest)}`;
    return new Text(options?.expanded && body.includes("\n") ? `${head}\n\n${body}` : head, 0, 0);
  };
}
