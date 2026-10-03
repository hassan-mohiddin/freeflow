import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { readConfig } from "../shared/runtime-context.mjs";
import { readFreeflowConfigLayers } from "../../pi-extension/dist/host/config.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const adapters = {
  legacy: ["hooks/freeflow-runtime-context.mjs", "hookSpecificOutput.additionalContext"],
  claude: ["hooks/adapters/claude-session-start.mjs", "hookSpecificOutput.additionalContext"],
  codex: ["hooks/adapters/codex-session-start.mjs", "hookSpecificOutput.additionalContext"],
  gemini: ["hooks/adapters/gemini-session-start.mjs", "hookSpecificOutput.additionalContext"],
  copilot: ["hooks/adapters/copilot-session-start.mjs", "additionalContext"],
  cursor: ["hooks/adapters/cursor-session-start.mjs", "additional_context"],
};

function createWorkspace(config = "{}\n", local = undefined) {
  const root = mkdtempSync(join(tmpdir(), "freeflow-host-adapter-"));
  mkdirSync(join(root, ".freeflow"), { recursive: true });
  writeFileSync(join(root, ".freeflow", "config.json"), config, "utf8");
  if (local !== undefined) writeFileSync(join(root, ".freeflow", "local.json"), local, "utf8");
  return root;
}

const inputFor = (host, workspace) =>
  host === "cursor"
    ? { hook_event_name: "sessionStart", workspace_roots: [workspace] }
    : { hook_event_name: "SessionStart", cwd: workspace };
const eventFor = (host) => (host === "cursor" ? "sessionStart" : "SessionStart");
const contextOf = (output) =>
  output?.hookSpecificOutput?.additionalContext ?? output?.additionalContext ?? output?.additional_context;

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
  assert.match(legacyContext, /# Freeflow Working Method/);
  assert.ok(
    legacyContext.indexOf("# Freeflow Interaction Contract") < legacyContext.indexOf("# Freeflow Working Method") &&
      legacyContext.indexOf("# Freeflow Working Method") < legacyContext.indexOf("Freeflow: active"),
    "Pi's order: core, Interaction Contract, Working Method, then the Runtime State",
  );
  assert.match(legacyContext, /Freeflow: active/);
  assert.doesNotMatch(legacyContext, /Cognitive Routing/);
});

test("host adapters stay inert for disabled and unsupported lifecycle inputs and report an invalid config", () => {
  const disabledWorkspace = createWorkspace('{"enabled":false}\n');
  const invalidWorkspace = createWorkspace('{"enabled":"no"}\n');
  for (const [host, [relativePath]] of Object.entries(adapters)) {
    const input = inputFor(host, disabledWorkspace);
    assert.equal(runAdapter(relativePath, disabledWorkspace, input, eventFor(host)), undefined);
    const invalid = contextOf(
      runAdapter(relativePath, invalidWorkspace, inputFor(host, invalidWorkspace), eventFor(host)),
    );
    assert.match(invalid, /# Freeflow Configuration Error/, host);
    assert.match(invalid, /\.freeflow\/config\.json is invalid: enabled must be a boolean/, host);
    assert.doesNotMatch(invalid, /# Freeflow Stable Guidance/, host);
    assert.equal(runAdapter(relativePath, disabledWorkspace, input, "UserPromptSubmit"), undefined);
  }
});

// Settings written on Pi, such as Tool Execution or Compaction from /freeflow settings, must not switch Freeflow off on
// the other hosts. Before October 2026 the hooks kept their own copy of the config check, which rejected both keys.
test("a config Pi accepts activates Freeflow on every hook host", () => {
  const capabilities =
    '{"cognitiveRouting":{"enabled":true},"toolExecution":{"enabled":true},"compaction":{"carry":false}}\n';
  const workspace = createWorkspace(capabilities, capabilities);
  for (const [host, [relativePath]] of Object.entries(adapters)) {
    const context = contextOf(runAdapter(relativePath, workspace, inputFor(host, workspace), eventFor(host)));
    assert.match(context, /# Freeflow Stable Guidance/, host);
  }
});

test("the hooks and Pi agree on every config's validity", async () => {
  const cases = [
    ["{}", undefined],
    ['{"enabled":false}', undefined],
    ['{"toolExecution":{"enabled":true,"capture":{"enabled":true}}}', '{"compaction":{"enabled":false}}'],
    ["{}", '{"cognitiveRouting":{"enabled":true},"toolExecution":{"enabled":true}}'],
    ['{"outputRouter":{}}', '{"processing":{}}'],
    ['{"toolExecution":{"bogus":true}}', undefined],
    ["{}", '{"compaction":{"carry":"no"}}'],
    ['{"defaultMode":"workflow"}', undefined],
    ["{}", '{"contextVirtualization":false}'],
    ["{invalid", undefined],
    ["[]", undefined],
  ];
  for (const [config, local] of cases) {
    const workspace = createWorkspace(`${config}\n`, local === undefined ? undefined : `${local}\n`);
    const pi = await readFreeflowConfigLayers(workspace);
    const hook = readConfig(workspace);
    const label = `config ${config}, local ${local}`;
    assert.equal(hook.configured, pi.configured, label);
    assert.equal(hook.enabled, pi.configured && pi.coreConfig.enabled, label);
  }
});

test("the shared config validator imports nothing but Node and its own files", () => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)) {
      if (specifier.startsWith("node:")) continue;
      assert.ok(specifier.startsWith("."), `${file} imports ${specifier}, which plain Node hooks cannot load`);
      visit(resolve(dirname(file), specifier));
    }
  };
  visit(join(repoRoot, "pi-extension/dist/host/config-validation.js"));
  assert.ok(seen.size >= 3);
});
