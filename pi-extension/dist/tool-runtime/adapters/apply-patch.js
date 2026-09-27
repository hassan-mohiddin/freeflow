import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, open, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import { OperationExecutionError } from "../contracts.js";
import { v2ModelHeader } from "../presentation/v2.js";
import {
  insideWorkspace,
  MAX_WORKSPACE_TEXT_BYTES,
  readWorkspaceSnapshot,
  resolveWorkspaceFile,
  resolveWorkspaceRoot,
  workspaceDenied,
  WorkspaceError,
} from "./workspace.js";
const key = { id: "project.applyPatch", revision: "1" };
const boundary = "revision-bound-project-patch";
const MAX_FILES = 8;
const MAX_HUNKS = 64;
const MAX_PATCH_BYTES = 256 * 1024;
const revision = { type: "string", pattern: "^[a-f0-9]{64}$" };
const hash = (body) => createHash("sha256").update(body).digest("hex");
function reject(code, message) {
  throw new OperationExecutionError(code, message, "none");
}
function parsePatch(patch) {
  if (
    Buffer.byteLength(patch, "utf8") > MAX_PATCH_BYTES ||
    Buffer.from(patch, "utf8").toString("utf8") !== patch ||
    patch.includes("\0")
  )
    reject("patch_invalid", "Patch is not bounded UTF-8 text.");
  // The document grammar is LF-delimited; CRLF control lines are accepted without changing hunk text.
  const lines = patch.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const directive = (line) => (line.endsWith("\r") ? line.slice(0, -1) : line);
  if (directive(lines.shift() ?? "") !== "*** Begin Patch" || directive(lines.pop() ?? "") !== "*** End Patch")
    reject("patch_invalid", "Patch must have exact begin and end markers.");
  const files = [];
  let current;
  let hunk;
  for (const raw of lines) {
    const control = directive(raw);
    if (control.startsWith("*** Update File: ")) {
      const path = control.slice("*** Update File: ".length);
      if (!path || path.length > 4096 || files.length >= MAX_FILES || files.some((file) => file.path === path))
        reject("patch_invalid", "Patch file path is empty, duplicate, or exceeds the file limit.");
      current = { path, hunks: [] };
      files.push(current);
      hunk = undefined;
    } else if (control === "@@") {
      if (!current || current.hunks.length >= MAX_HUNKS)
        reject("patch_invalid", "Hunk is misplaced or exceeds the limit.");
      hunk = [];
      current.hunks.push(hunk);
    } else if (hunk && [" ", "-", "+"].includes(raw[0] ?? "")) {
      const text = raw.slice(1).replace(/\r$/, "");
      if (text.includes("\r") || text.includes("\0"))
        reject("patch_invalid", "Hunk text contains an unsupported control character.");
      hunk.push({ kind: raw[0], text });
    } else reject("patch_invalid", "Unsupported patch action, marker, or hunk line.");
  }
  if (
    !files.length ||
    files.some(
      (file) =>
        !file.hunks.length ||
        file.hunks.some(
          (part) =>
            !part.length ||
            !part.some((line) => line.kind === " ") ||
            !part.some((line) => line.kind !== " ") ||
            !part.some((line) => line.kind !== "+"),
        ),
    )
  )
    reject("patch_invalid", "Every file needs contextual, nonempty update hunks.");
  return files;
}
function sourceLines(text) {
  const lines = [];
  const re = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  for (const match of text.matchAll(re)) {
    if (!match[0]) break;
    lines.push({ text: match[1], eol: match[2] });
  }
  return lines;
}
function planBody(source, hunks) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(source);
  } catch {
    reject("invalid_encoding", "Patch target is not valid UTF-8 text.");
  }
  if (text.includes("\0")) reject("binary_unsupported", "Binary patch targets are unsupported.");
  const lines = sourceLines(text);
  const replacements = [];
  let previousEnd = -1;
  for (const hunk of hunks) {
    const old = hunk.filter((line) => line.kind !== "+").map((line) => line.text);
    const matches = [];
    for (let index = 0; index <= lines.length - old.length; index += 1)
      if (old.every((part, offset) => lines[index + offset].text === part)) matches.push(index);
    if (matches.length !== 1) reject("match_ambiguous", "Each contextual hunk must match exactly once.");
    const start = matches[0];
    const end = start + old.length;
    if (start < previousEnd) reject("hunk_conflict", "Patch hunks overlap or are out of order.");
    previousEnd = end;
    const original = lines.slice(start, end);
    const normalEol = original.find((line) => line.eol)?.eol ?? lines.find((line) => line.eol)?.eol ?? "\n";
    const lastEol = original.at(-1)?.eol ?? normalEol;
    let cursor = 0;
    const changed = [];
    for (const part of hunk) {
      if (part.kind === " ") changed.push(original[cursor++]);
      else if (part.kind === "-") cursor += 1;
      else changed.push({ text: part.text, eol: normalEol });
    }
    // Preserve a retained context line's original terminator when deleting an unterminated EOF line.
    if (end === lines.length && !lastEol && hunk.filter((line) => line.kind !== "-").at(-1)?.kind === "+")
      changed[changed.length - 1].eol = "";
    // Appending after an unterminated context needs an explicit EOF syntax, not an implicit overwrite.
    if (changed.some((line, index) => !line.eol && index < changed.length - 1))
      reject("patch_eol_unsupported", "Patch cannot append after an unterminated context line.");
    replacements.push({ start, end, lines: changed });
  }
  const resulting = [...lines];
  for (const item of replacements.reverse()) resulting.splice(item.start, item.end - item.start, ...item.lines);
  const nextText = resulting.map((line) => line.text + line.eol).join("");
  const next = Buffer.from(nextText, "utf8");
  if (next.length > MAX_WORKSPACE_TEXT_BYTES || next.toString("utf8") !== nextText || next.includes(0))
    reject("file_too_large", "Resulting file is too large or not valid UTF-8 text.");
  return next;
}
async function mutationPath(state, context, path) {
  if (!path || path.includes("\0") || isAbsolute(path)) reject("path_invalid", "Patch path must be project-relative.");
  const { root, denyPaths } = await resolveWorkspaceRoot(state, context.scope);
  const absolute = resolve(root, path);
  if (!insideWorkspace(root, absolute)) reject("path_outside_root", "Patch path escapes the workspace.");
  if (workspaceDenied(relative(root, absolute), denyPaths)) reject("path_denied", "Patch path is denied.");
  let ancestor = root;
  for (const segment of relative(root, absolute).split(sep).filter(Boolean)) {
    ancestor = resolve(ancestor, segment);
    const entry = await lstat(ancestor).catch(() => reject("path_unavailable", "Patch path is unavailable."));
    if (entry.isSymbolicLink()) reject("path_unsupported", "Patch paths cannot contain symlinks.");
  }
  const resolved = await resolveWorkspaceFile(state, context.scope, path);
  if (resolved.path !== absolute) reject("path_unsupported", "Patch path resolves through a symlink.");
  return { absolute, relativePath: resolved.relativePath };
}
function receipt(plans, dryRun) {
  return {
    dryRun,
    committedPrefix: 0,
    coordination: "runtime-instance-file-exclusive",
    files: plans.map((file) => ({
      path: file.path,
      beforeSha256: file.before,
      afterSha256: file.after,
      status: "not-applied",
    })),
  };
}
function result(value) {
  return { value: value, coverage: { kind: "complete-at-boundary", boundary } };
}
// Processed unchanged files count in the receipt prefix, but are not mutation evidence.
function priorPatchEffect(value) {
  return value.files.some((file) => file.status === "applied" || file.status === "unknown");
}
// A failed rename is not proof that it did nothing. Probe the original path and label only verified bytes.
async function observedStatus(file, io) {
  try {
    const actual = hash(await (io.readback ?? readWorkspaceSnapshot)(file.absolute));
    return actual === file.after ? "applied" : actual === file.before ? "not-applied" : "unknown";
  } catch {
    return "unknown";
  }
}
async function commit(file, signal, io = {}) {
  let temporary;
  let attempted = false;
  try {
    if (signal?.aborted) return { status: "not-applied", attempted, error: "cancelled" };
    const current = hash(await readWorkspaceSnapshot(file.absolute, signal));
    if (current !== file.before) return { status: "not-applied", attempted, error: "source_changed" };
    const mode = (await lstat(file.absolute)).mode & 0o7777;
    temporary = join(dirname(file.absolute), `.freeflow-patch-${randomUUID()}.tmp`);
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
    try {
      await handle.writeFile(file.next);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporary, mode);
    if (signal?.aborted) return { status: "not-applied", attempted, error: "cancelled" };
    if (hash(await readWorkspaceSnapshot(file.absolute)) !== file.before)
      return { status: "not-applied", attempted, error: "source_changed" };
    attempted = true;
    await (io.rename ?? rename)(temporary, file.absolute);
    temporary = undefined;
    const directory = await open(dirname(file.absolute), constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    const status = await observedStatus(file, io);
    return { status, attempted, ...(status === "applied" ? {} : { error: "patch_readback_failed" }) };
  } catch (error) {
    const status = attempted ? await observedStatus(file, io) : "not-applied";
    return { status, attempted, error: error instanceof WorkspaceError ? error.code : "patch_write_failed" };
  } finally {
    if (temporary) await rm(temporary, { force: true }).catch(() => {});
  }
}
export function createApplyPatchOperation(state, coordinator, io = {}) {
  return {
    key,
    contractVersion: 2,
    category: "project",
    cancellation: "reconciles-unknown",
    description:
      "Plan or apply a revision-bound update-only patch: LF-delimited Begin Patch, Update File, @@ hunks of space/-/+ lines, End Patch. Each context must match once; partial changes are not rolled back.",
    keywords: ["patch", "project", "update", "revision", "mutation"],
    owner: { adapterId: "freeflow.workspace", adapterRevision: "2", executionWorld: "local-workspace" },
    guidance: {
      useWhen:
        "Update existing UTF-8 files with *** Begin Patch, *** Update File: path, @@, contextual lines prefixed space/-/+, and *** End Patch. Supply each file's SHA-256 revision.",
      avoidWhen: "Do not retry a partial or unknown effect; inspect the recorded per-file receipt and reconcile first.",
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        patch: { type: "string", minLength: 1, maxLength: MAX_PATCH_BYTES },
        expectedRevisions: {
          type: "array",
          minItems: 1,
          maxItems: MAX_FILES,
          items: {
            type: "object",
            additionalProperties: false,
            properties: { path: { type: "string", minLength: 1, maxLength: 4096 }, sha256: revision },
            required: ["path", "sha256"],
          },
        },
        dryRun: { type: "boolean" },
      },
      required: ["patch", "expectedRevisions"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        dryRun: { type: "boolean" },
        committedPrefix: { type: "integer", minimum: 0, maximum: MAX_FILES },
        coordination: { type: "string", enum: ["runtime-instance-file-exclusive"] },
        files: {
          type: "array",
          minItems: 1,
          maxItems: MAX_FILES,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              path: { type: "string", minLength: 1, maxLength: 4096 },
              beforeSha256: revision,
              afterSha256: revision,
              status: { type: "string", enum: ["applied", "unchanged", "not-applied", "unknown"] },
            },
            required: ["path", "beforeSha256", "afterSha256", "status"],
          },
        },
      },
      required: ["dryRun", "committedPrefix", "files", "coordination"],
    },
    effects: ["live-read", "mutation"],
    effect: (input) => (input.dryRun ? "live-read" : "mutation"),
    concurrency: (input) => (input.dryRun ? "read-parallel" : "exclusive"),
    exposure: { discoverable: true, direct: true, programmatic: true },
    async authorize(input, scope) {
      try {
        const current = state();
        if (!input.dryRun && !current?.workspace.write)
          throw new WorkspaceError("workspace_write_disabled", "Workspace mutation is disabled.");
        await resolveWorkspaceRoot(current, scope);
        return { kind: "allowed" };
      } catch (error) {
        return {
          kind: "denied",
          code: error instanceof WorkspaceError ? error.code : "workspace_authorization",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async prepareExecution(input, context) {
      const request = input;
      const files = parsePatch(request.patch);
      const revisions = new Map();
      for (const expected of request.expectedRevisions) {
        if (revisions.has(expected.path)) reject("revision_invalid", "Duplicate expected revision path.");
        revisions.set(expected.path, expected.sha256);
      }
      if (revisions.size !== files.length || files.some((file) => !revisions.has(file.path)))
        reject("revision_invalid", "Expected revisions must match every patch file exactly.");
      const resolved = await Promise.all(
        files.map(async (file) => ({
          file,
          ...(await mutationPath(state(), context, file.path)),
        })),
      );
      if (new Set(resolved.map((item) => item.absolute)).size !== files.length)
        reject("patch_invalid", "Patch contains aliased paths.");
      const release = request.dryRun ? () => {} : await coordinator.acquire(resolved.map((item) => item.absolute));
      try {
        const plans = [];
        for (const item of resolved) {
          if (context.signal?.aborted) reject("cancelled", "Patch planning was cancelled.");
          const body = await readWorkspaceSnapshot(item.absolute, context.signal);
          const before = hash(body);
          if (before !== revisions.get(item.file.path)) reject("source_changed", "Patch target revision changed.");
          const next = planBody(body, item.file.hunks);
          plans.push({ path: item.relativePath, absolute: item.absolute, before, after: hash(next), next });
        }
        const dryRun = request.dryRun === true;
        return {
          release,
          onSkip: () => result(receipt(plans, dryRun)),
          async run(executionSignal) {
            const signal = executionSignal ?? context.signal;
            const value = receipt(plans, dryRun);
            if (dryRun) {
              for (let index = 0; index < plans.length; index += 1)
                if (plans[index].before === plans[index].after) value.files[index].status = "unchanged";
              return result(value);
            }
            // Effect start can yield to the host. Revalidate the whole set before committing anything.
            for (const file of plans) {
              if (signal?.aborted)
                throw new OperationExecutionError(
                  "cancelled",
                  "Patch cancelled before the first write.",
                  "none",
                  result(value),
                );
              if (!state()?.workspace.write)
                throw new OperationExecutionError(
                  "workspace_write_disabled",
                  "Workspace write policy changed.",
                  "none",
                  result(value),
                );
              try {
                const admitted = await mutationPath(state(), context, file.path);
                if (
                  admitted.absolute !== file.absolute ||
                  hash(await readWorkspaceSnapshot(file.absolute, signal)) !== file.before
                )
                  throw new WorkspaceError("source_changed", "A patch source changed after planning.");
              } catch (error) {
                throw new OperationExecutionError(
                  error instanceof WorkspaceError ? error.code : "source_changed",
                  "Patch target changed or became unavailable after planning.",
                  "none",
                  result(value),
                );
              }
            }
            for (let index = 0; index < plans.length; index += 1) {
              const file = plans[index];
              if (signal?.aborted || !state()?.workspace.write) {
                const code = signal?.aborted ? "cancelled" : "workspace_write_disabled";
                throw new OperationExecutionError(
                  code,
                  "Patch stopped between file commits.",
                  priorPatchEffect(value) ? "unknown" : "none",
                  result(value),
                );
              }
              try {
                const admitted = await mutationPath(state(), context, file.path);
                if (admitted.absolute !== file.absolute)
                  throw new WorkspaceError("source_changed", "Patch path changed.");
              } catch (error) {
                throw new OperationExecutionError(
                  error instanceof WorkspaceError ? error.code : "source_changed",
                  "Patch path became unavailable before its commit.",
                  priorPatchEffect(value) ? "unknown" : "none",
                  result(value),
                );
              }
              if (file.before === file.after) {
                value.files[index].status = "unchanged";
                value.committedPrefix += 1;
                continue;
              }
              const written = await commit(file, signal, io);
              value.files[index].status = written.status;
              if (written.error) {
                if (written.status === "applied") value.committedPrefix += 1;
                throw new OperationExecutionError(
                  written.error,
                  "Patch stopped after a file commit attempt.",
                  priorPatchEffect(value) || written.attempted ? "unknown" : "none",
                  result(value),
                );
              }
              value.committedPrefix += 1;
            }
            return result(value);
          },
        };
      } catch (error) {
        release();
        throw error;
      }
    },
    async execute() {
      throw new OperationExecutionError(
        "patch_preflight_missing",
        "Patch cannot execute without kernel preflight.",
        "none",
      );
    },
    presenter: {
      async model(_input, outcome, policy) {
        const value = outcome.value;
        const prefix = value
          ? `Patch ${value.dryRun ? "dry-run" : "apply"}; committed prefix ${value.committedPrefix}/${value.files.length}; ${value.files.map((file) => file.status).join(",")}.`
          : `Patch rejected (${outcome.error?.code ?? "unavailable"}); no file receipt.`;
        const details =
          value?.files
            .map((file) => `${file.path}: ${file.status} ${file.beforeSha256} -> ${file.afterSha256}`)
            .join("\n") ?? "";
        const budget = Math.max(0, policy.maxBytes - Buffer.byteLength(v2ModelHeader(outcome), "utf8"));
        const lines = `${prefix}\n${details}`;
        const shown =
          Buffer.byteLength(lines) <= budget ? lines : Buffer.from(prefix).subarray(0, budget).toString("utf8");
        return {
          text: shown,
          artifactRefs: [...outcome.artifactRefs],
          coverage: {
            kind: shown === lines ? "complete-at-boundary" : "limited",
            boundary: shown === lines ? boundary : "patch-model-view",
          },
        };
      },
      async ui(_input, outcome) {
        const value = outcome.value;
        return {
          summary: value
            ? `Patch · ${value.committedPrefix}/${value.files.length} verified · ${outcome.status}`
            : `Patch · ${outcome.status}`,
        };
      },
    },
  };
}
