import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BackgroundJobs, MAX_RUNNING } from "../../dist/tool-execution/background.js";

function jobs() {
  const sent = [];
  const host = { effective: () => true, shellPath: () => undefined, send: (...args) => sent.push(args) };
  return { jobs: new BackgroundJobs(host), sent };
}

test("the 17th running command is refused; session end stops all without notices", { timeout: 30000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-bg-"));
  const session = `test-${process.pid}-${Date.now()}`;
  const { jobs: background, sent } = jobs();
  try {
    const started = [];
    for (let i = 0; i < MAX_RUNNING; i++) started.push(await background.start("sleep 60", undefined, cwd, session));
    await assert.rejects(
      background.start("sleep 60", undefined, cwd, session),
      new Error("16 background commands are running. Stop one with stop_background, then retry."),
    );
    const folder = dirname(started[0].outputPath);
    assert.equal((await stat(folder)).mode & 0o777, 0o700);
    assert.equal((await stat(started[0].outputPath)).mode & 0o777, 0o600);
    await background.stopAll();
    assert.equal(background.running().length, 0);
    for (const { outputPath } of started)
      assert.equal(await readFile(outputPath, "utf8"), "[stopped at session end]\n");
    assert.deepEqual(sent, []);
    await assert.rejects(
      background.stop(started[0].id),
      /No background command bg\w+ in this session\. Running: none\./,
    );
  } finally {
    await background.stopAll();
    await rm(cwd, { recursive: true, force: true });
    await rm(join(tmpdir(), "freeflow", session), { recursive: true, force: true });
  }
});

test("an exited command reports its code, and stop names it as already exited", { timeout: 30000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-bg-"));
  const session = `test-${process.pid}-${Date.now()}`;
  const { jobs: background, sent } = jobs();
  try {
    const { id, outputPath } = await background.start("printf 'no newline'", "print", cwd, session);
    for (let i = 0; i < 200 && sent.length === 0; i++) await new Promise((r) => setTimeout(r, 25));
    assert.deepEqual(sent[0], [
      `[Freeflow notice, not from the user] Background command ${id} (print) completed. Output: ${outputPath}.`,
      { id, status: "completed", exitCode: 0, outputPath },
      true,
    ]);
    assert.equal(await readFile(outputPath, "utf8"), "no newline\n[exited with code 0]\n");
    const stopped = await background.stop(id);
    assert.equal(stopped.text, `${id} already exited with code 0. Output: ${outputPath}.`);
  } finally {
    await background.stopAll();
    await rm(cwd, { recursive: true, force: true });
    await rm(join(tmpdir(), "freeflow", session), { recursive: true, force: true });
  }
});
