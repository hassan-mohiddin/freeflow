import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CANONICAL_SKILL_NAMES } from "./canonical-skills.mjs";
import { HOSTS, checkHostSkills, checkRetiredNames } from "./check-hosts.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** A package with the given files, committed so git ls-files lists them. */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "check-hosts-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

const skills = (folder, names) =>
  Object.fromEntries(names.map((name) => [`${folder}/${name}/SKILL.md`, `---\nname: ${name}\n---\n`]));

test("every host in this repository gets the same skills, and the retired names appear only on purpose", () => {
  assert.deepEqual(checkHostSkills(repoRoot), []);
  assert.deepEqual(checkRetiredNames(repoRoot), []);
});

test("a host whose manifest names another folder, short of a skill, fails by name", () => {
  const [left, ...kept] = CANONICAL_SKILL_NAMES;
  const root = fixture({
    ...skills("skills", CANONICAL_SKILL_NAMES),
    ...skills("other", kept),
    ".claude-plugin/plugin.json": JSON.stringify({ skills: "./skills/" }),
    ".codex-plugin/plugin.json": JSON.stringify({ skills: "./other/" }),
  });
  try {
    const errors = checkHostSkills(root, HOSTS.slice(0, 2));
    assert.deepEqual(errors, [`Codex (.codex-plugin/plugin.json) is missing canonical skills: ${left}`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Copilot and the other Agent Plugins hosts get skills/ beside plugin.json, which names no folder", () => {
  const agentPlugins = HOSTS.filter((entry) => entry.manifest === "plugin.json");
  const root = fixture({
    ...skills("skills", [...CANONICAL_SKILL_NAMES, "extra-skill"]),
    "plugin.json": JSON.stringify({ name: "freeflow" }),
  });
  try {
    assert.deepEqual(checkHostSkills(root, agentPlugins), [
      "Copilot, VS Code, Kiro and Hermes (plugin.json) has skills the catalog does not list: extra-skill",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a missing manifest, or a skills field that names no folder or one outside the package, fails", () => {
  const root = fixture({
    ...skills("skills", CANONICAL_SKILL_NAMES),
    ".codex-plugin/plugin.json": JSON.stringify({ skills: [] }),
    "opencode.json": JSON.stringify({ skills: ["../elsewhere"] }),
  });
  try {
    const errors = checkHostSkills(
      root,
      HOSTS.filter((entry) => ["Claude Code", "Codex", "OpenCode"].includes(entry.host)),
    );
    assert.deepEqual(errors, [
      "Claude Code (.claude-plugin/plugin.json): the manifest is missing",
      "Codex (.codex-plugin/plugin.json): skills names no skills folder",
      "OpenCode (opencode.json): ../elsewhere is outside the package",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Pi gets only the skills its catalog names, whatever else skills/ holds", () => {
  const pi = HOSTS.filter((entry) => entry.host === "Pi");
  const root = fixture({
    ...skills("skills", [...CANONICAL_SKILL_NAMES.slice(1), "extra-skill"]),
    "package.json": "{}",
  });
  try {
    assert.deepEqual(checkHostSkills(root, pi), [
      `Pi (package.json) is missing canonical skills: ${CANONICAL_SKILL_NAMES[0]}`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("live text naming a retired name fails by line; history, fixtures and built output are not read", () => {
  const root = fixture({
    "docs/guide.md": "Attach a record with the task_memory tool.\nNothing retired here.\n",
    "skills/x/SKILL.md": "Run view resume to recover.\n",
    "CHANGELOG.md": "- Removed Pi's Task Memory.\n",
    "dev-docs/adr/0012.md": "Schema 4 record.\n",
    ".skill-eval/x/fixtures/old/record.md": "Schema: 4\n",
    "pi-extension/dist/index.js": "// taskMemory\n",
  });
  try {
    assert.deepEqual(checkRetiredNames(root, {}), [
      "docs/guide.md:1 names a removed feature: Attach a record with the task_memory tool.",
      "skills/x/SKILL.md:1 names a removed feature: Run view resume to recover.",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file named on purpose fails when its lines outgrow its count, and when its count outgrows them", () => {
  const root = fixture({
    "migrate.mjs": "// reads a Schema 4 record\n// writes Schema 5\n// and a Schema-4 archive\n",
    "notes.md": "Pi's former Task Memory is gone.\n",
  });
  try {
    const errors = checkRetiredNames(root, { "migrate.mjs": 1, "notes.md": 2 });
    assert.equal(errors.length, 2);
    assert.match(
      errors[0],
      /^migrate\.mjs names Pi's former Task Memory or Schema 4 on 2 lines, 1 on purpose: read the new ones \(1, 3\)/,
    );
    assert.equal(errors[1], "notes.md names them on 1 lines, not 2: lower its count in check-hosts.mjs");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
