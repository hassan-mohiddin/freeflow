import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLI = fileURLToPath(new URL("../../../skills/research-work/scripts/stats.mjs", import.meta.url));

function run(family, input, ...flags) {
  return spawnSync(process.execPath, [CLI, family, ...flags], { input: JSON.stringify(input), encoding: "utf8" });
}

test("stats.mjs computes from a JSON object on stdin", () => {
  const result = run("paired", { method: "mcnemar", armOnly: 9, referenceOnly: 1 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    method: "mcnemar-exact",
    armOnly: 9,
    referenceOnly: 1,
    discordant: 10,
    p: 0.021484375,
  });
});

test("stats.mjs --text prints one summary line", () => {
  const result = run("interval", { method: "wilson", successes: 10, n: 19 }, "--text");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "wilson; estimate 0.526316; n 19; 95% [0.317078, 0.726702]");
});

test("stats.mjs refuses an unknown method or invalid input with exit code 2", () => {
  const unknown = run("interval", { method: "wald", successes: 1, n: 2 });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown method "wald" for interval; choose one of: wilson/);
  const invalid = run("interval", { method: "wilson", successes: 30, n: 19 });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /successes must be an integer from 0 to n/);
  const family = spawnSync(process.execPath, [CLI, "nonsense"], { input: "{}", encoding: "utf8" });
  assert.equal(family.status, 2);
  assert.match(family.stderr, /Usage: stats\.mjs/);
});
