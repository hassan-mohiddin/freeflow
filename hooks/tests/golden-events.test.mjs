import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import CONFORMANCE from "../claude/conformance.mjs";
import GOLDEN from "../claude/golden-events.mjs";
import { lineProblem } from "../../skills/track-work/scripts/lib/events5.mjs";

// The schema test for Claude Code's mod (SPEC-006 4.7): every line of its golden session, which freeflow.test.ts shows
// the mod sends, is schema v1, and Track Work's real writer takes them all, numbered and redacted. The mods test kit
// runs no process, so this half runs here.
test("every line the mod's golden session sends is schema v1, and the real events append writes them all", async () => {
  for (const line of GOLDEN) assert.equal(lineProblem(line), null, JSON.stringify(line));
  const home = await mkdtemp(join(tmpdir(), "freeflow-golden-"));
  try {
    const run = spawnSync(
      process.execPath,
      [resolve("skills/track-work/scripts/working-record.mjs"), "events", "append", "--input", "-", "--home", home],
      { input: GOLDEN.map((line) => JSON.stringify(line)).join("\n"), encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(run.stdout, /Refused/);
    const written = (await readFile(join(home, "events", "sess-1.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      written.map((line) => [line.seq, line.kind, line.agent]),
      GOLDEN.map((line, index) => [index + 1, line.kind, line.agent]),
    );
    assert.equal(written.find((line) => line.tool === "Bash").command, "npm test -- --token=[redacted]");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("each conformance test of the mod's yes claims exists in freeflow.test.ts (4.7)", async () => {
  const source = await readFile(resolve("hooks/claude/freeflow.test.ts"), "utf8");
  for (const [request, name] of Object.entries(CONFORMANCE))
    assert.ok(source.includes(`test(${JSON.stringify(name)}`), `${request}: freeflow.test.ts has the test ${name}`);
});
