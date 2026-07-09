import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  CmuxAdapter,
  assertLeafProfilesDoNotIncludeDelegationTools,
  compileTaskPacket,
  createDelegationStore,
  delegationRootForRepo,
  parseModelText,
  resolveProfileForRole,
  shellQuote,
  validateSafeId,
} from "../../../delegation/dist/index.js";
import { renderDelegationCall, renderDelegationResult } from "./renderers.js";
import { readCapabilityState } from "../runtime-context.js";

const STRING_SCHEMA = { type: "string" };
const NON_EMPTY_STRING_SCHEMA = { type: "string", minLength: 1 };
const ROLE_SCHEMA = {
  type: "string",
  enum: ["planning-parent", "execution-parent", "researcher", "worker", "reviewer", "verifier", "integrator"],
};
const PROFILE_SCHEMA = {
  type: "string",
  enum: ["planning-parent", "execution-parent", "researcher", "worker", "reviewer", "verifier", "integrator", "write-scoped", "read-only", "check-runner"],
};
const SOURCE_POINTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: NON_EMPTY_STRING_SCHEMA,
    path: NON_EMPTY_STRING_SCHEMA,
    note: STRING_SCHEMA,
  },
  required: ["kind", "path"],
};
const EVIDENCE_POINTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: NON_EMPTY_STRING_SCHEMA,
    path: STRING_SCHEMA,
    outputId: STRING_SCHEMA,
    note: STRING_SCHEMA,
    lines: STRING_SCHEMA,
  },
  required: ["label"],
};

const TASK_INIT_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    goal: STRING_SCHEMA,
    parentTaskId: STRING_SCHEMA,
  },
  required: ["taskId"],
};

const SPAWN_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    agentId: NON_EMPTY_STRING_SCHEMA,
    parentAgentId: STRING_SCHEMA,
    role: ROLE_SCHEMA,
    profile: PROFILE_SCHEMA,
    cwd: NON_EMPTY_STRING_SCHEMA,
    objective: NON_EMPTY_STRING_SCHEMA,
    direction: { type: "string", enum: ["left", "right", "up", "down"] },
    focus: { type: "boolean" },
    noSession: { type: "boolean", description: "Defaults to true for delegated panes." },
    writeScope: {
      oneOf: [
        NON_EMPTY_STRING_SCHEMA,
        { type: "array", minItems: 1, items: NON_EMPTY_STRING_SCHEMA },
      ],
      description: "One or more explicit path/glob write scopes. Use an array for multiple scopes; prose or comma-separated scopes are rejected.",
    },
    allowedCommands: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    sourcePointers: { type: "array", items: SOURCE_POINTER_SCHEMA },
    inScope: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    outOfScope: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    evidence: { type: "array", items: EVIDENCE_POINTER_SCHEMA },
    stopConditions: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    windowRef: STRING_SCHEMA,
    workspaceRef: STRING_SCHEMA,
    retention: { type: "string", enum: ["auto", "keep-open", "debug"] },
    layoutPolicy: { type: "string", enum: ["auto", "manual", "orchestrator", "planning", "execution", "review-dock"] },
  },
  required: ["taskId", "agentId", "role", "cwd", "objective"],
};

const TARGET_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    agentId: STRING_SCHEMA,
  },
  required: ["taskId"],
};

const WAIT_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    agentId: STRING_SCHEMA,
    timeoutMs: { type: "integer", minimum: 1, maximum: 600000 },
  },
  required: ["taskId", "timeoutMs"],
};

const STATUS_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: STRING_SCHEMA,
    agentId: STRING_SCHEMA,
    includePreflight: { type: "boolean" },
  },
};

const SEND_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    agentId: NON_EMPTY_STRING_SCHEMA,
    kind: { type: "string", enum: ["note", "steer", "follow_up", "fix", "task_packet"] },
    message: NON_EMPTY_STRING_SCHEMA,
  },
  required: ["taskId", "agentId", "message"],
};

const CAPTURE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    agentId: NON_EMPTY_STRING_SCHEMA,
    lines: { type: "integer", minimum: 1, maximum: 500 },
    scrollback: { type: "boolean" },
  },
  required: ["taskId", "agentId"],
};

const CLOSE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    agentId: NON_EMPTY_STRING_SCHEMA,
  },
  required: ["taskId", "agentId"],
};

const REPORT_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    reportName: { type: "string", enum: ["planning-report", "execution-kickoff", "execution-report"] },
    rawText: STRING_SCHEMA,
  },
  required: ["taskId", "reportName"],
};

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: NON_EMPTY_STRING_SCHEMA,
    status: { type: "string", enum: ["pass", "fail", "skipped", "not_run"] },
    outputId: STRING_SCHEMA,
    evidence: STRING_SCHEMA,
    notes: STRING_SCHEMA,
  },
  required: ["name", "status"],
};

const FINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    severity: { type: "string", enum: ["blocking", "non_blocking", "question", "needs_evidence"] },
    location: STRING_SCHEMA,
    problem: NON_EMPTY_STRING_SCHEMA,
    recommendation: STRING_SCHEMA,
    evidence: STRING_SCHEMA,
  },
  required: ["severity", "problem"],
};

const REPORT_FIELD_SCHEMA = {
  anyOf: [
    STRING_SCHEMA,
    { type: "array", items: STRING_SCHEMA },
  ],
};

const FINISH_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: STRING_SCHEMA,
    agentId: STRING_SCHEMA,
    status: { type: "string", enum: ["completed", "completed_with_risks", "blocked", "failed", "cancelled"] },
    summary: NON_EMPTY_STRING_SCHEMA,
    reportStatus: STRING_SCHEMA,
    goal: REPORT_FIELD_SCHEMA,
    artifactPaths: REPORT_FIELD_SCHEMA,
    reviewStatus: REPORT_FIELD_SCHEMA,
    settledDecisions: REPORT_FIELD_SCHEMA,
    openQuestions: REPORT_FIELD_SCHEMA,
    executionAutonomy: REPORT_FIELD_SCHEMA,
    userCheckpoints: REPORT_FIELD_SCHEMA,
    executionGuidance: REPORT_FIELD_SCHEMA,
    risks: REPORT_FIELD_SCHEMA,
    sourceReferences: REPORT_FIELD_SCHEMA,
    workPackages: REPORT_FIELD_SCHEMA,
    commits: REPORT_FIELD_SCHEMA,
    reviews: REPORT_FIELD_SCHEMA,
    planDeviations: REPORT_FIELD_SCHEMA,
    stopConditionsHit: REPORT_FIELD_SCHEMA,
    finalRecommendation: REPORT_FIELD_SCHEMA,
    filesChanged: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    filesRead: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    toolsUsed: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    checks: { type: "array", items: CHECK_SCHEMA },
    evidence: { type: "array", items: EVIDENCE_POINTER_SCHEMA },
    findings: { type: "array", items: FINDING_SCHEMA },
    assessment: STRING_SCHEMA,
    residualRisk: STRING_SCHEMA,
    recommendation: STRING_SCHEMA,
    uncertainty: STRING_SCHEMA,
    unverifiedAreas: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    completionClaimSupported: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
  required: ["status", "summary"],
};

const ATTENTION_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: STRING_SCHEMA,
    agentId: STRING_SCHEMA,
    level: { type: "string", enum: ["attention", "needs_parent", "capability_gap", "blocked", "failed"] },
    message: NON_EMPTY_STRING_SCHEMA,
    terminal: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
  required: ["message"],
};

const PROGRESS_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: STRING_SCHEMA,
    agentId: STRING_SCHEMA,
    message: NON_EMPTY_STRING_SCHEMA,
    data: { type: "object", additionalProperties: true },
  },
  required: ["message"],
};

const INBOX_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    unreadOnly: { type: "boolean" },
    agentId: STRING_SCHEMA,
    parentAgentId: STRING_SCHEMA,
    global: { type: "boolean", description: "When true, read alerts across all parents for this task. Defaults to the current delegated parent when env is present." },
  },
  required: ["taskId"],
};

const ACK_ALERT_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    alertId: NON_EMPTY_STRING_SCHEMA,
  },
  required: ["taskId", "alertId"],
};

const ACK_ALL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    agentId: STRING_SCHEMA,
    parentAgentId: STRING_SCHEMA,
    global: { type: "boolean", description: "When true, ack alerts across all parents for this task. Defaults to the current delegated parent when env is present." },
  },
  required: ["taskId"],
};

const USER_ATTENTION_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    agentId: STRING_SCHEMA,
    level: { type: "string", enum: ["info", "needs_review", "needs_decision", "blocked", "completed"] },
    summary: NON_EMPTY_STRING_SCHEMA,
    notify: { type: "boolean" },
  },
  required: ["taskId", "summary"],
};

const UPDATE_EXECUTION_MAP_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: NON_EMPTY_STRING_SCHEMA,
    package: { type: "object", additionalProperties: true },
  },
  required: ["taskId", "package"],
};

export function registerDelegationTools(pi: any): void {
  assertLeafProfilesDoNotIncludeDelegationTools();
  const toolDefinitions = [
    delegationTool("delegate_task_init", "Delegate Task Init", "Create repo-local delegation task state for an orchestrator or parent.", TASK_INIT_PARAMETERS, executeTaskInit, "parent-control"),
    delegationTool("delegate_spawn", "Delegate Spawn", "Open a visible cmux pane and start a delegated Pi child after fail-closed preflight.", SPAWN_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeSpawn(pi, params, signal, ctx), "parent-control"),
    delegationTool("delegate_status", "Delegate Status", "Return compact delegation task/agent/preflight status with no raw transcript dump.", STATUS_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeStatus(pi, params, signal, ctx), "read-recovery"),
    delegationTool("delegate_wait", "Delegate Wait", "Explicit bounded watch mode for terminal/attention lifecycle changes; timeout is required.", WAIT_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeWait(params, signal, ctx), "parent-control"),
    delegationTool("delegate_result", "Delegate Result", "Return compact parsed result/report pointers without raw transcript injection.", TARGET_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeResult(pi, params, signal, ctx), "read-recovery"),
    delegationTool("delegate_send", "Delegate Send", "Send a bounded note or file-backed follow-up/fix packet to a delegated pane.", SEND_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeSend(pi, params, signal, ctx), "parent-control"),
    delegationTool("delegate_capture", "Delegate Capture", "Capture a bounded cmux screen snapshot and store it as evidence without dumping raw screens.", CAPTURE_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeCapture(pi, params, signal, ctx), "parent-control"),
    delegationTool("delegate_cancel", "Delegate Cancel", "Cancel a valid delegated target without deleting evidence.", CLOSE_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeCancel(pi, params, signal, ctx), "parent-control"),
    delegationTool("delegate_close", "Delegate Close", "Close a valid delegated cmux surface while preserving delegation evidence.", CLOSE_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeClose(pi, params, signal, ctx), "parent-control"),
    delegationTool("delegate_record_report", "Delegate Record Report", "Record planning/execution reports and kickoff blocks with deterministic parser evidence.", REPORT_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => executeRecordReport(params, ctx), "parent-control"),
    delegationTool("delegate_finish", "Delegate Finish", "Store a structured delegated result/report for the current agent and alert the direct parent without echoing full JSON.", FINISH_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => executeFinish(params, ctx), "child-lifecycle"),
    delegationTool("delegate_attention", "Delegate Attention", "Request parent attention or record a blocker for the current delegated agent.", ATTENTION_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => executeAttention(params, ctx), "child-lifecycle"),
    delegationTool("delegate_progress", "Delegate Progress", "Record store-only delegated progress without waking the parent by default.", PROGRESS_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => executeProgress(params, ctx), "child-lifecycle"),
    delegationTool("delegate_inbox", "Delegate Inbox", "Read compact parent inbox alerts for a delegation task.", INBOX_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => executeInbox(params, ctx), "read-recovery"),
    delegationTool("delegate_ack_alert", "Delegate Ack Alert", "Mark one parent inbox alert as read.", ACK_ALERT_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => executeAckAlert(params, ctx), "read-recovery"),
    delegationTool("delegate_ack_all", "Delegate Ack All", "Mark all parent inbox alerts for a task as read.", ACK_ALL_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => executeAckAll(params, ctx), "read-recovery"),
    delegationTool("delegate_user_attention", "Delegate User Attention", "Request harness-owned user attention through configured Pi/TUI notification channels.", USER_ATTENTION_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => executeUserAttention(params, ctx), "read-recovery"),
    delegationTool("delegate_update_execution_map", "Delegate Update Execution Map", "Upsert one work package into the canonical execution map through harness validation.", UPDATE_EXECUTION_MAP_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => executeUpdateExecutionMap(params, ctx), "parent-control"),
  ];

  for (const definition of toolDefinitions) {
    pi.registerTool(definition);
  }
}

export async function executeDelegationOperation(pi: any, operation: string, params: any, signal: AbortSignal | undefined, ctx: any): Promise<any> {
  const disabled = await disabledByConfigResult(operation, ctx);
  if (disabled) {
    return disabled;
  }
  switch (operation) {
    case "delegate_status": return executeStatus(pi, params, signal, ctx);
    case "delegate_inbox": return executeInbox(params, ctx);
    case "delegate_result": return executeResult(pi, params, signal, ctx);
    case "delegate_capture": return executeCapture(pi, params, signal, ctx);
    case "delegate_close": return executeClose(pi, params, signal, ctx);
    case "delegate_ack_alert": return executeAckAlert(params, ctx);
    case "delegate_ack_all": return executeAckAll(params, ctx);
    default: return typedError(operation, "unsupported_delegation_batch_operation", `unsupported delegation operation for batch: ${operation}`);
  }
}

function delegationTool(name: string, label: string, description: string, parameters: any, handler: (params: any, signal: AbortSignal | undefined, ctx: any) => Promise<any>, toolClass: "parent-control" | "child-lifecycle" | "read-recovery") {
  const classGuidance = toolClass === "parent-control"
    ? "Use only from orchestrator or parent delegation profiles; leaf profiles must not call parent-control tools."
    : toolClass === "child-lifecycle"
      ? "Use from the current delegated agent only; it cannot target other tasks or agents."
      : "Use with scoped task/agent ids; leaf profiles may read only their own scoped state.";
  return {
    name,
    label,
    description,
    promptSnippet: `${description} ${classGuidance}`,
    promptGuidelines: [
      classGuidance,
      `${name} returns compact state and evidence pointers; do not expect raw child transcripts or raw screen dumps.`,
    ],
    parameters,
    async execute(_toolCallId: string, params: any, signal: AbortSignal | undefined, _onUpdate: unknown, ctx: any) {
      try {
        const disabled = await disabledByConfigResult(name, ctx);
        if (disabled) {
          return toToolResult(name, disabled);
        }
        const result = await handler(params ?? {}, signal, ctx);
        return toToolResult(name, result);
      } catch (error) {
        return toToolResult(name, errorResult(name, params, error));
      }
    },
    renderCall(args: any, theme: any) {
      return renderDelegationCall(name, args, theme);
    },
    renderResult(result: any, options: any, theme: any) {
      return renderDelegationResult(name, result, options, theme);
    },
  };
}

async function executeTaskInit(params: any, _signal: AbortSignal | undefined, ctx: any) {
  const taskId = validateSafeId(String(params.taskId), "task id");
  const store = createStore(ctx);
  const task = await store.initTask({ taskId, goal: stringOrUndefined(params.goal), parentTaskId: stringOrUndefined(params.parentTaskId) });
  await store.appendTaskEvent(taskId, { type: "task-init", state: task.state, message: task.goal ?? "delegation task initialized" });
  return {
    toolStatus: "ok",
    operation: "delegate_task_init",
    status: task.state,
    taskId,
    goal: task.goal,
    paths: { task: store.pathsForTask(taskId).taskJson, events: store.pathsForTask(taskId).eventsJsonl },
  };
}

async function executeSpawn(pi: any, params: any, signal: AbortSignal | undefined, ctx: any) {
  const cwd = requireString(params.cwd, "cwd");
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
  const role = requireString(params.role, "role");
  const profile = stringOrUndefined(params.profile) ?? role;
  const parentAgentId = validateSafeId(stringOrUndefined(params.parentAgentId) ?? defaultParentAgentId(), "parent agent id");
  const profileDefinition = resolveProfileForRole(role as any, profile as any);
  const activeToolGating = activeToolsForSpawn(pi, profileDefinition.activeTools);
  if (activeToolGating.ok === false) {
    return typedError("delegate_spawn", "active_tools_unavailable", activeToolGating.reason, { taskId, agentId, actionTaken: "no_pane_opened_no_child_pi_started" });
  }
  const packetTools = activeToolGating.tools;
  const writeScope = normalizeWriteScopeParam(params.writeScope);
  const store = createStore(ctx);
  const paths = store.pathsForAgent(taskId, agentId);

  const compiled = compileTaskPacket({
    taskId,
    agentId,
    parentAgentId,
    role: role as any,
    profile: profile as any,
    cwd,
    objective: requireString(params.objective, "objective"),
    sourcePointers: arrayOrUndefined(params.sourcePointers),
    inScope: arrayOrUndefined(params.inScope),
    outOfScope: arrayOrUndefined(params.outOfScope),
    tools: packetTools,
    writeScope,
    allowedCommands: arrayOrUndefined(params.allowedCommands) ?? [],
    evidence: arrayOrUndefined(params.evidence),
    stopConditions: arrayOrUndefined(params.stopConditions),
    tracePath: paths.transcriptLog,
    resultPath: paths.resultJson,
  });

  const runner = createPiCmuxRunner(pi, signal);
  const preflight = await new CmuxAdapter(runner, { cwd, timeoutMs: 10_000 }).ensureReady({
    storeRoot: store.root,
    env: process.env,
  });
  if (!preflight.ok) {
    return unavailableResult("delegate_spawn", params, preflight);
  }

  await store.initTask({ taskId, goal: requireString(params.objective, "objective") });
  await store.registerAgent({
    taskId,
    agentId,
    role: role as any,
    profile: profile as any,
    parentAgentId,
    cwd,
    writeScope: compiled.writeScopes,
    allowedCommands: compiled.allowedCommands,
    state: "starting",
    retention: normalizeRetention(params.retention) as any,
    layoutPolicy: normalizeLayoutPolicy(params.layoutPolicy, role) as any,
  });
  const packetPath = await store.writeAgentModelText(taskId, agentId, "task-packet.txt", compiled.text);
  await store.appendAgentEvent(taskId, agentId, { type: "agent-starting", state: "starting", message: "preflight passed; opening cmux pane", data: { packetPath } });
  await store.appendTaskEvent(taskId, { type: "agent-starting", state: "starting", message: `${agentId} starting`, data: { agentId, role, profile, packetPath } });

  const cmux = new CmuxAdapter(runner, { cwd, timeoutMs: 10_000 });
  let pane;
  try {
    pane = await cmux.newPane({ direction: params.direction ?? directionForRole(role), focus: params.focus ?? true, workspaceRef: stringOrUndefined(params.workspaceRef), windowRef: stringOrUndefined(params.windowRef) });
  } catch (error) {
    await markAgentFailed(store, taskId, agentId, "cmux new-pane failed", error);
    return typedError("delegate_spawn", "cmux_new_pane_failed", messageFrom(error), { taskId, agentId, preflight, paths: evidencePaths(store, taskId, agentId) });
  }

  if (!pane.refs.surfaceRef) {
    await markAgentFailed(store, taskId, agentId, "cmux new-pane returned no surface ref", pane.refs.raw);
    return typedError("delegate_spawn", "cmux_surface_ref_missing", "cmux new-pane did not return a usable surface ref", { taskId, agentId, cmux: pane.refs, preflight, paths: evidencePaths(store, taskId, agentId) });
  }

  const launchCommand = buildChildPiLaunchCommand({
    cwd,
    storeRoot: store.root,
    taskId,
    agentId,
    parentAgentId,
    role,
    profile,
    packetPath,
    noSession: params.noSession !== false,
  });

  await store.updateAgentManifest(taskId, agentId, {
    paneRef: pane.refs.paneRef,
    surfaceRef: pane.refs.surfaceRef,
    workspaceRef: pane.refs.workspaceRef,
    windowRef: pane.refs.windowRef,
    launchCommand,
  });

  try {
    await cmux.send({ surfaceRef: pane.refs.surfaceRef, text: launchCommand, workspaceRef: pane.refs.workspaceRef, windowRef: pane.refs.windowRef });
    await cmux.sendKey({ surfaceRef: pane.refs.surfaceRef, text: "", key: "enter", workspaceRef: pane.refs.workspaceRef, windowRef: pane.refs.windowRef });
  } catch (error) {
    await markAgentFailed(store, taskId, agentId, "child Pi startup send failed", error);
    return typedError("delegate_spawn", "child_pi_start_failed", messageFrom(error), { taskId, agentId, cmux: pane.refs, preflight, paths: evidencePaths(store, taskId, agentId) });
  }

  const status = await store.writeAgentStatus(taskId, agentId, { state: "running", message: "child Pi startup command sent to visible cmux pane" });
  await store.appendAgentEvent(taskId, agentId, { type: "agent-running", state: "running", message: "child Pi started in visible cmux pane", data: { cmux: pane.refs, packetPath } });
  await store.appendTaskEvent(taskId, { type: "agent-running", state: "running", message: `${agentId} running`, data: { agentId, role, profile, cmux: pane.refs, packetPath } });

  return {
    toolStatus: "ok",
    operation: "delegate_spawn",
    status: status.state,
    taskId,
    agentId,
    role,
    profile,
    profileKind: profileDefinition.kind,
    cmux: pane.refs,
    layout: { policy: normalizeLayoutPolicy(params.layoutPolicy, role), direction: params.direction ?? directionForRole(role), manualOverride: params.direction !== undefined },
    retention: normalizeRetention(params.retention),
    policy: {
      writeScope: compiled.writeScopes,
      allowedCommands: compiled.allowedCommands,
      tools: compiled.tools,
    },
    preflight,
    paths: evidencePaths(store, taskId, agentId),
    actionTaken: "pane_opened_child_pi_started_with_file_backed_task_packet",
  };
}

async function executeStatus(pi: any, params: any, signal: AbortSignal | undefined, ctx: any) {
  const store = createStore(ctx);
  const requestedTaskId = stringOrUndefined(params.taskId);
  const envTaskId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_TASK_ID);
  const envAgentId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID);
  const taskId = requestedTaskId ?? envTaskId;
  const agentId = stringOrUndefined(params.agentId);
  const parentAlertScope = defaultParentAlertScope(taskId, agentId, envTaskId, envAgentId);
  const result: any = {
    toolStatus: "ok",
    operation: "delegate_status",
    status: "ok",
    taskId,
    agentId,
    unreadParentAlerts: [],
  };

  if (params.includePreflight === true) {
    result.preflight = await new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: ctx.cwd, timeoutMs: 10_000 }).ensureReady({ storeRoot: store.root, env: process.env });
  }

  if (taskId === undefined) {
    result.tasks = await readIndexTasks(store.root);
    result.unreadParentAlerts = await unreadAlertsForIndex(store, result.tasks);
    return result;
  }

  result.unreadParentAlerts = await store.readParentAlerts(taskId, parentAlertScope);

  result.paths = { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson, executionMap: store.pathsForTask(taskId).executionMapJson, events: store.pathsForTask(taskId).eventsJsonl, alerts: store.pathsForTask(taskId).parentAlertsJson };
  try {
    result.task = await store.readTask(taskId);
  } catch (error) {
    return typedError("delegate_status", "task_not_found", messageFrom(error), { taskId, paths: result.paths, preflight: result.preflight });
  }
  try {
    result.registry = await store.readRegistry(taskId);
  } catch (error) {
    result.status = "degraded";
    result.degraded = appendDegraded(result.degraded, "registry_invalid", messageFrom(error), store.pathsForTask(taskId).registryJson);
    result.registry = { taskId, agents: [], degraded: true };
  }
  try {
    result.executionMap = compactExecutionMap(await store.readExecutionMap(taskId));
  } catch (error) {
    result.status = "degraded";
    result.degraded = appendDegraded(result.degraded, "execution_map_invalid", messageFrom(error), store.pathsForTask(taskId).executionMapJson);
    result.executionMap = { status: "degraded", packages: [], integrationOrder: [], reason: messageFrom(error) };
  }

  if (agentId !== undefined) {
    try {
      result.agent = await store.readAgentManifest(taskId, agentId);
      result.agentStatus = await store.readAgentStatus(taskId, agentId);
      result.paths = evidencePaths(store, taskId, agentId);
    } catch (error) {
      return typedError("delegate_status", "agent_not_found", messageFrom(error), { taskId, agentId, paths: result.paths, preflight: result.preflight });
    }
  }
  return result;
}

async function executeWait(params: any, signal: AbortSignal | undefined, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const agentId = stringOrUndefined(params.agentId);
  const timeoutMs = requireTimeoutMs(params.timeoutMs);
  const store = createStore(ctx);
  const scopeKey = waitScopeKey(taskId, agentId);

  const target = await readWaitTarget(store, taskId, agentId);
  if (!target.ok) return target.result;

  const waitEntry = await store.incrementWaitScope(taskId, scopeKey);
  if (waitEntry.consecutiveWaits > 3) {
    await store.appendTaskEvent(taskId, { type: "delegate-wait-cap-exceeded", state: target.state, message: `wait retry cap exceeded for ${scopeKey}`, data: { scopeKey, consecutiveWaits: waitEntry.consecutiveWaits } });
    return {
      toolStatus: "ok",
      operation: "delegate_wait",
      status: "alert_only",
      code: "wait_retry_cap_exceeded",
      taskId,
      agentId,
      heartbeat: target,
      route: "stop_polling_use_delegate_status_or_unread_parent_alerts",
      unreadParentAlerts: await store.readParentAlerts(taskId, { unreadOnly: true, ...(agentId !== undefined ? { agentId } : {}) }),
      paths: waitPaths(store, taskId, agentId),
    };
  }

  const immediate = await waitStopResult(store, taskId, agentId, target, "initial_state");
  if (immediate !== undefined) {
    await store.resetWaitScope(taskId, scopeKey, immediate.status);
    return immediate;
  }

  const deadline = Date.now() + timeoutMs;
  let latest = target;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      return {
        toolStatus: "ok",
        operation: "delegate_wait",
        status: "cancelled",
        code: "wait_cancelled_by_caller",
        taskId,
        agentId,
        heartbeat: latest,
        route: "caller_cancelled_watch_check_delegate_status_for_current_state",
        paths: waitPaths(store, taskId, agentId),
      };
    }
    await sleep(Math.min(250, Math.max(10, deadline - Date.now())), undefined, { signal }).catch(() => undefined);
    const next = await readWaitTarget(store, taskId, agentId);
    if (!next.ok) return next.result;
    latest = next;
    const stop = await waitStopResult(store, taskId, agentId, latest, "state_change");
    if (stop !== undefined) {
      await store.resetWaitScope(taskId, scopeKey, stop.status);
      return stop;
    }
  }

  await store.appendTaskEvent(taskId, { type: "delegate-wait-timeout", state: latest.state, message: `wait timed out after ${timeoutMs}ms`, data: { scopeKey, consecutiveWaits: waitEntry.consecutiveWaits } });
  return {
    toolStatus: "ok",
    operation: "delegate_wait",
    status: "timeout",
    code: "wait_timeout_heartbeat",
    taskId,
    agentId,
    timeoutMs,
    heartbeat: latest,
    route: "alert_only_or_repeat_wait_only_if_user_explicitly_requests",
    unreadParentAlerts: await store.readParentAlerts(taskId, { unreadOnly: true, ...(agentId !== undefined ? { agentId } : {}) }),
    paths: waitPaths(store, taskId, agentId),
  };
}

async function executeResult(pi: any, params: any, signal: AbortSignal | undefined, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const agentId = stringOrUndefined(params.agentId);
  const store = createStore(ctx);

  if (agentId !== undefined) {
    const target = await readWaitTarget(store, taskId, agentId, "delegate_result");
    if (!target.ok) return target.result;
    const record = await store.readAgentResult(taskId, agentId);
    if (!record.exists) {
      return {
        toolStatus: "ok",
        operation: "delegate_result",
        status: isTerminalState(target.state) ? "missing" : "pending",
        code: isTerminalState(target.state) ? "result_missing" : "result_pending",
        taskId,
        agentId,
        agentStatus: target,
        paths: evidencePaths(store, taskId, agentId),
      };
    }
    const compact = compactParsedAgentResult(record.parsed);
    const semantic = parsedAgentResultSemantic(compact, target);
    const retention = await maybeAutoCloseAfterResultRead(pi, signal, ctx, store, taskId, agentId, target, compact, semantic);
    return {
      toolStatus: "ok",
      operation: "delegate_result",
      status: semantic.status,
      code: semantic.code,
      reason: semantic.reason,
      taskId,
      agentId,
      agentStatus: target,
      result: compact,
      retention,
      paths: evidencePaths(store, taskId, agentId),
    };
  }

  try {
    const task = await store.readTask(taskId);
    const registry = await store.readRegistry(taskId);
    const reports = await readTaskReports(store, taskId);
    const hasAnyReport = reports.some((report: any) => report.exists);
    return {
      toolStatus: "ok",
      operation: "delegate_result",
      status: hasAnyReport ? "ok" : "missing",
      code: hasAnyReport ? undefined : "task_reports_missing",
      taskId,
      task,
      agents: registry.agents.map((agent: any) => ({ agentId: agent.agentId, role: agent.role, profile: agent.profile, state: agent.state, updatedAt: agent.updatedAt })),
      reports,
      executionMap: compactExecutionMap(await store.readExecutionMap(taskId)),
      unreadParentAlerts: await store.readParentAlerts(taskId, { unreadOnly: true }),
      paths: { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson, executionMap: store.pathsForTask(taskId).executionMapJson, alerts: store.pathsForTask(taskId).parentAlertsJson },
    };
  } catch (error) {
    return typedError("delegate_result", "task_not_found", messageFrom(error), { taskId, paths: { task: store.pathsForTask(taskId).taskJson } });
  }
}

async function executeFinish(params: any, ctx: any) {
  const store = createStore(ctx);
  const target = await lifecycleTarget(params, ctx, store, "delegate_finish");
  if (!target.ok) return target.result;
  const role = target.manifest.role;
  const validation = validateFinishPayload(params, role);
  if (!validation.ok) {
    return typedError("delegate_finish", "result_schema_invalid", validation.reason, { taskId: target.taskId, agentId: target.agentId, hint: validation.hint, paths: evidencePaths(store, target.taskId, target.agentId) });
  }
  if (role === "planning-parent" || role === "execution-parent") {
    return finishParentReport(params, validation, target, store, role);
  }

  const submittedAt = new Date().toISOString();
  const payload: any = {
    transport: "delegate_finish",
    taskId: target.taskId,
    agentId: target.agentId,
    role,
    status: validation.status,
    summary: validation.summary,
    submittedAt,
  };
  for (const key of ["filesChanged", "filesRead", "toolsUsed", "checks", "evidence", "findings", "assessment", "residualRisk", "recommendation", "uncertainty", "unverifiedAreas", "completionClaimSupported", "data"]) {
    if (params[key] !== undefined) payload[key] = params[key];
  }
  const parsed = directResultRecord(payload);
  const paths = await store.recordAgentResult(target.taskId, target.agentId, "", parsed);
  const state = stateForResultStatus(validation.status);
  const status = await store.writeAgentStatus(target.taskId, target.agentId, { state: state as any, message: validation.summary, reason: validation.status === "blocked" || validation.status === "failed" ? validation.summary : undefined });
  const event = await store.appendAgentEvent(target.taskId, target.agentId, { type: "agent-result", state: state as any, message: validation.summary, data: { resultStatus: validation.status, jsonPath: paths.jsonPath, filesChanged: payload.filesChanged, findings: payload.findings, checks: payload.checks } });
  await store.appendTaskEvent(target.taskId, { type: "agent-result", state: state as any, message: validation.summary, data: { agentId: target.agentId, resultStatus: validation.status, jsonPath: paths.jsonPath, filesChanged: payload.filesChanged, findings: payload.findings, checks: payload.checks } });
  const alert = await store.queueParentAlert(target.taskId, { agentId: target.agentId, outcome: alertOutcomeForResultStatus(validation.status) as any, state: state as any, status: validation.status, eventType: "agent-result", sourceEventId: event.eventId, message: validation.summary, evidence: { jsonPath: paths.jsonPath }, data: { resultStatus: validation.status, filesChanged: payload.filesChanged, findings: payload.findings, checks: payload.checks } });
  return {
    toolStatus: "ok",
    operation: "delegate_finish",
    status: "stored",
    taskId: target.taskId,
    agentId: target.agentId,
    resultStatus: validation.status,
    agentState: status.state,
    alert: compactAlert(alert.alert),
    actionTaken: "result_stored_parent_alerted",
    paths: { raw: paths.rawPath, json: paths.jsonPath, alerts: store.pathsForTask(target.taskId).parentAlertsJson },
  };
}

async function finishParentReport(params: any, validation: any, target: any, store: any, role: string) {
  const reportName = role === "planning-parent" ? "planning-report" : "execution-report";
  const built = buildParentReportText(params, validation, role);
  if (!built.ok) {
    return typedError("delegate_finish", "result_schema_invalid", built.reason, { taskId: target.taskId, agentId: target.agentId, hint: built.hint, paths: evidencePaths(store, target.taskId, target.agentId) });
  }
  const parsed = parseModelText(built.rawText);
  const report = role === "planning-parent" ? parsed.planningReports[0] : parsed.executionReports[0];
  if (!parsed.ok || report === undefined) {
    return typedError("delegate_finish", "report_schema_invalid", compactErrors(parsed.errors)[0]?.message ?? `${reportName} could not be parsed`, { taskId: target.taskId, agentId: target.agentId, paths: evidencePaths(store, target.taskId, target.agentId) });
  }

  const reportPaths = await store.recordTaskReport(target.taskId, reportName, report.rawText, report);
  const submittedAt = new Date().toISOString();
  const payload = {
    transport: "delegate_finish",
    taskId: target.taskId,
    agentId: target.agentId,
    role,
    status: validation.status,
    summary: validation.summary,
    reportName,
    reportStatus: report.status,
    submittedAt,
    data: params.data,
  };
  const agentParsed = directResultRecord({ ...payload, evidence: params.evidence, recommendation: params.recommendation });
  if (role === "planning-parent") agentParsed.planningReports = [report];
  else agentParsed.executionReports = [report];
  const resultPaths = await store.recordAgentResult(target.taskId, target.agentId, "", agentParsed);
  const state = stateForRecordedReport(reportName, report.status);
  const status = await store.writeAgentStatus(target.taskId, target.agentId, { state: state as any, message: validation.summary, reason: state === "blocked" || state === "failed" ? validation.summary : undefined });
  const event = await store.appendAgentEvent(target.taskId, target.agentId, { type: `task-${reportName}`, state: state as any, message: `${reportName} recorded via delegate_finish${report.status ? `: ${report.status}` : ""}`, data: { reportName, status: report.status, rawPath: reportPaths.rawPath, jsonPath: reportPaths.jsonPath, resultJsonPath: resultPaths.jsonPath } });
  await store.appendTaskEvent(target.taskId, { type: `task-${reportName}`, state: state as any, message: `${reportName} recorded via delegate_finish${report.status ? `: ${report.status}` : ""}`, data: { agentId: target.agentId, reportName, status: report.status, rawPath: reportPaths.rawPath, jsonPath: reportPaths.jsonPath, resultJsonPath: resultPaths.jsonPath } });
  const outcome = alertOutcomeForRecordedReport(reportName, report.status, state);
  const alert = outcome === undefined ? undefined : await store.queueParentAlert(target.taskId, { agentId: target.agentId, outcome: outcome as any, state: state as any, status: report.status, eventType: `task-${reportName}`, sourceEventId: event.eventId, message: validation.summary, evidence: { rawPath: reportPaths.rawPath, jsonPath: reportPaths.jsonPath }, data: { reportName, resultStatus: validation.status, reportStatus: report.status } });
  return {
    toolStatus: "ok",
    operation: "delegate_finish",
    status: "stored",
    taskId: target.taskId,
    agentId: target.agentId,
    resultStatus: validation.status,
    reportName,
    reportStatus: report.status,
    agentState: status.state,
    alert: alert ? compactAlert(alert.alert) : undefined,
    actionTaken: "report_stored_parent_alerted",
    paths: { raw: reportPaths.rawPath, json: reportPaths.jsonPath, resultJson: resultPaths.jsonPath, alerts: store.pathsForTask(target.taskId).parentAlertsJson },
  };
}

function buildParentReportText(params: any, validation: any, role: string): any {
  if (role === "planning-parent") return buildPlanningReportText(params, validation);
  return buildExecutionReportText(params, validation);
}

function buildPlanningReportText(params: any, validation: any): any {
  const reportStatus = stringOrUndefined(params.reportStatus) ?? (validation.status === "completed_with_risks" ? "ready_with_open_questions" : validation.status === "blocked" || validation.status === "failed" ? "blocked" : "ready");
  const rows: Array<[string, string | undefined]> = [
    ["STATUS", reportStatus],
    ["GOAL", reportField(params, "goal")],
    ["ARTIFACT_PATHS", reportField(params, "artifactPaths")],
    ["REVIEW_STATUS", reportField(params, "reviewStatus")],
    ["SETTLED_DECISIONS", reportField(params, "settledDecisions")],
    ["OPEN_QUESTIONS", reportField(params, "openQuestions")],
    ["EXECUTION_AUTONOMY", reportField(params, "executionAutonomy")],
    ["USER_CHECKPOINTS", reportField(params, "userCheckpoints")],
    ["EXECUTION_GUIDANCE", reportField(params, "executionGuidance")],
    ["RISKS", reportField(params, "risks")],
    ["EVIDENCE", reportField(params, "evidence")],
  ];
  return buildReportBlock("PLANNING_REPORT", rows);
}

function buildExecutionReportText(params: any, validation: any): any {
  const reportStatus = stringOrUndefined(params.reportStatus) ?? validation.status;
  const rows: Array<[string, string | undefined]> = [
    ["STATUS", reportStatus],
    ["SUMMARY", validation.summary],
    ["SOURCE_REFERENCES", reportField(params, "sourceReferences")],
    ["WORK_PACKAGES", reportField(params, "workPackages")],
    ["COMMITS", reportField(params, "commits")],
    ["REVIEWS", reportField(params, "reviews")],
    ["CHECKS", reportField(params, "checks")],
    ["FILES_CHANGED", reportField(params, "filesChanged")],
    ["PLAN_DEVIATIONS", reportField(params, "planDeviations")],
    ["STOP_CONDITIONS_HIT", reportField(params, "stopConditionsHit")],
    ["OPEN_QUESTIONS", reportField(params, "openQuestions")],
    ["RISKS", reportField(params, "risks")],
    ["FINAL_RECOMMENDATION", reportField(params, "finalRecommendation") ?? validation.summary],
    ["EVIDENCE", reportField(params, "evidence")],
  ];
  return buildReportBlock("EXECUTION_REPORT", rows);
}

function buildReportBlock(kind: string, rows: Array<[string, string | undefined]>): any {
  const missing = rows.filter(([, value]) => value === undefined || value.trim().length === 0).map(([tag]) => tag);
  if (missing.length > 0) {
    return { ok: false, reason: `${kind} delegate_finish is missing required report field(s): ${missing.join(", ")}`, hint: "Provide parent report fields as top-level camelCase parameters or under data." };
  }
  return { ok: true, rawText: [kind, ...rows.map(([tag, value]) => formatReportRow(tag, value ?? "")), `END_${kind}`].join("\n") };
}

function reportField(params: any, key: string): string | undefined {
  const value = params[key] ?? params.data?.[key];
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const parts = value.map((item) => reportValuePart(item)).filter((item) => item.length > 0);
    return parts.length > 0 ? parts.join(", ") : undefined;
  }
  return reportValuePart(value) || undefined;
}

function reportValuePart(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    if (typeof value.label === "string") {
      const ref = typeof value.outputId === "string" ? `outputId=${value.outputId}` : typeof value.path === "string" ? `path=${value.path}` : "";
      return [value.label, ref, value.note].filter((item) => typeof item === "string" && item.length > 0).join(" ");
    }
    if (typeof value.name === "string" && typeof value.status === "string") {
      return [value.name, value.status, value.outputId ? `outputId=${value.outputId}` : undefined, value.evidence ?? value.notes].filter(Boolean).join(" ");
    }
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function formatReportRow(tag: string, value: string): string {
  return `${tag}|${String(value).replace(/\r\n|\r|\n/g, " ").replace(/\|/g, "¦")}`;
}

async function executeAttention(params: any, ctx: any) {
  const store = createStore(ctx);
  const target = await lifecycleTarget(params, ctx, store, "delegate_attention");
  if (!target.ok) return target.result;
  const message = requireString(params.message, "message");
  const level = stringOrUndefined(params.level) ?? "attention";
  const terminal = params.terminal === true || level === "blocked" || level === "failed" || level === "capability_gap";
  const state = level === "blocked" || level === "capability_gap" ? "blocked" : level === "failed" ? "failed" : terminal ? "attention" : "waiting_for_parent";
  const outcome = level === "capability_gap" ? "capability_gap" : state === "blocked" ? "blocked" : state === "failed" ? "failed" : "attention";
  const status = await store.writeAgentStatus(target.taskId, target.agentId, { state: state as any, message, reason: terminal ? message : undefined });
  const event = await store.appendAgentEvent(target.taskId, target.agentId, { type: "agent-attention", state: state as any, message, data: params.data });
  await store.appendTaskEvent(target.taskId, { type: "agent-attention", state: state as any, message, data: { agentId: target.agentId, level, ...(params.data ?? {}) } });
  const alert = await store.queueParentAlert(target.taskId, { agentId: target.agentId, outcome: outcome as any, state: state as any, eventType: "agent-attention", sourceEventId: event.eventId, message, data: params.data });
  return {
    toolStatus: "ok",
    operation: "delegate_attention",
    status: status.state,
    taskId: target.taskId,
    agentId: target.agentId,
    alert: compactAlert(alert.alert),
    actionTaken: "attention_stored_parent_alerted",
    paths: evidencePaths(store, target.taskId, target.agentId),
  };
}

async function executeProgress(params: any, ctx: any) {
  const store = createStore(ctx);
  const target = await lifecycleTarget(params, ctx, store, "delegate_progress");
  if (!target.ok) return target.result;
  const message = requireString(params.message, "message");
  const event = await store.appendAgentEvent(target.taskId, target.agentId, { type: "agent-progress", state: "running", message, data: params.data });
  return {
    toolStatus: "ok",
    operation: "delegate_progress",
    status: "stored",
    taskId: target.taskId,
    agentId: target.agentId,
    eventId: event.eventId,
    actionTaken: "progress_stored_no_parent_wake",
    paths: evidencePaths(store, target.taskId, target.agentId),
  };
}

async function executeInbox(params: any, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const store = createStore(ctx);
  const scope = parentAlertScopeFromParams(params, taskId, "delegate_inbox", params.unreadOnly !== false);
  if (!scope.ok) return scope.result;
  const alerts = await store.readParentAlerts(taskId, scope.options);
  return {
    toolStatus: "ok",
    operation: "delegate_inbox",
    status: "ok",
    taskId,
    unreadOnly: params.unreadOnly !== false,
    scope: scope.label,
    count: alerts.length,
    alerts: alerts.slice(0, 25).map(compactAlert),
    paths: { alerts: store.pathsForTask(taskId).parentAlertsJson, task: store.pathsForTask(taskId).taskJson },
  };
}

async function executeAckAlert(params: any, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const alertId = requireString(params.alertId, "alertId");
  const store = createStore(ctx);
  const read = await store.markParentAlertsRead(taskId, [alertId]);
  return {
    toolStatus: "ok",
    operation: "delegate_ack_alert",
    status: read.length > 0 ? "acked" : "missing",
    taskId,
    alertId,
    count: read.length,
    alerts: read.map(compactAlert),
    paths: { alerts: store.pathsForTask(taskId).parentAlertsJson },
  };
}

async function executeAckAll(params: any, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const store = createStore(ctx);
  const scope = parentAlertScopeFromParams(params, taskId, "delegate_ack_all", true);
  if (!scope.ok) return scope.result;
  const candidates = await store.readParentAlerts(taskId, scope.options);
  const read = await store.markParentAlertsRead(taskId, candidates.map((alert: any) => alert.alertId));
  return {
    toolStatus: "ok",
    operation: "delegate_ack_all",
    status: "acked",
    taskId,
    scope: scope.label,
    count: read.length,
    alerts: read.slice(0, 25).map(compactAlert),
    paths: { alerts: store.pathsForTask(taskId).parentAlertsJson },
  };
}

async function executeUserAttention(params: any, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const summary = requireString(params.summary, "summary");
  const level = stringOrUndefined(params.level) ?? "needs_review";
  const store = createStore(ctx);
  const agentId = stringOrUndefined(params.agentId);
  const alert = await store.queueParentAlert(taskId, { agentId, outcome: "user_attention" as any, state: "attention", eventType: "user-attention", message: summary, dedupeKey: ["user", taskId, agentId ?? "task", level, summary].join(":"), data: { level } });
  if (params.notify !== false) {
    ctx?.ui?.notify?.(`Freeflow: ${summary}`, level === "blocked" || level === "needs_decision" ? "warning" : "info");
  }
  return {
    toolStatus: "ok",
    operation: "delegate_user_attention",
    status: "notified",
    taskId,
    agentId,
    level,
    alert: compactAlert(alert.alert),
    actionTaken: params.notify === false ? "user_attention_stored_without_notification" : "user_attention_stored_and_notified",
    paths: { alerts: store.pathsForTask(taskId).parentAlertsJson },
  };
}

async function executeUpdateExecutionMap(params: any, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const workPackage = params.package;
  if (!workPackage || typeof workPackage !== "object" || Array.isArray(workPackage)) {
    return typedError("delegate_update_execution_map", "invalid_package", "package must be an object", { taskId });
  }
  const store = createStore(ctx);
  const result = await store.upsertWorkPackage(taskId, workPackage);
  return {
    toolStatus: result.decision.allowed ? "ok" : "error",
    operation: "delegate_update_execution_map",
    status: result.decision.allowed ? "stored" : "blocked",
    taskId,
    decision: result.decision,
    package: result.package ? { packageId: result.package.packageId, role: result.package.role, state: result.package.state } : undefined,
    executionMap: result.executionMap ? compactExecutionMap(result.executionMap) : undefined,
    paths: { executionMap: store.pathsForTask(taskId).executionMapJson, events: store.pathsForTask(taskId).eventsJsonl },
  };
}

async function executeSend(pi: any, params: any, signal: AbortSignal | undefined, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
  const message = requireString(params.message, "message");
  const kind = stringOrUndefined(params.kind) ?? "note";
  const store = createStore(ctx);
  const target = await resolveValidTarget(store, taskId, agentId, "delegate_send");
  if (!target.ok) return target.result;
  if (isTerminalState(target.status.state)) {
    return typedError("delegate_send", "target_terminal_requires_new_attempt", "cannot send a follow-up to a terminal agent; spawn a new child or create an explicit new attempt", { taskId, agentId, state: target.status.state, paths: evidencePaths(store, taskId, agentId) });
  }

  const fileBacked = shouldUseFileBackedSend(kind, message);
  let deliveredText = boundedSingleLine(message, 240);
  let packetPath: string | undefined;
  if (fileBacked) {
    packetPath = await store.writeAgentModelText(taskId, agentId, followUpFileName(kind), message.endsWith("\n") ? message : `${message}\n`);
    deliveredText = `Read and execute ${packetPath} exactly. Do not stage, commit, push, or spawn children. Return your normal delegated RESULT/report when done.`;
  }

  const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
  try {
    await cmux.send({ surfaceRef: target.manifest.surfaceRef, text: deliveredText, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
    await cmux.sendKey({ surfaceRef: target.manifest.surfaceRef, text: "", key: "enter", workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
  } catch (error) {
    await store.appendAgentEvent(taskId, agentId, { type: "agent-send-failed", state: "attention", message: messageFrom(error), data: { kind, fileBacked, packetPath } });
    return typedError("delegate_send", "cmux_send_failed", messageFrom(error), { taskId, agentId, delivery: { kind, fileBacked, packetPath }, paths: evidencePaths(store, taskId, agentId) });
  }

  await store.appendAgentEvent(taskId, agentId, { type: "agent-send", state: target.status.state, message: `${kind} delivered`, data: { kind, fileBacked, packetPath } });
  await store.appendTaskEvent(taskId, { type: "agent-send", state: target.status.state, message: `${agentId} ${kind} delivered`, data: { agentId, kind, fileBacked, packetPath } });
  return {
    toolStatus: "ok",
    operation: "delegate_send",
    status: "sent",
    taskId,
    agentId,
    delivery: { kind, fileBacked, packetPath, instruction: deliveredText },
    cmux: { surfaceRef: target.manifest.surfaceRef, paneRef: target.manifest.paneRef, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef },
    paths: evidencePaths(store, taskId, agentId),
  };
}

async function executeCapture(pi: any, params: any, signal: AbortSignal | undefined, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
  const store = createStore(ctx);
  const target = await resolveValidTarget(store, taskId, agentId, "delegate_capture");
  if (!target.ok) return target.result;
  if (target.status.state === "closed") {
    return typedError("delegate_capture", "target_closed", "target pane is already closed; no screen capture attempted", { taskId, agentId, paths: evidencePaths(store, taskId, agentId) });
  }

  const lines = clampInteger(params.lines, 80, 1, 500);
  const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
  let captured = "";
  try {
    const outcome = await cmux.readScreen({ surfaceRef: target.manifest.surfaceRef, lines, scrollback: params.scrollback === true, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
    captured = outcome.result.stdout;
  } catch (error) {
    await store.appendAgentEvent(taskId, agentId, { type: "agent-capture-failed", state: "blocked", message: messageFrom(error), data: { previousState: target.status.state } });
    await store.appendTaskEvent(taskId, { type: "agent-capture-failed", state: "blocked", message: `${agentId} capture failed`, data: { agentId, previousState: target.status.state, error: messageFrom(error) } });
    await store.queueParentAlert(taskId, { agentId, outcome: "blocked", state: "blocked", eventType: "agent-capture-failed", message: `${agentId} capture failed`, data: { error: messageFrom(error) } });
    return typedError("delegate_capture", "cmux_read_screen_failed", messageFrom(error), { status: "blocked", taskId, agentId, paths: evidencePaths(store, taskId, agentId) });
  }

  const snapshotAt = new Date().toISOString();
  const screenPath = await store.appendAgentTextLog(taskId, agentId, "screen", `\n--- snapshot ${snapshotAt} lines=${lines} scrollback=${params.scrollback === true} ---\n${captured}\n`);
  await store.appendAgentEvent(taskId, agentId, { type: "agent-screen-captured", state: target.status.state, message: "screen snapshot saved", data: { screenPath, lines, bytes: Buffer.byteLength(captured, "utf8") } });
  return {
    toolStatus: "ok",
    operation: "delegate_capture",
    status: "captured",
    taskId,
    agentId,
    snapshot: {
      screenPath,
      capturedAt: snapshotAt,
      linesRequested: lines,
      capturedLines: splitLines(captured).length,
      bytes: Buffer.byteLength(captured, "utf8"),
      excerpt: splitLines(captured).slice(0, 3).join("\n"),
    },
    cmux: { surfaceRef: target.manifest.surfaceRef, paneRef: target.manifest.paneRef },
    paths: evidencePaths(store, taskId, agentId),
  };
}

async function executeCancel(pi: any, params: any, signal: AbortSignal | undefined, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
  const store = createStore(ctx);
  const target = await resolveValidTarget(store, taskId, agentId, "delegate_cancel");
  if (!target.ok) return target.result;

  if (target.status.state === "closed") {
    return {
      toolStatus: "ok",
      operation: "delegate_cancel",
      status: "closed",
      code: "already_closed",
      taskId,
      agentId,
      actionTaken: "no_pane_action_attempted_target_already_closed",
      paths: evidencePaths(store, taskId, agentId),
    };
  }
  if (target.status.state === "cancelled") {
    return {
      toolStatus: "ok",
      operation: "delegate_cancel",
      status: "cancelled",
      code: "already_cancelled",
      taskId,
      agentId,
      actionTaken: "no_pane_action_attempted_target_already_cancelled",
      paths: evidencePaths(store, taskId, agentId),
    };
  }

  const reconciliation = await parentDescendantReconciliationBlock(store, taskId, agentId, target.manifest, "delegate_cancel");
  if (reconciliation !== undefined) return reconciliation;

  const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
  try {
    await cmux.sendKey({ surfaceRef: target.manifest.surfaceRef, text: "", key: "ctrl-c", workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
  } catch (error) {
    await store.appendAgentEvent(taskId, agentId, { type: "agent-cancel-failed", state: "blocked", message: messageFrom(error), data: { previousState: target.status.state } });
    await store.appendTaskEvent(taskId, { type: "agent-cancel-failed", state: "blocked", message: `${agentId} cancel failed`, data: { agentId, previousState: target.status.state, error: messageFrom(error) } });
    await store.queueParentAlert(taskId, { agentId, outcome: "blocked", state: "blocked", eventType: "agent-cancel-failed", message: `${agentId} cancel failed`, data: { error: messageFrom(error) } });
    return typedError("delegate_cancel", "cmux_cancel_failed", messageFrom(error), { status: "blocked", taskId, agentId, paths: evidencePaths(store, taskId, agentId) });
  }

  const status = await store.writeAgentStatus(taskId, agentId, { state: "cancelled", message: "cancel requested; evidence preserved" });
  const event = await store.appendAgentEvent(taskId, agentId, { type: "agent-cancelled", state: "cancelled", message: "cancel requested; evidence preserved", data: { previousState: target.status.state, surfaceRef: target.manifest.surfaceRef } });
  await store.appendTaskEvent(taskId, { type: "agent-cancelled", state: "cancelled", message: `${agentId} cancelled`, data: { agentId, previousState: target.status.state, surfaceRef: target.manifest.surfaceRef } });
  const alert = await store.queueParentAlert(taskId, { agentId, outcome: "cancelled", state: "cancelled", eventType: "agent-cancelled", sourceEventId: event.eventId, message: `${agentId} cancelled`, evidence: { jsonPath: store.pathsForAgent(taskId, agentId).statusJson } });
  return {
    toolStatus: "ok",
    operation: "delegate_cancel",
    status: status.state,
    taskId,
    agentId,
    actionTaken: "cmux_ctrl_c_sent_cancelled_state_recorded_evidence_preserved",
    alert: compactAlert(alert.alert),
    cmux: { surfaceRef: target.manifest.surfaceRef, paneRef: target.manifest.paneRef, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef },
    paths: evidencePaths(store, taskId, agentId),
  };
}

async function executeRecordReport(params: any, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const reportName = requireString(params.reportName, "reportName");
  const rawText = stringOrUndefined(params.rawText) ?? "";
  if (!["planning-report", "execution-kickoff", "execution-report"].includes(reportName)) {
    return typedError("delegate_record_report", "invalid_report_name", `unsupported report name: ${reportName}`, { taskId });
  }
  const store = createStore(ctx);
  await store.initTask({ taskId });
  const parsed = parseModelText(rawText);
  const reportsByName: any = {
    "planning-report": parsed.planningReports,
    "execution-kickoff": parsed.executionKickoffs,
    "execution-report": parsed.executionReports,
  };
  const report = reportsByName[reportName]?.[0];
  if (!parsed.ok || report === undefined) {
    const errors = compactErrors(report === undefined ? [{ lineNumber: 1, message: `${reportName} block was not found` }, ...parsed.errors] : parsed.errors);
    const failureRecord = {
      ok: false,
      reportName,
      errors,
    };
    const paths = await store.recordTaskReport(taskId, reportName as any, rawText, failureRecord);
    const state = reportName === "execution-kickoff" ? "attention" : "failed";
    const event = await store.appendTaskEvent(taskId, { type: "task-report-malformed", state: state as any, message: `${reportName} malformed`, data: { reportName, rawPath: paths.rawPath, jsonPath: paths.jsonPath, errors } });
    const alert = await store.queueParentAlert(taskId, { outcome: (state === "failed" ? "failed" : "attention") as any, state: state as any, eventType: "task-report-malformed", sourceEventId: event.eventId, message: `${reportName} malformed`, evidence: { rawPath: paths.rawPath, jsonPath: paths.jsonPath } });
    return {
      toolStatus: "ok",
      operation: "delegate_record_report",
      status: state,
      code: "report_malformed",
      taskId,
      reportName,
      errors: failureRecord.errors,
      alert: compactAlert(alert.alert),
      paths: { raw: paths.rawPath, json: paths.jsonPath, alerts: store.pathsForTask(taskId).parentAlertsJson },
    };
  }

  const paths = await store.recordTaskReport(taskId, reportName as any, report.rawText, report);
  const reportStatus = report.status;
  const state = stateForRecordedReport(reportName, reportStatus);
  const outcome = alertOutcomeForRecordedReport(reportName, reportStatus, state);
  const event = await store.appendTaskEvent(taskId, { type: `task-${reportName}`, state: state as any, message: `${reportName} recorded${reportStatus ? `: ${reportStatus}` : ""}`, data: { reportName, status: reportStatus, rawPath: paths.rawPath, jsonPath: paths.jsonPath } });
  const alert = outcome === undefined ? undefined : await store.queueParentAlert(taskId, { outcome: outcome as any, state: state as any, status: reportStatus, eventType: `task-${reportName}`, sourceEventId: event.eventId, message: `${reportName} recorded${reportStatus ? `: ${reportStatus}` : ""}`, evidence: { rawPath: paths.rawPath, jsonPath: paths.jsonPath } });
  return {
    toolStatus: "ok",
    operation: "delegate_record_report",
    status: state,
    reportStatus,
    taskId,
    reportName,
    alert: alert ? compactAlert(alert.alert) : undefined,
    paths: { raw: paths.rawPath, json: paths.jsonPath, alerts: store.pathsForTask(taskId).parentAlertsJson },
  };
}

async function executeClose(pi: any, params: any, signal: AbortSignal | undefined, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
  const store = createStore(ctx);
  const target = await resolveValidTarget(store, taskId, agentId, "delegate_close");
  if (!target.ok) return target.result;

  if (target.status.state === "closed") {
    return {
      toolStatus: "ok",
      operation: "delegate_close",
      status: "closed",
      code: "already_closed",
      taskId,
      agentId,
      actionTaken: "no_pane_action_attempted_target_already_closed",
      paths: evidencePaths(store, taskId, agentId),
    };
  }

  const reconciliation = await parentDescendantReconciliationBlock(store, taskId, agentId, target.manifest, "delegate_close");
  if (reconciliation !== undefined) return reconciliation;

  const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
  try {
    await cmux.closeSurface({ surfaceRef: target.manifest.surfaceRef, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
  } catch (error) {
    await store.appendAgentEvent(taskId, agentId, { type: "agent-close-failed", state: "blocked", message: messageFrom(error), data: { previousState: target.status.state } });
    await store.appendTaskEvent(taskId, { type: "agent-close-failed", state: "blocked", message: `${agentId} close failed`, data: { agentId, previousState: target.status.state, error: messageFrom(error) } });
    await store.queueParentAlert(taskId, { agentId, outcome: "blocked", state: "blocked", eventType: "agent-close-failed", message: `${agentId} close failed`, data: { error: messageFrom(error) } });
    return typedError("delegate_close", "cmux_close_surface_failed", messageFrom(error), { status: "blocked", taskId, agentId, paths: evidencePaths(store, taskId, agentId) });
  }

  const status = await store.writeAgentStatus(taskId, agentId, { state: "closed", message: "cmux surface closed; evidence preserved" });
  await store.appendAgentEvent(taskId, agentId, { type: "agent-closed", state: "closed", message: "cmux surface closed; evidence preserved", data: { surfaceRef: target.manifest.surfaceRef } });
  await store.appendTaskEvent(taskId, { type: "agent-closed", state: "closed", message: `${agentId} closed`, data: { agentId, surfaceRef: target.manifest.surfaceRef } });
  return {
    toolStatus: "ok",
    operation: "delegate_close",
    status: status.state,
    taskId,
    agentId,
    actionTaken: target.status.state === "cancelled" ? "cmux_close_surface_called_for_cancelled_target_evidence_preserved" : "cmux_close_surface_called_evidence_preserved",
    previousState: target.status.state,
    cmux: { surfaceRef: target.manifest.surfaceRef, paneRef: target.manifest.paneRef, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef },
    paths: evidencePaths(store, taskId, agentId),
  };
}

async function readWaitTarget(store: any, taskId: string, agentId: string | undefined, operation = "delegate_wait"): Promise<any> {
  try {
    if (agentId !== undefined) {
      const status = await store.readAgentStatus(taskId, agentId);
      return {
        ok: true,
        taskId,
        agentId,
        state: status.state,
        message: status.message,
        reason: status.reason,
        updatedAt: status.updatedAt,
      };
    }
    const task = await store.readTask(taskId);
    const registry = await store.readRegistry(taskId);
    return {
      ok: true,
      taskId,
      state: task.state,
      message: task.goal,
      updatedAt: task.updatedAt,
      agents: registry.agents.map((agent: any) => ({ agentId: agent.agentId, role: agent.role, profile: agent.profile, state: agent.state, updatedAt: agent.updatedAt })),
    };
  } catch (error) {
    return { ok: false, result: typedError(operation, agentId === undefined ? "task_not_found" : "agent_not_found", messageFrom(error), { taskId, agentId }) };
  }
}

async function waitStopResult(store: any, taskId: string, agentId: string | undefined, target: any, reason: string): Promise<any | undefined> {
  const alerts = await store.readParentAlerts(taskId, { unreadOnly: true, ...(agentId !== undefined ? { agentId } : {}) });
  const terminalAlert = alerts.find((alert: any) => isTerminalAlertOutcome(alert.outcome));
  if (terminalAlert !== undefined) {
    return {
      toolStatus: "ok",
      operation: "delegate_wait",
      status: terminalAlert.outcome,
      code: "terminal_alert",
      taskId,
      agentId,
      reason,
      heartbeat: target,
      unreadParentAlerts: alerts,
      route: terminalAlert.outcome === "completed" || terminalAlert.outcome === "completed_with_risks" ? "read_delegate_result" : "inspect_delegate_result_or_status",
      paths: waitPaths(store, taskId, agentId),
    };
  }

  const terminalChild = agentId === undefined ? terminalAgentFromTarget(target) : undefined;
  if (terminalChild !== undefined) {
    return {
      toolStatus: "ok",
      operation: "delegate_wait",
      status: terminalChild.state,
      code: "terminal_child_state",
      taskId,
      agentId,
      reason,
      heartbeat: target,
      terminalAgent: terminalChild,
      unreadParentAlerts: alerts,
      route: terminalChild.state === "completed" ? "read_delegate_result" : "inspect_delegate_result_or_status",
      paths: waitPaths(store, taskId, agentId),
    };
  }

  const attentionAlert = alerts.find((alert: any) => alert.outcome === "attention" || alert.outcome === "capability_gap");
  const attentionChild = agentId === undefined ? attentionAgentFromTarget(target) : undefined;
  if (attentionAlert !== undefined || target.state === "attention" || target.state === "waiting_for_parent" || attentionChild !== undefined) {
    return {
      toolStatus: "ok",
      operation: "delegate_wait",
      status: attentionAlert?.outcome ?? "attention",
      code: attentionAlert?.outcome === "capability_gap" ? "capability_gap" : "attention_required",
      taskId,
      agentId,
      reason,
      heartbeat: target,
      attentionAgent: attentionChild,
      unreadParentAlerts: alerts,
      route: "inspect_delegate_result_or_send_bounded_steer",
      paths: waitPaths(store, taskId, agentId),
    };
  }
  if (isTerminalState(target.state)) {
    return {
      toolStatus: "ok",
      operation: "delegate_wait",
      status: target.state,
      code: "terminal_state",
      taskId,
      agentId,
      reason,
      heartbeat: target,
      unreadParentAlerts: alerts,
      route: target.state === "completed" ? "read_delegate_result" : "inspect_delegate_result_or_status",
      paths: waitPaths(store, taskId, agentId),
    };
  }
  return undefined;
}

function waitPaths(store: any, taskId: string, agentId: string | undefined) {
  if (agentId !== undefined) {
    return evidencePaths(store, taskId, agentId);
  }
  return { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson, alerts: store.pathsForTask(taskId).parentAlertsJson, waitState: store.pathsForTask(taskId).waitStateJson };
}

function defaultParentAlertScope(taskId: string | undefined, agentId: string | undefined, envTaskId: string | undefined, envAgentId: string | undefined): any {
  const scope: any = { unreadOnly: true };
  if (agentId !== undefined) {
    scope.agentId = agentId;
    return scope;
  }
  if (taskId !== undefined && envTaskId !== undefined && taskId === envTaskId && envAgentId !== undefined) {
    scope.parentAgentId = envAgentId;
  }
  return scope;
}

function parentAlertScopeFromParams(params: any, taskId: string, operation: string, unreadOnly: boolean): any {
  const explicitAgentId = stringOrUndefined(params.agentId);
  const explicitParentAgentId = stringOrUndefined(params.parentAgentId);
  const currentParentAgentId = currentDelegatedParentAgentIdForTask(taskId);
  const global = params.global === true;
  if (!global && currentParentAgentId !== undefined && explicitParentAgentId !== undefined && explicitParentAgentId !== currentParentAgentId) {
    return {
      ok: false,
      result: typedError(operation, "global_alert_scope_required", "cross-parent alert access requires global=true", { taskId, requestedParentAgentId: explicitParentAgentId, currentParentAgentId }),
    };
  }
  const options: any = { unreadOnly };
  if (explicitAgentId !== undefined) options.agentId = explicitAgentId;
  if (explicitParentAgentId !== undefined) options.parentAgentId = explicitParentAgentId;
  if (!global && currentParentAgentId !== undefined && options.parentAgentId === undefined) {
    options.parentAgentId = currentParentAgentId;
  }
  const label = options.parentAgentId !== undefined
    ? `parent:${options.parentAgentId}`
    : global
      ? "global"
      : "task";
  return { ok: true, options, label };
}

function currentDelegatedParentAgentIdForTask(taskId: string): string | undefined {
  const envTaskId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_TASK_ID);
  const envAgentId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID);
  return envTaskId === taskId ? envAgentId : undefined;
}

async function readTaskReports(store: any, taskId: string): Promise<any[]> {
  const names = ["planning-report", "execution-kickoff", "execution-report"];
  const reports = [];
  for (const name of names) {
    const record = await store.readTaskReport(taskId, name);
    reports.push({
      reportName: name,
      exists: record.exists,
      status: record.exists ? "ok" : "missing",
      report: record.exists ? compactParsedReport(record.parsed) : undefined,
      paths: { raw: record.rawPath, json: record.jsonPath },
    });
  }
  return reports;
}

async function unreadAlertsForIndex(store: any, tasks: any[]): Promise<any[]> {
  const alerts: any[] = [];
  for (const task of tasks) {
    try {
      alerts.push(...await store.readParentAlerts(task.taskId, { unreadOnly: true }));
    } catch {
      // Ignore stale/corrupt task entries in compact status output.
    }
  }
  return alerts;
}

function compactExecutionMap(executionMap: any) {
  if (!executionMap || typeof executionMap !== "object") return undefined;
  return {
    version: executionMap.version,
    taskId: executionMap.taskId,
    updatedAt: executionMap.updatedAt,
    integrationOrder: Array.isArray(executionMap.integrationOrder) ? executionMap.integrationOrder : [],
    packages: Array.isArray(executionMap.packages)
      ? executionMap.packages.map((pkg: any) => ({
        packageId: pkg.packageId,
        role: pkg.role,
        agentId: pkg.agentId,
        state: pkg.state,
        dependencies: pkg.dependencies,
        checkoutPath: pkg.checkoutPath,
        worktree: pkg.worktree ? { path: pkg.worktree.path, branchName: pkg.worktree.branchName } : undefined,
        expectedWriteScopes: pkg.expectedWriteScopes,
        allowedCommands: pkg.allowedCommands,
        review: pkg.review ? { required: pkg.review.required, status: pkg.review.status, evidenceCount: (pkg.review.evidencePaths?.length ?? 0) + (pkg.review.outputIds?.length ?? 0) } : undefined,
        verification: pkg.verification ? { required: pkg.verification.required, status: pkg.verification.status, evidenceCount: (pkg.verification.evidencePaths?.length ?? 0) + (pkg.verification.outputIds?.length ?? 0) } : undefined,
        commitCheckpoints: Array.isArray(pkg.commitCheckpoints) ? pkg.commitCheckpoints.map((checkpoint: any) => ({ checkpointId: checkpoint.checkpointId, status: checkpoint.status, intendedFiles: checkpoint.intendedFiles })) : [],
      }))
      : [],
  };
}

function compactParsedAgentResult(parsed: any) {
  const results = Array.isArray(parsed?.results) ? parsed.results.map(compactFFResult) : [];
  return {
    ok: Boolean(parsed?.ok),
    transport: parsed?.transport,
    status: results[0]?.status ?? (parsed?.ok === false ? "malformed" : "pending"),
    results,
    direct: parsed?.direct ? compactDirectResult(parsed.direct) : undefined,
    statuses: compactSignals(parsed?.statuses),
    attentions: compactSignals(parsed?.attentions),
    errors: compactErrors(parsed?.errors),
    reports: {
      planning: Array.isArray(parsed?.planningReports) ? parsed.planningReports.map(compactParsedReport) : [],
      executionKickoff: Array.isArray(parsed?.executionKickoffs) ? parsed.executionKickoffs.map(compactParsedReport) : [],
      execution: Array.isArray(parsed?.executionReports) ? parsed.executionReports.map(compactParsedReport) : [],
    },
  };
}

function compactDirectResult(direct: any) {
  if (!direct || typeof direct !== "object") return undefined;
  return {
    role: direct.role,
    status: direct.status,
    summary: direct.summary,
    filesChanged: direct.filesChanged,
    filesRead: direct.filesRead,
    checks: direct.checks,
    findings: direct.findings,
    assessment: direct.assessment,
    residualRisk: direct.residualRisk,
    recommendation: direct.recommendation,
    unverifiedAreas: direct.unverifiedAreas,
    completionClaimSupported: direct.completionClaimSupported,
    submittedAt: direct.submittedAt,
  };
}

function directResultRecord(payload: any) {
  return {
    ok: true,
    rawText: "",
    transport: "delegate_finish",
    direct: payload,
    results: [{
      kind: "FFRESULT",
      status: payload.status,
      summary: payload.summary,
      filesChanged: Array.isArray(payload.filesChanged) ? payload.filesChanged : [],
      filesRead: Array.isArray(payload.filesRead) ? payload.filesRead : [],
      toolsUsed: Array.isArray(payload.toolsUsed) ? payload.toolsUsed : [],
      checks: Array.isArray(payload.checks) ? payload.checks.map((check: any, index: number) => ({ tag: "CHECK", fields: [check.name, check.status, check.outputId ? `outputId=${check.outputId}` : "", check.evidence ?? check.notes ?? ""].filter(Boolean), lineNumber: index + 1 })) : [],
      evidence: Array.isArray(payload.evidence) ? payload.evidence.map((item: any, index: number) => ({ tag: "EVIDENCE", fields: [item.label, item.outputId ? `outputId=${item.outputId}` : `path=${item.path ?? ""}`, item.lines ? `lines=${item.lines}` : "", item.note ?? ""].filter(Boolean), lineNumber: index + 1 })) : [],
      blockers: [],
      requests: [],
      uncertainty: payload.uncertainty,
      recommendation: payload.recommendation,
    }],
    planningReports: [],
    executionKickoffs: [],
    executionReports: [],
    statuses: [],
    attentions: [],
    errors: [],
  };
}

function parsedAgentResultSemantic(compact: any, target: any): { status: string; code?: string; reason?: string } {
  if (compact.ok === false) {
    return { status: "malformed", code: "result_malformed", reason: firstErrorMessage(compact) ?? target.reason ?? target.message };
  }
  if (hasUsableParsedTerminalOutput(compact)) {
    return { status: "ok" };
  }
  if (String(target.reason ?? "").includes("malformed") || String(target.message ?? "").includes("malformed")) {
    return { status: "malformed", code: "result_malformed", reason: target.reason ?? target.message };
  }
  if (String(target.reason ?? "").includes("missing required") || String(target.message ?? "").includes("required delegated terminal output was not found")) {
    return { status: "missing", code: "required_output_missing", reason: target.reason ?? target.message };
  }
  if (isTerminalState(target.state)) {
    return { status: "missing", code: "terminal_result_missing", reason: target.reason ?? target.message };
  }
  if (target.state === "attention" || target.state === "waiting_for_parent") {
    return { status: "missing", code: "attention_without_parsed_result", reason: target.reason ?? target.message };
  }
  return { status: "pending", code: "result_pending" };
}

function hasUsableParsedTerminalOutput(compact: any): boolean {
  if (Array.isArray(compact.results) && compact.results.length > 0) return true;
  const reports = compact.reports ?? {};
  return [reports.planning, reports.executionKickoff, reports.execution].some((items) => Array.isArray(items) && items.length > 0);
}

function firstErrorMessage(compact: any): string | undefined {
  return Array.isArray(compact.errors) ? compact.errors.find((error: any) => typeof error?.message === "string")?.message : undefined;
}

function compactParsedReport(report: any) {
  if (!report || typeof report !== "object") return undefined;
  return {
    kind: report.kind,
    status: report.status,
    startLine: report.startLine,
    endLine: report.endLine,
    fields: compactFieldMap(report.fields),
  };
}

function compactFFResult(result: any) {
  return {
    status: result.status,
    summary: result.summary,
    filesChanged: result.filesChanged,
    filesRead: result.filesRead,
    toolsUsed: result.toolsUsed,
    checks: compactRows(result.checks),
    evidence: compactRows(result.evidence),
    blockers: result.blockers,
    requests: result.requests,
    uncertainty: result.uncertainty,
    recommendation: result.recommendation,
  };
}

function compactRows(rows: any): any[] {
  return Array.isArray(rows) ? rows.map((row: any) => ({ tag: row.tag, fields: row.fields, lineNumber: row.lineNumber })) : [];
}

function compactSignals(signals: any): any[] {
  return Array.isArray(signals) ? signals.map((signal: any) => ({ kind: signal.kind, state: signal.state, message: signal.message, lineNumber: signal.lineNumber, attributes: signal.attributes })) : [];
}

function compactErrors(errors: any): any[] {
  return Array.isArray(errors) ? errors.map((error: any) => ({ lineNumber: error.lineNumber, message: error.message, blockKind: error.blockKind })) : [];
}

function compactFieldMap(fields: any): any {
  if (!fields || typeof fields !== "object") return undefined;
  const output: any = {};
  for (const [key, rows] of Object.entries(fields)) {
    output[key] = Array.isArray(rows) ? rows.slice(0, 5) : rows;
  }
  return output;
}

function compactAlert(alert: any): any {
  if (!alert) return undefined;
  return {
    alertId: alert.alertId,
    taskId: alert.taskId,
    agentId: alert.agentId,
    parentAgentId: alert.parentAgentId,
    outcome: alert.outcome,
    state: alert.state,
    status: alert.status,
    message: alert.message,
    evidence: alert.evidence,
    createdAt: alert.createdAt,
  };
}

async function lifecycleTarget(params: any, ctx: any, store: any, operation: string): Promise<any> {
  const envTask = stringOrUndefined(process.env.FREEFLOW_DELEGATION_TASK_ID);
  const envAgent = stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID);
  const rawTaskId = stringOrUndefined(params.taskId) ?? envTask;
  const rawAgentId = stringOrUndefined(params.agentId) ?? envAgent;
  if (rawTaskId === undefined || rawAgentId === undefined) {
    return { ok: false, result: typedError(operation, "missing_lifecycle_identity", "taskId/agentId are required when FREEFLOW_DELEGATION_* env is absent") };
  }
  const taskId = validateSafeId(rawTaskId, "task id");
  const agentId = validateSafeId(rawAgentId, "agent id");
  if (envTask !== undefined && taskId !== envTask) {
    return { ok: false, result: typedError(operation, "lifecycle_scope_violation", `lifecycle tool can only target current task ${envTask}`, { taskId, agentId }) };
  }
  if (envAgent !== undefined && agentId !== envAgent) {
    return { ok: false, result: typedError(operation, "lifecycle_scope_violation", `lifecycle tool can only target current agent ${envAgent}`, { taskId, agentId }) };
  }
  try {
    const manifest = await store.readAgentManifest(taskId, agentId);
    const status = await store.readAgentStatus(taskId, agentId);
    return { ok: true, taskId, agentId, manifest, status };
  } catch (error) {
    return { ok: false, result: typedError(operation, "target_not_found", messageFrom(error), { taskId, agentId }) };
  }
}

function validateFinishPayload(params: any, role: string): any {
  const status = stringOrUndefined(params.status);
  if (!["completed", "completed_with_risks", "blocked", "failed", "cancelled"].includes(status ?? "")) {
    return { ok: false, reason: `top-level status must be one of completed, completed_with_risks, blocked, failed, cancelled; got ${status ?? "missing"}`, hint: "Verifier check statuses such as pass/fail belong inside checks[].status, not status." };
  }
  const summary = stringOrUndefined(params.summary);
  if (summary === undefined) {
    return { ok: false, reason: "summary is required", hint: "Provide a short result summary." };
  }
  if (role === "reviewer") {
    if (params.findings !== undefined && !Array.isArray(params.findings)) {
      return { ok: false, reason: "reviewer findings must be an array", hint: "Use findings[].severity blocking|non_blocking|question|needs_evidence." };
    }
    for (const finding of params.findings ?? []) {
      if (!finding || typeof finding !== "object" || !["blocking", "non_blocking", "question", "needs_evidence"].includes(finding.severity) || typeof finding.problem !== "string" || finding.problem.trim().length === 0) {
        return { ok: false, reason: "reviewer finding is malformed", hint: "Each finding needs severity and problem." };
      }
    }
  }
  if (role === "verifier") {
    if (!Array.isArray(params.checks) || params.checks.length === 0) {
      return { ok: false, reason: "verifier checks[] is required", hint: "Use checks[].status pass|fail|skipped|not_run. Top-level status remains completed/completed_with_risks/blocked/failed/cancelled." };
    }
    for (const check of params.checks) {
      if (!check || typeof check !== "object" || typeof check.name !== "string" || !["pass", "fail", "skipped", "not_run"].includes(check.status)) {
        return { ok: false, reason: "verifier check is malformed", hint: "Each check needs name and status pass|fail|skipped|not_run." };
      }
    }
  }
  return { ok: true, status, summary };
}

function stateForResultStatus(status: string): string {
  if (status === "completed" || status === "completed_with_risks") return "completed";
  return status;
}

function alertOutcomeForResultStatus(status: string): string {
  if (status === "completed_with_risks") return "completed_with_risks";
  return stateForResultStatus(status);
}

function stateForRecordedReport(reportName: string, status: string | undefined): string {
  if (reportName === "execution-kickoff") return "running";
  if (status === "blocked") return "blocked";
  if (status === "failed") return "failed";
  return "completed";
}

function alertOutcomeForRecordedReport(reportName: string, status: string | undefined, state: string): string | undefined {
  if (reportName === "execution-kickoff") return undefined;
  if (status === "completed_with_risks" || status === "ready_with_open_questions") return "completed_with_risks";
  if (state === "completed") return "completed";
  if (state === "blocked" || state === "failed") return state;
  return undefined;
}

function isTerminalState(state: string | undefined): boolean {
  return state === "completed" || state === "blocked" || state === "failed" || state === "cancelled" || state === "closed";
}

function isTerminalAlertOutcome(outcome: string | undefined): boolean {
  return outcome === "completed" || outcome === "completed_with_risks" || outcome === "blocked" || outcome === "failed" || outcome === "cancelled";
}

function terminalAgentFromTarget(target: any): any | undefined {
  return Array.isArray(target?.agents) ? target.agents.find((agent: any) => isTerminalState(agent.state)) : undefined;
}

function attentionAgentFromTarget(target: any): any | undefined {
  return Array.isArray(target?.agents) ? target.agents.find((agent: any) => agent.state === "attention" || agent.state === "waiting_for_parent") : undefined;
}

function waitScopeKey(taskId: string, agentId: string | undefined): string {
  return agentId === undefined ? `task:${taskId}` : `agent:${taskId}:${agentId}`;
}

async function maybeAutoCloseAfterResultRead(pi: any, signal: AbortSignal | undefined, ctx: any, store: any, taskId: string, agentId: string, target: any, compact: any, semantic: any): Promise<any> {
  let manifest;
  try {
    manifest = await store.readAgentManifest(taskId, agentId);
  } catch (error) {
    return { mode: "unknown", action: "not_closed", reason: messageFrom(error) };
  }
  const mode = manifest.retention ?? "auto";
  if (mode !== "auto") return { mode, action: "kept_open" };
  if (!shouldAutoCloseRoleResult(manifest.role, compact, semantic, target)) {
    return { mode, action: "kept_open", reason: "retention_policy_keeps_role_or_nonpassing_result" };
  }
  if (!manifest.surfaceRef || target.state === "closed") {
    return { mode, action: "not_closed", reason: "surface_missing_or_already_closed" };
  }
  const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
  try {
    await cmux.closeSurface({ surfaceRef: manifest.surfaceRef, workspaceRef: manifest.workspaceRef, windowRef: manifest.windowRef });
    await store.writeAgentStatus(taskId, agentId, { state: "closed", message: "auto-closed after parent consumed passing result; evidence preserved" });
    await store.appendAgentEvent(taskId, agentId, { type: "agent-auto-closed", state: "closed", message: "auto-closed after result consumption", data: { previousState: target.state, role: manifest.role } });
    await store.appendTaskEvent(taskId, { type: "agent-auto-closed", state: "closed", message: `${agentId} auto-closed after result consumption`, data: { agentId, role: manifest.role } });
    return { mode, action: "closed", reason: "passing_short_lived_role_result_consumed" };
  } catch (error) {
    await store.appendAgentEvent(taskId, agentId, { type: "agent-auto-close-failed", state: "attention", message: messageFrom(error), data: { previousState: target.state } });
    return { mode, action: "close_failed", reason: messageFrom(error) };
  }
}

function shouldAutoCloseRoleResult(role: string, compact: any, semantic: any, target: any): boolean {
  if (semantic.status !== "ok" || target.state !== "completed") return false;
  if (role === "researcher") return true;
  if (role === "verifier") return verifierResultPassing(compact);
  if (role === "reviewer") return reviewerResultPassing(compact);
  return false;
}

function reviewerResultPassing(compact: any): boolean {
  const findings = compact?.direct?.findings;
  if (Array.isArray(findings)) {
    return findings.every((finding: any) => finding?.severity === "non_blocking");
  }
  const first = compact?.results?.[0];
  return first?.status === "completed" && (!Array.isArray(first?.blockers) || first.blockers.length === 0);
}

function verifierResultPassing(compact: any): boolean {
  const direct = compact?.direct;
  if (direct?.completionClaimSupported === false) return false;
  const checks = Array.isArray(direct?.checks) ? direct.checks : [];
  if (checks.length > 0) return checks.every((check: any) => check?.status === "pass" || check?.status === "skipped");
  const first = compact?.results?.[0];
  return first?.status === "completed";
}

function appendDegraded(existing: any[] | undefined, code: string, reason: string, path: string): any[] {
  return [...(Array.isArray(existing) ? existing : []), { code, reason, path, recovery: "inspect the JSON file or regenerate through harness tools" }];
}

function activeToolsForSpawn(pi: any, requestedTools: readonly string[]): { ok: true; tools: string[] } | { ok: false; reason: string } {
  if (typeof pi?.setActiveTools !== "function") {
    return { ok: false, reason: "Pi active-tool API unavailable; delegated child would not have scoped tool enforcement" };
  }
  if (typeof pi?.getAllTools !== "function") {
    return { ok: true, tools: [...requestedTools] };
  }
  const allTools = pi.getAllTools();
  if (!Array.isArray(allTools)) {
    return { ok: true, tools: [...requestedTools] };
  }
  const available = new Set(allTools.map((tool: any) => tool?.name).filter((name: unknown): name is string => typeof name === "string"));
  return { ok: true, tools: requestedTools.filter((tool) => available.has(tool)) };
}

function normalizeWriteScopeParam(value: unknown): string | string[] | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") {
        throw new Error("writeScope entries must be strings");
      }
    }
    return [...value];
  }
  return stringOrUndefined(value);
}

function normalizeRetention(value: unknown): string {
  return value === "keep-open" || value === "debug" ? value : "auto";
}

function normalizeLayoutPolicy(value: unknown, role: string): string {
  if (["manual", "orchestrator", "planning", "execution", "review-dock"].includes(String(value))) return String(value);
  if (role === "orchestrator") return "orchestrator";
  if (role === "planning-parent" || role === "researcher") return "planning";
  if (role === "reviewer" || role === "verifier") return "review-dock";
  return "execution";
}

function directionForRole(role: string): "left" | "right" | "up" | "down" {
  if (role === "orchestrator") return "left";
  if (role === "reviewer" || role === "verifier") return "down";
  return "right";
}

function requireTimeoutMs(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("timeoutMs is required and must be a positive integer");
  }
  return Math.floor(numeric);
}

function createPiCmuxRunner(pi: any, signal: AbortSignal | undefined) {
  return {
    async run(command: readonly string[], options: any = {}) {
      const [program, ...args] = command;
      if (typeof program !== "string") {
        throw new Error("cmux runner command must include a program");
      }
      if (typeof pi?.exec !== "function") {
        throw new Error("Pi exec API unavailable for cmux delegation tools");
      }
      const startedAt = Date.now();
      const result = await pi.exec(program, args, { cwd: options.cwd, env: options.env, timeout: options.timeoutMs, signal: options.signal ?? signal });
      const exitCode = typeof result?.code === "number" ? result.code : null;
      const executionStatus = (signal?.aborted ? "cancelled" : result?.killed ? "timed_out" : exitCode === 0 ? "success" : "failed") as "cancelled" | "timed_out" | "success" | "failed";
      return {
        stdout: result?.stdout ?? "",
        stderr: result?.stderr ?? "",
        exitCode,
        executionStatus,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

async function parentDescendantReconciliationBlock(store: any, taskId: string, agentId: string, manifest: any, operation: string): Promise<any | undefined> {
  if (!["orchestrator", "planning-parent", "execution-parent"].includes(manifest.role)) {
    return undefined;
  }
  let registry;
  try {
    registry = await store.readRegistry(taskId);
  } catch (error) {
    return typedError(operation, "descendant_registry_unavailable", messageFrom(error), { taskId, agentId, paths: evidencePaths(store, taskId, agentId) });
  }
  const descendants = descendantAgents(registry.agents ?? [], agentId);
  if (descendants.length === 0) {
    return undefined;
  }
  const unread = await store.readParentAlerts(taskId, { unreadOnly: true, parentAgentId: agentId });
  const activeDescendants = descendants.filter((descendant: any) => !["closed", "cancelled", "completed"].includes(descendant.state));
  const unconsumedCompleted = descendants.filter((descendant: any) => descendant.state === "completed" && unread.some((alert: any) => alert.agentId === descendant.agentId));
  if (activeDescendants.length === 0 && unconsumedCompleted.length === 0) {
    return undefined;
  }
  return typedError(operation, "descendant_reconciliation_required", "parent close/cancel requires descendant close, cancel, adopt, or park decisions before the parent pane disappears", {
    status: "blocked",
    taskId,
    agentId,
    activeDescendants: activeDescendants.map(compactRegistryAgent),
    unconsumedCompleted: unconsumedCompleted.map(compactRegistryAgent),
    unreadAlertIds: unread.filter((alert: any) => descendants.some((descendant: any) => descendant.agentId === alert.agentId)).map((alert: any) => alert.alertId),
    route: "consume_or_ack_completed_results_then_close_cancel_adopt_or_park_descendants",
    paths: evidencePaths(store, taskId, agentId),
  });
}

function descendantAgents(agents: readonly any[], parentAgentId: string): any[] {
  const output: any[] = [];
  const queue = [parentAgentId];
  for (let index = 0; index < queue.length; index += 1) {
    const currentParent = queue[index];
    for (const agent of agents) {
      if (agent.parentAgentId === currentParent && !output.some((item) => item.agentId === agent.agentId)) {
        output.push(agent);
        queue.push(agent.agentId);
      }
    }
  }
  return output;
}

function compactRegistryAgent(agent: any): any {
  return { agentId: agent.agentId, role: agent.role, profile: agent.profile, state: agent.state, parentAgentId: agent.parentAgentId };
}

async function resolveValidTarget(store: any, taskId: string, agentId: string, operation: string): Promise<any> {
  try {
    const manifest = await store.readAgentManifest(taskId, agentId);
    const status = await store.readAgentStatus(taskId, agentId);
    if (!manifest.surfaceRef) {
      return { ok: false, result: typedError(operation, "target_surface_missing", "target agent has no stored cmux surface ref", { taskId, agentId, paths: evidencePaths(store, taskId, agentId) }) };
    }
    return { ok: true, manifest, status };
  } catch (error) {
    return { ok: false, result: typedError(operation, "target_not_found", messageFrom(error), { taskId, agentId, paths: evidencePaths(store, taskId, agentId) }) };
  }
}

function defaultParentAgentId(): string {
  return stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID) ?? "orchestrator";
}

function buildChildPiLaunchCommand(input: { cwd: string; storeRoot: string; taskId: string; agentId: string; parentAgentId: string; role: string; profile: string; packetPath: string; noSession: boolean }): string {
  const env = [
    ["FREEFLOW_DELEGATION_STORE", input.storeRoot],
    ["FREEFLOW_DELEGATION_TASK_ID", input.taskId],
    ["FREEFLOW_DELEGATION_AGENT_ID", input.agentId],
    ["FREEFLOW_PARENT_AGENT_ID", input.parentAgentId],
    ["FREEFLOW_AGENT_ROLE", input.role],
    ["FREEFLOW_CONTEXT_PROFILE", input.profile],
  ].map(([key, value]) => `${key}=${shellQuote(value)}`).join(" ");
  const sessionArg = input.noSession ? " --no-session" : "";
  return `cd ${shellQuote(input.cwd)} && env ${env} pi${sessionArg} --name ${shellQuote(input.agentId)} "$(cat ${shellQuote(input.packetPath)})"`;
}

async function markAgentFailed(store: any, taskId: string, agentId: string, message: string, error: unknown): Promise<void> {
  await store.writeAgentStatus(taskId, agentId, { state: "failed", message, reason: messageFrom(error) });
  const event = await store.appendAgentEvent(taskId, agentId, { type: "agent-start-failed", state: "failed", message, data: { error: messageFrom(error) } });
  await store.appendTaskEvent(taskId, { type: "agent-start-failed", state: "failed", message: `${agentId}: ${message}`, data: { agentId, error: messageFrom(error) } });
  await store.queueParentAlert(taskId, { agentId, outcome: "failed", state: "failed", eventType: "agent-start-failed", sourceEventId: event.eventId, message: `${agentId}: ${message}`, data: { error: messageFrom(error) } });
}

function createStore(ctx: any) {
  return createDelegationStore({ root: delegationRootForRepo(ctx.cwd) });
}

async function disabledByConfigResult(operation: string, ctx: any) {
  const state = await readCapabilityState(ctx?.cwd ?? process.cwd());
  if (state.delegationHarness.enabled) {
    return null;
  }
  return {
    toolStatus: "disabled_by_config",
    operation,
    status: "disabled_by_config",
    code: "disabled_by_config",
    capability: "delegation-harness",
    route: "/delegation-harness settings",
    reason: `${operation} is disabled by Freeflow config. Configure delegation-harness with /delegation-harness settings.`,
    actionTaken: "no_delegation_state_or_cmux_action_attempted",
  };
}

function unavailableResult(operation: string, params: any, preflight: any) {
  return {
    toolStatus: "ok",
    operation,
    status: "DELEGATION_UNAVAILABLE",
    code: preflight.code,
    reason: preflight.reason,
    actionTaken: preflight.actionTaken,
    safeRoutes: preflight.safeRoutes,
    preflight,
    taskId: stringOrUndefined(params.taskId),
    agentId: stringOrUndefined(params.agentId),
  };
}

function typedError(operation: string, code: string, reason: string, extra: any = {}) {
  return {
    toolStatus: "error",
    operation,
    status: "error",
    code,
    reason,
    actionTaken: "no_unrelated_pane_action_attempted",
    ...extra,
  };
}

function errorResult(operation: string, params: any, error: unknown) {
  return typedError(operation, "delegation_tool_error", messageFrom(error), {
    taskId: stringOrUndefined(params?.taskId),
    agentId: stringOrUndefined(params?.agentId),
  });
}

function toToolResult(toolName: string, result: any) {
  return {
    content: [{ type: "text", text: compactDelegationToolText(toolName, result) }],
    details: { result },
  };
}

function compactDelegationToolText(toolName: string, result: any): string {
  const head = [toolName, result?.status ?? result?.toolStatus ?? "unknown"];
  if (result?.code) head.push(String(result.code));
  if (result?.taskId) head.push(`task=${result.taskId}`);
  if (result?.agentId) head.push(`agent=${result.agentId}`);
  if (result?.role) head.push(`role=${result.role}`);
  if (result?.profile) head.push(`profile=${result.profile}`);
  if (result?.cmux?.surfaceRef) head.push(`surface=${result.cmux.surfaceRef}`);
  const lines = [row(...head)];
  if (result?.reason) lines.push(row("reason", truncateLine(result.reason, 220)));
  if (result?.actionTaken) lines.push(row("action", result.actionTaken));

  appendDecisionRows(lines, result);
  if (toolName === "delegate_status") appendStatusRows(lines, result);
  if (toolName === "delegate_wait") appendWaitRows(lines, result);
  if (toolName === "delegate_result") appendResultRows(lines, result);
  if (toolName === "delegate_send") appendSendRows(lines, result);
  if (toolName === "delegate_inbox" || toolName === "delegate_ack_alert" || toolName === "delegate_ack_all") appendAlertRows(lines, result?.alerts, "alert");
  if (result?.alert) appendAlertRows(lines, [result.alert], "alert");

  if (result?.delivery?.fileBacked) lines.push(row("delivery", "file_backed", result.delivery.packetPath ?? ""));
  else if (result?.delivery) lines.push(row("delivery", "inline"));
  if (result?.snapshot?.screenPath) lines.push(row("screen", result.snapshot.screenPath, `lines=${result.snapshot.capturedLines ?? 0}`, `bytes=${result.snapshot.bytes ?? 0}`));
  appendPathRows(lines, result?.paths);
  if (Array.isArray(result?.safeRoutes)) lines.push(row("routes", result.safeRoutes.join(",")));
  lines.push(row("details", "details.result"));
  return lines.join("\n");
}

function appendDecisionRows(lines: string[], result: any): void {
  if (result?.message) lines.push(row("message", truncateLine(result.message, 220)));
  if (result?.route) lines.push(row("route", result.route));
  if (result?.resultStatus) lines.push(row("result_status", result.resultStatus));
  if (result?.reportName || result?.reportStatus) lines.push(row("report", result.reportName, result.reportStatus));
  if (result?.agentState) lines.push(row("agent_state", result.agentState));
}

function appendStatusRows(lines: string[], result: any): void {
  if (result?.preflight) lines.push(row("preflight", result.preflight.ok === true ? "ok" : "blocked", result.preflight.code ?? result.preflight.reason));
  if (result?.task) lines.push(row("task_state", result.task.state, truncateLine(result.task.goal ?? result.task.message ?? "", 180)));
  appendAgentStateRow(lines, result?.agentStatus);
  if (result?.agent) lines.push(row("agent", result.agent.agentId, `role=${result.agent.role ?? ""}`, `profile=${result.agent.profile ?? ""}`, result.agent.parentAgentId ? `parent=${result.agent.parentAgentId}` : undefined));
  appendRegistryRows(lines, result?.registry?.agents ?? result?.tasks);
  appendExecutionMapRows(lines, result?.executionMap);
  appendAlertRows(lines, result?.unreadParentAlerts, "unread_alert");
}

function appendWaitRows(lines: string[], result: any): void {
  appendAgentStateRow(lines, result?.heartbeat, "heartbeat");
  if (result?.terminalAgent) lines.push(row("terminal_agent", result.terminalAgent.agentId, result.terminalAgent.state, truncateLine(result.terminalAgent.message ?? "", 160)));
  if (result?.attentionAgent) lines.push(row("attention_agent", result.attentionAgent.agentId, result.attentionAgent.state, truncateLine(result.attentionAgent.message ?? "", 160)));
  appendAlertRows(lines, result?.unreadParentAlerts, "unread_alert");
}

function appendResultRows(lines: string[], result: any): void {
  appendAgentStateRow(lines, result?.agentStatus);
  if (result?.retention?.action) lines.push(row("retention", result.retention.action, result.retention.reason));
  appendParsedResultRows(lines, result?.result);
  appendTaskReportsRows(lines, result?.reports);
  appendRegistryRows(lines, result?.agents);
  appendExecutionMapRows(lines, result?.executionMap);
  appendAlertRows(lines, result?.unreadParentAlerts, "unread_alert");
}

function appendSendRows(lines: string[], result: any): void {
  if (result?.state) lines.push(row("target_state", result.state));
  if (result?.delivery?.packetPath) lines.push(row("follow_up", result.delivery.kind, result.delivery.packetPath));
}

function appendParsedResultRows(lines: string[], result: any): void {
  if (!result || typeof result !== "object") return;
  lines.push(row("parsed_result", result.status, result.transport ? `transport=${result.transport}` : undefined));
  const direct = result.direct;
  const primary = Array.isArray(result.results) ? result.results[0] : undefined;
  const summary = direct?.summary ?? primary?.summary;
  if (summary) lines.push(row("summary", truncateLine(summary, 260)));
  if (direct?.assessment) lines.push(row("assessment", truncateLine(direct.assessment, 260)));
  appendFileRows(lines, "file_changed", direct?.filesChanged ?? primary?.filesChanged);
  appendCheckRows(lines, direct?.checks ?? primary?.checks);
  appendEvidenceRows(lines, direct?.evidence ?? primary?.evidence);
  appendFindingRows(lines, direct?.findings);
  appendCompactItems(lines, "blocking", primary?.blockers);
  appendCompactItems(lines, "request", primary?.requests);
  if (direct?.residualRisk ?? primary?.uncertainty) lines.push(row("residual_risk", truncateLine(direct?.residualRisk ?? primary?.uncertainty, 260)));
  if (direct?.recommendation ?? primary?.recommendation) lines.push(row("recommendation", truncateLine(direct?.recommendation ?? primary?.recommendation, 260)));
  appendCompactReportGroup(lines, "planning", result.reports?.planning);
  appendCompactReportGroup(lines, "execution_kickoff", result.reports?.executionKickoff);
  appendCompactReportGroup(lines, "execution", result.reports?.execution);
  appendCompactItems(lines, "status_signal", result.statuses);
  appendCompactItems(lines, "attention", result.attentions);
  appendCompactItems(lines, "parse_error", result.errors);
}

function appendTaskReportsRows(lines: string[], reports: any): void {
  if (!Array.isArray(reports)) return;
  for (const report of reports.slice(0, 5)) {
    lines.push(row("report", report.reportName, report.exists ? "exists" : "missing", report.report?.status));
  }
  if (reports.length > 5) lines.push(row("reports_more", reports.length - 5));
}

function appendAgentStateRow(lines: string[], status: any, label = "agent_state"): void {
  if (!status) return;
  lines.push(row(label, status.state, status.agentId ? `agent=${status.agentId}` : undefined, truncateLine(status.message ?? status.reason ?? "", 180)));
}

function appendRegistryRows(lines: string[], agents: any): void {
  if (!Array.isArray(agents)) return;
  const counts = countBy(agents, (agent: any) => agent.state ?? "unknown");
  lines.push(row("agents", `total=${agents.length}`, ...Object.entries(counts).map(([state, count]) => `${state}=${count}`)));
  for (const agent of agents.slice(0, 6)) {
    lines.push(row("agent", agent.agentId ?? agent.taskId, agent.role, agent.profile, agent.state));
  }
  if (agents.length > 6) lines.push(row("agents_more", agents.length - 6));
}

function appendExecutionMapRows(lines: string[], executionMap: any): void {
  const packages = executionMap?.packages;
  if (!Array.isArray(packages)) return;
  const counts = countBy(packages, (pkg: any) => pkg.state ?? "unknown");
  lines.push(row("packages", `total=${packages.length}`, ...Object.entries(counts).map(([state, count]) => `${state}=${count}`)));
  for (const pkg of packages.slice(0, 5)) {
    lines.push(row("package", pkg.packageId, pkg.role, pkg.agentId ? `agent=${pkg.agentId}` : undefined, pkg.state));
  }
  if (packages.length > 5) lines.push(row("packages_more", packages.length - 5));
}

function appendAlertRows(lines: string[], alerts: any, label: string): void {
  if (!Array.isArray(alerts)) return;
  lines.push(row(`${label}s`, `count=${alerts.length}`));
  for (const alert of alerts.slice(0, 5)) {
    lines.push(row(label, alert.outcome ?? alert.status ?? alert.state, alert.agentId ? `agent=${alert.agentId}` : undefined, alert.alertId ? `id=${alert.alertId}` : undefined, truncateLine(alert.message ?? "", 220)));
  }
  if (alerts.length > 5) lines.push(row(`${label}s_more`, alerts.length - 5));
}

function appendFileRows(lines: string[], label: string, files: any): void {
  if (!Array.isArray(files)) return;
  const countLabel = label === "file_changed" ? "files_changed" : `${label}s`;
  lines.push(row(countLabel, `count=${files.length}`));
  for (const file of files.slice(0, 5)) lines.push(row(label, file));
  if (files.length > 5) lines.push(row(`${countLabel}_more`, files.length - 5));
}

function appendCheckRows(lines: string[], checks: any): void {
  if (!Array.isArray(checks)) return;
  lines.push(row("checks", `count=${checks.length}`));
  for (const check of checks.slice(0, 6)) lines.push(row("check", ...compactCheckFields(check)));
  if (checks.length > 6) lines.push(row("checks_more", checks.length - 6));
}

function compactCheckFields(check: any): string[] {
  if (Array.isArray(check?.fields)) return check.fields.map((field: any) => truncateLine(String(field), 180));
  const outputId = check?.outputId ? `outputId=${check.outputId}` : undefined;
  return [check?.name, check?.status, outputId, check?.evidence ?? check?.notes].filter(Boolean).map((field: any) => truncateLine(String(field), 180));
}

function appendEvidenceRows(lines: string[], evidence: any): void {
  if (!Array.isArray(evidence)) return;
  lines.push(row("evidence_items", `count=${evidence.length}`));
  for (const item of evidence.slice(0, 5)) lines.push(row("evidence", ...compactEvidenceFields(item)));
  if (evidence.length > 5) lines.push(row("evidence_more", evidence.length - 5));
}

function compactEvidenceFields(item: any): string[] {
  if (Array.isArray(item?.fields)) return item.fields.map((field: any) => truncateLine(String(field), 180));
  return [item?.label, item?.outputId ? `outputId=${item.outputId}` : item?.path ? `path=${item.path}` : undefined, item?.lines ? `lines=${item.lines}` : undefined, item?.note].filter(Boolean).map((field: any) => truncateLine(String(field), 180));
}

function appendFindingRows(lines: string[], findings: any): void {
  if (!Array.isArray(findings)) return;
  const blocking = findings.filter((finding: any) => String(finding?.severity ?? "").includes("block"));
  lines.push(row("findings", `count=${findings.length}`, blocking.length > 0 ? `blocking=${blocking.length}` : undefined));
  for (const finding of findings.slice(0, 5)) {
    lines.push(row("finding", finding.severity, finding.location, truncateLine(finding.problem ?? finding.recommendation ?? "", 220)));
  }
  if (findings.length > 5) lines.push(row("findings_more", findings.length - 5));
}

function appendCompactReportGroup(lines: string[], label: string, reports: any): void {
  if (!Array.isArray(reports) || reports.length === 0) return;
  for (const report of reports.slice(0, 3)) lines.push(row("report", label, report.status, report.kind));
  if (reports.length > 3) lines.push(row("reports_more", label, reports.length - 3));
}

function appendCompactItems(lines: string[], label: string, items: any): void {
  if (!Array.isArray(items) || items.length === 0) return;
  lines.push(row(`${label}s`, `count=${items.length}`));
  for (const item of items.slice(0, 4)) lines.push(row(label, compactItemText(item)));
  if (items.length > 4) lines.push(row(`${label}s_more`, items.length - 4));
}

function compactItemText(item: any): string {
  if (Array.isArray(item?.fields)) return item.fields.map((field: any) => String(field)).join("|");
  if (item?.message) return truncateLine(String(item.message), 220);
  if (item?.problem) return truncateLine(String(item.problem), 220);
  if (item?.summary) return truncateLine(String(item.summary), 220);
  if (item?.kind || item?.state) return truncateLine([item.kind, item.state].filter(Boolean).join(" "), 220);
  return truncateLine(String(item), 220);
}

function appendPathRows(lines: string[], paths: any): void {
  if (!paths || typeof paths !== "object") return;
  if (paths.taskPacket) lines.push(row("packet", paths.taskPacket));
  if (paths.executionMap) lines.push(row("execution_map", paths.executionMap));
  if (paths.status) lines.push(row("status", paths.status));
  if (paths.resultJson) lines.push(row("result", paths.resultJson));
  if (paths.alerts) lines.push(row("alerts", paths.alerts));
}

function countBy(items: any[], keyFn: (item: any) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function row(...fields: unknown[]): string {
  return fields.filter((field) => field !== undefined && field !== null && String(field).length > 0).map((field) => String(field).replace(/\r?\n/g, " ").replace(/\|/g, "¦")).join("|");
}

function evidencePaths(store: any, taskId: string, agentId: string) {
  const paths = store.pathsForAgent(taskId, agentId);
  return {
    task: store.pathsForTask(taskId).taskJson,
    registry: store.pathsForTask(taskId).registryJson,
    executionMap: store.pathsForTask(taskId).executionMapJson,
    manifest: paths.manifestJson,
    status: paths.statusJson,
    taskPacket: paths.taskPacketRaw,
    resultRaw: paths.resultRaw,
    resultJson: paths.resultJson,
    transcript: paths.transcriptLog,
    screen: paths.screenLog,
    events: paths.eventsJsonl,
    alerts: store.pathsForTask(taskId).parentAlertsJson,
    waitState: store.pathsForTask(taskId).waitStateJson,
  };
}

async function readIndexTasks(root: string) {
  try {
    const index = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
    return Array.isArray(index.tasks) ? index.tasks : [];
  } catch {
    return [];
  }
}

function shouldUseFileBackedSend(kind: string, message: string): boolean {
  return kind === "follow_up" || kind === "fix" || kind === "task_packet" || message.includes("\n") || message.length > 240;
}

function followUpFileName(kind: string): string {
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z_-]/g, "-");
  return `${kind}-${stamp}.txt`;
}

function boundedSingleLine(message: string, maxLength: number): string {
  const line = message.replace(/\s+/g, " ").trim();
  return line.length <= maxLength ? line : `${line.slice(0, maxLength - 1)}…`;
}

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function arrayOrUndefined(value: unknown): any[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function truncateLine(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
