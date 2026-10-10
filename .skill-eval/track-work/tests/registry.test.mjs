import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import { Registry, RegistryError } from "../../../skills/track-work/scripts/lib/registry.mjs";

const fresh = async () => {
  const home = await mkdtemp(join(tmpdir(), "freeflow-home-"));
  const repo = await mkdtemp(join(tmpdir(), "freeflow-repo-"));
  return { home, repo, registry: new Registry(home) };
};
const owner = (session) => ({ session, since: "2026-10-11T00:00:00.000Z" });

test("projects, tasks and children are created through Track Work's init in the project store", async () => {
  const { home, repo, registry } = await fresh();
  const slug = await registry.createProject("Rust Rewrite", repo);
  assert.equal(slug, "rust-rewrite");
  assert.equal((await registry.projectFor(join(repo))).slug, "rust-rewrite");
  const parent = await registry.createTask(slug, "Compiler A", "Port compiler A to Rust.");
  assert.equal(parent.id, "rust-rewrite/task-001");
  assert.equal(parent.record, join(home, "projects", "rust-rewrite", "tasks", "task-001-compiler-a", "record.md"));
  assert.deepEqual(JSON.parse(await readFile(join(home, "projects", "rust-rewrite", "store.json"), "utf8")), {
    version: 1,
    project: "rust-rewrite",
  });
  const script = resolve("skills/track-work/scripts/working-record.mjs");
  // An absolute store path finds its own root: no --root, and the run is from an unrelated directory.
  assert.match(
    execFileSync(process.execPath, [script, "validate", "--record", parent.record], { cwd: tmpdir() }).toString(),
    /^valid/,
  );
  const child = await registry.createTask(slug, "Parser", "Port the parser.", parent.id);
  assert.equal(child.id, "rust-rewrite/task-002");
  assert.match(await readFile(child.record, "utf8"), /Child of rust-rewrite\/task-001/);
  assert.deepEqual(
    (await registry.children(parent.id)).map((entry) => entry.id),
    [child.id],
  );
  await assert.rejects(registry.createTask(slug, "Too deep", "No grandchildren.", child.id), /a child has no children/);
  await assert.rejects(registry.createProject("Other", repo), /already linked/);
});

test("one owner per record: a second session needs a takeover; release only by the owner", async () => {
  const { repo, registry } = await fresh();
  const slug = await registry.createProject("P", repo);
  const { id } = await registry.createTask(slug, "T", "Goal.");
  assert.deepEqual(await registry.own(id, owner("a"), false), { owned: true });
  const refused = await registry.own(id, owner("b"), false);
  assert.equal(refused.owned, false);
  assert.equal(refused.by.session, "a");
  await registry.release(id, "b");
  assert.equal((await registry.task(id)).owner.session, "a", "only the owner releases");
  assert.deepEqual(await registry.own(id, owner("b"), true), { owned: true });
  assert.equal((await registry.task(id)).owner.session, "b");
  await registry.release(id, "b");
  assert.equal((await registry.task(id)).owner, undefined);
});

test("a concurrent change is re-read and applied once more; a second conflict writes nothing", async () => {
  const { home, repo, registry } = await fresh();
  await registry.createProject("P", repo);
  const path = join(home, "registry.json");
  let calls = 0;
  await registry.update(async (data) => {
    calls++;
    if (calls === 1) {
      // Another session writes while this change is being prepared.
      const other = JSON.parse(await readFile(path, "utf8"));
      other.projects.other = { name: "Other", store: "/x", repos: [] };
      await writeFile(path, JSON.stringify(other));
    }
    data.projects.mine = { name: "Mine", store: "/y", repos: [] };
  });
  assert.equal(calls, 2);
  const after = JSON.parse(await readFile(path, "utf8"));
  assert.ok(after.projects.other && after.projects.mine, "neither change is lost");

  const before = await readFile(path, "utf8");
  let attempts = 0;
  await assert.rejects(
    registry.update(async () => {
      attempts++;
      await writeFile(path, before.replace('"Mine"', `"Mine ${attempts}"`));
    }),
    RegistryError,
  );
  assert.equal(attempts, 2);
  assert.match(await readFile(path, "utf8"), /"Mine 2"/, "the other session's write stands");
});

test("an unreadable registry is reported and left untouched", async () => {
  const { home, repo, registry } = await fresh();
  const path = join(home, "registry.json");
  await writeFile(path, "{not json");
  await assert.rejects(registry.read(), /not valid; it was left unchanged/);
  await assert.rejects(registry.createProject("P", repo), RegistryError);
  assert.equal(await readFile(path, "utf8"), "{not json");
});

test("import moves an unregistered record's task directory into the store", async () => {
  const { repo, registry } = await fresh();
  const slug = await registry.createProject("P", repo);
  await registry.createTask(slug, "Existing", "Already here.");
  const script = resolve("skills/track-work/scripts/working-record.mjs");
  const record = execFileSync(
    process.execPath,
    [script, "init", "--root", repo, "--name", "Old task", "--input", "-"],
    {
      input: "### Goal\n- Old work.\n\n### Next useful action\n- Continue.\n",
    },
  )
    .toString()
    .trim();
  const moved = await registry.importRecord("P", record);
  assert.equal(moved.id, "p/task-002");
  assert.match(moved.record, /task-002-old-task\/record\.md$/);
  await assert.rejects(stat(record), /ENOENT/);
  assert.match(await readFile(moved.record, "utf8"), /# Working Record: Old task/);
  assert.equal((await registry.task(moved.id)).title, "Old task");
});

const script = resolve("skills/track-work/scripts/working-record.mjs");
const cli = (home, args, input = "") =>
  execFileSync(process.execPath, [script, ...args], { env: { ...process.env, FREEFLOW_HOME: home }, input }).toString();

test("the CLI creates projects, tasks and children, accepts a task ID as --record, and searches a tree", async () => {
  const { home, repo } = await fresh();
  assert.match(cli(home, ["project", "new", "--name", "Rust Rewrite", "--cwd", repo]), /Project rust-rewrite created/);
  const [parentId] = cli(home, ["task", "create", "--title", "Compiler A", "--goal", "Port A.", "--cwd", repo]).split(
    "\n",
  );
  assert.equal(parentId, "rust-rewrite/task-001");
  const [childId] = cli(home, [
    "task",
    "create",
    "--title",
    "Parser",
    "--goal",
    "Port the parser NEEDLE.",
    "--parent",
    parentId,
  ]).split("\n");
  assert.equal(childId, "rust-rewrite/task-002");
  assert.match(
    cli(home, ["project", "show", "--cwd", repo]),
    /rust-rewrite\/task-002 — Parser .*child of rust-rewrite\/task-001/,
  );
  assert.match(cli(home, ["view", "resume", "--record", childId]), /^# Working Record: Parser/);
  assert.match(
    cli(
      home,
      ["decision", "add", "--record", parentId, "--title", "Use LLVM", "--input", "-"],
      "Decision:\n- LLVM.\nEstablished by:\n- User.\nRationale:\n- R.\nConsequences:\n- C.\nRevisit when:\n- Later.\n",
    ),
    /Added Decision: D-001/,
  );
  assert.match(
    cli(home, ["task", "search", "--query", "needle", "--id", parentId, "--scope", "tree"]),
    /rust-rewrite\/task-002 \| Goal \| - Port the parser NEEDLE\./,
  );
  assert.match(
    cli(home, ["task", "search", "--query", "llvm", "--project", "rust-rewrite"]),
    /rust-rewrite\/task-001 \| D-001 — Use LLVM \(active\)/,
  );
  assert.throws(
    () => cli(home, ["view", "resume", "--record", "rust-rewrite/task-099"]),
    /No task rust-rewrite\/task-099/,
  );
});

const gitRepo = async () => {
  const repo = await mkdtemp(join(tmpdir(), "freeflow-repo-"));
  execFileSync("git", ["-C", repo, "init", "-q"]);
  execFileSync("git", [
    "-C",
    repo,
    "-c",
    "user.email=t@example.com",
    "-c",
    "user.name=T",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "init",
  ]);
  return repo;
};

test("a task records where its work happens; here maps a directory back to its task, deepest first", async () => {
  const { home } = await fresh();
  const repo = await gitRepo();
  const registry = new Registry(home);
  const slug = await registry.createProject("P", repo);
  const outer = await registry.createTask(slug, "Outer", "Goal.", undefined, repo);
  const inner = await registry.createTask(slug, "Inner", "Goal.", undefined, join(repo, "pkg"));
  assert.deepEqual(
    (await registry.here(join(repo, "pkg", "src"))).map((entry) => entry.id),
    [inner.id, outer.id],
  );
  assert.deepEqual(await registry.here(tmpdir()), []);
  const env = await registry.environment(outer.id);
  assert.equal(env.primary, resolve(repo));
  assert.equal(env.worktree, false);
  assert.ok(env.branch, "branch read live from Git");
  await registry.setEnvironment(outer.id, { add: "/data", remove: "/none" });
  assert.deepEqual((await registry.environment(outer.id)).directories, ["/data"]);
  await registry.setEnvironment(outer.id, { remove: "/data" });
  assert.deepEqual((await registry.environment(outer.id)).directories, []);
});

test("fanout creates the child, a worktree on its branch, and copies personal config; a failed worktree leaves the child registered", async () => {
  const { home } = await fresh();
  const repo = await gitRepo();
  const worktrees = await mkdtemp(join(tmpdir(), "freeflow-worktrees-"));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(repo, ".freeflow"), { recursive: true });
  await writeFile(join(repo, ".freeflow", "local.json"), '{"taskMemory":{"enabled":true}}');
  const registry = new Registry(home);
  const slug = await registry.createProject("Rust Rewrite", repo, worktrees);
  const parent = await registry.createTask(slug, "Compiler A", "Port A.", undefined, repo);
  const child = await registry.fanout(parent.id, "Parser", "Port the parser.");
  assert.equal(child.error, undefined);
  assert.equal(child.id, "rust-rewrite/task-002");
  const expected = join(worktrees, `${basename(repo)}-parser`);
  assert.equal(child.path, resolve(expected));
  assert.equal(child.branch, "rust-rewrite/task-002-parser");
  const env = await registry.environment(child.id);
  assert.equal(env.worktree, true);
  assert.equal(env.branch, "rust-rewrite/task-002-parser");
  assert.equal(await readFile(join(expected, ".freeflow", "local.json"), "utf8"), '{"taskMemory":{"enabled":true}}');
  assert.equal((await registry.task(child.id)).parent, parent.id);
  assert.deepEqual(
    (await registry.here(expected)).map((entry) => entry.id),
    [child.id],
  );

  const again = await registry.fanout(parent.id, "Parser", "Again.", { path: expected });
  assert.match(again.error, /registered, but its worktree was not created/);
  assert.equal((await registry.task(again.id)).environment, undefined);
});

test("paths typed with ~ mean the home directory; fan-out ends with a command to paste into a new terminal", async () => {
  const { homedir } = await import("node:os");
  const { directory, startCommand } = await import("../../../skills/track-work/scripts/lib/registry.mjs");
  assert.equal(directory("~/Worktrees"), join(homedir(), "Worktrees"));
  assert.equal(directory("~"), homedir());
  assert.equal(directory("/abs/path"), "/abs/path");
  const { home } = await fresh();
  const saved = process.env.FREEFLOW_HOME;
  process.env.FREEFLOW_HOME = home;
  try {
    assert.equal(startCommand("/w/it's here", "pi"), `cd '/w/it'\\''s here' && FREEFLOW_HOME='${home}' pi`);
    process.env.FREEFLOW_HOME = join(homedir(), ".freeflow");
    assert.equal(startCommand("/w/app-parser", "claude"), "cd '/w/app-parser' && claude");
    assert.equal(startCommand("/w/app-parser"), "cd '/w/app-parser'");
  } finally {
    if (saved === undefined) delete process.env.FREEFLOW_HOME;
    else process.env.FREEFLOW_HOME = saved;
  }

  const repo = await gitRepo();
  const worktrees = await mkdtemp(join(tmpdir(), "freeflow-worktrees-"));
  cli(home, ["project", "new", "--name", "App", "--cwd", repo, "--worktrees", worktrees]);
  const [parentId] = cli(home, ["task", "create", "--title", "Core", "--goal", "Core.", "--cwd", repo]).split(/\s/);
  const out = cli(home, ["task", "fanout", "--parent", parentId, "--title", "Parser", "--goal", "P.", "--agent", "pi"]);
  assert.match(
    out,
    new RegExp(
      `Next: open a new terminal and run:\\n  cd '${join(worktrees, `${basename(repo)}-parser`)}' && FREEFLOW_HOME='${home}' pi\\n`,
    ),
  );
  assert.match(cli(home, ["project", "list"]), /- App \(app\): 2 task\(s\); repositories /);
  assert.match(cli(home, ["project", "show", "--name", "App"]), /Project App \(app\)[\s\S]*app\/task-002 — Parser/);
});
