import { Text } from "@earendil-works/pi-tui";

/**
 * A transcript row the way Pi draws its own: a one-line head, then the body. A short body (a few lines) shows in both
 * views; a long one shows only when the row is expanded (ctrl+o), with a count of what is hidden.
 */
export const SHORT_LINES = 4;
const SHORT_CHARS = 400;

export function paint(theme: any, color: string, text: string): string {
  return theme?.fg ? theme.fg(color, text) : text;
}

export function firstLine(text: string, max = 100): string {
  const line =
    String(text ?? "")
      .split("\n")
      .find((each) => each.trim()) ?? "";
  const clean = line.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function foldRow(head: string, body: readonly string[], expanded: boolean, theme: any): Text {
  const lines = body.flatMap((each) => String(each).split("\n"));
  const short = lines.length <= SHORT_LINES && lines.join("\n").length <= SHORT_CHARS;
  if (!lines.length) return new Text(head, 0, 0);
  if (expanded || short) return new Text(`${head}\n${lines.map((line) => `  ${line}`).join("\n")}`, 0, 0);
  return new Text(`${head} ${paint(theme, "dim", `(${lines.length} lines, ctrl+o to expand)`)}`, 0, 0);
}
