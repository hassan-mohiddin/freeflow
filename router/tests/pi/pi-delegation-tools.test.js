import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import freeflow from "../../../pi-extension/dist/index.js";
import { createDelegationStore, parseModelText } from "../../../delegation/dist/index.js";

const DELEGATION_TOOLS = [
  "delegate_task_init",
  "delegate_spawn",
  "delegate_status",
  "delegate_wait",
  "delegate_result",
  "delegate_send",
  "delegate_capture",
  "delegate_cancel",
  "delegate_close",
  "delegate_record_report",
  "delegate_finish",
  "delegate_attention",
  "delegate_progress",
  "delegate_inbox",
  "delegate_ack_alert",
  "delegate_ack_all",
  "delegate_user_attention",
  "delegate_update_execution_map",
];

const HELP = `cmux help
Commands:
  new-pane [--type terminal]
  send [--surface <id>] <text>
  send-key [--surface <id>] <key>
  read-screen [--surface <id>]
  close-surface [--surface <id>]
`;

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

function loadExtension(execHandler = undefined, options = {}) {
  const tools = new Map();
  const handlers = new Map();
  const calls = [];
  const activeToolCalls = [];
  const pi = {
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand() {},
    on(name, handler) {
      handlers.set(name, handler);
    },
    appendEntry() {},
    async sendUserMessage() {},
    getAllTools() {
      return [...new Set([...BUILTIN_TOOL_NAMES, ...tools.keys()])].map((name) => ({ name }));
    },
    async exec(program, args, options) {
      const command = [program, ...(args ?? [])];
      calls.push({ command, options });
      if (!execHandler) throw new Error(`unexpected exec: ${command.join(" ")}`);
      return execHandler(command, options);
    },
  };
  if (options.activeTools !== false) {
    pi.setActiveTools = (names) => activeToolCalls.push([...names]);
  }
  freeflow(pi);
  return { tools, handlers, calls, activeToolCalls };
}

function ctx(cwd) {
  return {
    cwd,
    ui: { notify() {}, setStatus() {} },
    sessionManager: { getSessionId: () => "pi-delegation-tools-test" },
  };
}

function ok(stdout = "") {
  return { stdout, stderr: "", code: 0, killed: false };
}

function fail(stderr = "failed") {
  return { stdout: "", stderr, code: 1, killed: false };
}

async function withTempRepo(fn) {
  const repoRoot = await mkdtemp(join(tmpdir(), "freeflow-pi-delegation-tools-"));
  try {
    await mkdir(join(repoRoot, ".freeflow"), { recursive: true });
    return await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

const DELEGATION_ENV_CLEAR = {
  FREEFLOW_DELEGATION_STORE: undefined,
  FREEFLOW_DELEGATION_TASK_ID: undefined,
  FREEFLOW_DELEGATION_AGENT_ID: undefined,
  FREEFLOW_PARENT_AGENT_ID: undefined,
  FREEFLOW_AGENT_ROLE: undefined,
  FREEFLOW_CONTEXT_PROFILE: undefined,
};

async function withProcessEnv(values, fn) {
  const previous = new Map();
  for (const key of Object.keys(values)) {
    previous.set(key, process.env[key]);
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function renderText(component, width = 160) {
  return component.render(width).join("\n");
}

const testTheme = {
  fg(_color, text) { return text; },
  bold(text) { return text; },
};

test("Pi registers delegation tools alongside router tools", () => {
  const { tools } = loadExtension(() => ok());
  for (const name of DELEGATION_TOOLS) {
    assert.ok(tools.has(name), `${name} should be registered`);
  }
  assert.ok(tools.has("freeflow_search"));
});

test("delegate_spawn unavailable preflight returns typed result without pane or child startup", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension((command) => {
      if (command.join(" ").includes("command -v 'cmux'")) return fail("cmux missing");
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const spawn = tools.get("delegate_spawn");

    const result = await spawn.execute("spawn-missing", {
      taskId: "TASK-P3",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      objective: "Implement a bounded slice.",
      writeScope: join(repoRoot, "src"),
    }, undefined, undefined, ctx(repoRoot));

    assert.match(result.content[0].text, /delegate_spawn\|DELEGATION_UNAVAILABLE\|cmux_binary_missing/);
    assert.equal(result.details.result.status, "DELEGATION_UNAVAILABLE");
    assert.equal(result.details.result.actionTaken, "no_pane_opened_no_child_pi_started");
    assert.equal(calls.some((call) => call.command.includes("new-pane")), false);
    assert.equal(calls.some((call) => call.command.includes("send")), false);
  });
});

test("delegate_spawn fails before preflight when active-tool gating is unavailable", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension(() => {
      throw new Error("cmux should not be called when active-tool gating is unavailable");
    }, { activeTools: false });
    const spawn = tools.get("delegate_spawn");

    const result = await spawn.execute("spawn-no-active-tools", {
      taskId: "TASK-ACTIVE-TOOLS",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      objective: "Implement a bounded slice.",
      writeScope: join(repoRoot, "src"),
    }, undefined, undefined, ctx(repoRoot));

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "active_tools_unavailable");
    assert.equal(result.details.result.actionTaken, "no_pane_opened_no_child_pi_started");
    assert.equal(calls.length, 0);
  });
});

test("delegate_spawn rejects prose or combined write scopes before cmux preflight", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension(() => {
      throw new Error("cmux should not be called when packet input is malformed");
    });
    const spawn = tools.get("delegate_spawn");

    const result = await spawn.execute("spawn-bad-scope", {
      taskId: "TASK-BAD-SCOPE",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      objective: "Implement a bounded slice.",
      writeScope: "may touch delegation/**, pi-extension/**",
    }, undefined, undefined, ctx(repoRoot));

    assert.equal(result.details.result.toolStatus, "error");
    assert.match(result.details.result.reason, /path or glob scope only/);
    assert.equal(calls.length, 0);
  });
});

test("delegate_spawn writes packet, opens cmux pane, and starts Pi via single-line file-backed command", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension((command) => {
      const text = command.join(" ");
      if (text.includes("command -v 'cmux'")) return ok("/usr/local/bin/cmux\n");
      if (text === "cmux --help") return ok(HELP);
      if (text === "cmux identify") return ok("workspace:1 surface:1\n");
      if (text.includes("command -v 'pi'")) return ok("/usr/local/bin/pi\n");
      if (text.startsWith("cmux new-pane")) return ok("workspace:1 pane:2 surface:3\n");
      if (text.startsWith("cmux send ")) return ok();
      if (text.startsWith("cmux send-key")) return ok();
      throw new Error(`unexpected command: ${text}`);
    });
    const spawn = tools.get("delegate_spawn");
    const writeScopes = [join(repoRoot, "src"), join(repoRoot, "tests")];

    const result = await spawn.execute("spawn-ok", {
      taskId: "TASK-P3",
      agentId: "worker-1",
      parentAgentId: "execution-parent-1",
      role: "worker",
      cwd: repoRoot,
      objective: "Implement P3 worker fixture.",
      writeScope: writeScopes,
      allowedCommands: ["npm run build"],
      sourcePointers: [{ kind: "plan", path: "docs/plans/plan.md" }],
    }, undefined, undefined, ctx(repoRoot));

    assert.equal(result.details.result.status, "running");
    assert.equal(result.details.result.cmux.surfaceRef, "surface:3");
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const packet = await readFile(store.pathsForAgent("TASK-P3", "worker-1").taskPacketRaw, "utf8");
    assert.match(packet, /^# Delegated task: worker-1/);
    assert.match(packet, /Implement P3 worker fixture\./);
    assert.match(packet, /Use `delegate_finish` when complete/);
    assert.match(packet, new RegExp(writeScopes[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(packet, new RegExp(writeScopes[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const manifest = await store.readAgentManifest("TASK-P3", "worker-1");
    const status = await store.readAgentStatus("TASK-P3", "worker-1");
    assert.equal(manifest.surfaceRef, "surface:3");
    assert.deepEqual(manifest.writeScopes, writeScopes);
    assert.equal(manifest.retention, "auto");
    assert.deepEqual(result.details.result.policy.writeScope, writeScopes);
    assert.equal(result.details.result.layout.direction, "right");
    assert.equal(status.state, "running");

    const sendCall = calls.find((call) => call.command[0] === "cmux" && call.command[1] === "send");
    assert.ok(sendCall);
    const sentText = sendCall.command.at(-1);
    assert.match(sentText, /FREEFLOW_DELEGATION_STORE=/);
    assert.match(sentText, /pi --no-session --name 'worker-1' "\$\(cat /);
    assert.doesNotMatch(sentText, /FREEFLOW_TASK_PACKET/);
    assert.doesNotMatch(sentText, /\n/);
  });
});

test("delegate_spawn defaults omitted parentAgentId from delegated parent env", async () => {
  await withTempRepo(async (repoRoot) => {
    await withProcessEnv({ FREEFLOW_DELEGATION_AGENT_ID: "execution-parent-1" }, async () => {
      const { tools } = loadExtension((command) => {
        const text = command.join(" ");
        if (text.includes("command -v 'cmux'")) return ok("/usr/local/bin/cmux\n");
        if (text === "cmux --help") return ok(HELP);
        if (text === "cmux identify") return ok("workspace:1 surface:1\n");
        if (text.includes("command -v 'pi'")) return ok("/usr/local/bin/pi\n");
        if (text.startsWith("cmux new-pane")) return ok("workspace:1 pane:2 surface:3\n");
        if (text.startsWith("cmux send ")) return ok();
        if (text.startsWith("cmux send-key")) return ok();
        throw new Error(`unexpected command: ${text}`);
      });
      const spawn = tools.get("delegate_spawn");

      await spawn.execute("spawn-parent-env", {
        taskId: "TASK-PARENT-ENV",
        agentId: "worker-1",
        role: "worker",
        cwd: repoRoot,
        objective: "Implement bounded fixture.",
        writeScope: join(repoRoot, "src"),
      }, undefined, undefined, ctx(repoRoot));

      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const manifest = await store.readAgentManifest("TASK-PARENT-ENV", "worker-1");
      assert.equal(manifest.parentAgentId, "execution-parent-1");
    });
  });
});

test("delegate_send uses file-backed delivery for multiline follow-ups", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-P3", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:3" });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "send") return ok();
      if (command[0] === "cmux" && command[1] === "send-key") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const send = tools.get("delegate_send");

    const result = await send.execute("send-follow-up", {
      taskId: "TASK-P3",
      agentId: "worker-1",
      kind: "fix",
      message: "Fix this exactly:\n- add test\n- rerun build",
    }, undefined, undefined, ctx(repoRoot));

    assert.equal(result.details.result.delivery.fileBacked, true);
    const packetPath = result.details.result.delivery.packetPath;
    assert.match(await readFile(packetPath, "utf8"), /Fix this exactly/);
    const sendText = calls.find((call) => call.command[1] === "send").command.at(-1);
    assert.match(sendText, /Read and execute .* exactly/);
    assert.doesNotMatch(sendText, /Fix this exactly/);
    assert.doesNotMatch(sendText, /\n/);
  });
});

test("delegate_send rejects terminal agents instead of creating an implicit second attempt", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-SEND-TERMINAL", agentId: "reviewer-1", role: "reviewer", profile: "reviewer", cwd: repoRoot, writeScope: repoRoot, state: "completed", surfaceRef: "surface:3" });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "send") return ok();
      if (command[0] === "cmux" && command[1] === "send-key") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const send = tools.get("delegate_send");

    const result = await send.execute("send-terminal", { taskId: "TASK-SEND-TERMINAL", agentId: "reviewer-1", kind: "follow_up", message: "review again" }, undefined, undefined, ctx(repoRoot));

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "target_terminal_requires_new_attempt");
    assert.equal(calls.length, 0);
  });
});

test("delegate_capture stores screen log without dumping raw screen in normal output", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-P3", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:3" });
    const rawScreen = Array.from({ length: 20 }, (_, index) => `RAW_SCREEN_SENTINEL_${index}`).join("\n");
    const { tools } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "read-screen") return ok(rawScreen);
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const capture = tools.get("delegate_capture");

    const result = await capture.execute("capture", { taskId: "TASK-P3", agentId: "worker-1", lines: 20 }, undefined, undefined, ctx(repoRoot));

    assert.match(result.content[0].text, /delegate_capture\|captured/);
    assert.doesNotMatch(result.content[0].text, /RAW_SCREEN_SENTINEL/);
    const screenLog = await readFile(store.pathsForAgent("TASK-P3", "worker-1").screenLog, "utf8");
    assert.match(screenLog, /RAW_SCREEN_SENTINEL_19/);
  });
});

test("delegate_wait requires timeout, returns timeout heartbeat, and enforces retry cap", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-P4", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:3" });
    const { tools } = loadExtension(() => ok());
    const wait = tools.get("delegate_wait");

    const missingTimeout = await wait.execute("wait-missing-timeout", { taskId: "TASK-P4", agentId: "worker-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(missingTimeout.details.result.toolStatus, "error");
    assert.match(missingTimeout.details.result.reason, /timeoutMs is required/);

    for (let index = 0; index < 3; index += 1) {
      const result = await wait.execute(`wait-${index}`, { taskId: "TASK-P4", agentId: "worker-1", timeoutMs: 1 }, undefined, undefined, ctx(repoRoot));
      assert.equal(result.details.result.status, "timeout");
      assert.equal(result.details.result.heartbeat.state, "running");
    }
    const capped = await wait.execute("wait-cap", { taskId: "TASK-P4", agentId: "worker-1", timeoutMs: 1 }, undefined, undefined, ctx(repoRoot));
    assert.equal(capped.details.result.status, "alert_only");
    assert.equal(capped.details.result.code, "wait_retry_cap_exceeded");
  });
});

test("delegate_wait returns terminal and attention states without treating timeout as failure", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-P4", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "completed", surfaceRef: "surface:3" });
    await store.queueParentAlert("TASK-P4", { agentId: "worker-1", outcome: "completed", state: "completed", eventType: "agent-result", sourceEventId: "evt-complete", message: "done" });
    const { tools } = loadExtension(() => ok());
    const wait = tools.get("delegate_wait");

    const terminal = await wait.execute("wait-complete", { taskId: "TASK-P4", agentId: "worker-1", timeoutMs: 100 }, undefined, undefined, ctx(repoRoot));
    assert.equal(terminal.details.result.status, "completed");
    assert.equal(terminal.details.result.code, "terminal_alert");
    assert.equal(terminal.details.result.unreadParentAlerts[0].outcome, "completed");
  });
});

test("task-scope delegate_wait returns terminal child alerts instead of timing out", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.initTask({ taskId: "TASK-P4", state: "created" });
    await store.registerAgent({ taskId: "TASK-P4", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:3" });
    await store.queueParentAlert("TASK-P4", { agentId: "worker-1", outcome: "completed", state: "completed", eventType: "agent-result", sourceEventId: "evt-complete", message: "worker complete" });
    const { tools } = loadExtension(() => ok());
    const wait = tools.get("delegate_wait");

    const result = await wait.execute("wait-task-complete", { taskId: "TASK-P4", timeoutMs: 1 }, undefined, undefined, ctx(repoRoot));
    assert.equal(result.details.result.status, "completed");
    assert.equal(result.details.result.code, "terminal_alert");
    assert.equal(result.details.result.heartbeat.state, "created");
    assert.equal(result.details.result.unreadParentAlerts[0].outcome, "completed");
  });
});

test("delegate_status defaults to current task and direct-parent unread alerts when delegated env is present", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-CURRENT", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "completed", parentAgentId: "execution-parent-1" });
    await store.registerAgent({ taskId: "TASK-CURRENT", agentId: "worker-2", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "completed", parentAgentId: "other-parent" });
    await store.registerAgent({ taskId: "TASK-OLD", agentId: "worker-old", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "completed", parentAgentId: "execution-parent-1" });
    await store.queueParentAlert("TASK-CURRENT", { agentId: "worker-1", outcome: "completed", state: "completed", parentAgentId: "execution-parent-1", eventType: "agent-result", sourceEventId: "evt-current", message: "current" });
    await store.queueParentAlert("TASK-CURRENT", { agentId: "worker-2", outcome: "completed", state: "completed", parentAgentId: "other-parent", eventType: "agent-result", sourceEventId: "evt-other-parent", message: "other parent" });
    await store.queueParentAlert("TASK-OLD", { agentId: "worker-old", outcome: "completed", state: "completed", parentAgentId: "execution-parent-1", eventType: "agent-result", sourceEventId: "evt-old", message: "old" });
    const { tools } = loadExtension(() => ok());
    const status = tools.get("delegate_status");

    await withProcessEnv({ FREEFLOW_DELEGATION_TASK_ID: "TASK-CURRENT", FREEFLOW_DELEGATION_AGENT_ID: "execution-parent-1" }, async () => {
      const result = await status.execute("status-current", {}, undefined, undefined, ctx(repoRoot));
      assert.equal(result.details.result.taskId, "TASK-CURRENT");
      assert.deepEqual(result.details.result.unreadParentAlerts.map((alert) => alert.message), ["current"]);
    });
  });
});

test("delegate_inbox and delegate_ack_all default to current parent scope", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-INBOX", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "completed", parentAgentId: "execution-parent-1" });
    await store.registerAgent({ taskId: "TASK-INBOX", agentId: "worker-2", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "completed", parentAgentId: "other-parent" });
    await store.queueParentAlert("TASK-INBOX", { agentId: "worker-1", outcome: "completed", state: "completed", parentAgentId: "execution-parent-1", eventType: "agent-result", sourceEventId: "evt-current", message: "current parent" });
    await store.queueParentAlert("TASK-INBOX", { agentId: "worker-2", outcome: "completed", state: "completed", parentAgentId: "other-parent", eventType: "agent-result", sourceEventId: "evt-other", message: "other parent" });
    const { tools } = loadExtension(() => ok());
    const inbox = tools.get("delegate_inbox");
    const ackAll = tools.get("delegate_ack_all");

    await withProcessEnv({ FREEFLOW_DELEGATION_TASK_ID: "TASK-INBOX", FREEFLOW_DELEGATION_AGENT_ID: "execution-parent-1" }, async () => {
      const scopedInbox = await inbox.execute("inbox-current-parent", { taskId: "TASK-INBOX" }, undefined, undefined, ctx(repoRoot));
      assert.equal(scopedInbox.details.result.scope, "parent:execution-parent-1");
      assert.deepEqual(scopedInbox.details.result.alerts.map((alert) => alert.message), ["current parent"]);

      const blockedCrossParent = await inbox.execute("inbox-cross-parent", { taskId: "TASK-INBOX", parentAgentId: "other-parent" }, undefined, undefined, ctx(repoRoot));
      assert.equal(blockedCrossParent.details.result.code, "global_alert_scope_required");

      const acked = await ackAll.execute("ack-current-parent", { taskId: "TASK-INBOX" }, undefined, undefined, ctx(repoRoot));
      assert.equal(acked.details.result.count, 1);
      assert.deepEqual(acked.details.result.alerts.map((alert) => alert.message), ["current parent"]);
      assert.deepEqual((await store.readParentAlerts("TASK-INBOX", { unreadOnly: true })).map((alert) => alert.message), ["other parent"]);

      const globalInbox = await inbox.execute("inbox-global", { taskId: "TASK-INBOX", global: true }, undefined, undefined, ctx(repoRoot));
      assert.deepEqual(globalInbox.details.result.alerts.map((alert) => alert.message), ["other parent"]);
    });
  });
});

test("delegate_status exposes compact execution map metadata when present", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.initTask({ taskId: "TASK-P5", goal: "P5 execution helpers" });
    await store.upsertWorkPackage("TASK-P5", {
      packageId: "P5A",
      role: "worker",
      agentId: "worker-1",
      dependencies: [],
      expectedWriteScopes: [join(repoRoot, "delegation", "src")],
      checkoutPath: join(repoRoot, "../freeflow-p5a"),
      allowedCommands: ["npm run build"],
      state: "completed",
      review: { required: true, status: "passed", evidencePaths: [".freeflow/delegation/review.json"] },
      verification: { required: true, status: "passed", outputIds: ["ffout_checks"] },
      commitCheckpoints: [{ checkpointId: "P5A-checkpoint", packageId: "P5A", planned: true, status: "planned", intendedFiles: ["delegation/src/types.ts"] }],
      integrationOrder: 0,
    });
    const { tools } = loadExtension(() => ok());
    const status = tools.get("delegate_status");

    const result = await status.execute("status-p5", { taskId: "TASK-P5" }, undefined, undefined, ctx(repoRoot));

    assert.equal(result.details.result.status, "ok");
    assert.deepEqual(result.details.result.executionMap.integrationOrder, ["P5A"]);
    assert.equal(result.details.result.executionMap.packages[0].packageId, "P5A");
    assert.equal(result.details.result.executionMap.packages[0].commitCheckpoints[0].checkpointId, "P5A-checkpoint");
    assert.match(result.content[0].text, /execution_map\|.*execution-map\.json/);
  });
});

test("delegate_result returns pending or compact parsed result pointers without raw transcript injection", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-P4", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:3" });
    const { tools } = loadExtension(() => ok());
    const resultTool = tools.get("delegate_result");

    const pending = await resultTool.execute("result-pending", { taskId: "TASK-P4", agentId: "worker-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(pending.details.result.status, "pending");
    assert.equal(pending.details.result.code, "result_pending");

    const raw = [
      "FFRESULT",
      "STATUS|completed_with_risks",
      "SUMMARY|Implemented P4 with one residual risk.",
      "FILES_CHANGED|delegation/src/store.ts,pi-extension/src/delegation/tools.ts",
      "CHECK|npm run build|pass|outputId=ffout_build",
      "EVIDENCE|ffout_build|routed output evidence",
      "RECOMMENDATION|Run final smoke later.",
      "END_FFRESULT",
    ].join("\n");
    await store.recordAgentResult("TASK-P4", "worker-1", raw, parseModelText(raw));
    await store.writeAgentStatus("TASK-P4", "worker-1", { state: "completed", message: "done" });

    const parsed = await resultTool.execute("result-parsed", { taskId: "TASK-P4", agentId: "worker-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(parsed.details.result.status, "ok");
    assert.equal(parsed.details.result.result.status, "completed_with_risks");
    assert.equal(parsed.details.result.result.results[0].summary, "Implemented P4 with one residual risk.");
    assert.deepEqual(parsed.details.result.result.results[0].evidence[0].fields, ["ffout_build", "routed output evidence"]);
    assert.equal(parsed.details.result.result.rawText, undefined);
    assert.doesNotMatch(parsed.content[0].text, /FFRESULT/);
  });
});

test("delegate_finish stores direct results, queues inbox alerts, and ack tools clear them", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () => withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-FINISH", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:3", parentAgentId: "execution-parent-1" });
    const { tools } = loadExtension(() => ok());
    const finish = tools.get("delegate_finish");
    const inbox = tools.get("delegate_inbox");
    const ackAlert = tools.get("delegate_ack_alert");
    const resultTool = tools.get("delegate_result");

    const finished = await finish.execute("finish-worker", {
      taskId: "TASK-FINISH",
      agentId: "worker-1",
      status: "completed",
      summary: "Implemented focused worker slice.",
      filesChanged: ["delegation/src/store.ts"],
      checks: [{ name: "npm run build", status: "pass", outputId: "ffout_build" }],
    }, undefined, undefined, ctx(repoRoot));

    assert.equal(finished.details.result.status, "stored");
    assert.doesNotMatch(finished.content[0].text, /Implemented focused worker slice/);
    assert.equal((await store.readAgentStatus("TASK-FINISH", "worker-1")).state, "completed");
    const stored = JSON.parse(await readFile(store.pathsForAgent("TASK-FINISH", "worker-1").resultJson, "utf8"));
    assert.equal(stored.transport, "delegate_finish");
    assert.equal(stored.direct.filesChanged[0], "delegation/src/store.ts");

    const parsed = await resultTool.execute("result-finish", { taskId: "TASK-FINISH", agentId: "worker-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(parsed.details.result.status, "ok");
    assert.equal(parsed.details.result.result.direct.summary, "Implemented focused worker slice.");

    const unread = await inbox.execute("inbox", { taskId: "TASK-FINISH" }, undefined, undefined, ctx(repoRoot));
    assert.equal(unread.details.result.count, 1);
    const acked = await ackAlert.execute("ack", { taskId: "TASK-FINISH", alertId: unread.details.result.alerts[0].alertId }, undefined, undefined, ctx(repoRoot));
    assert.equal(acked.details.result.status, "acked");
    assert.equal((await store.readParentAlerts("TASK-FINISH", { unreadOnly: true })).length, 0);
  }));
});

test("delegate_finish stores parent reports with canonical task report records", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () => withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-PARENT-FINISH", agentId: "planning-parent-1", role: "planning-parent", profile: "planning-parent", cwd: repoRoot, state: "running", surfaceRef: "surface:plan", parentAgentId: "orchestrator" });
    await store.registerAgent({ taskId: "TASK-PARENT-FINISH", agentId: "execution-parent-1", role: "execution-parent", profile: "execution-parent", cwd: repoRoot, state: "running", surfaceRef: "surface:exec", parentAgentId: "orchestrator" });
    const { tools } = loadExtension(() => ok());
    const finish = tools.get("delegate_finish");
    const resultTool = tools.get("delegate_result");

    const planning = await finish.execute("finish-planning", {
      taskId: "TASK-PARENT-FINISH",
      agentId: "planning-parent-1",
      status: "completed",
      reportStatus: "ready",
      summary: "Planning ready.",
      goal: "implement delegation fixes",
      artifactPaths: ["docs/specs/fix.md", "docs/plans/fix.md"],
      reviewStatus: "passed",
      settledDecisions: "use delegate_finish for parent reports",
      openQuestions: "none",
      executionAutonomy: "bounded",
      userCheckpoints: "before push",
      executionGuidance: "run P1-P10",
      risks: "post-reload smoke pending",
      evidence: [{ label: "plan", path: "docs/plans/fix.md" }],
    }, undefined, undefined, ctx(repoRoot));
    assert.equal(planning.details.result.status, "stored");
    assert.equal(planning.details.result.reportName, "planning-report");
    assert.equal((await store.readTaskReport("TASK-PARENT-FINISH", "planning-report")).exists, true);
    const planningResult = await resultTool.execute("result-planning", { taskId: "TASK-PARENT-FINISH", agentId: "planning-parent-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(planningResult.details.result.status, "ok");
    assert.equal(planningResult.details.result.result.reports.planning[0].status, "ready");

    const execution = await finish.execute("finish-execution", {
      taskId: "TASK-PARENT-FINISH",
      agentId: "execution-parent-1",
      status: "completed_with_risks",
      reportStatus: "completed_with_risks",
      summary: "Execution complete; smoke pending.",
      sourceReferences: ["docs/specs/fix.md", "docs/plans/fix.md"],
      workPackages: "P1-P10 complete",
      commits: "none",
      reviews: "passed",
      checks: [{ name: "npm run build", status: "pass", outputId: "ffout_build" }],
      filesChanged: ["pi-extension/src/delegation/tools.ts"],
      planDeviations: "live smoke post-reload",
      stopConditionsHit: "none",
      openQuestions: "none",
      risks: "post-reload smoke pending",
      finalRecommendation: "commit, push, reload, smoke",
      evidence: [{ label: "build", outputId: "ffout_build" }],
    }, undefined, undefined, ctx(repoRoot));
    assert.equal(execution.details.result.status, "stored");
    assert.equal(execution.details.result.reportName, "execution-report");
    const executionReport = await store.readTaskReport("TASK-PARENT-FINISH", "execution-report");
    assert.equal(executionReport.exists, true);
    assert.equal(executionReport.parsed.status, "completed_with_risks");
  }));
});

test("delegate_finish enforces verifier top-level status and accepts check pass rows", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () => withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-VERIFY", agentId: "verifier-1", role: "verifier", profile: "verifier", cwd: repoRoot, state: "running", surfaceRef: "surface:3" });
    const { tools } = loadExtension(() => ok());
    const finish = tools.get("delegate_finish");

    const invalid = await finish.execute("finish-invalid", { taskId: "TASK-VERIFY", agentId: "verifier-1", status: "PASS", summary: "all checks pass" }, undefined, undefined, ctx(repoRoot));
    assert.equal(invalid.details.result.toolStatus, "error");
    assert.equal(invalid.details.result.code, "result_schema_invalid");
    assert.match(invalid.details.result.hint, /check statuses/);

    const valid = await finish.execute("finish-valid", {
      taskId: "TASK-VERIFY",
      agentId: "verifier-1",
      status: "completed",
      summary: "Verification passed.",
      checks: [{ name: "npm run test:delegation", status: "pass", outputId: "ffout_tests" }],
      completionClaimSupported: true,
    }, undefined, undefined, ctx(repoRoot));
    assert.equal(valid.details.result.status, "stored");
    const stored = JSON.parse(await readFile(store.pathsForAgent("TASK-VERIFY", "verifier-1").resultJson, "utf8"));
    assert.equal(stored.direct.checks[0].status, "pass");
  }));
});

test("delegate_status degrades instead of crashing on malformed execution map", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () => withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.initTask({ taskId: "TASK-DEGRADED" });
    await writeFile(store.pathsForTask("TASK-DEGRADED").executionMapJson, JSON.stringify({ version: 1, taskId: "TASK-DEGRADED", updatedAt: "now" }), "utf8");
    const { tools } = loadExtension(() => ok());
    const status = tools.get("delegate_status");

    const result = await status.execute("status-degraded", { taskId: "TASK-DEGRADED" }, undefined, undefined, ctx(repoRoot));
    assert.equal(result.details.result.status, "degraded");
    assert.equal(result.details.result.degraded[0].code, "execution_map_invalid");
    assert.match(result.details.result.degraded[0].recovery, /regenerate/);
  }));
});

test("delegate_result auto-closes passing verifier panes after parent consumes result", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () => withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-AUTOCLOSE", agentId: "verifier-1", role: "verifier", profile: "verifier", cwd: repoRoot, state: "running", surfaceRef: "surface:3", retention: "auto" });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "close-surface") return ok();
      return ok();
    });
    const finish = tools.get("delegate_finish");
    const resultTool = tools.get("delegate_result");

    await finish.execute("finish-verifier", {
      taskId: "TASK-AUTOCLOSE",
      agentId: "verifier-1",
      status: "completed",
      summary: "Verifier passed.",
      checks: [{ name: "npm run test:delegation", status: "pass", outputId: "ffout_tests" }],
      completionClaimSupported: true,
    }, undefined, undefined, ctx(repoRoot));

    const result = await resultTool.execute("result-autoclose", { taskId: "TASK-AUTOCLOSE", agentId: "verifier-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(result.details.result.retention.action, "closed");
    assert.ok(calls.some((call) => call.command.join(" ").includes("close-surface --surface surface:3")));
    assert.equal((await store.readAgentStatus("TASK-AUTOCLOSE", "verifier-1")).state, "closed");
  }));
});

test("delegate_update_execution_map validates and stores one canonical work package", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () => withTempRepo(async (repoRoot) => {
    const { tools } = loadExtension(() => ok());
    const update = tools.get("delegate_update_execution_map");
    const result = await update.execute("update-map", {
      taskId: "TASK-MAP",
      package: {
        packageId: "P1",
        role: "worker",
        dependencies: [],
        expectedWriteScopes: [join(repoRoot, "delegation", "src")],
        checkoutPath: repoRoot,
        allowedCommands: ["npm run build"],
        state: "completed",
        review: { required: false, status: "not_required" },
        verification: { required: false, status: "not_required" },
        commitCheckpoints: [],
      },
    }, undefined, undefined, ctx(repoRoot));

    assert.equal(result.details.result.status, "stored");
    assert.equal(result.details.result.executionMap.packages[0].packageId, "P1");
  }));
});

test("delegate_cancel sends ctrl-c, records cancelled state, and queues a parent alert", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-P4", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:3" });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "send-key") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const cancel = tools.get("delegate_cancel");

    const missing = await cancel.execute("cancel-missing", { taskId: "TASK-P4", agentId: "missing" }, undefined, undefined, ctx(repoRoot));
    assert.equal(missing.details.result.code, "target_not_found");
    assert.equal(calls.length, 0);

    const result = await cancel.execute("cancel", { taskId: "TASK-P4", agentId: "worker-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(result.details.result.status, "cancelled");
    assert.equal(calls.some((call) => call.command.join(" ").includes("send-key --surface surface:3 ctrl-c")), true);
    assert.equal((await store.readAgentStatus("TASK-P4", "worker-1")).state, "cancelled");
    const alerts = await store.readParentAlerts("TASK-P4", { unreadOnly: true });
    assert.equal(alerts[0].outcome, "cancelled");
  });
});

test("delegate_record_report stores parsed reports and malformed report evidence", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools } = loadExtension(() => ok());
    const record = tools.get("delegate_record_report");
    const report = [
      "EXECUTION_REPORT",
      "STATUS|completed_with_risks",
      "SUMMARY|P4 complete with deferred live smoke.",
      "SOURCE_REFERENCES|docs/specs/freeflow-pi-pane-delegation-harness-spec.md",
      "WORK_PACKAGES|P4",
      "COMMITS|none",
      "REVIEWS|not run",
      "CHECKS|npm run build passed",
      "FILES_CHANGED|delegation/src/store.ts",
      "PLAN_DEVIATIONS|none",
      "STOP_CONDITIONS_HIT|none",
      "OPEN_QUESTIONS|none",
      "RISKS|live cmux smoke deferred",
      "FINAL_RECOMMENDATION|review and smoke",
      "EVIDENCE|ffout_build|build passed",
      "END_EXECUTION_REPORT",
    ].join("\n");

    const okResult = await record.execute("record-report", { taskId: "TASK-P4", reportName: "execution-report", rawText: report }, undefined, undefined, ctx(repoRoot));
    assert.equal(okResult.details.result.status, "completed");
    assert.equal(okResult.details.result.alert.outcome, "completed_with_risks");

    const malformed = await record.execute("record-bad-report", { taskId: "TASK-P4", reportName: "planning-report", rawText: "PLANNING_REPORT\nGOAL|x\nEND_PLANNING_REPORT" }, undefined, undefined, ctx(repoRoot));
    assert.equal(malformed.details.result.status, "failed");
    assert.equal(malformed.details.result.code, "report_malformed");
    assert.match(await readFile(malformed.details.result.paths.raw, "utf8"), /PLANNING_REPORT/);
  });
});

test("delegate_close blocks parent close until descendants are reconciled", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-DESC", agentId: "execution-parent-1", role: "execution-parent", profile: "execution-parent", cwd: repoRoot, state: "running", surfaceRef: "surface:parent" });
    await store.registerAgent({ taskId: "TASK-DESC", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:child", parentAgentId: "execution-parent-1" });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "close-surface") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const close = tools.get("delegate_close");

    const blocked = await close.execute("close-parent-blocked", { taskId: "TASK-DESC", agentId: "execution-parent-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(blocked.details.result.status, "blocked");
    assert.equal(blocked.details.result.code, "descendant_reconciliation_required");
    assert.equal(blocked.details.result.activeDescendants[0].agentId, "worker-1");
    assert.equal(calls.length, 0);

    await store.writeAgentStatus("TASK-DESC", "worker-1", { state: "completed", message: "child complete" });
    await store.queueParentAlert("TASK-DESC", { agentId: "worker-1", parentAgentId: "execution-parent-1", outcome: "completed", state: "completed", eventType: "agent-result", sourceEventId: "evt-child-complete", message: "child complete" });
    const blockedUnconsumed = await close.execute("close-parent-unconsumed", { taskId: "TASK-DESC", agentId: "execution-parent-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(blockedUnconsumed.details.result.code, "descendant_reconciliation_required");
    assert.equal(blockedUnconsumed.details.result.unconsumedCompleted[0].agentId, "worker-1");

    await store.markParentAlertsRead("TASK-DESC");
    const closed = await close.execute("close-parent", { taskId: "TASK-DESC", agentId: "execution-parent-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(closed.details.result.status, "closed");
    assert.equal(calls.some((call) => call.command.join(" ").includes("close-surface --surface surface:parent")), true);
  });
});

test("delegate_cancel blocks parent cancel until active descendants are reconciled", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-DESC-CANCEL", agentId: "execution-parent-1", role: "execution-parent", profile: "execution-parent", cwd: repoRoot, state: "running", surfaceRef: "surface:parent" });
    await store.registerAgent({ taskId: "TASK-DESC-CANCEL", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:child", parentAgentId: "execution-parent-1" });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "send-key") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const cancel = tools.get("delegate_cancel");

    const blocked = await cancel.execute("cancel-parent-blocked", { taskId: "TASK-DESC-CANCEL", agentId: "execution-parent-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(blocked.details.result.status, "blocked");
    assert.equal(blocked.details.result.code, "descendant_reconciliation_required");
    assert.equal(calls.length, 0);

    await store.writeAgentStatus("TASK-DESC-CANCEL", "worker-1", { state: "closed", message: "child closed" });
    const cancelled = await cancel.execute("cancel-parent", { taskId: "TASK-DESC-CANCEL", agentId: "execution-parent-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(cancelled.details.result.status, "cancelled");
    assert.equal(calls.some((call) => call.command.join(" ").includes("send-key --surface surface:parent ctrl-c")), true);
  });
});

test("delegate_close validates target before closing and records closed state", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({ taskId: "TASK-P3", agentId: "worker-1", role: "worker", cwd: repoRoot, writeScope: repoRoot, state: "running", surfaceRef: "surface:3" });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "close-surface") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const close = tools.get("delegate_close");

    const missing = await close.execute("close-missing", { taskId: "TASK-P3", agentId: "missing" }, undefined, undefined, ctx(repoRoot));
    assert.equal(missing.details.result.code, "target_not_found");
    assert.equal(calls.length, 0);

    const result = await close.execute("close", { taskId: "TASK-P3", agentId: "worker-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(result.details.result.status, "closed");
    assert.equal(calls.some((call) => call.command.join(" ").includes("close-surface --surface surface:3")), true);
    assert.equal((await store.readAgentStatus("TASK-P3", "worker-1")).state, "closed");

    const callCount = calls.length;
    const alreadyClosed = await close.execute("close-again", { taskId: "TASK-P3", agentId: "worker-1" }, undefined, undefined, ctx(repoRoot));
    assert.equal(alreadyClosed.details.result.code, "already_closed");
    assert.equal(calls.length, callCount);
  });
});

test("delegation renderers are compact collapsed and detailed expanded without raw dumps", () => {
  const { tools } = loadExtension(() => ok());
  const spawn = tools.get("delegate_spawn");
  const toolResult = {
    content: [{ type: "text", text: "raw model content should not be rendered" }],
    details: {
      result: {
        operation: "delegate_spawn",
        status: "DELEGATION_UNAVAILABLE",
        code: "cmux_context_unavailable",
        reason: "current terminal is not in a usable cmux context",
        actionTaken: "no_pane_opened_no_child_pi_started",
        safeRoutes: ["continue_inline_in_current_pi_session"],
        taskId: "TASK-P3",
        preflight: { status: "unavailable", reason: "no context", actionTaken: "no_pane_opened_no_child_pi_started", checks: [{ name: "cmux_context", status: "failed", message: "no caller" }], safeRoutes: ["continue_inline_in_current_pi_session"] },
        paths: { taskPacket: ".freeflow/delegation/tasks/TASK-P3/agents/worker-1/model/task-packet.txt" },
      },
    },
  };

  const collapsed = renderText(spawn.renderResult(toolResult, { expanded: false }, testTheme));
  assert.match(collapsed, /delegate_spawn DELEGATION_UNAVAILABLE/);
  assert.match(collapsed, /ctrl\+o to expand/);
  assert.doesNotMatch(collapsed, /raw model content/);

  const expanded = renderText(spawn.renderResult(toolResult, { expanded: true }, testTheme));
  assert.match(expanded, /Delegation unavailable/);
  assert.match(expanded, /action taken: no_pane_opened_no_child_pi_started/);
  assert.match(expanded, /cmux_context/);
  assert.match(expanded, /Evidence paths/);
  assert.doesNotMatch(expanded, /raw model content/);
});
