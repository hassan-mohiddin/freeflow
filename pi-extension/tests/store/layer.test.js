import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { StoreLayer, sessionEnvironment, touchesStore } from "../../dist/store/layer.js";

/** A fake script: each command's answer, and the commands run, in order. */
function fake(answers) {
  const ran = [];
  const run = async (args) => {
    ran.push(args.slice(0, 2).join(" "));
    const answer = answers[args.slice(0, 2).join(" ")];
    const value = typeof answer === "function" ? answer(args) : answer;
    return { code: 0, stdout: "", stderr: "", ...value };
  };
  return { ran, run };
}
const status = (state) => ({ stdout: JSON.stringify(state) });

test("a command running Track Work's script, or a file tool on a path in the store, touches the store", () => {
  assert.equal(touchesStore("bash", { command: "node /p/working-record.mjs checkpoint --record x" }, "/w", "/s"), true);
  assert.equal(touchesStore("bash", { command: "npm test" }, "/w", "/s"), false);
  assert.equal(touchesStore("edit", { path: "/s/projects/p/tasks/t/record.md" }, "/w", "/s"), true);
  assert.equal(touchesStore("write", { path: "../s/rules/a.md" }, "/w", "/s"), true);
  assert.equal(touchesStore("edit", { path: "/s2/record.md" }, "/w", "/s"), false);
  assert.equal(touchesStore("read", { path: "/s/x" }, "/w", undefined), false);
});

test("the session's environment names the session, Pi, its file, the way back and the window, and clears what it lacks", () => {
  const names = [
    "FREEFLOW_SESSION",
    "FREEFLOW_HARNESS",
    "FREEFLOW_TRANSCRIPT",
    "FREEFLOW_RESUME",
    "FREEFLOW_CONTEXT_WINDOW",
  ];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    sessionEnvironment({ id: "abc", file: "/sessions/abc.jsonl", window: 200_000 });
    assert.deepEqual(
      names.map((name) => process.env[name]),
      ["abc", "Pi", "/sessions/abc.jsonl", "pi --session /sessions/abc.jsonl", "200000"],
    );
    sessionEnvironment({});
    assert.deepEqual(
      names.map((name) => process.env[name]),
      names.map(() => undefined),
    );
  } finally {
    for (const [name, value] of Object.entries(saved))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});

test("session start: the menu with the rules after a pull, or what is missing, or nothing", async () => {
  const withStore = fake({
    "session status": status({ home: "/s", store: true, session: "a", task: null, missing: [] }),
    "task here": { stdout: "Freeflow store at /s.\n\n## Rules\n\nPlain words.\n" },
  });
  const layer = new StoreLayer(withStore.run);
  assert.equal(await layer.start("/w", ["/w", "/"]), "Freeflow store at /s.\n\n## Rules\n\nPlain words.");
  assert.deepEqual(withStore.ran, ["session status", "store sync", "task here", "session status"]);

  const missing = fake({
    "session status": status({
      home: "/s",
      store: false,
      missing: [{ what: "no store at /s", fix: "store init", by: "agent" }],
    }),
  });
  assert.equal(
    await new StoreLayer(missing.run).start("/w", []),
    "The store is not ready.\n- Missing: no store at /s. Fix (the agent): store init.",
  );
  const none = fake({ "session status": status({ home: "/s", store: false, missing: [] }) });
  assert.equal(await new StoreLayer(none.run).start("/w", []), undefined);
});

test("a run that touched the store reads it again and syncs what changed; others run nothing", async () => {
  const script = fake({
    "session status": status({ home: "/s", store: true, session: "a", task: { id: "p/task-001" }, changed: true }),
  });
  const layer = new StoreLayer(script.run);
  await layer.refresh();
  layer.note("bash", { command: "npm test" }, "/w");
  assert.equal(await layer.runEnded(), undefined);
  assert.deepEqual(script.ran, ["session status"]);
  layer.note("edit", { path: "/s/projects/p/tasks/t/record.md" }, "/w");
  assert.equal((await layer.runEnded()).task.id, "p/task-001");
  assert.deepEqual(script.ran, ["session status", "session status", "store sync"]);
  assert.equal(layer.heldTask(), "p/task-001");
  await layer.shutdown();
  assert.equal(script.ran.at(-1), "task release");
});

test("answering a compaction request marks its file done", async () => {
  const folder = await mkdtemp(join(tmpdir(), "freeflow-store-layer-"));
  try {
    const path = join(folder, "compact.json");
    await writeFile(path, JSON.stringify({ requestedAt: "2026-10-30T10:00:00Z", done: false }));
    const layer = new StoreLayer(
      fake({
        "session status": status({
          home: folder,
          store: false,
          compact: { path, requestedAt: "2026-10-30T10:00:00Z", done: false },
        }),
      }).run,
    );
    await layer.refresh();
    await layer.answered();
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { requestedAt: "2026-10-30T10:00:00Z", done: true });
    assert.equal(layer.current().compact.done, true);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
