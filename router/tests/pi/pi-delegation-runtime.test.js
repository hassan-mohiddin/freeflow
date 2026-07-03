import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import freeflow from "../../../pi-extension/dist/index.js";
import { createDelegationStore } from "../../../delegation/dist/index.js";

const DELEGATION_ENV_KEYS = [
  "FREEFLOW_DELEGATION_STORE",
  "FREEFLOW_DELEGATION_TASK_ID",
  "FREEFLOW_DELEGATION_AGENT_ID",
  "FREEFLOW_PARENT_AGENT_ID",
  "FREEFLOW_AGENT_ROLE",
  "FREEFLOW_CONTEXT_PROFILE",
];

const BUILTIN_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "web_search",
  "fetch_content",
  "get_search_content",
  "mcp",
];

function loadExtension(options = {}) {
  const handlers = new Map();
  const tools = [];
  const commands = [];
  const activeToolCalls = [];
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
    async sendUserMessage() {},
    getAllTools() {
      return [...new Set([...BUILTIN_TOOL_NAMES, ...tools.map((tool) => tool.name)])].map((name) => ({
        name,
        sourceInfo: { source: BUILTIN_TOOL_NAMES.includes(name) ? "builtin" : "extension" },
      }));
    },
  };

  if (options.activeTools !== false) {
    pi.setActiveTools = (names) => {
      activeToolCalls.push([...names]);
    };
  }

  freeflow(pi);
  return { handlers, tools, commands, activeToolCalls };
}

function context(cwd = process.cwd()) {
  const notifications = [];
  const statuses = [];
  return {
    cwd,
    notifications,
    statuses,
    sessionManager: {
      getEntries() {
        return [];
      },
      getSessionId() {
        return "pi-delegation-runtime-test";
      },
    },
    ui: {
      setStatus(name, value) {
        statuses.push({ name, value });
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };
}

async function withDelegationEnv(values, fn) {
  const previous = new Map();
  for (const key of DELEGATION_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of DELEGATION_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withTempRepo(fn) {
  const repoRoot = await mkdtemp(join(tmpdir(), "freeflow-pi-delegation-runtime-"));
  try {
    await mkdir(join(repoRoot, ".freeflow"), { recursive: true });
    return await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

async function createWorkerStore(repoRoot, overrides = {}) {
  const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation"), now: () => "2026-07-03T00:00:00.000Z" });
  await store.registerAgent({
    taskId: "TASK-P2",
    agentId: "worker-1",
    role: "worker",
    profile: "worker",
    parentAgentId: "execution-parent-1",
    cwd: repoRoot,
    writeScope: join(repoRoot, "src"),
    allowedCommands: ["npm run build"],
    state: "running",
    ...overrides,
  });
  return store;
}

function envFor(store, overrides = {}) {
  return {
    FREEFLOW_DELEGATION_STORE: store.root,
    FREEFLOW_DELEGATION_TASK_ID: "TASK-P2",
    FREEFLOW_DELEGATION_AGENT_ID: "worker-1",
    FREEFLOW_PARENT_AGENT_ID: "execution-parent-1",
    FREEFLOW_AGENT_ROLE: "worker",
    FREEFLOW_CONTEXT_PROFILE: "worker",
    ...overrides,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonLines(path) {
  const text = await readFile(path, "utf8");
  return text.trim().length === 0 ? [] : text.trim().split("\n").map((line) => JSON.parse(line));
}

test("delegation runtime leaves normal non-delegated sessions unchanged", async () => {
  await withDelegationEnv({}, async () => {
    const { handlers, activeToolCalls } = loadExtension();
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(beforeAgentStart);

    const result = await beforeAgentStart({ systemPrompt: "base prompt" }, context());

    assert.match(result.systemPrompt, /# Freeflow Runtime Context/);
    assert.doesNotMatch(result.systemPrompt, /# Freeflow Delegated Runtime Context/);
    assert.equal(activeToolCalls.length, 0);
    assert.equal(await handlers.get("tool_call")({ toolName: "edit", input: { path: "src/a.ts" } }, context()), undefined);
  });
});

test("delegated worker context is compact and applies active tool profile", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers, activeToolCalls } = loadExtension();
      const ctx = context(repoRoot);

      await handlers.get("session_start")({ reason: "startup" }, ctx);
      const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
      const activeTools = activeToolCalls.at(-1);

      assert.ok(activeTools.includes("read"));
      assert.ok(activeTools.includes("edit"));
      assert.ok(activeTools.includes("freeflow_run"));
      assert.equal(activeTools.includes("delegate_spawn"), false);
      assert.equal(activeTools.includes("web_search"), false);
      assert.match(result.systemPrompt, /# Freeflow Delegated Runtime Context/);
      assert.match(result.systemPrompt, /role\/profile: worker \/ worker/);
      assert.match(result.systemPrompt, /store: .*\.freeflow\/delegation/);
      assert.match(result.systemPrompt, /Skills remain available through normal Pi discovery/);
      assert.match(result.systemPrompt, /Use Freeflow routed tools for broad\/noisy\/unknown-size output/);
      assert.match(result.systemPrompt, /return protocol: FFRESULT_REQUIRED/);
      assert.ok(ctx.statuses.some((status) => status.name === "freeflow-delegation" && /worker\/worker/.test(status.value)));
    });
  });
});

test("malformed delegated env fails closed and strips active tools", async () => {
  await withDelegationEnv({ FREEFLOW_AGENT_ROLE: "worker", FREEFLOW_CONTEXT_PROFILE: "worker" }, async () => {
    const { handlers, activeToolCalls } = loadExtension();
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context());

    assert.deepEqual(activeToolCalls.at(-1), []);
    assert.match(result.systemPrompt, /Status: blocked/);
    assert.match(result.systemPrompt, /FREEFLOW_DELEGATION_STORE is required/);
    assert.match(result.systemPrompt, /Do not proceed as a normal unrestricted Pi session/);
  });
});

test("delegated runtime without setActiveTools blocks prompt and tool calls", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers, activeToolCalls } = loadExtension({ activeTools: false });
      const ctx = context(repoRoot);

      const prompt = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
      assert.equal(activeToolCalls.length, 0);
      assert.match(prompt.systemPrompt, /Status: blocked/);
      assert.match(prompt.systemPrompt, /Pi active-tool API unavailable/);

      const readDecision = await handlers.get("tool_call")(
        { toolName: "read", toolCallId: "read-ambient", input: { path: join(repoRoot, "src", "index.ts") } },
        ctx,
      );
      assert.equal(readDecision.block, true);
      assert.match(readDecision.reason, /delegated_runtime_unavailable/);
      assert.match(readDecision.reason, /Pi active-tool API unavailable/);

      const allowedCommandDecision = await handlers.get("tool_call")(
        { toolName: "freeflow_run", toolCallId: "run-ambient", input: { command: "npm run build" } },
        ctx,
      );
      assert.equal(allowedCommandDecision.block, true);
      assert.match(allowedCommandDecision.reason, /delegated_runtime_unavailable/);

      const agentEvents = await readJsonLines(store.pathsForAgent("TASK-P2", "worker-1").eventsJsonl);
      assert.ok(agentEvents.some((event) => event.type === "delegated-runtime-blocked"));
      assert.ok(agentEvents.some((event) => event.type === "tool-policy-blocked" && event.data.toolName === "read"));
      assert.ok(agentEvents.some((event) => event.type === "tool-policy-blocked" && event.data.toolName === "freeflow_run"));
    });
  });
});

test("delegated tool_call guard blocks scope violations, delegation tools, and disallowed commands", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();
      const ctx = context(repoRoot);

      const allowed = await handlers.get("tool_call")(
        { toolName: "freeflow_run", toolCallId: "allowed", input: { command: "npm run build" } },
        ctx,
      );
      assert.equal(allowed, undefined);

      const outsideWrite = await handlers.get("tool_call")(
        { toolName: "edit", toolCallId: "edit-outside", input: { path: join(repoRoot, "docs", "spec.md") } },
        ctx,
      );
      assert.equal(outsideWrite.block, true);
      assert.match(outsideWrite.reason, /write_scope_violation/);
      assert.match(outsideWrite.reason, /No dynamic tool grants/);

      const disallowedCommand = await handlers.get("tool_call")(
        { toolName: "bash", toolCallId: "bash-disallowed", input: { command: "npm test" } },
        ctx,
      );
      assert.equal(disallowedCommand.block, true);
      assert.match(disallowedCommand.reason, /command_not_allowed/);

      const delegationTool = await handlers.get("tool_call")(
        { toolName: "delegate_spawn", toolCallId: "spawn", input: { role: "worker" } },
        ctx,
      );
      assert.equal(delegationTool.block, true);
      assert.match(delegationTool.reason, /delegation_tool_for_leaf/);

      const agentEvents = await readJsonLines(store.pathsForAgent("TASK-P2", "worker-1").eventsJsonl);
      assert.ok(agentEvents.some((event) => event.type === "tool-policy-blocked" && event.data.code === "write_scope_violation"));
    });
  });
});

test("assistant FFRESULT is parsed, raw text is preserved, and terminal events are stored", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();
      const raw = [
        "Worker prose before result.",
        "FFRESULT",
        "STATUS|completed",
        "SUMMARY|Implemented P2 runtime guard.",
        "FILES_CHANGED|pi-extension/src/delegation/runtime.ts",
        "CHECK|npm run build|pass|outputId=ffout_build",
        "END_FFRESULT",
      ].join("\n");

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
        context(repoRoot),
      );

      const paths = store.pathsForAgent("TASK-P2", "worker-1");
      assert.equal(await readFile(paths.resultRaw, "utf8"), raw);
      const resultJson = await readJson(paths.resultJson);
      assert.equal(resultJson.results[0].status, "completed");
      assert.equal(resultJson.results[0].summary, "Implemented P2 runtime guard.");

      const status = await readJson(paths.statusJson);
      assert.equal(status.state, "completed");
      assert.equal(status.message, "Implemented P2 runtime guard.");

      const agentEvents = await readJsonLines(paths.eventsJsonl);
      const taskEvents = await readJsonLines(store.pathsForTask("TASK-P2").eventsJsonl);
      assert.ok(agentEvents.some((event) => event.type === "agent-result" && event.state === "completed"));
      assert.ok(taskEvents.some((event) => event.type === "agent-result" && event.data.agentId === "worker-1"));
      const alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].outcome, "completed");
      assert.equal(alerts[0].agentId, "worker-1");
      assert.match(alerts[0].evidence.jsonPath, /result\.json$/);
    });
  });
});

test("final worker message without required FFRESULT fails and delegate_result is non-ok", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers, tools } = loadExtension();
      const raw = "I finished the task, but forgot the required result block.";

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
        context(repoRoot),
      );

      const status = await readJson(store.pathsForAgent("TASK-P2", "worker-1").statusJson);
      assert.equal(status.state, "failed");
      assert.equal(status.reason, "missing required delegated output");
      const alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].outcome, "failed");

      const resultTool = tools.find((tool) => tool.name === "delegate_result");
      const result = await resultTool.execute("result-missing", { taskId: "TASK-P2", agentId: "worker-1" }, undefined, undefined, context(repoRoot));
      assert.equal(result.details.result.status, "missing");
      assert.equal(result.details.result.code, "required_output_missing");
      assert.equal(result.details.result.result.status, "pending");
      assert.doesNotMatch(result.content[0].text, /forgot the required result block/);
    });
  });
});

test("FFATTENTION queues one parent alert and pauses the child waiting for parent", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: "FFATTENTION|needs_parent|Need scope decision|route=parent" }], stopReason: "toolUse" } },
        context(repoRoot),
      );

      const status = await readJson(store.pathsForAgent("TASK-P2", "worker-1").statusJson);
      assert.equal(status.state, "waiting_for_parent");
      assert.equal(status.message, "Need scope decision");
      const alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].outcome, "attention");
      assert.equal(alerts[0].message, "Need scope decision");
    });
  });
});

test("routine FFSTATUS stays agent-store-only while malformed status and terminal output fail deterministically", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();
      const ctx = context(repoRoot);

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: "FFSTATUS|running|Checking files|step=1" }], stopReason: "toolUse" } },
        ctx,
      );

      let agentEvents = await readJsonLines(store.pathsForAgent("TASK-P2", "worker-1").eventsJsonl);
      let taskEvents = await readJsonLines(store.pathsForTask("TASK-P2").eventsJsonl);
      assert.ok(agentEvents.some((event) => event.type === "agent-status"));
      assert.equal(taskEvents.some((event) => event.type === "agent-status"), false);
      assert.equal((await store.readParentAlerts("TASK-P2", { unreadOnly: true })).length, 0);

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: "FFSTATUS|mystery|Unknown status typo|step=2" }], stopReason: "toolUse" } },
        ctx,
      );

      let status = await readJson(store.pathsForAgent("TASK-P2", "worker-1").statusJson);
      assert.equal(status.state, "attention");
      assert.match(status.message, /unknown FFSTATUS state: mystery/);
      agentEvents = await readJsonLines(store.pathsForAgent("TASK-P2", "worker-1").eventsJsonl);
      taskEvents = await readJsonLines(store.pathsForTask("TASK-P2").eventsJsonl);
      const malformedStatus = agentEvents.find((event) => event.type === "agent-status-malformed");
      assert.ok(malformedStatus);
      assert.equal(malformedStatus.state, "attention");
      assert.match(malformedStatus.data.rawPath, /assistant-[a-f0-9]{16}\.raw\.txt$/);
      assert.equal(malformedStatus.data.lineNumber, 1);
      assert.ok(taskEvents.some((event) => event.type === "agent-status-malformed" && event.state === "attention"));
      let alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].outcome, "attention");

      const malformed = [
        "FFRESULT",
        "STATUS|mystery",
        "SUMMARY|Bad status.",
        "END_FFRESULT",
      ].join("\n");
      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: malformed }], stopReason: "stop" } },
        ctx,
      );

      status = await readJson(store.pathsForAgent("TASK-P2", "worker-1").statusJson);
      assert.equal(status.state, "failed");
      assert.match(status.message, /unknown STATUS/);
      agentEvents = await readJsonLines(store.pathsForAgent("TASK-P2", "worker-1").eventsJsonl);
      taskEvents = await readJsonLines(store.pathsForTask("TASK-P2").eventsJsonl);
      const malformedEvent = agentEvents.find((event) => event.type === "agent-output-malformed");
      assert.ok(malformedEvent);
      assert.match(malformedEvent.data.rawPath, /assistant-[a-f0-9]{16}\.raw\.txt$/);
      assert.ok(taskEvents.some((event) => event.type === "agent-output-malformed"));
      alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.ok(alerts.some((alert) => alert.outcome === "failed"));
    });
  });
});
