#!/usr/bin/env node

// The cross-host check: every host Freeflow ships to gets the same skills, and no live text names Pi's former Task
// Memory or Schema 4, except where naming them is the point: migrate, the refusals and notes that send a user to it, the
// tests of those, and history.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_SKILL_NAMES, skillSetDifferences } from "./canonical-skills.mjs";

/**
 * Where each host finds Freeflow's skills: the skills field of a manifest the host reads, or else the folder the host's
 * own rule fixes. Agent Plugins 1.0 clients (Copilot, VS Code, Kiro, Hermes) discover skills/ beside plugin.json, which
 * cannot name another folder (its section 6.1); Gemini reads an extension's skills/; Pi loads the skills its catalog
 * names from skills/. Pi's capability skills are its own features, not portable skills, so they are not compared.
 */
export const HOSTS = [
  { host: "Claude Code", manifest: ".claude-plugin/plugin.json", field: "skills" },
  { host: "Codex", manifest: ".codex-plugin/plugin.json", field: "skills" },
  { host: "Cursor", manifest: ".cursor-plugin/plugin.json", field: "skills" },
  { host: "OpenCode", manifest: "opencode.json", field: "skills" },
  { host: "Gemini CLI", manifest: "gemini-extension.json", folder: "skills" },
  { host: "Copilot, VS Code, Kiro and Hermes", manifest: "plugin.json", folder: "skills" },
  { host: "Pi", manifest: "package.json", catalog: "skills" },
];

/** Pi's former Task Memory (its name, tool, settings key, skill and commands) and Schema 4 (its name, header, registry
 * and resume view). */
export const RETIRED = [
  /Task Memory/,
  /\btask_memory\b/,
  /\btaskMemory\b/,
  /capabilities\/task-memory\b/,
  /\/freeflow (?:task|trash|project)\b/,
  /\b[Ss]chema(?: |-|: )4\b/,
  /\bregistry\.json\b/,
  /\bview resume\b/,
];

/** Not read: history (the changelog, decision records, release evidence, the deprecated archive), frozen eval
 * fixtures, pi-extension/dist, which is built from the src this check reads, and this check and its test, which name
 * them to find them. */
const NOT_READ = [
  /^scripts\/validation\/check-hosts(?:\.test)?\.mjs$/,
  /^CHANGELOG\.md$/,
  /^dev-docs\/adr\//,
  /^plugin-docs\/release-evidence\//,
  /^\.deprecated\//,
  /(?:^|\/)fixtures[^/]*\//,
  /^pi-extension\/dist\//,
];

/**
 * The files that name them on purpose, with how many of their lines do. A line added to one fails until its count is
 * raised here, so each new mention is read; a count above what the file holds fails too, so the list stays true.
 */
export const NAMED_ON_PURPOSE = {
  // migrate, which alone reads Schema 4, and the store module whose Pi project stores it reads.
  "skills/track-work/scripts/lib/migrate5.mjs": 7,
  "skills/track-work/scripts/lib/record5.mjs": 1,
  "skills/track-work/scripts/lib/store.mjs": 2,
  // The refusals that name migrate, and Pi's handling of a config that still sets taskMemory.
  "skills/track-work/scripts/working-record.mjs": 7,
  "skills/track-work/scripts/lib/freeflow-store.mjs": 4,
  "skills/discuss-work/scripts/choices.mjs": 2,
  "pi-extension/src/host/config-validation.ts": 5,
  "pi-extension/src/host/config.ts": 2,
  "pi-extension/src/host/status.ts": 1,
  "pi-extension/src/messaging/registry.ts": 1,
  // Skill text that routes a Schema 4 record or Pi's records to migrate.
  "skills/track-work/SKILL.md": 3,
  "skills/track-work/references/working-record-format.md": 3,
  "skills/setup-freeflow/SKILL.md": 1,
  "skills/setup-freeflow/references/store-setup.md": 5,
  // User docs that say what was removed and how old records move in.
  "plugin-docs/getting-started.md": 1,
  "plugin-docs/integrations/pi.md": 1,
  "plugin-docs/settings.md": 2,
  "plugin-docs/using-freeflow.md": 1,
  // Developer docs: the removal, migrate, and design records' reasons.
  "dev-docs/README.md": 3,
  "dev-docs/features/activation-status.md": 2,
  "dev-docs/features/track-work-cli.md": 6,
  "dev-docs/skills/execute-work.md": 3,
  "dev-docs/skills/track-work.md": 10,
  "dev-docs/subsystems/cognitive-routing.md": 1,
  "dev-docs/subsystems/freeflow-store.md": 9,
  "dev-docs/subsystems/messaging.md": 1,
  "dev-docs/subsystems/skill-routing.md": 1,
  // Tests of migrate, the refusals and the retired settings; a result recorded before the removal.
  ".skill-eval/coverage-matrix.json": 1,
  ".skill-eval/discuss-work/tests/choices.test.mjs": 3,
  ".skill-eval/track-work/tests/migrate5.test.mjs": 2,
  ".skill-eval/track-work/tests/schema5.test.mjs": 1,
  ".skill-eval/track-work/tests/store.test.mjs": 4,
  ".skill-eval/track-work/tests/working-record.test.mjs": 2,
  "pi-extension/tests/integration/pi-extension.test.js": 7,
};

/** The skill folders under a folder: those holding a SKILL.md. */
function skillsIn(root, folder) {
  const path = resolve(root, folder);
  if (!existsSync(path)) return null;
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(path, entry.name, "SKILL.md")))
    .map((entry) => entry.name);
}

/** The skills one host gets, or null with an error when they cannot be read. */
function hostSkills(root, entry, errors) {
  const label = `${entry.host} (${entry.manifest})`;
  if (!existsSync(join(root, entry.manifest))) {
    errors.push(`${label}: the manifest is missing`);
    return null;
  }
  let folders;
  if (entry.field) {
    let value;
    try {
      value = JSON.parse(readFileSync(join(root, entry.manifest), "utf8"))[entry.field];
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
      return null;
    }
    folders = Array.isArray(value) ? value : [value];
    if (folders.length === 0 || folders.some((folder) => typeof folder !== "string" || folder === "")) {
      errors.push(`${label}: ${entry.field} names no skills folder`);
      return null;
    }
  } else folders = [entry.folder ?? entry.catalog];
  const found = new Set();
  for (const folder of folders) {
    const inside = relative(root, resolve(root, folder));
    if (inside.startsWith("..") || isAbsolute(inside)) {
      errors.push(`${label}: ${folder} is outside the package`);
      return null;
    }
    const names = skillsIn(root, folder);
    if (names === null) {
      errors.push(`${label}: ${folder} does not exist`);
      return null;
    }
    for (const name of names) found.add(name);
  }
  // Pi loads only the skills its catalog names, so a skill the catalog leaves out is not Pi's.
  if (entry.catalog) return CANONICAL_SKILL_NAMES.filter((name) => found.has(name));
  return [...found];
}

/** Every host's skills against the canonical list, so all hosts get the same ones. */
export function checkHostSkills(root, hosts = HOSTS) {
  const errors = [];
  for (const entry of hosts) {
    const skills = hostSkills(root, entry, errors);
    if (skills) errors.push(...skillSetDifferences(skills, `${entry.host} (${entry.manifest})`));
  }
  return errors;
}

/** The tracked files this check reads: everything but history, frozen fixtures and built output. */
function liveFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((path) => path !== "" && !NOT_READ.some((pattern) => pattern.test(path)));
}

/** Live text naming a retired name outside the files that name it on purpose, and counts that no longer match. */
export function checkRetiredNames(root, onPurpose = NAMED_ON_PURPOSE) {
  const errors = [];
  const seen = new Map();
  for (const path of liveFiles(root)) {
    const full = join(root, path);
    if (!existsSync(full)) continue;
    const buffer = readFileSync(full);
    if (buffer.subarray(0, 8000).includes(0)) continue;
    const lines = buffer
      .toString("utf8")
      .split("\n")
      .map((text, index) => ({ number: index + 1, text }))
      .filter(({ text }) => RETIRED.some((pattern) => pattern.test(text)));
    if (lines.length > 0) seen.set(path, lines);
  }
  for (const [path, lines] of seen) {
    const allowed = onPurpose[path];
    if (allowed === undefined) {
      for (const { number, text } of lines)
        errors.push(`${path}:${number} names a removed feature: ${text.trim().slice(0, 160)}`);
    } else if (lines.length > allowed) {
      errors.push(
        `${path} names Pi's former Task Memory or Schema 4 on ${lines.length} lines, ${allowed} on purpose: read the new ones (${lines.map(({ number }) => number).join(", ")}) and reword them, or raise its count in check-hosts.mjs if they are about migrate or the removal`,
      );
    }
  }
  for (const [path, allowed] of Object.entries(onPurpose)) {
    const count = seen.get(path)?.length ?? 0;
    if (count < allowed)
      errors.push(`${path} names them on ${count} lines, not ${allowed}: lower its count in check-hosts.mjs`);
  }
  return errors;
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const errors = [...checkHostSkills(root), ...checkRetiredNames(root)];
  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Cross-host check passed: ${HOSTS.length} host surfaces get the same ${CANONICAL_SKILL_NAMES.length} skills, and Pi's former Task Memory and Schema 4 are named only on purpose.`,
    );
  }
}
