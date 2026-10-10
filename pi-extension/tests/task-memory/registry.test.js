import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Registry, RegistryError } from "../../dist/task-memory/registry.js";

const packageRoot = process.cwd();
const fresh = async () => {
  const home = await mkdtemp(join(tmpdir(), "freeflow-home-"));
  const repo = await mkdtemp(join(tmpdir(), "freeflow-repo-"));
  return { home, repo, registry: new Registry(packageRoot, home) };
};
const owner = (session) => ({ session, since: "2026-10-11T00:00:00.000Z" });

test("projects, tasks and children are created through Track Work's init in the project store", async () => {
  const { home, repo, registry } = await fresh();
  const slug = await registry.createProject("Rust Rewrite", repo);
  assert.equal(slug, "rust-rewrite");
  assert.equal((await registry.projectFor(join(repo))).slug, "rust-rewrite");
  const parent = await registry.createTask(slug, "Compiler A", "Port compiler A to Rust.");
  assert.equal(parent.id, "rust-rewrite/task-001");
  assert.equal(
    parent.record,
    join(home, "projects", "rust-rewrite", ".freeflow", "tasks", "task-001-compiler-a", "record.md"),
  );
  const script = resolve("skills/track-work/scripts/working-record.mjs");
  assert.match(execFileSync(process.execPath, [script, "validate", "--record", parent.record]).toString(), /^valid/);
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
  const moved = await registry.importRecord(slug, record);
  assert.equal(moved.id, "p/task-002");
  assert.match(moved.record, /task-002-old-task\/record\.md$/);
  await assert.rejects(stat(record), /ENOENT/);
  assert.match(await readFile(moved.record, "utf8"), /# Working Record: Old task/);
  assert.equal((await registry.task(moved.id)).title, "Old task");
});
