import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-skill/scripts/skill-eval.mjs", import.meta.url));

test("skill-eval exposes only the fresh command surface", () => {
  const result = spawnSync(process.execPath, [entrypoint, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skill-eval run <suite-or-group-path>/);
  assert.match(result.stdout, /skill-eval view <result-id-or-directory>/);
  assert.match(result.stdout, /Definition paths resolve from the current working directory/);
  assert.match(result.stdout, /Results are stored under <cwd>\/\.skill-eval\/runs\/<result-id>/);
  assert.match(result.stdout, /--group <id-or-position>/);
  assert.match(result.stdout, /--variant <baseline\|candidate>/);
  assert.doesNotMatch(result.stdout, /--allow-commands|command outcomes/);
  assert.match(result.stdout, /Description and explicit-body groups/);
  assert.match(result.stdout, /Working-tree or Git-backed ordered skills\/context/);
  assert.match(result.stdout, /optional fresh fixture copies/);
  assert.match(result.stdout, /body tools: read, write, edit/);
  assert.doesNotMatch(result.stdout, /doctor|evaluate|grade|plan-only|semantic/);
});

test("skill-eval rejects the removed command-execution approval flag", () => {
  const result = spawnSync(process.execPath, [entrypoint, "run", "group.json", "--allow-commands"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown option: --allow-commands/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test("skill-eval rejects unknown commands without a stack trace", () => {
  const result = spawnSync(process.execPath, [entrypoint, "legacy-command"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command: legacy-command/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});
