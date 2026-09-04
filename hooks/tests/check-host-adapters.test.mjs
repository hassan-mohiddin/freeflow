import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const adapters = {
  legacy: ["hooks/freeflow-runtime-context.mjs", "hookSpecificOutput.additionalContext"],
  claude: ["hooks/adapters/claude-session-start.mjs", "hookSpecificOutput.additionalContext"],
  codex: ["hooks/adapters/codex-session-start.mjs", "hookSpecificOutput.additionalContext"],
  gemini: ["hooks/adapters/gemini-session-start.mjs", "hookSpecificOutput.additionalContext"],
  copilot: ["hooks/adapters/copilot-session-start.mjs", "additionalContext"],
  cursor: ["hooks/adapters/cursor-session-start.mjs", "additional_context"],
};

function createWorkspace(config = "{}\n") {
  const root = mkdtempSync(join(tmpdir(), "freeflow-host-adapter-"));
  mkdirSync(join(root, ".freeflow"), { recursive: true });
  writeFileSync(join(root, ".freeflow", "config.json"), config, "utf8");
  return root;
}

function runAdapter(relativePath, workspace, input, event = "SessionStart") {
  const result = spawnSync(process.execPath, [join(repoRoot, relativePath), event], {
    cwd: repoRoot,
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${relativePath} stderr: ${result.stderr}`);
  assert.equal(result.stderr, "", `${relativePath} should not log on the happy path`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
}

test("host adapters share rendered mandatory context but emit host-native envelopes", () => {
  const workspace = createWorkspace();
  const outputs = {};
  for (const [host, [relativePath]] of Object.entries(adapters)) {
    const input =
      host === "cursor"
        ? { hook_event_name: "sessionStart", workspace_roots: [workspace] }
        : { hook_event_name: "SessionStart", cwd: workspace };
    outputs[host] = runAdapter(relativePath, workspace, input, host === "cursor" ? "sessionStart" : "SessionStart");
    assert.ok(outputs[host], `${host} should emit context`);
  }

  const legacyContext = outputs.legacy.hookSpecificOutput.additionalContext;
  for (const host of ["claude", "codex", "gemini"]) {
    assert.equal(outputs[host].hookSpecificOutput.additionalContext, legacyContext);
  }
  assert.deepEqual(Object.keys(outputs.copilot).sort(), ["additionalContext"]);
  assert.equal(outputs.copilot.additionalContext, legacyContext);
  assert.equal(outputs.copilot.hookSpecificOutput, undefined);
  assert.equal(outputs.cursor.additional_context, legacyContext);
  assert.equal(outputs.cursor.hookSpecificOutput, undefined);
  assert.match(legacyContext, /# Freeflow Stable Guidance/);
  assert.match(legacyContext, /# Freeflow Interaction Contract/);
  assert.match(legacyContext, /Freeflow: active/);
  assert.doesNotMatch(legacyContext, /Cognitive Routing/);
});

test("host adapters stay inert for disabled, invalid, and unsupported lifecycle inputs", () => {
  const disabledWorkspace = createWorkspace('{"enabled":false}\n');
  const invalidWorkspace = createWorkspace('{"enabled":"no"}\n');
  for (const [host, [relativePath]] of Object.entries(adapters)) {
    const input =
      host === "cursor"
        ? { hook_event_name: "sessionStart", workspace_roots: [disabledWorkspace] }
        : { hook_event_name: "SessionStart", cwd: disabledWorkspace };
    assert.equal(
      runAdapter(relativePath, disabledWorkspace, input, host === "cursor" ? "sessionStart" : "SessionStart"),
      undefined,
    );
    const invalidInput = { ...input, cwd: invalidWorkspace, workspace_roots: [invalidWorkspace] };
    assert.equal(
      runAdapter(relativePath, invalidWorkspace, invalidInput, host === "cursor" ? "sessionStart" : "SessionStart"),
      undefined,
    );
    assert.equal(runAdapter(relativePath, disabledWorkspace, input, "UserPromptSubmit"), undefined);
  }
});
