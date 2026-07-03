import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CmuxAdapter,
  assertLeafProfilesDoNotIncludeDelegationTools,
  compileTaskPacket,
  createDelegationStore,
  delegationRootForRepo,
  resolveProfileForRole,
  shellQuote,
  validateSafeId,
} from "../../../delegation/dist/index.js";
import { renderDelegationCall, renderDelegationResult } from "./renderers.js";

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
    writeScope: STRING_SCHEMA,
    allowedCommands: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    sourcePointers: { type: "array", items: SOURCE_POINTER_SCHEMA },
    inScope: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    outOfScope: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    evidence: { type: "array", items: EVIDENCE_POINTER_SCHEMA },
    stopConditions: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
    windowRef: STRING_SCHEMA,
    workspaceRef: STRING_SCHEMA,
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

export function registerDelegationTools(pi: any): void {
  assertLeafProfilesDoNotIncludeDelegationTools();
  const toolDefinitions = [
    delegationTool("delegate_task_init", "Delegate Task Init", "Create repo-local delegation task state for an orchestrator or parent.", TASK_INIT_PARAMETERS, executeTaskInit),
    delegationTool("delegate_spawn", "Delegate Spawn", "Open a visible cmux pane and start a delegated Pi child after fail-closed preflight.", SPAWN_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeSpawn(pi, params, signal, ctx)),
    delegationTool("delegate_status", "Delegate Status", "Return compact delegation task/agent/preflight status with no raw transcript dump.", STATUS_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeStatus(pi, params, signal, ctx)),
    delegationTool("delegate_wait", "Delegate Wait", "P4 lifecycle surface placeholder for explicit bounded watch mode.", TARGET_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => lifecyclePending("delegate_wait", params, ctx, "P4 owns bounded watch mode, timeout heartbeat, and retry caps.")),
    delegationTool("delegate_result", "Delegate Result", "P4 lifecycle surface placeholder for compact parsed result retrieval.", TARGET_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => lifecyclePending("delegate_result", params, ctx, "P4 owns result/report retrieval lifecycle beyond stored pointers.")),
    delegationTool("delegate_send", "Delegate Send", "Send a bounded note or file-backed follow-up/fix packet to a delegated pane.", SEND_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeSend(pi, params, signal, ctx)),
    delegationTool("delegate_capture", "Delegate Capture", "Capture a bounded cmux screen snapshot and store it as evidence without dumping raw screens.", CAPTURE_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeCapture(pi, params, signal, ctx)),
    delegationTool("delegate_cancel", "Delegate Cancel", "P4 lifecycle surface placeholder for cancellation semantics.", CLOSE_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => lifecyclePending("delegate_cancel", params, ctx, "P4 owns complete cancellation semantics; no pane action was attempted.")),
    delegationTool("delegate_close", "Delegate Close", "Close a valid delegated cmux surface while preserving delegation evidence.", CLOSE_PARAMETERS, (params: any, signal: AbortSignal | undefined, ctx: any) => executeClose(pi, params, signal, ctx)),
    delegationTool("delegate_record_report", "Delegate Record Report", "P4 lifecycle surface placeholder for parent report recording.", REPORT_PARAMETERS, (params: any, _signal: AbortSignal | undefined, ctx: any) => lifecyclePending("delegate_record_report", params, ctx, "P4 owns parent report lifecycle and alerting.")),
  ];

  for (const definition of toolDefinitions) {
    pi.registerTool(definition);
  }
}

function delegationTool(name: string, label: string, description: string, parameters: any, handler: (params: any, signal: AbortSignal | undefined, ctx: any) => Promise<any>) {
  return {
    name,
    label,
    description,
    promptSnippet: `${description} Use only from orchestrator or parent delegation profiles; leaf profiles must not call delegation tools.`,
    promptGuidelines: [
      `Use ${name} only for orchestrator/parent delegation control, not for tiny inline work.`,
      `${name} returns compact state and evidence pointers; do not expect raw child transcripts or raw screen dumps.`,
    ],
    parameters,
    async execute(_toolCallId: string, params: any, signal: AbortSignal | undefined, _onUpdate: unknown, ctx: any) {
      try {
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
  const parentAgentId = validateSafeId(stringOrUndefined(params.parentAgentId) ?? "orchestrator", "parent agent id");
  const profileDefinition = resolveProfileForRole(role as any, profile as any);
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
    writeScope: stringOrUndefined(params.writeScope),
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
    writeScope: stringOrUndefined(params.writeScope),
    allowedCommands: compiled.allowedCommands,
    state: "starting",
  });
  const packetPath = await store.writeAgentModelText(taskId, agentId, "task-packet.txt", compiled.text);
  await store.appendAgentEvent(taskId, agentId, { type: "agent-starting", state: "starting", message: "preflight passed; opening cmux pane", data: { packetPath } });
  await store.appendTaskEvent(taskId, { type: "agent-starting", state: "starting", message: `${agentId} starting`, data: { agentId, role, profile, packetPath } });

  const cmux = new CmuxAdapter(runner, { cwd, timeoutMs: 10_000 });
  let pane;
  try {
    pane = await cmux.newPane({ direction: params.direction ?? "right", focus: params.focus ?? true, workspaceRef: stringOrUndefined(params.workspaceRef), windowRef: stringOrUndefined(params.windowRef) });
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
  const taskId = stringOrUndefined(params.taskId);
  const agentId = stringOrUndefined(params.agentId);
  const result: any = {
    toolStatus: "ok",
    operation: "delegate_status",
    status: "ok",
    taskId,
    agentId,
    unreadParentAlerts: { status: "lifecycle_pending", code: "not_implemented_until_P4" },
  };

  if (params.includePreflight === true) {
    result.preflight = await new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: ctx.cwd, timeoutMs: 10_000 }).ensureReady({ storeRoot: store.root, env: process.env });
  }

  if (taskId === undefined) {
    result.tasks = await readIndexTasks(store.root);
    return result;
  }

  result.paths = { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson, events: store.pathsForTask(taskId).eventsJsonl };
  try {
    result.task = await store.readTask(taskId);
    result.registry = await store.readRegistry(taskId);
  } catch (error) {
    return typedError("delegate_status", "task_not_found", messageFrom(error), { taskId, paths: result.paths, preflight: result.preflight });
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

async function executeSend(pi: any, params: any, signal: AbortSignal | undefined, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
  const message = requireString(params.message, "message");
  const kind = stringOrUndefined(params.kind) ?? "note";
  const store = createStore(ctx);
  const target = await resolveValidTarget(store, taskId, agentId, "delegate_send");
  if (!target.ok) return target.result;

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

  const lines = clampInteger(params.lines, 80, 1, 500);
  const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
  let captured = "";
  try {
    const outcome = await cmux.readScreen({ surfaceRef: target.manifest.surfaceRef, lines, scrollback: params.scrollback === true, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
    captured = outcome.result.stdout;
  } catch (error) {
    await store.appendAgentEvent(taskId, agentId, { type: "agent-capture-failed", state: target.status.state, message: messageFrom(error) });
    return typedError("delegate_capture", "cmux_read_screen_failed", messageFrom(error), { taskId, agentId, paths: evidencePaths(store, taskId, agentId) });
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

async function executeClose(pi: any, params: any, signal: AbortSignal | undefined, ctx: any) {
  const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
  const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
  const store = createStore(ctx);
  const target = await resolveValidTarget(store, taskId, agentId, "delegate_close");
  if (!target.ok) return target.result;

  const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
  try {
    await cmux.closeSurface({ surfaceRef: target.manifest.surfaceRef, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
  } catch (error) {
    await store.appendAgentEvent(taskId, agentId, { type: "agent-close-failed", state: target.status.state, message: messageFrom(error) });
    return typedError("delegate_close", "cmux_close_surface_failed", messageFrom(error), { taskId, agentId, paths: evidencePaths(store, taskId, agentId) });
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
    actionTaken: "cmux_close_surface_called_evidence_preserved",
    cmux: { surfaceRef: target.manifest.surfaceRef, paneRef: target.manifest.paneRef, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef },
    lifecycle: { status: "minimal_p3_transition", deferred: "P4 owns full cancel/close lifecycle and parent alert semantics." },
    paths: evidencePaths(store, taskId, agentId),
  };
}

async function lifecyclePending(operation: string, params: any, ctx: any, reason: string) {
  const store = createStore(ctx);
  const taskId = stringOrUndefined(params.taskId);
  const agentId = stringOrUndefined(params.agentId);
  return {
    toolStatus: "ok",
    operation,
    status: "lifecycle_pending",
    code: "not_implemented_until_P4",
    reason,
    actionTaken: "no_pane_action_attempted",
    taskId,
    agentId,
    paths: taskId && agentId ? evidencePaths(store, taskId, agentId) : taskId ? { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson } : { store: store.root },
  };
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
  await store.appendAgentEvent(taskId, agentId, { type: "agent-start-failed", state: "failed", message, data: { error: messageFrom(error) } });
  await store.appendTaskEvent(taskId, { type: "agent-start-failed", state: "failed", message: `${agentId}: ${message}`, data: { agentId, error: messageFrom(error) } });
}

function createStore(ctx: any) {
  return createDelegationStore({ root: delegationRootForRepo(ctx.cwd) });
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
  if (result?.delivery?.fileBacked) lines.push(row("delivery", "file_backed", result.delivery.packetPath ?? ""));
  if (result?.snapshot?.screenPath) lines.push(row("screen", result.snapshot.screenPath, `lines=${result.snapshot.capturedLines ?? 0}`, `bytes=${result.snapshot.bytes ?? 0}`));
  if (result?.paths?.taskPacket) lines.push(row("packet", result.paths.taskPacket));
  if (result?.paths?.status) lines.push(row("status", result.paths.status));
  if (Array.isArray(result?.safeRoutes)) lines.push(row("routes", result.safeRoutes.join(",")));
  lines.push(row("details", "details.result"));
  return lines.join("\n");
}

function row(...fields: unknown[]): string {
  return fields.filter((field) => field !== undefined && field !== null && String(field).length > 0).map((field) => String(field).replace(/\r?\n/g, " ").replace(/\|/g, "¦")).join("|");
}

function evidencePaths(store: any, taskId: string, agentId: string) {
  const paths = store.pathsForAgent(taskId, agentId);
  return {
    task: store.pathsForTask(taskId).taskJson,
    registry: store.pathsForTask(taskId).registryJson,
    manifest: paths.manifestJson,
    status: paths.statusJson,
    taskPacket: paths.taskPacketRaw,
    resultRaw: paths.resultRaw,
    resultJson: paths.resultJson,
    transcript: paths.transcriptLog,
    screen: paths.screenLog,
    events: paths.eventsJsonl,
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
