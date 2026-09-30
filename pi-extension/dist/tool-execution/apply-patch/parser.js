// A port of OpenAI Codex's apply_patch parser (codex-rs/apply-patch/src/{parser,streaming_parser}.rs at bcd6d9ab,
// Apache-2.0), including its lenient forms, so patches GPT models write for Codex parse the same way here.
export class PatchParseError extends Error {
  line;
  constructor(message, line) {
    super(line === undefined ? message : `${message} (patch line ${line})`);
    this.line = line;
  }
}
const BEGIN = "*** Begin Patch";
const END = "*** End Patch";
const ADD = "*** Add File: ";
const DELETE = "*** Delete File: ";
const UPDATE = "*** Update File: ";
const MOVE = "*** Move to: ";
const EOF_MARKER = "*** End of File";
const ENVIRONMENT = "*** Environment ID: ";
const HEADERS = "Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'";
const UNEXPECTED = (line) =>
  `Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`;
function boundaries(lines) {
  const strict = (candidate) => {
    const first = candidate[0]?.trim(),
      last = candidate.at(-1)?.trim();
    if (first !== BEGIN) throw new PatchParseError(`The first line of the patch must be '${BEGIN}'`);
    if (last !== END) throw new PatchParseError(`The last line of the patch must be '${END}'`);
    return candidate;
  };
  try {
    return strict(lines);
  } catch (error) {
    // Codex's lenient mode: a heredoc wrapper, as GPT models write for a shell invocation. The optional
    // `apply_patch` prefix covers the same wrapper copied from a shell command.
    const first = lines[0]?.replace(/^apply_patch\s+/, "");
    if (["<<EOF", "<<'EOF'", '<<"EOF"'].includes(first ?? "") && lines.at(-1)?.endsWith("EOF") && lines.length >= 4)
      return strict(lines.slice(1, -1));
    throw error;
  }
}
export function parsePatch(text) {
  const lines = boundaries(text.trim().split(/\r?\n/));
  const hunks = [];
  let mode = "started";
  let updateHeaderLine = 0;
  let environment = false;
  const lastUpdate = () => {
    const hunk = hunks.at(-1);
    return hunk?.kind === "update" ? hunk : undefined;
  };
  const ensureUpdateNotEmpty = (line, number) => {
    const update = mode === "update" ? lastUpdate() : undefined;
    if (!update) return;
    if (update.chunks.length === 0)
      throw new PatchParseError(`Update file hunk for path '${update.path}' is empty`, updateHeaderLine);
    const chunk = update.chunks.at(-1);
    if (chunk.oldLines.length === 0 && chunk.newLines.length === 0)
      throw new PatchParseError(line === END ? "Update hunk does not contain any lines" : UNEXPECTED(line), number);
  };
  const header = (trimmed, number) => {
    if (mode === "started" && trimmed.startsWith(ENVIRONMENT) && hunks.length === 0) {
      if (environment) throw new PatchParseError("apply_patch environment_id cannot be specified more than once");
      if (!trimmed.slice(ENVIRONMENT.length).trim())
        throw new PatchParseError("apply_patch environment_id cannot be empty");
      environment = true;
      return true;
    }
    for (const [marker, kind] of [
      [END, "end"],
      [ADD, "add"],
      [DELETE, "delete"],
      [UPDATE, "update"],
    ]) {
      if (kind === "end" ? trimmed !== END : !trimmed.startsWith(marker)) continue;
      ensureUpdateNotEmpty(trimmed, number);
      const path = trimmed.slice(marker.length);
      if (kind === "end") mode = "ended";
      else if (kind === "add") {
        hunks.push({ kind: "add", path, contents: "" });
        mode = "add";
      } else if (kind === "delete") {
        hunks.push({ kind: "delete", path });
        mode = "delete";
      } else {
        hunks.push({ kind: "update", path, chunks: [] });
        mode = "update";
        updateHeaderLine = number;
      }
      return true;
    }
    return false;
  };
  const chunk = (update) => {
    if (update.chunks.length === 0) update.chunks.push({ oldLines: [], newLines: [], context: [], endOfFile: false });
    return update.chunks.at(-1);
  };
  lines.slice(1).forEach((line, offset) => {
    const number = offset + 2;
    const trimmed = line.trim();
    if (mode === "ended") {
      if (trimmed) throw new PatchParseError(`The last line of the patch must be '${END}'`, number);
      return;
    }
    if (mode === "started") {
      if (!header(trimmed, number))
        throw new PatchParseError(`'${trimmed}' is not a valid hunk header. ${HEADERS}`, number);
      return;
    }
    if (mode === "add") {
      if (header(trimmed, number)) return;
      const add = hunks.at(-1);
      if (line.startsWith("+") && add?.kind === "add") {
        add.contents += `${line.slice(1)}\n`;
        return;
      }
      throw new PatchParseError(`'${trimmed}' is not a valid hunk header. ${HEADERS}`, number);
    }
    if (mode === "delete") {
      if (header(trimmed, number)) return;
      throw new PatchParseError(`'${trimmed}' is not a valid hunk header. ${HEADERS}`, number);
    }
    // Update file.
    const updateLine = line.trimEnd();
    if (header(updateLine, number)) return;
    const update = lastUpdate();
    const current = update.chunks.at(-1);
    if (current?.endOfFile) {
      if (!updateLine) return;
      if (updateLine !== "@@" && !updateLine.startsWith("@@ "))
        throw new PatchParseError(`Expected update hunk to start with a @@ context marker, got: '${line}'`, number);
    }
    if (update.chunks.length === 0 && update.moveTo === undefined && updateLine.startsWith(MOVE)) {
      update.moveTo = updateLine.slice(MOVE.length);
      return;
    }
    const isAnchor = updateLine === "@@" || updateLine.startsWith("@@ ");
    if (isAnchor && current && current.oldLines.length === 0 && current.newLines.length === 0)
      throw new PatchParseError(UNEXPECTED(line), number);
    if (isAnchor) {
      update.chunks.push({
        ...(updateLine === "@@" ? {} : { anchor: updateLine.slice(3) }),
        oldLines: [],
        newLines: [],
        context: [],
        endOfFile: false,
      });
      return;
    }
    if (updateLine === EOF_MARKER) {
      if (!current || (current.oldLines.length === 0 && current.newLines.length === 0))
        throw new PatchParseError("Update hunk does not contain any lines", number);
      current.endOfFile = true;
      return;
    }
    if (line === "" || line.startsWith(" ")) {
      const target = chunk(update);
      target.context.push([target.oldLines.length, target.newLines.length]);
      const text = line === "" ? "" : line.slice(1);
      target.oldLines.push(text);
      target.newLines.push(text);
      return;
    }
    if (line.startsWith("+")) {
      chunk(update).newLines.push(line.slice(1));
      return;
    }
    if (line.startsWith("-")) {
      chunk(update).oldLines.push(line.slice(1));
      return;
    }
    if (current && (current.oldLines.length > 0 || current.newLines.length > 0))
      throw new PatchParseError(`Expected update hunk to start with a @@ context marker, got: '${line}'`, number);
    throw new PatchParseError(UNEXPECTED(line), number);
  });
  // `mode` changes inside the callback above, which the compiler cannot see.
  if (mode !== "ended") throw new PatchParseError(`The last line of the patch must be '${END}'`);
  return hunks;
}
