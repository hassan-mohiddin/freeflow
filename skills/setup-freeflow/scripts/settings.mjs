#!/usr/bin/env node

// Freeflow's settings, the same on every host: list, get, set and unset any key in the settings table, in the
// repository's .freeflow/config.json, the personal .freeflow/local.json, or the running session's own file in the
// Freeflow home. Pi's /freeflow settings screen writes through the same code; on Claude Code the mod's /freeflow settings
// command runs this script. After a change it prints the Runtime State lines that changed, so whoever ran it knows now.
// A key a file ignores (unknown, removed, or wrong for a known key) keeps its default and is named; `doctor` shows the fix
// for each and writes it with --fix.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  SETTINGS,
  SWITCHABLE_SKILLS,
  ignoredStateLine,
  sanitizeConfigFile,
  settingSpec,
  skillsStateLine,
  validSettingValue,
} from "../../../pi-extension/dist/host/config-validation.js";
import {
  CONFIG_FILES,
  deletePath,
  ensureLocalConfigIgnored,
  freeflowHome,
  getPath,
  readConfigFile,
  readSessionSettings,
  resolveSetting,
  sessionId,
  sessionSettingsPath,
  writeConfigValue,
  writeSessionValue,
} from "../../../pi-extension/dist/host/config-store.js";

const SCOPES = ["repository", "personal", "session"];
const SCOPE_NAMES = { repository: "Repository", personal: "Personal", session: "Session", default: "default" };

const USAGE = `Usage:
  settings.mjs list [--host all|pi|claude-code] [--root <folder>] [--json]
  settings.mjs get <key> [--root <folder>] [--json]
  settings.mjs set <key> <value> --scope repository|personal|session [--root <folder>] [--json]
  settings.mjs unset <key> --scope repository|personal|session [--root <folder>] [--json]
  settings.mjs doctor [--fix] [--scope repository|personal|session] [--root <folder>]
--root names a folder in the repository (default: the current folder); the settings are its repository's.
The value "inherit" unsets the key in that scope. --host all (the default) lists the settings every host acts on and
Claude Code's own (its cost governor, pane and status line), as does --host claude-code; --host pi lists Pi's instead of Claude Code's. The Session scope needs a host that names its session (CLAUDE_CODE_SESSION_ID or
FREEFLOW_SESSION).
doctor reads each scope against the settings table and prints each problem with its fix, changing nothing (exit 1 when
there is a problem). --fix writes the Personal and Session scopes; the Repository file is shared, so it is written only
with --scope repository.`;

class UsageError extends Error {}

/** The repository a folder is in, as the session-start hook finds it: the nearest folder up with .git, else itself. */
function workspaceRoot(folder) {
  for (let current = resolve(folder); ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) return current;
    if (dirname(current) === current) return resolve(folder);
  }
}

function parse(argv) {
  const options = {};
  const words = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (["--json", "--fix", "--help", "-h"].includes(arg)) options[arg] = true;
    else if (["--scope", "--root", "--host"].includes(arg)) {
      if (argv[index + 1] === undefined) throw new UsageError(`${arg} needs a value`);
      options[arg] = argv[++index];
    } else if (arg.startsWith("--")) throw new UsageError(`unknown option ${arg}`);
    else words.push(arg);
  }
  return { options, words };
}

function layers(root, env) {
  const repository = readConfigFile(root, "repository");
  const personal = readConfigFile(root, "personal");
  const id = sessionId(env);
  return {
    repository,
    personal,
    id,
    session: readSessionSettings(freeflowHome(env), id),
    // The settings each file ignores, named with their file (D-045); every command shows them.
    ignored: [
      ...repository.ignored.map((item) => ({ ...item, file: CONFIG_FILES.repository })),
      ...personal.ignored.map((item) => ({ ...item, file: CONFIG_FILES.personal })),
    ],
  };
}

function resolveAll(state) {
  const values = { repository: state.repository.value, personal: state.personal.value, session: state.session };
  return SETTINGS.map((spec) => resolveSetting(spec, values));
}

/** The Runtime State lines the resolved settings give: the off-skills line and the ignored settings. */
function stateLines(resolved, ignored) {
  const value = (key) => resolved.find((item) => item.spec.key === key)?.value;
  const off =
    value("skills.enabled") === false
      ? [...SWITCHABLE_SKILLS]
      : SWITCHABLE_SKILLS.filter((skill) => value(`skills.${skill}`) === false);
  return [skillsStateLine(off), ignoredStateLine(ignored)].filter(Boolean);
}

const shown = (value) => (value === null ? "none" : value === true ? "on" : value === false ? "off" : String(value));

function row(item) {
  return { key: item.spec.key, label: item.spec.label, value: item.value, scope: item.scope, hosts: item.spec.hosts };
}

function list(state, root, host, json) {
  const resolved = resolveAll(state);
  const rows = resolved.filter((item) =>
    host === "pi" ? item.spec.hosts !== "claude-code" : item.spec.hosts !== "pi",
  );
  const runtimeLines = stateLines(resolved, state.ignored);
  if (json)
    return `${JSON.stringify({ root, settings: rows.map(row), state: runtimeLines, ignored: state.ignored }, null, 2)}\n`;
  const width = Math.max(...rows.map((item) => item.spec.key.length));
  const lines = rows.map(
    (item) => `  ${item.spec.key.padEnd(width)}  ${shown(item.value).padEnd(8)}  ${SCOPE_NAMES[item.scope]}`,
  );
  const piOnly = SETTINGS.filter((spec) => spec.hosts === "pi").length;
  return [
    ...lines,
    ...(ignoredStateLine(state.ignored) ? ["", ignoredStateLine(state.ignored)] : []),
    "Set one: settings.mjs set <key> <value> --scope repository|personal|session; inherit unsets it.",
    ...(host === "pi" ? [] : [`${piOnly} Pi-only settings are not listed (--host pi lists them).`]),
    "",
  ].join("\n");
}

/** A typed value as the setting takes it: on/off and true/false for a switch, a number for a number, the word itself otherwise. */
function parseValue(spec, text) {
  let value = text;
  if (spec.values === "boolean") {
    if (["on", "true"].includes(text)) value = true;
    else if (["off", "false"].includes(text)) value = false;
  }
  if (spec.values === "number" && /^\d+(\.\d+)?$/.test(text)) value = Number(text);
  if (!validSettingValue(spec, value)) throw new UsageError(`${spec.key} takes ${takes(spec)}, not ${text}`);
  return value;
}

function takes(spec) {
  return spec.values === "boolean"
    ? "on or off"
    : spec.values === "number"
      ? "a number above 0"
      : spec.values.join(", ");
}

function requireSpec(key) {
  const spec = key && settingSpec(key);
  if (!spec) throw new UsageError(`unknown setting ${key ?? "(none)"}; settings.mjs list names them`);
  return spec;
}

/** What else the person should know after a change, beyond the lines. */
function notes(spec) {
  if (spec.hosts === "pi") return ["Only Pi acts on this setting."];
  if (spec.hosts === "claude-code") return ["Only Claude Code's mod acts on this setting."];
  if (spec.key.startsWith("prompts."))
    return ["Prompt text already given in this session stays until the next session start or compaction."];
  return [];
}

async function change(state, root, env, key, text, scopeName, json) {
  const spec = requireSpec(key);
  if (!SCOPES.includes(scopeName)) throw new UsageError("--scope must be repository, personal or session");
  if (scopeName === "session" && !spec.session)
    throw new UsageError(`${spec.key} has no Session scope here; set it on Pi's screen`);
  const value = text === undefined || text === "inherit" ? undefined : parseValue(spec, text);
  const before = stateLines(resolveAll(state), state.ignored);
  if (scopeName === "session") {
    if (!state.id)
      throw new UsageError(
        "the Session scope needs a host that names its session (CLAUDE_CODE_SESSION_ID or FREEFLOW_SESSION)",
      );
    await writeSessionValue(freeflowHome(env), state.id, spec.key, value);
  } else await writeConfigValue(root, scopeName, spec.key.split("."), value);
  const after = layers(root, env);
  const resolved = resolveAll(after);
  const now = resolved.find((item) => item.spec.key === spec.key);
  const lines = stateLines(resolved, after.ignored);
  const changed = lines.filter((line) => !before.includes(line));
  const cleared = before.filter((line) => !lines.includes(line));
  const where =
    now.scope === "default"
      ? "the default"
      : `${SCOPE_NAMES[now.scope]}${now.scope === "session" ? "" : `, ${CONFIG_FILES[now.scope]}`}`;
  if (json) return `${JSON.stringify({ ...row(now), state: lines, changed, cleared, notes: notes(spec) }, null, 2)}\n`;
  return [
    `${spec.key}: ${shown(now.value)} (${where})`,
    ...changed.map((line) => `Runtime State: ${line}`),
    ...cleared.map((line) => `Runtime State no longer: ${line}`),
    ...notes(spec),
    "",
  ].join("\n");
}

// ---- doctor ----

/** A JSON value as the diff shows it, on one line. */
const json1 = (value) => (value === undefined ? "none" : JSON.stringify(value));

/**
 * The fix for one ignored setting of a file: its removal, which leaves the default (or the value of the other scope)
 * in force. A file that is not JSON has no automatic fix.
 */
function planFix(raw, item) {
  if (item.key === null) return { ...item, fix: null };
  const path = item.key.split(".");
  return { ...item, fix: { kind: "remove", path, old: getPath(raw, path) } };
}

/** A file scope's problems, from its parsed JSON, with a fix for each. */
function fileProblems(raw, scope) {
  return sanitizeConfigFile(raw, scope).ignored.map((item) => planFix(raw, item));
}

/** The Session scope's problems: a key the table does not know, one not held per session, or a wrong value. */
function sessionProblems(raw) {
  return Object.entries(raw).flatMap(([key, value]) => {
    const spec = settingSpec(key);
    const problem = !spec
      ? "unknown setting"
      : !spec.session
        ? "not a Session setting"
        : !validSettingValue(spec, value)
          ? `takes ${takes(spec)}`
          : null;
    return problem ? [{ key, reason: problem, fix: { kind: "remove", path: [key], old: value } }] : [];
  });
}

/** The raw JSON with each fix applied, and the problems the fixed file still has (none for a fixable file). */
function applyFixes(raw, problems, scope) {
  const next = structuredClone(raw);
  for (const problem of problems) {
    if (scope !== "session") deletePath(next, problem.fix.path);
    else delete next[problem.key];
  }
  return next;
}

/** One problem as the diff shows it: its reason, then what is removed. */
function describe(problem) {
  return [
    `  ${problem.key ?? "(whole file)"}: ${problem.reason}`,
    `    - ${problem.key}: ${json1(problem.fix.old)}`,
    "    + (removed: the default applies)",
  ];
}

function readRawFile(path) {
  if (!existsSync(path)) return { exists: false };
  try {
    return { exists: true, raw: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { exists: true, error: error instanceof Error ? error.message : String(error) };
  }
}

async function doctor(root, env, options) {
  const scopeOption = options["--scope"];
  if (scopeOption !== undefined && !SCOPES.includes(scopeOption))
    throw new UsageError("--scope must be repository, personal or session");
  const fix = Boolean(options["--fix"]);
  const home = freeflowHome(env);
  const id = sessionId(env);
  const out = [];
  let found = 0;
  let remaining = 0;
  for (const scope of scopeOption ? [scopeOption] : SCOPES) {
    if (scope === "session" && !id) {
      out.push("Session: not checked (no session is named: CLAUDE_CODE_SESSION_ID or FREEFLOW_SESSION).");
      continue;
    }
    const path = scope === "session" ? sessionSettingsPath(home, id) : join(root, CONFIG_FILES[scope]);
    const label = scope === "session" ? `Session (${path})` : `${CONFIG_FILES[scope]} (${SCOPE_NAMES[scope]})`;
    const file = readRawFile(path);
    if (!file.exists) {
      out.push(`${label}: no file; nothing to fix.`);
      continue;
    }
    if (file.error !== undefined) {
      out.push(`${label}: not JSON (${file.error}); not rewritten: fix it by hand.`);
      found += 1;
      remaining += 1;
      continue;
    }
    if (typeof file.raw !== "object" || file.raw === null || Array.isArray(file.raw)) {
      out.push(`${label}: must hold a JSON object; not rewritten: fix it by hand.`);
      found += 1;
      remaining += 1;
      continue;
    }
    const problems = scope === "session" ? sessionProblems(file.raw) : fileProblems(file.raw, scope);
    if (problems.length === 0) {
      out.push(`${label}: no problems.`);
      continue;
    }
    found += problems.length;
    out.push(`${label}: ${problems.length} problem${problems.length === 1 ? "" : "s"}.`, ...problems.flatMap(describe));
    if (!fix) {
      remaining += problems.length;
      continue;
    }
    if (scope === "repository" && scopeOption !== "repository") {
      out.push(
        "  not written: the repository file is shared; run settings.mjs doctor --fix --scope repository to write it.",
      );
      remaining += problems.length;
      continue;
    }
    const next = applyFixes(file.raw, problems, scope);
    const stillIgnored = scope === "session" ? sessionProblems(next) : fileProblems(next, scope);
    if (stillIgnored.length > 0) {
      out.push(...stillIgnored.flatMap((item) => ["  not fixed:", ...describe(item)]));
      remaining += stillIgnored.length;
      continue;
    }
    await writeDoctorFix(scope, path, next, root);
    out.push(`  fixed: ${problems.length} written to ${label}.`);
  }
  if (found === 0) return { out: `${out.join("\n")}\nNothing to fix.\n`, code: 0 };
  if (!fix) {
    return {
      out: `${out.join("\n")}\nRun settings.mjs doctor --fix to write these fixes (Repository: with --scope repository).\n`,
      code: 1,
    };
  }
  return { out: `${out.join("\n")}\n`, code: remaining === 0 ? 0 : 1 };
}

async function writeDoctorFix(scope, path, next, root) {
  if (scope === "session") {
    if (Object.keys(next).length === 0) await rm(path, { force: true });
    else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    }
    return;
  }
  if (scope === "personal") {
    await ensureLocalConfigIgnored(root);
    if (Object.keys(next).length === 0) {
      await rm(path, { force: true });
      return;
    }
  }
  await mkdir(join(root, ".freeflow"), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { options, words } = parse(argv);
  const [command, key, value] = words;
  if (options["--help"] || options["-h"] || !command) return { out: `${USAGE}\n`, code: command ? 0 : 1 };
  const root = workspaceRoot(options["--root"] ?? process.cwd());
  const state = layers(root, env);
  const json = Boolean(options["--json"]);
  if (command === "list") {
    const host = options["--host"] ?? "all";
    if (!["all", "pi", "claude-code"].includes(host)) throw new UsageError("--host must be all, pi or claude-code");
    return { out: list(state, root, host, json), code: 0 };
  }
  if (command === "get") {
    const spec = requireSpec(key);
    const item = resolveAll(state).find((each) => each.spec.key === spec.key);
    return {
      out: json
        ? `${JSON.stringify(row(item), null, 2)}\n`
        : `${spec.key}: ${shown(item.value)} (${SCOPE_NAMES[item.scope]})\n`,
      code: 0,
    };
  }
  if (command === "set" || command === "unset") {
    if (command === "set" && value === undefined) throw new UsageError("set needs a key and a value");
    const scope = options["--scope"];
    if (!scope) throw new UsageError(`${command} needs --scope repository, personal or session`);
    return { out: await change(state, root, env, key, command === "set" ? value : undefined, scope, json), code: 0 };
  }
  if (command === "doctor") return doctor(root, env, options);
  throw new UsageError(`unknown command ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    ({ out, code }) => {
      process.stdout.write(out);
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error.message}\n${error instanceof UsageError ? `${USAGE}\n` : ""}`);
      process.exitCode = 1;
    },
  );
}
