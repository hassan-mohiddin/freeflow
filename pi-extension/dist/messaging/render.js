import { Text } from "@earendil-works/pi-tui";
import { firstLine, foldRow, paint } from "../host/rows.js";
/** Transcript rows for messaging (Task 002 D-008): what was sent to whom, what arrived from whom, and outcomes. */
const statusColor = (status) =>
  status === "delivered"
    ? "success"
    : status === "held"
      ? "warning"
      : status === "refused" || status === "failed"
        ? "error"
        : "muted";
export function renderSendCall(args, theme, context) {
  const to = String(args?.to ?? "");
  const message = String(args?.message ?? "");
  const head = `${paint(theme, "toolTitle", "Message")} ${paint(theme, "accent", `→ ${to}`)}${message ? `: ${paint(theme, "muted", firstLine(message))}` : ""}`;
  const body = message.includes("\n") || message.length > 100 ? [message] : [];
  return foldRow(head, body, context?.expanded === true, theme);
}
export function renderSendResult(result, options, theme) {
  const details = result?.details ?? {};
  const status = String(details.status ?? (result?.isError ? "failed" : "sent"));
  const name = details.name ?? details.to ?? "";
  const text = (result?.content ?? []).map((part) => part?.text ?? "").join("\n");
  const said =
    status === "delivered"
      ? `Delivered${name ? ` to ${name}` : ""}`
      : status === "held"
        ? `Held for ${name || "the other session"}'s user to accept`
        : firstLine(text, 140) || status;
  const extra = text.split("\n\n").slice(1).join("\n\n");
  return foldRow(paint(theme, statusColor(status), said), extra ? [extra] : [], options?.expanded === true, theme);
}
export function renderListResult(result, options, theme) {
  const sessions = result?.details?.sessions ?? [];
  const text = (result?.content ?? []).map((part) => part?.text ?? "").join("\n");
  const head = paint(theme, "muted", `${sessions.length} other ${sessions.length === 1 ? "session" : "sessions"}`);
  return foldRow(head, text.split("\n").slice(1), options?.expanded === true, theme);
}
/** A received message, a held message's outcome, or a watched session's status, delivered as a Freeflow message. */
export function renderMessage(message, options, theme) {
  const details = message?.details ?? {};
  const content = typeof message?.content === "string" ? message.content : "";
  const inner = content.replace(/^<[^>]*>\n?/, "").replace(/\n?<\/[a-z-]+>\s*$/, "");
  const label = paint(theme, "customMessageLabel", "Message");
  if (details.kind === "outcome") {
    const outcome =
      details.status === "accepted"
        ? "accepted and delivered"
        : details.status === "refused"
          ? "refused"
          : "not answered in time";
    return new Text(`${label} ${paint(theme, "muted", `to ${details.name ?? details.from}: ${outcome}`)}`, 0, 0);
  }
  if (details.kind === "idle" || details.kind === "exited")
    return new Text(
      `${paint(theme, "customMessageLabel", "Session")} ${paint(theme, "muted", `${details.name ?? details.from} ${details.kind === "idle" ? "is now idle" : "has ended"}`)}`,
      0,
      0,
    );
  const head = `${label} ${paint(theme, "accent", `← ${details.name ?? details.from ?? "another session"}`)}: ${paint(theme, "muted", firstLine(inner))}`;
  const body = inner.includes("\n") || inner.length > 100 ? [inner] : [];
  return foldRow(head, body, options?.expanded === true, theme);
}
