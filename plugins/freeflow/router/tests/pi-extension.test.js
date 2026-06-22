import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../pi-extension/dist/index.js";

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

test("Pi registers output-router as a direct command", () => {
  const { commands } = loadExtension();
  const names = commands.map((command) => command.name);

  assert.ok(names.includes("output-router"));
});

test("Pi before_agent_start injects output-router skill context", async () => {
  const { handlers } = loadExtension();
  const beforeAgentStart = handlers.get("before_agent_start");
  assert.ok(beforeAgentStart);

  const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context());

  assert.match(result.systemPrompt, /## Loaded Output Router Skill/);
  assert.match(result.systemPrompt, /name: output-router/);
  assert.match(result.systemPrompt, /freeflow_retrieve/);
  assert.match(result.systemPrompt, /freeflow_run/);
  assert.match(result.systemPrompt, /Native tools stay direct/);
  assert.match(result.systemPrompt, /## Loaded Output Router Safety Policy/);
  assert.match(result.systemPrompt, /Do not silently summarize or compress exactness-sensitive output/);
  assert.doesNotMatch(result.systemPrompt, /large native read\/bash outputs may be vaulted/);
  assert.doesNotMatch(result.systemPrompt, /Output-router config note/);
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
    assert.match(result.systemPrompt, /freeflow_retrieve/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_retrieve renders compact and expanded routed evidence UI", () => {
  const { tools } = loadExtension();
  const retrieveTool = tools.find((tool) => tool.name === "freeflow_retrieve");
  assert.ok(retrieveTool);

  const call = renderText(
    retrieveTool.renderCall(
      {
        action: "query",
        source: { kind: "repo", path: "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md" },
        query: "SandboxPermissions Plain-language meaning",
      },
      testTheme,
    ),
    200,
  );
  assert.match(call, /freeflow_retrieve query repo/);
  assert.match(call, /SandboxPermissions/);

  const toolResult = {
    content: [{ type: "text", text: "raw json should not be the visible UI" }],
    details: {
      result: {
        toolStatus: "ok",
        decisionId: "ffdec_test",
        preserve: "important",
        source: { kind: "repo", path: "docs/example.md" },
        routing: { status: "routed", route: "retrieve", reason: "Deterministic test route." },
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
        recovery: { how: "Use freeflow_retrieve action=expand with evidenceId=ev_test.", evidenceId: "ev_test" },
      },
    },
  };

  const collapsed = renderText(retrieveTool.renderResult(toolResult, { expanded: false }, testTheme));
  assert.match(collapsed, /1 evidence packet/);
  assert.match(collapsed, /docs\/example\.md:523-527/);
  assert.match(collapsed, /ctrl\+o to expand/);
  assert.doesNotMatch(collapsed, /raw json/);

  const expanded = renderText(retrieveTool.renderResult(toolResult, { expanded: true }, testTheme));
  assert.match(expanded, /Evidence/);
  assert.match(expanded, /### Sandbox Permissions/);
  assert.match(expanded, /Recovery/);
  assert.match(expanded, /ev_test/);
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
        execution: { status: "failed", exitCode: 1, durationMs: 842 },
        routing: {
          status: "routed",
          route: "run",
          reason: "Command failed; exact failure evidence was returned and raw output was vaulted before routing.",
        },
        summary: "Command failed with exitCode=1.",
        parser: { name: "test-runner", confidence: 0.92, fidelity: "exact", compressed: true, counts: { testsFailed: 1 } },
        importantLines: [
          {
            stream: "stderr",
            lines: "14-16",
            excerpt: "AssertionError: expected false to equal true\nSTACK_BENCH_MARKER exact failure line",
          },
        ],
        recovery: {
          how: "Use freeflow_retrieve with source.kind=vault and outputId=ffout_test123 to recover exact command output.",
          outputId: "ffout_test123",
        },
      },
    },
  };

  const collapsed = renderText(runTool.renderResult(toolResult, { expanded: false }, testTheme));
  assert.match(collapsed, /execution: failed/);
  assert.match(collapsed, /routing: routed/);
  assert.match(collapsed, /ffout_test123/);
  assert.match(collapsed, /parser test-runner 0\.92/);
  assert.match(collapsed, /raw output recoverable from vault/);
  assert.match(collapsed, /ctrl\+o to expand/);
  assert.doesNotMatch(collapsed, /raw json/);

  const expanded = renderText(
    runTool.renderResult(toolResult, { expanded: true }, testTheme, { args: { command: "npm test -- --runInBand" } }),
  );
  assert.match(expanded, /Status/);
  assert.match(expanded, /execution.status: failed/);
  assert.match(expanded, /Parser/);
  assert.match(expanded, /confidence: 0\.92/);
  assert.match(expanded, /counts:.*testsFailed/);
  assert.match(expanded, /Evidence/);
  assert.match(expanded, /AssertionError/);
  assert.match(expanded, /Vault recovery/);
  assert.match(expanded, /source.kind=vault/);
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
    const payload = JSON.parse(result.content[0].text);

    assert.equal(payload.toolStatus, "ok");
    assert.equal(payload.routing.status, "partial");
    assert.ok(payload.recovery.outputId.startsWith("ffout_"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi freeflow_retrieve applies configured generated path hints", async () => {
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
    const retrieveTool = tools.find((tool) => tool.name === "freeflow_retrieve");
    assert.ok(retrieveTool);

    const broad = await retrieveTool.execute(
      "retrieve-generated-hints",
      {
        action: "query",
        source: { kind: "repo" },
        query: "PI_GENERATED_HINT_MARKER source truth",
      },
      undefined,
      undefined,
      context(cwd),
    );
    const broadPayload = JSON.parse(broad.content[0].text);
    assert.equal(broadPayload.evidence[0].path, "target.md");
    assert.doesNotMatch(broadPayload.evidence[0].excerpt, /pihintsentinel/);

    const explicit = await retrieveTool.execute(
      "retrieve-generated-explicit",
      {
        action: "query",
        source: { kind: "repo", path: "custom-generated/decoy.md" },
        query: "pihintsentinel",
      },
      undefined,
      undefined,
      context(cwd),
    );
    const explicitPayload = JSON.parse(explicit.content[0].text);
    assert.equal(explicitPayload.evidence[0].path, "custom-generated/decoy.md");
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
    const retrieveTool = tools.find((tool) => tool.name === "freeflow_retrieve");
    const retrieved = await retrieveTool.execute(
      "retrieve-1",
      {
        action: "retrieve",
        source: { kind: "vault", outputId, stream: "raw" },
        lineRange: { start: 18, end: 20 },
      },
      undefined,
      undefined,
      context(cwd),
    );
    const payload = JSON.parse(retrieved.content[0].text);
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
  assert.match(result.systemPrompt, /freeflow_retrieve/);
  assert.match(result.systemPrompt, /freeflow_run/);
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
