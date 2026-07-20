import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/write-skill/scripts/skill-author.mjs", import.meta.url));

test("skill-author exposes only the fresh command surface", () => {
  const result = spawnSync(process.execPath, [entrypoint, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skill-author <init\|validate\|inspect>/);
  assert.doesNotMatch(result.stdout, /doctor|evaluate|grade|plan-only/);
});

test("skill-author rejects unknown commands without a stack trace", () => {
  const result = spawnSync(process.execPath, [entrypoint, "legacy-command"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command: legacy-command/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});
