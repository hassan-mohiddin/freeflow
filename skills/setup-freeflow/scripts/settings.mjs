#!/usr/bin/env node

// Freeflow's settings, the same on every host: list (two views), get, set and unset any key in the settings table, in
// one of three scopes: everywhere (the home's settings.json, the default for a change), this folder (the home's
// folders.json, keyed by repository) or this session (the session's own file in the home). A setting can also be ticked
// "only on this harness" (`--harness-only`), which wins within its scope. Settings live in the Freeflow home, never in
// the repository (D-060). Pi's /freeflow settings screen writes through the same code; on Claude Code the mod's
// /freeflow settings command runs this script. After a change it prints the Runtime State lines that changed.
// A key a layer ignores (unknown, removed, wrong for a known key, or moved out of a repository file) keeps its default
// and is named; `doctor` shows the fix for each and writes it with --fix.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  HARNESSES,
  SETTINGS,
  SWITCHABLE_SKILLS,
  harnessNamed,
  ignoredStateLine,
  removedSettingReason,
  sanitizeConfigFile,
  settingSpec,
  settingsForHarness,
  skillsStateLine,
  validSettingValue,
} from "../../../pi-extension/dist/host/config-validation.js";
import {
  HOME_FILES,
  LEGACY_FILES,
  folderKey,
  freeflowHome,
  getPath,
  deletePath,
  layerPath,
  readConfigFile,
  readSessionSettings,
  resolveSetting,
  sessionId,
  sessionSettingsPath,
  setPath,
  writeConfigValue,
  writeLayer,
  writeSessionValue,
} from "../../../pi-extension/dist/host/config-store.js";
import { reviewAt } from "../../review-work/scripts/lib/review-rules.mjs";
import { projectsOfFolder } from "../../track-work/scripts/lib/projects5.mjs";

// The scopes as a person names them, and the layer names the code keeps (`repository` is the everywhere file).
const SCOPES = ["everywhere", "folder", "session"];
const LAYER = { everywhere: "repository", folder: "personal", session: "session" };
const SCOPE_NAMES = { everywhere: "Everywhere", folder: "This folder", session: "This session", default: "default" };
const SCOPE_OF_LAYER = { repository: "everywhere", personal: "folder", session: "session", default: "default" };

/** The keys the normal view shows; the rest of the table is Developer settings (D-060). */
const NORMAL_KEYS = ["enabled", "memory.mode", "pane.statusLine", "pane.enabled"];
/** The normal view's rows in order (D-060): the read-only rows sit where the settled design puts them. */
const NORMAL_ORDER = ["enabled", "memory.mode", "review", "workers", "pane.statusLine", "pane.enabled"];
/** The read-only rows: what a user cannot change here, and where it comes from. */
const READ_ONLY_ROWS = ["review", "workers"];
const WORKERS_TEXT = "Haiku by default · Opus when the agreement names it";
/** The harness's own command that stops its plugin: Freeflow never disables its own plugin (D-060, Setting 1). */
// The harness's own command to stop its plugin. Claude Code's is checked against `claude plugin disable --help`; Codex's
// is not installed here, so its line points to the install guide's step, marked unverified there (N5).
const PLUGIN_OFF = {
  "claude-code": "claude plugin disable freeflow",
  codex: "codex plugin remove freeflow@freeflow (unverified: see the uninstall step in plugin-docs/getting-started.md)",
};
/** Task memory's value as a person reads it. */
const MEMORY_TEXT = { local: "On, this machine", sync: "On, with sync", off: "Off" };

const USAGE = `Usage:
  settings.mjs list [--view normal|developer] [--host all|claude-code|codex|pi] [--harness <name>] [--root <folder>] [--json]
  settings.mjs get <key> [--harness <name>] [--root <folder>] [--json]
  settings.mjs set <key> <value> [--scope everywhere|folder|session] [--harness-only] [--harness <name>] [--root <folder>] [--json]
  settings.mjs unset <key> [--scope everywhere|folder|session] [--harness-only] [--harness <name>] [--root <folder>] [--json]
  settings.mjs doctor [--fix] [--committed] [--root <folder>]
--root names a folder in the repository (default: the current folder); the folder's settings are kept by its repository.
Scope: everywhere (the default for a change: every folder on this machine), folder (this repository only), session (this
session only). --harness-only ticks the setting for one harness (--harness, or FREEFLOW_HARNESS, or Claude Code's session):
the harness value wins within its scope. The value "inherit" removes the setting in that scope. The session scope needs
a host that names its session (CLAUDE_CODE_SESSION_ID or FREEFLOW_SESSION). list defaults to the developer view, the whole
table; --view normal shows the rows a person changes. doctor reads each layer against the table and prints each problem
with its fix, changing nothing (exit 1 when there is a problem). --fix writes the home's layers and moves a repository's
.freeflow/config.json and .freeflow/local.json into this folder's settings; the committed file is rewritten only with
--committed, since it is shared.`;

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
    if (["--json", "--fix", "--committed", "--harness-only", "--help", "-h"].includes(arg)) options[arg] = true;
    else if (["--scope", "--root", "--host", "--view", "--harness"].includes(arg)) {
      if (argv[index + 1] === undefined) throw new UsageError(`${arg} needs a value`);
      options[arg] = argv[++index];
    } else if (arg.startsWith("--")) throw new UsageError(`unknown option ${arg}`);
    else words.push(arg);
  }
  return { options, words };
}

/** The harness this script runs for: --harness, else FREEFLOW_HARNESS, else Claude Code when its session is named; or null. */
function harnessOf(options, env) {
  const named =
    harnessNamed(options["--harness"] ?? env.FREEFLOW_HARNESS) ??
    (env.CLAUDE_CODE_SESSION_ID ? "claude-code" : undefined);
  if (named === undefined || named === "") return null;
  if (!HARNESSES.includes(named)) throw new UsageError(`--harness must be ${HARNESSES.join(", ")}`);
  return named;
}

/** The three layers as the script reads them: the two home layers, the session's values, and what each file ignores. */
function layers(root, env) {
  const home = freeflowHome(env);
  const repository = readConfigFile(root, "repository", home);
  const personal = readConfigFile(root, "personal", home);
  const id = sessionId(env);
  return {
    home,
    repository,
    personal,
    id,
    session: readSessionSettings(home, id),
    // The settings each layer ignores, named with its file; the repository's own files are named until doctor moves them.
    ignored: [
      ...repository.ignored.map((item) => ({ ...item, file: HOME_FILES.repository })),
      ...personal.ignored.map((item) => ({ ...item, file: HOME_FILES.personal })),
      ...legacyIgnored(root),
    ],
  };
}

/** The repository's own config files, which no layer reads (D-060): each is named until doctor moves its settings. */
function legacyIgnored(root) {
  return ["repository", "personal"]
    .filter((scope) => existsSync(join(root, LEGACY_FILES[scope])))
    .map((scope) => ({
      key: null,
      reason: `moved to This folder: run settings.mjs doctor --fix to move it`,
      file: LEGACY_FILES[scope],
    }));
}

function resolveAll(state, harness) {
  const values = { repository: state.repository.value, personal: state.personal.value, session: state.session };
  return SETTINGS.map((spec) => resolveSetting(spec, values, harness, state.home));
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

/** A setting's value as the normal view shows it: Task memory in words, switches as on and off. */
function displayed(key, value) {
  if (key === "memory.mode") return MEMORY_TEXT[value] ?? String(value);
  return shown(value);
}

function choicesOf(spec) {
  if (spec.values === "boolean") return ["on", "off"];
  if (spec.values === "number") return ["a number above 0"];
  return [...spec.values];
}

/** The rule source a read-only row names: the person's own rule file in the home, else Freeflow's default. */
/**
 * Where Workers' rule comes from, and it names it (N4): the project's rules/delegation.md for the project whose tasks
 * name this folder's repository (the lookup `task here` makes), then the home's rules/delegation.md, then the default.
 */
function workersRuleSource(home, root) {
  const project = projectsOfFolder(home, root).find((slug) =>
    existsSync(join(home, "projects", slug, "rules", "delegation.md")),
  );
  if (project) return { source: `project ${project}'s rules (projects/${project}/rules/delegation.md)`, own: true };
  if (existsSync(join(home, "rules", "delegation.md")))
    return { source: "your rules (rules/delegation.md)", own: true };
  return { source: "Freeflow's default", own: false };
}

function readOnlyRow(home, key, root) {
  if (key === "review") {
    // Review's rule is read by the review scripts' own lookup: the repository's Review Rules, then the home's, then the
    // default; the row names which one applies (N4).
    const review = reviewAt({ root, commit: "HEAD" });
    const value = `One reviewer and one round, at ${review.value}`;
    const names = {
      project: "the repository's Review Rules",
      home: "your rules (rules/review.md)",
      default: "Freeflow's default",
    };
    return {
      key,
      label: "Review",
      value,
      displayed: value,
      scope: null,
      source: names[review.from] ?? "Freeflow's default",
      ticked: false,
      readOnly: true,
      tickable: false,
      choices: [],
      view: "normal",
      hosts: "all",
    };
  }
  const rule = workersRuleSource(home, root);
  const value = rule.own ? `from ${rule.source}` : WORKERS_TEXT;
  return {
    key,
    label: "Workers",
    value,
    displayed: value,
    scope: null,
    source: rule.source,
    ticked: false,
    readOnly: true,
    tickable: false,
    choices: [],
    view: "normal",
    hosts: "all",
  };
}

/** One resolved row as the views show it. */
function row(item) {
  return {
    key: item.spec.key,
    label: item.spec.label,
    value: item.value,
    displayed: displayed(item.spec.key, item.value),
    scope: SCOPE_OF_LAYER[item.scope],
    source: null,
    ticked: item.ticked,
    readOnly: false,
    tickable: true,
    choices: choicesOf(item.spec),
    view: NORMAL_KEYS.includes(item.spec.key) ? "normal" : "developer",
    hosts: item.spec.hosts,
    harness: null,
  };
}

/**
 * The rows of one view for a host: the table's rows the host acts on (the normal view keeps the rows a person changes,
 * and adds the read-only rows; the developer view is the whole table with the read-only rows).
 */
function viewRows(state, harness, view, host, root) {
  const resolved = resolveAll(state, harness);
  // Each host lists the rows it acts on: a Pi-only or Claude Code-only row is left out of the others' views (N3).
  const acts = (spec) => {
    if (host === "pi") return spec.hosts !== "claude-code";
    if (host === "claude-code") return spec.hosts !== "pi";
    if (host === "codex") return spec.hosts === "all";
    return spec.hosts !== "pi";
  };
  const table = resolved.filter((item) => acts(item.spec));
  const shownRows = table
    .filter((item) => view === "developer" || NORMAL_KEYS.includes(item.spec.key))
    .map((item) => ({ ...row(item), harness }));
  // The normal view's order is the settled one: Freeflow, Task memory, Review, Workers, Status line, Pane.
  const ordered =
    view === "developer"
      ? [...shownRows, ...READ_ONLY_ROWS.map((key) => readOnlyRow(state.home, key, root))]
      : NORMAL_ORDER.flatMap((key) =>
          key === "review" || key === "workers"
            ? [readOnlyRow(state.home, key, root)]
            : shownRows.filter((item) => item.key === key),
        );
  return { rows: ordered, resolved };
}

/** Freeflow's on or off in this folder for the harness, and the harness's own line to stop its plugin (Setting 1). */
function offNote(resolved, harness) {
  const enabled = resolved.find((item) => item.spec.key === "enabled");
  if (enabled?.value !== false || !PLUGIN_OFF[harness]) return [];
  return [
    `Freeflow is off here. Freeflow never disables its own plugin: to stop it on this harness, run ${PLUGIN_OFF[harness]}.`,
  ];
}

function list(state, root, options, env, json) {
  const harness = harnessOf(options, env);
  const view = options["--view"] ?? "developer";
  if (!["normal", "developer"].includes(view)) throw new UsageError("--view must be normal or developer");
  const host = options["--host"] ?? "all";
  if (!["all", "claude-code", "codex", "pi"].includes(host))
    throw new UsageError("--host must be all, claude-code, codex or pi");
  const { rows, resolved } = viewRows(state, harness, view, host, root);
  const runtimeLines = stateLines(resolved, state.ignored);
  const notes = offNote(resolved, harness);
  if (json)
    return `${JSON.stringify({ root, view, harness, settings: rows, state: runtimeLines, ignored: state.ignored, notes }, null, 2)}\n`;
  const width = Math.max(...rows.map((item) => item.label.length));
  const lines = rows.map((item) => {
    // The tick is named in the developer view only; the normal view shows the value and its layer (N3).
    const scope = item.readOnly
      ? item.source
      : `${SCOPE_NAMES[item.scope]}${item.ticked && view === "developer" ? ` (only on ${harness})` : ""}`;
    return `  ${item.label.padEnd(width)}  ${String(item.displayed).padEnd(8)}  ${scope}${view === "developer" && !item.readOnly ? `  (${item.key})` : ""}`;
  });
  const ignoredLine = ignoredStateLine(state.ignored);
  return [
    `Freeflow settings for ${root} (${harness ?? "no harness named"}), ${view} view`,
    ...lines,
    ...(ignoredLine ? ["", ignoredLine] : []),
    ...notes,
    "Change one: settings.mjs set <key> <value> [--scope everywhere|folder|session] [--harness-only]; inherit removes it.",
    ...(view === "developer" ? [] : ["Developer settings: settings.mjs list --view developer."]),
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
function notes(spec, value, harness) {
  const out = [];
  if (spec.hosts === "pi") out.push("Only Pi acts on this setting.");
  if (spec.hosts === "claude-code") out.push("Only Claude Code's mod acts on this setting.");
  if (spec.key.startsWith("prompts."))
    out.push("Prompt text already given in this session stays until the next session start or compaction.");
  if (spec.key === "enabled" && value === false && PLUGIN_OFF[harness])
    out.push(
      `Freeflow is off here. Freeflow never disables its own plugin: to stop it on this harness, run ${PLUGIN_OFF[harness]}.`,
    );
  return out;
}

const scopeOf = (options) => {
  const scope = options["--scope"] ?? "everywhere";
  if (!SCOPES.includes(scope)) throw new UsageError("--scope must be everywhere, folder or session");
  return scope;
};

async function change(state, root, env, options, key, text, json) {
  const spec = requireSpec(key);
  const scope = scopeOf(options);
  if (scope === "session" && !spec.session)
    throw new UsageError(`${spec.key} has no Session scope here; set it on Pi's screen`);
  const harness = harnessOf(options, env);
  const ticked = Boolean(options["--harness-only"]);
  if (ticked && !harness)
    throw new UsageError("--harness-only needs a harness: --harness, FREEFLOW_HARNESS, or Claude Code's session");
  const value = text === undefined || text === "inherit" ? undefined : parseValue(spec, text);
  const before = stateLines(resolveAll(state, harness), state.ignored);
  const tick = ticked ? harness : null;
  if (scope === "session") {
    if (!state.id)
      throw new UsageError(
        "the Session scope needs a host that names its session (CLAUDE_CODE_SESSION_ID or FREEFLOW_SESSION)",
      );
    await writeSessionValue(state.home, state.id, spec.key, value, tick);
  } else await writeConfigValue(root, LAYER[scope], spec.key.split("."), value, state.home, tick);
  const after = layers(root, env);
  const resolved = resolveAll(after, harness);
  const now = resolved.find((item) => item.spec.key === spec.key);
  const lines = stateLines(resolved, after.ignored);
  const changed = lines.filter((line) => !before.includes(line));
  const cleared = before.filter((line) => !lines.includes(line));
  const where =
    now.scope === "default"
      ? "the default"
      : `${SCOPE_NAMES[SCOPE_OF_LAYER[now.scope]]}${now.ticked ? `, only on ${harness}` : ""}`;
  const result = { ...row(now), harness, state: lines, changed, cleared, notes: notes(spec, now.value, harness) };
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  return [
    `${spec.key}: ${shown(now.value)} (${where})`,
    ...changed.map((line) => `Runtime State: ${line}`),
    ...cleared.map((line) => `Runtime State no longer: ${line}`),
    ...result.notes,
    "",
  ].join("\n");
}

// ---- doctor ----

/** A JSON value as the diff shows it, on one line. */
const json1 = (value) => (value === undefined ? "none" : JSON.stringify(value));

/** A layer's problems, from its parsed JSON: each ignored setting, with the removal that fixes it. */
function fileProblems(raw, scope) {
  return sanitizeConfigFile(raw, scope).ignored.map((item) => ({
    ...item,
    fix:
      item.key === null ? null : { kind: "remove", path: item.key.split("."), old: getPath(raw, item.key.split(".")) },
  }));
}

/** The Session scope's problems: a removed key, a key the table does not know, one not held per session, or a wrong value. */
function sessionProblems(raw) {
  return Object.entries(raw).flatMap(([key, value]) => {
    const tick = /^harness\.([^.]+)\.(.+)$/.exec(key);
    const bare = tick ? tick[2] : key;
    const spec = settingSpec(bare);
    // A key of a removed section, as the file layers name it; then the table's own checks.
    const problem =
      (tick && !HARNESSES.includes(tick[1]) ? `unknown harness: use ${HARNESSES.join(", ")}` : null) ??
      removedSettingReason(bare) ??
      (!spec
        ? "unknown setting"
        : !spec.session
          ? "not a Session setting"
          : !validSettingValue(spec, value)
            ? `takes ${takes(spec)}`
            : null);
    return problem ? [{ key, reason: problem, fix: { kind: "remove", path: [key], old: value } }] : [];
  });
}

/** One problem as the diff shows it: its reason, then what is removed. */
function describe(problem) {
  return [
    `  ${problem.key ?? "(whole file)"}: ${problem.reason}`,
    `    - ${problem.key}: ${json1(problem.fix?.old)}`,
    "    + (removed: the default applies)",
  ];
}

/** A repository file's settings to move to this folder: each valid setting the file holds, with the value it gives. */
function movable(raw) {
  const { config } = sanitizeConfigFile(raw, "personal");
  const moved = [];
  const walk = (node, prefix) => {
    for (const [name, value] of Object.entries(node)) {
      if (name === "harness" || name === "v") continue;
      const key = [...prefix, name].join(".");
      if (value !== null && typeof value === "object" && !Array.isArray(value)) walk(value, [...prefix, name]);
      else if (settingSpec(key)) moved.push({ key, value });
    }
  };
  walk(config, []);
  return moved;
}

function readRawFile(path) {
  if (!existsSync(path)) return { exists: false };
  try {
    return { exists: true, raw: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { exists: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The moves doctor makes for a repository file: every setting it holds, unless this folder already sets it. */
function planMoves(state, raw) {
  const already = state.personal.value;
  return movable(raw).map((item) => {
    const kept = getPath(already, item.key.split("."));
    return { ...item, kept: kept !== undefined };
  });
}

async function doctor(root, env, options) {
  const fix = Boolean(options["--fix"]);
  const committed = Boolean(options["--committed"]);
  const home = freeflowHome(env);
  const id = sessionId(env);
  const state = layers(root, env);
  const out = [];
  let found = 0;
  let remaining = 0;
  const report = (problems) => {
    found += problems.length;
    remaining += problems.length;
    out.push(...problems.flatMap(describe));
  };

  // The home's layers: everywhere and this folder, each read against the table.
  for (const [label, path, scope, layerName] of [
    ["Everywhere (settings.json in the home)", layerPath(home, "repository"), "repository", "repository"],
    [`This folder (folders.json in the home, ${resolve(root)})`, layerPath(home, "personal"), "personal", "personal"],
  ]) {
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
    const raw = scope === "personal" ? (file.raw[folderKey(root)] ?? file.raw[resolve(root)] ?? {}) : file.raw;
    const problems = fileProblems(raw, scope);
    if (problems.length === 0) {
      out.push(`${label}: no problems.`);
      continue;
    }
    out.push(`${label}: ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
    report(problems);
    if (!fix) continue;
    const next = structuredClone(raw);
    for (const problem of problems) if (problem.fix) deletePath(next, problem.fix.path);
    if (fileProblems(next, scope).length > 0) {
      out.push("  not fixed: the file still holds a setting Freeflow ignores; fix it by hand.");
      continue;
    }
    await writeLayer(root, layerName, next, home);
    remaining -= problems.length;
    out.push(`  fixed: ${problems.length} removed from ${label}.`);
  }

  // The repository's own files: each setting moves to this folder (D-060); the committed file is rewritten only with --committed.
  for (const scope of ["personal", "repository"]) {
    const filePath = join(root, LEGACY_FILES[scope]);
    const file = readRawFile(filePath);
    if (!file.exists) continue;
    const label = `${LEGACY_FILES[scope]} (${scope === "personal" ? "your checkout's file" : "committed, shared"})`;
    if (file.error !== undefined || typeof file.raw !== "object" || file.raw === null || Array.isArray(file.raw)) {
      out.push(`${label}: not a JSON object (${file.error ?? "must hold an object"}); not moved: fix it by hand.`);
      found += 1;
      remaining += 1;
      continue;
    }
    const moves = planMoves(state, file.raw);
    const ignored = fileProblems(file.raw, scope === "personal" ? "personal" : "repository");
    if (moves.length === 0 && ignored.length === 0) {
      out.push(`${label}: nothing to move.`);
      continue;
    }
    found += moves.length + ignored.length;
    remaining += moves.length + ignored.length;
    out.push(`${label}: ${moves.length} to move to This folder, ${ignored.length} ignored.`);
    for (const move of moves)
      out.push(
        `  ${move.key}: ${move.kept ? "this folder already sets it; kept" : `moved to This folder (${json1(move.value)})`}`,
      );
    out.push(...ignored.flatMap(describe));
    if (!fix) continue;
    // Settings this folder does not set yet move in; the folder's own value stays where it has one. A folder layer
    // with ignored settings is fixed first, as writes to it are refused (D-045).
    const folderNow = readConfigFile(root, "personal", home);
    if (folderNow.ignored.length > 0) {
      out.push("  not moved: This folder has settings Freeflow ignores; fix them first (above).");
      continue;
    }
    if (moves.some((move) => !move.kept)) {
      const folderNext = structuredClone(folderNow.value);
      for (const move of moves) if (!move.kept) setPath(folderNext, move.key.split("."), move.value);
      await writeLayer(root, "personal", folderNext, home);
    }
    if (scope === "personal") {
      await rm(filePath, { force: true });
      remaining -= moves.length + ignored.length;
      out.push(`  fixed: ${LEGACY_FILES[scope]} removed; its settings are in This folder.`);
      continue;
    }
    if (!committed) {
      out.push(
        `  not rewritten: the committed file is shared; its settings now apply from This folder. Run doctor --fix --committed to remove them from the file.`,
      );
      continue;
    }
    if (ignored.length > 0 || moves.length > 0) {
      await rm(filePath, { force: true });
      remaining -= moves.length + ignored.length;
      out.push(`  fixed: ${LEGACY_FILES[scope]} removed (committed); its settings are in This folder.`);
    }
  }

  // This session's file.
  if (!id) out.push("Session: not checked (no session is named: CLAUDE_CODE_SESSION_ID or FREEFLOW_SESSION).");
  else {
    const path = sessionSettingsPath(home, id);
    const file = readRawFile(path);
    if (!file.exists) out.push("Session: no file; nothing to fix.");
    else if (file.error !== undefined) {
      out.push(`Session (${path}): not JSON (${file.error}); not rewritten: fix it by hand.`);
      found += 1;
      remaining += 1;
    } else {
      const problems = sessionProblems(file.raw);
      if (problems.length === 0) out.push("Session: no problems.");
      else {
        out.push(`Session (${path}): ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
        report(problems);
        if (fix) {
          const next = structuredClone(file.raw);
          for (const problem of problems) delete next[problem.key];
          if (Object.keys(next).length === 0) await rm(path, { force: true });
          else {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
          }
          remaining -= problems.length;
          out.push(`  fixed: ${problems.length} removed from the session.`);
        }
      }
    }
  }

  if (found === 0) return { out: `${out.join("\n")}\nNothing to fix.\n`, code: 0 };
  if (!fix) {
    return {
      out: `${out.join("\n")}\nRun settings.mjs doctor --fix to write these fixes (the committed file: with --committed).\n`,
      code: 1,
    };
  }
  return { out: `${out.join("\n")}\n`, code: remaining === 0 ? 0 : 1 };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { options, words } = parse(argv);
  const [command, key, value] = words;
  if (options["--help"] || options["-h"] || !command) return { out: `${USAGE}\n`, code: command ? 0 : 1 };
  const root = workspaceRoot(options["--root"] ?? process.cwd());
  const state = layers(root, env);
  const json = Boolean(options["--json"]);
  if (command === "list") return { out: list(state, root, options, env, json), code: 0 };
  if (command === "get") {
    const spec = requireSpec(key);
    const harness = harnessOf(options, env);
    const item = resolveAll(state, harness).find((each) => each.spec.key === spec.key);
    const result = { ...row(item), harness };
    return {
      out: json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `${spec.key}: ${shown(item.value)} (${SCOPE_NAMES[SCOPE_OF_LAYER[item.scope]]}${item.ticked ? `, only on ${harness}` : ""})\n`,
      code: 0,
    };
  }
  if (command === "set" || command === "unset") {
    if (command === "set" && value === undefined) throw new UsageError("set needs a key and a value");
    return { out: await change(state, root, env, options, key, command === "set" ? value : undefined, json), code: 0 };
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
