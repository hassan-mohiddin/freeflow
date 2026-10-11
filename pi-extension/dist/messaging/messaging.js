import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { LiveRegistry } from "./registry.js";
import { close, listen, request, socketPathFor } from "./transport.js";
/**
 * Messaging between live Pi sessions on this machine (Task 002 D-005), following Claude Code's cross-session
 * messaging: a session listens on its own socket while messaging is effective and lists itself in the live registry.
 * A message from another session is delivered as a notice (steered in while busy, a new turn while idle), held for the
 * user in a dialog that expires, or refused, by the inbound policy; the sender learns which. A message is information
 * from another agent, never the user's instruction, and every delivered notice says so.
 */
export const MESSAGE_TYPE = "freeflow-message";
export const MAX_MESSAGE_CHARS = 100_000;
export const HOLD_EXPIRY_MS = 5 * 60_000;
export const MAX_HELD = 100;
/** A sender may send at most this many messages in BURST_WINDOW_MS. */
export const BURST_LIMIT = 5;
export const BURST_WINDOW_MS = 10_000;
/** A receiver takes at most this many messages a minute from one sender, and this many in all. */
export const PER_SENDER_PER_MINUTE = 20;
export const ACCEPTED_PER_MINUTE = 50;
export const WATCH_EXPIRY_MS = 12 * 60 * 60_000;
const shortId = (sessionId) => sessionId.replace(/-/g, "").slice(-8);
const attribute = (value) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/\n/g, " ");
/** A message body cannot close its own tag. */
const escapeBody = (text) => text.replace(/<\/(message|message-status|session-status)/gi, "<\\/$1");
export function displayName(identity) {
  return identity.name?.trim() || `${basename(identity.cwd) || "session"}-${shortId(identity.sessionId).slice(0, 4)}`;
}
export class Messaging {
  host;
  registry;
  server;
  me;
  busyNow = false;
  held = [];
  asking = false;
  watchers = new Map();
  sent = [];
  received = new Map();
  accepted = [];
  /** Display names of the sessions seen in the registry, for transcript rows. */
  names = new Map();
  holdExpiryMs;
  constructor(host, home, options = {}) {
    this.host = host;
    this.registry = new LiveRegistry(home);
    this.holdExpiryMs = options.holdExpiryMs ?? HOLD_EXPIRY_MS;
  }
  running() {
    return this.server !== undefined;
  }
  self() {
    return this.me;
  }
  heldCount() {
    return this.held.length;
  }
  /** Listen and list this session; idempotent. Call again after the identity changes (name, focus) to refresh it. */
  async start() {
    const identity = await this.host.identity();
    const socket = socketPathFor(identity.sessionId);
    if (this.server && this.me?.sessionId !== identity.sessionId) await this.stop();
    if (!this.server) this.server = await listen(socket, (body) => this.handle(body));
    this.me = {
      sessionId: identity.sessionId,
      name: displayName(identity),
      cwd: identity.cwd,
      socket,
      ...(identity.project ? { project: identity.project } : {}),
      ...(identity.task ? { task: identity.task } : {}),
      ...(identity.owns?.length ? { owns: identity.owns } : {}),
    };
    this.busyNow = this.host.busy();
    await this.publish();
  }
  /** Session end or messaging off: tell watchers it exited, forget held messages, leave the registry. */
  async stop() {
    const me = this.me;
    if (me) {
      await this.notifyWatchers("exited");
      await this.registry.remove(me.sessionId);
      this.published = "";
    }
    for (const held of this.held.splice(0)) await this.outcome(held, "expired");
    await close(this.server, me?.socket ?? "");
    this.server = undefined;
    this.me = undefined;
    this.watchers.clear();
  }
  /** The agent started or settled. Written only on change; turning idle notifies sessions waiting for it. */
  async setBusy(busy) {
    if (!this.me || busy === this.busyNow) return;
    this.busyNow = busy;
    await this.publish();
    if (!busy) await this.notifyWatchers("idle");
  }
  async list() {
    const sessions = await this.registry.list();
    for (const session of sessions) this.names.set(session.sessionId, session.name);
    return sessions;
  }
  /** The display name of a session this one has seen, for a row that has only its ID. */
  nameOf(sessionId) {
    return this.names.get(sessionId);
  }
  /**
   * The live session with this session ID. Only a full ID addresses a session: names and folders are for display and
   * may repeat (Task 002 D-009). An address that is not an ID gets the IDs it might mean, so the next call can use one.
   */
  async resolve(to) {
    const address = to.trim();
    if (address === this.me?.sessionId) return { error: "That is this session. Address another one." };
    const sessions = (await this.list()).filter((session) => session.sessionId !== this.me?.sessionId);
    const session = sessions.find((each) => each.sessionId === address);
    if (session) return { session };
    const compact = address.replace(/-/g, "");
    const near = sessions.filter(
      (each) =>
        each.name === address ||
        each.cwd === address ||
        each.owns?.includes(address) ||
        each.task === address ||
        (compact.length >= 4 && each.sessionId.replace(/-/g, "").includes(compact)),
    );
    const how = "Address a session by its session ID, from list_sessions or the session= of a message it sent.";
    return {
      error: near.length
        ? `"${to}" is not a session ID. ${how} Sessions it may mean: ${near.map((each) => `${each.name} (${each.sessionId})`).join(", ")}.`
        : `No live session with messaging on has the session ID "${to}". ${how}`,
    };
  }
  async send(to, text, options = {}) {
    const me = this.me;
    if (!me) return this.result(false, "Messaging is not running in this session.", {});
    const body = typeof text === "string" ? text : "";
    if (body.trim() === "") return this.result(false, "The message is empty.", {});
    if (body.length > MAX_MESSAGE_CHARS)
      return this.result(false, `The message has ${body.length} characters; the limit is ${MAX_MESSAGE_CHARS}.`, {});
    const now = Date.now();
    this.sent = this.sent.filter((at) => now - at < BURST_WINDOW_MS);
    if (this.sent.length >= BURST_LIMIT)
      return this.result(
        false,
        `Not sent: more than ${BURST_LIMIT} messages in ${BURST_WINDOW_MS / 1000} seconds. Wait for answers before sending more.`,
        { status: "refused" },
      );
    const { session, error } = await this.resolve(to);
    if (!session) return this.result(false, error ?? "No such session.", {});
    this.sent.push(now);
    const id = randomUUID();
    let reply;
    try {
      reply = await request(session.socket, {
        type: "message",
        id,
        from: me,
        text: body,
        ...(options.summary ? { summary: options.summary } : {}),
      });
    } catch (failure) {
      return this.result(
        false,
        `Not delivered to ${session.name}: ${failure instanceof Error ? failure.message : String(failure)}`,
        { to: session.sessionId, status: "failed" },
      );
    }
    const status = String(reply?.status ?? "failed");
    let watch = "";
    if (options.notifyWhenIdle && (status === "delivered" || status === "held")) {
      try {
        const watched = await request(session.socket, { type: "watch", from: me });
        watch =
          watched?.status === "idle"
            ? ` ${session.name} is idle now.`
            : ` You will get one notice when ${session.name} next goes idle or exits.`;
      } catch {
        watch = ` Could not ask to be told when ${session.name} goes idle.`;
      }
    }
    const said =
      status === "delivered" && reply?.waiting === true
        ? `Delivered to ${session.name} (${session.sessionId}), which has had no prompt yet: its agent reads the message when its user next sends one. A reply, if it sends one, reaches you as a notice: you do not need to wait or look for it.`
        : status === "delivered"
          ? `Delivered to ${session.name} (${session.sessionId}). A reply, if it sends one, reaches you as a notice: you do not need to wait or look for it.`
          : status === "held"
            ? `Held for ${session.name}'s user to accept or refuse; you will get a notice with the outcome (at most ${HOLD_EXPIRY_MS / 60_000} minutes).`
            : `Refused by ${session.name}${reply?.reason ? `: ${reply.reason}` : "."}`;
    return this.result(status === "delivered" || status === "held", `${said}${watch}`, {
      to: session.sessionId,
      name: session.name,
      status,
      id,
      ...(reply?.waiting === true ? { waiting: true } : {}),
    });
  }
  result(ok, text, details) {
    return { ok, text, details };
  }
  published = "";
  /** Write this session's registry entry when it changed. */
  async publish() {
    const me = this.me;
    if (!me) return;
    const entry = {
      sessionId: me.sessionId,
      name: me.name,
      cwd: me.cwd,
      pid: process.pid,
      socket: me.socket,
      busy: this.busyNow,
      ...(me.project ? { project: me.project } : {}),
      ...(me.task ? { task: me.task } : {}),
      ...(me.owns?.length ? { owns: me.owns } : {}),
      startedAt: this.startedAt,
    };
    const text = JSON.stringify(entry);
    if (text === this.published) return;
    await this.registry.write(entry);
    this.published = text;
  }
  startedAt = new Date().toISOString();
  /** One request from another session. */
  async handle(body) {
    const from = body?.from;
    if (!this.me) return { status: "refused", reason: "Messaging is off in this session." };
    if (!from || typeof from.sessionId !== "string" || typeof from.socket !== "string")
      return { status: "refused", reason: "The request names no sender." };
    if (body.type === "message") return this.receive(body, from);
    if (body.type === "watch") {
      if (!this.busyNow) return { status: "idle" };
      this.watchers.set(from.sessionId, { sender: from, until: Date.now() + WATCH_EXPIRY_MS });
      return { status: "watching" };
    }
    if (body.type === "outcome") {
      const outcome =
        body.status === "accepted"
          ? "was accepted by its user and delivered"
          : body.status === "refused"
            ? "was refused by its user"
            : "was not answered in time and was dropped";
      this.host.deliver(
        `<message-status to="${attribute(from.name)}" session="${attribute(from.sessionId)}">Your message ${outcome}.</message-status>`,
        {
          kind: "outcome",
          from: from.sessionId,
          name: from.name,
          status: body.status,
          id: body.id,
        },
      );
      return { status: "ok" };
    }
    if (body.type === "idle" || body.type === "exited") {
      this.host.deliver(
        `<session-status name="${attribute(from.name)}" session="${attribute(from.sessionId)}">${body.type === "idle" ? "The session is now idle." : "The session has ended."}</session-status>`,
        { kind: body.type, from: from.sessionId, name: from.name },
      );
      return { status: "ok" };
    }
    return { status: "refused", reason: `Unknown request type ${String(body.type)}.` };
  }
  async receive(body, from) {
    const text = typeof body.text === "string" ? body.text : "";
    if (text.trim() === "") return { status: "refused", reason: "The message is empty." };
    if (text.length > MAX_MESSAGE_CHARS) return { status: "refused", reason: "The message is too large." };
    const now = Date.now();
    const recent = (this.received.get(from.sessionId) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= PER_SENDER_PER_MINUTE)
      return { status: "refused", reason: `More than ${PER_SENDER_PER_MINUTE} messages a minute from one session.` };
    this.accepted = this.accepted.filter((at) => now - at < 60_000);
    if (this.accepted.length >= ACCEPTED_PER_MINUTE)
      return { status: "refused", reason: "This session is receiving too many messages; try again later." };
    this.received.set(from.sessionId, [...recent, now]);
    const policy = this.host.policy();
    const decision =
      policy === "refuse"
        ? "refuse"
        : policy === "accept"
          ? "accept"
          : policy === "hold"
            ? "hold"
            : from.project && from.project === this.me?.project
              ? "accept"
              : "hold";
    if (decision === "refuse") return { status: "refused", reason: "This session does not accept messages." };
    if (decision === "hold" && !this.host.canAsk())
      return {
        status: "refused",
        reason: "This session holds messages from outside its project, and has no UI to ask its user.",
      };
    const message = {
      id: String(body.id ?? randomUUID()),
      from,
      text,
      ...(typeof body.summary === "string" ? { summary: body.summary } : {}),
      at: now,
    };
    if (decision === "accept") {
      this.accepted.push(now);
      this.deliverMessage(message);
      return { status: "delivered", ...(this.host.canWake?.() === false ? { waiting: true } : {}) };
    }
    if (this.held.length >= MAX_HELD) {
      const dropped = this.held.shift();
      if (dropped) void this.outcome(dropped, "expired");
    }
    this.held.push(message);
    void this.askNext();
    return { status: "held" };
  }
  /** Put held messages to the user one at a time; each dialog expires, and the sender learns the outcome. */
  async askNext() {
    if (this.asking) return;
    this.asking = true;
    try {
      while (this.held.length > 0) {
        const message = this.held[0];
        const left = this.holdExpiryMs - (Date.now() - message.at);
        let answer = false;
        if (left > 0) {
          const preview = message.text.length > 600 ? `${message.text.slice(0, 600)}...` : message.text;
          answer = await this.host.confirm(
            `Message from ${message.from.name}`,
            `${message.from.name} (${message.from.cwd}${message.from.project ? `, project ${message.from.project}` : ""}) sent:\n\n${preview}\n\nDeliver it to the agent in this session?`,
            left,
          );
        }
        if (this.held[0] !== message) continue;
        this.held.shift();
        if (answer === true) {
          this.accepted.push(Date.now());
          this.deliverMessage(message);
        }
        const expired =
          !answer && Date.now() - message.at >= this.holdExpiryMs - Math.min(1_000, this.holdExpiryMs / 10);
        await this.outcome(message, answer ? "accepted" : expired ? "expired" : "refused");
      }
    } finally {
      this.asking = false;
    }
  }
  deliverMessage(message) {
    const from = message.from;
    // The tag marks it as another agent's message; the messaging skill says what to do with it (Task 002 D-008).
    const attributes = [
      `from="${attribute(from.name)}"`,
      `session="${attribute(from.sessionId)}"`,
      `folder="${attribute(from.cwd)}"`,
      ...(from.task ? [`task="${attribute(from.task)}"`] : []),
    ].join(" ");
    this.host.deliver(`<message ${attributes}>\n${escapeBody(message.text)}\n</message>`, {
      kind: "message",
      from: from.sessionId,
      name: from.name,
      id: message.id,
      ...(message.summary ? { summary: message.summary } : {}),
    });
  }
  async outcome(message, status) {
    if (!this.me) return;
    try {
      await request(message.from.socket, { type: "outcome", id: message.id, status, from: this.me });
    } catch {
      // The sender is gone; nothing to tell.
    }
  }
  async notifyWatchers(type) {
    const me = this.me;
    if (!me) return;
    const now = Date.now();
    const watchers = [...this.watchers.values()];
    this.watchers.clear();
    for (const { sender, until } of watchers) {
      if (until < now) continue;
      try {
        await request(sender.socket, { type, from: me });
      } catch {
        // The watcher is gone.
      }
    }
  }
}
