import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  persistedBranchMatches,
  persistedLastEntryMatches,
  trustLoadedSession,
} from "../../dist/host/read-only-session.js";

const user = (text) => ({ role: "user", content: [{ type: "text", text }], timestamp: 1 });
const assistant = (text) => ({
  role: "assistant",
  content: [{ type: "text", text }],
  api: "openai-responses",
  provider: "openai",
  model: "fixture",
  usage: {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: "stop",
  timestamp: 2,
});
async function persisted() {
  const root = await mkdtemp(join(tmpdir(), "ff-persisted-"));
  const created = SessionManager.create(root, root);
  created.appendMessage(user("one"));
  created.appendMessage(assistant("one"));
  const file = created.getSessionFile();
  return { root, file, manager: SessionManager.open(file) };
}
const matches = (manager) => persistedBranchMatches(manager, manager.getLeafId(), manager.getBranch());

test("one newly appended native anchor is verified from the bounded file tail", async () => {
  const { root, file, manager } = await persisted();
  try {
    const id = manager.appendCustomEntry("fixture-anchor", { occurrenceId: "occurrence:one" });
    const entry = manager.getEntry(id);
    assert.equal(await persistedLastEntryMatches(file, entry), true);
    const bytes = await readFile(file);
    await writeFile(file, bytes.subarray(0, bytes.length - 1));
    assert.equal(await persistedLastEntryMatches(file, entry), false, "memory alone cannot acknowledge a lost tail");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a trusted load verifies later appends from the file tail only", async () => {
  const { root, file, manager } = await persisted();
  try {
    trustLoadedSession(manager);
    // The trusted prefix is not re-read: an in-place prefix edit of equal length goes unnoticed by design.
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace('"one"', '"eno"'));
    manager.appendMessage(user("two"));
    manager.appendCustomEntry("fixture", { n: 1 });
    assert.equal(await matches(manager), true);
    manager.appendMessage(assistant("two"));
    assert.equal(await matches(manager), true, "verification advances with each accepted tail");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an active-branch entry that differs on disk falls back to the full comparison and fails", async () => {
  const { root, file, manager } = await persisted();
  try {
    trustLoadedSession(manager);
    manager.appendMessage(user("two"));
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace('"two"', '"owt"'));
    assert.equal(await matches(manager), false);
    await writeFile(file, text);
    assert.equal(await matches(manager), true, "the full comparison re-establishes the trust point");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("without a trust point the full comparison still decides", async () => {
  const { root, manager } = await persisted();
  try {
    manager.appendMessage(user("two"));
    assert.equal(await matches(manager), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a branch-only match does not trust an entry Pi holds on another branch but never wrote", async () => {
  const { root, manager } = await persisted();
  try {
    trustLoadedSession(manager);
    const parent = manager.getLeafId();
    // An entry Pi holds in memory but the file lacks (a failed or skipped write), on its own branch.
    manager.persist = false;
    const unwritten = manager.appendCustomEntry("test-unpersisted", { lost: true });
    manager.persist = true;
    manager.branch(parent);
    manager.appendMessage(user("two"));
    assert.equal(await matches(manager), true, "the live branch is on disk");
    manager.branch(unwritten);
    // No trust point survives the branch-only match, so the full comparison runs and cannot find the entry's
    // ancestry on disk: routing blocks instead of trusting it.
    await assert.rejects(matches(manager), { code: "ancestry_unavailable" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
