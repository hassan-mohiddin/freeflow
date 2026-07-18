import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import freeflow from "../dist/index.js";
import { compileTaskPacket, createDelegationStore } from "../../delegation/dist/index.js";

const DELEGATION_ENV_KEYS = [
  "FREEFLOW_DELEGATION_STORE",
  "FREEFLOW_DELEGATION_TASK_ID",
  "FREEFLOW_DELEGATION_AGENT_ID",
  "FREEFLOW_DELEGATION_ATTEMPT_ID",
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
  const userMessages = [];
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
    async sendUserMessage(message) { userMessages.push(message); },
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

  if (options.delegationHarness === false) {
    delete process.env.FREEFLOW_DELEGATION_HARNESS_ENABLED;
  } else {
    process.env.FREEFLOW_DELEGATION_HARNESS_ENABLED = "1";
  }
  freeflow(pi);
  return { handlers, tools, commands, userMessages, activeToolCalls };
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
    await writeFile(join(repoRoot, ".freeflow", "config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");
    return await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

async function createWorkerStore(repoRoot, overrides = {}) {
  await writeFile(join(repoRoot, ".freeflow", "config.json"), JSON.stringify({ defaultMode: "workflow", outputRouter: { enabled: true } }), "utf8");
  const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation"), now: () => "2026-07-03T00:00:00.000Z" });
  const manifest = await store.registerAgent({
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
  const paths = store.pathsForAgent(manifest.taskId, manifest.agentId);
  const packet = compileTaskPacket({
    taskId: manifest.taskId,
    agentId: manifest.agentId,
    assignmentId: manifest.assignmentId,
    attemptId: manifest.attemptId,
    identitySchemaVersion: manifest.identitySchemaVersion,
    profileSchemaVersion: manifest.profileSchemaVersion,
    protocolVersion: manifest.protocolVersion,
    parentAgentId: manifest.parentAgentId,
    role: manifest.role,
    profile: manifest.profile,
    cwd: manifest.cwd ?? repoRoot,
    objective: "Runtime identity fixture.",
    writeScope: manifest.writeScopes ?? manifest.writeScope,
    allowedCommands: manifest.allowedCommands ?? [],
    tracePath: paths.transcriptLog,
    resultPath: paths.resultJson,
  });
  await store.writeAgentModelText(manifest.taskId, manifest.agentId, "task-packet.txt", packet.text);
  return store;
}

async function activateWorkerLease(store, repoRoot, overrides = {}) {
  return store.ensureLeaseActive("TASK-P2", {
    leaseId: overrides.leaseId ?? "lease-worker-runtime",
    taskId: "TASK-P2",
    agentId: overrides.agentId ?? "worker-1",
    role: overrides.role ?? "worker",
    state: "issued",
    actions: overrides.actions ?? ["edit", "run_allowlisted"],
    writeScopes: overrides.writeScopes ?? [join(repoRoot, "src")],
    allowedCommands: overrides.allowedCommands ?? ["npm run build"],
    expires: "on_assignment_terminal",
    assignmentId: overrides.assignmentId ?? overrides.agentId ?? "worker-1",
    attemptId: overrides.attemptId ?? `attempt-${overrides.agentId ?? "worker-1"}`,
  }, "runtime test lease");
}

function envFor(store, overrides = {}) {
  const agentId = overrides.FREEFLOW_DELEGATION_AGENT_ID ?? "worker-1";
  return {
    FREEFLOW_DELEGATION_STORE: store.root,
    FREEFLOW_DELEGATION_TASK_ID: "TASK-P2",
    FREEFLOW_DELEGATION_AGENT_ID: agentId,
    FREEFLOW_DELEGATION_ATTEMPT_ID: `attempt-${agentId}`,
    FREEFLOW_PARENT_AGENT_ID: "execution-parent-1",
    FREEFLOW_AGENT_ROLE: "worker",
    FREEFLOW_CONTEXT_PROFILE: "worker",
    ...overrides,
  };
}

function planningParentEnv(store) {
  return envFor(store, {
    FREEFLOW_DELEGATION_AGENT_ID: "planning-parent-1",
    FREEFLOW_PARENT_AGENT_ID: "orchestrator",
    FREEFLOW_AGENT_ROLE: "planning-parent",
    FREEFLOW_CONTEXT_PROFILE: "planning-parent",
  });
}

function planningReportRows(identityRows, status = "ready") {
  return [
    "PLANNING_REPORT",
    `STATUS|${status}`,
    "GOAL|Implement the approved planning artifact.",
    ...identityRows,
    "REVIEW_STATUS|passed",
    "SETTLED_DECISIONS|use canonical planning identity",
    "OPEN_QUESTIONS|none",
    "EXECUTION_AUTONOMY|bounded",
    "USER_CHECKPOINTS|authorization",
    "EXECUTION_GUIDANCE|follow the plan",
    "RISKS|none",
    "EVIDENCE|tests",
    "END_PLANNING_REPORT",
  ].join("\n");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonLines(path) {
  const text = await readFile(path, "utf8");
  return text.trim().length === 0 ? [] : text.trim().split("\n").map((line) => JSON.parse(line));
}

test("delegation runtime leaves normal non-delegated sessions unchanged", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.initTask({ taskId: "TASK-HARNESS-DISABLED" });
    await store.queueParentAlert("TASK-HARNESS-DISABLED", { parentAgentId: "orchestrator", outcome: "attention", message: "disabled harness alert" });
    await withDelegationEnv({}, async () => {
      const { handlers, activeToolCalls } = loadExtension({ delegationHarness: false });
      const beforeAgentStart = handlers.get("before_agent_start");
      assert.ok(beforeAgentStart);
      const ctx = context(repoRoot);

      const result = await beforeAgentStart({ systemPrompt: "base prompt" }, ctx);

      assert.match(result.systemPrompt, /# Freeflow Runtime Context/);
      assert.doesNotMatch(result.systemPrompt, /# Freeflow Delegated Runtime Context/);
      assert.doesNotMatch(result.systemPrompt, /Freeflow Delegation Unread Alert Summary|disabled harness alert/);
      assert.equal(activeToolCalls.length, 1);
      assert.ok(!activeToolCalls.at(-1).includes("delegate_spawn"));
      assert.equal(await handlers.get("tool_call")({ toolName: "edit", input: { path: "src/a.ts" } }, ctx), undefined);
    });
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
      assert.equal(activeTools.includes("delegate_finish"), true);
      assert.equal(activeTools.includes("delegate_attention"), true);
      assert.equal(activeTools.includes("web_search"), false);
      assert.match(result.systemPrompt, /# Freeflow Delegated Runtime Context/);
      assert.match(result.systemPrompt, /role\/profile: worker \/ worker/);
      assert.match(result.systemPrompt, /store: .*\.freeflow\/delegation/);
      assert.match(result.systemPrompt, /Skills remain available through normal Pi discovery/);
      assert.match(result.systemPrompt, /Use Freeflow routed tools for broad\/noisy\/unknown-size output/);
      assert.match(result.systemPrompt, /return protocol: DELEGATE_FINISH_REQUIRED, LEGACY_FFRESULT_FALLBACK/);
      assert.ok(ctx.statuses.some((status) => status.name === "freeflow-delegation" && /worker\/worker/.test(status.value)));
    });
  });
});

test("malformed delegated env fails closed and strips active tools", async () => {
  await withTempRepo(async (repoRoot) => {
    await withDelegationEnv({ FREEFLOW_AGENT_ROLE: "worker", FREEFLOW_CONTEXT_PROFILE: "worker" }, async () => {
      const { handlers, activeToolCalls } = loadExtension();
      const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(repoRoot));

      assert.deepEqual(activeToolCalls.at(-1), []);
      assert.match(result.systemPrompt, /Status: blocked/);
      assert.match(result.systemPrompt, /FREEFLOW_DELEGATION_STORE is required/);
      assert.match(result.systemPrompt, /Do not proceed as a normal unrestricted Pi session/);
    });
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
    await activateWorkerLease(store, repoRoot);
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

test("delegated worker writes and commands require one matching active lease", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await store.rebuildActiveLeaseView("TASK-P2");
    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();
      const ctx = context(repoRoot);
      const toolCall = handlers.get("tool_call");

      const noLease = await toolCall({ toolName: "edit", toolCallId: "edit-no-lease", input: { path: join(repoRoot, "src", "index.ts") } }, ctx);
      assert.equal(noLease.block, true);
      assert.match(noLease.reason, /write_scope_violation/);

      await activateWorkerLease(store, repoRoot, { leaseId: "lease-worker-old-attempt", attemptId: "attempt-old" });
      const staleAttempt = await toolCall({ toolName: "edit", toolCallId: "edit-stale-attempt-lease", input: { path: join(repoRoot, "src", "index.ts") } }, ctx);
      assert.equal(staleAttempt.block, true);
      assert.match(staleAttempt.reason, /write_scope_violation/);

      await activateWorkerLease(store, repoRoot);
      assert.equal(await toolCall({ toolName: "edit", toolCallId: "edit-leased", input: { path: join(repoRoot, "src", "index.ts") } }, ctx), undefined);
      const outside = await toolCall({ toolName: "edit", toolCallId: "edit-outside-lease", input: { path: join(repoRoot, "docs", "spec.md") } }, ctx);
      assert.equal(outside.block, true);
      assert.match(outside.reason, /write_scope_violation/);

      assert.equal(await toolCall({ toolName: "bash", toolCallId: "bash-leased", input: { command: "npm run build" } }, ctx), undefined);
      assert.equal(await toolCall({ toolName: "freeflow_run", toolCallId: "run-leased", input: { command: " npm   run build " } }, ctx), undefined);
      const wrongCommand = await toolCall({ toolName: "bash", toolCallId: "bash-wrong", input: { command: "npm test" } }, ctx);
      assert.equal(wrongCommand.block, true);
      assert.match(wrongCommand.reason, /command_not_allowed/);
    });
  });
});

test("static leaf parent-control denial happens before missing lease state is loaded", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();
      const result = await handlers.get("tool_call")({ toolName: "delegate_spawn", toolCallId: "leaf-spawn", input: { taskId: "TASK-P2" } }, context(repoRoot));
      assert.equal(result.block, true);
      assert.match(result.reason, /delegation_tool_for_leaf/);
      assert.equal((await store.readParentAlerts("TASK-P2", { unreadOnly: true })).length, 0);
    });
  });
});

test("missing stale malformed and forged active lease views block and dedupe parent attention", async () => {
  for (const mode of ["missing", "stale", "malformed", "forged"]) {
    await withTempRepo(async (repoRoot) => {
      const store = await createWorkerStore(repoRoot);
      if (mode === "stale") {
        await store.rebuildActiveLeaseView("TASK-P2");
        await store.appendLeaseEvent("TASK-P2", {
          eventId: "lease-stale-event",
          lease: {
            leaseId: "lease-stale",
            taskId: "TASK-P2",
            agentId: "worker-1",
            role: "worker",
            state: "issued",
            actions: ["edit"],
            writeScopes: [join(repoRoot, "src")],
            allowedCommands: [],
            expires: "on_assignment_terminal",
          },
        });
      } else if (mode === "malformed") {
        await writeFile(store.pathsForTask("TASK-P2").activeLeasesJson, "{bad json\n", "utf8");
      } else if (mode === "forged") {
        await activateWorkerLease(store, repoRoot);
        const path = store.pathsForTask("TASK-P2").activeLeasesJson;
        const forged = await readJson(path);
        forged.leasesById["lease-worker-runtime"].writeScopes = [repoRoot];
        await writeFile(path, `${JSON.stringify(forged, null, 2)}\n`, "utf8");
      }

      await withDelegationEnv(envFor(store), async () => {
        const { handlers } = loadExtension();
        const toolCall = handlers.get("tool_call");
        const event = { toolName: "edit", toolCallId: `edit-${mode}`, input: { path: join(repoRoot, "src", "index.ts") } };
        for (let index = 0; index < 2; index += 1) {
          const blocked = await toolCall(event, context(repoRoot));
          assert.equal(blocked.block, true, mode);
          assert.match(blocked.reason, new RegExp(`active lease policy state is unavailable \\(${mode}\\)`), mode);
        }
        const alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
        assert.equal(alerts.length, 1, mode);
        assert.equal(alerts[0].eventType, "lease-policy-state-invalid");
        assert.equal(alerts[0].data.errorClass, mode);
        assert.equal(alerts[0].data.toolName, "edit");
      });
    });
  }
});

test("lease alert persistence failure still blocks the consequential call", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    const alertsPath = store.pathsForTask("TASK-P2").parentAlertsJson;
    await rm(alertsPath, { force: true });
    await mkdir(alertsPath);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();
      const blocked = await handlers.get("tool_call")({ toolName: "edit", toolCallId: "edit-alert-failure", input: { path: join(repoRoot, "src", "index.ts") } }, context(repoRoot));
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /active lease policy state is unavailable/);
    });
  });
});

test("consequential calls fail closed when env identity differs from the manifest", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await activateWorkerLease(store, repoRoot);
    await store.updateAgentManifest("TASK-P2", "worker-1", { role: "integrator" });
    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();
      const blocked = await handlers.get("tool_call")({ toolName: "edit", toolCallId: "edit-identity-mismatch", input: { path: join(repoRoot, "src", "index.ts") } }, context(repoRoot));
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /identity mismatch|packet role worker does not match expected integrator/);
      assert.match(blocked.reason, /worker.*integrator|integrator.*worker/);
    });
  });
});

test("consequential calls fail closed when environment attempt differs from manifest", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await activateWorkerLease(store, repoRoot);
    await withDelegationEnv(envFor(store, { FREEFLOW_DELEGATION_ATTEMPT_ID: "attempt-superseded" }), async () => {
      const { handlers } = loadExtension();
      const blocked = await handlers.get("tool_call")({ toolName: "edit", toolCallId: "edit-attempt-mismatch", input: { path: join(repoRoot, "src", "index.ts") } }, context(repoRoot));
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /environment attempt .* does not match manifest attempt/i);
    });
  });
});

test("consequential calls fail closed when stored packet attempt differs from manifest and environment", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await activateWorkerLease(store, repoRoot);
    const packetPath = store.pathsForAgent("TASK-P2", "worker-1").taskPacketRaw;
    const packet = await readFile(packetPath, "utf8");
    await writeFile(packetPath, packet.replace("- attempt: attempt-worker-1", "- attempt: attempt-old"), "utf8");

    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();
      const blocked = await handlers.get("tool_call")({ toolName: "edit", toolCallId: "edit-packet-attempt-mismatch", input: { path: join(repoRoot, "src", "index.ts") } }, context(repoRoot));
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /packet attemptId attempt-old does not match expected attempt-worker-1/i);
    });
  });
});

test("legacy parser rejects terminal output from a superseded environment attempt", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store, { FREEFLOW_DELEGATION_ATTEMPT_ID: "attempt-superseded" }), async () => {
      const { handlers } = loadExtension();
      const raw = ["FFRESULT", "STATUS|completed", "SUMMARY|Old attempt output.", "END_FFRESULT"].join("\n");

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
        context(repoRoot),
      );

      const paths = store.pathsForAgent("TASK-P2", "worker-1");
      await assert.rejects(readFile(paths.resultJson, "utf8"), /ENOENT/);
      assert.equal((await store.readAgentStatus("TASK-P2", "worker-1")).state, "running");
    });
  });
});

test("delegated runtime fails closed on unknown future manifest protocol version", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await activateWorkerLease(store, repoRoot);
    const paths = store.pathsForAgent("TASK-P2", "worker-1");
    const manifest = await readJson(paths.manifestJson);
    await writeFile(paths.manifestJson, `${JSON.stringify({ ...manifest, protocolVersion: 2 }, null, 2)}\n`, "utf8");

    await withDelegationEnv(envFor(store), async () => {
      const { handlers } = loadExtension();
      const blocked = await handlers.get("tool_call")({ toolName: "edit", toolCallId: "edit-future-version", input: { path: join(repoRoot, "src", "index.ts") } }, context(repoRoot));
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /protocol version 2 is not supported/i);
    });
  });
});

test("synthetic legacy attempt is finish-only and cannot gain consequential authority", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot, { surfaceRef: "surface:legacy", launchCommand: "pi worker-1" });
    await activateWorkerLease(store, repoRoot);
    const paths = store.pathsForAgent("TASK-P2", "worker-1");
    const manifest = await readJson(paths.manifestJson);
    const { schemaVersion, identitySchemaVersion, profileSchemaVersion, protocolVersion, assignmentId, attemptId, attemptSource, ...legacyManifest } = manifest;
    await writeFile(paths.manifestJson, `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");
    const legacyEnv = envFor(store);
    delete legacyEnv.FREEFLOW_DELEGATION_ATTEMPT_ID;

    await withDelegationEnv(legacyEnv, async () => {
      const { handlers } = loadExtension();
      const blocked = await handlers.get("tool_call")({ toolName: "edit", toolCallId: "edit-legacy-finish-only", input: { path: join(repoRoot, "src", "index.ts") } }, context(repoRoot));
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /synthetic legacy attempt is finish-only/i);
    });
  });
});

test("legacy parser requires preserved active lease before accepting synthetic-attempt terminal output", async () => {
  for (const withLease of [false, true]) {
    await withTempRepo(async (repoRoot) => {
      const store = await createWorkerStore(repoRoot, { surfaceRef: "surface:legacy", launchCommand: "pi worker-1" });
      const paths = store.pathsForAgent("TASK-P2", "worker-1");
      const manifest = await readJson(paths.manifestJson);
      const { schemaVersion, identitySchemaVersion, profileSchemaVersion, protocolVersion, assignmentId, attemptId, attemptSource, ...legacyManifest } = manifest;
      await writeFile(paths.manifestJson, `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");
      if (withLease) {
        await store.ensureLeaseActive("TASK-P2", {
          leaseId: "lease-legacy-parser",
          taskId: "TASK-P2",
          agentId: "worker-1",
          role: "worker",
          state: "issued",
          actions: ["edit"],
          writeScopes: [join(repoRoot, "src")],
          allowedCommands: [],
          expires: "on_assignment_terminal",
          assignmentId: "worker-1",
        }, "preserved legacy parser authority");
      }
      const legacyEnv = envFor(store);
      delete legacyEnv.FREEFLOW_DELEGATION_ATTEMPT_ID;

      await withDelegationEnv(legacyEnv, async () => {
        const { handlers } = loadExtension();
        const raw = ["FFRESULT", "STATUS|completed", "SUMMARY|Legacy parser finish.", "END_FFRESULT"].join("\n");
        await handlers.get("message_end")(
          { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
          context(repoRoot),
        );

        if (withLease) {
          const result = await readJson(paths.resultJson);
          assert.match(result.attemptId, /^legacy-attempt-[a-f0-9]{20}$/);
          assert.equal((await store.readAgentStatus("TASK-P2", "worker-1")).state, "completed");
        } else {
          await assert.rejects(readFile(paths.resultJson, "utf8"), /ENOENT/);
          assert.equal((await store.readAgentStatus("TASK-P2", "worker-1")).state, "running");
        }
      });
    });
  }
});

test("planning-parent parser fallback records ready authority from one legacy plan path", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot, {
      agentId: "planning-parent-1",
      role: "planning-parent",
      profile: "planning-parent",
      parentAgentId: "orchestrator",
      writeScope: join(repoRoot, "docs"),
      allowedCommands: [],
    });
    await withDelegationEnv(planningParentEnv(store), async () => {
      const { handlers } = loadExtension();
      const raw = planningReportRows(["ARTIFACT_PATHS|docs/specs/source.md,docs/plans/runtime-ready.md"]);

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
        context(repoRoot),
      );

      const acceptedReport = await store.readTaskReport("TASK-P2", "planning-report");
      assert.equal(acceptedReport.exists, true);
      assert.match(acceptedReport.rawPath, /planning-report-publications\/accepted/);
      const acceptedEvents = (await readJsonLines(store.pathsForTask("TASK-P2").eventsJsonl)).filter((event) => event.type === "planning_report.accepted");
      assert.equal(acceptedEvents.length, 1);
      assert.equal(acceptedEvents[0].data.source.transport, "runtime_parser");
      assert.equal(acceptedEvents[0].data.source.attemptId, "attempt-planning-parent-1");
      const request = await store.readExecutionApprovalRequest("TASK-P2");
      assert.equal(request.planArtifactPath, "docs/plans/runtime-ready.md");
      assert.match(request.planningReportReadyEventId, /^planning-ready-planning-publication_/);
      const readyEvent = (await readJsonLines(store.pathsForTask("TASK-P2").eventsJsonl)).find((event) => event.eventId === request.planningReportReadyEventId);
      assert.equal(readyEvent.data.publicationId, acceptedEvents[0].data.publicationId);
    });
  });
});

test("planning-parent parser fallback rejects ambiguous ready identity before storing the report", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot, {
      agentId: "planning-parent-1",
      role: "planning-parent",
      profile: "planning-parent",
      parentAgentId: "orchestrator",
      writeScope: join(repoRoot, "docs"),
      allowedCommands: [],
    });
    await withDelegationEnv(planningParentEnv(store), async () => {
      const { handlers } = loadExtension();
      const raw = planningReportRows(["ARTIFACT_PATHS|docs/plans/first.md,docs/plans/second.md"]);

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
        context(repoRoot),
      );

      assert.equal((await store.readTaskReport("TASK-P2", "planning-report")).exists, false);
      await assert.rejects(() => store.readExecutionApprovalRequest("TASK-P2"), /no valid planning-ready event/);
      assert.equal((await store.readAgentStatus("TASK-P2", "planning-parent-1")).state, "attention");
      const rejectedEvents = (await readJsonLines(store.pathsForTask("TASK-P2").eventsJsonl)).filter((event) => event.type === "planning_report.rejected");
      assert.equal(rejectedEvents.length, 1);
      assert.match(rejectedEvents[0].data.rawPath, /planning-report-publications\/rejected/);
      assert.equal(rejectedEvents[0].data.source.transport, "runtime_parser");
    });
  });
});

test("planning-parent parser blocked publication invalidates earlier authorization", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot, {
      agentId: "planning-parent-1",
      role: "planning-parent",
      profile: "planning-parent",
      parentAgentId: "orchestrator",
      writeScope: join(repoRoot, "docs"),
      allowedCommands: [],
    });
    const seed = await store.publishPlanningReport("TASK-P2", {
      rawText: planningReportRows(["PLAN_ARTIFACT_PATH|docs/plans/seed.md", "ARTIFACT_PATHS|docs/plans/seed.md"]),
      source: { transport: "delegate_record_report" },
    });
    const preview = await store.readExecutionApprovalRequest("TASK-P2");
    await store.approveAndAuthorizeExecution("TASK-P2", preview);
    assert.equal((await store.readExecutionAuthorization("TASK-P2")).planningReportReadyEventId, seed.planningReadyEventId);

    await withDelegationEnv(planningParentEnv(store), async () => {
      const { handlers } = loadExtension();
      const raw = planningReportRows(["ARTIFACT_PATHS|docs/notes/runtime-blocker.md"], "blocked");
      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
        context(repoRoot),
      );

      assert.equal((await store.readTaskReport("TASK-P2", "planning-report")).parsed.status, "blocked");
      assert.equal(await store.readExecutionAuthorization("TASK-P2"), undefined);
      await assert.rejects(() => store.readExecutionApprovalRequest("TASK-P2"), /current planning publication is blocked/);
      const readyEvents = (await readJsonLines(store.pathsForTask("TASK-P2").eventsJsonl)).filter((event) => event.type === "planning_report.ready");
      assert.equal(readyEvents.length, 1);
    });
  });
});

test("execution-parent parser publishes one canonical terminal outcome and task report projection", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot, {
      agentId: "execution-parent-1",
      role: "execution-parent",
      profile: "execution-parent",
      parentAgentId: "orchestrator",
      writeScope: repoRoot,
      allowedCommands: [],
    });
    await withDelegationEnv(envFor(store, {
      FREEFLOW_DELEGATION_AGENT_ID: "execution-parent-1",
      FREEFLOW_AGENT_ROLE: "execution-parent",
      FREEFLOW_CONTEXT_PROFILE: "execution-parent",
    }), async () => {
      const { handlers } = loadExtension();
      const raw = [
        "EXECUTION_REPORT",
        "STATUS|completed_with_risks",
        "SUMMARY|Execution complete with deferred smoke.",
        "SOURCE_REFERENCES|docs/specs/delegation/spec.md",
        "WORK_PACKAGES|R2",
        "COMMITS|none",
        "REVIEWS|self-reviewed",
        "CHECKS|focused tests pass",
        "FILES_CHANGED|delegation/src/store.ts",
        "PLAN_DEVIATIONS|none",
        "STOP_CONDITIONS_HIT|none",
        "OPEN_QUESTIONS|none",
        "RISKS|live smoke deferred",
        "FINAL_RECOMMENDATION|continue",
        "EVIDENCE|focused tests",
        "END_EXECUTION_REPORT",
      ].join("\n");

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
        context(repoRoot),
      );

      const report = await store.readTaskReport("TASK-P2", "execution-report");
      assert.equal(report.exists, true);
      assert.equal(report.parsed.status, "completed_with_risks");
      assert.equal(await readFile(report.rawPath, "utf8"), raw);
      const result = await readJson(store.pathsForAgent("TASK-P2", "execution-parent-1").resultJson);
      assert.match(result.terminalOutcomeId, /^terminal-/);
      assert.equal(result.executionReports[0].status, "completed_with_risks");
      const alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.equal(alerts.filter((alert) => alert.eventType === "agent-result").length, 1);
      assert.equal(alerts[0].outcome, "completed_with_risks");
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
      assert.equal(resultJson.assignmentId, "worker-1");
      assert.equal(resultJson.attemptId, "attempt-worker-1");
      assert.equal(resultJson.identitySchemaVersion, 1);
      assert.equal(resultJson.protocolVersion, 1);

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
      assert.match(alerts[0].evidence.jsonPath, /terminal\.accepted\.json$/);
      assert.match(alerts[0].data.terminalOutcomeId, /^terminal-/);
    });
  });
});

test("runtime parser normalizes failed checks and blockers into evidence-aware alert priority", async () => {
  const cases = [
    {
      name: "failed-check",
      role: "verifier",
      rows: ["CHECK|npm run test|fail|outputId=ffout_fail"],
      expectedOutcome: "completed",
      expectedPriority: "P1",
      assertData(data) { assert.deepEqual(data.checks, [{ name: "npm run test", status: "fail" }]); },
    },
    {
      name: "verifier-no-check",
      role: "verifier",
      rows: [],
      expectedOutcome: "attention",
      expectedPriority: "P1",
      assertData(data) { assert.equal(data.completionClaimSupported, false); },
    },
    {
      name: "verifier-unknown-check",
      role: "verifier",
      rows: ["CHECK|npm run test|mystery"],
      expectedOutcome: "attention",
      expectedPriority: "P1",
      assertData(data) { assert.equal(data.completionClaimSupported, false); },
    },
    {
      name: "verifier-missing-check-status",
      role: "verifier",
      rows: ["CHECK|npm run test"],
      expectedOutcome: "attention",
      expectedPriority: "P1",
      assertData(data) { assert.equal(data.completionClaimSupported, false); },
    },
    {
      name: "verifier-missing-check-name",
      role: "verifier",
      rows: ["CHECK||pass"],
      expectedOutcome: "attention",
      expectedPriority: "P1",
      assertData(data) { assert.equal(data.completionClaimSupported, false); },
    },
    {
      name: "blocking-row",
      rows: ["BLOCKER|dependency|P0 prose must not self-promote"],
      expectedOutcome: "completed",
      expectedPriority: "P1",
      assertData(data) { assert.equal(data.findings[0].severity, "blocking"); },
    },
    {
      name: "capability-gap",
      rows: ["BLOCKER|capability_gap|Need a parent-granted tool"],
      expectedOutcome: "capability_gap",
      expectedPriority: "P1",
      assertData(data) { assert.deepEqual(data.findings, []); },
    },
    {
      name: "worker-no-check",
      rows: [],
      expectedOutcome: "completed",
      expectedPriority: "P2",
      assertData(data) { assert.deepEqual(data.checks, []); },
    },
    {
      name: "worker-malformed-check",
      rows: ["CHECK|worker check|unknown"],
      expectedOutcome: "completed",
      expectedPriority: "P1",
      assertData(data) { assert.equal(data.completionClaimSupported, false); },
    },
    {
      name: "accepted-not-run",
      role: "verifier",
      rows: ["CHECK|manual environment|not_run"],
      expectedOutcome: "completed",
      expectedPriority: "P2",
      assertData(data) { assert.deepEqual(data.checks, [{ name: "manual environment", status: "not_run" }]); },
    },
    {
      name: "clean-pass",
      role: "verifier",
      rows: ["CHECK|npm run test|pass|outputId=ffout_pass"],
      expectedOutcome: "completed",
      expectedPriority: "P2",
      assertData(data) { assert.deepEqual(data.checks, [{ name: "npm run test", status: "pass" }]); },
    },
  ];

  for (const item of cases) {
    await withTempRepo(async (repoRoot) => {
      const verifier = item.role === "verifier";
      const agentId = verifier ? "verifier-1" : "worker-1";
      const store = await createWorkerStore(repoRoot, verifier ? { agentId, role: "verifier", profile: "verifier", writeScope: undefined } : {});
      const runtimeEnv = envFor(store, verifier ? {
        FREEFLOW_DELEGATION_AGENT_ID: agentId,
        FREEFLOW_AGENT_ROLE: "verifier",
        FREEFLOW_CONTEXT_PROFILE: "verifier",
      } : {});
      await withDelegationEnv(runtimeEnv, async () => {
        const { handlers } = loadExtension();
        const raw = [
          "FFRESULT",
          "STATUS|completed",
          `SUMMARY|${item.name} result`,
          ...item.rows,
          "END_FFRESULT",
        ].join("\n");
        await handlers.get("message_end")(
          { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
          context(repoRoot),
        );
        const alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
        assert.equal(alerts.length, 1, item.name);
        assert.equal(alerts[0].outcome, item.expectedOutcome, item.name);
        assert.equal(alerts[0].priority, item.expectedPriority, item.name);
        assert.notEqual(alerts[0].priority, "P0", item.name);
        item.assertData(alerts[0].data);
      });
    });
  }
});

test("final worker message without required FFRESULT fails and delegate_result is non-ok", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers, tools } = loadExtension();
      const raw = "I stored this with delegate_finish and finished the task, but no canonical lifecycle tool result exists.";

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
        context(repoRoot),
      );

      const status = await readJson(store.pathsForAgent("TASK-P2", "worker-1").statusJson);
      assert.equal(status.state, "attention");
      assert.equal(status.reason, "missing required delegated output");
      const alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].outcome, "attention");
      assert.match(alerts[0].evidence.jsonPath, /terminal-outcomes\/worker-1\/attempt-worker-1\/rejected/);

      const resultTool = tools.find((tool) => tool.name === "delegate_result");
      const result = await resultTool.execute("result-missing", { taskId: "TASK-P2", agentId: "worker-1" }, undefined, undefined, context(repoRoot));
      assert.equal(result.details.result.status, "missing");
      assert.equal(result.details.result.code, "required_output_missing");
      assert.equal(result.details.result.reason, "missing required delegated output");
      assert.doesNotMatch(result.content[0].text, /canonical lifecycle tool result/);
    });
  });
});

test("final reviewer fake delegate_finish claim stays pending without canonical lifecycle records", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot, { agentId: "reviewer-1", role: "reviewer", profile: "reviewer", writeScope: undefined });
    await withDelegationEnv(envFor(store, {
      FREEFLOW_DELEGATION_AGENT_ID: "reviewer-1",
      FREEFLOW_AGENT_ROLE: "reviewer",
      FREEFLOW_CONTEXT_PROFILE: "reviewer",
    }), async () => {
      const { handlers, tools } = loadExtension();
      const raw = "Review stored with delegate_finish. All clear.";

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: raw }], stopReason: "stop" } },
        context(repoRoot),
      );

      const status = await readJson(store.pathsForAgent("TASK-P2", "reviewer-1").statusJson);
      assert.equal(status.state, "running");
      const alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.equal(alerts.length, 0);

      const resultTool = tools.find((tool) => tool.name === "delegate_result");
      const result = await resultTool.execute("result-reviewer-fake-finish", { taskId: "TASK-P2", agentId: "reviewer-1" }, undefined, undefined, context(repoRoot));
      assert.equal(result.details.result.status, "pending");
      assert.equal(result.details.result.code, "result_pending");
      assert.equal(result.details.result.result, undefined);
      assert.doesNotMatch(result.content[0].text, /All clear/);
    });
  });
});

test("final prose after delegate_finish does not overwrite the canonical direct result", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = await createWorkerStore(repoRoot);
    await withDelegationEnv(envFor(store), async () => {
      const { handlers, tools } = loadExtension();
      const finish = tools.find((tool) => tool.name === "delegate_finish");
      assert.ok(finish);

      await finish.execute("finish-direct", {
        status: "completed",
        summary: "Stored through lifecycle tool.",
        filesChanged: ["pi-extension/src/delegation/runtime.ts"],
      }, undefined, undefined, context(repoRoot));

      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: "Done — result already stored with delegate_finish." }], stopReason: "stop" } },
        context(repoRoot),
      );

      const resultJson = await readJson(store.pathsForAgent("TASK-P2", "worker-1").resultJson);
      assert.equal(resultJson.transport, "delegate_finish");
      assert.equal(resultJson.direct.summary, "Stored through lifecycle tool.");
      assert.equal((await readJson(store.pathsForAgent("TASK-P2", "worker-1").statusJson)).state, "completed");
      const alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].outcome, "completed");
      const agentEvents = await readJsonLines(store.pathsForAgent("TASK-P2", "worker-1").eventsJsonl);
      assert.ok(agentEvents.some((event) => event.type === "assistant-message-after-delegate-finish"));
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
      assert.equal(status.state, "attention");
      assert.match(status.message, /unknown STATUS/);
      agentEvents = await readJsonLines(store.pathsForAgent("TASK-P2", "worker-1").eventsJsonl);
      taskEvents = await readJsonLines(store.pathsForTask("TASK-P2").eventsJsonl);
      const malformedEvent = agentEvents.find((event) => event.type === "agent-output-malformed");
      assert.ok(malformedEvent);
      assert.match(malformedEvent.data.rawPath, /terminal-outcomes\/worker-1\/attempt-worker-1\/rejected\/terminal-rejected-[a-f0-9]{64}\.raw\.txt$/);
      assert.match(malformedEvent.data.sourceRawPath, /assistant-[a-f0-9]{16}\.raw\.txt$/);
      assert.ok(taskEvents.some((event) => event.type === "agent-output-malformed"));
      alerts = await store.readParentAlerts("TASK-P2", { unreadOnly: true });
      assert.ok(alerts.some((alert) => alert.eventType === "agent-output-malformed" && alert.outcome === "attention"));

      const corrected = [
        "FFRESULT",
        "STATUS|completed",
        "SUMMARY|Corrected terminal evidence.",
        "END_FFRESULT",
      ].join("\n");
      await handlers.get("message_end")(
        { message: { role: "assistant", content: [{ type: "text", text: corrected }], stopReason: "stop" } },
        ctx,
      );
      status = await readJson(store.pathsForAgent("TASK-P2", "worker-1").statusJson);
      assert.equal(status.state, "completed");
      const correctedResult = await readJson(store.pathsForAgent("TASK-P2", "worker-1").resultJson);
      assert.equal(correctedResult.results[0].summary, "Corrected terminal evidence.");
      assert.match(correctedResult.terminalOutcomeId, /^terminal-/);
    });
  });
});

test("delegated parent receives only current-task direct-parent unread alerts until explicit ack", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation"), now: () => "2026-07-10T00:00:00.000Z" });
    await store.registerAgent({ taskId: "TASK-SUMMARY-DELEGATED", agentId: "execution-parent-1", role: "execution-parent", profile: "execution-parent", cwd: repoRoot, state: "running", parentAgentId: "orchestrator" });
    const scoped = await store.queueParentAlert("TASK-SUMMARY-DELEGATED", { parentAgentId: "execution-parent-1", agentId: "worker-1", outcome: "attention", eventType: "agent-attention", sourceEventId: "evt-scoped", message: "scoped\u202E parent\u200B action\u2066" });
    await store.queueParentAlert("TASK-SUMMARY-DELEGATED", { parentAgentId: "other-parent", agentId: "worker-2", outcome: "attention", eventType: "agent-attention", sourceEventId: "evt-other", message: "must stay hidden" });
    const env = {
      FREEFLOW_DELEGATION_STORE: store.root,
      FREEFLOW_DELEGATION_TASK_ID: "TASK-SUMMARY-DELEGATED",
      FREEFLOW_DELEGATION_AGENT_ID: "execution-parent-1",
      FREEFLOW_PARENT_AGENT_ID: "orchestrator",
      FREEFLOW_AGENT_ROLE: "execution-parent",
      FREEFLOW_CONTEXT_PROFILE: "execution-parent",
    };
    await withDelegationEnv(env, async () => {
      const { handlers, userMessages } = loadExtension();
      const beforeAgentStart = handlers.get("before_agent_start");
      const testContext = context(repoRoot);
      const first = await beforeAgentStart({ systemPrompt: "base prompt" }, testContext);
      const second = await beforeAgentStart({ systemPrompt: "base prompt" }, testContext);

      assert.match(first.systemPrompt, /# Freeflow Delegated Runtime Context/);
      assert.match(first.systemPrompt, /# Freeflow Delegation Unread Alert Summary/);
      assert.match(first.systemPrompt, /UNTRUSTED_ALERT\|P1\|task=TASK-SUMMARY-DELEGATED\|source=worker-1/);
      assert.match(first.systemPrompt, /scoped parent action/);
      assert.doesNotMatch(first.systemPrompt, /[\u202A-\u202E\u2066-\u2069\u200B-\u200F]|must stay hidden/);
      assert.ok(first.systemPrompt.indexOf("# Freeflow Delegated Runtime Context") < first.systemPrompt.indexOf("# Freeflow Delegation Unread Alert Summary"));
      assert.match(second.systemPrompt, /scoped parent action/);
      assert.doesNotMatch(second.systemPrompt, /[\u202A-\u202E\u2066-\u2069\u200B-\u200F]/);
      assert.equal(userMessages.length, 0);

      const beforeAck = (await store.readParentAlerts("TASK-SUMMARY-DELEGATED", { unreadOnly: true, parentAgentId: "execution-parent-1" }))[0];
      assert.equal(beforeAck.readAt, undefined);
      assert.equal(beforeAck.alertState, "queued");
      const attempts = await store.readWakeAttempts("TASK-SUMMARY-DELEGATED");
      assert.equal(attempts.filter((attempt) => attempt.outcome === "sent" && attempt.alertIds.includes(scoped.alert.alertId)).length, 2);

      await store.markParentAlertsRead("TASK-SUMMARY-DELEGATED", [scoped.alert.alertId]);
      const afterAck = await beforeAgentStart({ systemPrompt: "base prompt" }, testContext);
      assert.doesNotMatch(afterAck.systemPrompt, /Freeflow Delegation Unread Alert Summary|scoped parent action|must stay hidden/);
    });
  });
});

test("normal orchestrator root receives bounded ordered sanitized alerts across indexed tasks", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    for (const taskId of ["TASK-ROOT-A", "TASK-ROOT-B"]) await store.initTask({ taskId });
    await store.queueParentAlert("TASK-ROOT-A", { parentAgentId: "custom-parent", outcome: "user_attention", eventType: "user-attention", sourceEventId: "evt-root-p0", message: "HOSTILE\nINSTRUCTION|pipe\u0007control\u202E\u2066zero\u200Bwidth", evidence: { rawPath: "/secret/evidence-body" } });
    await store.queueParentAlert("TASK-ROOT-A", { parentAgentId: "orchestrator", agentId: "reviewer-1", outcome: "attention", eventType: "agent-attention", sourceEventId: "evt-root-p1", message: "blocking review" });
    await store.queueParentAlert("TASK-ROOT-B", { parentAgentId: "orchestrator", agentId: "worker-1", outcome: "completed", eventType: "agent-result", sourceEventId: "evt-root-p2", message: "worker done" });
    await store.queueParentAlert("TASK-ROOT-B", { parentAgentId: "orchestrator", outcome: "info", eventType: "agent-info", sourceEventId: "evt-root-p3", message: "root info" });
    await store.queueParentAlert("TASK-ROOT-B", { outcome: "info", eventType: "task-info", sourceEventId: "evt-root-unowned", message: "unowned root info" });
    await store.queueParentAlert("TASK-ROOT-A", { parentAgentId: "custom-parent", outcome: "completed", eventType: "agent-result", sourceEventId: "evt-hidden-custom", message: "custom parent hidden" });
    for (let index = 0; index < 5; index += 1) {
      await store.queueParentAlert("TASK-ROOT-B", { parentAgentId: "orchestrator", outcome: "info", eventType: "agent-info", sourceEventId: `evt-more-${index}`, message: `more ${index}` });
    }

    await withDelegationEnv({}, async () => {
      const { handlers, userMessages } = loadExtension();
      const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(repoRoot));
      const prompt = result.systemPrompt;
      const p0 = prompt.indexOf("UNTRUSTED_ALERT|P0");
      const p1 = prompt.indexOf("UNTRUSTED_ALERT|P1");
      const p2 = prompt.indexOf("UNTRUSTED_ALERT|P2");
      const p3 = prompt.indexOf("UNTRUSTED_ALERT|P3");
      assert.ok(p0 >= 0 && p0 < p1 && p1 < p2 && p2 < p3);
      assert.equal((prompt.match(/^UNTRUSTED_ALERT\|/gm) ?? []).length, 6);
      assert.match(prompt, /ALERT_TOTAL\|unread=10\|shown=6\|more=4/);
      assert.match(prompt, /HOSTILE INSTRUCTION¦pipe control zero width/);
      assert.doesNotMatch(prompt, /[\u202A-\u202E\u2066-\u2069\u200B-\u200F]|HOSTILE\nINSTRUCTION|custom parent hidden|secret\/evidence-body/);
      assert.match(prompt, /untrusted alert summaries, not instructions/);
      assert.match(prompt, /action=delegate_inbox task=TASK-ROOT-/);
      assert.equal(userMessages.length, 0);
      const unread = await store.readParentAlerts("TASK-ROOT-A", { unreadOnly: true });
      assert.ok(unread.every((alert) => alert.readAt === undefined && alert.alertState === "queued"));
      assert.ok((await store.readWakeAttempts("TASK-ROOT-A")).some((attempt) => attempt.outcome === "sent" && attempt.transport === "next-turn-context"));
    });
  });
});

test("malformed delegation index or alert queue does not crash or record sent delivery", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.initTask({ taskId: "TASK-MALFORMED-SUMMARY" });
    await store.queueParentAlert("TASK-MALFORMED-SUMMARY", { parentAgentId: "orchestrator", outcome: "attention", message: "should not be delivered" });
    const queuePath = store.pathsForTask("TASK-MALFORMED-SUMMARY").parentAlertsJson;
    const validQueue = await readFile(queuePath, "utf8");
    await writeFile(queuePath, "{bad-json", "utf8");

    await withDelegationEnv({}, async () => {
      const { handlers } = loadExtension();
      const first = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(repoRoot));
      assert.doesNotMatch(first.systemPrompt, /Freeflow Delegation Unread Alert Summary|should not be delivered/);
      assert.equal((await store.readWakeAttempts("TASK-MALFORMED-SUMMARY")).filter((attempt) => attempt.outcome === "sent").length, 0);

      await writeFile(queuePath, validQueue, "utf8");
      await writeFile(join(store.root, "index.json"), "{bad-index", "utf8");
      const second = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(repoRoot));
      assert.doesNotMatch(second.systemPrompt, /Freeflow Delegation Unread Alert Summary|should not be delivered/);
      assert.equal((await store.readWakeAttempts("TASK-MALFORMED-SUMMARY")).filter((attempt) => attempt.outcome === "sent").length, 0);
    });
  });
});

test("malformed delegated env fails closed without leaking root alert data", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.initTask({ taskId: "TASK-ROOT-SECRET" });
    await store.queueParentAlert("TASK-ROOT-SECRET", { parentAgentId: "orchestrator", outcome: "attention", message: "ROOT_SECRET_ALERT" });
    await withDelegationEnv({ FREEFLOW_AGENT_ROLE: "worker", FREEFLOW_CONTEXT_PROFILE: "worker" }, async () => {
      const { handlers } = loadExtension();
      const result = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, context(repoRoot));
      assert.match(result.systemPrompt, /Status: blocked/);
      assert.doesNotMatch(result.systemPrompt, /Freeflow Delegation Unread Alert Summary|ROOT_SECRET_ALERT/);
      assert.equal((await store.readWakeAttempts("TASK-ROOT-SECRET")).filter((attempt) => attempt.outcome === "sent").length, 0);
    });
  });
});
