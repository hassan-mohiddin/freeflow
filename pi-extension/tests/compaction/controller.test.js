import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CompactionController, RECOVERY_TYPE } from "../../dist/compaction/controller.js";
import { loadNotice } from "../../dist/compaction/thresholds.js";

// The rows come from notice5.mjs, which the controller reads as Freeflow's package loads it.
await loadNotice(fileURLToPath(new URL("../../..", import.meta.url)));

// The controller with a fake host: the store's state and bundle are given, the context is a number the test sets.
const WINDOW = 200_000;
const limits = { window: WINDOW, trigger: 183_616, notice: 163_616 };
const notice = (text) => `<freeflow-notice type="compaction">\n${text}\n</freeflow-notice>`;

function setup({ state, kept, bundle = { code: 0, stdout: "BUNDLE_TEXT\n", stderr: "" } } = {}) {
  let tokens = 0;
  const calls = { answered: 0, bundle: [], summarize: [] };
  // The store's copy of the cycle (cycle.json): what a reload reads back.
  const copies = { value: kept, writes: [] };
  let current = state;
  const branch = [];
  const ctx = { cwd: "/work", sessionManager: { getBranch: () => branch, getLeafId: () => String(branch.length) } };
  const controller = new CompactionController({
    effective: () => true,
    background: () => [],
    measure: () => ({ tokens, thresholds: limits }),
    kept: () => copies.value,
    keep: (_ctx, state) => {
      copies.value = { ...state };
      copies.writes.push({ ...state });
    },
    notice,
    summarize: async (preparation, instructions) => {
      calls.summarize.push(instructions);
      return { summary: "PI_SUMMARY", firstKeptEntryId: "kept", tokensBefore: 9, details: { readFiles: [] } };
    },
    store: {
      current: () => current,
      refresh: async () => current,
      runEnded: async () => current,
      bundle: async (options) => {
        calls.bundle.push(options);
        return options.fallback ? { code: 0, stdout: "FALLBACK_BUNDLE\n", stderr: "" } : bundle;
      },
      answered: async () => {
        calls.answered++;
      },
      command: () => "node /pkg/working-record.mjs",
    },
  });
  return {
    controller,
    ctx,
    branch,
    calls,
    copies,
    at: (value) => (tokens = value),
    set: (next) => (current = next),
  };
}

const task = (stateAsOf) => ({
  home: "/store",
  store: true,
  session: "s-1",
  task: { id: "freeflow/task-001", record: "/store/record.md", stateAsOf },
  compact: { path: "/store/compact.json", requestedAt: stateAsOf, done: false },
});

test("nothing before the notice point, then the cycle's one notice, naming the held task and the command", () => {
  const { controller, ctx, at } = setup({ state: task("2026-10-30T10:00:00Z") });
  at(90_000);
  assert.equal(controller.observe(ctx), undefined);
  at(105_000);
  assert.equal(controller.observe(ctx), undefined, "no row at 50%: the notice is the only signal");
  at(145_000);
  assert.equal(controller.observe(ctx), undefined, "no row at 70%");
  at(163_616);
  const once = controller.observe(ctx);
  assert.equal(once.level, "notice");
  assert.match(once.text, /Keep working until a safe point/);
  assert.match(once.text, /checkpoint freeflow\/task-001: bring its Current Context up to date/);
  assert.match(
    once.text,
    /run node \/pkg\/working-record\.mjs checkpoint --record freeflow\/task-001 --compact --input -/,
  );
  assert.match(once.text, /This is the only notice this context cycle/);
  assert.doesNotMatch(once.text, /compact_context|Compact now/);
  at(170_000);
  assert.equal(controller.observe(ctx), undefined, "no second notice and no repeat");
});
test("with no task the notice asks for the session summary", () => {
  const plain = setup({ state: { home: "/home", store: false, session: "s-1" } });
  plain.at(163_616);
  assert.match(plain.controller.observe(plain.ctx).text, /checkpoint --session --compact --input -/);
});

test("a run that ends with checkpoint --compact done compacts with the bundle, keeps nothing raw, and continues", async () => {
  const { controller, ctx, at, calls, set } = setup({ state: task("2020-01-01T00:00:00Z") });
  const end = { message: { role: "assistant", content: [{ type: "text", text: "Done." }], stopReason: "stop" } };
  // Checkpointed before this cycle's notice: not done, so nothing compacts.
  at(150_000);
  controller.observe(ctx);
  assert.equal(await controller.settle(end, ctx), undefined);
  // Checkpointed after the notice: done.
  set(task(new Date(Date.now() + 1000).toISOString()));
  const compacting = await controller.settle(end, ctx);
  assert.equal(compacting.continue, true);
  const [compaction, recovery] = compacting.entries;
  assert.equal(compaction.type, "compaction");
  assert.equal(compaction.firstKeptEntryId, null);
  assert.match(
    compaction.summary,
    /^BUNDLE_TEXT\n\n## Freeflow state at compaction\n\nThis compaction starts cycle 2\./,
  );
  assert.equal(compaction.details.freeflow.cycle, 2);
  assert.equal(compaction.details.freeflow.bundle, "task");
  assert.equal(recovery.customType, RECOVERY_TYPE);
  assert.match(
    recovery.content,
    /context cycle 2 starts here, and the conversation is now the bundle of freeflow\/task-001/,
  );
  assert.deepEqual(calls.bundle, [{}]);
  assert.equal(calls.answered, 1);
  assert.deepEqual(controller.takeCompacted(), { carriedFiles: [] });
  // A turn that failed compacts nothing.
  assert.equal(await controller.settle({ message: { ...end.message, stopReason: "error" } }, ctx), undefined);
});

test("a session summary's compaction removes the summary; a bundle that cannot be made is said, not installed", async () => {
  const folder = await mkdtemp(join(tmpdir(), "freeflow-compaction-summary-"));
  try {
    const path = join(folder, "summary.md");
    await writeFile(path, "# Session summary\n");
    const later = new Date(Date.now() + 1000).toISOString();
    const state = {
      home: folder,
      store: false,
      session: "s-1",
      summary: { path, asOf: later },
      compact: { path: join(folder, "compact.json"), requestedAt: later, done: false },
    };
    const end = { message: { role: "assistant", content: [], stopReason: "stop" } };
    const ok = setup({ state });
    const done = await ok.controller.settle(end, ok.ctx);
    assert.equal(done.entries[0].details.freeflow.bundle, "session");
    assert.match(done.entries[1].content, /the conversation is now the session summary's bundle/);
    assert.equal(existsSync(path), false);

    const broken = setup({
      state: task(later),
      bundle: { code: 1, stdout: "", stderr: "Error: record.md is not valid\n" },
    });
    const said = await broken.controller.settle(end, broken.ctx);
    assert.equal(said.entries.length, 1);
    assert.equal(said.entries[0].type, "custom_message");
    assert.match(said.entries[0].content, /could not make the bundle, so it did not compact: record\.md is not valid/);
    assert.equal(broken.calls.answered, 0, "the request waits");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("Pi's own compaction: the bundle once checkpointed, else Pi's summary with the record's time and the bundle after it", async () => {
  const event = { preparation: { firstKeptEntryId: "tail-1", tokensBefore: 120_000 }, signal: undefined };
  const later = new Date(Date.now() + 1000).toISOString();
  const done = setup({ state: task(later) });
  const own = (await done.controller.fallback(event, done.ctx)).compaction;
  assert.match(own.summary, /^BUNDLE_TEXT/);
  assert.equal(own.firstKeptEntryId, "tail-1", "Pi's kept tail stays");
  assert.equal(done.calls.summarize.length, 0, "no summarizer request");
  assert.equal(done.calls.answered, 1);

  const behind = setup({ state: task("2020-01-01T00:00:00Z") });
  const pi = (await behind.controller.fallback(event, behind.ctx)).compaction;
  assert.match(
    behind.calls.summarize[0],
    /holds the work up to its last checkpoint, 2020-01-01T00:00:00Z; keep in the summary what happened after that/,
  );
  assert.match(pi.summary, /^PI_SUMMARY\n\n## Freeflow state at compaction[\s\S]*\n\nFALLBACK_BUNDLE$/);
  assert.equal(pi.firstKeptEntryId, "kept");
  assert.equal(pi.details.freeflow.fallback, true);
  assert.deepEqual(behind.calls.bundle, [{ fallback: true }]);

  const none = setup({ state: { home: "/home", store: false, session: "s-1" } });
  const plain = (await none.controller.fallback(event, none.ctx)).compaction;
  assert.match(none.calls.summarize[0], /^Write state, not a story/);
  assert.doesNotMatch(plain.summary, /BUNDLE/);
});

test("a controller after a reload does not show the notice its cycle showed, read from the store's copy", () => {
  const first = setup({ state: task("2026-10-30T10:00:00Z") });
  first.at(163_616);
  assert.equal(first.controller.observe(first.ctx).level, "notice");
  assert.deepEqual([first.copies.value.cycle, typeof first.copies.value.notice], [1, "number"]);
  assert.equal(first.copies.value.row, undefined);
  // The reload: a new controller that reads the copy the first one kept.
  const reloaded = setup({ state: task("2026-10-30T10:00:00Z"), kept: first.copies.value });
  reloaded.at(170_000);
  assert.equal(reloaded.controller.observe(reloaded.ctx), undefined, "the notice is not sent again");
});
