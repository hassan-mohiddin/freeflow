// The confinement rules every host's guard enforces: which tools a subject may call, where reads and writes may
// go, and how bash reaches its container. The evaluator passes them to the subject's host process in SKILL_EVAL_*
// variables; Pi's guard extension (pi-guard.mjs) and Claude Code's PreToolUse hook (claude-guard.mjs) both decide
// with `decideToolCall`, so a rule holds the same way on every host. Tool names here are the evaluator's own
// (read, write, edit, ls, find, grep, bash) plus Freeflow's Tool Execution tools on Pi (bash_background, monitor,
// stop_background, apply_patch); each guard maps its host's names onto them.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const PATH_TOOLS = new Set(["read", "write", "edit"]);
// Tools whose `command` runs in a shell: Pi's bash, and Freeflow's background commands and monitors, which run their
// command with Pi's shell on the host unless the guard routes it into the subject's container.
export const SHELL_TOOLS = new Set(["bash", "bash_background", "monitor"]);
// Background commands outlive the call that starts them, so only a container, which the evaluator removes when the
// subject ends, can hold them; a shell isolation extension confines only the bash tool it wraps.
const CONTAINER_ONLY_TOOLS = new Set(["bash_background", "monitor"]);
// Freeflow's patch tool writes, moves and deletes every file its patch names (and reads the files it updates).
const PATCH_TOOL = "apply_patch";
const PATCH_HEADERS = ["*** Add File: ", "*** Delete File: ", "*** Update File: ", "*** Move to: "];
// Set by pi-container-route.mjs when it loads; Pi's guard refuses a container shell call without it.
export const CONTAINER_ROUTE = Symbol.for("skill-eval.container-route");
// Listing and search tools take an optional path that defaults to the working directory; an explicit path is
// confined to the readable roots like a read.
const LISTING_TOOLS = new Set(["ls", "find", "grep"]);

export function parseStringArray(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : [];
  } catch {
    return [];
  }
}

// A declared shell (SKILL_EVAL_SHELL, set by the evaluator only for arms whose shell isolation it verified)
// is the only way bash is allowed. Its optional `workspace` is the path where the isolation shows the workspace.
export function parseShell(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && typeof parsed.isolation === "string" ? parsed : null;
  } catch {
    return null;
  }
}

// A path under the isolation's workspace mount (such as /workspace/src/a.js) names the same file in the host
// workspace, so it is checked there; every other path is checked as a host path.
function mapGuestPath(requested, shell, writableRoot) {
  const mount = shell?.workspace;
  if (typeof mount !== "string" || !requested.startsWith("/")) return requested;
  const normalized = path.posix.normalize(requested);
  if (normalized === mount) return writableRoot;
  if (!normalized.startsWith(`${mount}/`)) return requested;
  return path.join(writableRoot, ...normalized.slice(mount.length + 1).split("/"));
}

// The running container a container environment's bash is routed into: { name, host, workdir }.
function parseContainer(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed?.name === "string" && typeof parsed.workdir === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

// Runs in the container around a shell tool's command, so the command's whole process group ends when the docker
// client that started it does. The client's stdin (see containerCommand) stays open while it lives and never sends
// anything; killing the client closes it, and the watcher reading it then kills the command's group. Without this, a
// command Pi stops (a timeout, an abort, stop_background, the session ending) would keep running in the container:
// docker exec does not pass signals on. The command itself gets no stdin, as on the host, runs in its own session when
// the image has setsid, and its exit status is the wrapper's.
const CONTAINER_LIFETIME = [
  "exec 3<&0",
  'if command -v setsid >/dev/null 2>&1; then setsid sh -c "$1" </dev/null & else sh -c "$1" </dev/null & fi',
  "p=$!",
  '{ while read -r _; do :; done; kill -s KILL -- "-$p" 2>/dev/null || kill -s KILL "$p" 2>/dev/null; } <&3 >/dev/null 2>&1 &',
  "w=$!",
  "exec 3<&-",
  'wait "$p"',
  "s=$?",
  'kill "$w" 2>/dev/null',
  'exit "$s"',
].join("\n");

/**
 * The host command that runs `command` in the subject's container: the docker client, given a stdin that stays open
 * for as long as it runs (a FIFO opened read-write, which never ends and is removed at once), runs the lifetime
 * wrapper, which runs the command at the container's working directory.
 */
export function containerCommand(target, command) {
  const host = typeof target.host === "string" && target.host !== "" ? `--host ${shellQuote(target.host)} ` : "";
  const exec = `docker ${host}exec -i --workdir ${shellQuote(target.workdir)} ${shellQuote(target.name)} sh -c ${shellQuote(CONTAINER_LIFETIME)} sh ${shellQuote(command)}`;
  return `skill_eval_in=$(mktemp -d) && mkfifo "$skill_eval_in/in" && { rm -rf "$skill_eval_in"; ${exec}; } <>"$skill_eval_in/in"`;
}

/**
 * A path argument as the host's tools take it: Pi and Freeflow drop a leading `@` and expand a leading `~` to the home
 * directory, so the guard checks the file the tool will actually use.
 */
function hostToolPath(requested) {
  const declared = requested.startsWith("@") ? requested.slice(1) : requested;
  if (declared === "~") return homedir();
  if (declared.startsWith("~/")) return `${homedir()}${declared.slice(1)}`;
  return declared;
}

/**
 * Every path a patch for Freeflow's apply_patch names, over-approximated: each line that is, once trimmed, or once
 * trailing space is removed, a file header or a move target, split on the same line breaks as Freeflow's parser.
 * Freeflow reads a header only from such a line, so no path it uses is missed; a context line that only looks like a
 * header adds a path to check and can only refuse more.
 */
export function patchPaths(patch) {
  const paths = [];
  for (const line of patch.split(/\r?\n/)) {
    for (const candidate of new Set([line.trim(), line.trimEnd()])) {
      const header = PATCH_HEADERS.find((marker) => candidate.startsWith(marker));
      if (header !== undefined) paths.push(candidate.slice(header.length));
    }
  }
  return [...new Set(paths)];
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function resolveWritablePath(cwd, requested) {
  const absolute = path.resolve(cwd, requested);
  /** @type {string[]} */
  const missingSegments = [];
  let candidate = absolute;
  while (true) {
    try {
      return path.join(realpathSync(candidate), ...missingSegments);
    } catch {
      try {
        lstatSync(candidate);
        throw new Error(`Existing writable path cannot be resolved: ${requested}`);
      } catch (error) {
        if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) throw new Error(`Cannot resolve writable path: ${requested}`);
      missingSegments.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
}

export function escapeXml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

export function loadDeclaredContext(manifestPath) {
  if (!manifestPath) return [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Declared context manifest cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (manifest?.schema_version !== 1 || !Array.isArray(manifest.entries)) {
    throw new Error("Declared context manifest must use schema_version 1 and contain entries");
  }
  for (const entry of manifest.entries) {
    if (typeof entry?.declaredPath !== "string" || !Array.isArray(entry.files)) {
      throw new Error("Declared context manifest entry is malformed");
    }
    for (const file of entry.files) {
      if (
        typeof file?.path !== "string" ||
        typeof file.sha256 !== "string" ||
        typeof file.content !== "string" ||
        createHash("sha256").update(file.content).digest("hex") !== file.sha256
      ) {
        throw new Error(`Declared context file is malformed or changed: ${file?.path ?? "unknown"}`);
      }
    }
  }
  return manifest.entries;
}

export function renderDeclaredContext(declaredContext) {
  const lines = ["<declared_context>"];
  for (const entry of declaredContext) {
    lines.push(`  <context declared-path="${escapeXml(entry.declaredPath)}">`);
    for (const file of entry.files) {
      lines.push(`    <file path="${escapeXml(file.path)}">\n${file.content}</file>`);
    }
    lines.push("  </context>");
  }
  lines.push("</declared_context>");
  return lines.join("\n");
}

/**
 * The guard's rules from the evaluator's variables: readable roots, the writable workspace, the declared tools, and
 * the verified shell, if any.
 *
 * @param {Record<string, string | undefined>} environment
 */
export function guardState(environment) {
  const allowedRoots = parseStringArray(environment.SKILL_EVAL_ALLOWED_ROOTS).map((root) => realpathSync(root));
  const writableRootValue = environment.SKILL_EVAL_WRITABLE_ROOT;
  if (!writableRootValue) throw new Error("SKILL_EVAL_WRITABLE_ROOT is required");
  return {
    allowedRoots,
    writableRoot: realpathSync(writableRootValue),
    allowedTools: new Set(parseStringArray(environment.SKILL_EVAL_ALLOWED_TOOLS)),
    shell: parseShell(environment.SKILL_EVAL_SHELL),
  };
}

/**
 * Decides one tool call. `input.path` is the path argument of a path or listing tool, `input.command` bash's command.
 * Returns `{ block: true, reason }` to refuse the call, `{ command }` when bash must run that command instead (its
 * container), or undefined to let the call run as it is.
 *
 * @param {ReturnType<typeof guardState>} state
 * @param {string} toolName the evaluator's tool name
 * @param {any} input
 * @param {string} cwd the subject's working directory
 * @param {Record<string, string | undefined>} environment
 */
export function decideToolCall(state, toolName, input, cwd, environment) {
  const { allowedRoots, writableRoot, allowedTools, shell } = state;
  if (!allowedTools.has(toolName)) {
    return { block: true, reason: `Tool is not declared for this evaluation: ${toolName}` };
  }
  if (SHELL_TOOLS.has(toolName)) {
    if (shell === null) {
      return { block: true, reason: `${toolName} runs only in a declared shell isolation for this evaluation` };
    }
    if (CONTAINER_ONLY_TOOLS.has(toolName) && !shell.container) {
      return { block: true, reason: `${toolName} runs only in a container environment for this evaluation` };
    }
  }
  if (SHELL_TOOLS.has(toolName) && shell.container) {
    const target = parseContainer(environment.SKILL_EVAL_CONTAINER);
    if (target === null) return { block: true, reason: "the container for this evaluation is not running" };
    if (typeof input?.command !== "string") return { block: true, reason: `${toolName} needs a command` };
    // The host's shell then runs only the docker client; the command itself runs in the subject's container.
    return { command: containerCommand(target, input.command) };
  }
  if (toolName === PATCH_TOOL) return decidePatch(writableRoot, input, cwd);
  const listing = LISTING_TOOLS.has(toolName);
  if (!PATH_TOOLS.has(toolName) && !listing) return undefined;
  if (listing && input?.path === undefined) {
    const canonicalCwd = realpathSync(cwd);
    return allowedRoots.some((root) => isContained(root, canonicalCwd))
      ? undefined
      : { block: true, reason: `${toolName} needs a path inside the evaluation environment` };
  }
  if (typeof input?.path !== "string") {
    return { block: true, reason: `${toolName} requires a path inside the evaluation environment` };
  }

  const declared = input.path.startsWith("@") ? input.path.slice(1) : input.path;
  const requested = mapGuestPath(hostToolPath(input.path), shell, writableRoot);
  let canonical;
  try {
    canonical = toolName === "write" ? resolveWritablePath(cwd, requested) : realpathSync(path.resolve(cwd, requested));
  } catch {
    return {
      block: true,
      reason: `${toolName} path cannot be resolved inside the evaluation environment: ${declared}`,
    };
  }
  const roots = toolName === "read" || listing ? allowedRoots : [writableRoot];
  if (!roots.some((root) => isContained(root, canonical))) {
    return { block: true, reason: `${toolName} path escapes the evaluation environment: ${declared}` };
  }
  return undefined;
}

/** apply_patch writes only inside the workspace: every path its patch names must resolve there, as a write's would. */
function decidePatch(writableRoot, input, cwd) {
  if (typeof input?.input !== "string") return { block: true, reason: "apply_patch needs a patch" };
  for (const declared of patchPaths(input.input)) {
    let canonical;
    try {
      canonical = resolveWritablePath(cwd, hostToolPath(declared));
    } catch {
      return {
        block: true,
        reason: `apply_patch path cannot be resolved inside the evaluation environment: ${declared}`,
      };
    }
    if (!isContained(writableRoot, canonical)) {
      return { block: true, reason: `apply_patch path escapes the evaluation environment: ${declared}` };
    }
  }
  return undefined;
}
