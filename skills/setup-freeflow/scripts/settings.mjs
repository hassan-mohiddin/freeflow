#!/usr/bin/env node

// Freeflow's settings, the same on every host: list, get, set and unset any key in the settings table, in the
// repository's .freeflow/config.json, the personal .freeflow/local.json, or the running session's own file in the
// Freeflow home. Pi's /freeflow settings screen writes through the same code; on Claude Code the mod's /freeflow settings
// command runs this script. After a change it prints the Runtime State lines that changed, so whoever ran it knows now.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  SETTINGS,
  SWITCHABLE_SKILLS,
  reviewStateLine,
  settingSpec,
  skillsStateLine,
  validSettingValue,
} from "../../../pi-extension/dist/host/config-validation.js";
import {
  CONFIG_FILES,
  freeflowHome,
  readConfigFile,
  readSessionSettings,
  resolveSetting,
  sessionId,
  writeConfigValue,
  writeSessionValue,
} from "../../../pi-extension/dist/host/config-store.js";

const SCOPES = ["repository", "personal", "session"];
const SCOPE_NAMES = { repository: "Repository", personal: "Personal", session: "Session", default: "default" };

const USAGE = `Usage:
  settings.mjs list [--host all|pi] [--root <folder>] [--json]
  settings.mjs get <key> [--root <folder>] [--json]
  settings.mjs set <key> <value> --scope repository|personal|session [--root <folder>] [--json]
  settings.mjs unset <key> --scope repository|personal|session [--root <folder>] [--json]
--root names a folder in the repository (default: the current folder); the settings are its repository's.
The value "inherit" unsets the key in that scope. --host all (the default) lists the settings every host acts on;
--host pi lists Pi's too. The Session scope needs a host that names its session (CLAUDE_CODE_SESSION_ID or
FREEFLOW_SESSION).`;

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
    if (arg === "--json" || arg === "--help" || arg === "-h") options[arg] = true;
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
    error: repository.error
      ? `${CONFIG_FILES.repository} is invalid: ${repository.error}`
      : personal.error
        ? `${CONFIG_FILES.personal} is invalid: ${personal.error}`
        : null,
  };
}

function resolveAll(state) {
  const values = { repository: state.repository.value, personal: state.personal.value, session: state.session };
  return SETTINGS.map((spec) => resolveSetting(spec, values));
}

/** The Runtime State lines the resolved settings give: the review line and the off-skills line, when set. */
function stateLines(resolved) {
  const value = (key) => resolved.find((item) => item.spec.key === key)?.value;
  const model = value("review.model");
  const review = reviewStateLine({ mode: value("review.mode"), ...(model == null ? {} : { model }) });
  const off =
    value("skills.enabled") === false
      ? [...SWITCHABLE_SKILLS]
      : SWITCHABLE_SKILLS.filter((skill) => value(`skills.${skill}`) === false);
  return [review, skillsStateLine(off)].filter(Boolean);
}

const shown = (value) => (value === null ? "none" : value === true ? "on" : value === false ? "off" : String(value));

function row(item) {
  return { key: item.spec.key, label: item.spec.label, value: item.value, scope: item.scope, hosts: item.spec.hosts };
}

function list(state, root, host, json) {
  const resolved = resolveAll(state);
  const rows = resolved.filter((item) => host === "pi" || item.spec.hosts === "all");
  if (json) return `${JSON.stringify({ root, settings: rows.map(row), state: stateLines(resolved) }, null, 2)}\n`;
  const width = Math.max(...rows.map((item) => item.spec.key.length));
  const lines = rows.map(
    (item) => `  ${item.spec.key.padEnd(width)}  ${shown(item.value).padEnd(8)}  ${SCOPE_NAMES[item.scope]}`,
  );
  const piOnly = SETTINGS.filter((spec) => spec.hosts === "pi").length;
  return [
    ...lines,
    "Set one: settings.mjs set <key> <value> --scope repository|personal|session; inherit unsets it.",
    ...(host === "pi" ? [] : [`${piOnly} Pi-only settings are not listed (--host pi lists them).`]),
    "",
  ].join("\n");
}

/** A typed value as the setting takes it: on/off and true/false for a switch, the word itself otherwise. */
function parseValue(spec, text) {
  if (spec.values === "profile")
    throw new UsageError(`${spec.key} is a routing profile: set it on Pi's /freeflow settings screen`);
  let value = text;
  if (spec.values === "boolean") {
    if (["on", "true"].includes(text)) value = true;
    else if (["off", "false"].includes(text)) value = false;
  }
  if (!validSettingValue(spec, value)) {
    const takes =
      spec.values === "boolean" ? "on or off" : spec.values === "name" ? "a name on one line" : spec.values.join(", ");
    throw new UsageError(`${spec.key} takes ${takes}, not ${text}`);
  }
  return value;
}

function requireSpec(key) {
  const spec = key && settingSpec(key);
  if (!spec) throw new UsageError(`unknown setting ${key ?? "(none)"}; settings.mjs list names them`);
  return spec;
}

/** What else the person should know after a change, beyond the lines. */
function notes(spec) {
  if (spec.hosts === "pi") return ["Only Pi acts on this setting."];
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
  if (state.error) throw new Error(`${state.error}; fix it before changing a setting`);
  const before = stateLines(resolveAll(state));
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
  const lines = stateLines(resolved);
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

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { options, words } = parse(argv);
  const [command, key, value] = words;
  if (options["--help"] || options["-h"] || !command) return { out: `${USAGE}\n`, code: command ? 0 : 1 };
  const root = workspaceRoot(options["--root"] ?? process.cwd());
  const state = layers(root, env);
  const json = Boolean(options["--json"]);
  if (command === "list") {
    const host = options["--host"] ?? "all";
    if (!["all", "pi"].includes(host)) throw new UsageError("--host must be all or pi");
    if (state.error) throw new Error(state.error);
    return { out: list(state, root, host, json), code: 0 };
  }
  if (command === "get") {
    const spec = requireSpec(key);
    if (state.error) throw new Error(state.error);
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
