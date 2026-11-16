import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  SETTINGS,
  sanitizeConfigFile,
  validateLocalConfig,
  validateRepositoryConfig,
} from "../../../pi-extension/dist/host/config-validation.js";

const scriptPath = resolve("skills/setup-freeflow/scripts/settings.mjs");
const runtimeContextPath = pathToFileURL(resolve("hooks/shared/runtime-context.mjs")).href;
const baseEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  CLAUDE_CODE_SESSION_ID: "",
  FREEFLOW_SESSION: "",
  FREEFLOW_HARNESS: "",
};

/** A repository (optional Git) and a Freeflow home in a temporary folder; the session is named as `session`. */
async function fixture({ git = true, session = "s-1" } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "freeflow-settings-"));
  const root = join(dir, "repo");
  const home = join(dir, "home");
  await mkdir(root, { recursive: true });
  if (git) execFileSync("git", ["init", "-q", root], { env: baseEnv });
  const env = { ...baseEnv, FREEFLOW_HOME: home, FREEFLOW_SESSION: session ?? "" };
  const run = (...args) => {
    const result = spawnSync(process.execPath, [scriptPath, ...args, "--root", root], { env, encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  const json = (...args) => {
    const result = run(...args, "--json");
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  /** A file in the Freeflow home, as JSON. */
  const homeFile = async (name) => JSON.parse(await readFile(join(home, name), "utf8"));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  return { dir, root, home, env, run, json, homeFile, cleanup };
}

/** A value other than the default that the key takes, as typed on the command line, and as stored. */
function otherValue(spec) {
  if (spec.values === "boolean") return spec.default === false ? ["on", true] : ["off", false];
  if (spec.values === "number") return ["12.5", 12.5];
  const value = spec.values.find((each) => each !== spec.default);
  return [String(value), value];
}

const settable = SETTINGS;
const readRows = (listed) => listed.settings.filter((row) => !row.readOnly);

test("the Task memory row is sync with a store that has a remote and local without one, unless a layer sets it (D-060, round 3)", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const memoryRow = () => f.json("list", "--view", "normal").settings.find((row) => row.key === "memory.mode");
  assert.equal(memoryRow().value, "local");
  assert.equal(memoryRow().displayed, "On, this machine");
  // The home is the store: a remote named origin in its Git config makes the unset default sync.
  await mkdir(join(f.home, ".git"), { recursive: true });
  await writeFile(
    join(f.home, ".git", "config"),
    '[core]\n[remote "origin"]\n\turl = https://example.invalid/store.git\n',
  );
  assert.equal(memoryRow().value, "sync");
  assert.equal(memoryRow().displayed, "On, with sync");
  assert.equal(memoryRow().scope, "default");
  // An explicit value wins over the store's remote.
  await writeFile(join(f.home, "settings.json"), '{"memory":{"mode":"local"}}\n');
  assert.equal(memoryRow().value, "local");
});

test("the normal view names where Workers' and Review's rules come from (N4): the default, your rules, or the project's", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const rowOf = (view, label) => f.json("list", "--view", view).settings.find((row) => row.label === label);
  assert.equal(rowOf("normal", "Workers").source, "Freeflow's default");
  await mkdir(join(f.home, "rules"), { recursive: true });
  await writeFile(join(f.home, "rules", "delegation.md"), "Workers use the cheap tier.\n");
  assert.equal(rowOf("normal", "Workers").source, "your rules (rules/delegation.md)");
  assert.match(rowOf("normal", "Workers").value, /^from your rules/);
  assert.equal(rowOf("normal", "Review").source, "Freeflow's default");
});

test("the developer view is the whole table at its defaults, with the two read-only rows; the normal view has the rows a person changes", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const listed = f.json("list");
  assert.deepEqual(
    readRows(listed).map((row) => row.key),
    SETTINGS.filter((spec) => spec.hosts !== "pi").map((spec) => spec.key),
  );
  for (const row of readRows(listed)) assert.equal(row.scope, "default", row.key);
  assert.deepEqual(
    listed.settings.filter((row) => row.readOnly).map((row) => row.key),
    ["review", "workers"],
  );
  assert.deepEqual(listed.state, []);
  const text = f.run("list", "--view", "developer");
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Claim hours\s+4\s+default\s+\(delegation\.claimHours\)/);
  assert.match(text.stdout, /Review\s+One reviewer and one round, at pull request\s+Freeflow's default/);
  // The normal view: Freeflow, Task memory, Review, Workers, then Claude Code's status line and pane.
  const normal = f.json("list", "--view", "normal", "--host", "claude-code");
  assert.deepEqual(
    normal.settings.map((row) => row.key),
    ["enabled", "memory.mode", "review", "workers", "pane.statusLine", "pane.enabled"],
  );
  assert.equal(normal.settings.find((row) => row.key === "memory.mode").displayed, "On, this machine");
  assert.equal(normal.settings.find((row) => row.key === "review").readOnly, true);
  assert.equal(normal.settings.find((row) => row.key === "review").source, "Freeflow's default");
  const piNormal = f.json("list", "--view", "normal", "--host", "pi");
  assert.deepEqual(
    piNormal.settings.map((row) => row.key),
    ["enabled", "memory.mode", "review", "workers"],
  );
  assert.match(f.run("list", "--view", "normal").stdout, /Freeflow\s+on\s+default/);
});

test("every settable key can be set, read back and unset in each scope", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  for (const spec of settable) {
    const [typed, stored] = otherValue(spec);
    const scopes = ["everywhere", "folder", ...(spec.session ? ["session"] : [])];
    for (const scope of scopes) {
      const set = f.json("set", spec.key, typed, "--scope", scope);
      assert.equal(set.value, stored, `${spec.key} in ${scope}`);
      assert.equal(set.scope, scope, `${spec.key} in ${scope}`);
      const got = f.json("get", spec.key);
      assert.equal(got.value, stored, `${spec.key} in ${scope}`);
      assert.equal(got.scope, scope, `${spec.key} in ${scope}`);
      assert.equal(got.label, spec.label);
      assert.equal(got.hosts, spec.hosts);
      const unset = f.json("unset", spec.key, "--scope", scope);
      assert.equal(unset.scope, "default", `${spec.key} unset from ${scope}`);
      assert.equal(unset.value, spec.default, `${spec.key} unset from ${scope}`);
    }
  }
  assert.equal(existsSync(join(f.home, "settings.json")), false, "an emptied everywhere file is removed");
  assert.equal(existsSync(join(f.home, "folders.json")), false, "an emptied folder file is removed");
  assert.equal(existsSync(join(f.home, "sessions/s-1/settings.json")), false, "an emptied session file is removed");
  assert.equal(existsSync(join(f.root, ".freeflow")), false, "Freeflow writes nothing into the repository");
});

test("inherit removes a setting in its scope; a set without --scope is an everywhere change", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.json("set", "delegation.claimHours", "24", "--scope", "folder");
  const result = f.json("set", "delegation.claimHours", "inherit", "--scope", "folder");
  assert.equal(result.scope, "default");
  assert.equal(result.value, "4");
  const everywhere = f.json("set", "delegation.claimHours", "8");
  assert.equal(everywhere.scope, "everywhere");
  assert.deepEqual(await f.homeFile("settings.json"), { delegation: { claimHours: "8" } });
});

test("an everywhere write drops a value equal to its default; a folder write keeps it and overrides everywhere", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.json("set", "delegation.claimHours", "8", "--scope", "everywhere");
  assert.deepEqual(await f.homeFile("settings.json"), { delegation: { claimHours: "8" } });
  f.json("set", "delegation.claimHours", "4", "--scope", "folder");
  assert.deepEqual(await f.homeFile("folders.json"), { [f.root]: { delegation: { claimHours: "4" } } });
  assert.equal(f.json("get", "delegation.claimHours").value, "4");
  assert.equal(f.json("get", "delegation.claimHours").scope, "folder");
  f.json("set", "delegation.claimHours", "4", "--scope", "everywhere");
  assert.equal(existsSync(join(f.home, "settings.json")), false, "the everywhere default is pruned, so the file goes");
});

test("precedence is session, then folder, then everywhere, then the default; a harness tick wins within its scope and only on its harness", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const codex = ["--harness", "codex"];
  const claude = ["--harness", "claude-code"];
  f.json("set", "delegation.claimHours", "8", "--scope", "everywhere");
  assert.equal(f.json("get", "delegation.claimHours").scope, "everywhere");
  f.json("set", "delegation.claimHours", "2", "--scope", "folder");
  assert.equal(f.json("get", "delegation.claimHours").value, "2");
  f.json("set", "delegation.claimHours", "1", "--scope", "session");
  assert.equal(f.json("get", "delegation.claimHours").scope, "session");
  f.json("unset", "delegation.claimHours", "--scope", "session");
  f.json("unset", "delegation.claimHours", "--scope", "folder");
  assert.equal(f.json("get", "delegation.claimHours").value, "8");

  // A tick for Codex, in the everywhere scope: Codex reads it, Claude Code keeps the general value.
  const tick = f.json("set", "delegation.claimHours", "24", "--scope", "everywhere", "--harness-only", ...codex);
  assert.equal(tick.ticked, true);
  assert.equal(tick.harness, "codex");
  assert.deepEqual(await f.homeFile("settings.json"), {
    delegation: { claimHours: "8" },
    harness: { codex: { delegation: { claimHours: "24" } } },
  });
  const forCodex = f.json("get", "delegation.claimHours", ...codex);
  assert.equal(forCodex.value, "24");
  assert.equal(forCodex.ticked, true);
  assert.equal(f.json("get", "delegation.claimHours", ...claude).value, "8");
  assert.equal(f.json("get", "delegation.claimHours", ...claude).ticked, false);

  // A tick in the folder wins over the everywhere tick within the folder's own scope, but a general folder value wins over everywhere's tick.
  f.json("set", "delegation.claimHours", "1", "--scope", "folder", "--harness-only", ...codex);
  assert.equal(f.json("get", "delegation.claimHours", ...codex).value, "1");
  assert.equal(f.json("get", "delegation.claimHours", ...codex).scope, "folder");
  f.json("set", "delegation.claimHours", "2", "--scope", "folder");
  assert.equal(f.json("get", "delegation.claimHours", ...codex).value, "1", "the folder tick still wins for Codex");
  assert.equal(
    f.json("get", "delegation.claimHours", ...claude).value,
    "2",
    "the folder general value for Claude Code",
  );

  // A session's general value beats any tick below it.
  f.json("set", "delegation.claimHours", "4", "--scope", "session");
  assert.equal(f.json("get", "delegation.claimHours", ...codex).value, "4");
  assert.equal(f.json("get", "delegation.claimHours", ...codex).scope, "session");
  // A session's tick for Codex wins over the session's general value for Codex.
  f.json("set", "delegation.claimHours", "24", "--scope", "session", "--harness-only", ...codex);
  assert.equal(f.json("get", "delegation.claimHours", ...codex).value, "24");
  assert.equal(f.json("get", "delegation.claimHours", ...claude).value, "4");
});

test("a change prints the Runtime State lines it changed, and the notes for a prompt, a Pi-only setting and a Claude Code setting", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const skill = f.run("set", "skills.research-work", "off", "--scope", "folder");
  assert.equal(skill.status, 0, skill.stderr);
  assert.match(skill.stdout, /^skills\.research-work: off \(This folder\)$/m);
  assert.match(skill.stdout, /^Runtime State: Skills off: `research-work`; do not open or follow them\.$/m);
  const other = f.run("set", "skills.write-docs", "off", "--scope", "folder");
  assert.match(
    other.stdout,
    /^Runtime State: Skills off: `research-work`, `write-docs`; do not open or follow them\.$/m,
  );
  assert.deepEqual(await f.homeFile("folders.json"), {
    [f.root]: { skills: { "research-work": false, "write-docs": false } },
  });
  f.json("unset", "skills.write-docs", "--scope", "folder");
  const cleared = f.json("unset", "skills.research-work", "--scope", "folder");
  assert.equal(cleared.changed.length, 0);
  assert.equal(cleared.cleared.length, 1);
  const prompt = f.run("set", "prompts.core", "off", "--scope", "everywhere");
  assert.match(prompt.stdout, /Prompt text already given in this session stays/);
  const pi = f.run("set", "compaction.enabled", "off");
  assert.match(pi.stdout, /Only Pi acts on this setting\./);
  // The cost governor and the agreement, Slice and delivery gates were removed (D-058): their keys are not settings.
  const governor = f.run("set", "governor.mode", "stop");
  assert.equal(governor.status, 1);
  assert.match(governor.stderr, /governor\.mode/);
});

test("refusals name what is wrong and write nothing", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const cases = [
    [["get", "review.mode"], /unknown setting review\.mode/],
    [["set", "review.unit", "push"], /unknown setting review\.unit/],
    [["set", "review.rounds", "1", "--scope", "folder"], /unknown setting review\.rounds/],
    [["set", "review.depth", "deep", "--scope", "everywhere"], /unknown setting review\.depth/],
    [["set", "delegation.claimHours", "3", "--scope", "folder"], /delegation\.claimHours takes 1, 2, 4, 8, 24, not 3/],
    [["set", "enabled", "maybe", "--scope", "folder"], /enabled takes on or off, not maybe/],
    [["set", "delegation.claimHours", "8", "--scope", "repository"], /--scope must be everywhere, folder or session/],
    [["set", "delegation.claimHours", "8", "--scope", "personal"], /--scope must be everywhere, folder or session/],
    [
      ["set", "delegation.claimHours", "8", "--harness", "emacs", "--harness-only"],
      /--harness must be claude-code, codex, pi/,
    ],
    [["set", "delegation.claimHours", "8", "--harness-only"], /--harness-only needs a harness/],
    [["set", "gates.slice", "block", "--scope", "folder"], /gates\.slice/],
    [["set", "gates.delegation", "blok", "--scope", "folder"], /gates\.delegation takes off, warn, block, not blok/],
    [["set", "memory.mode", "cloud", "--scope", "folder"], /memory\.mode takes local, sync, off, not cloud/],
  ];
  for (const [args, message] of cases) {
    const result = f.run(...args);
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, message, args.join(" "));
  }
  assert.equal(existsSync(f.home), false, "a refused change creates no file in the home");
});

test("the Session scope is refused without a session ID", async (t) => {
  const f = await fixture({ session: null });
  t.after(f.cleanup);
  const result = f.run("set", "delegation.claimHours", "8", "--scope", "session");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the Session scope needs a host that names its session/);
});

test("an ignored setting is named by list and stops writes to its layer until doctor fixes it; the other layer is not held up", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(f.home, { recursive: true });
  await writeFile(join(f.home, "settings.json"), `{"delegation":{"claimHours":"3"}}\n`);
  const list = f.run("list");
  assert.equal(list.status, 0, list.stderr);
  assert.match(
    list.stdout,
    /Settings ignored: settings\.json delegation\.claimHours: delegation\.claimHours must be one of/,
  );
  // The ignored value is not used: the default is.
  assert.equal(f.json("get", "delegation.claimHours").value, "4");
  const write = f.run("set", "delegation.claimHours", "8", "--scope", "everywhere");
  assert.equal(write.status, 1);
  assert.match(write.stderr, /in the Freeflow home has settings Freeflow ignores; run settings\.mjs doctor/);
  assert.deepEqual(await f.homeFile("settings.json"), { delegation: { claimHours: "3" } });
  f.json("set", "delegation.claimHours", "8", "--scope", "folder");
  assert.deepEqual(await f.homeFile("folders.json"), { [f.root]: { delegation: { claimHours: "8" } } });
});

test("a home file holding the removed review settings loads with them ignored, and doctor names each and removes it", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(f.home, { recursive: true });
  await writeFile(
    join(f.home, "settings.json"),
    `{"review":{"mode":"auto","unit":"push","depth":{"default":"deep"}},"delegation":{"claimHours":"8"}}\n`,
  );
  const listed = f.json("list");
  assert.equal(listed.settings.find((row) => row.key === "delegation.claimHours").value, "8");
  const named = listed.ignored.map((item) => item.key);
  assert.ok(
    named.includes("review.mode") && named.includes("review.unit") && named.includes("review.depth"),
    named.join(","),
  );
  const check = f.run("doctor");
  assert.equal(check.status, 1);
  assert.match(check.stdout, /review\.mode: removed: review has no settings/);
  const fix = f.run("doctor", "--fix");
  assert.equal(fix.status, 0, fix.stdout);
  assert.deepEqual(await f.homeFile("settings.json"), { delegation: { claimHours: "8" } });
});

test("doctor names each problem with its fix and changes nothing without --fix; --fix writes the folder and session files", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(f.home, { recursive: true });
  await writeFile(join(f.home, "settings.json"), `{"delegation":{"claimHours":"3"},"gates":{"slice":"blok"},"enabled":false}\n`);
  const before = await readFile(join(f.home, "settings.json"), "utf8");
  const check = f.run("doctor");
  assert.equal(check.status, 1);
  assert.match(check.stdout, /delegation\.claimHours: delegation\.claimHours must be one of 1, 2, 4, 8, 24/);
  assert.match(check.stdout, /gates\.slice: the Slice gate was removed from Freeflow/);
  assert.match(check.stdout, /Run settings\.mjs doctor --fix to write these fixes/);
  assert.equal(await readFile(join(f.home, "settings.json"), "utf8"), before, "no change without --fix");
  const fix = f.run("doctor", "--fix");
  assert.equal(fix.status, 0, fix.stdout);
  assert.deepEqual(await f.homeFile("settings.json"), { enabled: false });
  assert.equal(f.run("doctor").status, 0);
  // A session file with a key the table does not know is named, and fixed.
  await mkdir(join(f.home, "sessions/s-1"), { recursive: true });
  await writeFile(join(f.home, "sessions/s-1/settings.json"), `{"nope":true,"delegation.claimHours":"8"}\n`);
  const sessionCheck = f.run("doctor");
  assert.match(sessionCheck.stdout, /nope: unknown setting/);
  assert.equal(f.run("doctor", "--fix").status, 0);
  assert.deepEqual(await f.homeFile("sessions/s-1/settings.json"), { "delegation.claimHours": "8" });
});

test("a repository's committed .freeflow/config.json is moved by doctor to This folder, and the committed file is rewritten only with --committed", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"), { recursive: true });
  const committed = join(f.root, ".freeflow/config.json");
  await writeFile(committed, `{"delegation":{"claimHours":"8"},"prompts":{"core":false},"review":{"mode":"auto"}}\n`);
  // Nothing reads the committed file any more: it is named as moved, and the defaults apply.
  const listed = f.json("list");
  assert.equal(listed.settings.find((row) => row.key === "delegation.claimHours").value, "4");
  assert.ok(
    listed.ignored.some((item) => item.file === ".freeflow/config.json" && /moved to This folder/.test(item.reason)),
  );
  const check = f.run("doctor");
  assert.equal(check.status, 1);
  assert.match(check.stdout, /delegation\.claimHours: moved to This folder \("8"\)/);
  assert.match(check.stdout, /prompts\.core: moved to This folder \(false\)/);
  // doctor --fix moves them to this folder and keeps the committed file (it is shared).
  const fix = f.run("doctor", "--fix");
  assert.equal(fix.status, 1, fix.stdout);
  assert.match(fix.stdout, /not rewritten: the committed file is shared/);
  assert.deepEqual(await f.homeFile("folders.json"), {
    [f.root]: { delegation: { claimHours: "8" }, prompts: { core: false } },
  });
  assert.equal(f.json("get", "delegation.claimHours").value, "8");
  assert.equal(f.json("get", "delegation.claimHours").scope, "folder");
  assert.equal(existsSync(committed), true, "the committed file is kept until --committed");
  // With --committed the file goes; this folder keeps the settings, and a second run finds nothing.
  const done = f.run("doctor", "--fix", "--committed");
  assert.equal(done.status, 0, done.stdout);
  assert.equal(existsSync(committed), false);
  assert.equal(f.run("doctor").status, 0);
});

test("a checkout's .freeflow/local.json is moved to This folder and removed by doctor --fix", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"), { recursive: true });
  await writeFile(join(f.root, ".freeflow/local.json"), `{"skills":{"write-docs":false}}\n`);
  assert.equal(f.run("doctor", "--fix").status, 0);
  assert.equal(existsSync(join(f.root, ".freeflow/local.json")), false);
  assert.equal(f.json("get", "skills.write-docs").value, false);
  assert.equal(f.json("get", "skills.write-docs").scope, "folder");
});

test("doctor leaves a file that is not JSON as it is, and a missing file has nothing to fix", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const empty = f.run("doctor");
  assert.equal(empty.status, 0, empty.stdout);
  assert.match(empty.stdout, /Nothing to fix/);
  await mkdir(f.home, { recursive: true });
  await writeFile(join(f.home, "settings.json"), "not json");
  const result = f.run("doctor", "--fix");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not JSON .*not rewritten: fix it by hand/);
  assert.equal(await readFile(join(f.home, "settings.json"), "utf8"), "not json");
});

test("a home file with v: 1 is read, and a write keeps it", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(f.home, { recursive: true });
  await writeFile(join(f.home, "settings.json"), `{"v":1,"enabled":false}\n`);
  assert.equal(f.json("get", "enabled").value, false);
  f.json("set", "memory.mode", "sync", "--scope", "everywhere");
  assert.deepEqual(await f.homeFile("settings.json"), { v: 1, enabled: false, memory: { mode: "sync" } });
});

test("outside a Git repository a folder write still works, keyed by its folder", async (t) => {
  const f = await fixture({ git: false });
  t.after(f.cleanup);
  f.json("set", "enabled", "off", "--scope", "folder");
  assert.deepEqual(await f.homeFile("folders.json"), { [f.root]: { enabled: false } });
});

test("a folder inside the repository reads and writes its repository's settings", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const sub = join(f.root, "src", "deep");
  await mkdir(sub, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [scriptPath, "set", "enabled", "off", "--scope", "folder", "--root", sub, "--json"],
    {
      env: f.env,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await f.homeFile("folders.json"), { [f.root]: { enabled: false } });
});

test("a fresh home with no settings runs with the defaults and gets the first-session line once", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const { renderRuntimeContext } = await import(runtimeContextPath);
  const env = { ...f.env, FREEFLOW_HOME: f.home };
  const first = renderRuntimeContext(f.root, undefined, { env, harness: "claude-code" });
  assert.match(first, /Freeflow is installed and on in every folder/);
  assert.match(first, /Freeflow: active/);
  assert.match(first, /plugin-docs\/using-freeflow\.md/);
  assert.deepEqual(await f.homeFile("first-session.json").then((value) => Object.keys(value)), ["at"]);
  const second = renderRuntimeContext(f.root, undefined, { env, harness: "claude-code" });
  assert.doesNotMatch(second, /Freeflow is installed and on in every folder/);
  assert.match(second, /Freeflow: active/);
  assert.equal(existsSync(join(f.root, ".freeflow")), false, "no file is needed in the repository");
});

test("off sends nothing and writes nothing: no text, no first-session marker, no settings file in the repository", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const { renderRuntimeContext } = await import(runtimeContextPath);
  const set = f.run("set", "enabled", "off", "--scope", "everywhere");
  assert.equal(set.status, 0, set.stderr);
  const env = { ...f.env, FREEFLOW_HOME: f.home };
  assert.equal(renderRuntimeContext(f.root, undefined, { env, harness: "claude-code" }), "");
  assert.equal(renderRuntimeContext(f.root, "core", { env, harness: "codex" }), "");
  assert.equal(existsSync(join(f.home, "first-session.json")), false, "off writes no marker");
  assert.equal(existsSync(join(f.root, ".freeflow")), false);
});

test("off for one harness names the harness's own command to disable the plugin, and Freeflow never disables itself", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.json("set", "enabled", "off", "--scope", "everywhere", "--harness-only", "--harness", "claude-code");
  const listed = spawnSync(
    process.execPath,
    [scriptPath, "list", "--view", "normal", "--harness", "claude-code", "--root", f.root],
    {
      env: f.env,
      encoding: "utf8",
    },
  );
  assert.match(
    listed.stdout,
    /Freeflow is off here\. Freeflow never disables its own plugin: to stop it on this harness, run claude plugin disable freeflow\./,
  );
  assert.equal(f.json("get", "enabled", "--harness", "codex").value, true, "Codex is not ticked");
});

test("the task memory setting and the compaction switch read and write in the home", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.json("set", "memory.mode", "off", "--scope", "folder");
  assert.equal(f.json("get", "memory.mode").value, "off");
  assert.equal(f.json("get", "memory.mode").displayed ?? "Off", "Off");
  f.json("set", "compaction.withoutTask", "off");
  assert.deepEqual(await f.homeFile("settings.json"), { compaction: { withoutTask: false } });
  assert.equal(f.json("list", "--view", "normal").settings.find((row) => row.key === "memory.mode").value, "off");
});

test("a Session file that holds a removed key names it with its reason, and doctor --fix removes it (D-058)", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.home, "sessions/s-1"), { recursive: true });
  await writeFile(
    join(f.home, "sessions/s-1/settings.json"),
    '{"gates.slice":"block","governor.cap":6,"delegation.claimHours":"8"}\n',
  );
  const result = f.run("doctor");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /gates\.slice: the Slice gate was removed from Freeflow/);
  assert.match(result.stdout, /governor\.cap: the cost cap was removed from Freeflow/);
  const fixed = f.run("doctor", "--fix");
  assert.equal(fixed.status, 0, fixed.stdout);
  assert.deepEqual(JSON.parse(await readFile(join(f.home, "sessions/s-1/settings.json"), "utf8")), {
    "delegation.claimHours": "8",
  });
});

test("a file holding a removed governor or gate key loads: the validators accept it, and the sanitizer names each key with its reason (D-058)", () => {
  const removed = {
    governor: { mode: "stop", cap: 6 },
    gates: { agreement: "block", slice: "warn", delivery: "block", delegation: "block" },
  };
  assert.equal(validateRepositoryConfig({ v: 1, ...removed }), null);
  assert.equal(validateLocalConfig({ v: 1, ...removed }), null);
  const shared = sanitizeConfigFile({ v: 1, ...removed }, "repository");
  assert.deepEqual(shared.config, { v: 1, gates: { delegation: "block" } });
  assert.deepEqual(shared.ignored.map((item) => item.key).sort(), [
    "gates.agreement",
    "gates.delivery",
    "gates.slice",
    "governor.cap",
    "governor.mode",
  ]);
  assert.equal(
    shared.ignored.find((item) => item.key === "governor.cap").reason,
    "the cost cap was removed from Freeflow",
  );
  const personal = sanitizeConfigFile({ v: 1, ...removed }, "personal");
  assert.deepEqual(personal.config, { v: 1, gates: { delegation: "block" } });
  assert.equal(personal.ignored.length, 5);
  // A key the removed section never had is unsupported, and a removed section that is not an object is named whole.
  assert.deepEqual(sanitizeConfigFile({ v: 1, governor: { foo: 1 } }, "repository").ignored, [
    { key: "governor.foo", reason: "unsupported key" },
  ]);
  assert.deepEqual(sanitizeConfigFile({ v: 1, governor: 5 }, "personal").ignored, [
    { key: "governor", reason: "governor was removed from Freeflow" },
  ]);
});
