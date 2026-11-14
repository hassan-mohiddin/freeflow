import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { SETTINGS } from "../../../pi-extension/dist/host/config-validation.js";

const scriptPath = resolve("skills/setup-freeflow/scripts/settings.mjs");
const baseEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  CLAUDE_CODE_SESSION_ID: "",
  FREEFLOW_SESSION: "",
};

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
  const file = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  return { dir, root, home, env, run, json, file, cleanup };
}

/** A value other than the default that the key takes, as typed on the command line, and as stored. */
function otherValue(spec) {
  if (spec.values === "boolean") return spec.default === false ? ["on", true] : ["off", false];
  if (spec.values === "number") return ["12.5", 12.5];
  const value = spec.values.find((each) => each !== spec.default);
  return [String(value), value];
}

const settable = SETTINGS;

test("list with nothing set shows every setting all hosts and Claude Code act on at its default, and names the Pi-only ones", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const listed = f.json("list");
  assert.deepEqual(
    listed.settings.map((row) => row.key),
    SETTINGS.filter((spec) => spec.hosts !== "pi").map((spec) => spec.key),
  );
  for (const row of listed.settings) assert.equal(row.scope, "default", row.key);
  assert.deepEqual(listed.state, []);
  const text = f.run("list");
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /delegation\.claimHours\s+4\s+default/);
  assert.match(text.stdout, /governor\.cap\s+none\s+default/);
  // Review has no settings: when a review runs is in the review rules (Review Work), not here.
  assert.doesNotMatch(text.stdout, /review\./);
  assert.match(text.stdout, /Pi-only settings are not listed \(--host pi lists them\)/);
  assert.deepEqual(
    f.json("list", "--host", "pi").settings.map((row) => row.key),
    SETTINGS.filter((spec) => spec.hosts !== "claude-code").map((spec) => spec.key),
  );
  // Claude Code's mod lists its own pane and status line beside what every host acts on (SPEC-015).
  assert.deepEqual(
    f.json("list", "--host", "claude-code").settings.map((row) => row.key),
    SETTINGS.filter((spec) => spec.hosts !== "pi").map((spec) => spec.key),
  );
  assert.ok(SETTINGS.some((spec) => spec.key === "pane.enabled" && spec.hosts === "claude-code"));
});

test("every settable key can be set, read back and unset in each of its scopes", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  for (const spec of settable) {
    const [typed, stored] = otherValue(spec);
    const scopes = ["repository", "personal", ...(spec.session ? ["session"] : [])];
    for (const scope of scopes) {
      const set = f.json("set", spec.key, typed, "--scope", scope);
      assert.equal(set.value, stored, `${spec.key} in ${scope}`);
      assert.equal(set.scope, scope, `${spec.key} in ${scope}`);
      assert.deepEqual(f.json("get", spec.key), {
        key: spec.key,
        label: spec.label,
        value: stored,
        scope,
        hosts: spec.hosts,
      });
      const unset = f.json("unset", spec.key, "--scope", scope);
      assert.equal(unset.scope, "default", `${spec.key} unset from ${scope}`);
      assert.equal(unset.value, spec.default, `${spec.key} unset from ${scope}`);
    }
  }
  assert.equal(existsSync(join(f.root, ".freeflow/local.json")), false, "an emptied personal file is removed");
  assert.equal(existsSync(join(f.home, "sessions/s-1/settings.json")), false, "an emptied session file is removed");
});

test("inherit unsets a key in that scope", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.json("set", "delegation.claimHours", "24", "--scope", "personal");
  const result = f.json("set", "delegation.claimHours", "inherit", "--scope", "personal");
  assert.equal(result.scope, "default");
  assert.equal(result.value, "4");
});

test("a repository write drops a value equal to its default; a personal write keeps it and overrides the repository", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.json("set", "delegation.claimHours", "8", "--scope", "repository");
  assert.deepEqual(await f.file(".freeflow/config.json"), { delegation: { claimHours: "8" } });
  f.json("set", "delegation.claimHours", "4", "--scope", "personal");
  assert.deepEqual(await f.file(".freeflow/local.json"), { delegation: { claimHours: "4" } });
  assert.deepEqual(f.json("get", "delegation.claimHours"), {
    key: "delegation.claimHours",
    label: "Claim hours",
    value: "4",
    scope: "personal",
    hosts: "all",
  });
  f.json("set", "delegation.claimHours", "4", "--scope", "repository");
  assert.deepEqual(await f.file(".freeflow/config.json"), {}, "the repository's default value is pruned");
});

test("a personal write adds .freeflow/local.json to Git's exclude first", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.json("set", "enabled", "off", "--scope", "personal");
  const exclude = await readFile(join(f.root, ".git/info/exclude"), "utf8");
  assert.ok(exclude.split("\n").includes(".freeflow/local.json"));
  const status = execFileSync("git", ["-C", f.root, "status", "--porcelain", "--untracked-files=all"], {
    env: baseEnv,
    encoding: "utf8",
  });
  assert.equal(status.includes("local.json"), false);
});

test("a Session value wins over the files, lives in the Freeflow home and is gone in another session", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.json("set", "delegation.claimHours", "8", "--scope", "repository");
  f.json("set", "delegation.claimHours", "24", "--scope", "session");
  assert.deepEqual(JSON.parse(await readFile(join(f.home, "sessions/s-1/settings.json"), "utf8")), {
    "delegation.claimHours": "24",
  });
  assert.equal(f.json("get", "delegation.claimHours").scope, "session");
  const other = spawnSync(process.execPath, [scriptPath, "get", "delegation.claimHours", "--root", f.root, "--json"], {
    env: { ...f.env, FREEFLOW_SESSION: "s-2" },
    encoding: "utf8",
  });
  assert.equal(JSON.parse(other.stdout).scope, "repository");
  const claude = spawnSync(process.execPath, [scriptPath, "get", "delegation.claimHours", "--root", f.root, "--json"], {
    env: { ...f.env, FREEFLOW_SESSION: "", CLAUDE_CODE_SESSION_ID: "s-1" },
    encoding: "utf8",
  });
  assert.equal(JSON.parse(claude.stdout).scope, "session", "Claude Code's session ID names the same session");
});

test("a change prints the Runtime State lines it changed, and the prompt note for a prompt", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const skill = f.run("set", "skills.research-work", "off", "--scope", "personal");
  assert.equal(skill.status, 0, skill.stderr);
  assert.match(skill.stdout, /^skills\.research-work: off \(Personal, \.freeflow\/local\.json\)$/m);
  assert.match(skill.stdout, /^Runtime State: Skills off: `research-work`; do not open or follow them\.$/m);
  const other = f.run("set", "skills.write-docs", "off", "--scope", "personal");
  assert.equal(other.status, 0, other.stderr);
  assert.match(
    other.stdout,
    /^Runtime State: Skills off: `research-work`, `write-docs`; do not open or follow them\.$/m,
  );
  assert.deepEqual(await f.file(".freeflow/local.json"), {
    skills: { "research-work": false, "write-docs": false },
  });
  f.json("unset", "skills.write-docs", "--scope", "personal");
  const cleared = f.json("unset", "skills.research-work", "--scope", "personal");
  assert.equal(cleared.changed.length, 0);
  assert.equal(cleared.cleared.length, 1);
  const prompt = f.run("set", "prompts.core", "off", "--scope", "personal");
  assert.match(prompt.stdout, /Prompt text already given in this session stays/);
  const pi = f.run("set", "compaction.enabled", "off", "--scope", "personal");
  assert.match(pi.stdout, /Only Pi acts on this setting\./);
  const governor = f.run("set", "governor.mode", "stop", "--scope", "personal");
  assert.match(governor.stdout, /Only Claude Code's mod acts on this setting\./);
});

test("refusals name what is wrong and write nothing", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const cases = [
    [["get", "review.mode"], /unknown setting review\.mode/],
    [["set", "review.unit", "push", "--scope", "personal"], /unknown setting review\.unit/],
    [["set", "review.rounds", "1", "--scope", "personal"], /unknown setting review\.rounds/],
    [["set", "review.model", "opus", "--scope", "session"], /unknown setting review\.model/],
    [["set", "review.depth", "deep", "--scope", "repository"], /unknown setting review\.depth/],
    [
      ["set", "delegation.claimHours", "3", "--scope", "personal"],
      /delegation\.claimHours takes 1, 2, 4, 8, 24, not 3/,
    ],
    [["set", "enabled", "maybe", "--scope", "personal"], /enabled takes on or off, not maybe/],
    [["set", "delegation.claimHours", "8"], /set needs --scope/],
    [["set", "delegation.claimHours", "8", "--scope", "global"], /--scope must be repository, personal or session/],
    [["set", "governor.cap", "0", "--scope", "personal"], /governor\.cap takes a number above 0, not 0/],
    [["set", "governor.cap", "lots", "--scope", "personal"], /governor\.cap takes a number above 0, not lots/],
  ];
  for (const [args, message] of cases) {
    const result = f.run(...args);
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, message, args.join(" "));
  }
  assert.equal(existsSync(join(f.root, ".freeflow")), false);
});

test("the Session scope is refused without a session ID", async (t) => {
  const f = await fixture({ session: null });
  t.after(f.cleanup);
  const result = f.run("set", "delegation.claimHours", "8", "--scope", "session");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the Session scope needs a host that names its session/);
});

test("an ignored setting is named by list, and stops writes to its file until doctor fixes it", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  await writeFile(join(f.root, ".freeflow/config.json"), `{"delegation":{"claimHours":"3"}}\n`);
  const list = f.run("list");
  assert.equal(list.status, 0, list.stderr);
  assert.match(
    list.stdout,
    /Settings ignored: \.freeflow\/config\.json delegation\.claimHours: delegation\.claimHours must be one of/,
  );
  // The ignored value is not used: the default is.
  assert.equal(f.json("get", "delegation.claimHours").value, "4");
  const write = f.run("set", "delegation.claimHours", "8", "--scope", "repository");
  assert.equal(write.status, 1);
  assert.match(write.stderr, /has settings Freeflow ignores; run settings\.mjs doctor/);
  assert.deepEqual(await f.file(".freeflow/config.json"), { delegation: { claimHours: "3" } });
  // The personal file is its own: a write there is not held up by the repository's ignored value.
  f.json("set", "delegation.claimHours", "8", "--scope", "personal");
  assert.deepEqual(await f.file(".freeflow/local.json"), { delegation: { claimHours: "8" } });
});

test("a config file holding the removed review settings loads with them ignored, and doctor names each and removes it", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  const shared = `{"review":{"mode":"auto","unit":"push","depth":{"default":"deep"}},"delegation":{"claimHours":"8"}}\n`;
  await writeFile(join(f.root, ".freeflow/config.json"), shared);
  // The file loads: the rest of it is in force, and each review key is named as ignored.
  const listed = f.json("list");
  assert.equal(listed.settings.find((row) => row.key === "delegation.claimHours").value, "8");
  assert.deepEqual(
    listed.ignored.map((item) => item.key),
    ["review.mode", "review.unit", "review.depth"],
  );
  assert.match(listed.ignored[0].reason, /^removed: review has no settings \(a "Review at:" line/);
  const doctor = f.run("doctor");
  assert.equal(doctor.status, 1, doctor.stderr);
  assert.match(doctor.stdout, /\.freeflow\/config\.json \(Repository\): 3 problems\./);
  assert.match(
    doctor.stdout,
    /review\.mode: removed: review has no settings[^\n]*\n\s+- review\.mode: "auto"\n\s+\+ \(removed/,
  );
  assert.equal(await readFile(join(f.root, ".freeflow/config.json"), "utf8"), shared);
  const fixed = f.run("doctor", "--fix", "--scope", "repository");
  assert.equal(fixed.status, 0, fixed.stdout);
  assert.deepEqual(await f.file(".freeflow/config.json"), { delegation: { claimHours: "8" } });
});

test("doctor names each problem with its fix, and changes nothing without --fix", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  const shared = `{"toolExecution":{"bogus":true},"cognitiveRouting":{"enabled":true},"review":{"mode":"off"},"delegation":{"claimHours":"3"},"foo":1}\n`;
  await writeFile(join(f.root, ".freeflow/config.json"), shared);
  const result = f.run("doctor");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /\.freeflow\/config\.json \(Repository\): 5 problems\./);
  assert.match(result.stdout, /- review\.mode: "off"\n\s+\+ \(removed/);
  assert.match(result.stdout, /- cognitiveRouting: \{"enabled":true\}\n\s+\+ \(removed/);
  assert.match(result.stdout, /doctor --fix/);
  assert.equal(await readFile(join(f.root, ".freeflow/config.json"), "utf8"), shared);
});

test("doctor --fix writes Personal and Session, the Repository only with --scope repository, and a fixed folder reads clean", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  const shared = `{"cognitiveRouting":{"enabled":true},"review":{"mode":"off"}}\n`;
  await writeFile(join(f.root, ".freeflow/config.json"), shared);
  await writeFile(
    join(f.root, ".freeflow/local.json"),
    `{"review":{"mode":"always"},"skills":{"nope":true},"delegation":{"claimHours":"8"}}\n`,
  );
  await mkdir(join(f.home, "sessions", "s-1"), { recursive: true });
  await writeFile(
    join(f.home, "sessions", "s-1", "settings.json"),
    `{"review.depth":"quick","review.model":"opus","delegation.claimHours":"24"}\n`,
  );
  // A removed key in the Session scope gets the removed key's reason, as in the files, not "unknown setting".
  const named = f.run("doctor");
  assert.match(named.stdout, /\n {2}review\.depth: removed: review has no settings \(a "Review at:" line/);
  assert.match(named.stdout, /\n {2}review\.model: removed: review has no settings/);
  assert.doesNotMatch(named.stdout, /review\.\w+: unknown setting/);
  // Without --scope the shared file is refused: named, and not written.
  const partial = f.run("doctor", "--fix");
  assert.equal(partial.status, 1);
  assert.match(partial.stdout, /not written: the repository file is shared/);
  assert.equal(await readFile(join(f.root, ".freeflow/config.json"), "utf8"), shared);
  assert.deepEqual(await f.file(".freeflow/local.json"), { delegation: { claimHours: "8" } });
  assert.deepEqual(JSON.parse(await readFile(join(f.home, "sessions", "s-1", "settings.json"), "utf8")), {
    "delegation.claimHours": "24",
  });
  // With --scope repository the shared file is written, and the whole folder then reads clean.
  const shared1 = f.run("doctor", "--fix", "--scope", "repository");
  assert.equal(shared1.status, 0, shared1.stdout);
  assert.deepEqual(await f.file(".freeflow/config.json"), {});
  const clean = f.run("doctor");
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /Nothing to fix\./);
});

test("doctor leaves a file that is not JSON as it is, and a missing file has nothing to fix", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  await writeFile(join(f.root, ".freeflow/config.json"), "{ not json\n");
  const result = f.run("doctor", "--fix", "--scope", "repository");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not JSON .*not rewritten: fix it by hand/);
  assert.equal(await readFile(join(f.root, ".freeflow/config.json"), "utf8"), "{ not json\n");
  const all = f.run("doctor");
  assert.match(all.stdout, /\.freeflow\/local\.json \(Personal\): no file; nothing to fix\./);
});

test("a personal file Git tracks is refused", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  await writeFile(join(f.root, ".freeflow/local.json"), "{}\n");
  execFileSync("git", ["-C", f.root, "add", "-f", ".freeflow/local.json"], { env: baseEnv });
  const result = f.run("set", "delegation.claimHours", "8", "--scope", "personal");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /local\.json is tracked by git/);
});

test("a file with v: 1 is read, and a write keeps it", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  await writeFile(join(f.root, ".freeflow/config.json"), `{"v":1,"delegation":{"claimHours":"8"}}\n`);
  assert.equal(f.json("get", "delegation.claimHours").value, "8");
  f.json("set", "enabled", "off", "--scope", "repository");
  assert.deepEqual(await f.file(".freeflow/config.json"), { v: 1, delegation: { claimHours: "8" }, enabled: false });
});

test("outside a Git repository a personal write still works", async (t) => {
  const f = await fixture({ git: false });
  t.after(f.cleanup);
  f.json("set", "delegation.claimHours", "8", "--scope", "personal");
  assert.deepEqual(await f.file(".freeflow/local.json"), { delegation: { claimHours: "8" } });
});

test("a folder inside the repository reads and writes the repository's settings", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, "src", "deep"), { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "set",
      "delegation.claimHours",
      "8",
      "--scope",
      "repository",
      "--root",
      join(f.root, "src", "deep"),
      "--json",
    ],
    { env: f.env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await f.file(".freeflow/config.json"), { delegation: { claimHours: "8" } });
  assert.equal(f.json("list").root, f.root);
});
