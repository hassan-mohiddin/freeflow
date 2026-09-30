import { createHash } from "node:crypto";
import type { ExternalCoverage } from "./contracts.js";

export const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

export function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function continuation(byte: number | undefined): boolean {
  return byte !== undefined && (byte & 0xc0) === 0x80;
}

function prefix(buffer: Buffer, maximum: number): Buffer {
  if (maximum >= buffer.length) return buffer;
  let end = Math.max(0, maximum);
  while (end > 0 && continuation(buffer[end])) end -= 1;
  return buffer.subarray(0, end);
}

function suffix(buffer: Buffer, maximum: number): Buffer {
  if (maximum >= buffer.length) return buffer;
  let start = Math.max(0, buffer.length - maximum);
  while (start < buffer.length && continuation(buffer[start])) start += 1;
  return buffer.subarray(start);
}

function notice(id: string, omitted: number, coverage: ExternalCoverage): string {
  const coverageText =
    coverage === "limited"
      ? "limited; the native result was already truncated before this capture"
      : "unspecified beyond the text visible at the result hook";
  return [
    "",
    `… [${omitted} captured bytes omitted] …`,
    `Captured tool text: ${id}. Scope: tool-result-hook. Upstream coverage: ${coverageText}.`,
    "Read freeflow_result with this ID and byte offsets. This is an exact excerpt, not complete live state.",
  ].join("\n");
}

export function renderCapturePresentation(
  body: string,
  id: string,
  maximumBytes: number,
  coverage: ExternalCoverage,
): { text: string; bytes: number } | undefined {
  if (!isWellFormedUnicode(body) || !Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) return undefined;
  const source = Buffer.from(body, "utf8");
  let omitted = source.length;
  let rendered = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const label = notice(id, omitted, coverage);
    const labelBytes = Buffer.byteLength(label, "utf8");
    const available = maximumBytes - labelBytes;
    if (available < 2) return undefined;
    const head = prefix(source, Math.ceil(available / 2));
    const tail = suffix(source, Math.floor(available / 2));
    if (head.length + tail.length >= source.length) return undefined;
    omitted = source.length - head.length - tail.length;
    rendered = `${head.toString("utf8")}${notice(id, omitted, coverage)}${tail.toString("utf8")}`;
  }
  const outputBytes = Buffer.byteLength(rendered, "utf8");
  return outputBytes <= maximumBytes && outputBytes < source.length
    ? { text: rendered, bytes: outputBytes }
    : undefined;
}
