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
    ['{"prompts":{"workingMethod":false}}', '{"prompts":{"core":true}}'],
    ['{"prompts":{"workingMethod":"no"}}', undefined],
    ["{}", '{"prompts":{"skills":false}}'],
    ["{}", '{"prompts":[]}'],
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

// Hosts other than Pi deliver the runtime prompts the user selects; each is on unless a config turns it off.
test("the user selects which runtime prompts a hook host delivers", () => {
  const titles = {
    core: "# Freeflow Stable Guidance",
    interactionContract: "# Freeflow Interaction Contract",
    workingMethod: "# Freeflow Working Method",
  };
  const delivered = (config, local) => {
    const workspace = createWorkspace(`${JSON.stringify(config)}\n`, local && `${JSON.stringify(local)}\n`);
    const context = contextOf(runAdapter(adapters.claude[0], workspace, inputFor("claude", workspace)));
    return context === undefined ? [] : Object.keys(titles).filter((key) => context.includes(titles[key]));
  };
  assert.deepEqual(delivered({}), ["core", "interactionContract", "workingMethod"]);
  for (const key of Object.keys(titles))
    assert.deepEqual(
      delivered({ prompts: { [key]: false } }),
      Object.keys(titles).filter((other) => other !== key),
      `${key} off`,
    );
  // The personal layer overrides the repository's, prompt by prompt.
  assert.deepEqual(
    delivered({ prompts: { workingMethod: false, core: false } }, { prompts: { workingMethod: true } }),
    ["interactionContract", "workingMethod"],
  );
  // Nothing selected, nothing delivered: no orphaned Runtime State.
  assert.deepEqual(delivered({ prompts: { core: false, interactionContract: false, workingMethod: false } }), []);
  const workspace = createWorkspace('{"prompts":{"core":false,"interactionContract":false,"workingMethod":false}}\n');
  assert.equal(runAdapter(adapters.claude[0], workspace, inputFor("claude", workspace)), undefined);
});

test("an invalid prompt selection is reported", () => {
  const workspace = createWorkspace("{}\n", '{"prompts":{"workingMethod":"off"}}\n');
  const context = contextOf(runAdapter(adapters.codex[0], workspace, inputFor("codex", workspace)));
  assert.match(context, /\.freeflow\/local\.json is invalid: prompts\.workingMethod must be a boolean/);
});

// Claude Code caps each hook's additionalContext at 10,000 characters and saves anything longer to a file, giving the
// model only a 2,000-character preview (code.claude.com/docs/en/hooks). In October 2026 one hook carrying every prompt
// (16 KB) reached Claude as that preview, so Claude Code runs one hook per prompt. Codex spills above a per-hook
// token limit (2,500 by default, estimated as bytes / 4), which its manifest raises.
const CLAUDE_HOOK_CHARACTER_CAP = 10_000;
// Room under the cap for future edits; a part over it needs trimming or another split.
const PROMPT_PART_BUDGET = 9_500;

function runManifestHooks(manifestPath, rootVariable, workspace) {
  const manifest = JSON.parse(readFileSync(join(repoRoot, manifestPath), "utf8"));
  return manifest.hooks.SessionStart[0].hooks.map((handler) => {
    const result = spawnSync("/bin/sh", ["-c", handler.command], {
      cwd: repoRoot,
      env: { ...process.env, [rootVariable]: repoRoot },
      input: `${JSON.stringify({ hook_event_name: "SessionStart", source: "startup", cwd: workspace })}\n`,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return { handler, context: contextOf(result.stdout.trim() ? JSON.parse(result.stdout) : undefined) };
  });
}

test("each Claude Code hook stays under Claude Code's context cap and together they deliver every prompt once", () => {
  const workspace = createWorkspace();
  const outputs = runManifestHooks("hooks/claude/hooks.json", "CLAUDE_PLUGIN_ROOT", workspace);
  for (const { handler, context } of outputs)
    assert.ok(context.length < CLAUDE_HOOK_CHARACTER_CAP, `${handler.command}: ${context.length} characters`);
  const all = outputs.map(({ context }) => context).join("\n");
  for (const heading of [
    "# Freeflow Stable Guidance",
    "# Freeflow Interaction Contract",
    "# Freeflow Working Method",
    "# Freeflow Runtime State",
  ])
    assert.equal(all.split(heading).length - 1, 1, heading);
  // A selected-off prompt's hook delivers nothing; an invalid config is reported once, by the core hook.
  const selected = runManifestHooks(
    "hooks/claude/hooks.json",
    "CLAUDE_PLUGIN_ROOT",
    createWorkspace('{"prompts":{"workingMethod":false}}\n'),
  );
  assert.equal(selected[2].context, undefined);
  const invalid = runManifestHooks("hooks/claude/hooks.json", "CLAUDE_PLUGIN_ROOT", createWorkspace('{"enabled":1}\n'));
  assert.deepEqual(
    invalid.map(({ context }) => /# Freeflow Configuration Error/.test(context ?? "")),
    [true, false, false],
  );
});

test("Codex's hook limit holds the whole context", () => {
  const [{ handler, context }] = runManifestHooks("hooks/codex/hooks.json", "PLUGIN_ROOT", createWorkspace());
  assert.match(context, /# Freeflow Working Method/);
  assert.ok(Buffer.byteLength(context) / 4 < handler.additionalContextLimit, `${Buffer.byteLength(context)} bytes`);
});

test("every runtime prompt fits one Claude Code hook with room to spare", () => {
  for (const file of ["core.md", "interaction-contract.md", "working-method.md"]) {
    const length = readFileSync(join(repoRoot, "runtime/prompts", file), "utf8").trim().length;
    assert.ok(length <= PROMPT_PART_BUDGET, `${file}: ${length} characters`);
  }
});

// Codex installs the npm package (Codex runs `npm pack` on it) because it loads no hooks from a plugin whose root
// plugin.json is an Agent Plugins manifest; the repository keeps that manifest for the other hosts.
test("the npm package Codex installs has no Agent Plugins manifest and delivers Freeflow's context", () => {
  const destination = mkdtempSync(join(tmpdir(), "freeflow-codex-npm-"));
  const pack = spawnSync("npm", ["pack", "--ignore-scripts", "--pack-destination", destination, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(pack.status, 0, pack.stderr);
  const [{ filename }] = JSON.parse(pack.stdout);
  assert.equal(spawnSync("tar", ["-xzf", join(destination, filename), "-C", destination]).status, 0);
  const plugin = join(destination, "package");
  assert.throws(() => readFileSync(join(plugin, "plugin.json")), /ENOENT/);
  const manifest = JSON.parse(readFileSync(join(plugin, ".codex-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.hooks, "./hooks/codex/hooks.json");
  const [handler] = JSON.parse(readFileSync(join(plugin, "hooks/codex/hooks.json"), "utf8")).hooks.SessionStart[0]
    .hooks;
  const workspace = createWorkspace();
  const result = spawnSync("/bin/sh", ["-c", handler.command], {
    env: { ...process.env, PLUGIN_ROOT: plugin },
    input: `${JSON.stringify({ hook_event_name: "SessionStart", source: "startup", cwd: workspace })}\n`,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const context = contextOf(JSON.parse(result.stdout));
  for (const heading of ["# Freeflow Stable Guidance", "# Freeflow Interaction Contract", "# Freeflow Working Method"])
    assert.match(context, new RegExp(heading));
});
