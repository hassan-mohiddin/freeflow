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
  if (spec.values === "name") return ["claude-haiku-5-5", "claude-haiku-5-5"];
  const value = spec.values.find((each) => each !== spec.default);
  return [value, value];
}

const settable = SETTINGS.filter((spec) => spec.values !== "profile");

test("list with nothing set shows every setting all hosts act on at its default, and names the Pi-only ones", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const listed = f.json("list");
  assert.deepEqual(
    listed.settings.map((row) => row.key),
    SETTINGS.filter((spec) => spec.hosts === "all").map((spec) => spec.key),
  );
  for (const row of listed.settings) assert.equal(row.scope, "default", row.key);
  assert.deepEqual(listed.state, []);
  const text = f.run("list");
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /review\.mode\s+auto\s+default/);
  assert.match(text.stdout, /Pi-only settings are not listed \(--host pi lists them\)/);
  assert.deepEqual(
    f.json("list", "--host", "pi").settings.map((row) => row.key),
    SETTINGS.map((spec) => spec.key),
  );
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
  f.json("set", "review.mode", "always", "--scope", "personal");
  const result = f.json("set", "review.mode", "inherit", "--scope", "personal");
  assert.equal(result.scope, "default");
  assert.equal(result.value, "auto");
});

test("a repository write drops a value equal to its default; a personal write keeps it and overrides the repository", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  f.json("set", "review.mode", "off", "--scope", "repository");
  assert.deepEqual(await f.file(".freeflow/config.json"), { review: { mode: "off" } });
  f.json("set", "review.mode", "auto", "--scope", "personal");
  assert.deepEqual(await f.file(".freeflow/local.json"), { review: { mode: "auto" } });
  assert.deepEqual(f.json("get", "review.mode"), {
    key: "review.mode",
    label: "Review",
    value: "auto",
    scope: "personal",
    hosts: "all",
  });
  f.json("set", "review.mode", "auto", "--scope", "repository");
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
  f.json("set", "review.mode", "off", "--scope", "repository");
  f.json("set", "review.mode", "always", "--scope", "session");
  assert.deepEqual(JSON.parse(await readFile(join(f.home, "sessions/s-1/settings.json"), "utf8")), {
    "review.mode": "always",
  });
  assert.equal(f.json("get", "review.mode").scope, "session");
  const other = spawnSync(process.execPath, [scriptPath, "get", "review.mode", "--root", f.root, "--json"], {
    env: { ...f.env, FREEFLOW_SESSION: "s-2" },
    encoding: "utf8",
  });
  assert.equal(JSON.parse(other.stdout).scope, "repository");
  const claude = spawnSync(process.execPath, [scriptPath, "get", "review.mode", "--root", f.root, "--json"], {
    env: { ...f.env, FREEFLOW_SESSION: "", CLAUDE_CODE_SESSION_ID: "s-1" },
    encoding: "utf8",
  });
  assert.equal(JSON.parse(claude.stdout).scope, "session", "Claude Code's session ID names the same session");
});

test("a change prints the Runtime State lines it changed, and the prompt note for a prompt", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const review = f.run("set", "review.mode", "always", "--scope", "personal");
  assert.equal(review.status, 0, review.stderr);
  assert.match(review.stdout, /^review\.mode: always \(Personal, \.freeflow\/local\.json\)$/m);
  assert.match(review.stdout, /^Runtime State: Review: `always`/m);
  const cleared = f.json("unset", "review.mode", "--scope", "personal");
  assert.equal(cleared.changed.length, 0);
  assert.equal(cleared.cleared.length, 1);
  const prompt = f.run("set", "prompts.core", "off", "--scope", "personal");
  assert.match(prompt.stdout, /Prompt text already given in this session stays/);
  const pi = f.run("set", "compaction.enabled", "off", "--scope", "personal");
  assert.match(pi.stdout, /Only Pi acts on this setting\./);
});

test("refusals name what is wrong and write nothing", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const cases = [
    [["get", "review.depth"], /unknown setting review\.depth/],
    [["set", "review.mode", "sometimes", "--scope", "personal"], /review\.mode takes auto, off, always, not sometimes/],
    [["set", "enabled", "maybe", "--scope", "personal"], /enabled takes on or off, not maybe/],
    [["set", "review.mode", "always"], /set needs --scope/],
    [["set", "review.mode", "always", "--scope", "global"], /--scope must be repository, personal or session/],
    [["set", SETTINGS.find((spec) => spec.values === "profile").key, "x", "--scope", "personal"], /routing profile/],
    [["set", "cognitiveRouting.delegation", "off", "--scope", "session"], /has no Session scope here/],
    [["set", "review.model", "two\nlines", "--scope", "personal"], /review\.model takes a name on one line/],
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
  const result = f.run("set", "review.mode", "always", "--scope", "session");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the Session scope needs a host that names its session/);
});

test("an invalid file stops every write and is named by list and get", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  await writeFile(join(f.root, ".freeflow/config.json"), `{"review":{"mode":"sometimes"}}\n`);
  for (const args of [["list"], ["get", "review.mode"]]) {
    const result = f.run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.freeflow\/config\.json is invalid/);
  }
  const write = f.run("set", "review.mode", "always", "--scope", "personal");
  assert.equal(write.status, 1);
  assert.match(write.stderr, /fix it before changing a setting/);
  assert.equal(existsSync(join(f.root, ".freeflow/local.json")), false);
});

test("a personal file Git tracks is refused", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  await writeFile(join(f.root, ".freeflow/local.json"), "{}\n");
  execFileSync("git", ["-C", f.root, "add", "-f", ".freeflow/local.json"], { env: baseEnv });
  const result = f.run("set", "review.mode", "always", "--scope", "personal");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /local\.json is tracked by git/);
});

test("a file with v: 1 is read, and a write keeps it", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.root, ".freeflow"));
  await writeFile(join(f.root, ".freeflow/config.json"), `{"v":1,"review":{"mode":"off"}}\n`);
  assert.equal(f.json("get", "review.mode").value, "off");
  f.json("set", "enabled", "off", "--scope", "repository");
  assert.deepEqual(await f.file(".freeflow/config.json"), { v: 1, review: { mode: "off" }, enabled: false });
});

test("outside a Git repository a personal write still works", async (t) => {
  const f = await fixture({ git: false });
  t.after(f.cleanup);
  f.json("set", "review.mode", "always", "--scope", "personal");
  assert.deepEqual(await f.file(".freeflow/local.json"), { review: { mode: "always" } });
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
      "review.mode",
      "always",
      "--scope",
      "repository",
      "--root",
      join(f.root, "src", "deep"),
      "--json",
    ],
    { env: f.env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await f.file(".freeflow/config.json"), { review: { mode: "always" } });
  assert.equal(f.json("list").root, f.root);
});
