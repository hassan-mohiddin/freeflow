import test from "node:test";
import assert from "node:assert/strict";
import { runProcess } from "../../../skills/evaluate-skill/scripts/lib/process.mjs";

test("retained output limit ignores compacted cumulative transport bytes", async () => {
  const script = `for (let i = 0; i < 100; i += 1) console.log(JSON.stringify({ type: "message_update", message: "${"x".repeat(10000)}", delta: i }))`;
  const result = await runProcess(process.execPath, ["-e", script], {
    outputLimitBytes: 4096,
    transportLimitBytes: 2 * 1024 * 1024,
    stdoutLineTransform: (line) => JSON.stringify({ delta: JSON.parse(line).delta }),
  });
  assert.equal(result.code, 0);
  assert.equal(result.output_limit_exceeded, false);
  assert.equal(result.transport_limit_exceeded, false);
  assert.ok(result.transport_bytes > 1_000_000);
  assert.ok(result.retained_output_bytes < 4096);
  assert.equal(result.stdout.trim().split("\n").length, 100);
});

test("internal transport safeguard still terminates unbounded raw output", async () => {
  const script = `for (let i = 0; i < 1000; i += 1) console.log("${"x".repeat(1000)}")`;
  const result = await runProcess(process.execPath, ["-e", script], {
    outputLimitBytes: 4096,
    transportLimitBytes: 16 * 1024,
    stdoutLineTransform: () => "x",
  });
  assert.equal(result.output_limit_exceeded, false);
  assert.equal(result.transport_limit_exceeded, true);
  assert.ok(result.transport_bytes > 16 * 1024);
  assert.equal(result.retained_output_bytes, Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr));
});

test("retained byte accounting includes only evidence actually appended", async () => {
  const script = "process.stdout.write('1234567890'); process.stderr.write('abcdefghij')";
  const result = await runProcess(process.execPath, ["-e", script], {
    outputLimitBytes: 15,
    transportLimitBytes: 1024,
  });
  assert.equal(result.output_limit_exceeded, true);
  assert.equal(result.transport_limit_exceeded, false);
  assert.equal(result.retained_output_bytes, Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr));
  assert.ok(result.retained_output_bytes <= 15);
});
