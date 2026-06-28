import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../../pi-extension/dist/index.js";
import { createVault, storeTextOutput } from "../../dist/index.js";

function loadExtension() {
  const handlers = new Map();
  const tools = [];
  const commands = [];
  const pi = {
    registerTool(tool) {
      tools.push(tool);
    },
    registerCommand(name, definition) {
      commands.push({ name, definition });
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
    appendEntry() {},
    sendUserMessage() {},
  };

  freeflowExtension(pi);
  return { handlers, tools, commands };
}

function context(cwd = process.cwd()) {
  return {
    cwd,
    sessionManager: {
      getEntries() {
        return [];
      },
    },
    ui: {
      setStatus() {},
      notify() {},
    },
  };
}

const testTheme = {
  fg(_color, text) {
    return text;
  },
  bg(_color, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

function renderText(component, width = 120) {
  return component.render(width).join("\n");
}

test("Pi registers output-router as a direct command and no public capture tool", () => {
  const { commands, tools } = loadExtension();
  const commandNames = commands.map((command) => command.name);
  const toolNames = tools.map((tool) => tool.name);

  assert.ok(commandNames.includes("output-router"));
  assert.ok(toolNames.includes("freeflow_status"));
  assert.ok(toolNames.includes("freeflow_search"));
  assert.ok(toolNames.includes("freeflow_run"));
  assert.ok(toolNames.includes("freeflow_batch"));
  assert.ok(!toolNames.includes("freeflow_retrieve"));
  assert.ok(!toolNames.includes("freeflow_search action=transform"));
  assert.ok(!toolNames.includes("freeflow_capture"));
});

test("Pi before_agent_start injects output-router skill context", async () => {
  const { handlers } = loadExtension();
  const beforeAgentStart = handlers.get("before_agent_start");
  assert.ok(beforeAgentStart);

  const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context());

  assert.match(result.systemPrompt, /## Loaded Output Router Skill/);
  assert.match(result.systemPrompt, /name: output-router/);
  assert.match(result.systemPrompt, /freeflow_search/);
  assert.match(result.systemPrompt, /freeflow_run/);
  assert.doesNotMatch(result.systemPrompt, /freeflow_capture/);
  assert.match(result.systemPrompt, /freeflow_search action=transform/);
  assert.match(result.systemPrompt, /Native tools stay direct/);
  assert.match(result.systemPrompt, /## Loaded Output Router Safety Policy/);
  assert.match(result.systemPrompt, /Do not silently summarize or compress exactness-sensitive output/);
  assert.doesNotMatch(result.systemPrompt, /large native read\/bash outputs may be vaulted/);
  assert.doesNotMatch(result.systemPrompt, /Output-router config note/);
});

test("Pi before_agent_start uses short Freeflow context after the first turn", async () => {
  const { handlers } = loadExtension();
  const beforeAgentStart = handlers.get("before_agent_start");
  assert.ok(beforeAgentStart);

  const first = await beforeAgentStart({ systemPrompt: "base prompt" }, context());
  const second = await beforeAgentStart({ systemPrompt: "base prompt" }, context());

  assert.match(first.systemPrompt, /## Loaded Workflow Skill/);
  assert.match(first.systemPrompt, /## Loaded Output Router Skill/);
  assert.match(second.systemPrompt, /## Freeflow Runtime Context/);
  assert.match(second.systemPrompt, /Effective Freeflow mode:/);
  assert.match(second.systemPrompt, /Use the installed Freeflow skills when they match the task/);
  assert.match(second.systemPrompt, /## Freeflow Runtime Priority/);
  assert.doesNotMatch(second.systemPrompt, /## Loaded Workflow Skill/);
  assert.doesNotMatch(second.systemPrompt, /## Loaded Interview Gate Skill/);
  assert.doesNotMatch(second.systemPrompt, /## Loaded Discover Skill/);
  assert.doesNotMatch(second.systemPrompt, /## Loaded Output Router Skill/);
  assert.doesNotMatch(second.systemPrompt, /name: output-router/);
});

test("Pi session_start and session_compact re-arm full Freeflow context injection", async () => {
  const { handlers } = loadExtension();
  const beforeAgentStart = handlers.get("before_agent_start");
  const sessionStart = handlers.get("session_start");
  const sessionCompact = handlers.get("session_compact");
  assert.ok(beforeAgentStart);
  assert.ok(sessionStart);
  assert.ok(sessionCompact);

  await beforeAgentStart({ systemPrompt: "base prompt" }, context());
  const shortAfterFirst = await beforeAgentStart({ systemPrompt: "base prompt" }, context());
  assert.doesNotMatch(shortAfterFirst.systemPrompt, /## Loaded Workflow Skill/);

  await sessionCompact({ reason: "manual" }, context());
  const fullAfterCompact = await beforeAgentStart({ systemPrompt: "base prompt" }, context());
  assert.match(fullAfterCompact.systemPrompt, /## Loaded Workflow Skill/);
  assert.match(fullAfterCompact.systemPrompt, /## Loaded Output Router Skill/);

  const shortAfterCompact = await beforeAgentStart({ systemPrompt: "base prompt" }, context());
  assert.doesNotMatch(shortAfterCompact.systemPrompt, /## Loaded Workflow Skill/);

  await sessionStart({ reason: "resume" }, context());
  const fullAfterResume = await beforeAgentStart({ systemPrompt: "base prompt" }, context());
  assert.match(fullAfterResume.systemPrompt, /## Loaded Workflow Skill/);
  assert.match(fullAfterResume.systemPrompt, /## Loaded Output Router Skill/);
});

test("Pi freeflow_status reports effective defaults without writing config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-minimal-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const configText = JSON.stringify({ defaultMode: "workflow" }, null, 2);
    await writeFile(configPath, configText, "utf8");

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    assert.ok(statusTool);

    const result = await statusTool.execute("status-minimal", { action: "doctor" }, undefined, undefined, context(cwd));
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.toolStatus, "ok");
    assert.equal(report.action, "doctor");
    assert.equal(report.mode.defaultMode, "workflow");
    assert.equal(report.effectiveConfig.outputRouter.enabled, true);
    assert.equal(report.effectiveConfig.outputRouter.profile, "standard");
    assert.equal(report.effectiveConfig.outputRouter.postToolRouting, "off");
    assert.equal("capture" in report.effectiveConfig, false);
    assert.equal("providers" in report.effectiveConfig, false);
    assert.equal(report.effectiveConfig.observedRouting.enabled, false);
    assert.deepEqual(report.effectiveConfig.observedRouting.mcp.servers, {});
    assert.equal(report.effectiveConfig.scriptTransform.enabled, false);
    assert.equal(report.effectiveLocalConfig.processing.unsafeUnsandboxed.enabled, false);
    assert.equal(report.processing.unsafeUnsandboxed.enabled, false);
    assert.equal(report.processing.unsafeUnsandboxed.status, "disabled");
    assert.equal(report.localConfigExists, false);
    assert.deepEqual(report.localConfigWarnings, []);
    assert.equal(report.scriptTransform.enabled, false);
    assert.equal(report.scriptTransform.executionStatus, "disabled");
    assert.ok(["available", "unavailable"].includes(report.scriptTransform.adapterStatus));
    assert.equal(report.scriptTransform.adapterContractVersion, 1);
    assert.deepEqual(report.scriptTransform.configuredLanguages, ["javascript", "python", "jq"]);
    const reportedLanguages = [
      ...report.scriptTransform.availableLanguages,
      ...report.scriptTransform.unavailableLanguages.map((entry) => entry.language),
    ].sort();
    assert.deepEqual(reportedLanguages, ["javascript", "jq", "python"]);
    assert.ok(report.scriptTransform.requiredProofs.includes("network_access_denied"));
    assert.ok(report.scriptTransform.candidateMechanisms.some((candidate) => candidate.id === "node-vm" && candidate.status === "rejected"));
    assert.ok(report.scriptTransform.candidateMechanisms.some((candidate) => candidate.id === "os-sandbox-adapter" && candidate.status === "candidate_unproven"));
    assert.equal(report.scriptTransform.network, "off");
    assert.equal(report.scriptTransform.rawScriptPersistence, "disabled");
    assert.equal(report.observedRouting.host.name, "pi");
    assert.equal(report.observedRouting.host.outputReplacement, "available");
    assert.equal(report.vaultIndex.engine, "local-json-sidecar");
    assert.equal(typeof report.vaultIndex.available, "boolean");
    assert.equal(report.vaultIndex.degraded, false);
    assert.equal(report.vaultIndex.stale, false);
    assert.equal(report.vaultIndex.rebuildRecommended, false);
    assert.equal(typeof report.vaultIndex.entryCount, "number");
    assert.ok(report.vaultIndex.entryCount >= 0);
    assert.equal(report.observedRouting.unsupportedPersistenceModes.includes("redacted"), true);
    assert.deepEqual(report.configWarnings, []);
    assert.match(report.vault.root, /freeflow-router\/vault$/);
    assert.ok(["writable", "missing_ancestor_writable", "missing_ancestor_unavailable", "not_directory", "not_writable", "unknown"].includes(report.vault.writability.status));
    assert.equal(await readFile(configPath, "utf8"), configText);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports vault writability without creating directories", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-vault-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const nestedVault = join(cwd, "missing", "nested", "vault");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", outputRouter: { vaultRoot: nestedVault } }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const missingResult = await statusTool.execute("status-vault-missing", { action: "doctor" }, undefined, undefined, context(cwd));
    const missingReport = JSON.parse(missingResult.content[0].text);

    assert.equal(missingReport.vault.writability.status, "missing_ancestor_writable");
    await assert.rejects(readFile(nestedVault, "utf8"));

    const fileVault = join(cwd, "vault-file");
    await writeFile(fileVault, "not a directory", "utf8");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", outputRouter: { vaultRoot: fileVault } }),
      "utf8",
    );
    const fileResult = await statusTool.execute("status-vault-file", { action: "doctor" }, undefined, undefined, context(cwd));
    const fileReport = JSON.parse(fileResult.content[0].text);
    assert.equal(fileReport.vault.writability.status, "not_directory");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports local unsafe processing opt-in without shared config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-local-processing-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");
    await writeFile(
      join(cwd, ".freeflow/local.json"),
      JSON.stringify({ processing: { unsafeUnsandboxed: { enabled: true } } }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute("status-local-processing", { action: "doctor" }, undefined, undefined, context(cwd));
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.localConfigExists, true);
    assert.equal(report.effectiveLocalConfig.processing.unsafeUnsandboxed.enabled, true);
    assert.equal(report.processing.unsafeUnsandboxed.enabled, true);
    assert.equal(report.processing.unsafeUnsandboxed.status, "enabled_unsafe");
    assert.deepEqual(report.configWarnings, []);
    assert.deepEqual(report.localConfigWarnings, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status warns that shared config cannot enable unsafe processing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-shared-processing-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", processing: { unsafeUnsandboxed: { enabled: true } } }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute("status-shared-processing", { action: "doctor" }, undefined, undefined, context(cwd));
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.effectiveLocalConfig.processing.unsafeUnsandboxed.enabled, false);
    assert.equal(report.processing.unsafeUnsandboxed.enabled, false);
    assert.ok(report.configWarnings.some((warning) => warning.includes("processing config is ignored")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports configured observed routing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-observed-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        observedRouting: {
          enabled: true,
          onRoutingFailure: "fail-open",
          mcp: {
            servers: {
              github: { enabled: true, persistence: "exact" },
              gmail: { enabled: true, persistence: "metadata-only" },
            },
          },
          web: { enabled: true, persistence: "exact" },
          fetch: { enabled: false },
          codeSearch: { enabled: true, persistence: "none" },
        },
        scriptTransform: {
          enabled: true,
          languages: ["python"],
          limits: { timeoutMs: 1000, maxInputBytes: 2048, maxOutputBytes: 4096 },
        },
      }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute("status-observed", { action: "doctor" }, undefined, undefined, context(cwd));
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.effectiveConfig.observedRouting.enabled, true);
    assert.equal(report.effectiveConfig.observedRouting.onRoutingFailure, "fail-open");
    assert.deepEqual(report.effectiveConfig.observedRouting.mcp.servers.github, { enabled: true, persistence: "exact" });
    assert.deepEqual(report.effectiveConfig.observedRouting.mcp.servers.gmail, { enabled: true, persistence: "metadata-only" });
    assert.deepEqual(report.effectiveConfig.observedRouting.web, { enabled: true, persistence: "exact" });
    assert.deepEqual(report.effectiveConfig.observedRouting.fetch, { enabled: false, persistence: "none" });
    assert.deepEqual(report.effectiveConfig.observedRouting.codeSearch, { enabled: true, persistence: "none" });
    assert.equal(report.observedRouting.enabled, true);
    assert.equal(report.observedRouting.mcp.configuredServerCount, 2);
    assert.equal(report.effectiveConfig.scriptTransform.enabled, true);
    assert.deepEqual(report.effectiveConfig.scriptTransform.languages, ["python"]);
    assert.equal(report.scriptTransform.enabled, true);
    assert.ok(["available", "adapter_unavailable"].includes(report.scriptTransform.executionStatus));
    assert.equal(typeof report.scriptTransform.adapterAvailable, "boolean");
    if (report.scriptTransform.adapterAvailable) {
      assert.ok(report.scriptTransform.availableLanguages.includes("python"));
    }
    assert.deepEqual(report.observedRouting.persistenceModes, ["exact", "metadata-only", "none"]);
    assert.deepEqual(report.configWarnings, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status reports invalid config warnings and safe fallbacks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-invalid-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: "yes", profile: "future" },
        capture: { freeflowMediated: "metadata-only", directHostTools: "raw" },
        providers: { enabled: [{ id: "serena", mode: "write" }] },
        scriptTransform: { enabled: "yes", sandbox: "none", languages: ["ruby"], network: "on" },
        observedRouting: {
          enabled: "yes",
          mcp: { servers: { github: { enabled: true, persistence: "redacted" } } },
          web: { enabled: true },
        },
      }),
      "utf8",
    );

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute("status-invalid", { action: "doctor" }, undefined, undefined, context(cwd));
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.effectiveConfig.outputRouter.enabled, true);
    assert.equal(report.effectiveConfig.outputRouter.profile, "standard");
    assert.equal("capture" in report.effectiveConfig, false);
    assert.equal("providers" in report.effectiveConfig, false);
    assert.equal(report.effectiveConfig.observedRouting.enabled, false);
    assert.equal(report.effectiveConfig.scriptTransform.enabled, false);
    assert.deepEqual(report.effectiveConfig.scriptTransform.languages, ["javascript", "python", "jq"]);
    assert.equal(report.effectiveConfig.observedRouting.mcp.servers.github.persistence, "metadata-only");
    assert.equal(report.effectiveConfig.observedRouting.web.persistence, "metadata-only");
    assert.ok(report.configWarnings.some((warning) => warning.includes("outputRouter.enabled")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("outputRouter.profile")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("scriptTransform.enabled")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("scriptTransform.sandbox")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("scriptTransform.languages")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("scriptTransform.network")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("observedRouting.enabled")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("observedRouting.mcp.servers.github.persistence") && warning.includes("redacted")));
    assert.ok(report.configWarnings.some((warning) => warning.includes("observedRouting.web.persistence")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_status migration recommendations are non-destructive", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-status-migration-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const configPath = join(cwd, ".freeflow/config.json");
    const configText = JSON.stringify(
      {
        defaultMode: "workflow",
        outputRouter: {
          enabled: true,
          profile: "standard",
          postToolRouting: "off",
          largeOutputBytes: 64000,
          largeOutputLines: 1000,
          vaultRoot: "~/.cache/freeflow-router/vault",
          vaultRetentionDays: 7,
        },
        capture: { freeflowMediated: "raw", directHostTools: "off" },
        providers: { enabled: [] },
      },
      null,
      2,
    );
    await writeFile(configPath, configText, "utf8");

    const { tools } = loadExtension();
    const statusTool = tools.find((tool) => tool.name === "freeflow_status");
    const result = await statusTool.execute("status-migration", { action: "migration" }, undefined, undefined, context(cwd));
    const report = JSON.parse(result.content[0].text);

    assert.equal(report.action, "migration");
    assert.equal(report.migration.applied, false);
    assert.equal(report.migration.requiresConfirmation, true);
    assert.ok(report.migration.recommendations.some((recommendation) => recommendation.path === "outputRouter.postToolRouting"));
    assert.ok(report.migration.recommendations.some((recommendation) => recommendation.path === "capture"));
    assert.ok(report.migration.recommendations.some((recommendation) => recommendation.path === "providers"));
    assert.equal(await readFile(configPath, "utf8"), configText);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi outputRouter.enabled=false suppresses router context and native safety net", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-router-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { enabled: false, postToolRouting: "safety-net", largeOutputLines: 1, largeOutputBytes: 1 },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));
    assert.doesNotMatch(result.systemPrompt, /## Loaded Output Router Skill/);

    const toolResult = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "read",
        toolCallId: "read-router-disabled",
        input: { path: "large.txt" },
        content: [{ type: "text", text: "line 1\nline 2" }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );
    assert.equal(toolResult, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi output-router skill mentions native safety net only when config enables it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-config-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { postToolRouting: "safety-net" },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context(cwd));

    assert.match(result.systemPrompt, /large native read\/bash outputs may be vaulted/);
    assert.match(result.systemPrompt, /## Loaded Output Router Skill/);
    assert.match(result.systemPrompt, /## Loaded Output Router Safety Policy/);
    assert.match(result.systemPrompt, /freeflow_search/);
    assert.match(result.systemPrompt, /freeflow_search action=transform/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_search renders compact and expanded routed evidence UI", () => {
  const { tools } = loadExtension();
  const searchTool = tools.find((tool) => tool.name === "freeflow_search");
  assert.ok(searchTool);
  assert.ok(searchTool.parameters.properties.action.enum.includes("get"));

  const call = renderText(
    searchTool.renderCall(
      {
        action: "query",
        source: { kind: "repo", path: "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md" },
        query: "SandboxPermissions Plain-language meaning",
      },
      testTheme,
    ),
    200,
  );
  assert.match(call, /freeflow_search query repo/);
  assert.match(call, /SandboxPermissions/);

  const toolResult = {
    content: [{ type: "text", text: "raw json should not be the visible UI" }],
    details: {
      result: {
        toolStatus: "ok",
        decisionId: "ffdec_test",
        preserve: "important",
        source: { kind: "repo", path: "docs/example.md" },
        routing: { status: "routed", route: "search", reason: "Deterministic test route." },
        evidence: [
          {
            id: "ev_test",
            source: { kind: "repo", path: "docs/example.md" },
            path: "docs/example.md",
            lines: "523-527",
            excerpt: "### Sandbox Permissions\n\n`SandboxPermissions` is a per-command request shape.",
            why: "Matched exact heading and identifier.",
            window: "small",
            expandable: true,
          },
        ],
        recovery: { how: "Use freeflow_search action=expand with evidenceId=ev_test.", evidenceId: "ev_test" },
      },
    },
  };

  const collapsed = renderText(searchTool.renderResult(toolResult, { expanded: false }, testTheme));
  assert.match(collapsed, /1 evidence packet/);
  assert.match(collapsed, /docs\/example\.md:523-527/);
  assert.match(collapsed, /ctrl\+o to expand/);
  assert.doesNotMatch(collapsed, /raw json/);

  const expanded = renderText(searchTool.renderResult(toolResult, { expanded: true }, testTheme));
  assert.match(expanded, /Source/);
  assert.match(expanded, /preserve: important/);
  assert.match(expanded, /Storage/);
  assert.match(expanded, /decisionId: ffdec_test/);
  assert.match(expanded, /Evidence/);
  assert.match(expanded, /evidenceId: ev_test/);
  assert.match(expanded, /source: repo docs\/example\.md/);
  assert.match(expanded, /expandable: true/);
  assert.match(expanded, /exact search: action=retrieve source.kind=repo lineRange=523-527 path=docs\/example\.md/);
  assert.match(expanded, /### Sandbox Permissions/);
  assert.match(expanded, /Recovery/);
  assert.match(expanded, /expand hint: freeflow_search action=expand evidenceId=ev_test/);
});

test("Pi freeflow_run exposes declarative filter schema", () => {
  const { tools } = loadExtension();
  const runTool = tools.find((tool) => tool.name === "freeflow_run");
  assert.ok(runTool);

  assert.deepEqual(runTool.parameters.oneOf, [{ required: ["command"] }, { required: ["script"] }]);

  const script = runTool.parameters.properties.script;
  assert.equal(script.type, "object");
  assert.equal(script.additionalProperties, false);
  assert.deepEqual(script.properties.language.enum, ["javascript", "python", "jq"]);
  assert.equal(script.properties.code.minLength, 1);
  assert.equal(script.properties.limits.properties.timeoutMs.maximum, 30000);
  assert.deepEqual(script.required, ["language", "code"]);

  const filters = runTool.parameters.properties.filters;
  assert.equal(filters.type, "object");
  assert.equal(filters.additionalProperties, false);
  assert.deepEqual(filters.properties.stream.enum, ["stdout", "stderr", "combined"]);
  assert.equal(filters.properties.include.items.minLength, 1);
  assert.equal(filters.properties.exclude.items.minLength, 1);
  assert.match(filters.properties.flags.pattern, /gimsu/);
  assert.equal(filters.properties.head.minimum, 1);
  assert.equal(filters.properties.tail.minimum, 1);
  assert.equal(filters.properties.maxLines.minimum, 1);
  assert.equal(filters.properties.maxBytes.minimum, 1);

  const scriptFilter = runTool.parameters.properties.scriptFilter;
  assert.equal(scriptFilter.type, "object");
  assert.equal(scriptFilter.additionalProperties, false);
  assert.deepEqual(scriptFilter.properties.language.enum, ["javascript", "python", "jq"]);
  assert.equal(scriptFilter.properties.code.minLength, 1);
  assert.equal(scriptFilter.properties.limits.properties.timeoutMs.maximum, 30000);
  assert.deepEqual(scriptFilter.required, ["language", "code"]);
});

test("Pi freeflow_run renders compact and expanded status, evidence, and vault UI", () => {
  const { tools } = loadExtension();
  const runTool = tools.find((tool) => tool.name === "freeflow_run");
  assert.ok(runTool);

  const call = renderText(runTool.renderCall({ command: "npm test -- --runInBand", preserve: "important" }, testTheme));
  assert.match(call, /freeflow_run \$ npm test/);
  assert.match(call, /preserve=important/);

  const toolResult = {
    content: [{ type: "text", text: "raw json should not be the visible UI" }],
    details: {
      result: {
        toolStatus: "ok",
        decisionId: "ffdec_run_test",
        preserve: "important",
        outputId: "ffout_test123",
        recordId: "ffrec_test123",
        execution: { status: "failed", exitCode: 1, durationMs: 842 },
        routing: {
          status: "routed",
          route: "run",
          reason: "Command failed; exact failure evidence was returned and raw output was vaulted before routing.",
        },
        summary: "Command failed with exitCode=1.",
        parser: { name: "test-runner", confidence: 0.92, fidelity: "exact", compressed: true, counts: { testsFailed: 1 } },
        persistence: { status: "vaulted", recoverability: "exact", recoveryOutputId: "ffout_test123" },
        filters: { stream: "stderr", include: ["AssertionError"], sourceLines: 2, selectedLines: 1 },
        scriptFilter: {
          status: "success",
          language: "javascript",
          label: "failures-only",
          rawOutputId: "ffout_test123",
          sourceAliases: ["stdout", "stderr", "combined"],
          outputId: "ffout_script123",
          operation: { kind: "script", language: "javascript", codeSha256: "sha256_abc" },
        },
        importantLines: [
          {
            stream: "stderr",
            lines: "14-16",
            excerpt: "AssertionError: expected false to equal true\nSTACK_BENCH_MARKER exact failure line",
          },
        ],
        recovery: {
          how: "Use freeflow_search with source.kind=vault and outputId=ffout_test123 to recover exact command output.",
          outputId: "ffout_test123",
        },
      },
    },
  };

  const collapsed = renderText(runTool.renderResult(toolResult, { expanded: false }, testTheme));
  assert.match(collapsed, /execution: failed/);
  assert.match(collapsed, /routing: routed/);
  assert.match(collapsed, /ffout_test123/);
  assert.match(collapsed, /ffout_script123/);
  assert.match(collapsed, /parser test-runner 0\.92/);
  assert.match(collapsed, /raw and script output recoverable from vault/);
  assert.match(collapsed, /ctrl\+o to expand/);
  assert.doesNotMatch(collapsed, /raw json/);

  const expanded = renderText(
    runTool.renderResult(toolResult, { expanded: true }, testTheme, { args: { command: "npm test -- --runInBand" } }),
  );
  assert.match(expanded, /Status/);
  assert.match(expanded, /execution.status: failed/);
  assert.match(expanded, /Storage/);
  assert.match(expanded, /decisionId: ffdec_run_test/);
  assert.match(expanded, /recordId: ffrec_test123/);
  assert.match(expanded, /persistence: vaulted \/ exact/);
  assert.match(expanded, /Filters/);
  assert.match(expanded, /stream=stderr/);
  assert.match(expanded, /include=AssertionError/);
  assert.match(expanded, /selected=1\/2/);
  assert.match(expanded, /Script filter/);
  assert.match(expanded, /javascript:success/);
  assert.match(expanded, /rawOutputId: ffout_test123/);
  assert.match(expanded, /sources: stdout, stderr, combined/);
  assert.match(expanded, /sha256_abc/);
  assert.match(expanded, /Parser/);
  assert.match(expanded, /confidence: 0\.92/);
  assert.match(expanded, /counts:.*testsFailed/);
  assert.match(expanded, /Evidence/);
  assert.match(expanded, /AssertionError/);
  assert.match(expanded, /Vault recovery/);
  assert.match(expanded, /source.kind=vault/);
  assert.match(expanded, /exact search: action=retrieve source.kind=vault lineRange=14-16 stream=raw outputId=ffout_script123/);
  assert.match(expanded, /raw command starting point: freeflow_search source.kind=vault outputId=ffout_test123/);
  assert.match(expanded, /details\.result/);
});

test("Pi freeflow_run returns compact model-visible text with full structured details", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-run-compact-text-"));
  try {
    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec() {
        return {
          stdout: "Tests:       1 failed, 24 passed, 25 total\n",
          stderr: "AssertionError: expected false to equal true\nSTACK_BENCH_MARKER exact failure line\n",
          code: 1,
          killed: false,
        };
      },
    };
    freeflowExtension(pi);
    const runTool = tools.find((tool) => tool.name === "freeflow_run");
    assert.ok(runTool);

    const result = await runTool.execute(
      "tool-call",
      { command: "npm test", goal: "verification" },
      undefined,
      undefined,
      context(cwd),
    );

    const visibleText = result.content[0].text;
    const detailsText = JSON.stringify(result.details.result, null, 2);

    assert.match(visibleText, /freeflow_run\|failed/);
    assert.match(visibleText, /exit=1/);
    assert.match(visibleText, /raw=ffout_/);
    assert.match(visibleText, /STACK_BENCH_MARKER exact failure line/);
    assert.match(visibleText, /rec\|vault\|ffout_[^|]+\|stderr\|1-3/);
    assert.match(visibleText, /details\.result/);
    assert.doesNotMatch(visibleText, /^\s*\{/);
    assert.ok(Buffer.byteLength(visibleText, "utf8") < Buffer.byteLength(detailsText, "utf8"));
    assert.ok(Buffer.byteLength(visibleText, "utf8") < 900);

    assert.equal(result.details.result.toolStatus, "ok");
    assert.equal(result.details.result.execution.status, "failed");
    assert.equal(result.details.result.execution.exitCode, 1);
    assert.ok(result.details.result.recovery.outputId.startsWith("ffout_"));
    assert.ok(Array.isArray(result.details.result.importantLines));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_run forwards script producer and does not call host exec when sandbox is disabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-run-script-producer-"));
  try {
    let execCalls = 0;
    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec() {
        execCalls += 1;
        throw new Error("host exec should not be called for sandboxed script producers");
      },
    };
    freeflowExtension(pi);
    const runTool = tools.find((tool) => tool.name === "freeflow_run");
    assert.ok(runTool);

    const result = await runTool.execute(
      "tool-call-script-producer",
      { script: { language: "javascript", code: "RAW_PI_SCRIPT", label: "pi-script" } },
      undefined,
      undefined,
      context(cwd),
    );

    assert.equal(execCalls, 0);
    assert.match(result.content[0].text, /freeflow_run\|failed/);
    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.producer.kind, "script");
    assert.equal(result.details.result.producer.name, "pi-script");
    assert.equal(result.details.result.failure.kind, "script_transform_disabled");
    assert.equal(result.details.result.scriptProducer.status, "unavailable");
    assert.doesNotMatch(JSON.stringify(result), /RAW_PI_SCRIPT/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_batch returns compact summary and preserves child details", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-batch-compact-text-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", outputRouter: { vaultRoot: join(cwd, "vault") } }),
      "utf8",
    );

    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec(_bin, args) {
        const command = args?.[1] ?? "unknown";
        const prefix = command.includes("one") ? "ONE" : "TWO";
        return {
          stdout: Array.from({ length: 20 }, (_, index) => `${prefix}_VISIBLE_BATCH_SENTINEL_${index + 1}`).join("\n") + "\n",
          stderr: "",
          code: 0,
          killed: false,
        };
      },
    };
    freeflowExtension(pi);
    const runTool = tools.find((tool) => tool.name === "freeflow_run");
    const batchTool = tools.find((tool) => tool.name === "freeflow_batch");
    assert.ok(runTool);
    assert.ok(batchTool);

    const batchCtx = context(cwd);
    batchCtx.sessionManager.getSessionId = () => "batch-compact";
    const batch = await batchTool.execute(
      "batch-call",
      {
        steps: [
          { id: "one", kind: "run", input: { command: "fixture one" } },
          { id: "two", kind: "run", input: { command: "fixture two" } },
        ],
      },
      undefined,
      undefined,
      batchCtx,
    );

    const separateCtx = context(cwd);
    separateCtx.sessionManager.getSessionId = () => "batch-separate";
    const separateOne = await runTool.execute("run-one", { command: "fixture one" }, undefined, undefined, separateCtx);
    const separateTwo = await runTool.execute("run-two", { command: "fixture two" }, undefined, undefined, separateCtx);
    const separateVisible = `${separateOne.content[0].text}\n${separateTwo.content[0].text}`;
    const visibleText = batch.content[0].text;

    assert.match(visibleText, /freeflow_batch\|routed/);
    assert.match(visibleText, /steps=2/);
    assert.match(visibleText, /details\.result\.steps/);
    assert.doesNotMatch(visibleText, /^\s*\{/);
    assert.doesNotMatch(visibleText, /VISIBLE_BATCH_SENTINEL/);
    assert.ok(Buffer.byteLength(visibleText, "utf8") < Buffer.byteLength(separateVisible, "utf8"));

    const payload = batch.details.result;
    assert.equal(payload.stepCount, 2);
    assert.equal(payload.okCount, 2);
    assert.equal(payload.failedCount, 0);
    assert.equal(payload.steps[0].result.importantLines[0].excerpt.includes("ONE_VISIBLE_BATCH_SENTINEL_1"), true);
    assert.equal(payload.steps[1].result.importantLines[0].excerpt.includes("TWO_VISIBLE_BATCH_SENTINEL_1"), true);

    const expanded = renderText(batchTool.renderResult(batch, { expanded: true }, testTheme));
    assert.match(expanded, /Steps/);
    assert.match(expanded, /#1 one/);
    assert.match(expanded, /#2 two/);
    assert.match(expanded, /details\.result\.steps/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_batch accepts queries and renders compact answers", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-batch-query-text-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", outputRouter: { vaultRoot: join(cwd, "vault") } }),
      "utf8",
    );

    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec() {
        return {
          stdout: "query answer source\nBATCH_QUERY_VISIBLE_FACT_99\n",
          stderr: "",
          code: 0,
          killed: false,
        };
      },
    };
    freeflowExtension(pi);
    const batchTool = tools.find((tool) => tool.name === "freeflow_batch");
    assert.ok(batchTool);
    assert.ok(batchTool.parameters.properties.queries);

    const batchCtx = context(cwd);
    batchCtx.sessionManager.getSessionId = () => "batch-query-render";
    const batch = await batchTool.execute(
      "batch-query-call",
      {
        queries: ["BATCH_QUERY_VISIBLE_FACT_99"],
        steps: [
          { id: "fact", kind: "run", input: { command: "fixture fact", preserve: "full" } },
        ],
      },
      undefined,
      undefined,
      batchCtx,
    );

    const visibleText = batch.content[0].text;
    assert.match(visibleText, /q\|answered\|BATCH_QUERY_VISIBLE_FACT_99/);
    assert.match(visibleText, /BATCH_QUERY_VISIBLE_FACT_99/);
    assert.equal(batch.details.result.queries[0].status, "answered");

    const expanded = renderText(batchTool.renderResult(batch, { expanded: true }, testTheme));
    assert.match(expanded, /Query answers/);
    assert.match(expanded, /BATCH_QUERY_VISIBLE_FACT_99/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_run uses outputRouter thresholds and vault root from repo config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-run-config-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          largeOutputLines: 1,
          largeOutputBytes: 10_000,
          vaultRoot: join(cwd, "vault"),
        },
      }),
      "utf8",
    );

    const tools = [];
    const pi = {
      registerTool(tool) {
        tools.push(tool);
      },
      registerCommand() {},
      on() {},
      appendEntry() {},
      sendUserMessage() {},
      async exec() {
        return { stdout: "one\ntwo\n", stderr: "", code: 0, killed: false };
      },
    };
    freeflowExtension(pi);
    const runTool = tools.find((tool) => tool.name === "freeflow_run");
    assert.ok(runTool);

    const result = await runTool.execute(
      "tool-call",
      { command: "fixture" },
      undefined,
      undefined,
      context(cwd),
    );
    const visibleText = result.content[0].text;
    const payload = result.details.result;

    assert.match(visibleText, /freeflow_run\|success/);
    assert.match(visibleText, /route=partial/);
    assert.match(visibleText, /raw=ffout_/);
    assert.doesNotMatch(visibleText, /^\s*\{/);
    assert.equal(payload.toolStatus, "ok");
    assert.equal(payload.routing.status, "partial");
    assert.ok(payload.recovery.outputId.startsWith("ffout_"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_search applies configured generated path hints", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-generated-path-hints-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await mkdir(join(cwd, "custom-generated"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { generatedPaths: ["custom-generated/**"] },
      }),
      "utf8",
    );
    await writeFile(join(cwd, "target.md"), "PI_GENERATED_HINT_MARKER source truth", "utf8");
    await writeFile(
      join(cwd, "custom-generated", "decoy.md"),
      `${"PI_GENERATED_HINT_MARKER source truth ".repeat(1000)}pihintsentinel`,
      "utf8",
    );

    const { tools } = loadExtension();
    const searchTool = tools.find((tool) => tool.name === "freeflow_search");
    assert.ok(searchTool);

    const broad = await searchTool.execute(
      "search-generated-hints",
      {
        action: "query",
        source: { kind: "repo" },
        query: "PI_GENERATED_HINT_MARKER source truth",
      },
      undefined,
      undefined,
      context(cwd),
    );
    const broadVisible = broad.content[0].text;
    const broadPayload = broad.details.result;
    assert.match(broadVisible, /freeflow_search\|routed/);
    assert.doesNotMatch(broadVisible, /^\s*\{/);
    assert.ok(Buffer.byteLength(broadVisible, "utf8") < Buffer.byteLength(JSON.stringify(broadPayload, null, 2), "utf8"));
    assert.equal(broadPayload.evidence[0].path, "target.md");
    assert.doesNotMatch(broadPayload.evidence[0].excerpt, /pihintsentinel/);

    const explicit = await searchTool.execute(
      "search-generated-explicit",
      {
        action: "query",
        source: { kind: "repo", path: "custom-generated/decoy.md" },
        query: "pihintsentinel",
      },
      undefined,
      undefined,
      context(cwd),
    );
    const explicitPayload = explicit.details.result;
    assert.equal(explicitPayload.evidence[0].path, "custom-generated/decoy.md");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_search supports vault-wide query without outputId", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-vault-wide-query-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const vaultRoot = join(cwd, "vault");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", outputRouter: { vaultRoot } }),
      "utf8",
    );

    const sessionId = "pi-vault-wide-query-session";
    const stored = await storeTextOutput(createVault({ root: vaultRoot }), {
      sessionId,
      sourceKind: "mcp",
      raw: "PI_VAULT_WIDE_TARGET through registered Pi tool",
      producer: { kind: "mcp", server: "github", tool: "search_issues" },
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const { tools } = loadExtension();
    const searchTool = tools.find((tool) => tool.name === "freeflow_search");
    assert.ok(searchTool);
    const ctx = context(cwd);
    ctx.sessionManager.getSessionId = () => sessionId;

    const result = await searchTool.execute(
      "search-vault-wide-query",
      {
        action: "query",
        source: { kind: "vault" },
        query: "PI_VAULT_WIDE_TARGET",
        filters: { producerKind: "mcp", server: "github" },
      },
      undefined,
      undefined,
      ctx,
    );
    const visibleText = result.content[0].text;
    const payload = result.details.result;
    assert.match(visibleText, /freeflow_search\|routed/);
    assert.match(visibleText, /PI_VAULT_WIDE_TARGET/);
    assert.doesNotMatch(visibleText, /^\s*\{/);
    assert.equal(payload.toolStatus, "ok");
    assert.equal(payload.evidence[0].source.outputId, stored.outputId);
    assert.equal(payload.evidence[0].source.stream, "raw");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi reports invalid outputRouter config warnings", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-invalid-config-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { postToolRouting: "always" },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const notifications = [];
    const ctx = context(cwd);
    ctx.ui.notify = (message, level) => notifications.push({ message, level });
    await handlers.get("session_start")({}, ctx);

    assert.equal(notifications[0].level, "warning");
    assert.match(notifications[0].message, /postToolRouting/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi observed routing vaults and labels configured MCP output before native safety net", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-observed-mcp-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { vaultRoot: join(cwd, "vault") },
        observedRouting: {
          enabled: true,
          mcp: { servers: { github: { enabled: true, persistence: "exact" } } },
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const toolResult = handlers.get("tool_result");
    const result = await toolResult(
      {
        type: "tool_result",
        toolName: "mcp",
        toolCallId: "mcp-1",
        input: { server: "github", tool: "search_issues" },
        content: [
          {
            type: "text",
            text: JSON.stringify({
              items: [
                { id: 1, title: "Alpha", html_url: "https://github.com/acme/repo/issues/1", body: "x".repeat(500) },
                { id: 2, title: "Beta", html_url: "https://github.com/acme/repo/issues/2", body: "y".repeat(500) },
                { id: 3, title: "Gamma", html_url: "https://github.com/acme/repo/issues/3", body: "z".repeat(500) },
                { id: 4, title: "Delta", html_url: "https://github.com/acme/repo/issues/4", body: "w".repeat(500) },
              ],
            }),
          },
        ],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.ok(result);
    assert.match(result.content[0].text, /Freeflow routed this observed mcp result/);
    assert.match(result.content[0].text, /outputId=ffout_/);
    assert.match(result.content[0].text, /Alpha/);
    assert.match(result.content[0].text, /https:\/\/github\.com\/acme\/repo\/issues\/1/);
    assert.doesNotMatch(result.content[0].text, /xxxxxxxxxxxxxxxx/);
    assert.equal(result.details.freeflowObservedRouting.route, "observed");
    assert.equal(result.details.freeflowObservedRouting.producer.server, "github");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi observed routing leaves disabled MCP producer result unchanged", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-observed-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        observedRouting: {
          enabled: true,
          mcp: { servers: { github: { enabled: false } } },
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const result = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "mcp",
        toolCallId: "mcp-disabled",
        input: { server: "github", tool: "search_issues" },
        content: [{ type: "text", text: "unchanged" }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.equal(result, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi observed routing fails open without losing MCP output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-observed-fail-open-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const fileVault = join(cwd, "vault-file");
    await writeFile(fileVault, "not a directory", "utf8");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { vaultRoot: fileVault },
        observedRouting: {
          enabled: true,
          mcp: { servers: { github: { enabled: true, persistence: "exact" } } },
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const result = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "mcp",
        toolCallId: "mcp-fail-open",
        input: { server: "github", tool: "search_issues" },
        content: [{ type: "text", text: "original mcp output survives" }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.ok(result);
    assert.match(result.content[0].text, /Freeflow observed-routing warning/);
    assert.match(result.content[0].text, /original mcp output survives/);
    assert.equal(result.details.freeflowObservedRouting.routingStatus, "failed");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi post-tool safety net passes native output unchanged when config is off", async () => {
  const { handlers } = loadExtension();
  const toolResult = handlers.get("tool_result");
  assert.ok(toolResult);

  const raw = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
  const result = await toolResult(
    {
      type: "tool_result",
      toolName: "read",
      toolCallId: "read-1",
      input: { path: "large.txt" },
      content: [{ type: "text", text: raw }],
      details: undefined,
      isError: false,
    },
    context(),
  );

  assert.equal(result, undefined);
});

test("Pi post-tool safety net vaults and labels large native bash output when enabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-safety-net-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          postToolRouting: "safety-net",
          largeOutputLines: 3,
          largeOutputBytes: 100_000,
          vaultRoot: join(cwd, "vault"),
        },
      }),
      "utf8",
    );

    const { handlers, tools } = loadExtension();
    const toolResult = handlers.get("tool_result");
    const raw = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
    const result = await toolResult(
      {
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-1",
        input: { command: "npm test" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.ok(result);
    const routedText = result.content[0].text;
    assert.match(routedText, /Freeflow routed this native bash result/);
    assert.match(routedText, /outputId=ffout_/);
    assert.doesNotMatch(routedText, /line 20/);

    const outputId = routedText.match(/outputId=(ffout_[a-f0-9]+)/)?.[1];
    assert.ok(outputId);
    const searchTool = tools.find((tool) => tool.name === "freeflow_search");
    const searched = await searchTool.execute(
      "search-1",
      {
        action: "retrieve",
        source: { kind: "vault", outputId, stream: "raw" },
        lineRange: { start: 18, end: 20 },
      },
      undefined,
      undefined,
      context(cwd),
    );
    const payload = searched.details.result;
    assert.doesNotMatch(searched.content[0].text, /^\s*\{/);
    assert.equal(payload.evidence[0].excerpt, "line 18\nline 19\nline 20");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi post-tool safety net notes exact duplicate native output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-safety-net-duplicate-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          postToolRouting: "safety-net",
          largeOutputLines: 3,
          largeOutputBytes: 100_000,
          vaultRoot: join(cwd, "vault"),
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const toolResult = handlers.get("tool_result");
    const raw = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
    const first = await toolResult(
      {
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-duplicate-1",
        input: { command: "npm test" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );
    const firstOutputId = first.content[0].text.match(/outputId=(ffout_[a-f0-9]+)/)?.[1];
    assert.ok(firstOutputId);

    const second = await toolResult(
      {
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-duplicate-2",
        input: { command: "npm test" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.match(second.content[0].text, new RegExp(`Duplicate: exact native output matches previous outputId=${firstOutputId}`));
    assert.equal(second.details.freeflowOutputRouter.duplicateOfOutputId, firstOutputId);
    assert.match(second.content[0].text, /current raw output was vaulted as outputId=ffout_/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi post-tool safety net leaves small native output alone when enabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-small-output-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          postToolRouting: "safety-net",
          largeOutputLines: 100,
          largeOutputBytes: 10_000,
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const result = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-small",
        input: { command: "pwd" },
        content: [{ type: "text", text: "small output" }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.equal(result, undefined);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi post-tool safety net fails open without losing native output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-safety-fail-open-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    const blockedVaultPath = join(cwd, "vault-file");
    await writeFile(blockedVaultPath, "not a directory", "utf8");
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          postToolRouting: "safety-net",
          largeOutputLines: 1,
          largeOutputBytes: 1,
          vaultRoot: blockedVaultPath,
        },
      }),
      "utf8",
    );

    const { handlers } = loadExtension();
    const raw = "line 1\nline 2";
    const result = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "read",
        toolCallId: "read-fail-open",
        input: { path: "large.txt" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.ok(result);
    assert.deepEqual(result.content[0], { type: "text", text: raw });
    assert.match(result.content.at(-1).text, /Freeflow safety-net warning/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi already-activated context still includes output-router skill and safety policy", async () => {
  const { handlers } = loadExtension();
  const beforeAgentStart = handlers.get("before_agent_start");

  const existingPrompt = [
    "## Loaded Workflow Skill",
    "## Loaded Workflow Map",
    "## Loaded Interview Gate Skill",
  ].join("\n");
  const result = await beforeAgentStart({ systemPrompt: existingPrompt }, context());

  assert.match(result.systemPrompt, /## Loaded Output Router Skill/);
  assert.match(result.systemPrompt, /## Loaded Output Router Safety Policy/);
  assert.match(result.systemPrompt, /freeflow_search/);
  assert.match(result.systemPrompt, /freeflow_run/);
  assert.match(result.systemPrompt, /freeflow_search action=transform/);
});

test("Pi reinjects output-router context when safety policy is missing", async () => {
  const { handlers } = loadExtension();
  const beforeAgentStart = handlers.get("before_agent_start");

  const existingPrompt = [
    "## Loaded Workflow Skill",
    "## Loaded Workflow Map",
    "## Loaded Interview Gate Skill",
    "## Loaded Output Router Skill",
  ].join("\n");
  const result = await beforeAgentStart({ systemPrompt: existingPrompt }, context());

  assert.match(result.systemPrompt, /## Loaded Output Router Safety Policy/);
  assert.match(result.systemPrompt, /Capture raw evidence before transformation/);
});
