import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import freeflow from "../dist/index.js";
import {
  compileTaskPacket,
  createDelegationStore,
  parseModelText,
  parseProtocolText,
  resolveProfileForRole,
} from "../../delegation/dist/index.js";

const DELEGATION_TOOLS = [
  "delegate_task_init",
  "delegate_route",
  "delegate_apply_route",
  "delegate_request_execution_authorization",
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
  const userMessages = [];
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
    async sendUserMessage(message) {
      userMessages.push(message);
    },
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
  if (options.delegationEnv !== false) {
    process.env.FREEFLOW_DELEGATION_HARNESS_ENABLED = "1";
  }
  freeflow(pi);
  return { tools, handlers, calls, userMessages, activeToolCalls };
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

function cmuxLifecycleExec(options = {}) {
  const surface = options.surface ?? "surface:3";
  const pane = options.pane ?? "pane:2";
  const workspace = options.workspace ?? "workspace:1";
  return (command) => {
    const text = command.join(" ");
    if (text.includes("command -v 'cmux'")) return ok("/usr/local/bin/cmux\n");
    if (text === "cmux --help") return ok(HELP);
    if (text === "cmux identify") return ok(`${workspace} surface:1\n`);
    if (text.includes("command -v 'pi'")) return ok("/usr/local/bin/pi\n");
    if (text.startsWith("cmux new-pane")) {
      if (options.failAt === "new-pane") return fail("new pane failed");
      if (options.failAt === "surface-ref") return ok(`${workspace} ${pane}\n`);
      return ok(`${workspace} ${pane} ${surface}\n`);
    }
    if (text.startsWith("cmux send ")) {
      if (options.failAt === "send") return fail("send failed");
      return ok();
    }
    if (text.startsWith("cmux send-key")) return ok();
    if (text.startsWith("cmux read-screen")) {
      if (options.failAt === "read-screen") return fail("surface lost");
      return ok("child is running\n");
    }
    throw new Error(`unexpected command: ${text}`);
  };
}

function storedChildRequest(taskId, routeId, role = "worker", overrides = {}) {
  return {
    taskId,
    agentId: overrides.agentId ?? "execution-parent-1",
    role: overrides.callerRole ?? "execution-parent",
    action: overrides.action ?? {
      kind:
        role === "worker" ? "implement" : role === "reviewer" ? "review" : role === "verifier" ? "verify" : "research",
      breadth: "single_file",
      description: `Run stored ${role} route ${routeId}.`,
    },
    targetFiles: overrides.targetFiles ?? ["src/target.ts"],
    ...(overrides.writeScopes !== undefined
      ? { writeScopes: overrides.writeScopes }
      : role === "worker"
        ? { writeScopes: ["src/**"] }
        : {}),
    ...(overrides.riskFlags !== undefined ? { riskFlags: overrides.riskFlags } : { riskFlags: ["unknown"] }),
    routeId,
  };
}

async function appendChildRouteDecision(store, taskId, routeId, role = "worker", requestOverrides = {}) {
  await store.appendRouteDecision(
    taskId,
    {
      kind: "route_required",
      routeId,
      targetRole: role,
      reasonCodes: [`route_${role}`],
    },
    { request: storedChildRequest(taskId, routeId, role, requestOverrides) },
  );
}

async function writeCurrentTaskPacket(store, manifest, objective = "Current assignment packet.") {
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
    cwd: manifest.cwd,
    objective,
    writeScope: manifest.writeScopes ?? manifest.writeScope,
    allowedCommands: manifest.allowedCommands ?? [],
    tracePath: paths.transcriptLog,
    resultPath: paths.resultJson,
  });
  await store.writeAgentModelText(manifest.taskId, manifest.agentId, "task-packet.txt", packet.text);
  return paths.taskPacketRaw;
}

async function withTempRepo(fn) {
  const repoRoot = await mkdtemp(join(tmpdir(), "freeflow-pi-delegation-tools-"));
  try {
    await mkdir(join(repoRoot, ".freeflow"), { recursive: true });
    await writeFile(
      join(repoRoot, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow" }, null, 2),
      "utf8",
    );
    return await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

const DELEGATION_ENV_CLEAR = {
  FREEFLOW_DELEGATION_STORE: undefined,
  FREEFLOW_DELEGATION_TASK_ID: undefined,
  FREEFLOW_DELEGATION_AGENT_ID: undefined,
  FREEFLOW_DELEGATION_ATTEMPT_ID: undefined,
  FREEFLOW_PARENT_AGENT_ID: undefined,
  FREEFLOW_AGENT_ROLE: undefined,
  FREEFLOW_CONTEXT_PROFILE: undefined,
};

function delegatedEnv(store, manifest) {
  return {
    FREEFLOW_DELEGATION_STORE: store.root,
    FREEFLOW_DELEGATION_TASK_ID: manifest.taskId,
    FREEFLOW_DELEGATION_AGENT_ID: manifest.agentId,
    FREEFLOW_DELEGATION_ATTEMPT_ID: manifest.attemptId,
    FREEFLOW_PARENT_AGENT_ID: manifest.parentAgentId ?? "orchestrator",
    FREEFLOW_AGENT_ROLE: manifest.role,
    FREEFLOW_CONTEXT_PROFILE: manifest.profile,
  };
}

async function publishReadyEvent(store, taskId, planArtifactPath) {
  const rawText = [
    "PLANNING_REPORT",
    "STATUS|ready",
    "GOAL|Authorize the accepted plan.",
    `PLAN_ARTIFACT_PATH|${planArtifactPath}`,
    `ARTIFACT_PATHS|${planArtifactPath}`,
    "REVIEW_STATUS|passed",
    "SETTLED_DECISIONS|use accepted publication",
    "OPEN_QUESTIONS|none",
    "EXECUTION_AUTONOMY|bounded",
    "USER_CHECKPOINTS|authorization",
    "EXECUTION_GUIDANCE|follow the accepted plan",
    "RISKS|none",
    "EVIDENCE|tests",
    "END_PLANNING_REPORT",
  ].join("\n");
  const publication = await store.publishPlanningReport(taskId, {
    rawText,
    source: { transport: "delegate_record_report" },
  });
  const events = (await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return events.find((event) => event.eventId === publication.planningReadyEventId);
}

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
  fg(_color, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

test("Pi registers delegation tools alongside router tools", () => {
  const { tools } = loadExtension(() => ok());
  for (const name of DELEGATION_TOOLS) {
    assert.ok(tools.has(name), `${name} should be registered`);
  }
  assert.ok(tools.has("freeflow_search"));
  assert.ok(tools.get("delegate_finish").parameters.properties.planArtifactPath);
});

test("delegate_request_execution_authorization binds only host-confirmed canonical planning evidence", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const taskId = "TASK-OWNER-CONFIRM";
      const planArtifactPath = "docs/plans/owner-confirmed.md";
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const { tools } = loadExtension(() => ok());
      const planningReport = [
        "PLANNING_REPORT",
        "STATUS|ready",
        "GOAL|Implement the owner-confirmed plan.",
        `PLAN_ARTIFACT_PATH|${planArtifactPath}`,
        `ARTIFACT_PATHS|docs/specs/source.md,${planArtifactPath}`,
        "REVIEW_STATUS|passed",
        "SETTLED_DECISIONS|Use the selected owner-bound tool.",
        "OPEN_QUESTIONS|none",
        "EXECUTION_AUTONOMY|medium",
        "USER_CHECKPOINTS|execution authorization",
        "EXECUTION_GUIDANCE|Execute the approved plan.",
        "RISKS|none",
        "EVIDENCE|docs/specs/source.md",
        "END_PLANNING_REPORT",
      ].join("\n");
      const recorded = await tools
        .get("delegate_record_report")
        .execute(
          "record-planning-ready",
          { taskId, reportName: "planning-report", rawText: planningReport },
          undefined,
          undefined,
          ctx(repoRoot),
        );
      assert.equal(recorded.details.result.reportStatus, "ready");
      const ready = await store.readExecutionApprovalRequest(taskId);
      const requestAuthorization = tools.get("delegate_request_execution_authorization");
      assert.deepEqual(Object.keys(requestAuthorization.parameters.properties), ["taskId"]);
      assert.equal(
        resolveProfileForRole("orchestrator").activeTools.includes("delegate_request_execution_authorization"),
        true,
      );
      assert.equal(
        resolveProfileForRole("planning-parent").activeTools.includes("delegate_request_execution_authorization"),
        false,
      );
      assert.equal(
        resolveProfileForRole("execution-parent").activeTools.includes("delegate_request_execution_authorization"),
        false,
      );
      const confirmations = [];
      const toolCtx = ctx(repoRoot);
      toolCtx.mode = "tui";
      toolCtx.hasUI = true;
      toolCtx.ui.confirm = async (title, message) => {
        confirmations.push({ title, message });
        return true;
      };

      const result = await requestAuthorization.execute("authorize-owner", { taskId }, undefined, undefined, toolCtx);

      assert.equal(result.details.result.toolStatus, "ok");
      assert.equal(result.details.result.status, "ready_for_execution");
      assert.equal(result.details.result.approvedBy, "user");
      assert.equal(result.details.result.commitState, "committed");
      assert.equal(result.details.result.planArtifactPath, planArtifactPath);
      assert.equal(confirmations.length, 1);
      assert.match(confirmations[0].title, /Authorize delegated execution/);
      assert.match(confirmations[0].message, new RegExp(taskId));
      assert.match(confirmations[0].message, new RegExp(ready.planningReportReadyEventId.replaceAll(".", "\\.")));
      assert.match(confirmations[0].message, /owner-confirmed\.md/);
      const evidence = await store.readExecutionAuthorization(taskId);
      assert.equal(evidence.approvedBy, "user");
      assert.equal(evidence.planningReportReadyEventId, ready.planningReportReadyEventId);

      const routed = await tools.get("delegate_route").execute(
        "route-after-owner-confirm",
        {
          taskId,
          agentId: "orchestrator",
          role: "orchestrator",
          action: { kind: "implement", breadth: "broad" },
        },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(routed.details.result.decision.targetRole, "execution-parent");

      const replacementPlan = "docs/plans/owner-confirmed-v2.md";
      const replacementReport = planningReport
        .replace(planArtifactPath, replacementPlan)
        .replace(planArtifactPath, replacementPlan);
      await tools
        .get("delegate_record_report")
        .execute(
          "record-planning-ready-v2",
          { taskId, reportName: "planning-report", rawText: replacementReport },
          undefined,
          undefined,
          ctx(repoRoot),
        );
      const reauthorized = await requestAuthorization.execute(
        "authorize-owner-v2",
        { taskId },
        undefined,
        undefined,
        toolCtx,
      );
      assert.equal(reauthorized.details.result.planArtifactPath, replacementPlan);
      assert.equal(confirmations.length, 2);
      assert.match(confirmations[1].message, /owner-confirmed-v2\.md/);
      assert.equal((await store.readExecutionAuthorization(taskId)).planArtifactPath, replacementPlan);

      const blockedReport = replacementReport
        .replace("STATUS|ready", "STATUS|blocked")
        .replace("RISKS|none", "RISKS|planning blocker");
      const blocked = await tools
        .get("delegate_record_report")
        .execute(
          "record-planning-blocked",
          { taskId, reportName: "planning-report", rawText: blockedReport },
          undefined,
          undefined,
          ctx(repoRoot),
        );
      assert.equal(blocked.details.result.reportStatus, "blocked");
      assert.equal(blocked.details.result.planningReadyEventId, undefined);
      assert.equal(await store.readExecutionAuthorization(taskId), undefined);
      const rerouted = await tools.get("delegate_route").execute(
        "route-after-planning-blocked",
        {
          taskId,
          agentId: "orchestrator",
          role: "orchestrator",
          action: { kind: "implement", breadth: "broad" },
        },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(rerouted.details.result.decision.targetRole, "planning-parent");
      const unavailable = await requestAuthorization.execute(
        "authorize-blocked",
        { taskId },
        undefined,
        undefined,
        toolCtx,
      );
      assert.equal(unavailable.details.result.code, "execution_approval_unavailable");
      assert.equal(confirmations.length, 2);
    }),
  );
});

test("delegate_request_execution_authorization fails closed without owner confirmation or on stale evidence", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const { tools } = loadExtension(() => ok());
      const requestAuthorization = tools.get("delegate_request_execution_authorization");

      await publishReadyEvent(store, "TASK-NO-UI", "docs/plans/no-ui.md");
      const noUi = await requestAuthorization.execute(
        "authorize-no-ui",
        { taskId: "TASK-NO-UI" },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(noUi.details.result.code, "owner_confirmation_unavailable");
      assert.equal(await store.readExecutionAuthorization("TASK-NO-UI"), undefined);

      await publishReadyEvent(store, "TASK-DECLINED", "docs/plans/declined.md");
      const declineCtx = ctx(repoRoot);
      declineCtx.mode = "tui";
      declineCtx.hasUI = true;
      declineCtx.ui.confirm = async () => false;
      const declined = await requestAuthorization.execute(
        "authorize-declined",
        { taskId: "TASK-DECLINED" },
        undefined,
        undefined,
        declineCtx,
      );
      assert.equal(declined.details.result.code, "owner_confirmation_declined");
      assert.equal(await store.readExecutionAuthorization("TASK-DECLINED"), undefined);

      await publishReadyEvent(store, "TASK-STALE-CONFIRM", "docs/plans/stale-first.md");
      const staleCtx = ctx(repoRoot);
      staleCtx.mode = "tui";
      staleCtx.hasUI = true;
      staleCtx.ui.confirm = async () => {
        await publishReadyEvent(store, "TASK-STALE-CONFIRM", "docs/plans/stale-latest.md");
        return true;
      };
      const stale = await requestAuthorization.execute(
        "authorize-stale",
        { taskId: "TASK-STALE-CONFIRM" },
        undefined,
        undefined,
        staleCtx,
      );
      assert.equal(stale.details.result.code, "execution_approval_stale");
      assert.equal(await store.readExecutionAuthorization("TASK-STALE-CONFIRM"), undefined);
      const staleEvents = (await readFile(store.pathsForTask("TASK-STALE-CONFIRM").eventsJsonl, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.equal(
        staleEvents.some((event) => event.type === "plan.approved"),
        false,
      );
    }),
  );
});

test("delegate_request_execution_authorization uses RPC host confirmation and fails closed without an RPC responder", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      await publishReadyEvent(store, "TASK-RPC-AUTH", "docs/plans/rpc.md");
      await publishReadyEvent(store, "TASK-RPC-NO-RESPONDER", "docs/plans/rpc-no-responder.md");
      const { tools } = loadExtension(() => ok());
      const requestAuthorization = tools.get("delegate_request_execution_authorization");
      let rpcPrompts = 0;
      const rpcCtx = ctx(repoRoot);
      rpcCtx.mode = "rpc";
      rpcCtx.hasUI = true;
      rpcCtx.ui.confirm = async () => {
        rpcPrompts += 1;
        return true;
      };

      const confirmed = await requestAuthorization.execute(
        "authorize-rpc",
        { taskId: "TASK-RPC-AUTH" },
        undefined,
        undefined,
        rpcCtx,
      );
      assert.equal(confirmed.details.result.status, "ready_for_execution");
      assert.equal(rpcPrompts, 1);
      assert.equal((await store.readExecutionAuthorization("TASK-RPC-AUTH")).approvedBy, "user");

      const unavailableCtx = ctx(repoRoot);
      unavailableCtx.mode = "rpc";
      unavailableCtx.hasUI = true;
      const unavailable = await requestAuthorization.execute(
        "authorize-rpc-unavailable",
        { taskId: "TASK-RPC-NO-RESPONDER" },
        undefined,
        undefined,
        unavailableCtx,
      );
      assert.equal(unavailable.details.result.code, "owner_confirmation_unavailable");
      assert.equal(await store.readExecutionAuthorization("TASK-RPC-NO-RESPONDER"), undefined);
    }),
  );
});

test("delegate_request_execution_authorization sanitizes owner-visible stored identity", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const taskId = "TASK-CONFIRM-SANITIZE";
      const dangerousPlanPath = `docs/plans/\u001b]8;;https://evil.invalid\u0007label\u202Eevil\u2066-${"x".repeat(500)}.md`;
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      await publishReadyEvent(store, taskId, dangerousPlanPath);
      const { tools } = loadExtension(() => ok());
      let displayed = "";
      const toolCtx = ctx(repoRoot);
      toolCtx.mode = "tui";
      toolCtx.hasUI = true;
      toolCtx.ui.confirm = async (_title, message) => {
        displayed = message;
        return false;
      };

      await tools
        .get("delegate_request_execution_authorization")
        .execute("authorize-sanitize", { taskId }, undefined, undefined, toolCtx);

      assert.doesNotMatch(displayed, /[\u001b\u0007\u202E\u2066]/u);
      assert.doesNotMatch(displayed, /https:\/\/evil\.invalid/);
      const planLine = displayed.split("\n").find((line) => line.startsWith("Plan: "));
      assert.ok(planLine.length <= 326);
    }),
  );
});

test("delegate_request_execution_authorization rejects delegated child callers before prompting", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await publishReadyEvent(store, "TASK-CHILD-AUTH", "docs/plans/child.md");
    await withProcessEnv(
      {
        ...DELEGATION_ENV_CLEAR,
        FREEFLOW_DELEGATION_TASK_ID: "TASK-CHILD-AUTH",
        FREEFLOW_DELEGATION_AGENT_ID: "planning-parent-1",
      },
      async () => {
        const { tools } = loadExtension(() => ok());
        let prompted = false;
        const childCtx = ctx(repoRoot);
        childCtx.mode = "tui";
        childCtx.hasUI = true;
        childCtx.ui.confirm = async () => {
          prompted = true;
          return true;
        };
        const result = await tools
          .get("delegate_request_execution_authorization")
          .execute("authorize-child", { taskId: "TASK-CHILD-AUTH" }, undefined, undefined, childCtx);
        assert.equal(result.details.result.code, "owner_confirmation_requires_orchestrator_root");
        assert.equal(prompted, false);
        assert.equal(await store.readExecutionAuthorization("TASK-CHILD-AUTH"), undefined);
      },
    );
  });
});

test("delegate_route routes orchestrator broad implementation to planning-parent and stores the decision", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension(() => {
      throw new Error("delegate_route must not call cmux or spawn panes");
    });
    const route = tools.get("delegate_route");

    const result = await route.execute(
      "route-planning",
      {
        taskId: "TASK-ROUTE-PI",
        agentId: "orchestrator",
        role: "orchestrator",
        action: { kind: "implement", breadth: "broad" },
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.status, "route_required");
    assert.equal(result.details.result.decision.targetRole, "planning-parent");
    assert.equal(result.details.result.actionTaken, "route_decision_stored_no_pane_spawned_no_lease_issued");
    assert.equal(calls.length, 0);
    assert.match(result.content[0].text, /route_decision\|route_required\|target=planning-parent/);
    assert.match(result.content[0].text, /reason_code\|stored_execution_authorization_missing/);
    assert.match(result.content[0].text, /next_action\|route to planning-parent/);
    assert.doesNotMatch(result.content[0].text, /^\s*\{/);
    assert.doesNotMatch(result.content[0].text, /"kind"\s*:/);

    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const decisions = await store.readRouteDecisions("TASK-ROUTE-PI");
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].decision.kind, "route_required");
    assert.equal(decisions[0].decision.targetRole, "planning-parent");
  });
});

test("delegate_route uses stored execution authorization to route orchestrator broad implementation to execution-parent", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const ready = await publishReadyEvent(store, "TASK-ROUTE-AUTH", "docs/plans/approved-plan.md");
    const approval = await store.recordPlanApproved("TASK-ROUTE-AUTH", {
      eventId: "evt.plan.approved",
      planningReportReadyEventId: ready.eventId,
      planArtifactPath: "docs/plans/approved-plan.md",
      approvedBy: "user",
    });
    await store.recordExecutionAuthorized("TASK-ROUTE-AUTH", {
      eventId: "evt.execution.authorized",
      planningReportReadyEventId: ready.eventId,
      planApprovedEventId: approval.eventId,
      planArtifactPath: "docs/plans/approved-plan.md",
    });
    const { tools } = loadExtension(() => ok());
    const route = tools.get("delegate_route");

    const result = await route.execute(
      "route-execution",
      {
        taskId: "TASK-ROUTE-AUTH",
        agentId: "orchestrator",
        role: "orchestrator",
        action: { kind: "implement", breadth: "broad" },
        hasApprovedPlan: true,
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.status, "route_required");
    assert.equal(result.details.result.decision.targetRole, "execution-parent");
    assert.equal(result.details.result.authorization.source, "store");
    assert.match(result.content[0].text, /route_decision\|route_required\|target=execution-parent/);
    assert.match(result.content[0].text, /authorization\|store\|ready_for_execution/);
    const decisions = await store.readRouteDecisions("TASK-ROUTE-AUTH");
    assert.equal(decisions.at(-1).decision.targetRole, "execution-parent");
    assert.equal(decisions.at(-1).request.hasApprovedPlan, true);
    assert.equal(decisions.at(-1).request.executionAuthorization.planArtifactPath, "docs/plans/approved-plan.md");

    const eventsPath = store.pathsForTask("TASK-ROUTE-AUTH").eventsJsonl;
    const events = (await readFile(eventsPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const accepted = events.find((event) => event.type === "planning_report.accepted");
    const coherentlyTamperedRaw = (await readFile(accepted.data.rawPath, "utf8")).replace(
      "GOAL|Authorize the accepted plan.",
      "GOAL|Coherently altered route evidence.",
    );
    const coherentlyTamperedReport = parseProtocolText(coherentlyTamperedRaw).planningReports[0];
    assert.ok(coherentlyTamperedReport);
    const coherentlyTamperedHash = createHash("sha256").update(coherentlyTamperedRaw, "utf8").digest("hex");
    const coherentlyTamperedRecord = JSON.parse(await readFile(accepted.data.jsonPath, "utf8"));
    coherentlyTamperedRecord.contentHash = coherentlyTamperedHash;
    coherentlyTamperedRecord.report = coherentlyTamperedReport;
    accepted.data.contentHash = coherentlyTamperedHash;
    await writeFile(accepted.data.rawPath, coherentlyTamperedRaw, "utf8");
    await writeFile(accepted.data.jsonPath, `${JSON.stringify(coherentlyTamperedRecord, null, 2)}\n`, "utf8");
    await writeFile(eventsPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
    const rerouted = await route.execute(
      "route-after-planning-evidence-tamper",
      {
        taskId: "TASK-ROUTE-AUTH",
        agentId: "orchestrator",
        role: "orchestrator",
        action: { kind: "implement", breadth: "broad" },
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(rerouted.details.result.decision.targetRole, "planning-parent");
    assert.equal(await store.readExecutionAuthorization("TASK-ROUTE-AUTH"), undefined);
  });
});

test("delegate_route treats hasApprovedPlan as a hint, not execution authorization", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools } = loadExtension(() => ok());
    const route = tools.get("delegate_route");

    const result = await route.execute(
      "route-plan-hint",
      {
        taskId: "TASK-ROUTE-HINT",
        agentId: "orchestrator",
        role: "orchestrator",
        action: { kind: "implement", breadth: "broad", description: "Implement stored route request evidence." },
        hasApprovedPlan: true,
        executionAuthorization: {
          schemaVersion: 1,
          executionId: "execution_fake",
          planningReportReadyEventId: "evt.plan.ready",
          planApprovedEventId: "evt.plan.approved",
          executionAuthorizedEventId: "evt.execution.authorized",
          taskState: "ready_for_execution",
          taskId: "TASK-ROUTE-HINT",
          executionMapPath: join(repoRoot, ".freeflow", "delegation", "tasks", "TASK-ROUTE-HINT", "execution-map.json"),
          planArtifactPath: "docs/plans/fake.md",
          approvedBy: "user",
        },
        targetFiles: ["pi-extension/src/delegation/tools.ts", "delegation/src/store.ts"],
        writeScopes: ["pi-extension/src/delegation/**", "delegation/src/**"],
        riskFlags: ["unknown"],
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.status, "route_required");
    assert.equal(result.details.result.decision.targetRole, "planning-parent");
    assert.equal(result.details.result.authorization.present, false);
    assert.equal(result.details.result.authorization.callerProvided, true);
    assert.match(result.content[0].text, /route_decision\|route_required\|target=planning-parent/);
    assert.match(result.content[0].text, /reason_code\|approved_plan_hint_ignored_without_stored_evidence/);

    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const [storedDecision] = await store.readRouteDecisions("TASK-ROUTE-HINT");
    assert.equal(storedDecision.request.routeId, storedDecision.routeId);
    assert.equal(storedDecision.request.agentId, "orchestrator");
    assert.equal(storedDecision.request.role, "orchestrator");
    assert.deepEqual(storedDecision.request.action, {
      kind: "implement",
      breadth: "broad",
      description: "Implement stored route request evidence.",
    });
    assert.equal(storedDecision.request.hasApprovedPlan, true);
    assert.equal(storedDecision.request.executionAuthorization, undefined);
    assert.deepEqual(storedDecision.request.targetFiles, [
      "pi-extension/src/delegation/tools.ts",
      "delegation/src/store.ts",
    ]);
    assert.deepEqual(storedDecision.request.writeScopes, ["pi-extension/src/delegation/**", "delegation/src/**"]);
    assert.deepEqual(storedDecision.request.riskFlags, ["unknown"]);
  });
});

test("delegate_route attaches a deterministic issued lease to tiny inline implementation", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension(() => {
      throw new Error("delegate_route inline must not call cmux");
    });
    const routed = await tools.get("delegate_route").execute(
      "route-inline-lease",
      {
        taskId: "TASK-ROUTE-INLINE-LEASE",
        agentId: "execution-parent-1",
        role: "execution-parent",
        action: { kind: "implement", breadth: "tiny", description: "Edit one integration file." },
        targetFiles: ["src/integration.ts"],
        writeScopes: ["src/integration.ts"],
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(routed.details.result.status, "inline_allowed");
    assert.equal(routed.details.result.decision.lease.state, "issued");
    assert.equal(routed.details.result.decision.lease.agentId, "execution-parent-1");
    assert.deepEqual(routed.details.result.decision.lease.actions, ["edit"]);
    assert.deepEqual(routed.details.result.decision.lease.writeScopes, ["src/integration.ts"]);
    assert.equal(calls.length, 0);
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    assert.equal((await store.readLeaseEvents("TASK-ROUTE-INLINE-LEASE")).length, 0);
  });
});

test("delegate_apply_route applies stored inline route idempotently without cmux or layout panes", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.appendRouteDecision(
      "TASK-APPLY-INLINE",
      {
        kind: "inline_allowed",
        routeId: "route-inline-1",
        reasonCodes: ["tiny_single_file_inline_allowed"],
      },
      {
        request: {
          taskId: "TASK-APPLY-INLINE",
          agentId: "execution-parent-1",
          role: "execution-parent",
          action: { kind: "implement", breadth: "tiny", description: "Apply one narrow inline edit." },
          targetFiles: ["src/inline.ts"],
          writeScopes: ["src/inline.ts"],
          routeId: "route-inline-1",
        },
      },
    );
    const { tools, calls } = loadExtension(() => {
      throw new Error("delegate_apply_route inline must not call cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const applied = await applyRoute.execute(
      "apply-inline",
      { taskId: "TASK-APPLY-INLINE", routeId: "route-inline-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    const reapplied = await applyRoute.execute(
      "apply-inline-again",
      { taskId: "TASK-APPLY-INLINE", routeId: "route-inline-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(applied.details.result.status, "applied");
    assert.equal(applied.details.result.target, "inline");
    assert.equal(reapplied.details.result.status, "already_applied");
    assert.equal(calls.length, 0);
    assert.match(applied.content[0].text, /apply_route\|route-inline-1\|inline_allowed\|target=inline\|state=applied/);
    assert.match(reapplied.content[0].text, /route_application\|already_applied\|id=apply-route-inline-1/);
    assert.doesNotMatch(applied.content[0].text, /^layout\|/m);
    assert.doesNotMatch(applied.content[0].text, /surface=/);
    assert.doesNotMatch(applied.content[0].text, /pane=/);

    const applications = await store.readRouteApplications("TASK-APPLY-INLINE");
    assert.equal(applications.length, 1);
    assert.equal(applications[0].decisionKind, "inline_allowed");
    assert.equal(applications[0].layoutAllocationId, undefined);
    assert.deepEqual(applications[0].leaseIds, ["lease-route-inline-1"]);
    assert.equal((await store.readLeaseEvents("TASK-APPLY-INLINE")).length, 2);
    assert.deepEqual((await store.readActiveLeaseView("TASK-APPLY-INLINE")).activeLeaseIdsByAgent, {
      "execution-parent-1": ["lease-route-inline-1"],
    });
    assert.equal((await store.readLayoutState("TASK-APPLY-INLINE")).allocations.length, 0);
  });
});

test("delegate_apply_route applies planning-parent route through stored right-top layout and ignores caller target hints", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.appendRouteDecision("TASK-APPLY-PLANNING", {
      kind: "route_required",
      routeId: "route-planning-parent-1",
      targetRole: "planning-parent",
      reasonCodes: ["orchestrator_implementation_requires_planning_parent"],
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("delegate_apply_route planning-parent must not call cmux in Phase 4b");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-planning",
      {
        taskId: "TASK-APPLY-PLANNING",
        routeId: "route-planning-parent-1",
        targetRole: "execution-parent",
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    const routeApplicationsBefore = await readFile(
      store.pathsForTask("TASK-APPLY-PLANNING").routeApplicationsJsonl,
      "utf8",
    );
    const layoutBefore = await readFile(store.pathsForTask("TASK-APPLY-PLANNING").layoutJson, "utf8");
    const reapplied = await applyRoute.execute(
      "apply-planning-again",
      {
        taskId: "TASK-APPLY-PLANNING",
        routeId: "route-planning-parent-1",
        targetRole: "worker",
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.status, "applied");
    assert.equal(result.details.result.target, "planning-parent");
    assert.equal(result.details.result.layout.slot, "right-top");
    assert.equal(result.details.result.layout.preserveFocus, true);
    assert.equal(reapplied.details.result.toolStatus, "error");
    assert.equal(reapplied.details.result.status, "attention_required");
    assert.equal(reapplied.details.result.code, "legacy_parent_application_incomplete");
    assert.equal(reapplied.details.result.target, "planning-parent");
    assert.equal(reapplied.details.result.legacy.classification, "legacy_incomplete");
    assert.equal(calls.length, 0);
    assert.match(
      result.content[0].text,
      /apply_route\|route-planning-parent-1\|route_required\|target=planning-parent\|state=applied/,
    );
    assert.match(
      result.content[0].text,
      /layout\|right-top\|allocation=layout-planning-parent-1-planning-parent\|focus=preserved/,
    );
    assert.match(reapplied.content[0].text, /legacy_parent_application_incomplete/);
    assert.match(reapplied.content[0].text, /legacy_incomplete/);
    assert.equal(
      await readFile(store.pathsForTask("TASK-APPLY-PLANNING").routeApplicationsJsonl, "utf8"),
      routeApplicationsBefore,
    );
    assert.equal(await readFile(store.pathsForTask("TASK-APPLY-PLANNING").layoutJson, "utf8"), layoutBefore);
    const alerts = await store.readParentAlerts("TASK-APPLY-PLANNING", { unreadOnly: true });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].eventType, "legacy-parent-application-incomplete");

    const applications = await store.readRouteApplications("TASK-APPLY-PLANNING");
    assert.equal(applications.length, 1);
    assert.equal(applications[0].layoutAllocationId, "layout-planning-parent-1-planning-parent");
    const layout = await store.readLayoutState("TASK-APPLY-PLANNING");
    assert.equal(layout.allocations.length, 1);
    assert.equal(layout.allocations[0].slot, "right-top");
    assert.equal(layout.allocations[0].preserveFocus, true);
  });
});

test("legacy running parent application exposes an additive routed-recovery candidate without resending startup", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-LEGACY-PARENT-RECOVERY";
    const routeId = "route-planning-parent-recovery";
    const agentId = "planning-parent-1";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.appendRouteDecision(taskId, {
      kind: "route_required",
      routeId,
      targetRole: "planning-parent",
      reasonCodes: ["orchestrator_implementation_requires_planning_parent"],
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("legacy parent classification must not call cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");
    await applyRoute.execute("seed-legacy-parent-layout", { taskId, routeId }, undefined, undefined, ctx(repoRoot));
    const manifest = await store.registerAgent({
      taskId,
      agentId,
      role: "planning-parent",
      profile: "planning-parent",
      parentAgentId: "orchestrator",
      cwd: repoRoot,
      state: "running",
      paneRef: "pane:legacy",
      surfaceRef: "surface:legacy",
      launchCommand: "pi planning-parent-1",
    });
    const {
      schemaVersion,
      identitySchemaVersion,
      profileSchemaVersion,
      protocolVersion,
      assignmentId,
      attemptId,
      attemptSource,
      ...legacyManifest
    } = manifest;
    await writeFile(
      store.pathsForAgent(taskId, agentId).manifestJson,
      `${JSON.stringify(legacyManifest, null, 2)}\n`,
      "utf8",
    );
    const routeApplicationsBefore = await readFile(store.pathsForTask(taskId).routeApplicationsJsonl, "utf8");
    const layoutBefore = await readFile(store.pathsForTask(taskId).layoutJson, "utf8");

    const result = await applyRoute.execute(
      "recover-legacy-parent",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.status, "recovery_required");
    assert.equal(result.details.result.code, "legacy_parent_recovery_required");
    assert.equal(result.details.result.legacy.classification, "legacy_recovery_candidate");
    assert.equal(result.details.result.recovery.authority, "routed_recovery");
    assert.equal(result.details.result.recovery.attemptId, "attempt-recovery-route-planning-parent-recovery");
    assert.equal(result.details.result.recovery.resendAllowed, false);
    assert.equal(calls.length, 0);
    assert.equal(await readFile(store.pathsForTask(taskId).routeApplicationsJsonl, "utf8"), routeApplicationsBefore);
    assert.equal(await readFile(store.pathsForTask(taskId).layoutJson, "utf8"), layoutBefore);
    const alerts = await store.readParentAlerts(taskId, { unreadOnly: true });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].eventType, "legacy-parent-recovery-required");
  });
});

test("delegate_apply_route fails closed for execution-parent without stored authorization even with caller hints", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.appendRouteDecision("TASK-APPLY-EXEC-NO-AUTH", {
      kind: "route_required",
      routeId: "route-execution-parent-no-auth",
      targetRole: "execution-parent",
      reasonCodes: ["stored_execution_authorization_present"],
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("delegate_apply_route execution-parent auth failure must not call cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-exec-no-auth",
      {
        taskId: "TASK-APPLY-EXEC-NO-AUTH",
        routeId: "route-execution-parent-no-auth",
        hasApprovedPlan: true,
        executionAuthorization: {
          schemaVersion: 1,
          executionId: "execution_fake",
          planningReportReadyEventId: "evt.plan.ready",
          planApprovedEventId: "evt.plan.approved",
          executionAuthorizedEventId: "evt.execution.authorized",
          taskState: "ready_for_execution",
          taskId: "TASK-APPLY-EXEC-NO-AUTH",
          executionMapPath: join(
            repoRoot,
            ".freeflow",
            "delegation",
            "tasks",
            "TASK-APPLY-EXEC-NO-AUTH",
            "execution-map.json",
          ),
          planArtifactPath: "docs/plans/fake.md",
          approvedBy: "user",
        },
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.status, "failed");
    assert.equal(result.details.result.code, "execution_authorization_missing");
    assert.equal(calls.length, 0);
    assert.match(result.content[0].text, /execution_authorization_missing/);
    assert.equal((await store.readRouteApplications("TASK-APPLY-EXEC-NO-AUTH")).length, 0);
    assert.equal((await store.readLayoutState("TASK-APPLY-EXEC-NO-AUTH")).allocations.length, 0);
  });
});

test("delegate_apply_route rejects a causally invalid stored authorization before startup mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-EXEC-INVALID-AUTH";
    const planArtifactPath = "docs/plans/approved-plan.md";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const ready = await publishReadyEvent(store, taskId, planArtifactPath);
    const approval = await store.recordPlanApproved(taskId, {
      eventId: "evt.plan.approved",
      planningReportReadyEventId: ready.eventId,
      planArtifactPath,
      approvedBy: "user",
    });
    const authorization = await store.recordExecutionAuthorized(taskId, {
      eventId: "evt.execution.authorized",
      planningReportReadyEventId: ready.eventId,
      planApprovedEventId: approval.eventId,
      planArtifactPath,
    });
    await store.appendTaskEvent(taskId, {
      eventId: "evt.execution.forged-later",
      type: "execution.authorized",
      state: "failed",
      data: { ...authorization.data },
    });
    await store.appendRouteDecision(taskId, {
      kind: "route_required",
      routeId: "route-execution-parent-invalid-auth",
      targetRole: "execution-parent",
      reasonCodes: ["stored_execution_authorization_present"],
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("invalid execution authorization must fail before cmux startup");
    });

    const result = await tools.get("delegate_apply_route").execute(
      "apply-exec-invalid-auth",
      {
        taskId,
        routeId: "route-execution-parent-invalid-auth",
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.code, "execution_authorization_missing");
    assert.equal(calls.length, 0);
    assert.equal((await store.readRouteApplications(taskId)).length, 0);
    assert.equal((await store.readLayoutState(taskId)).allocations.length, 0);
  });
});

test("delegate_apply_route applies execution-parent with stored authorization and records right-top layout", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const ready = await publishReadyEvent(store, "TASK-APPLY-EXEC-AUTH", "docs/plans/approved-plan.md");
    const approval = await store.recordPlanApproved("TASK-APPLY-EXEC-AUTH", {
      eventId: "evt.plan.approved",
      planningReportReadyEventId: ready.eventId,
      planArtifactPath: "docs/plans/approved-plan.md",
      approvedBy: "orchestrator",
    });
    await store.recordExecutionAuthorized("TASK-APPLY-EXEC-AUTH", {
      eventId: "evt.execution.authorized",
      planningReportReadyEventId: ready.eventId,
      planApprovedEventId: approval.eventId,
      planArtifactPath: "docs/plans/approved-plan.md",
    });
    await store.appendRouteDecision("TASK-APPLY-EXEC-AUTH", {
      kind: "route_required",
      routeId: "route-execution-parent-auth",
      targetRole: "execution-parent",
      reasonCodes: ["stored_execution_authorization_present"],
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("delegate_apply_route execution-parent must not call cmux in Phase 4b");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-exec-auth",
      { taskId: "TASK-APPLY-EXEC-AUTH", routeId: "route-execution-parent-auth" },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.status, "applied");
    assert.equal(result.details.result.target, "execution-parent");
    assert.equal(result.details.result.authorization.source, "store");
    assert.equal(result.details.result.layout.slot, "right-top");
    assert.equal(calls.length, 0);
    const applications = await store.readRouteApplications("TASK-APPLY-EXEC-AUTH");
    assert.equal(applications.length, 1);
    assert.equal(applications[0].waitingFor, "EXECUTION_REPORT");
    assert.equal((await store.readLayoutState("TASK-APPLY-EXEC-AUTH")).allocations[0].slot, "right-top");
  });
});

test("delegate_apply_route spawns a stored worker route once and reuses the recorded application", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-WORKER";
    const routeId = "route-worker-spawn";
    const assignmentId = "worker-route-worker-spawn";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "worker", {
      action: {
        kind: "implement",
        breadth: "multi_file",
        description: "Implement the stored worker route from request evidence.",
      },
      targetFiles: ["src/target.ts", "tests/target.test.ts"],
      writeScopes: ["src/**", "tests/**"],
      riskFlags: ["unknown"],
    });
    const { tools, calls } = loadExtension(cmuxLifecycleExec());
    const applyRoute = tools.get("delegate_apply_route");

    const applied = await applyRoute.execute(
      "apply-worker",
      {
        taskId,
        routeId,
        targetRole: "planning-parent",
        kind: "inline_allowed",
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    const callCountAfterApply = calls.length;
    const reapplied = await applyRoute.execute(
      "apply-worker-again",
      {
        taskId,
        routeId,
        targetRole: "execution-parent",
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(applied.details.result.status, "applied");
    assert.equal(applied.details.result.target, "worker");
    assert.deepEqual(applied.details.result.spawned, [assignmentId]);
    assert.equal(applied.details.result.routeApplication.spawned[0], assignmentId);
    assert.equal(applied.details.result.materialization.status, "spawned");
    assert.equal(applied.details.result.materialization.running, true);
    assert.equal(applied.details.result.layout.slot, "right-bottom");
    assert.equal(applied.details.result.layout.assignmentId, assignmentId);
    assert.equal(applied.details.result.layout.surfaceRef, "surface:3");
    assert.equal(applied.details.result.routeApplication.waitingFor, "WORKER_RESULT");
    assert.equal(reapplied.details.result.status, "already_applied");
    assert.deepEqual(reapplied.details.result.spawned, [assignmentId]);
    assert.equal(calls.length, callCountAfterApply);
    assert.match(
      applied.content[0].text,
      /apply_route\|route-worker-spawn\|route_required\|target=worker\|state=applied/,
    );
    assert.match(applied.content[0].text, /spawned\|worker-route-worker-spawn/);
    assert.match(
      applied.content[0].text,
      /materialization\|spawned\|assignment=worker-route-worker-spawn\|role=worker\|running=true/,
    );
    assert.match(
      reapplied.content[0].text,
      /route_application\|already_applied\|id=apply-route-worker-spawn\|waitingFor=WORKER_RESULT/,
    );
    assert.match(
      reapplied.content[0].text,
      /action\|existing_child_route_application_reused_no_cmux_new_pane_or_task_packet/,
    );

    const newPaneCalls = calls.filter((call) => call.command[0] === "cmux" && call.command[1] === "new-pane");
    assert.equal(newPaneCalls.length, 1);
    assert.match(newPaneCalls[0].command.join(" "), /--focus false/);
    const sendCall = calls.find((call) => call.command[0] === "cmux" && call.command[1] === "send");
    assert.ok(sendCall);
    const sentText = sendCall.command.at(-1);
    assert.match(sentText, /FREEFLOW_DELEGATION_ATTEMPT_ID='attempt-route-worker-spawn'/);
    assert.match(sentText, /pi --no-session --name 'worker-route-worker-spawn' "\$\(cat /);
    assert.doesNotMatch(sentText, /Implement the stored worker route/);
    assert.doesNotMatch(sentText, /\n/);

    const applications = await store.readRouteApplications(taskId);
    assert.equal(applications.length, 1);
    assert.equal(applications[0].layoutAllocationId, `layout-${assignmentId}-worker`);
    assert.deepEqual(applications[0].spawned, [assignmentId]);
    assert.equal(applications[0].reused, undefined);
    const layout = await store.readLayoutState(taskId);
    assert.equal(layout.allocations.length, 1);
    assert.equal(layout.allocations[0].slot, "right-bottom");
    assert.equal(layout.allocations[0].assignmentId, assignmentId);
    assert.equal(layout.allocations[0].surfaceRef, "surface:3");
    const paths = store.pathsForAgent(taskId, assignmentId);
    assert.equal(layout.allocations[0].promptPath, paths.taskPacketRaw);
    assert.equal(layout.allocations[0].reportPath, paths.resultJson);
    const registry = await store.readRegistry(taskId);
    assert.equal(registry.agents.length, 1);
    assert.equal(registry.agents[0].agentId, assignmentId);
    assert.equal(registry.agents[0].state, "running");
    assert.equal((await store.readLeaseEvents(taskId)).length, 2);
    assert.deepEqual(applications[0].leaseIds, ["lease-routed-route-worker-spawn"]);
    const activeLeaseView = await store.readActiveLeaseView(taskId);
    assert.deepEqual(activeLeaseView.activeLeaseIdsByAgent, { [assignmentId]: ["lease-routed-route-worker-spawn"] });
    assert.equal(activeLeaseView.leasesById["lease-routed-route-worker-spawn"].attemptId, "attempt-route-worker-spawn");
    const manifest = await store.readAgentManifest(taskId, assignmentId);
    assert.equal(manifest.assignmentId, assignmentId);
    assert.equal(manifest.attemptId, "attempt-route-worker-spawn");
    assert.equal(manifest.attemptSource, "routed");
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.protocolVersion, 1);
    const packet = await readFile(paths.taskPacketRaw, "utf8");
    assert.match(packet, /- attempt: attempt-route-worker-spawn/);
    assert.match(packet, /- identity\/profile\/protocol versions: 1 \/ 1 \/ 1/);
    assert.match(packet, /Implement the stored worker route from request evidence\./);
    assert.match(packet, /Worker write scope: src\/\*\*/);
    assert.match(packet, /Worker write scope: tests\/\*\*/);
    assert.match(packet, /target_file: src\/target\.ts/);
    assert.match(packet, /risk_flags_context_only/);
  });
});

test("routed worker commands come only from one deterministic execution-map package", async () => {
  for (const mode of ["unique", "ambiguous"]) {
    await withTempRepo(async (repoRoot) => {
      const taskId = `TASK-ROUTED-COMMAND-${mode.toUpperCase()}`;
      const routeId = `route-worker-command-${mode}`;
      const assignmentId = `worker-${routeId}`;
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      await appendChildRouteDecision(store, taskId, routeId, "worker", {
        targetFiles: ["src/target.ts"],
        writeScopes: ["src/target.ts"],
      });
      const packageFor = (packageId, expectedWriteScopes, agentId = undefined) => ({
        packageId,
        role: "worker",
        ...(agentId === undefined ? {} : { agentId }),
        dependencies: [],
        expectedWriteScopes,
        checkoutPath: repoRoot,
        allowedCommands: [`npm run test:${packageId}`],
        state: "ready",
        review: { required: false, status: "not_required" },
        verification: { required: false, status: "not_required" },
        commitCheckpoints: [],
      });
      const packages =
        mode === "unique"
          ? [packageFor("P1", ["src/**"], assignmentId)]
          : [packageFor("P1", ["src/**"]), packageFor("P2", ["src/target.ts"])];
      await writeFile(
        store.pathsForTask(taskId).executionMapJson,
        `${JSON.stringify({ version: 1, taskId, packages, integrationOrder: [], updatedAt: "2026-07-09T00:00:00.000Z" }, null, 2)}\n`,
        "utf8",
      );

      const { tools } = loadExtension(cmuxLifecycleExec());
      const applied = await tools
        .get("delegate_apply_route")
        .execute(`apply-${mode}`, { taskId, routeId }, undefined, undefined, ctx(repoRoot));
      const manifest = await store.readAgentManifest(taskId, assignmentId);
      const active = (await store.readActiveLeaseView(taskId)).leasesById[`lease-routed-${routeId}`];

      if (mode === "unique") {
        assert.equal(applied.details.result.policy.commandAuthority.status, "unique_package");
        assert.equal(applied.details.result.policy.commandAuthority.packageId, "P1");
        assert.deepEqual(manifest.allowedCommands, ["npm run test:P1"]);
        assert.deepEqual(active.allowedCommands, ["npm run test:P1"]);
        assert.ok(active.actions.includes("run_allowlisted"));
      } else {
        assert.equal(applied.details.result.policy.commandAuthority.status, "ambiguous_package");
        assert.deepEqual(manifest.allowedCommands, []);
        assert.deepEqual(active.allowedCommands, []);
        assert.equal(active.actions.includes("run_allowlisted"), false);
        assert.ok(active.actions.includes("edit"));
      }
    });
  }
});

test("delegate_apply_route reuses a pre-existing active deterministic child assignment", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-WORKER-REUSE";
    const routeId = "route-worker-reuse";
    const assignmentId = "worker-route-worker-reuse";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: ["src/**"] });
    const reusableManifest = await store.registerAgent({
      taskId,
      agentId: assignmentId,
      role: "worker",
      profile: "worker",
      attemptId: "attempt-route-worker-reuse",
      attemptSource: "routed",
      parentAgentId: "execution-parent-1",
      cwd: repoRoot,
      writeScope: ["src/**"],
      state: "running",
      paneRef: "pane:existing",
      surfaceRef: "surface:existing",
      workspaceRef: "workspace:existing",
    });
    await writeCurrentTaskPacket(store, reusableManifest);
    const { tools, calls } = loadExtension(cmuxLifecycleExec());
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-worker-reuse",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.status, "applied");
    assert.deepEqual(result.details.result.reused, [assignmentId]);
    assert.equal(result.details.result.cmux.surfaceRef, "surface:existing");
    assert.equal(result.details.result.materialization.status, "reused");
    assert.equal(
      calls.some((call) => call.command[0] === "cmux" && call.command[1] === "new-pane"),
      false,
    );
    assert.equal(
      calls.some((call) => call.command[0] === "cmux" && call.command[1] === "send"),
      false,
    );
    const applications = await store.readRouteApplications(taskId);
    assert.equal(applications.length, 1);
    assert.deepEqual(applications[0].reused, [assignmentId]);
    assert.equal((await store.readLayoutState(taskId)).allocations[0].surfaceRef, "surface:existing");
    assert.match(
      await readFile(store.pathsForAgent(taskId, assignmentId).taskPacketRaw, "utf8"),
      /- attempt: attempt-route-worker-reuse/,
    );
  });
});

test("delegate_apply_route revokes active authority when a post-activation event write fails", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-POST-ACTIVATION-STORE-FAIL";
    const routeId = "route-worker-post-activation-store-fail";
    const assignmentId = `worker-${routeId}`;
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: ["src/**"] });
    await mkdir(store.pathsForAgent(taskId, assignmentId).eventsJsonl, { recursive: true });
    const { tools, calls } = loadExtension(cmuxLifecycleExec());

    const result = await tools
      .get("delegate_apply_route")
      .execute("apply-post-activation-store-fail", { taskId, routeId }, undefined, undefined, ctx(repoRoot));

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.status, "failed");
    assert.equal(result.details.result.code, "route_spawn_startup_failed");
    assert.equal((await store.readRouteApplications(taskId)).length, 0);
    assert.equal((await store.readLayoutState(taskId)).allocations.length, 0);
    assert.equal((await store.readRegistry(taskId)).agents[0].state, "failed");
    assert.equal((await store.readAgentStatus(taskId, assignmentId)).state, "failed");
    assert.deepEqual(
      (await store.readLeaseEvents(taskId)).map((event) => event.state),
      ["issued", "active", "revoked"],
    );
    assert.deepEqual((await store.readActiveLeaseView(taskId)).activeLeaseIdsByAgent, {});
    assert.equal(
      calls.some((call) => call.command[0] === "cmux" && call.command[1] === "new-pane"),
      false,
    );
  });
});

test("delegate_apply_route fails closed on child route cmux pane creation and startup failures", async () => {
  for (const [failAt, expectedCode] of [
    ["new-pane", "cmux_new_pane_failed"],
    ["surface-ref", "cmux_surface_ref_missing"],
    ["send", "child_pi_start_failed"],
  ]) {
    await withTempRepo(async (repoRoot) => {
      const taskId = `TASK-APPLY-WORKER-${String(failAt)
        .toUpperCase()
        .replace(/[^A-Z]/g, "-")}`;
      const routeId = `route-worker-${failAt}`;
      const assignmentId = `worker-${routeId}`;
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: ["src/**"] });
      const { tools } = loadExtension(cmuxLifecycleExec({ failAt }));
      const applyRoute = tools.get("delegate_apply_route");

      const result = await applyRoute.execute(
        `apply-${failAt}`,
        { taskId, routeId },
        undefined,
        undefined,
        ctx(repoRoot),
      );

      assert.equal(result.details.result.toolStatus, "error", failAt);
      assert.equal(result.details.result.status, "failed", failAt);
      assert.equal(result.details.result.code, expectedCode, failAt);
      assert.equal((await store.readRouteApplications(taskId)).length, 0, failAt);
      assert.equal((await store.readLayoutState(taskId)).allocations.length, 0, failAt);
      assert.equal((await store.readRegistry(taskId)).agents[0].state, "failed", failAt);
      assert.equal((await store.readAgentStatus(taskId, assignmentId)).state, "failed", failAt);
      const events = await readFile(store.pathsForAgent(taskId, assignmentId).eventsJsonl, "utf8");
      assert.match(events, /agent-start-failed/, failAt);
      const leaseEvents = await store.readLeaseEvents(taskId);
      assert.deepEqual(
        leaseEvents.map((event) => event.state),
        ["issued", "active", "revoked"],
        failAt,
      );
      assert.deepEqual((await store.readActiveLeaseView(taskId)).activeLeaseIdsByAgent, {}, failAt);
      assert.match(result.content[0].text, new RegExp(expectedCode), failAt);
    });
  }
});

test("delegate_apply_route fails closed for mismatched active reuse state, profile, and parent", async () => {
  const cases = [
    {
      name: "state-mismatch",
      code: "route_assignment_state_mismatch",
      async mutate(store, taskId, assignmentId) {
        await store.writeAgentStatus(taskId, assignmentId, { state: "completed", message: "done" });
        const registryPath = store.pathsForTask(taskId).registryJson;
        const registry = JSON.parse(await readFile(registryPath, "utf8"));
        registry.agents[0].state = "running";
        await writeFile(registryPath, JSON.stringify(registry, null, 2), "utf8");
      },
    },
    {
      name: "profile-mismatch",
      code: "route_assignment_profile_mismatch",
      async mutate(store, taskId, assignmentId) {
        await store.updateAgentManifest(taskId, assignmentId, { profile: "write-scoped" });
      },
    },
    {
      name: "parent-mismatch",
      code: "route_assignment_parent_mismatch",
      async mutate(store, taskId, assignmentId) {
        await store.updateAgentManifest(taskId, assignmentId, { parentAgentId: "other-parent" });
      },
    },
    {
      name: "attempt-mismatch",
      code: "route_assignment_attempt_mismatch",
      async mutate(store, taskId, assignmentId) {
        const manifestPath = store.pathsForAgent(taskId, assignmentId).manifestJson;
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        await writeFile(
          manifestPath,
          `${JSON.stringify({ ...manifest, attemptId: "attempt-wrong" }, null, 2)}\n`,
          "utf8",
        );
      },
    },
    {
      name: "packet-attempt-mismatch",
      code: "route_assignment_packet_identity_mismatch",
      async mutate(store, taskId, assignmentId) {
        const packetPath = store.pathsForAgent(taskId, assignmentId).taskPacketRaw;
        const packet = await readFile(packetPath, "utf8");
        await writeFile(packetPath, packet.replace(/- attempt:.*\n/, "- attempt: attempt-wrong\n"), "utf8");
      },
    },
  ];

  for (const entry of cases) {
    await withTempRepo(async (repoRoot) => {
      const taskId = `TASK-APPLY-REUSE-${entry.name.toUpperCase().replace(/[^A-Z]/g, "-")}`;
      const routeId = `route-worker-reuse-${entry.name}`;
      const assignmentId = `worker-${routeId}`;
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: ["src/**"] });
      const reusableManifest = await store.registerAgent({
        taskId,
        agentId: assignmentId,
        role: "worker",
        profile: "worker",
        attemptId: `attempt-${routeId}`,
        attemptSource: "routed",
        parentAgentId: "execution-parent-1",
        cwd: repoRoot,
        writeScope: ["src/**"],
        state: "running",
        paneRef: "pane:existing",
        surfaceRef: "surface:existing",
        workspaceRef: "workspace:existing",
      });
      await writeCurrentTaskPacket(store, reusableManifest);
      await entry.mutate(store, taskId, assignmentId);
      const { tools, calls } = loadExtension(cmuxLifecycleExec());
      const applyRoute = tools.get("delegate_apply_route");

      const result = await applyRoute.execute(
        `apply-${entry.name}`,
        { taskId, routeId },
        undefined,
        undefined,
        ctx(repoRoot),
      );

      assert.equal(result.details.result.toolStatus, "error", entry.name);
      assert.equal(result.details.result.code, entry.code, entry.name);
      assert.equal((await store.readRouteApplications(taskId)).length, 0, entry.name);
      assert.equal((await store.readLayoutState(taskId)).allocations.length, 0, entry.name);
      assert.equal(
        calls.some((call) => call.command[0] === "cmux" && call.command[1] === "new-pane"),
        false,
        entry.name,
      );
      assert.equal(
        calls.some((call) => call.command[0] === "cmux" && call.command[1] === "send"),
        false,
        entry.name,
      );
    });
  }
});

test("delegate_apply_route fails closed for mismatched active reuse identity before mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-REUSE-IDENTITY-MISMATCH";
    const routeId = "route-worker-reuse-identity-mismatch";
    const assignmentId = `worker-${routeId}`;
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: ["src/**"] });
    await store.registerAgent({
      taskId,
      agentId: assignmentId,
      role: "worker",
      profile: "worker",
      parentAgentId: "execution-parent-1",
      cwd: repoRoot,
      writeScope: ["src/**"],
      state: "running",
      paneRef: "pane:existing",
      surfaceRef: "surface:existing",
      workspaceRef: "workspace:existing",
    });
    const paths = store.pathsForAgent(taskId, assignmentId);
    const status = JSON.parse(await readFile(paths.statusJson, "utf8"));
    status.agentId = "worker-other-assignment";
    await writeFile(paths.statusJson, JSON.stringify(status, null, 2), "utf8");
    const { tools, calls } = loadExtension(cmuxLifecycleExec());
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-identity-mismatch",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.status, "failed");
    assert.equal(result.details.result.code, "route_assignment_identity_mismatch");
    assert.equal((await store.readRouteApplications(taskId)).length, 0);
    assert.equal((await store.readLayoutState(taskId)).allocations.length, 0);
    assert.equal(calls.length, 0);
    await assert.rejects(readFile(paths.taskPacketRaw, "utf8"));
    assert.equal((await store.readLeaseEvents(taskId)).length, 0);
  });
});

test("delegate_apply_route fails closed for child route missing stored request evidence before cmux or mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-CHILD-NO-REQUEST";
    const routeId = "route-worker-no-request";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.appendRouteDecision(taskId, {
      kind: "route_required",
      routeId,
      targetRole: "worker",
      reasonCodes: ["execution_parent_implementation_routes_worker"],
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("missing request evidence must fail before cmux/preflight");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-worker-no-request",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "route_request_evidence_missing");
    assert.match(result.content[0].text, /route_request_evidence_missing/);
    assert.equal(calls.length, 0);
    assert.equal((await store.readRouteApplications(taskId)).length, 0);
    assert.equal((await store.readLayoutState(taskId)).allocations.length, 0);
    assert.equal((await store.readRegistry(taskId)).agents.length, 0);
  });
});

test("delegate_apply_route fails closed for worker route missing stored writeScopes before cmux or mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-WORKER-NO-SCOPE";
    const routeId = "route-worker-no-scope";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: [] });
    const { tools, calls } = loadExtension(() => {
      throw new Error("missing worker writeScopes must fail before cmux/preflight");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-worker-no-scope",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "worker_write_scope_missing");
    assert.equal(calls.length, 0);
    assert.equal((await store.readRouteApplications(taskId)).length, 0);
    assert.equal((await store.readLayoutState(taskId)).allocations.length, 0);
    assert.equal((await store.readRegistry(taskId)).agents.length, 0);
  });
});

test("delegate_apply_route spawns reviewer researcher and verifier with read-only/check profiles and no write scope", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const { tools, calls } = loadExtension(cmuxLifecycleExec());
    const applyRoute = tools.get("delegate_apply_route");
    const expected = {
      reviewer: { profile: "read-only", waitingFor: "REVIEW_RESULT" },
      researcher: { profile: "read-only", waitingFor: "RESEARCH_RESULT" },
      verifier: { profile: "check-runner", waitingFor: "VERIFICATION_RESULT" },
    };

    for (const role of ["reviewer", "researcher", "verifier"]) {
      const taskId = `TASK-APPLY-${role.toUpperCase()}`;
      const routeId = `route-${role}-spawn`;
      const assignmentId = `${role}-${routeId}`;
      await appendChildRouteDecision(store, taskId, routeId, role, {
        action: {
          kind: role === "reviewer" ? "review" : role === "verifier" ? "verify" : "research",
          breadth: "single_file",
          description: `Run ${role} from stored route request.`,
        },
        targetFiles: ["src/target.ts"],
        writeScopes: ["caller/hint/ignored/**"],
        riskFlags: ["unknown"],
      });

      const result = await applyRoute.execute(
        `apply-${role}`,
        { taskId, routeId },
        undefined,
        undefined,
        ctx(repoRoot),
      );

      assert.equal(result.details.result.status, "applied");
      assert.equal(result.details.result.target, role);
      assert.equal(result.details.result.profile, expected[role].profile);
      assert.equal(result.details.result.routeApplication.waitingFor, expected[role].waitingFor);
      assert.equal(result.details.result.policy.writeScope.length, 0);
      assert.equal(result.details.result.layout.slot, "right-bottom");
      assert.equal(result.details.result.materialization.status, "spawned");
      const manifest = await store.readAgentManifest(taskId, assignmentId);
      assert.equal(manifest.profile, expected[role].profile);
      assert.equal(manifest.writeScope, undefined);
      assert.equal(manifest.writeScopes, undefined);
      assert.deepEqual(result.details.result.routeApplication.leaseIds, []);
      assert.equal((await store.readLeaseEvents(taskId)).length, 0);
      const packet = await readFile(store.pathsForAgent(taskId, assignmentId).taskPacketRaw, "utf8");
      assert.match(packet, /Write scope:\n- none/);
      assert.match(packet, /caller-supplied apply_route target\/kind hints/i);
    }

    assert.equal(calls.filter((call) => call.command[0] === "cmux" && call.command[1] === "new-pane").length, 3);
  });
});

test("delegate_apply_route fails closed for existing materialization-only child route application", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-CHILD-MATERIALIZATION-ONLY";
    const routeId = "route-worker-materialization-only";
    const assignmentId = "worker-route-worker-materialization-only";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: ["src/**"] });
    const paths = store.pathsForAgent(taskId, assignmentId);
    const allocation = await store.recordLayoutAllocation({
      allocationId: `layout-${assignmentId}-worker`,
      taskId,
      assignmentId,
      role: "worker",
      preset: "default-v1",
      slot: "right-bottom",
      workspaceRef: "workspace:1",
      created: true,
      reused: false,
      preserveFocus: true,
      promptPath: paths.taskPacketRaw,
      reportPath: paths.resultJson,
      reasonCodes: ["legacy_materialization_only"],
    });
    await store.recordRouteApplication({
      applicationId: `apply-${routeId}`,
      routeId,
      taskId,
      state: "applied",
      decisionKind: "route_required",
      layoutAllocationId: allocation.allocationId,
      waitingFor: "WORKER_RESULT",
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("materialization-only application must fail before cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "reapply-materialization-only",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "child_route_application_incomplete");
    assert.match(result.details.result.nextAction, /repair or cancel/);
    assert.equal(calls.length, 0);
    assert.equal((await store.readRegistry(taskId)).agents.length, 0);
    await assert.rejects(readFile(paths.taskPacketRaw, "utf8"));
  });
});

test("delegate_apply_route fails closed when reapplying a child route with missing layout allocation evidence", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-CHILD-MISSING-LAYOUT";
    const routeId = "route-worker-missing-layout";
    const assignmentId = "worker-route-worker-missing-layout";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: ["src/**"] });
    await store.recordRouteApplication({
      applicationId: `apply-${routeId}`,
      routeId,
      taskId,
      state: "applied",
      decisionKind: "route_required",
      layoutAllocationId: `layout-${assignmentId}-worker`,
      spawned: [assignmentId],
      waitingFor: "WORKER_RESULT",
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("already-applied child route hardening must not call cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const reapplied = await applyRoute.execute(
      "reapply-worker-missing-layout",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(reapplied.details.result.toolStatus, "error");
    assert.equal(reapplied.details.result.status, "failed");
    assert.equal(reapplied.details.result.code, "route_application_layout_missing");
    assert.match(reapplied.content[0].text, /route_application_layout_missing/);
    assert.match(reapplied.content[0].text, /no_new_route_application_or_layout_state_mutated/);
    assert.equal(calls.length, 0);
    assert.equal((await store.readRouteApplications(taskId)).length, 1);
    assert.equal((await store.readLayoutState(taskId)).allocations.length, 0);
    assert.equal((await store.readRegistry(taskId)).agents.length, 0);
    assert.equal((await store.readLeaseEvents(taskId)).length, 0);
  });
});

test("delegate_apply_route fails closed when reapplying a child route with malformed layout state", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-CHILD-MALFORMED-LAYOUT";
    const routeId = "route-reviewer-malformed-layout";
    const assignmentId = "reviewer-route-reviewer-malformed-layout";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "reviewer");
    const paths = store.pathsForAgent(taskId, assignmentId);
    const allocation = await store.recordLayoutAllocation({
      allocationId: `layout-${assignmentId}-reviewer`,
      taskId,
      assignmentId,
      role: "reviewer",
      preset: "default-v1",
      slot: "right-bottom",
      workspaceRef: "workspace:1",
      created: true,
      reused: false,
      preserveFocus: true,
      promptPath: paths.taskPacketRaw,
      reportPath: paths.resultJson,
      reasonCodes: ["test"],
    });
    await store.recordRouteApplication({
      applicationId: `apply-${routeId}`,
      routeId,
      taskId,
      state: "applied",
      decisionKind: "route_required",
      layoutAllocationId: allocation.allocationId,
      spawned: [assignmentId],
      waitingFor: "REVIEW_RESULT",
    });
    await writeFile(store.pathsForTask(taskId).layoutJson, "{bad json\n", "utf8");
    const { tools, calls } = loadExtension(() => {
      throw new Error("already-applied child route hardening must not call cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const reapplied = await applyRoute.execute(
      "reapply-reviewer-bad-layout",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(reapplied.details.result.toolStatus, "error");
    assert.equal(reapplied.details.result.status, "failed");
    assert.equal(reapplied.details.result.code, "layout_state_malformed");
    assert.match(reapplied.content[0].text, /layout_state_malformed/);
    assert.match(reapplied.content[0].text, /no_new_route_application_or_layout_state_mutated/);
    assert.equal(calls.length, 0);
    assert.equal((await store.readRouteApplications(taskId)).length, 1);
    await assert.rejects(() => store.readLayoutState(taskId), /Expected property name|Unexpected token|not valid JSON/);
    assert.equal((await store.readRegistry(taskId)).agents.length, 0);
    assert.equal((await store.readLeaseEvents(taskId)).length, 0);
  });
});

test("delegate_apply_route fails closed when reapplying a child route with mismatched allocation role and assignment", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-CHILD-WRONG-ALLOCATION";
    const routeId = "route-worker-wrong-allocation";
    const assignmentId = "worker-route-worker-wrong-allocation";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: ["src/**"] });
    const paths = store.pathsForAgent(taskId, assignmentId);
    const allocation = await store.recordLayoutAllocation({
      allocationId: `layout-${assignmentId}-worker`,
      taskId,
      assignmentId: "reviewer-route-worker-wrong-allocation",
      role: "reviewer",
      preset: "default-v1",
      slot: "right-bottom",
      workspaceRef: "workspace:1",
      created: true,
      reused: false,
      preserveFocus: true,
      promptPath: paths.taskPacketRaw,
      reportPath: paths.resultJson,
      reasonCodes: ["test"],
    });
    await store.recordRouteApplication({
      applicationId: `apply-${routeId}`,
      routeId,
      taskId,
      state: "applied",
      decisionKind: "route_required",
      layoutAllocationId: allocation.allocationId,
      spawned: [assignmentId],
      waitingFor: "WORKER_RESULT",
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("corrupt already-applied child allocation must not call cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const reapplied = await applyRoute.execute(
      "reapply-worker-corrupt-allocation",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(reapplied.details.result.toolStatus, "error");
    assert.equal(reapplied.details.result.status, "failed");
    assert.equal(reapplied.details.result.code, "route_application_layout_invalid");
    assert.match(reapplied.details.result.reason, /assignmentId expected worker-route-worker-wrong-allocation/);
    assert.match(reapplied.details.result.reason, /role expected worker got reviewer/);
    assert.match(reapplied.content[0].text, /route_application_layout_invalid/);
    assert.match(reapplied.content[0].text, /no_new_route_application_or_layout_state_mutated/);
    assert.equal(calls.length, 0);
    assert.equal((await store.readRouteApplications(taskId)).length, 1);
    assert.equal((await store.readLayoutState(taskId)).allocations.length, 1);
    assert.equal((await store.readRegistry(taskId)).agents.length, 0);
    assert.equal((await store.readLeaseEvents(taskId)).length, 0);
  });
});

test("delegate_apply_route fails closed when reapplying a child route with non-canonical prompt and report paths", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-CHILD-WRONG-PATHS";
    const routeId = "route-reviewer-wrong-paths";
    const assignmentId = "reviewer-route-reviewer-wrong-paths";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "reviewer");
    const allocation = await store.recordLayoutAllocation({
      allocationId: `layout-${assignmentId}-reviewer`,
      taskId,
      assignmentId,
      role: "reviewer",
      preset: "default-v1",
      slot: "right-bottom",
      workspaceRef: "workspace:1",
      created: true,
      reused: false,
      preserveFocus: true,
      promptPath: ".freeflow/delegation/tasks/TASK-APPLY-CHILD-WRONG-PATHS/agents/other/model/task-packet.txt",
      reportPath: ".freeflow/delegation/tasks/TASK-APPLY-CHILD-WRONG-PATHS/agents/other/result.json",
      reasonCodes: ["test"],
    });
    await store.recordRouteApplication({
      applicationId: `apply-${routeId}`,
      routeId,
      taskId,
      state: "applied",
      decisionKind: "route_required",
      layoutAllocationId: allocation.allocationId,
      spawned: [assignmentId],
      waitingFor: "REVIEW_RESULT",
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("corrupt already-applied child allocation must not call cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const reapplied = await applyRoute.execute(
      "reapply-reviewer-corrupt-paths",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(reapplied.details.result.toolStatus, "error");
    assert.equal(reapplied.details.result.status, "failed");
    assert.equal(reapplied.details.result.code, "route_application_layout_invalid");
    assert.match(reapplied.details.result.reason, /promptPath does not match canonical/);
    assert.match(reapplied.details.result.reason, /reportPath does not match canonical/);
    assert.match(reapplied.content[0].text, /route_application_layout_invalid/);
    assert.match(reapplied.content[0].text, /no_new_route_application_or_layout_state_mutated/);
    assert.equal(calls.length, 0);
    assert.equal((await store.readRouteApplications(taskId)).length, 1);
    assert.equal((await store.readLayoutState(taskId)).allocations.length, 1);
    assert.equal((await store.readRegistry(taskId)).agents.length, 0);
    assert.equal((await store.readLeaseEvents(taskId)).length, 0);
  });
});

test("delegate_apply_route applies read-only child overflow after two existing read-only allocations", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-OVERFLOW";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    for (const role of ["researcher", "verifier", "reviewer"]) {
      await appendChildRouteDecision(store, taskId, `route-${role}-overflow`, role);
    }
    const { tools, calls } = loadExtension(cmuxLifecycleExec());
    const applyRoute = tools.get("delegate_apply_route");

    const first = await applyRoute.execute(
      "apply-researcher-overflow",
      { taskId, routeId: "route-researcher-overflow" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    const second = await applyRoute.execute(
      "apply-verifier-overflow",
      { taskId, routeId: "route-verifier-overflow" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    const third = await applyRoute.execute(
      "apply-reviewer-overflow",
      { taskId, routeId: "route-reviewer-overflow" },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(first.details.result.layout.slot, "right-bottom");
    assert.equal(second.details.result.layout.slot, "right-bottom");
    assert.equal(third.details.result.layout.slot, "right-surface-overflow");
    assert.equal(third.details.result.target, "reviewer");
    assert.match(
      third.content[0].text,
      /layout\|right-surface-overflow\|allocation=layout-reviewer-route-reviewer-overflow-reviewer\|focus=preserved/,
    );
    assert.equal(calls.filter((call) => call.command[0] === "cmux" && call.command[1] === "new-pane").length, 3);
    const layout = await store.readLayoutState(taskId);
    assert.deepEqual(
      layout.allocations.map((allocation) => allocation.slot).sort(),
      ["right-bottom", "right-bottom", "right-surface-overflow"].sort(),
    );
    assert.equal((await store.readRouteApplications(taskId)).length, 3);
  });
});

test("delegate_apply_route fails closed on malformed layout state before child route application mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-BAD-LAYOUT";
    const routeId = "route-worker-bad-layout";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await appendChildRouteDecision(store, taskId, routeId, "worker", { writeScopes: ["src/**"] });
    await writeFile(store.pathsForTask(taskId).layoutJson, "{bad json\n", "utf8");
    const { tools, calls } = loadExtension(() => {
      throw new Error("malformed layout state must fail before cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-bad-layout",
      { taskId, routeId },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.status, "failed");
    assert.equal(result.details.result.code, "layout_state_malformed");
    assert.equal(calls.length, 0);
    assert.match(result.content[0].text, /layout_state_malformed/);
    assert.equal((await store.readRouteApplications(taskId)).length, 0);
    await assert.rejects(() => store.readLayoutState(taskId), /Expected property name|Unexpected token|not valid JSON/);
  });
});

test("delegate_apply_route leaves integrator routes unsupported without mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-APPLY-INTEGRATOR-UNSUPPORTED";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.appendRouteDecision(taskId, {
      kind: "route_required",
      routeId: "route-integrator",
      targetRole: "integrator",
      reasonCodes: ["route_integrator"],
    });
    const { tools, calls } = loadExtension(() => {
      throw new Error("unsupported apply routes must not call cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-integrator",
      { taskId, routeId: "route-integrator" },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.status, "unsupported");
    assert.equal(result.details.result.target, "integrator");
    assert.match(result.content[0].text, /route_target_not_supported_in_phase4c/);
    assert.equal(calls.length, 0);
    assert.equal((await store.readRouteApplications(taskId)).length, 0);
    assert.equal((await store.readLayoutState(taskId)).allocations.length, 0);
  });
});

test("delegate_apply_route declines ask-user and blocked route decisions without mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.appendRouteDecision("TASK-APPLY-DECLINE", {
      kind: "ask_user",
      routeId: "route-ask-user",
      question: "Approve this decision?",
      reasonCodes: ["user_owned_decision_unresolved"],
    });
    await store.appendRouteDecision("TASK-APPLY-DECLINE", {
      kind: "blocked",
      routeId: "route-blocked",
      reason: "Leaf cannot spawn children.",
      suggestedReroute: "execution-parent",
      reasonCodes: ["leaf_spawn_blocked"],
    });
    const { tools } = loadExtension(() => ok());
    const applyRoute = tools.get("delegate_apply_route");

    const askUser = await applyRoute.execute(
      "apply-ask-user",
      { taskId: "TASK-APPLY-DECLINE", routeId: "route-ask-user" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    const blocked = await applyRoute.execute(
      "apply-blocked",
      { taskId: "TASK-APPLY-DECLINE", routeId: "route-blocked" },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(askUser.details.result.status, "declined");
    assert.equal(askUser.details.result.code, "ask_user_route_not_applied");
    assert.equal(blocked.details.result.status, "declined");
    assert.equal(blocked.details.result.code, "blocked_route_not_applied");
    assert.equal((await store.readRouteApplications("TASK-APPLY-DECLINE")).length, 0);
    assert.equal((await store.readLayoutState("TASK-APPLY-DECLINE")).allocations.length, 0);
  });
});

test("delegate_apply_route fails closed for missing stored route decision without mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.initTask({ taskId: "TASK-APPLY-MISSING" });
    const { tools } = loadExtension(() => ok());
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-missing",
      { taskId: "TASK-APPLY-MISSING", routeId: "route-missing" },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "route_decision_missing");
    assert.equal((await store.readRouteApplications("TASK-APPLY-MISSING")).length, 0);
    assert.equal((await store.readLayoutState("TASK-APPLY-MISSING")).allocations.length, 0);
  });
});

test("delegate_apply_route fails closed for malformed stored route decision log without mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.initTask({ taskId: "TASK-APPLY-BAD-ROUTE" });
    await writeFile(store.pathsForTask("TASK-APPLY-BAD-ROUTE").routesJsonl, "{bad json\n", "utf8");
    const { tools } = loadExtension(() => {
      throw new Error("malformed route log must fail before cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-bad-route",
      { taskId: "TASK-APPLY-BAD-ROUTE", routeId: "route-bad" },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "route_decisions_malformed");
    assert.match(result.content[0].text, /route_decisions_malformed/);
    assert.equal((await store.readRouteApplications("TASK-APPLY-BAD-ROUTE")).length, 0);
    assert.equal((await store.readLayoutState("TASK-APPLY-BAD-ROUTE")).allocations.length, 0);
  });
});

test("delegate_apply_route fails closed for malformed stored route application log before layout mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.appendRouteDecision("TASK-APPLY-BAD-APPLICATION", {
      kind: "route_required",
      routeId: "route-planning-bad-app-log",
      targetRole: "planning-parent",
      reasonCodes: ["orchestrator_implementation_requires_planning_parent"],
    });
    await writeFile(store.pathsForTask("TASK-APPLY-BAD-APPLICATION").routeApplicationsJsonl, "{bad json\n", "utf8");
    const { tools } = loadExtension(() => {
      throw new Error("malformed application log must fail before cmux");
    });
    const applyRoute = tools.get("delegate_apply_route");

    const result = await applyRoute.execute(
      "apply-bad-application",
      { taskId: "TASK-APPLY-BAD-APPLICATION", routeId: "route-planning-bad-app-log" },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "route_applications_malformed");
    assert.match(result.content[0].text, /route_applications_malformed/);
    assert.equal((await store.readLayoutState("TASK-APPLY-BAD-APPLICATION")).allocations.length, 0);
    await assert.rejects(
      () => store.readRouteApplications("TASK-APPLY-BAD-APPLICATION"),
      /Expected property name|Unexpected token|not valid JSON/,
    );
  });
});

test("delegation tool direct execute is disabled by config before side effects", async () => {
  await withTempRepo(async (repoRoot) => {
    await withProcessEnv({ FREEFLOW_DELEGATION_HARNESS_ENABLED: undefined }, async () => {
      const { tools } = loadExtension(
        () => {
          throw new Error("no command should run while delegation is disabled");
        },
        { delegationEnv: false },
      );
      const init = tools.get("delegate_task_init");
      const spawn = tools.get("delegate_spawn");

      const initResult = await init.execute(
        "init-disabled",
        { taskId: "TASK-DISABLED" },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      const spawnResult = await spawn.execute(
        "spawn-disabled",
        {
          taskId: "TASK-DISABLED",
          agentId: "worker-1",
          role: "worker",
          cwd: repoRoot,
          objective: "Should not spawn.",
        },
        undefined,
        undefined,
        ctx(repoRoot),
      );

      assert.equal(initResult.details.result.toolStatus, "disabled_by_config");
      assert.equal(spawnResult.details.result.toolStatus, "disabled_by_config");
      assert.match(initResult.content[0].text, /delegate_task_init\|disabled_by_config\|disabled_by_config/);
      await assert.rejects(readFile(join(repoRoot, ".freeflow/delegation/tasks/TASK-DISABLED/task.json"), "utf8"));
    });
  });
});

test("delegate_spawn unavailable preflight returns typed result without pane or child startup", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension((command) => {
      if (command.join(" ").includes("command -v 'cmux'")) return fail("cmux missing");
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const spawn = tools.get("delegate_spawn");

    const result = await spawn.execute(
      "spawn-missing",
      {
        taskId: "TASK-P3",
        agentId: "worker-1",
        role: "worker",
        cwd: repoRoot,
        objective: "Implement a bounded slice.",
        writeScope: join(repoRoot, "src"),
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.match(result.content[0].text, /delegate_spawn\|DELEGATION_UNAVAILABLE\|cmux_binary_missing/);
    assert.equal(result.details.result.status, "DELEGATION_UNAVAILABLE");
    assert.equal(result.details.result.actionTaken, "no_pane_opened_no_child_pi_started");
    assert.equal(
      calls.some((call) => call.command.includes("new-pane")),
      false,
    );
    assert.equal(
      calls.some((call) => call.command.includes("send")),
      false,
    );
  });
});

test("delegate_spawn fails before preflight when active-tool gating is unavailable", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension(
      () => {
        throw new Error("cmux should not be called when active-tool gating is unavailable");
      },
      { activeTools: false },
    );
    const spawn = tools.get("delegate_spawn");

    const result = await spawn.execute(
      "spawn-no-active-tools",
      {
        taskId: "TASK-ACTIVE-TOOLS",
        agentId: "worker-1",
        role: "worker",
        cwd: repoRoot,
        objective: "Implement a bounded slice.",
        writeScope: join(repoRoot, "src"),
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

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

    const result = await spawn.execute(
      "spawn-bad-scope",
      {
        taskId: "TASK-BAD-SCOPE",
        agentId: "worker-1",
        role: "worker",
        cwd: repoRoot,
        objective: "Implement a bounded slice.",
        writeScope: "may touch delegation/**, pi-extension/**",
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

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

    const result = await spawn.execute(
      "spawn-ok",
      {
        taskId: "TASK-P3",
        agentId: "worker-1",
        parentAgentId: "execution-parent-1",
        role: "worker",
        cwd: repoRoot,
        objective: "Implement P3 worker fixture.",
        writeScope: writeScopes,
        allowedCommands: ["npm run build"],
        sourcePointers: [{ kind: "plan", path: "docs/plans/plan.md" }],
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

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
    assert.deepEqual(result.details.result.leaseIds, ["lease-direct-worker-1"]);
    const activeLeaseView = await store.readActiveLeaseView("TASK-P3");
    assert.deepEqual(activeLeaseView.activeLeaseIdsByAgent, { "worker-1": ["lease-direct-worker-1"] });
    assert.deepEqual(activeLeaseView.leasesById["lease-direct-worker-1"].allowedCommands, ["npm run build"]);
    assert.deepEqual(activeLeaseView.leasesById["lease-direct-worker-1"].actions, ["edit", "run_allowlisted"]);

    const sendCall = calls.find((call) => call.command[0] === "cmux" && call.command[1] === "send");
    assert.ok(sendCall);
    const sentText = sendCall.command.at(-1);
    assert.match(sentText, /FREEFLOW_DELEGATION_STORE=/);
    assert.match(sentText, /pi --no-session --name 'worker-1' "\$\(cat /);
    assert.doesNotMatch(sentText, /FREEFLOW_TASK_PACKET/);
    assert.doesNotMatch(sentText, /\n/);
  });
});

test("delegate_spawn reuses an identical complete running assignment without opening a second pane", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension(cmuxLifecycleExec());
    const spawn = tools.get("delegate_spawn");
    const params = {
      taskId: "TASK-SPAWN-DUPLICATE",
      agentId: "worker-1",
      parentAgentId: "execution-parent-1",
      role: "worker",
      cwd: repoRoot,
      objective: "Implement one bounded direct assignment.",
      writeScope: [join(repoRoot, "src"), join(repoRoot, "tests")],
      allowedCommands: ["npm run build"],
    };

    const first = await spawn.execute("spawn-duplicate-first", params, undefined, undefined, ctx(repoRoot));
    const second = await spawn.execute("spawn-duplicate-second", params, undefined, undefined, ctx(repoRoot));

    assert.equal(first.details.result.status, "running");
    assert.equal(second.details.result.status, "already_running");
    assert.equal(second.details.result.reused, true);
    assert.equal(second.details.result.cmux.surfaceRef, "surface:3");
    assert.equal(calls.filter((call) => call.command[0] === "cmux" && call.command[1] === "new-pane").length, 1);
    assert.equal(calls.filter((call) => call.command[0] === "cmux" && call.command[1] === "send").length, 1);
    assert.equal(calls.filter((call) => call.command[0] === "cmux" && call.command[1] === "send-key").length, 1);

    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const registry = await store.readRegistry(params.taskId);
    assert.equal(registry.agents.length, 1);
    assert.equal(registry.agents[0].agentId, params.agentId);
    assert.deepEqual(
      (await store.readLeaseEvents(params.taskId)).map((event) => event.state),
      ["issued", "active"],
    );
    const active = await store.readActiveLeaseView(params.taskId);
    assert.deepEqual(active.activeLeaseIdsByAgent, { "worker-1": ["lease-direct-worker-1"] });
    assert.equal(Object.keys(active.leasesById).length, 1);
  });
});

test("delegate_spawn fails closed when a matching running assignment surface is lost", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools, calls } = loadExtension(cmuxLifecycleExec({ failAt: "read-screen" }));
    const spawn = tools.get("delegate_spawn");
    const params = {
      taskId: "TASK-SPAWN-LOST-SURFACE",
      agentId: "worker-1",
      parentAgentId: "execution-parent-1",
      role: "worker",
      cwd: repoRoot,
      objective: "Do not reuse a lost surface.",
      writeScope: join(repoRoot, "src"),
      allowedCommands: ["npm run build"],
    };
    await spawn.execute("spawn-lost-surface-seed", params, undefined, undefined, ctx(repoRoot));

    const result = await spawn.execute("spawn-lost-surface-duplicate", params, undefined, undefined, ctx(repoRoot));

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "direct_spawn_surface_invalid");
    assert.equal(calls.filter((call) => call.command[0] === "cmux" && call.command[1] === "new-pane").length, 1);
    assert.equal(calls.filter((call) => call.command[0] === "cmux" && call.command[1] === "send").length, 1);
    assert.equal(calls.filter((call) => call.command[0] === "cmux" && call.command[1] === "read-screen").length, 1);
  });
});

test("delegate_spawn fails closed before preflight when an existing assignment is mismatched, partial, or terminal", async () => {
  for (const entry of [
    {
      name: "mismatched",
      taskId: "TASK-SPAWN-MISMATCHED",
      expectedCode: "direct_spawn_assignment_mismatch",
      async arrange(store, repoRoot, spawn) {
        await spawn.execute(
          "spawn-mismatch-seed",
          {
            taskId: "TASK-SPAWN-MISMATCHED",
            agentId: "worker-1",
            parentAgentId: "execution-parent-1",
            role: "worker",
            cwd: repoRoot,
            objective: "Original objective.",
            writeScope: join(repoRoot, "src"),
            allowedCommands: ["npm run build"],
          },
          undefined,
          undefined,
          ctx(repoRoot),
        );
      },
      params(repoRoot) {
        return {
          taskId: "TASK-SPAWN-MISMATCHED",
          agentId: "worker-1",
          parentAgentId: "execution-parent-1",
          role: "worker",
          cwd: repoRoot,
          objective: "Different objective must not overwrite the running assignment.",
          writeScope: join(repoRoot, "src"),
          allowedCommands: ["npm run build"],
        };
      },
      expectedCallsBefore: 6,
    },
    {
      name: "terminal",
      taskId: "TASK-SPAWN-TERMINAL",
      expectedCode: "direct_spawn_terminal_assignment",
      async arrange(store, repoRoot, spawn) {
        await spawn.execute(
          "spawn-terminal-seed",
          {
            taskId: "TASK-SPAWN-TERMINAL",
            agentId: "worker-1",
            parentAgentId: "execution-parent-1",
            role: "worker",
            cwd: repoRoot,
            objective: "Completed objective must not be silently resurrected.",
            writeScope: join(repoRoot, "src"),
            allowedCommands: ["npm run build"],
          },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        await store.writeAgentStatus("TASK-SPAWN-TERMINAL", "worker-1", { state: "completed", message: "done" });
        await store.endActiveAssignmentLeases("TASK-SPAWN-TERMINAL", "worker-1", "exhausted", "terminal fixture");
      },
      params(repoRoot) {
        return {
          taskId: "TASK-SPAWN-TERMINAL",
          agentId: "worker-1",
          parentAgentId: "execution-parent-1",
          role: "worker",
          cwd: repoRoot,
          objective: "Completed objective must not be silently resurrected.",
          writeScope: join(repoRoot, "src"),
          allowedCommands: ["npm run build"],
        };
      },
      expectedCallsBefore: 6,
    },
    {
      name: "partial",
      taskId: "TASK-SPAWN-PARTIAL",
      expectedCode: "direct_spawn_assignment_incomplete",
      async arrange(store, repoRoot) {
        await store.registerAgent({
          taskId: "TASK-SPAWN-PARTIAL",
          agentId: "worker-1",
          role: "worker",
          profile: "worker",
          parentAgentId: "execution-parent-1",
          cwd: repoRoot,
          writeScope: join(repoRoot, "src"),
          allowedCommands: ["npm run build"],
          state: "starting",
        });
      },
      params(repoRoot) {
        return {
          taskId: "TASK-SPAWN-PARTIAL",
          agentId: "worker-1",
          parentAgentId: "execution-parent-1",
          role: "worker",
          cwd: repoRoot,
          objective: "Do not overwrite a partial assignment.",
          writeScope: join(repoRoot, "src"),
          allowedCommands: ["npm run build"],
        };
      },
      expectedCallsBefore: 0,
    },
  ]) {
    await withTempRepo(async (repoRoot) => {
      const { tools, calls } = loadExtension(cmuxLifecycleExec());
      const spawn = tools.get("delegate_spawn");
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      await entry.arrange(store, repoRoot, spawn);
      const callsBefore = calls.length;

      const result = await spawn.execute(
        `spawn-${entry.name}-duplicate`,
        entry.params(repoRoot),
        undefined,
        undefined,
        ctx(repoRoot),
      );

      assert.equal(callsBefore, entry.expectedCallsBefore, entry.name);
      assert.equal(result.details.result.toolStatus, "error", entry.name);
      assert.equal(result.details.result.code, entry.expectedCode, entry.name);
      assert.equal(calls.length, callsBefore, entry.name);
      assert.equal((await store.readRegistry(entry.taskId)).agents.length, 1, entry.name);
    });
  }
});

test("delegate_spawn revokes authority before best-effort failure persistence when running status write fails", async () => {
  await withTempRepo(async (repoRoot) => {
    const taskId = "TASK-SPAWN-POST-ACTIVATION-STORE-FAIL";
    const agentId = "worker-1";
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const statusPath = store.pathsForAgent(taskId, agentId).statusJson;
    let statusSabotaged = false;
    const { tools } = loadExtension(async (command) => {
      const text = command.join(" ");
      if (text.includes("command -v 'cmux'")) return ok("/usr/local/bin/cmux\n");
      if (text === "cmux --help") return ok(HELP);
      if (text === "cmux identify") return ok("workspace:1 surface:1\n");
      if (text.includes("command -v 'pi'")) return ok("/usr/local/bin/pi\n");
      if (text.startsWith("cmux new-pane")) return ok("workspace:1 pane:2 surface:3\n");
      if (text.startsWith("cmux send ")) return ok();
      if (text.startsWith("cmux send-key")) {
        await rm(statusPath, { force: true });
        await mkdir(statusPath);
        statusSabotaged = true;
        return ok();
      }
      throw new Error(`unexpected command: ${text}`);
    });

    const result = await tools.get("delegate_spawn").execute(
      "spawn-post-activation-store-fail",
      {
        taskId,
        agentId,
        role: "worker",
        cwd: repoRoot,
        objective: "Fail while persisting running state.",
        writeScope: join(repoRoot, "src"),
        allowedCommands: ["npm run build"],
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(statusSabotaged, true);
    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "direct_spawn_startup_failed");
    assert.match(result.details.result.reason, /directory|EISDIR|illegal operation/i);
    assert.deepEqual(
      (await store.readLeaseEvents(taskId)).map((event) => event.state),
      ["issued", "active", "revoked"],
    );
    assert.deepEqual((await store.readActiveLeaseView(taskId)).activeLeaseIdsByAgent, {});
    assert.ok(result.details.result.failurePersistenceErrors.some((message) => /status/i.test(message)));
  });
});

test("delegate_spawn revokes its active assignment lease on startup failure", async () => {
  await withTempRepo(async (repoRoot) => {
    const { tools } = loadExtension(cmuxLifecycleExec({ failAt: "send" }));
    const result = await tools.get("delegate_spawn").execute(
      "spawn-start-failure",
      {
        taskId: "TASK-SPAWN-LEASE-FAIL",
        agentId: "worker-1",
        role: "worker",
        cwd: repoRoot,
        objective: "Fail after lease activation.",
        writeScope: join(repoRoot, "src"),
        allowedCommands: ["npm run build"],
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.code, "child_pi_start_failed");
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    assert.deepEqual(
      (await store.readLeaseEvents("TASK-SPAWN-LEASE-FAIL")).map((event) => event.state),
      ["issued", "active", "revoked"],
    );
    assert.deepEqual((await store.readActiveLeaseView("TASK-SPAWN-LEASE-FAIL")).activeLeaseIdsByAgent, {});
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

      await spawn.execute(
        "spawn-parent-env",
        {
          taskId: "TASK-PARENT-ENV",
          agentId: "worker-1",
          role: "worker",
          cwd: repoRoot,
          objective: "Implement bounded fixture.",
          writeScope: join(repoRoot, "src"),
        },
        undefined,
        undefined,
        ctx(repoRoot),
      );

      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const manifest = await store.readAgentManifest("TASK-PARENT-ENV", "worker-1");
      assert.equal(manifest.parentAgentId, "execution-parent-1");
    });
  });
});

test("delegate_send uses file-backed delivery for multiline follow-ups", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-P3",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      surfaceRef: "surface:3",
    });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "send") return ok();
      if (command[0] === "cmux" && command[1] === "send-key") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const send = tools.get("delegate_send");

    const result = await send.execute(
      "send-follow-up",
      {
        taskId: "TASK-P3",
        agentId: "worker-1",
        kind: "fix",
        message: "Fix this exactly:\n- add test\n- rerun build",
      },
      undefined,
      undefined,
      ctx(repoRoot),
    );

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
    await store.registerAgent({
      taskId: "TASK-SEND-TERMINAL",
      agentId: "reviewer-1",
      role: "reviewer",
      profile: "reviewer",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "completed",
      surfaceRef: "surface:3",
    });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "send") return ok();
      if (command[0] === "cmux" && command[1] === "send-key") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const send = tools.get("delegate_send");

    const result = await send.execute(
      "send-terminal",
      { taskId: "TASK-SEND-TERMINAL", agentId: "reviewer-1", kind: "follow_up", message: "review again" },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.equal(result.details.result.toolStatus, "error");
    assert.equal(result.details.result.code, "target_terminal_requires_new_attempt");
    assert.equal(calls.length, 0);
  });
});

test("delegate_capture stores screen log without dumping raw screen in normal output", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-P3",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      surfaceRef: "surface:3",
    });
    const rawScreen = Array.from({ length: 20 }, (_, index) => `RAW_SCREEN_SENTINEL_${index}`).join("\n");
    const { tools } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "read-screen") return ok(rawScreen);
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const capture = tools.get("delegate_capture");

    const result = await capture.execute(
      "capture",
      { taskId: "TASK-P3", agentId: "worker-1", lines: 20 },
      undefined,
      undefined,
      ctx(repoRoot),
    );

    assert.match(result.content[0].text, /delegate_capture\|captured/);
    assert.doesNotMatch(result.content[0].text, /RAW_SCREEN_SENTINEL/);
    const screenLog = await readFile(store.pathsForAgent("TASK-P3", "worker-1").screenLog, "utf8");
    assert.match(screenLog, /RAW_SCREEN_SENTINEL_19/);
  });
});

test("delegate_wait requires timeout, returns timeout heartbeat, and enforces retry cap", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-P4",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      surfaceRef: "surface:3",
    });
    const { tools } = loadExtension(() => ok());
    const wait = tools.get("delegate_wait");

    const missingTimeout = await wait.execute(
      "wait-missing-timeout",
      { taskId: "TASK-P4", agentId: "worker-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(missingTimeout.details.result.toolStatus, "error");
    assert.match(missingTimeout.details.result.reason, /timeoutMs is required/);

    for (let index = 0; index < 3; index += 1) {
      const result = await wait.execute(
        `wait-${index}`,
        { taskId: "TASK-P4", agentId: "worker-1", timeoutMs: 1 },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(result.details.result.status, "timeout");
      assert.equal(result.details.result.heartbeat.state, "running");
    }
    const capped = await wait.execute(
      "wait-cap",
      { taskId: "TASK-P4", agentId: "worker-1", timeoutMs: 1 },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(capped.details.result.status, "alert_only");
    assert.equal(capped.details.result.code, "wait_retry_cap_exceeded");
  });
});

test("delegate_wait returns terminal and attention states without treating timeout as failure", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-P4",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "completed",
      surfaceRef: "surface:3",
    });
    await store.queueParentAlert("TASK-P4", {
      agentId: "worker-1",
      outcome: "completed",
      state: "completed",
      eventType: "agent-result",
      sourceEventId: "evt-complete",
      message: "done",
    });
    const { tools } = loadExtension(() => ok());
    const wait = tools.get("delegate_wait");

    const terminal = await wait.execute(
      "wait-complete",
      { taskId: "TASK-P4", agentId: "worker-1", timeoutMs: 100 },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(terminal.details.result.status, "completed");
    assert.equal(terminal.details.result.code, "terminal_alert");
    assert.equal(terminal.details.result.unreadParentAlerts[0].outcome, "completed");
    assert.match(terminal.content[0].text, /route\|read_delegate_result/);
    assert.match(terminal.content[0].text, /unread_alert\|P2\|completed\|state=queued\|agent=worker-1\|.*done/);
  });
});

test("task-scope delegate_wait returns terminal child alerts instead of timing out", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.initTask({ taskId: "TASK-P4", state: "created" });
    await store.registerAgent({
      taskId: "TASK-P4",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      surfaceRef: "surface:3",
    });
    await store.queueParentAlert("TASK-P4", {
      agentId: "worker-1",
      outcome: "completed",
      state: "completed",
      eventType: "agent-result",
      sourceEventId: "evt-complete",
      message: "worker complete",
    });
    const { tools } = loadExtension(() => ok());
    const wait = tools.get("delegate_wait");

    const result = await wait.execute(
      "wait-task-complete",
      { taskId: "TASK-P4", timeoutMs: 1 },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(result.details.result.status, "completed");
    assert.equal(result.details.result.code, "terminal_alert");
    assert.equal(result.details.result.heartbeat.state, "created");
    assert.equal(result.details.result.unreadParentAlerts[0].outcome, "completed");
  });
});

test("delegate_status defaults to current task and direct-parent unread alerts when delegated env is present", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-CURRENT",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "completed",
      parentAgentId: "execution-parent-1",
    });
    await store.registerAgent({
      taskId: "TASK-CURRENT",
      agentId: "worker-2",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "completed",
      parentAgentId: "other-parent",
    });
    await store.registerAgent({
      taskId: "TASK-OLD",
      agentId: "worker-old",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "completed",
      parentAgentId: "execution-parent-1",
    });
    await store.queueParentAlert("TASK-CURRENT", {
      agentId: "worker-1",
      outcome: "completed",
      state: "completed",
      parentAgentId: "execution-parent-1",
      eventType: "agent-result",
      sourceEventId: "evt-current",
      message: "current",
    });
    await store.queueParentAlert("TASK-CURRENT", {
      agentId: "worker-2",
      outcome: "completed",
      state: "completed",
      parentAgentId: "other-parent",
      eventType: "agent-result",
      sourceEventId: "evt-other-parent",
      message: "other parent",
    });
    await store.queueParentAlert("TASK-OLD", {
      agentId: "worker-old",
      outcome: "completed",
      state: "completed",
      parentAgentId: "execution-parent-1",
      eventType: "agent-result",
      sourceEventId: "evt-old",
      message: "old",
    });
    const { tools } = loadExtension(() => ok());
    const status = tools.get("delegate_status");

    await withProcessEnv(
      { FREEFLOW_DELEGATION_TASK_ID: "TASK-CURRENT", FREEFLOW_DELEGATION_AGENT_ID: "execution-parent-1" },
      async () => {
        const result = await status.execute("status-current", {}, undefined, undefined, ctx(repoRoot));
        assert.equal(result.details.result.taskId, "TASK-CURRENT");
        assert.deepEqual(
          result.details.result.unreadParentAlerts.map((alert) => alert.message),
          ["current"],
        );
        assert.match(result.content[0].text, /agents\|total=2\|completed=2/);
        assert.match(result.content[0].text, /unread_alert\|P2\|completed\|state=queued\|agent=worker-1\|.*current/);
      },
    );
  });
});

test("delegate_inbox and delegate_ack_all default to current parent scope", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-INBOX",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "completed",
      parentAgentId: "execution-parent-1",
    });
    await store.registerAgent({
      taskId: "TASK-INBOX",
      agentId: "worker-2",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "completed",
      parentAgentId: "other-parent",
    });
    await store.queueParentAlert("TASK-INBOX", {
      agentId: "worker-1",
      outcome: "completed",
      state: "completed",
      parentAgentId: "execution-parent-1",
      eventType: "agent-result",
      sourceEventId: "evt-current",
      message: "current parent",
    });
    await store.queueParentAlert("TASK-INBOX", {
      agentId: "worker-2",
      outcome: "completed",
      state: "completed",
      parentAgentId: "other-parent",
      eventType: "agent-result",
      sourceEventId: "evt-other",
      message: "other parent",
    });
    const { tools } = loadExtension(() => ok());
    const inbox = tools.get("delegate_inbox");
    const ackAll = tools.get("delegate_ack_all");

    await withProcessEnv(
      { FREEFLOW_DELEGATION_TASK_ID: "TASK-INBOX", FREEFLOW_DELEGATION_AGENT_ID: "execution-parent-1" },
      async () => {
        const scopedInbox = await inbox.execute(
          "inbox-current-parent",
          { taskId: "TASK-INBOX" },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        assert.equal(scopedInbox.details.result.scope, "parent:execution-parent-1");
        assert.deepEqual(
          scopedInbox.details.result.alerts.map((alert) => alert.message),
          ["current parent"],
        );

        const blockedCrossParent = await inbox.execute(
          "inbox-cross-parent",
          { taskId: "TASK-INBOX", parentAgentId: "other-parent" },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        assert.equal(blockedCrossParent.details.result.code, "global_alert_scope_required");

        const acked = await ackAll.execute(
          "ack-current-parent",
          { taskId: "TASK-INBOX" },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        assert.equal(acked.details.result.count, 1);
        assert.deepEqual(
          acked.details.result.alerts.map((alert) => alert.message),
          ["current parent"],
        );
        assert.deepEqual(
          (await store.readParentAlerts("TASK-INBOX", { unreadOnly: true })).map((alert) => alert.message),
          ["other parent"],
        );

        const globalInbox = await inbox.execute(
          "inbox-global",
          { taskId: "TASK-INBOX", global: true },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        assert.deepEqual(
          globalInbox.details.result.alerts.map((alert) => alert.message),
          ["other parent"],
        );
      },
    );
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
      commitCheckpoints: [
        {
          checkpointId: "P5A-checkpoint",
          packageId: "P5A",
          planned: true,
          status: "planned",
          intendedFiles: ["delegation/src/types.ts"],
        },
      ],
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
    await store.registerAgent({
      taskId: "TASK-P4",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      surfaceRef: "surface:3",
    });
    const { tools } = loadExtension(() => ok());
    const resultTool = tools.get("delegate_result");

    const pending = await resultTool.execute(
      "result-pending",
      { taskId: "TASK-P4", agentId: "worker-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
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

    const parsed = await resultTool.execute(
      "result-parsed",
      { taskId: "TASK-P4", agentId: "worker-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(parsed.details.result.status, "ok");
    assert.equal(parsed.details.result.result.status, "completed_with_risks");
    assert.equal(parsed.details.result.result.results[0].summary, "Implemented P4 with one residual risk.");
    assert.deepEqual(parsed.details.result.result.results[0].evidence[0].fields, [
      "ffout_build",
      "routed output evidence",
    ]);
    assert.equal(parsed.details.result.result.rawText, undefined);
    assert.match(parsed.content[0].text, /summary\|Implemented P4 with one residual risk\./);
    assert.match(parsed.content[0].text, /check\|npm run build\|pass\|outputId=ffout_build/);
    assert.match(parsed.content[0].text, /evidence\|ffout_build\|routed output evidence/);
    assert.doesNotMatch(parsed.content[0].text, /FFRESULT/);
  });
});

test("delegate_finish stores direct results, queues inbox alerts, and ack tools clear them", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const finishManifest = await store.registerAgent({
        taskId: "TASK-FINISH",
        agentId: "worker-1",
        role: "worker",
        cwd: repoRoot,
        writeScope: repoRoot,
        state: "running",
        surfaceRef: "surface:3",
        parentAgentId: "execution-parent-1",
      });
      await writeCurrentTaskPacket(store, finishManifest);
      await store.ensureLeaseActive("TASK-FINISH", {
        leaseId: "lease-finish-worker",
        taskId: "TASK-FINISH",
        agentId: "worker-1",
        role: "worker",
        state: "issued",
        actions: ["edit"],
        writeScopes: [repoRoot],
        allowedCommands: [],
        expires: "on_assignment_terminal",
      });
      const { tools } = loadExtension(() => ok());
      const finish = tools.get("delegate_finish");
      const inbox = tools.get("delegate_inbox");
      const ackAlert = tools.get("delegate_ack_alert");
      const resultTool = tools.get("delegate_result");

      const finished = await withProcessEnv(delegatedEnv(store, finishManifest), () =>
        finish.execute(
          "finish-worker",
          {
            taskId: "TASK-FINISH",
            agentId: "worker-1",
            status: "completed",
            summary: "Implemented focused worker slice.",
            filesChanged: ["delegation/src/store.ts"],
            checks: [{ name: "npm run build", status: "pass", outputId: "ffout_build" }],
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );

      assert.equal(finished.details.result.status, "stored");
      assert.equal(finished.details.result.commitState, "committed");
      assert.match(finished.details.result.terminalOutcomeId, /^terminal-/);
      assert.match(finished.details.result.paths.acceptedJson, /terminal\.accepted\.json$/);
      assert.equal(finished.details.result.alert.priority, "P2");
      assert.equal(finished.details.result.alert.alertState, "queued");
      assert.equal(finished.details.result.wakeDisposition.status, "queued");
      assert.match(
        finished.content[0].text,
        /alert\|P2\|completed\|state=queued\|agent=worker-1\|.*Implemented focused worker slice\./,
      );
      assert.equal((await store.readAgentStatus("TASK-FINISH", "worker-1")).state, "completed");
      assert.deepEqual(finished.details.result.endedLeaseIds, ["lease-finish-worker"]);
      assert.deepEqual((await store.readActiveLeaseView("TASK-FINISH")).activeLeaseIdsByAgent, {});
      assert.equal((await store.readLeaseEvents("TASK-FINISH")).at(-1).state, "exhausted");
      const stored = JSON.parse(await readFile(store.pathsForAgent("TASK-FINISH", "worker-1").resultJson, "utf8"));
      assert.equal(stored.transport, "delegate_finish");
      assert.equal(stored.terminalOutcomeId, finished.details.result.terminalOutcomeId);
      assert.equal(stored.direct.filesChanged[0], "delegation/src/store.ts");
      assert.equal(
        JSON.parse(await readFile(finished.details.result.paths.acceptedJson, "utf8")).outcomeId,
        finished.details.result.terminalOutcomeId,
      );

      const retry = await withProcessEnv(delegatedEnv(store, finishManifest), () =>
        finish.execute(
          "finish-worker-retry",
          {
            taskId: "TASK-FINISH",
            agentId: "worker-1",
            status: "completed",
            summary: "Implemented focused worker slice.",
            filesChanged: ["delegation/src/store.ts"],
            checks: [{ name: "npm run build", status: "pass", outputId: "ffout_build" }],
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );
      assert.equal(retry.details.result.terminalOutcomeId, finished.details.result.terminalOutcomeId);
      assert.equal(retry.details.result.commitState, "committed_reconciled");
      assert.equal(
        (await store.readParentAlerts("TASK-FINISH")).filter((alert) => alert.eventType === "agent-result").length,
        1,
      );

      const parsed = await resultTool.execute(
        "result-finish",
        { taskId: "TASK-FINISH", agentId: "worker-1" },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(parsed.details.result.status, "ok");
      assert.equal(parsed.details.result.result.direct.summary, "Implemented focused worker slice.");
      assert.match(parsed.content[0].text, /summary\|Implemented focused worker slice\./);
      assert.match(parsed.content[0].text, /file_changed\|delegation\/src\/store\.ts/);
      assert.match(parsed.content[0].text, /check\|npm run build\|pass\|outputId=ffout_build/);

      const unread = await inbox.execute("inbox", { taskId: "TASK-FINISH" }, undefined, undefined, ctx(repoRoot));
      assert.equal(unread.details.result.count, 1);
      const acked = await ackAlert.execute(
        "ack",
        { taskId: "TASK-FINISH", alertId: unread.details.result.alerts[0].alertId },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(acked.details.result.status, "acked");
      assert.equal(acked.details.result.alerts[0].alertState, "acked");
      assert.equal((await store.readParentAlerts("TASK-FINISH", { unreadOnly: true })).length, 0);
    }),
  );
});

test("root callers cannot impersonate child lifecycle identity through delegate_finish parameters", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const manifest = await store.registerAgent({
        taskId: "TASK-FINISH-ROOT-IMPERSONATION",
        agentId: "worker-1",
        role: "worker",
        profile: "worker",
        state: "running",
        cwd: repoRoot,
        writeScope: repoRoot,
        surfaceRef: "surface:worker",
      });
      await writeCurrentTaskPacket(store, manifest);
      const { tools } = loadExtension(() => {
        throw new Error("delegate_finish must not call cmux");
      });

      const result = await tools.get("delegate_finish").execute(
        "finish-root-impersonation",
        {
          taskId: manifest.taskId,
          agentId: manifest.agentId,
          status: "completed",
          summary: "Root must not submit this child result.",
        },
        undefined,
        undefined,
        ctx(repoRoot),
      );

      assert.equal(result.details.result.toolStatus, "error");
      assert.equal(result.details.result.code, "delegated_lifecycle_identity_required");
      const attention = await tools.get("delegate_attention").execute(
        "attention-root-impersonation",
        {
          taskId: manifest.taskId,
          agentId: manifest.agentId,
          message: "Root must not send child attention.",
        },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      const progress = await tools.get("delegate_progress").execute(
        "progress-root-impersonation",
        {
          taskId: manifest.taskId,
          agentId: manifest.agentId,
          message: "Root must not send child progress.",
        },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(attention.details.result.code, "delegated_lifecycle_identity_required");
      assert.equal(progress.details.result.code, "delegated_lifecycle_identity_required");
      assert.equal((await store.readAgentStatus(manifest.taskId, manifest.agentId)).state, "running");
      await assert.rejects(
        readFile(store.pathsForAgent(manifest.taskId, manifest.agentId).resultJson, "utf8"),
        /ENOENT/,
      );
    }),
  );
});

test("delegate_finish rejects a superseded environment attempt before result mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-FINISH-ATTEMPT",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      state: "running",
      surfaceRef: "surface:3",
      launchCommand: "pi worker-1",
      attemptId: "attempt-current",
      attemptSource: "routed",
    });
    const { tools } = loadExtension(() => {
      throw new Error("delegate_finish must not call cmux");
    });

    await withProcessEnv(
      {
        ...DELEGATION_ENV_CLEAR,
        FREEFLOW_DELEGATION_STORE: store.root,
        FREEFLOW_DELEGATION_TASK_ID: "TASK-FINISH-ATTEMPT",
        FREEFLOW_DELEGATION_AGENT_ID: "worker-1",
        FREEFLOW_DELEGATION_ATTEMPT_ID: "attempt-superseded",
        FREEFLOW_PARENT_AGENT_ID: "execution-parent-1",
        FREEFLOW_AGENT_ROLE: "worker",
        FREEFLOW_CONTEXT_PROFILE: "worker",
      },
      async () => {
        const result = await tools.get("delegate_finish").execute(
          "finish-old-attempt",
          {
            status: "completed",
            summary: "This belongs to the old attempt.",
          },
          undefined,
          undefined,
          ctx(repoRoot),
        );

        assert.equal(result.details.result.toolStatus, "error");
        assert.equal(result.details.result.code, "lifecycle_attempt_mismatch");
        await assert.rejects(
          readFile(store.pathsForAgent("TASK-FINISH-ATTEMPT", "worker-1").resultJson, "utf8"),
          /ENOENT/,
        );
        assert.equal((await store.readAgentStatus("TASK-FINISH-ATTEMPT", "worker-1")).state, "running");
      },
    );
  });
});

test("delegate_finish rejects stored packet identity mismatch before result mutation", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const manifest = await store.registerAgent({
      taskId: "TASK-FINISH-PACKET",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: join(repoRoot, "src"),
      state: "running",
      surfaceRef: "surface:3",
      launchCommand: "pi worker-1",
      attemptId: "attempt-current",
      attemptSource: "routed",
    });
    const packetPath = await writeCurrentTaskPacket(store, manifest);
    const packet = await readFile(packetPath, "utf8");
    await writeFile(packetPath, packet.replace("- attempt: attempt-current", "- attempt: attempt-old"), "utf8");
    const { tools } = loadExtension(() => {
      throw new Error("delegate_finish must not call cmux");
    });

    await withProcessEnv(delegatedEnv(store, manifest), async () => {
      const result = await tools.get("delegate_finish").execute(
        "finish-packet-mismatch",
        {
          taskId: "TASK-FINISH-PACKET",
          agentId: "worker-1",
          status: "completed",
          summary: "Packet does not belong to this attempt.",
        },
        undefined,
        undefined,
        ctx(repoRoot),
      );

      assert.equal(result.details.result.toolStatus, "error");
      assert.equal(result.details.result.code, "lifecycle_packet_identity_mismatch");
      await assert.rejects(
        readFile(store.pathsForAgent("TASK-FINISH-PACKET", "worker-1").resultJson, "utf8"),
        /ENOENT/,
      );
      assert.equal((await store.readAgentStatus("TASK-FINISH-PACKET", "worker-1")).state, "running");
    });
  });
});

test("known unversioned running assignment can finish only under a synthetic attempt", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const manifest = await store.registerAgent({
      taskId: "TASK-FINISH-LEGACY",
      agentId: "worker-legacy",
      role: "worker",
      cwd: repoRoot,
      state: "running",
      surfaceRef: "surface:legacy",
      launchCommand: "pi worker-legacy",
    });
    const {
      schemaVersion,
      identitySchemaVersion,
      profileSchemaVersion,
      protocolVersion,
      assignmentId,
      attemptId,
      attemptSource,
      ...legacyManifest
    } = manifest;
    await writeFile(
      store.pathsForAgent("TASK-FINISH-LEGACY", "worker-legacy").manifestJson,
      `${JSON.stringify(legacyManifest, null, 2)}\n`,
      "utf8",
    );
    const { tools } = loadExtension(() => {
      throw new Error("delegate_finish must not call cmux");
    });

    await withProcessEnv(
      {
        ...DELEGATION_ENV_CLEAR,
        FREEFLOW_DELEGATION_STORE: store.root,
        FREEFLOW_DELEGATION_TASK_ID: "TASK-FINISH-LEGACY",
        FREEFLOW_DELEGATION_AGENT_ID: "worker-legacy",
        FREEFLOW_PARENT_AGENT_ID: "execution-parent-1",
        FREEFLOW_AGENT_ROLE: "worker",
        FREEFLOW_CONTEXT_PROFILE: "worker",
      },
      async () => {
        const withoutLease = await tools.get("delegate_finish").execute(
          "finish-legacy-without-lease",
          {
            status: "completed",
            summary: "Must not finish without preserved authority.",
          },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        assert.equal(withoutLease.details.result.toolStatus, "error");
        assert.equal(withoutLease.details.result.code, "legacy_finish_lease_missing");
        await assert.rejects(
          readFile(store.pathsForAgent("TASK-FINISH-LEGACY", "worker-legacy").resultJson, "utf8"),
          /ENOENT/,
        );

        await store.ensureLeaseActive(
          "TASK-FINISH-LEGACY",
          {
            leaseId: "lease-legacy-worker",
            taskId: "TASK-FINISH-LEGACY",
            agentId: "worker-legacy",
            role: "worker",
            state: "issued",
            actions: ["edit"],
            writeScopes: [repoRoot],
            allowedCommands: [],
            expires: "on_assignment_terminal",
            assignmentId: "worker-legacy",
          },
          "preserved legacy assignment authority",
        );

        const result = await tools.get("delegate_finish").execute(
          "finish-legacy",
          {
            status: "completed",
            summary: "Finished existing legacy work.",
          },
          undefined,
          undefined,
          ctx(repoRoot),
        );

        assert.equal(result.details.result.status, "stored");
        assert.equal(result.details.result.attemptKind, "legacy_synthetic");
        assert.match(result.details.result.attemptId, /^legacy-attempt-[a-f0-9]{20}$/);
        const stored = JSON.parse(
          await readFile(store.pathsForAgent("TASK-FINISH-LEGACY", "worker-legacy").resultJson, "utf8"),
        );
        assert.equal(stored.direct.attemptId, result.details.result.attemptId);
        assert.equal(stored.direct.assignmentId, "worker-legacy");
        assert.equal(stored.direct.identitySchemaVersion, 1);
        assert.equal(stored.direct.protocolVersion, 1);
      },
    );
  });
});

test("planning-parent delegate_finish routes rejected and corrected reports through semantic publication", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const taskId = "TASK-PLANNING-FINISH-PUBLICATION";
      const manifest = await store.registerAgent({
        taskId,
        agentId: "planning-parent-1",
        role: "planning-parent",
        profile: "planning-parent",
        cwd: repoRoot,
        writeScope: join(repoRoot, "docs"),
        state: "running",
        surfaceRef: "surface:plan",
        parentAgentId: "orchestrator",
      });
      await writeCurrentTaskPacket(store, manifest);
      const acceptedSeed = await store.publishPlanningReport(taskId, {
        rawText: [
          "PLANNING_REPORT",
          "STATUS|ready",
          "GOAL|Seed accepted plan.",
          "PLAN_ARTIFACT_PATH|docs/plans/seed.md",
          "ARTIFACT_PATHS|docs/plans/seed.md",
          "REVIEW_STATUS|passed",
          "SETTLED_DECISIONS|seed",
          "OPEN_QUESTIONS|none",
          "EXECUTION_AUTONOMY|bounded",
          "USER_CHECKPOINTS|authorization",
          "EXECUTION_GUIDANCE|follow seed",
          "RISKS|none",
          "EVIDENCE|tests",
          "END_PLANNING_REPORT",
        ].join("\n"),
        source: { transport: "delegate_record_report" },
      });
      const acceptedBefore = await store.readTaskReport(taskId, "planning-report");
      const { tools } = loadExtension(() => ok());
      const finish = tools.get("delegate_finish");

      const rejected = await withProcessEnv(delegatedEnv(store, manifest), () =>
        finish.execute(
          "finish-planning-ambiguous",
          {
            taskId,
            agentId: "planning-parent-1",
            status: "completed",
            reportStatus: "ready",
            summary: "Ambiguous planning identity.",
            goal: "choose a plan",
            artifactPaths: ["docs/plans/first.md", "docs/plans/second.md"],
            reviewStatus: "passed",
            settledDecisions: "none",
            openQuestions: "none",
            executionAutonomy: "bounded",
            userCheckpoints: "authorization",
            executionGuidance: "follow selected plan",
            risks: "identity ambiguity",
            evidence: [{ label: "tests", path: "delegation/tests" }],
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );

      assert.equal(rejected.details.result.code, "report_schema_invalid");
      const acceptedAfterRejected = await store.readTaskReport(taskId, "planning-report");
      assert.equal(acceptedAfterRejected.rawPath, acceptedBefore.rawPath);
      assert.equal(acceptedAfterRejected.jsonPath, acceptedBefore.jsonPath);
      const rejectedEvents = (await readFile(store.pathsForTask(taskId).eventsJsonl, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((event) => event.type === "planning_report.rejected");
      assert.equal(rejectedEvents.length, 1);
      assert.match(rejectedEvents[0].data.rawPath, /planning-report-publications\/rejected/);

      const corrected = await withProcessEnv(delegatedEnv(store, manifest), () =>
        finish.execute(
          "finish-planning-corrected",
          {
            taskId,
            agentId: "planning-parent-1",
            status: "completed",
            reportStatus: "ready",
            summary: "Corrected planning identity.",
            goal: "choose a plan",
            planArtifactPath: "docs/plans/corrected.md",
            artifactPaths: ["docs/plans/corrected.md"],
            reviewStatus: "passed",
            settledDecisions: "corrected",
            openQuestions: "none",
            executionAutonomy: "bounded",
            userCheckpoints: "authorization",
            executionGuidance: "follow corrected plan",
            risks: "none",
            evidence: [{ label: "tests", path: "delegation/tests" }],
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );
      assert.equal(corrected.details.result.status, "stored");
      assert.notEqual(corrected.details.result.planningReadyEventId, acceptedSeed.planningReadyEventId);
      assert.equal((await store.readExecutionApprovalRequest(taskId)).planArtifactPath, "docs/plans/corrected.md");
    }),
  );
});

test("planning-parent delegate_finish blocked publication invalidates earlier authorization", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const taskId = "TASK-PLANNING-FINISH-BLOCKED";
      const manifest = await store.registerAgent({
        taskId,
        agentId: "planning-parent-1",
        role: "planning-parent",
        profile: "planning-parent",
        cwd: repoRoot,
        writeScope: join(repoRoot, "docs"),
        state: "running",
        surfaceRef: "surface:plan",
        parentAgentId: "orchestrator",
      });
      await writeCurrentTaskPacket(store, manifest);
      const seed = await store.publishPlanningReport(taskId, {
        rawText: [
          "PLANNING_REPORT",
          "STATUS|ready",
          "GOAL|Seed authorized plan.",
          "PLAN_ARTIFACT_PATH|docs/plans/seed.md",
          "ARTIFACT_PATHS|docs/plans/seed.md",
          "REVIEW_STATUS|passed",
          "SETTLED_DECISIONS|seed",
          "OPEN_QUESTIONS|none",
          "EXECUTION_AUTONOMY|bounded",
          "USER_CHECKPOINTS|authorization",
          "EXECUTION_GUIDANCE|follow seed",
          "RISKS|none",
          "EVIDENCE|tests",
          "END_PLANNING_REPORT",
        ].join("\n"),
        source: { transport: "delegate_record_report" },
      });
      await store.approveAndAuthorizeExecution(taskId, await store.readExecutionApprovalRequest(taskId));
      assert.equal(
        (await store.readExecutionAuthorization(taskId)).planningReportReadyEventId,
        seed.planningReadyEventId,
      );
      const { tools } = loadExtension(() => ok());

      const blocked = await withProcessEnv(delegatedEnv(store, manifest), () =>
        tools.get("delegate_finish").execute(
          "finish-planning-blocked",
          {
            taskId,
            agentId: "planning-parent-1",
            status: "blocked",
            reportStatus: "blocked",
            summary: "Planning is blocked.",
            goal: "resolve planning blocker",
            artifactPaths: ["docs/notes/planning-blocker.md"],
            reviewStatus: "blocked",
            settledDecisions: "none",
            openQuestions: "owner input required",
            executionAutonomy: "none",
            userCheckpoints: "resolve blocker",
            executionGuidance: "do not execute",
            risks: "stale execution",
            evidence: [{ label: "blocker", path: "docs/notes/planning-blocker.md" }],
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );

      assert.equal(blocked.details.result.status, "stored");
      assert.equal(blocked.details.result.reportStatus, "blocked");
      assert.equal(blocked.details.result.planningReadyEventId, undefined);
      assert.equal((await store.readTaskReport(taskId, "planning-report")).parsed.status, "blocked");
      assert.equal(await store.readExecutionAuthorization(taskId), undefined);
      await assert.rejects(() => store.readExecutionApprovalRequest(taskId), /current planning publication is blocked/);
    }),
  );
});

test("delegate_finish stores parent reports with canonical task report records", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const planningManifest = await store.registerAgent({
        taskId: "TASK-PARENT-FINISH",
        agentId: "planning-parent-1",
        role: "planning-parent",
        profile: "planning-parent",
        cwd: repoRoot,
        writeScope: join(repoRoot, "docs"),
        state: "running",
        surfaceRef: "surface:plan",
        parentAgentId: "orchestrator",
      });
      const executionManifest = await store.registerAgent({
        taskId: "TASK-PARENT-FINISH",
        agentId: "execution-parent-1",
        role: "execution-parent",
        profile: "execution-parent",
        cwd: repoRoot,
        writeScope: repoRoot,
        state: "running",
        surfaceRef: "surface:exec",
        parentAgentId: "orchestrator",
      });
      await writeCurrentTaskPacket(store, planningManifest);
      await writeCurrentTaskPacket(store, executionManifest);
      const { tools } = loadExtension(() => ok());
      const finish = tools.get("delegate_finish");
      const resultTool = tools.get("delegate_result");

      const planning = await withProcessEnv(delegatedEnv(store, planningManifest), () =>
        finish.execute(
          "finish-planning",
          {
            taskId: "TASK-PARENT-FINISH",
            agentId: "planning-parent-1",
            status: "completed",
            reportStatus: "ready",
            summary: "Planning ready.",
            goal: "implement delegation fixes",
            planArtifactPath: "docs/plans/fix.md",
            artifactPaths: ["docs/specs/fix.md", "docs/plans/fix.md"],
            reviewStatus: "passed",
            settledDecisions: "use delegate_finish for parent reports",
            openQuestions: "none",
            executionAutonomy: "bounded",
            userCheckpoints: "before push",
            executionGuidance: "run P1-P10",
            risks: "post-reload smoke pending",
            evidence: [{ label: "plan", path: "docs/plans/fix.md" }],
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );
      assert.equal(planning.details.result.status, "stored");
      assert.equal(planning.details.result.reportName, "planning-report");
      assert.equal((await store.readTaskReport("TASK-PARENT-FINISH", "planning-report")).exists, true);
      assert.equal(
        (await store.readExecutionApprovalRequest("TASK-PARENT-FINISH")).planArtifactPath,
        "docs/plans/fix.md",
      );
      const planningResult = await resultTool.execute(
        "result-planning",
        { taskId: "TASK-PARENT-FINISH", agentId: "planning-parent-1" },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(planningResult.details.result.status, "ok");
      assert.equal(planningResult.details.result.result.reports.planning[0].status, "ready");

      const execution = await withProcessEnv(delegatedEnv(store, executionManifest), () =>
        finish.execute(
          "finish-execution",
          {
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
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );
      assert.equal(execution.details.result.status, "stored");
      assert.equal(execution.details.result.reportName, "execution-report");
      const executionReport = await store.readTaskReport("TASK-PARENT-FINISH", "execution-report");
      assert.equal(executionReport.exists, true);
      assert.equal(executionReport.parsed.status, "completed_with_risks");
    }),
  );
});

test("delegate_finish enforces verifier top-level status and accepts check pass rows", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const verifierManifest = await store.registerAgent({
        taskId: "TASK-VERIFY",
        agentId: "verifier-1",
        role: "verifier",
        profile: "verifier",
        cwd: repoRoot,
        state: "running",
        surfaceRef: "surface:3",
      });
      await writeCurrentTaskPacket(store, verifierManifest);
      const { tools } = loadExtension(() => ok());
      const finish = tools.get("delegate_finish");

      const invalid = await withProcessEnv(delegatedEnv(store, verifierManifest), () =>
        finish.execute(
          "finish-invalid",
          { taskId: "TASK-VERIFY", agentId: "verifier-1", status: "PASS", summary: "all checks pass" },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );
      assert.equal(invalid.details.result.toolStatus, "error");
      assert.equal(invalid.details.result.code, "result_schema_invalid");
      assert.match(invalid.details.result.hint, /check statuses/);

      const valid = await withProcessEnv(delegatedEnv(store, verifierManifest), () =>
        finish.execute(
          "finish-valid",
          {
            taskId: "TASK-VERIFY",
            agentId: "verifier-1",
            status: "completed",
            summary: "Verification passed.",
            checks: [{ name: "npm run test:delegation", status: "pass", outputId: "ffout_tests" }],
            completionClaimSupported: true,
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );
      assert.equal(valid.details.result.status, "stored");
      const stored = JSON.parse(await readFile(store.pathsForAgent("TASK-VERIFY", "verifier-1").resultJson, "utf8"));
      assert.equal(stored.direct.checks[0].status, "pass");
    }),
  );
});

test("delegate_attention keeps every child-selectable level at P1 with queued next-turn wake only", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const { tools, calls, userMessages } = loadExtension(() => {
        throw new Error("delegate_attention must not call cmux");
      });
      const attention = tools.get("delegate_attention");
      const levels = ["attention", "needs_parent", "capability_gap", "blocked", "failed"];
      for (const level of levels) {
        const agentId = `worker-${level.replace("_", "-")}`;
        const attentionManifest = await store.registerAgent({
          taskId: "TASK-ATTENTION-MATRIX",
          agentId,
          role: "worker",
          cwd: repoRoot,
          writeScope: repoRoot,
          state: "running",
          parentAgentId: "orchestrator",
        });
        await writeCurrentTaskPacket(store, attentionManifest);
        const result = await withProcessEnv(delegatedEnv(store, attentionManifest), () =>
          attention.execute(
            `attention-${level}`,
            {
              taskId: "TASK-ATTENTION-MATRIX",
              agentId,
              level,
              message: `${level} needs parent`,
            },
            undefined,
            undefined,
            ctx(repoRoot),
          ),
        );
        assert.equal(result.details.result.alert.priority, "P1", level);
        assert.equal(result.details.result.alert.alertState, "queued", level);
        assert.equal(result.details.result.wakeDisposition.status, "queued", level);
      }
      assert.equal(calls.length, 0);
      assert.equal(userMessages.length, 0);
      assert.deepEqual(
        (await store.readParentAlerts("TASK-ATTENTION-MATRIX", { unreadOnly: true })).map((alert) => alert.priority),
        ["P1", "P1", "P1", "P1", "P1"],
      );
    }),
  );
});

test("delegate_finish derives worker reviewer verifier priority from structured result evidence", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const { tools, calls, userMessages } = loadExtension(() => {
        throw new Error("delegate_finish must not call cmux");
      });
      const finish = tools.get("delegate_finish");
      const cases = [
        { id: "worker-clean", role: "worker", status: "completed", expected: "P2" },
        { id: "worker-risk", role: "worker", status: "completed_with_risks", expected: "P2" },
        { id: "worker-blocked", role: "worker", status: "blocked", expected: "P1" },
        { id: "worker-failed", role: "worker", status: "failed", expected: "P1" },
        { id: "review-clean", role: "reviewer", status: "completed", findings: [], expected: "P2" },
        {
          id: "review-nonblocking",
          role: "reviewer",
          status: "completed",
          findings: [{ severity: "non_blocking", problem: "minor" }],
          expected: "P2",
        },
        {
          id: "review-blocking",
          role: "reviewer",
          status: "completed",
          findings: [{ severity: "blocking", problem: "must fix" }],
          expected: "P1",
        },
        {
          id: "verify-pass",
          role: "verifier",
          status: "completed",
          checks: [{ name: "tests", status: "pass" }],
          completionClaimSupported: true,
          expected: "P2",
        },
        {
          id: "verify-fail",
          role: "verifier",
          status: "completed",
          checks: [{ name: "tests", status: "fail" }],
          completionClaimSupported: true,
          expected: "P1",
        },
        {
          id: "verify-not-run",
          role: "verifier",
          status: "completed_with_risks",
          checks: [{ name: "tests", status: "not_run" }],
          completionClaimSupported: true,
          expected: "P2",
        },
        {
          id: "verify-unsupported",
          role: "verifier",
          status: "completed",
          checks: [{ name: "tests", status: "pass" }],
          completionClaimSupported: false,
          expected: "P1",
        },
      ];
      for (const item of cases) {
        const matrixManifest = await store.registerAgent({
          taskId: "TASK-FINISH-MATRIX",
          agentId: item.id,
          role: item.role,
          profile: item.role,
          cwd: repoRoot,
          ...(item.role === "worker" ? { writeScope: repoRoot } : {}),
          state: "running",
          parentAgentId: "orchestrator",
        });
        await writeCurrentTaskPacket(store, matrixManifest);
        const result = await withProcessEnv(delegatedEnv(store, matrixManifest), () =>
          finish.execute(
            `finish-${item.id}`,
            {
              taskId: "TASK-FINISH-MATRIX",
              agentId: item.id,
              status: item.status,
              summary: `${item.id} summary`,
              ...(item.findings === undefined ? {} : { findings: item.findings }),
              ...(item.checks === undefined ? {} : { checks: item.checks }),
              ...(item.completionClaimSupported === undefined
                ? {}
                : { completionClaimSupported: item.completionClaimSupported }),
            },
            undefined,
            undefined,
            ctx(repoRoot),
          ),
        );
        assert.equal(result.details.result.alert.priority, item.expected, item.id);
        assert.equal(result.details.result.wakeDisposition.status, "queued", item.id);
        const storedAlert = (
          await store.readParentAlerts("TASK-FINISH-MATRIX", { unreadOnly: true, agentId: item.id })
        )[0];
        assert.equal(storedAlert.data.role, item.role, item.id);
        assert.equal(storedAlert.data.completionClaimSupported, item.completionClaimSupported, item.id);
      }
      assert.equal(calls.length, 0);
      assert.equal(userMessages.length, 0);
    }),
  );
});

test("explicitly closed parent escalates one deduped P0 to stored ancestor or orchestrator root without direct wake", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      await store.registerAgent({
        taskId: "TASK-ESCALATE",
        agentId: "grandparent-1",
        role: "execution-parent",
        profile: "execution-parent",
        cwd: repoRoot,
        state: "running",
        parentAgentId: "orchestrator",
      });
      await store.registerAgent({
        taskId: "TASK-ESCALATE",
        agentId: "parent-1",
        role: "execution-parent",
        profile: "execution-parent",
        cwd: repoRoot,
        state: "closed",
        parentAgentId: "grandparent-1",
      });
      const escalatedWorkerManifest = await store.registerAgent({
        taskId: "TASK-ESCALATE",
        agentId: "worker-1",
        role: "worker",
        cwd: repoRoot,
        writeScope: repoRoot,
        state: "running",
        parentAgentId: "parent-1",
      });
      await writeCurrentTaskPacket(store, escalatedWorkerManifest);
      const { tools, calls, userMessages } = loadExtension(() => {
        throw new Error("closed-parent escalation must not call cmux");
      });
      const attention = tools.get("delegate_attention");

      const result = await withProcessEnv(delegatedEnv(store, escalatedWorkerManifest), () =>
        attention.execute(
          "attention-escalate",
          { taskId: "TASK-ESCALATE", agentId: "worker-1", level: "blocked", message: "worker blocked" },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );
      assert.equal(result.details.result.alert.priority, "P1");
      const unread = await store.readParentAlerts("TASK-ESCALATE", { unreadOnly: true });
      const escalation = unread.filter((alert) => alert.eventType === "parent-unavailable-escalation");
      assert.equal(escalation.length, 1);
      assert.equal(escalation[0].priority, "P0");
      assert.equal(escalation[0].parentAgentId, "grandparent-1");
      assert.equal(escalation[0].escalatedFromAlertId, result.details.result.alert.alertId);
      assert.equal(escalation[0].escalationProof.kind, "explicit-parent-closed");
      const original = unread.find((alert) => alert.alertId === result.details.result.alert.alertId);
      assert.equal(original.readAt, undefined);
      await store.queueParentAlert("TASK-ESCALATE", {
        agentId: "worker-1",
        parentAgentId: "parent-1",
        outcome: "blocked",
        state: "blocked",
        eventType: "agent-attention",
        message: "worker blocked duplicate",
        dedupeKey: original.dedupeKey,
      });
      assert.equal(
        (await store.readParentAlerts("TASK-ESCALATE", { unreadOnly: true })).filter(
          (alert) => alert.eventType === "parent-unavailable-escalation",
        ).length,
        1,
      );
      const secondWorkerManifest = await store.registerAgent({
        taskId: "TASK-ESCALATE",
        agentId: "worker-2",
        role: "worker",
        cwd: repoRoot,
        writeScope: repoRoot,
        state: "running",
        parentAgentId: "parent-1",
      });
      await writeCurrentTaskPacket(store, secondWorkerManifest);
      const secondResult = await withProcessEnv(delegatedEnv(store, secondWorkerManifest), () =>
        attention.execute(
          "attention-escalate-second-source",
          { taskId: "TASK-ESCALATE", agentId: "worker-2", level: "blocked", message: "second worker blocked" },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );
      const afterSecondSource = await store.readParentAlerts("TASK-ESCALATE", { unreadOnly: true });
      const coalescedEscalations = afterSecondSource.filter(
        (alert) => alert.eventType === "parent-unavailable-escalation",
      );
      assert.equal(coalescedEscalations.length, 1);
      assert.deepEqual(
        coalescedEscalations[0].data.sourceAlerts.map((source) => source.alertId).sort(),
        [result.details.result.alert.alertId, secondResult.details.result.alert.alertId].sort(),
      );
      assert.equal(coalescedEscalations[0].data.sourceAlerts.length, 2);
      assert.equal(
        (await store.readWakeAttempts("TASK-ESCALATE")).filter(
          (attempt) => attempt.priority === "P0" && attempt.alertIds.includes(coalescedEscalations[0].alertId),
        ).length,
        1,
      );

      await store.registerAgent({
        taskId: "TASK-ESCALATE-ROOT",
        agentId: "parent-root",
        role: "execution-parent",
        profile: "execution-parent",
        cwd: repoRoot,
        state: "closed",
      });
      const rootWorkerManifest = await store.registerAgent({
        taskId: "TASK-ESCALATE-ROOT",
        agentId: "worker-root",
        role: "worker",
        cwd: repoRoot,
        writeScope: repoRoot,
        state: "running",
        parentAgentId: "parent-root",
      });
      await writeCurrentTaskPacket(store, rootWorkerManifest);
      await withProcessEnv(delegatedEnv(store, rootWorkerManifest), () =>
        attention.execute(
          "attention-escalate-root",
          {
            taskId: "TASK-ESCALATE-ROOT",
            agentId: "worker-root",
            level: "blocked",
            message: "root-owned worker blocked",
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );
      const rootEscalation = (await store.readParentAlerts("TASK-ESCALATE-ROOT", { unreadOnly: true })).find(
        (alert) => alert.eventType === "parent-unavailable-escalation",
      );
      assert.equal(rootEscalation.priority, "P0");
      assert.equal(rootEscalation.parentAgentId, "orchestrator");

      assert.equal(calls.length, 0);
      assert.equal(userMessages.length, 0);
    }),
  );
});

test("running missing malformed and unknown parent state never escalate", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "parent-running",
        role: "execution-parent",
        profile: "execution-parent",
        cwd: repoRoot,
        state: "running",
        parentAgentId: "orchestrator",
      });
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "worker-running",
        role: "worker",
        cwd: repoRoot,
        state: "running",
        parentAgentId: "parent-running",
      });
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "worker-missing",
        role: "worker",
        cwd: repoRoot,
        state: "running",
        parentAgentId: "parent-missing",
      });
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "parent-malformed",
        role: "execution-parent",
        profile: "execution-parent",
        cwd: repoRoot,
        state: "closed",
        parentAgentId: "orchestrator",
      });
      await writeFile(store.pathsForAgent("TASK-NO-ESCALATE", "parent-malformed").statusJson, "{bad-json", "utf8");
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "worker-malformed",
        role: "worker",
        cwd: repoRoot,
        state: "running",
        parentAgentId: "parent-malformed",
      });
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "parent-unknown",
        role: "execution-parent",
        profile: "execution-parent",
        cwd: repoRoot,
        state: "closed",
        parentAgentId: "orchestrator",
      });
      await writeFile(
        store.pathsForAgent("TASK-NO-ESCALATE", "parent-unknown").statusJson,
        JSON.stringify({ taskId: "TASK-NO-ESCALATE", agentId: "parent-unknown", state: "lost", updatedAt: "now" }),
        "utf8",
      );
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "worker-unknown",
        role: "worker",
        cwd: repoRoot,
        state: "running",
        parentAgentId: "parent-unknown",
      });
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "parent-identity",
        role: "execution-parent",
        profile: "execution-parent",
        cwd: repoRoot,
        state: "closed",
        parentAgentId: "orchestrator",
      });
      await writeFile(
        store.pathsForAgent("TASK-NO-ESCALATE", "parent-identity").statusJson,
        JSON.stringify({
          taskId: "OTHER-TASK",
          agentId: "parent-identity",
          state: "closed",
          updatedAt: "2026-07-10T00:00:00.000Z",
        }),
        "utf8",
      );
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "worker-identity",
        role: "worker",
        cwd: repoRoot,
        state: "running",
        parentAgentId: "parent-identity",
      });
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "parent-profile",
        role: "execution-parent",
        profile: "execution-parent",
        cwd: repoRoot,
        state: "closed",
        parentAgentId: "orchestrator",
      });
      await store.updateAgentManifest("TASK-NO-ESCALATE", "parent-profile", { profile: "planning-parent" });
      await store.registerAgent({
        taskId: "TASK-NO-ESCALATE",
        agentId: "worker-profile",
        role: "worker",
        cwd: repoRoot,
        state: "running",
        parentAgentId: "parent-profile",
      });
      const noEscalateWorkerIds = [
        "worker-running",
        "worker-missing",
        "worker-malformed",
        "worker-unknown",
        "worker-identity",
        "worker-profile",
      ];
      for (const agentId of noEscalateWorkerIds) {
        await store.updateAgentManifest("TASK-NO-ESCALATE", agentId, { writeScope: repoRoot, writeScopes: [repoRoot] });
        await writeCurrentTaskPacket(store, await store.readAgentManifest("TASK-NO-ESCALATE", agentId));
      }
      const { tools, calls, userMessages } = loadExtension(() => {
        throw new Error("unknown parent state must not call cmux");
      });
      const attention = tools.get("delegate_attention");
      for (const agentId of noEscalateWorkerIds) {
        const manifest = await store.readAgentManifest("TASK-NO-ESCALATE", agentId);
        await withProcessEnv(delegatedEnv(store, manifest), () =>
          attention.execute(
            `attention-${agentId}`,
            { taskId: "TASK-NO-ESCALATE", agentId, message: `${agentId} needs parent` },
            undefined,
            undefined,
            ctx(repoRoot),
          ),
        );
      }
      const unread = await store.readParentAlerts("TASK-NO-ESCALATE", { unreadOnly: true });
      assert.equal(unread.filter((alert) => alert.eventType === "parent-unavailable-escalation").length, 0);
      assert.equal(calls.length, 0);
      assert.equal(userMessages.length, 0);
    }),
  );
});

test("delegate_status degrades instead of crashing on malformed execution map", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      await store.initTask({ taskId: "TASK-DEGRADED" });
      await writeFile(
        store.pathsForTask("TASK-DEGRADED").executionMapJson,
        JSON.stringify({ version: 1, taskId: "TASK-DEGRADED", updatedAt: "now" }),
        "utf8",
      );
      const { tools } = loadExtension(() => ok());
      const status = tools.get("delegate_status");

      const result = await status.execute(
        "status-degraded",
        { taskId: "TASK-DEGRADED" },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(result.details.result.status, "degraded");
      assert.equal(result.details.result.degraded[0].code, "execution_map_invalid");
      assert.match(result.details.result.degraded[0].recovery, /regenerate/);
    }),
  );
});

test("delegate_result auto-closes passing verifier panes after parent consumes result", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
      const autoCloseManifest = await store.registerAgent({
        taskId: "TASK-AUTOCLOSE",
        agentId: "verifier-1",
        role: "verifier",
        profile: "verifier",
        cwd: repoRoot,
        state: "running",
        surfaceRef: "surface:3",
        retention: "auto",
      });
      await writeCurrentTaskPacket(store, autoCloseManifest);
      const { tools, calls } = loadExtension((command) => {
        if (command[0] === "cmux" && command[1] === "close-surface") return ok();
        return ok();
      });
      const finish = tools.get("delegate_finish");
      const resultTool = tools.get("delegate_result");

      await withProcessEnv(delegatedEnv(store, autoCloseManifest), () =>
        finish.execute(
          "finish-verifier",
          {
            taskId: "TASK-AUTOCLOSE",
            agentId: "verifier-1",
            status: "completed",
            summary: "Verifier passed.",
            checks: [{ name: "npm run test:delegation", status: "pass", outputId: "ffout_tests" }],
            completionClaimSupported: true,
          },
          undefined,
          undefined,
          ctx(repoRoot),
        ),
      );

      const result = await resultTool.execute(
        "result-autoclose",
        { taskId: "TASK-AUTOCLOSE", agentId: "verifier-1" },
        undefined,
        undefined,
        ctx(repoRoot),
      );
      assert.equal(result.details.result.retention.action, "closed");
      assert.ok(calls.some((call) => call.command.join(" ").includes("close-surface --surface surface:3")));
      assert.equal((await store.readAgentStatus("TASK-AUTOCLOSE", "verifier-1")).state, "closed");
    }),
  );
});

test("delegate_update_execution_map validates and stores one canonical work package", async () => {
  await withProcessEnv(DELEGATION_ENV_CLEAR, async () =>
    withTempRepo(async (repoRoot) => {
      const { tools } = loadExtension(() => ok());
      const update = tools.get("delegate_update_execution_map");
      const result = await update.execute(
        "update-map",
        {
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
        },
        undefined,
        undefined,
        ctx(repoRoot),
      );

      assert.equal(result.details.result.status, "stored");
      assert.equal(result.details.result.executionMap.packages[0].packageId, "P1");
    }),
  );
});

test("delegate_cancel sends ctrl-c, records cancelled state, and queues a parent alert", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-P4",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      surfaceRef: "surface:3",
    });
    await store.ensureLeaseActive("TASK-P4", {
      leaseId: "lease-cancel-worker",
      taskId: "TASK-P4",
      agentId: "worker-1",
      role: "worker",
      state: "issued",
      actions: ["edit"],
      writeScopes: [repoRoot],
      allowedCommands: [],
      expires: "on_assignment_terminal",
    });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "send-key") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const cancel = tools.get("delegate_cancel");

    const missing = await cancel.execute(
      "cancel-missing",
      { taskId: "TASK-P4", agentId: "missing" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(missing.details.result.code, "target_not_found");
    assert.equal(calls.length, 0);

    const result = await cancel.execute(
      "cancel",
      { taskId: "TASK-P4", agentId: "worker-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(result.details.result.status, "cancelled");
    assert.equal(
      calls.some((call) => call.command.join(" ").includes("send-key --surface surface:3 ctrl-c")),
      true,
    );
    assert.equal((await store.readAgentStatus("TASK-P4", "worker-1")).state, "cancelled");
    assert.deepEqual(result.details.result.endedLeaseIds, ["lease-cancel-worker"]);
    assert.equal((await store.readLeaseEvents("TASK-P4")).at(-1).state, "revoked");
    assert.deepEqual((await store.readActiveLeaseView("TASK-P4")).activeLeaseIdsByAgent, {});
    const alerts = await store.readParentAlerts("TASK-P4", { unreadOnly: true });
    assert.equal(alerts[0].outcome, "cancelled");
  });
});

test("delegated delegate_record_report binds current planning-parent attempt and rejects scope or role forgery", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const planning = await store.registerAgent({
      taskId: "TASK-DIRECT-REPORT-SOURCE",
      agentId: "planning-parent-1",
      role: "planning-parent",
      profile: "planning-parent",
      cwd: repoRoot,
      writeScope: join(repoRoot, "docs"),
      state: "running",
      parentAgentId: "orchestrator",
    });
    await writeCurrentTaskPacket(store, planning);
    const execution = await store.registerAgent({
      taskId: "TASK-DIRECT-REPORT-ROLE",
      agentId: "execution-parent-1",
      role: "execution-parent",
      profile: "execution-parent",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      parentAgentId: "orchestrator",
    });
    await writeCurrentTaskPacket(store, execution);
    const rawText = [
      "PLANNING_REPORT",
      "STATUS|ready",
      "GOAL|Bind delegated source.",
      "PLAN_ARTIFACT_PATH|docs/plans/source-bound.md",
      "ARTIFACT_PATHS|docs/plans/source-bound.md",
      "REVIEW_STATUS|passed",
      "SETTLED_DECISIONS|bind attempt",
      "OPEN_QUESTIONS|none",
      "EXECUTION_AUTONOMY|bounded",
      "USER_CHECKPOINTS|authorization",
      "EXECUTION_GUIDANCE|follow plan",
      "RISKS|none",
      "EVIDENCE|tests",
      "END_PLANNING_REPORT",
    ].join("\n");
    const { tools } = loadExtension(() => ok());
    const record = tools.get("delegate_record_report");

    await withProcessEnv(
      {
        ...DELEGATION_ENV_CLEAR,
        FREEFLOW_DELEGATION_STORE: store.root,
        FREEFLOW_DELEGATION_TASK_ID: planning.taskId,
        FREEFLOW_DELEGATION_AGENT_ID: planning.agentId,
        FREEFLOW_DELEGATION_ATTEMPT_ID: planning.attemptId,
        FREEFLOW_PARENT_AGENT_ID: "orchestrator",
        FREEFLOW_AGENT_ROLE: "planning-parent",
        FREEFLOW_CONTEXT_PROFILE: "planning-parent",
      },
      async () => {
        const accepted = await record.execute(
          "record-current-planning-attempt",
          { taskId: planning.taskId, reportName: "planning-report", rawText },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        assert.equal(accepted.details.result.reportStatus, "ready");
        const events = (await readFile(store.pathsForTask(planning.taskId).eventsJsonl, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        const publication = events.find((event) => event.type === "planning_report.accepted");
        assert.equal(publication.data.source.agentId, planning.agentId);
        assert.equal(publication.data.source.assignmentId, planning.assignmentId);
        assert.equal(publication.data.source.attemptId, planning.attemptId);

        const crossTask = await record.execute(
          "record-cross-task",
          { taskId: "TASK-OTHER", reportName: "planning-report", rawText },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        assert.equal(crossTask.details.result.code, "lifecycle_scope_violation");
      },
    );

    await withProcessEnv(
      {
        ...DELEGATION_ENV_CLEAR,
        FREEFLOW_DELEGATION_STORE: store.root,
        FREEFLOW_DELEGATION_TASK_ID: planning.taskId,
        FREEFLOW_DELEGATION_AGENT_ID: planning.agentId,
        FREEFLOW_DELEGATION_ATTEMPT_ID: "attempt-stale",
        FREEFLOW_PARENT_AGENT_ID: "orchestrator",
        FREEFLOW_AGENT_ROLE: "planning-parent",
        FREEFLOW_CONTEXT_PROFILE: "planning-parent",
      },
      async () => {
        const stale = await record.execute(
          "record-stale-planning-attempt",
          { taskId: planning.taskId, reportName: "planning-report", rawText },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        assert.equal(stale.details.result.code, "lifecycle_attempt_mismatch");
      },
    );

    await withProcessEnv(
      {
        ...DELEGATION_ENV_CLEAR,
        FREEFLOW_DELEGATION_STORE: store.root,
        FREEFLOW_DELEGATION_TASK_ID: execution.taskId,
        FREEFLOW_DELEGATION_AGENT_ID: execution.agentId,
        FREEFLOW_DELEGATION_ATTEMPT_ID: execution.attemptId,
        FREEFLOW_PARENT_AGENT_ID: "orchestrator",
        FREEFLOW_AGENT_ROLE: "execution-parent",
        FREEFLOW_CONTEXT_PROFILE: "execution-parent",
      },
      async () => {
        const wrongRole = await record.execute(
          "record-execution-parent-planning",
          { taskId: execution.taskId, reportName: "planning-report", rawText },
          undefined,
          undefined,
          ctx(repoRoot),
        );
        assert.equal(wrongRole.details.result.code, "planning_report_role_forbidden");
      },
    );
  });
});

test("delegate_record_report stores parsed reports and malformed report evidence", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const executionManifest = await store.registerAgent({
      taskId: "TASK-P4",
      agentId: "execution-parent-1",
      role: "execution-parent",
      profile: "execution-parent",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      parentAgentId: "orchestrator",
    });
    await writeCurrentTaskPacket(store, executionManifest);
    const { tools } = loadExtension(() => ok());
    const record = tools.get("delegate_record_report");
    const report = [
      "EXECUTION_REPORT",
      "STATUS|completed_with_risks",
      "SUMMARY|P4 complete with deferred live smoke.",
      "SOURCE_REFERENCES|docs/specs/delegation-harness/freeflow-pi-pane-delegation-harness-spec.md",
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

    const rootRejected = await withProcessEnv(DELEGATION_ENV_CLEAR, () =>
      record.execute(
        "record-report-root",
        { taskId: "TASK-P4", reportName: "execution-report", rawText: report },
        undefined,
        undefined,
        ctx(repoRoot),
      ),
    );
    assert.equal(rootRejected.details.result.toolStatus, "error");
    assert.equal(rootRejected.details.result.code, "delegated_lifecycle_identity_required");
    assert.equal((await store.readTaskReport("TASK-P4", "execution-report")).exists, false);

    const okResult = await withProcessEnv(delegatedEnv(store, executionManifest), () =>
      record.execute(
        "record-report",
        { taskId: "TASK-P4", reportName: "execution-report", rawText: report },
        undefined,
        undefined,
        ctx(repoRoot),
      ),
    );
    assert.equal(okResult.details.result.status, "completed");
    assert.equal(okResult.details.result.commitState, "committed");
    assert.match(okResult.details.result.terminalOutcomeId, /^terminal-/);
    assert.equal(okResult.details.result.alert.outcome, "completed_with_risks");

    const malformed = await record.execute(
      "record-bad-report",
      { taskId: "TASK-P4", reportName: "planning-report", rawText: "PLANNING_REPORT\nGOAL|x\nEND_PLANNING_REPORT" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(malformed.details.result.status, "failed");
    assert.equal(malformed.details.result.code, "report_malformed");
    assert.match(await readFile(malformed.details.result.paths.raw, "utf8"), /PLANNING_REPORT/);

    const conflictingReady = [
      "PLANNING_REPORT",
      "STATUS|ready",
      "GOAL|Choose one plan identity.",
      "PLAN_ARTIFACT_PATH|docs/plans/first.md",
      "PLAN_ARTIFACT_PATH|docs/plans/second.md",
      "ARTIFACT_PATHS|docs/plans/first.md,docs/plans/second.md",
      "REVIEW_STATUS|passed",
      "SETTLED_DECISIONS|none",
      "OPEN_QUESTIONS|none",
      "EXECUTION_AUTONOMY|bounded",
      "USER_CHECKPOINTS|authorization",
      "EXECUTION_GUIDANCE|follow the selected plan",
      "RISKS|identity ambiguity",
      "EVIDENCE|tests",
      "END_PLANNING_REPORT",
    ].join("\n");
    const conflictStore = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    const conflicting = await record.execute(
      "record-conflicting-ready",
      { taskId: "TASK-P4-CONFLICT", reportName: "planning-report", rawText: conflictingReady },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(conflicting.details.result.status, "failed");
    assert.equal(conflicting.details.result.code, "report_malformed");
    assert.equal((await conflictStore.readTaskReport("TASK-P4-CONFLICT", "planning-report")).exists, false);
    assert.match(conflicting.details.result.paths.raw, /planning-report-publications\/rejected/);
    assert.notEqual(
      conflicting.details.result.paths.raw,
      conflictStore.pathsForTask("TASK-P4-CONFLICT").planningReportRaw,
    );
    await assert.rejects(
      () => conflictStore.readExecutionApprovalRequest("TASK-P4-CONFLICT"),
      /no valid planning-ready event/,
    );

    const validReady = conflictingReady
      .replace(
        "PLAN_ARTIFACT_PATH|docs/plans/first.md\nPLAN_ARTIFACT_PATH|docs/plans/second.md",
        "PLAN_ARTIFACT_PATH|docs/plans/accepted.md",
      )
      .replace("ARTIFACT_PATHS|docs/plans/first.md,docs/plans/second.md", "ARTIFACT_PATHS|docs/plans/accepted.md");
    const accepted = await record.execute(
      "record-valid-after-conflict",
      { taskId: "TASK-P4-CONFLICT", reportName: "planning-report", rawText: validReady },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(accepted.details.result.reportStatus, "ready");
    const acceptedBefore = await conflictStore.readTaskReport("TASK-P4-CONFLICT", "planning-report");
    const acceptedRawBefore = await readFile(acceptedBefore.rawPath, "utf8");
    const acceptedJsonBefore = await readFile(acceptedBefore.jsonPath, "utf8");

    await record.execute(
      "record-conflicting-after-valid",
      { taskId: "TASK-P4-CONFLICT", reportName: "planning-report", rawText: conflictingReady },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    const acceptedAfter = await conflictStore.readTaskReport("TASK-P4-CONFLICT", "planning-report");
    assert.equal(acceptedAfter.rawPath, acceptedBefore.rawPath);
    assert.equal(acceptedAfter.jsonPath, acceptedBefore.jsonPath);
    assert.equal(await readFile(acceptedAfter.rawPath, "utf8"), acceptedRawBefore);
    assert.equal(await readFile(acceptedAfter.jsonPath, "utf8"), acceptedJsonBefore);
  });
});

test("delegate_close blocks parent close until descendants are reconciled", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-DESC",
      agentId: "execution-parent-1",
      role: "execution-parent",
      profile: "execution-parent",
      cwd: repoRoot,
      state: "running",
      surfaceRef: "surface:parent",
    });
    await store.registerAgent({
      taskId: "TASK-DESC",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      surfaceRef: "surface:child",
      parentAgentId: "execution-parent-1",
    });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "close-surface") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const close = tools.get("delegate_close");

    const blocked = await close.execute(
      "close-parent-blocked",
      { taskId: "TASK-DESC", agentId: "execution-parent-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(blocked.details.result.status, "blocked");
    assert.equal(blocked.details.result.code, "descendant_reconciliation_required");
    assert.equal(blocked.details.result.activeDescendants[0].agentId, "worker-1");
    assert.equal(calls.length, 0);

    await store.writeAgentStatus("TASK-DESC", "worker-1", { state: "completed", message: "child complete" });
    await store.queueParentAlert("TASK-DESC", {
      agentId: "worker-1",
      parentAgentId: "execution-parent-1",
      outcome: "completed",
      state: "completed",
      eventType: "agent-result",
      sourceEventId: "evt-child-complete",
      message: "child complete",
    });
    const blockedUnconsumed = await close.execute(
      "close-parent-unconsumed",
      { taskId: "TASK-DESC", agentId: "execution-parent-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(blockedUnconsumed.details.result.code, "descendant_reconciliation_required");
    assert.equal(blockedUnconsumed.details.result.unconsumedCompleted[0].agentId, "worker-1");

    await store.markParentAlertsRead("TASK-DESC");
    const closed = await close.execute(
      "close-parent",
      { taskId: "TASK-DESC", agentId: "execution-parent-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(closed.details.result.status, "closed");
    assert.equal(
      calls.some((call) => call.command.join(" ").includes("close-surface --surface surface:parent")),
      true,
    );
  });
});

test("delegate_cancel blocks parent cancel until active descendants are reconciled", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-DESC-CANCEL",
      agentId: "execution-parent-1",
      role: "execution-parent",
      profile: "execution-parent",
      cwd: repoRoot,
      state: "running",
      surfaceRef: "surface:parent",
    });
    await store.registerAgent({
      taskId: "TASK-DESC-CANCEL",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      surfaceRef: "surface:child",
      parentAgentId: "execution-parent-1",
    });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "send-key") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const cancel = tools.get("delegate_cancel");

    const blocked = await cancel.execute(
      "cancel-parent-blocked",
      { taskId: "TASK-DESC-CANCEL", agentId: "execution-parent-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(blocked.details.result.status, "blocked");
    assert.equal(blocked.details.result.code, "descendant_reconciliation_required");
    assert.equal(calls.length, 0);

    await store.writeAgentStatus("TASK-DESC-CANCEL", "worker-1", { state: "closed", message: "child closed" });
    const cancelled = await cancel.execute(
      "cancel-parent",
      { taskId: "TASK-DESC-CANCEL", agentId: "execution-parent-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(cancelled.details.result.status, "cancelled");
    assert.equal(
      calls.some((call) => call.command.join(" ").includes("send-key --surface surface:parent ctrl-c")),
      true,
    );
  });
});

test("delegate_close validates target before closing and records closed state", async () => {
  await withTempRepo(async (repoRoot) => {
    const store = createDelegationStore({ root: join(repoRoot, ".freeflow", "delegation") });
    await store.registerAgent({
      taskId: "TASK-P3",
      agentId: "worker-1",
      role: "worker",
      cwd: repoRoot,
      writeScope: repoRoot,
      state: "running",
      surfaceRef: "surface:3",
    });
    const { tools, calls } = loadExtension((command) => {
      if (command[0] === "cmux" && command[1] === "close-surface") return ok();
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });
    const close = tools.get("delegate_close");

    const missing = await close.execute(
      "close-missing",
      { taskId: "TASK-P3", agentId: "missing" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(missing.details.result.code, "target_not_found");
    assert.equal(calls.length, 0);

    const result = await close.execute(
      "close",
      { taskId: "TASK-P3", agentId: "worker-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
    assert.equal(result.details.result.status, "closed");
    assert.equal(
      calls.some((call) => call.command.join(" ").includes("close-surface --surface surface:3")),
      true,
    );
    assert.equal((await store.readAgentStatus("TASK-P3", "worker-1")).state, "closed");

    const callCount = calls.length;
    const alreadyClosed = await close.execute(
      "close-again",
      { taskId: "TASK-P3", agentId: "worker-1" },
      undefined,
      undefined,
      ctx(repoRoot),
    );
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
        preflight: {
          status: "unavailable",
          reason: "no context",
          actionTaken: "no_pane_opened_no_child_pi_started",
          checks: [{ name: "cmux_context", status: "failed", message: "no caller" }],
          safeRoutes: ["continue_inline_in_current_pi_session"],
        },
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
