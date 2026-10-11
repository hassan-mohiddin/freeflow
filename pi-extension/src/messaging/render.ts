import { Text } from "@earendil-works/pi-tui";
import { firstLine, foldRow, paint } from "../host/rows.js";

/** Transcript rows for messaging (Task 002 D-008): what was sent to whom, what arrived from whom, and outcomes. */

const statusColor = (status: string) =>
  status === "delivered"
    ? "success"
    : status === "held"
      ? "warning"
      : status === "refused" || status === "failed"
        ? "error"
        : "muted";

/** What the row adds under its head: the whole text when expanded, otherwise the lines after the first, if any. */
function bodyAfterHead(text: string, expanded: boolean): string[] {
  if (expanded) return text.length > 100 || text.includes("\n") ? [text] : [];
  const lines = text.split("\n");
  const first = lines.findIndex((line) => line.trim());
  return lines
    .slice(first + 1)
    .join("\n")
    .trim()
    ? [
        lines
          .slice(first + 1)
          .join("\n")
          .trim(),
      ]
    : [];
}

export function renderSendCall(args: any, theme: any, context: any): Text {
  const to = String(args?.to ?? "");
  const message = String(args?.message ?? "");
  const head = `${paint(theme, "toolTitle", "Message")} ${paint(theme, "accent", `→ ${to}`)}${message ? `: ${paint(theme, "muted", firstLine(message))}` : ""}`;
  return foldRow(head, bodyAfterHead(message, context?.expanded === true), context?.expanded === true, theme);
}

export function renderSendResult(result: any, options: any, theme: any): Text {
  const details = result?.details ?? {};
  const status = String(details.status ?? (result?.isError ? "failed" : "sent"));
  const name = details.name ?? details.to ?? "";
  const text = (result?.content ?? []).map((part: any) => part?.text ?? "").join("\n");
  const said =
    status === "delivered"
      ? `Delivered${name ? ` to ${name}` : ""}`
      : status === "held"
        ? `Held for ${name || "the other session"}'s user to accept`
        : firstLine(text, 140) || status;
  const extra = text.split("\n\n").slice(1).join("\n\n");
  return foldRow(paint(theme, statusColor(status), said), extra ? [extra] : [], options?.expanded === true, theme);
}

export function renderListResult(result: any, options: any, theme: any): Text {
  const sessions = result?.details?.sessions ?? [];
  const text = (result?.content ?? []).map((part: any) => part?.text ?? "").join("\n");
  const head = paint(theme, "muted", `${sessions.length} other ${sessions.length === 1 ? "session" : "sessions"}`);
  return foldRow(head, text.split("\n").slice(1), options?.expanded === true, theme);
}

/** A received message, a held message's outcome, or a watched session's status, delivered as a Freeflow message. */
export function renderMessage(message: any, options: { expanded?: boolean }, theme: any): Text {
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
  return foldRow(head, bodyAfterHead(inner, options?.expanded === true), options?.expanded === true, theme);
}
