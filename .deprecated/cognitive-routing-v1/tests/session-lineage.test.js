import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sessionLineageFor } from "../../dist/cognitive-routing/session-lineage.js";

async function writeHeader(path, header) {
  await writeFile(path, `${JSON.stringify(header)}\n`);
}

function context(sessionId, header) {
  return { sessionManager: { getSessionId: () => sessionId, getHeader: () => header } };
}

test("resolves nested fork lineage from bounded parent headers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "freeflow-session-lineage-"));
  try {
    const grandparent = join(dir, "grandparent.jsonl");
    const parent = join(dir, "parent.jsonl");
    await writeHeader(grandparent, { type: "session", id: "grandparent" });
    await writeHeader(parent, { type: "session", id: "parent", parentSession: grandparent });
    const lineage = sessionLineageFor(context("child", { type: "session", id: "child", parentSession: parent }));
    assert.equal(lineage?.available, true);
    assert.deepEqual([...lineage.inheritedSessionIds], ["parent", "grandparent"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bounds ancestor traversal while allowing exactly the supported depth", async () => {
  const dir = await mkdtemp(join(tmpdir(), "freeflow-session-lineage-depth-"));
  try {
    let parentPath;
    for (let index = 0; index < 64; index += 1) {
      const path = join(dir, `ancestor-${index}.jsonl`);
      await writeHeader(path, {
        type: "session",
        id: `ancestor-${index}`,
        ...(parentPath ? { parentSession: parentPath } : {}),
      });
      parentPath = path;
    }
    const exact = sessionLineageFor(context("child", { type: "session", id: "child", parentSession: parentPath }));
    assert.equal(exact?.available, true);
    assert.equal(exact?.inheritedSessionIds.size, 64);

    const overLimitPath = join(dir, "ancestor-over-limit.jsonl");
    await writeHeader(overLimitPath, { type: "session", id: "ancestor-over-limit", parentSession: parentPath });
    const overLimit = sessionLineageFor(
      context("over-limit-child", { type: "session", id: "over-limit-child", parentSession: overLimitPath }),
    );
    assert.equal(overLimit?.available, false);
    assert.deepEqual([...overLimit.inheritedSessionIds], []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects malformed and cyclic parent lineage without partial ancestors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "freeflow-session-lineage-invalid-"));
  try {
    const malformed = join(dir, "malformed.jsonl");
    await writeFile(malformed, `${JSON.stringify({ type: "session", id: "parent", parentSession: 42 })}\n`);
    const malformedLineage = sessionLineageFor(
      context("child", { type: "session", id: "child", parentSession: malformed }),
    );
    assert.equal(malformedLineage?.available, false);
    assert.deepEqual([...malformedLineage.inheritedSessionIds], []);

    const first = join(dir, "first.jsonl");
    const second = join(dir, "second.jsonl");
    await writeHeader(first, { type: "session", id: "first", parentSession: second });
    await writeHeader(second, { type: "session", id: "second", parentSession: first });
    const cyclicLineage = sessionLineageFor(context("child", { type: "session", id: "child", parentSession: first }));
    assert.equal(cyclicLineage?.available, false);
    assert.deepEqual([...cyclicLineage.inheritedSessionIds], []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
