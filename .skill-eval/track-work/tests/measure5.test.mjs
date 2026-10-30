import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  addEvents,
  addUsed,
  emptyMeasure,
  parseMeasure,
  priceTable,
  renderMeasure,
  requestCost,
  transcriptEvents,
} from "../../../skills/track-work/scripts/lib/measure5.mjs";

const T0 = Date.parse("2026-10-30T10:00:00.000Z");
const at = (minutes) => new Date(T0 + minutes * 60_000).toISOString();
const request = (minutes, id, usage, extra = {}) =>
  JSON.stringify({
    type: "assistant",
    timestamp: at(minutes),
    effort: "high",
    message: { id, model: "claude-opus-5-5", usage },
    ...extra,
  });
const usage = (read, written = 0, output = 100, input = 2) => ({
  input_tokens: input,
  cache_creation_input_tokens: written,
  cache_read_input_tokens: read,
  output_tokens: output,
});

// A session: three requests, a subagent's request, a compaction, then two requests in the next compaction cycle.
const LOG = [
  request(0, "m1", usage(50_000, 898)),
  request(2, "m2", usage(51_000, 900)),
  request(2, "m2", usage(0, 0, 0, 0)), // the same request logged again with no usage
  request(3, "s1", usage(5_000), { isSidechain: true }),
  request(4, "m3", usage(70_000, 2_000)),
  JSON.stringify({
    type: "system",
    subtype: "compact_boundary",
    timestamp: at(5),
    compactMetadata: { preTokens: 80_000, postTokens: 30_000 },
  }),
  request(6, "m4", usage(30_000, 1_000)),
  request(30, "m5", usage(45_000, 900)), // after a 24-minute wait: wall time, not working time
].join("\n");

test("a measure takes its first reading, then adds the context each compaction cycle grew, and billed tokens by model and effort", async () => {
  const folder = await mkdtemp(join(tmpdir(), "track-work-measure5-"));
  try {
    const log = join(folder, "session.jsonl");
    await writeFile(log, `${LOG}\n`);

    // The Slice starts after the first request: only a reading, nothing used yet.
    const started = addEvents(emptyMeasure(), transcriptEvents(log, T0 - 1));
    assert.equal(started.context, 0);
    assert.deepEqual(started.last, { time: Date.parse(at(30)), context: 46_002 });

    // From the first request on: 51,002 -> 72,102 (the second, third and compaction), 80,000 at the compaction, then
    // 31,002 -> 46,002.
    const first = { ...emptyMeasure(), last: { time: T0, context: 50_000 + 898 + 2 + 100 } };
    const measured = addEvents(first, transcriptEvents(log, T0));
    assert.equal(measured.context, 80_000 - 51_000 + (46_002 - 30_000));
    assert.equal(measured.cycles, 2);
    assert.equal(measured.workingMs, 6 * 60_000); // 2 + 2 + 2 minutes; the 24-minute wait left out
    assert.equal(measured.wallMs, 30 * 60_000);
    assert.deepEqual(Object.keys(measured.billed), ["claude-opus-5-5 high"]); // the subagent's request is its own
    const billed = measured.billed["claude-opus-5-5 high"];
    assert.equal(billed.read, 51_000 + 70_000 + 30_000 + 45_000);
    assert.equal(billed.written, 900 + 2_000 + 1_000 + 900);
    assert.ok(Math.abs(billed.usd - (8 * 4 + 4_800 * 5 + 196_000 * 0.2 + 400 * 20) / 1_000_000) < 1e-9);

    // The line round-trips, and a later reading adds only what came after it.
    const line = renderMeasure(measured);
    assert.match(
      line,
      /^context 45,002 over 2 compaction cycle\(s\); working 6 min, wall 30 min; claude-opus-5-5 high: 8 in, 4,800 written, 196,000 read, 400 out, \$0\.07; as of 2026-10-30T10:30:00\.000Z at 46,002 tokens$/,
    );
    assert.deepEqual(parseMeasure(line).billed["claude-opus-5-5 high"].read, 196_000);
    const again = addEvents(parseMeasure(line), transcriptEvents(log, Date.parse(at(30))));
    assert.equal(again.context, 45_002);

    // Work that began before this log (in another session): what the log holds is all, and the measure says so.
    const read = transcriptEvents(log, T0 - 3_600_000);
    assert.equal(read.reached, false);
    const elsewhere = addEvents({ ...emptyMeasure(), last: { time: T0 - 3_600_000, context: 10_000 } }, read);
    assert.equal(elsewhere.partial, true);
    assert.equal(elsewhere.context, 80_000 - 51_000 + (46_002 - 30_000));
    assert.match(renderMeasure(elsewhere), /\(partly measured\)/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("prices: per model card, Haiku's by prompt size, a model with no card unpriced, and FREEFLOW_PRICES replacing the table", async () => {
  const haiku = (read) => ({ model: "claude-haiku-5-5", usage: usage(read, 0, 1_000, 0) });
  assert.ok(Math.abs(requestCost(haiku(90_000)) - (90_000 * 0.01 + 1_000 * 0.5) / 1_000_000) < 1e-12);
  assert.ok(Math.abs(requestCost(haiku(150_000)) - (150_000 * 0.05 + 1_000 * 2.5) / 1_000_000) < 1e-12);
  const oneHour = {
    model: "claude-opus-5-5",
    usage: { ...usage(0, 1_000, 0, 0), cache_creation: { ephemeral_1h_input_tokens: 1_000 } },
  };
  assert.equal(requestCost(oneHour), (1_000 * 8) / 1_000_000);
  assert.equal(requestCost({ model: "some-other-model", usage: usage(1) }), null);

  const folder = await mkdtemp(join(tmpdir(), "track-work-prices5-"));
  try {
    const file = join(folder, "prices.json");
    await writeFile(
      file,
      JSON.stringify({
        date: "2027-01-01",
        source: "mine",
        models: { "some-other-model": [{ input: 1, write5m: 1, write1h: 1, read: 1, output: 1 }] },
      }),
    );
    const table = priceTable({ FREEFLOW_PRICES: file });
    assert.equal(table.date, "2027-01-01");
    assert.equal(requestCost({ model: "some-other-model", usage: usage(1_000_000, 0, 0, 0) }, table), 1);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("--used where no transcript is read: context and wall time only, and a drop across a compaction marked partly measured", () => {
  const start = addUsed(emptyMeasure(), 40_000, T0);
  assert.equal(start.context, 0);
  const later = addUsed(start, 70_000, T0 + 600_000);
  assert.equal(later.context, 30_000);
  assert.equal(later.wallMs, 600_000);
  const compacted = addUsed(later, 20_000, T0 + 900_000);
  assert.equal(compacted.partial, true);
  assert.equal(compacted.context, 30_000);
});

test("slice start takes the first reading from the transcript the harness names, and slice close writes the totals into History", async () => {
  const { spawnSync, execFileSync } = await import("node:child_process");
  const { readFile, appendFile, realpath } = await import("node:fs/promises");
  const script = join(process.cwd(), "skills/track-work/scripts/working-record.mjs");
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-measured5-")));
  try {
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
    await writeFile(join(root, ".gitignore"), ".freeflow/\n");
    const log = join(root, "session.jsonl");
    const now = Date.now();
    const line = (offsetMinutes, id, read) =>
      JSON.stringify({
        type: "assistant",
        timestamp: new Date(now + offsetMinutes * 60_000).toISOString(),
        effort: "high",
        message: { id, model: "claude-opus-5-5", usage: usage(read, 0, 0, 0) },
      });
    await writeFile(log, `${line(-1, "a", 40_000)}\n`);
    const env = { ...process.env, FREEFLOW_TRANSCRIPT: log, FREEFLOW_HOME: "", CLAUDE_CODE_SESSION_ID: "" };
    const run = (args, input = "") =>
      spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: "utf8", input });
    const init = run(
      ["init", "--root", root, "--name", "Demo", "--cue", "read when the demo matters", "--input", "-"],
      "### Goal\n\n- A demo.\n\n### Next action\n\n- Build it.\n",
    );
    assert.equal(init.status, 0, init.stderr);
    const record = init.stdout.trim().split("\n")[0];
    assert.equal(
      run(
        ["agreement", "open", "--record", record, "--title", "Demo", "--input", "-"],
        '- Done when it runs. You: "go" (2026-10-30)\n',
      ).status,
      0,
    );
    const started = run(
      ["slice", "start-direct", "--record", record, "--title", "Build", "--next-action", "Build it.", "--input", "-"],
      "- Result wanted: A demo.\n- Scope: demo.\n- Done when: it runs.\n- Stop if: it breaks.\n- Started from: nothing.\n",
    );
    assert.equal(started.status, 0, started.stderr);
    assert.match(
      await readFile(record, "utf8"),
      /\n- Measured: context 0 over 1 compaction cycle\(s\); working 0 min, wall 0 min; as of \S+ at 40,000 tokens\n/,
    );

    await appendFile(log, `${line(1, "b", 52_000)}\n${line(3, "c", 60_000)}\n`);
    const closed = run(
      ["slice", "close", "--record", record, "--state", "completed", "--next-action", "Done.", "--input", "-"],
      "- Cue: read when the demo matters\n- Result: It runs.\n- Evidence: record.md\n- Task effect: A demo.\n",
    );
    assert.equal(closed.status, 0, closed.stderr);
    const history = await readFile(join(dirname(record), "history.md"), "utf8");
    assert.match(
      history,
      /\n- Measured: context 20,000 over 1 compaction cycle\(s\); working 4 min, wall 4 min; claude-opus-5-5 high: 0 in, 0 written, 112,000 read, 0 out, \$0\.02; as of \S+ at 60,000 tokens\n/,
    );

    // With no transcript named and no --used, nothing is measured, and the entry says so.
    const bare = { ...env, FREEFLOW_TRANSCRIPT: "" };
    const again = spawnSync(
      process.execPath,
      [script, "slice", "start-direct", "--record", record, "--title", "Again", "--next-action", "Go.", "--input", "-"],
      {
        cwd: root,
        env: bare,
        encoding: "utf8",
        input:
          "- Result wanted: More.\n- Scope: demo.\n- Done when: it runs.\n- Stop if: it breaks.\n- Started from: the demo.\n",
      },
    );
    assert.equal(again.status, 0, again.stderr);
    assert.doesNotMatch(await readFile(record, "utf8"), /- Measured:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
