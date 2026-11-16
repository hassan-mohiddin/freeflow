// The gate (SPEC-008): the rule that a worker's writes stay in its brief's `May write:` scope and off the task's record,
// and that a file another session claims is warned of. Checked by each Freeflow driver before a tool call runs, from
// the small state Track Work's lifecycle commands keep in `<FREEFLOW_HOME>/sessions/<session>/gates.json` (lib/
// gate-state5.mjs). One module decides for every driver (T1): Claude Code's mod imports this file, Pi's extension loads
// it from Freeflow's package, and Codex's driver calls it. It is pure and synchronous, and imports nothing, so a mod
// may import it and a call costs no file read: the driver hands it the state it holds, the call and the settings.
// The agreement, Slice and delivery gates were removed (D-058): their records stay in the event log, readable.
//
// The gate answers allow, warn or block. It ships at `warn` (P2): the agent reads a warning with the rule, the reason
// and the way through, and the event log counts each would-fire, so the user can decide from data. `block` is built and
// tested, and off until the `gates.delegation` setting turns it on.

export const GATES = ["delegation"];
export const GATE_MODES = ["off", "warn", "block"];
export const GATE_DECISIONS = ["allow", "warn", "block"];
/** gates.json's version; a driver reads only this one. Older files keep the fields this module no longer reads. */
export const GATE_STATE_VERSION = 1;
/** The gate warns until a setting says otherwise (P2). */
export const DEFAULT_GATE_SETTINGS = Object.freeze({
  delegation: "warn",
});

/** Tools that write files, on every harness: Claude Code's, Pi's and Codex's names (section 4.2). */
export const FILE_WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "edit", "write", "apply_patch"]);
/** Tools that run a shell command. */
export const SHELL_TOOLS = new Set(["Bash", "bash", "shell", "exec_command", "local_shell"]);
/** The task folder's files only the coordinator writes. */
const RECORD_FILES = ["record.md", "decisions.md", "history.md"];
const SEVERITY = { allow: 0, warn: 1, block: 2 };
const STATE_MISSING = "Freeflow cannot read its gate state; run `task here`, then go on.";

// ---------------------------------------------------------------------------------------------------------------------
// Shell commands: a small lexer that splits a command into the simple commands it runs (at &&, ||, ;, |, &, a newline,
// a parenthesis or a brace), each with its words and the files it redirects output to. It reads quotes, escapes and
// here-documents; what it cannot follow (a substitution, `bash -c`, an alias, a script) the caller counts as changing.

/**
 * The simple commands in a shell line: `{ words, writes }` each, and `dynamic` when the line holds a command
 * substitution, whose effect the words cannot show.
 * @param {string} command
 */
export function splitCommand(command) {
  const text = String(command ?? "");
  const segments = [];
  let words = [];
  let writes = [];
  let word = null;
  let target = null; // "write" or "read": the next word is a redirection's file
  let dynamic = false;
  const heredocs = [];
  const endWord = () => {
    if (word === null) return;
    if (target === "write") writes.push(word);
    else if (target !== "read") words.push(word);
    target = null;
    word = null;
  };
  const endSegment = () => {
    endWord();
    if (words.length || writes.length) segments.push({ words, writes });
    words = [];
    writes = [];
  };
  const add = (value) => {
    word = (word ?? "") + value;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\\") {
      if (next === "\n") index += 1;
      else if (next !== undefined) {
        add(next);
        index += 1;
      }
      continue;
    }
    if (char === "'") {
      const close = text.indexOf("'", index + 1);
      add(text.slice(index + 1, close === -1 ? text.length : close));
      index = close === -1 ? text.length : close;
      continue;
    }
    if (char === '"') {
      let value = "";
      let at = index + 1;
      for (; at < text.length && text[at] !== '"'; at += 1) {
        if (text[at] === "\\" && at + 1 < text.length && '"\\$`'.includes(text[at + 1])) {
          value += text[at + 1];
          at += 1;
        } else {
          if (text[at] === "`" || (text[at] === "$" && text[at + 1] === "(")) dynamic = true;
          value += text[at];
        }
      }
      add(value);
      index = at;
      continue;
    }
    if (char === "`" || (char === "$" && next === "(")) {
      dynamic = true;
      // The substitution's text stays in the word, unread: its effect is not the line's words.
      const open = char === "`" ? "`" : "(";
      const close = char === "`" ? "`" : ")";
      let depth = 0;
      let at = char === "`" ? index + 1 : index + 2;
      for (; at < text.length; at += 1) {
        if (open !== close && text[at] === open) depth += 1;
        else if (text[at] === close) {
          if (depth === 0) break;
          depth -= 1;
        }
      }
      add(text.slice(index, at + 1));
      index = at;
      continue;
    }
    if (char === " " || char === "\t") {
      endWord();
      continue;
    }
    if (char === "\n" || char === "\r") {
      endSegment();
      // A here-document's body is data, not commands: skip to the line that closes it.
      while (heredocs.length) {
        const delimiter = heredocs.shift();
        let at = index + 1;
        for (;;) {
          const end = text.indexOf("\n", at);
          const line = text.slice(at, end === -1 ? text.length : end);
          at = end === -1 ? text.length : end + 1;
          if (line.replace(/^\t+/, "") === delimiter || end === -1) break;
        }
        index = at - 1;
      }
      continue;
    }
    if (char === ";" || char === "(" || char === ")" || char === "{" || char === "}") {
      if ((char === "{" || char === "}") && word !== null) {
        add(char);
        continue;
      }
      endSegment();
      continue;
    }
    if (char === "&") {
      if (next === ">") {
        // &> and &>>: both streams to a file.
        endWord();
        index += next === ">" && text[index + 2] === ">" ? 2 : 1;
        target = "write";
        continue;
      }
      endSegment();
      if (next === "&") index += 1;
      continue;
    }
    if (char === "|") {
      endSegment();
      if (next === "|" || next === "&") index += 1;
      continue;
    }
    if (char === ">") {
      // A file descriptor's number before it (2>) is not a word.
      if (word !== null && /^\d+$/.test(word)) word = null;
      endWord();
      let at = index + 1;
      if (text[at] === ">" || text[at] === "|") at += 1;
      if (text[at] === "&") {
        // >&2, 2>&1: one stream into another, no file.
        at += 1;
        while (at < text.length && /[\d-]/.test(text[at])) at += 1;
        index = at - 1;
        continue;
      }
      index = at - 1;
      target = "write";
      continue;
    }
    if (char === "<") {
      if (word !== null && /^\d+$/.test(word)) word = null;
      endWord();
      if (next === "<" && text[index + 2] === "<") {
        index += 2;
        target = "read";
        continue;
      }
      if (next === "<") {
        index += 1;
        if (text[index + 1] === "-") index += 1;
        while (text[index + 1] === " " || text[index + 1] === "\t") index += 1;
        const rest = /^(['"]?)([^\s'";|&<>()]+)\1/.exec(text.slice(index + 1));
        if (rest) {
          heredocs.push(rest[2]);
          index += rest[0].length;
        }
        continue;
      }
      target = "read";
      continue;
    }
    add(char);
  }
  endSegment();
  return { segments, dynamic };
}

const basename = (path) => String(path).split(/[\\/]/).pop() ?? "";
const NOT_WRITTEN = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty"]);

/** A simple command's words without what runs it: variable assignments, env, sudo, command, time, nohup, exec. */
function programWords(words) {
  let rest = [...words];
  for (;;) {
    while (rest.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) rest = rest.slice(1);
    const head = rest[0];
    if (head === "env") {
      rest = rest.slice(1);
      while (rest.length && (/^-/.test(rest[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0]))) {
        if (rest[0] === "-u" || rest[0] === "--unset" || rest[0] === "-C" || rest[0] === "--chdir")
          rest = rest.slice(1);
        rest = rest.slice(1);
      }
      continue;
    }
    if (["sudo", "command", "time", "nohup", "exec", "builtin"].includes(head)) {
      rest = rest.slice(1);
      while (rest.length && /^-/.test(rest[0])) rest = rest.slice(1);
      continue;
    }
    return rest;
  }
}

/** Git's subcommand and its arguments, past `-C <path>`, `-c <name=value>` and the other options before it. */
function gitParts(args) {
  let rest = args;
  while (rest.length && rest[0].startsWith("-")) {
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(rest[0])) rest = rest.slice(2);
    else rest = rest.slice(1);
  }
  return { sub: rest[0] ?? null, args: rest.slice(1) };
}

const GIT_READS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "rev-parse",
  "fetch",
  "ls-files",
  "ls-remote",
  "rev-list",
  "merge-base",
  "cat-file",
  "describe",
  "blame",
  "grep",
  "shortlog",
]);
const LISTING = (args, flags) =>
  args.every((arg) => flags.includes(arg) || /^--(format|sort|contains|points-at)/.test(arg));

/** Whether a git subcommand only reads; the listing forms of branch, tag, remote, worktree, stash and config too. */
function gitReads(sub, args) {
  if (GIT_READS.has(sub)) return true;
  if (sub === "branch")
    return LISTING(args, ["--show-current", "--list", "-l", "-a", "--all", "-r", "--remotes", "-v", "-vv"]);
  if (sub === "tag") return isTagListing(args);
  if (sub === "remote") return args.length === 0 || ["-v", "get-url", "show"].includes(args[0]);
  if (sub === "worktree") return args[0] === "list";
  if (sub === "stash") return ["list", "show"].includes(args[0]);
  if (sub === "config") return args.some((arg) => ["--get", "--get-all", "--list", "-l", "--get-regexp"].includes(arg));
  return false;
}

function isTagListing(args) {
  return LISTING(args, ["-l", "--list", "-n"]) || args.includes("-l") || args.includes("--list");
}

/** npm, pnpm and yarn scripts that run a project's tests and checks count as reads (P5). */
const CHECK_SCRIPT = /^(test|check|lint|typecheck|verify)(:|$)|^format:check$/;

/** Track Work's commands that only read: view, validate, budget, estimate and the status and listing commands. */
function trackWorkReads(args) {
  const [command, operation] = args.filter((arg) => !arg.startsWith("--"));
  if (args.includes("--help") || ["view", "validate", "budget", "estimate"].includes(command)) return true;
  if (command === "session" || command === "store") return operation === "status";
  if (command === "events") return operation !== "append";
  if (command === "delegate")
    return (
      operation === "status" || operation === "check-return" || (operation === "log" && !args.includes("--append"))
    );
  if (command === "claim") return args.includes("--list");
  if (command === "discussion") return operation === "list";
  if (command === "task") return operation === "here" || operation === "search";
  if (command === "project") return operation === "list" || operation === "show";
  return false;
}

/**
 * Track Work's commands a worker runs that write its own files, not the record (SPEC-009 4.1): its progress.md
 * (checkpoint --delegation), joining its delegation, its claims, and the delegation log.
 */
function trackWorkWorkerOwn(args) {
  const [command, operation] = args.filter((arg) => !arg.startsWith("--"));
  if (command === "checkpoint") return args.includes("--delegation");
  if (command === "delegate") return operation === "join" || operation === "log";
  return command === "claim" || command === "release";
}

/**
 * What one simple command does, as the gate reads it: whether it may change something, and whether it runs Track
 * Work's script and what that script does (read, its worker's own files, or a write to the record).
 * @param {string[]} words
 */
function classifySegment(words) {
  const rest = programWords(words);
  const program = basename(rest[0] ?? "");
  const args = rest.slice(1);
  const result = (changing, trackWork = null) => ({ changing, trackWork, program });
  if (!program) return result(false);
  if (["bash", "sh", "zsh", "dash"].includes(program)) return result(true);
  if (program === "git") {
    const { sub, args: gitArgs } = gitParts(args);
    if (sub === "tag") return result(!isTagListing(gitArgs));
    return result(!gitReads(sub, gitArgs));
  }
  if (program === "gh") return result(true);
  if (["npm", "pnpm", "yarn"].includes(program)) {
    const [first, second] = args.filter((arg) => !arg.startsWith("-"));
    if (["test", "t"].includes(first)) return result(false);
    if (first === "run" && CHECK_SCRIPT.test(second ?? "")) return result(false);
    if (program === "yarn" && CHECK_SCRIPT.test(first ?? "")) return result(false);
    return result(true);
  }
  if (program === "node") {
    // The script is the first word that is not an option; only node's own options before it count, so `--check`
    // after the script belongs to the script. A syntax check (node --check) reads the script.
    const at = args.findIndex((arg) => !arg.startsWith("-"));
    const nodeOptions = at === -1 ? args : args.slice(0, at);
    if (nodeOptions.includes("--check") || nodeOptions.includes("-c")) return result(false);
    const script = at === -1 ? undefined : args[at];
    if (script && basename(script) === "working-record.mjs") {
      const after = args.slice(args.indexOf(script) + 1);
      return result(false, trackWorkReads(after) ? "read" : trackWorkWorkerOwn(after) ? "own" : "write");
    }
    if (args.includes("--help") || args[0] === "--test") return result(false);
    return result(true);
  }
  if (program === "find")
    return result(args.some((arg) => /^-(delete|exec|execdir|ok|okdir|fprint|fprintf|fls)$/.test(arg)));
  if (program === "sed") return result(args.some((arg) => /^(-i|--in-place)/.test(arg)));
  if (
    [
      "ls",
      "cat",
      "head",
      "tail",
      "grep",
      "rg",
      "pwd",
      "cd",
      "echo",
      "printf",
      "wc",
      "which",
      "true",
      "test",
      "[",
    ].includes(program)
  )
    return result(false);
  return result(true);
}

/**
 * A shell command as the gate reads it: whether it may change something, the files it redirects output to, and whether
 * one of its parts runs Track Work's script to write the record or a worker's own files. A line the lexer cannot follow
 * counts as changing (section 5).
 * @param {string} command
 */
export function classifyCommand(command) {
  const { segments, dynamic } = splitCommand(command);
  const parts = segments.map((segment) => ({ ...classifySegment(segment.words), writes: segment.writes }));
  const writes = parts.flatMap((part) => part.writes).filter((path) => !NOT_WRITTEN.has(path));
  return {
    changing: dynamic || writes.length > 0 || parts.some((part) => part.changing),
    writes,
    trackWorkWrites: parts.some((part) => part.trackWork === "write"),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Paths and globs, without node:path, so the module stays importable by a mod.

/** A path with `/` separators, no `.` or `..` names and no trailing separator. */
export function normalPath(path) {
  const text = String(path ?? "").replace(/\\/g, "/");
  const absolute = text.startsWith("/");
  const names = [];
  for (const name of text.split("/")) {
    if (name === "" || name === ".") continue;
    if (name === "..") names.pop();
    else names.push(name);
  }
  const joined = names.join("/");
  return absolute ? `/${joined}` : joined;
}

/** `path` resolved against `base` when it is relative. */
export function resolvePath(base, path) {
  const text = String(path ?? "").replace(/\\/g, "/");
  if (text.startsWith("/") || /^[A-Za-z]:\//.test(text) || !base) return normalPath(text);
  return normalPath(`${base}/${text}`);
}

/** Whether `path` is `root` or inside it. */
export function inside(path, root) {
  if (!path || !root) return false;
  const [p, r] = [normalPath(path), normalPath(root)];
  return p === r || p.startsWith(r === "/" ? "/" : `${r}/`);
}

/** Whether `path` matches a scope glob: `**` any names, `*` and `?` within one; a glob with no wildcard is a folder or file. */
export function matchesGlob(path, glob) {
  const target = normalPath(path);
  const pattern = normalPath(glob);
  if (!/[*?]/.test(pattern)) return inside(target, pattern);
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      // a/** matches a itself and everything below it; **/ matches any folders, none included.
      if (pattern[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        if (source.endsWith("/")) source = `${source.slice(0, -1)}(?:/.*)?`;
        else source += ".*";
        index += 1;
      }
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`).test(target);
}

// ---------------------------------------------------------------------------------------------------------------------
// The decision.

/** A setting's value as the gates read it: off, warn or block; anything else is the default. */
export function gateSettings(settings = {}) {
  return Object.fromEntries(
    GATES.map((gate) => [gate, GATE_MODES.includes(settings?.[gate]) ? settings[gate] : DEFAULT_GATE_SETTINGS[gate]]),
  );
}

/** Whether `state` is a gates.json this module reads. */
export function validGateState(state) {
  return typeof state === "object" && state !== null && state.v === GATE_STATE_VERSION;
}

const ALLOW = Object.freeze({ gate: null, decision: "allow", reason: "", way: "", rule: null, fired: [] });

function shown(path, cwd) {
  const full = normalPath(path);
  const base = cwd ? normalPath(cwd) : null;
  return base && full.startsWith(`${base}/`) ? full.slice(base.length + 1) : full;
}

/**
 * A worker's scope as the warning names it: the brief's May write line, else its worktree (the brief names no May write,
 * so the worktree is what it may write), else nothing, a reader.
 */
function scopeOf(scope) {
  if (!scope.writes?.length) return "no May write, no worktree: a reader";
  return scope.line
    ? `May write: ${scope.writes.join(", ")}`
    : `no May write line; its worktree is its scope: ${scope.writes.join(", ")}`;
}

/** What the call touches, in a few words, for the warning's first line. */
function callText(call, paths) {
  if (paths.length) return `${call.tool} on ${paths.map((path) => shown(path, call.cwd)).join(", ")}`;
  const command = String(call.command ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return `${call.tool} \`${command.length > 60 ? `${command.slice(0, 59)}…` : command}\``;
}

/** The decision the gate's mode gives a call it fires on: warn, or block where the setting says block. */
const verdict = (mode) => (mode === "warn" ? "warn" : "block");

/**
 * Decides one tool call against the gate: the strongest decision of the gate's rules that fire, with each that fired in
 * `fired`, for the driver to warn or refuse once and to log each one. Pure and synchronous (section 4.2).
 *
 * `state` is gates.json as the driver read it, or null when it is missing or unreadable (section 5: quiet under warn,
 * closed under block). `call` is `{ tool, paths?, command?, cwd?, readOnly?, delegation?, now? }`: paths absolute;
 * `readOnly` where the tool says its input only reads; `delegation` the D-NNN of the worker making the call, absent on
 * the main loop (a worker session's state names its own, `worker`); `now` the time other sessions' claims are read at
 * (default the clock's). `settings` maps the gate to off, warn or block.
 * @returns {{ gate: string | null, decision: "allow" | "warn" | "block", reason: string, way: string, rule: string | null, fired: { gate: string, decision: string, reason: string, way: string, rule: string }[] }}
 */
export function decide(state, call, settings = DEFAULT_GATE_SETTINGS) {
  const modes = gateSettings(settings);
  const tool = String(call?.tool ?? "");
  const isFile = FILE_WRITE_TOOLS.has(tool);
  const isShell = SHELL_TOOLS.has(tool);
  if (!isFile && !isShell) return ALLOW;
  const readable = state === null || state === undefined ? null : validGateState(state) ? state : null;
  const shell = isShell ? classifyCommand(call.command ?? "") : null;
  const paths = isFile
    ? (call.paths ?? []).filter((path) => typeof path === "string" && path).map((path) => resolvePath(call.cwd, path))
    : (shell?.writes ?? []).map((path) => resolvePath(call.cwd, path));
  const changing = call.readOnly === true ? false : isFile || Boolean(shell?.changing);
  const fired = [];
  const fire = (gate, rule, what, why, way) => {
    const mode = modes[gate];
    if (mode === "off") return;
    fired.push({ gate, decision: verdict(mode), reason: `${what}\nWhy: ${why}`, way, rule });
  };
  const missing = (gate, rule) => {
    if (modes[gate] === "block")
      fired.push({ gate, decision: "block", reason: STATE_MISSING, way: STATE_MISSING, rule: `${rule}, no state` });
  };
  const what = callText(call, paths);
  // A subagent worker names its delegation; a worker session's state names the one it joined (SPEC-009 4.1).
  const worker =
    typeof call.delegation === "string" && call.delegation
      ? call.delegation
      : typeof readable?.worker === "string" && readable.worker
        ? readable.worker
        : null;

  if (worker && (changing || shell?.trackWorkWrites)) {
    const scope = readable?.delegations?.[worker];
    if (!readable) missing("delegation", "worker scope");
    else if (scope) {
      const taskDir = readable.taskDir ?? null;
      const recordFiles = taskDir ? RECORD_FILES.map((name) => resolvePath(taskDir, name)) : [];
      const recordFile = paths.find((path) => recordFiles.includes(normalPath(path)));
      // A shell command that changes something and names a record file, or runs a Track Work command that writes.
      const namesRecord =
        isShell && shell.changing && recordFiles.some((path) => String(call.command ?? "").includes(path));
      const writesRecord = Boolean(recordFile) || Boolean(shell?.trackWorkWrites) || namesRecord;
      const allowed = [...(scope.writes ?? []), ...(scope.folder ? [scope.folder] : [])];
      const outside = paths.filter((path) => !allowed.some((glob) => matchesGlob(path, glob)));
      if (writesRecord)
        fire(
          "delegation",
          "a worker on the record",
          `${what} by ${worker}, on the task's ${recordFile ? basename(recordFile) : "record"}.`,
          "the coordinator alone writes the task's record.md, decisions.md and history.md; a worker reports in its progress.md and return.md.",
          "leave the record to the coordinator: write what it needs in return.md, then go on.",
        );
      else if (outside.length)
        fire(
          "delegation",
          "outside the worker's scope",
          `${what} by ${worker}, outside its scope (${scopeOf(scope)}).`,
          "a worker writes only what its brief's Scope allows, so workers never write the same file.",
          "keep to the brief's May write; if the work needs more, say so in return.md and return.",
        );
    }
  }

  // Another session's claim on a path this call writes (SPEC-009 4.5): the first one found, warned once.
  if (changing && readable && Array.isArray(readable.claims) && paths.length) {
    const now = typeof call.now === "number" ? call.now : Date.now();
    for (const claim of readable.claims) {
      if (!(Date.parse(claim?.until) > now) || !Array.isArray(claim.writes)) continue;
      const hit = paths.find((path) => claim.writes.some((glob) => matchesGlob(path, glob)));
      if (!hit) continue;
      fire(
        "delegation",
        "claimed by another session",
        `${shown(hit, call.cwd)} is claimed by ${claim.task}${claim.delegation ? ` ${claim.delegation}` : ""} (session ${String(claim.session).slice(0, 8)}…, until ${String(claim.until).slice(11, 16)} UTC).`,
        "two sessions changing the same files conflict when their work merges.",
        "ask that session through the harness's message tool, or pick other work.",
      );
      break;
    }
  }

  if (!fired.length) return ALLOW;
  const top = fired.reduce((best, each) => (SEVERITY[each.decision] > SEVERITY[best.decision] ? each : best));
  return { gate: top.gate, decision: top.decision, reason: top.reason, way: top.way, rule: top.rule, fired };
}

/**
 * The text the agent reads for one gate that fired (section 3): the rule, why, and the way through; under warn it says
 * the gate only warns.
 * @param {{ gate: string, decision: string, reason: string, way: string }} fired
 */
export function gateText(fired) {
  const label = fired.decision === "warn" ? "warn" : "block";
  const tail = fired.decision === "warn" ? " This gate only warns for now." : "";
  if (fired.reason === STATE_MISSING) return `Freeflow gate (${label}, ${fired.gate}): ${STATE_MISSING}`;
  const [first, ...rest] = fired.reason.split("\n");
  return [`Freeflow gate (${label}, ${fired.gate}): ${first}`, ...rest, `Way through: ${fired.way}${tail}`].join("\n");
}

/** The event line's fields for one gate that fired (T3): `{ gate, decision, tool, rule }`. */
export function gateEvent(fired, tool) {
  return { gate: fired.gate, decision: fired.decision, tool: String(tool), rule: fired.rule };
}
