import { Text } from "@earendil-works/pi-tui";
import { briefOf } from "./runtime.js";

/*
 * How task memory looks in Pi's transcript. A task_memory call is one line naming what the agent does; its result is
 * one line (what happened) plus, for fan-out, the command to paste, and expands to the full text the model read. A
 * delivered resume view is one line naming the task, its state and next action, and expands to the view itself.
 * Rendering never changes what the model receives.
 */

type Theme = { fg?: (color: string, text: string) => string; bold?: (text: string) => string } | undefined;

const paint = (theme: Theme, color: string, text: string) => (theme?.fg ? theme.fg(color, text) : text);
const strong = (theme: Theme, text: string) => (theme?.bold ? theme.bold(text) : text);
const quoted = (value: unknown) => (typeof value === "string" && value.trim() ? `"${value.trim()}"` : "");
const named = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

/** What a call does, in a few words. */
export function callTitle(args: any = {}): string {
  const record = named(args.record, "a record");
  switch (args.action) {
    case "projects":
      return "List projects";
    case "list":
      return typeof args.project === "string" && args.project.trim()
        ? `List tasks in ${args.project.trim()}`
        : "List tasks";
    case "attach":
      return `Attach ${record}`;
    case "focus":
      return `Focus ${record}`;
    case "detach":
      return `Detach ${record}`;
    case "create":
      return `Create task ${quoted(args.title)}`.trim();
    case "child":
      return `Create child task ${quoted(args.title)}`.trim();
    case "fanout":
      return `Fan out ${quoted(args.title)}`.trim();
    case "view":
      return `Read ${record}${typeof args.entry === "string" && args.entry.trim() ? ` ${args.entry.trim()}` : ""}`;
    case "search":
      return `Search ${named(args.scope, "task")} for ${quoted(args.query) || "…"}`;
    case "project_new":
      return `Create project ${quoted(args.name)}`.trim();
    case "project_link":
      return `Link this repository to ${quoted(args.name)}`.trim();
    case "import":
      return `Import ${record} into ${named(args.project, "a project")}`;
    case "confirm":
      return `Make ${typeof args.record === "string" && args.record.trim() ? args.record.trim() : "held records"} writable`;
    case "env":
      return args.primary || args.add_dir || args.remove_dir
        ? `Change directories of ${record}`
        : `Directories of ${record}`;
    case "remove":
      return `Remove ${record}`;
    case "project_remove":
      return `Remove project ${quoted(args.name)}`.trim();
    default:
      return "Task memory";
  }
}

export function renderTaskCall(args: any, theme: Theme) {
  return new Text(
    `${strong(theme, paint(theme, "toolTitle", "Task memory"))} ${paint(theme, "muted", "·")} ${callTitle(args)}`,
    0,
    0,
  );
}

const textOf = (result: any) =>
  (result?.content ?? [])
    .filter((part: any) => part?.type === "text")
    .map((part: any) => part.text ?? "")
    .join("\n");

/** One line for a result whose operation gave no headline. */
function fallbackHeadline(action: string, text: string): string {
  const lines = text.split("\n").filter((line) => line.trim());
  const items = lines.filter((line) => line.startsWith("- ")).length;
  if (action === "search")
    return lines[0]?.startsWith("No match")
      ? lines[0]
      : `${lines.length} matching line${lines.length === 1 ? "" : "s"}`;
  if (action === "list") return items ? `${items} record${items === 1 ? "" : "s"}` : (lines[0] ?? "No records");
  if (action === "view") return `${lines.length} lines`;
  return lines[0] ?? "Done";
}

export function renderTaskResult(
  result: any,
  options: { expanded?: boolean; isPartial?: boolean },
  theme: Theme,
  context: any = {},
) {
  if (options.isPartial) return new Text(paint(theme, "muted", "Working…"), 0, 0);
  const details = result?.details ?? {};
  const text = textOf(result);
  const failed = context.isError === true || result?.isError === true;
  const headline = failed
    ? (details.headline ?? (text.split("\n")[0] || "Refused"))
    : (details.headline ?? fallbackHeadline(context.args?.action ?? details.action, text));
  const lines = [failed ? paint(theme, "error", headline) : paint(theme, "success", headline)];
  if (details.next) lines.push(paint(theme, "muted", `next: ${details.next}`));
  // The command is the point of a fan-out: shown even when collapsed, ready to copy.
  if (details.command)
    lines.push("", paint(theme, "muted", "Run in a new terminal:"), `  ${paint(theme, "accent", details.command)}`);
  if (options.expanded && text && text !== headline) lines.push("", text);
  else if (!options.expanded && !failed && text.split("\n").length > 1)
    lines.push(paint(theme, "dim", "(expand for details)"));
  return new Text(lines.join("\n"), 0, 0);
}

/** The delivered resume view: one line collapsed, the whole view expanded. */
export function renderSnapshotMessage(message: any, options: { expanded?: boolean }, theme: Theme) {
  const content = typeof message?.content === "string" ? message.content : textOf(message);
  const task = /Focused task: (.+?) \(\//.exec(content)?.[1] ?? "task";
  const unavailable = /The record is unavailable|cannot be read as a Schema 4/.test(content);
  const brief = briefOf(content);
  const label = strong(theme, paint(theme, "customMessageLabel", "Task memory"));
  const summary = unavailable
    ? paint(theme, "warning", `${task}: record unavailable`)
    : `${task} ${paint(theme, "muted", `· ${brief.state}${brief.next ? ` · next: ${brief.next}` : ""}`)}`;
  const head = `${label} ${summary}`;
  return new Text(options.expanded ? `${head}\n\n${content}` : head, 0, 0);
}
