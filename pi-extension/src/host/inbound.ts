/*
 * The inbound channel: content that reaches the model from outside the turn (a background command's exit, and later
 * monitor events and messages from other sessions). One delivery rule for all of them:
 * - while the agent works, a notice is steered in after the current tool batch;
 * - while it is idle, a notice that should wake it starts a turn as Freeflow's own message (Pi drops Freeflow's
 *   system sections on such a run, Pi #10267; host/section-keeper.ts keeps them in the request);
 * - a notice that should not wake the agent waits for the next turn.
 * Notices from one source within a batching window join one notice, and a source that sends faster than its limit is
 * stopped with one notice saying so. Pi sends every custom message to the model in the user role, so a notice marks
 * its source itself: NOTICE_PREFIX for Freeflow's own notices, a tag for a message from another session. Notices are appended to the conversation; nothing earlier changes.
 */

import { Text } from "@earendil-works/pi-tui";

export const NOTICE_PREFIX = "[Freeflow notice, not from the user]";

export interface InboundHost {
  sendMessage(message: { customType: string; content: string; display: boolean; details: any }, options: any): any;
  sendUserMessage(content: string): any;
  /** Whether the agent is idle now; undefined when unknown. */
  isIdle(): boolean | undefined;
}

export interface Notice {
  /** The message type the transcript renders it by, such as `freeflow-background`. */
  customType: string;
  /** What the model reads, starting with NOTICE_PREFIX. */
  content: string;
  details: Record<string, unknown>;
  /** Start a turn when idle (true), or wait for the next turn (false). */
  wake: boolean;
}

export interface BatchOptions {
  /** Notices with the same key within `windowMs` join one notice. */
  key: string;
  windowMs?: number;
  /** At most this many delivered notices per minute for the key; past it the source is stopped. */
  perMinute?: number;
  /** Called once when the key passes its limit, so the source can stop itself. */
  onLimit?: () => void;
  /** The text of a batch; by default the notices' contents, one per line. */
  join?: (notices: Notice[]) => string;
}

type Pending = { notices: Notice[]; timer: ReturnType<typeof setTimeout>; batch: BatchOptions };

export class Inbound {
  private pending = new Map<string, Pending>();
  private sent = new Map<string, number[]>();
  private limited = new Set<string>();

  constructor(private readonly host: InboundHost) {}

  /** Deliver one notice now, or, with a batch key, after its window together with the others for that key. */
  deliver(notice: Notice, batch?: BatchOptions): void {
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
  flush(key: string): void {
    const pending = this.pending.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(key);
    this.sendBatch(pending);
  }

  /** Forget a source: drop what it has pending and its limit state. */
  close(key: string): void {
    const pending = this.pending.get(key);
    if (pending) clearTimeout(pending.timer);
    this.pending.delete(key);
    this.sent.delete(key);
    this.limited.delete(key);
  }

  /** Drop everything pending, at session end. */
  reset(): void {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.sent.clear();
    this.limited.clear();
  }

  private sendBatch({ notices, batch }: Pending): void {
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

  private send(notice: Notice): Promise<void> {
    const message = { customType: notice.customType, content: notice.content, display: true, details: notice.details };
    const asMessage = () =>
      Promise.resolve(
        this.host.sendMessage(
          message,
          notice.wake ? { triggerTurn: true, deliverAs: "steer" } : { triggerTurn: false },
        ),
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
export function renderNotice(label: string) {
  return (message: any, options: { expanded?: boolean }, theme: any) => {
    const content = typeof message?.content === "string" ? message.content : "";
    const body = content.split(NOTICE_PREFIX).join("").trim();
    const paint = (color: string, text: string) => (theme?.fg ? theme.fg(color, text) : text);
    // Blank lines separate a notice's parts; the row skips them.
    const lines = body.split("\n").filter((line) => line.trim() !== "");
    // A heading that ends in ":" introduces lines (a monitor's events): the row shows the first of them too.
    const introduces = (lines[0] ?? "").endsWith(":") && lines.length > 1;
    const more = introduces && lines.length > 2 ? ` (+${lines.length - 2} more)` : "";
    const first = introduces ? `${lines[0]} ${lines[1]}${more}` : (lines[0] ?? "");
    // "Background command bg1 completed" reads as label plus the rest; anything else gets the label in front.
    const rest = first.toLowerCase().startsWith(label.toLowerCase()) ? first.slice(label.length).trimStart() : first;
    const head = `${paint("customMessageLabel", label)} ${paint("muted", rest)}`;
    return new Text(options?.expanded && body.includes("\n") ? `${head}\n\n${body}` : head, 0, 0);
  };
}
