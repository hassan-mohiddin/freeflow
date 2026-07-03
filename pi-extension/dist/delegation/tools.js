import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { CmuxAdapter, assertLeafProfilesDoNotIncludeDelegationTools, compileTaskPacket, createDelegationStore, delegationRootForRepo, parseModelText, resolveProfileForRole, shellQuote, validateSafeId, } from "../../../delegation/dist/index.js";
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
export function registerDelegationTools(pi) {
    assertLeafProfilesDoNotIncludeDelegationTools();
    const toolDefinitions = [
        delegationTool("delegate_task_init", "Delegate Task Init", "Create repo-local delegation task state for an orchestrator or parent.", TASK_INIT_PARAMETERS, executeTaskInit),
        delegationTool("delegate_spawn", "Delegate Spawn", "Open a visible cmux pane and start a delegated Pi child after fail-closed preflight.", SPAWN_PARAMETERS, (params, signal, ctx) => executeSpawn(pi, params, signal, ctx)),
        delegationTool("delegate_status", "Delegate Status", "Return compact delegation task/agent/preflight status with no raw transcript dump.", STATUS_PARAMETERS, (params, signal, ctx) => executeStatus(pi, params, signal, ctx)),
        delegationTool("delegate_wait", "Delegate Wait", "Explicit bounded watch mode for terminal/attention lifecycle changes; timeout is required.", WAIT_PARAMETERS, (params, signal, ctx) => executeWait(params, signal, ctx)),
        delegationTool("delegate_result", "Delegate Result", "Return compact parsed result/report pointers without raw transcript injection.", TARGET_PARAMETERS, (params, _signal, ctx) => executeResult(params, ctx)),
        delegationTool("delegate_send", "Delegate Send", "Send a bounded note or file-backed follow-up/fix packet to a delegated pane.", SEND_PARAMETERS, (params, signal, ctx) => executeSend(pi, params, signal, ctx)),
        delegationTool("delegate_capture", "Delegate Capture", "Capture a bounded cmux screen snapshot and store it as evidence without dumping raw screens.", CAPTURE_PARAMETERS, (params, signal, ctx) => executeCapture(pi, params, signal, ctx)),
        delegationTool("delegate_cancel", "Delegate Cancel", "Cancel a valid delegated target without deleting evidence.", CLOSE_PARAMETERS, (params, signal, ctx) => executeCancel(pi, params, signal, ctx)),
        delegationTool("delegate_close", "Delegate Close", "Close a valid delegated cmux surface while preserving delegation evidence.", CLOSE_PARAMETERS, (params, signal, ctx) => executeClose(pi, params, signal, ctx)),
        delegationTool("delegate_record_report", "Delegate Record Report", "Record planning/execution reports and kickoff blocks with deterministic parser evidence.", REPORT_PARAMETERS, (params, _signal, ctx) => executeRecordReport(params, ctx)),
    ];
    for (const definition of toolDefinitions) {
        pi.registerTool(definition);
    }
}
function delegationTool(name, label, description, parameters, handler) {
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
        async execute(_toolCallId, params, signal, _onUpdate, ctx) {
            try {
                const result = await handler(params ?? {}, signal, ctx);
                return toToolResult(name, result);
            }
            catch (error) {
                return toToolResult(name, errorResult(name, params, error));
            }
        },
        renderCall(args, theme) {
            return renderDelegationCall(name, args, theme);
        },
        renderResult(result, options, theme) {
            return renderDelegationResult(name, result, options, theme);
        },
    };
}
async function executeTaskInit(params, _signal, ctx) {
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
async function executeSpawn(pi, params, signal, ctx) {
    const cwd = requireString(params.cwd, "cwd");
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
    const role = requireString(params.role, "role");
    const profile = stringOrUndefined(params.profile) ?? role;
    const parentAgentId = validateSafeId(stringOrUndefined(params.parentAgentId) ?? defaultParentAgentId(), "parent agent id");
    const profileDefinition = resolveProfileForRole(role, profile);
    const store = createStore(ctx);
    const paths = store.pathsForAgent(taskId, agentId);
    const compiled = compileTaskPacket({
        taskId,
        agentId,
        parentAgentId,
        role: role,
        profile: profile,
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
        role: role,
        profile: profile,
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
    }
    catch (error) {
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
    }
    catch (error) {
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
async function executeStatus(pi, params, signal, ctx) {
    const store = createStore(ctx);
    const taskId = stringOrUndefined(params.taskId);
    const agentId = stringOrUndefined(params.agentId);
    const result = {
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
    result.unreadParentAlerts = await store.readParentAlerts(taskId, { unreadOnly: true, ...(agentId !== undefined ? { agentId } : {}) });
    result.paths = { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson, events: store.pathsForTask(taskId).eventsJsonl, alerts: store.pathsForTask(taskId).parentAlertsJson };
    try {
        result.task = await store.readTask(taskId);
        result.registry = await store.readRegistry(taskId);
    }
    catch (error) {
        return typedError("delegate_status", "task_not_found", messageFrom(error), { taskId, paths: result.paths, preflight: result.preflight });
    }
    if (agentId !== undefined) {
        try {
            result.agent = await store.readAgentManifest(taskId, agentId);
            result.agentStatus = await store.readAgentStatus(taskId, agentId);
            result.paths = evidencePaths(store, taskId, agentId);
        }
        catch (error) {
            return typedError("delegate_status", "agent_not_found", messageFrom(error), { taskId, agentId, paths: result.paths, preflight: result.preflight });
        }
    }
    return result;
}
async function executeWait(params, signal, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = stringOrUndefined(params.agentId);
    const timeoutMs = requireTimeoutMs(params.timeoutMs);
    const store = createStore(ctx);
    const scopeKey = waitScopeKey(taskId, agentId);
    const target = await readWaitTarget(store, taskId, agentId);
    if (!target.ok)
        return target.result;
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
        if (!next.ok)
            return next.result;
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
async function executeResult(params, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = stringOrUndefined(params.agentId);
    const store = createStore(ctx);
    if (agentId !== undefined) {
        const target = await readWaitTarget(store, taskId, agentId, "delegate_result");
        if (!target.ok)
            return target.result;
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
            paths: evidencePaths(store, taskId, agentId),
        };
    }
    try {
        const task = await store.readTask(taskId);
        const registry = await store.readRegistry(taskId);
        const reports = await readTaskReports(store, taskId);
        const hasAnyReport = reports.some((report) => report.exists);
        return {
            toolStatus: "ok",
            operation: "delegate_result",
            status: hasAnyReport ? "ok" : "missing",
            code: hasAnyReport ? undefined : "task_reports_missing",
            taskId,
            task,
            agents: registry.agents.map((agent) => ({ agentId: agent.agentId, role: agent.role, profile: agent.profile, state: agent.state, updatedAt: agent.updatedAt })),
            reports,
            unreadParentAlerts: await store.readParentAlerts(taskId, { unreadOnly: true }),
            paths: { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson, alerts: store.pathsForTask(taskId).parentAlertsJson },
        };
    }
    catch (error) {
        return typedError("delegate_result", "task_not_found", messageFrom(error), { taskId, paths: { task: store.pathsForTask(taskId).taskJson } });
    }
}
async function executeSend(pi, params, signal, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
    const message = requireString(params.message, "message");
    const kind = stringOrUndefined(params.kind) ?? "note";
    const store = createStore(ctx);
    const target = await resolveValidTarget(store, taskId, agentId, "delegate_send");
    if (!target.ok)
        return target.result;
    const fileBacked = shouldUseFileBackedSend(kind, message);
    let deliveredText = boundedSingleLine(message, 240);
    let packetPath;
    if (fileBacked) {
        packetPath = await store.writeAgentModelText(taskId, agentId, followUpFileName(kind), message.endsWith("\n") ? message : `${message}\n`);
        deliveredText = `Read and execute ${packetPath} exactly. Do not stage, commit, push, or spawn children. Return your normal delegated RESULT/report when done.`;
    }
    const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
    try {
        await cmux.send({ surfaceRef: target.manifest.surfaceRef, text: deliveredText, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
        await cmux.sendKey({ surfaceRef: target.manifest.surfaceRef, text: "", key: "enter", workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
    }
    catch (error) {
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
async function executeCapture(pi, params, signal, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
    const store = createStore(ctx);
    const target = await resolveValidTarget(store, taskId, agentId, "delegate_capture");
    if (!target.ok)
        return target.result;
    if (target.status.state === "closed") {
        return typedError("delegate_capture", "target_closed", "target pane is already closed; no screen capture attempted", { taskId, agentId, paths: evidencePaths(store, taskId, agentId) });
    }
    const lines = clampInteger(params.lines, 80, 1, 500);
    const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
    let captured = "";
    try {
        const outcome = await cmux.readScreen({ surfaceRef: target.manifest.surfaceRef, lines, scrollback: params.scrollback === true, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
        captured = outcome.result.stdout;
    }
    catch (error) {
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
async function executeCancel(pi, params, signal, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
    const store = createStore(ctx);
    const target = await resolveValidTarget(store, taskId, agentId, "delegate_cancel");
    if (!target.ok)
        return target.result;
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
    const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
    try {
        await cmux.sendKey({ surfaceRef: target.manifest.surfaceRef, text: "", key: "ctrl-c", workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
    }
    catch (error) {
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
async function executeRecordReport(params, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const reportName = requireString(params.reportName, "reportName");
    const rawText = stringOrUndefined(params.rawText) ?? "";
    if (!["planning-report", "execution-kickoff", "execution-report"].includes(reportName)) {
        return typedError("delegate_record_report", "invalid_report_name", `unsupported report name: ${reportName}`, { taskId });
    }
    const store = createStore(ctx);
    await store.initTask({ taskId });
    const parsed = parseModelText(rawText);
    const reportsByName = {
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
        const paths = await store.recordTaskReport(taskId, reportName, rawText, failureRecord);
        const state = reportName === "execution-kickoff" ? "attention" : "failed";
        const event = await store.appendTaskEvent(taskId, { type: "task-report-malformed", state: state, message: `${reportName} malformed`, data: { reportName, rawPath: paths.rawPath, jsonPath: paths.jsonPath, errors } });
        const alert = await store.queueParentAlert(taskId, { outcome: (state === "failed" ? "failed" : "attention"), state: state, eventType: "task-report-malformed", sourceEventId: event.eventId, message: `${reportName} malformed`, evidence: { rawPath: paths.rawPath, jsonPath: paths.jsonPath } });
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
    const paths = await store.recordTaskReport(taskId, reportName, report.rawText, report);
    const reportStatus = report.status;
    const state = stateForRecordedReport(reportName, reportStatus);
    const outcome = alertOutcomeForRecordedReport(reportName, reportStatus, state);
    const event = await store.appendTaskEvent(taskId, { type: `task-${reportName}`, state: state, message: `${reportName} recorded${reportStatus ? `: ${reportStatus}` : ""}`, data: { reportName, status: reportStatus, rawPath: paths.rawPath, jsonPath: paths.jsonPath } });
    const alert = outcome === undefined ? undefined : await store.queueParentAlert(taskId, { outcome: outcome, state: state, status: reportStatus, eventType: `task-${reportName}`, sourceEventId: event.eventId, message: `${reportName} recorded${reportStatus ? `: ${reportStatus}` : ""}`, evidence: { rawPath: paths.rawPath, jsonPath: paths.jsonPath } });
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
async function executeClose(pi, params, signal, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
    const store = createStore(ctx);
    const target = await resolveValidTarget(store, taskId, agentId, "delegate_close");
    if (!target.ok)
        return target.result;
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
    const cmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd: target.manifest.cwd ?? ctx.cwd, timeoutMs: 10_000 });
    try {
        await cmux.closeSurface({ surfaceRef: target.manifest.surfaceRef, workspaceRef: target.manifest.workspaceRef, windowRef: target.manifest.windowRef });
    }
    catch (error) {
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
async function readWaitTarget(store, taskId, agentId, operation = "delegate_wait") {
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
            agents: registry.agents.map((agent) => ({ agentId: agent.agentId, role: agent.role, profile: agent.profile, state: agent.state, updatedAt: agent.updatedAt })),
        };
    }
    catch (error) {
        return { ok: false, result: typedError(operation, agentId === undefined ? "task_not_found" : "agent_not_found", messageFrom(error), { taskId, agentId }) };
    }
}
async function waitStopResult(store, taskId, agentId, target, reason) {
    const alerts = await store.readParentAlerts(taskId, { unreadOnly: true, ...(agentId !== undefined ? { agentId } : {}) });
    const terminalAlert = alerts.find((alert) => isTerminalAlertOutcome(alert.outcome));
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
    const attentionAlert = alerts.find((alert) => alert.outcome === "attention" || alert.outcome === "capability_gap");
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
function waitPaths(store, taskId, agentId) {
    if (agentId !== undefined) {
        return evidencePaths(store, taskId, agentId);
    }
    return { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson, alerts: store.pathsForTask(taskId).parentAlertsJson, waitState: store.pathsForTask(taskId).waitStateJson };
}
async function readTaskReports(store, taskId) {
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
async function unreadAlertsForIndex(store, tasks) {
    const alerts = [];
    for (const task of tasks) {
        try {
            alerts.push(...await store.readParentAlerts(task.taskId, { unreadOnly: true }));
        }
        catch {
            // Ignore stale/corrupt task entries in compact status output.
        }
    }
    return alerts;
}
function compactParsedAgentResult(parsed) {
    const results = Array.isArray(parsed?.results) ? parsed.results.map(compactFFResult) : [];
    return {
        ok: Boolean(parsed?.ok),
        status: results[0]?.status ?? (parsed?.ok === false ? "malformed" : "pending"),
        results,
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
function parsedAgentResultSemantic(compact, target) {
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
function hasUsableParsedTerminalOutput(compact) {
    if (Array.isArray(compact.results) && compact.results.length > 0)
        return true;
    const reports = compact.reports ?? {};
    return [reports.planning, reports.executionKickoff, reports.execution].some((items) => Array.isArray(items) && items.length > 0);
}
function firstErrorMessage(compact) {
    return Array.isArray(compact.errors) ? compact.errors.find((error) => typeof error?.message === "string")?.message : undefined;
}
function compactParsedReport(report) {
    if (!report || typeof report !== "object")
        return undefined;
    return {
        kind: report.kind,
        status: report.status,
        startLine: report.startLine,
        endLine: report.endLine,
        fields: compactFieldMap(report.fields),
    };
}
function compactFFResult(result) {
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
function compactRows(rows) {
    return Array.isArray(rows) ? rows.map((row) => ({ tag: row.tag, fields: row.fields, lineNumber: row.lineNumber })) : [];
}
function compactSignals(signals) {
    return Array.isArray(signals) ? signals.map((signal) => ({ kind: signal.kind, state: signal.state, message: signal.message, lineNumber: signal.lineNumber, attributes: signal.attributes })) : [];
}
function compactErrors(errors) {
    return Array.isArray(errors) ? errors.map((error) => ({ lineNumber: error.lineNumber, message: error.message, blockKind: error.blockKind })) : [];
}
function compactFieldMap(fields) {
    if (!fields || typeof fields !== "object")
        return undefined;
    const output = {};
    for (const [key, rows] of Object.entries(fields)) {
        output[key] = Array.isArray(rows) ? rows.slice(0, 5) : rows;
    }
    return output;
}
function compactAlert(alert) {
    if (!alert)
        return undefined;
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
function stateForRecordedReport(reportName, status) {
    if (reportName === "execution-kickoff")
        return "running";
    if (status === "blocked")
        return "blocked";
    if (status === "failed")
        return "failed";
    return "completed";
}
function alertOutcomeForRecordedReport(reportName, status, state) {
    if (reportName === "execution-kickoff")
        return undefined;
    if (status === "completed_with_risks" || status === "ready_with_open_questions")
        return "completed_with_risks";
    if (state === "completed")
        return "completed";
    if (state === "blocked" || state === "failed")
        return state;
    return undefined;
}
function isTerminalState(state) {
    return state === "completed" || state === "blocked" || state === "failed" || state === "cancelled" || state === "closed";
}
function isTerminalAlertOutcome(outcome) {
    return outcome === "completed" || outcome === "completed_with_risks" || outcome === "blocked" || outcome === "failed" || outcome === "cancelled";
}
function terminalAgentFromTarget(target) {
    return Array.isArray(target?.agents) ? target.agents.find((agent) => isTerminalState(agent.state)) : undefined;
}
function attentionAgentFromTarget(target) {
    return Array.isArray(target?.agents) ? target.agents.find((agent) => agent.state === "attention" || agent.state === "waiting_for_parent") : undefined;
}
function waitScopeKey(taskId, agentId) {
    return agentId === undefined ? `task:${taskId}` : `agent:${taskId}:${agentId}`;
}
function requireTimeoutMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new Error("timeoutMs is required and must be a positive integer");
    }
    return Math.floor(numeric);
}
function createPiCmuxRunner(pi, signal) {
    return {
        async run(command, options = {}) {
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
            const executionStatus = (signal?.aborted ? "cancelled" : result?.killed ? "timed_out" : exitCode === 0 ? "success" : "failed");
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
async function resolveValidTarget(store, taskId, agentId, operation) {
    try {
        const manifest = await store.readAgentManifest(taskId, agentId);
        const status = await store.readAgentStatus(taskId, agentId);
        if (!manifest.surfaceRef) {
            return { ok: false, result: typedError(operation, "target_surface_missing", "target agent has no stored cmux surface ref", { taskId, agentId, paths: evidencePaths(store, taskId, agentId) }) };
        }
        return { ok: true, manifest, status };
    }
    catch (error) {
        return { ok: false, result: typedError(operation, "target_not_found", messageFrom(error), { taskId, agentId, paths: evidencePaths(store, taskId, agentId) }) };
    }
}
function defaultParentAgentId() {
    return stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID) ?? "orchestrator";
}
function buildChildPiLaunchCommand(input) {
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
async function markAgentFailed(store, taskId, agentId, message, error) {
    await store.writeAgentStatus(taskId, agentId, { state: "failed", message, reason: messageFrom(error) });
    const event = await store.appendAgentEvent(taskId, agentId, { type: "agent-start-failed", state: "failed", message, data: { error: messageFrom(error) } });
    await store.appendTaskEvent(taskId, { type: "agent-start-failed", state: "failed", message: `${agentId}: ${message}`, data: { agentId, error: messageFrom(error) } });
    await store.queueParentAlert(taskId, { agentId, outcome: "failed", state: "failed", eventType: "agent-start-failed", sourceEventId: event.eventId, message: `${agentId}: ${message}`, data: { error: messageFrom(error) } });
}
function createStore(ctx) {
    return createDelegationStore({ root: delegationRootForRepo(ctx.cwd) });
}
function unavailableResult(operation, params, preflight) {
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
function typedError(operation, code, reason, extra = {}) {
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
function errorResult(operation, params, error) {
    return typedError(operation, "delegation_tool_error", messageFrom(error), {
        taskId: stringOrUndefined(params?.taskId),
        agentId: stringOrUndefined(params?.agentId),
    });
}
function toToolResult(toolName, result) {
    return {
        content: [{ type: "text", text: compactDelegationToolText(toolName, result) }],
        details: { result },
    };
}
function compactDelegationToolText(toolName, result) {
    const head = [toolName, result?.status ?? result?.toolStatus ?? "unknown"];
    if (result?.code)
        head.push(String(result.code));
    if (result?.taskId)
        head.push(`task=${result.taskId}`);
    if (result?.agentId)
        head.push(`agent=${result.agentId}`);
    if (result?.role)
        head.push(`role=${result.role}`);
    if (result?.profile)
        head.push(`profile=${result.profile}`);
    if (result?.cmux?.surfaceRef)
        head.push(`surface=${result.cmux.surfaceRef}`);
    const lines = [row(...head)];
    if (result?.reason)
        lines.push(row("reason", truncateLine(result.reason, 220)));
    if (result?.actionTaken)
        lines.push(row("action", result.actionTaken));
    if (result?.delivery?.fileBacked)
        lines.push(row("delivery", "file_backed", result.delivery.packetPath ?? ""));
    if (result?.snapshot?.screenPath)
        lines.push(row("screen", result.snapshot.screenPath, `lines=${result.snapshot.capturedLines ?? 0}`, `bytes=${result.snapshot.bytes ?? 0}`));
    if (result?.paths?.taskPacket)
        lines.push(row("packet", result.paths.taskPacket));
    if (result?.paths?.status)
        lines.push(row("status", result.paths.status));
    if (Array.isArray(result?.safeRoutes))
        lines.push(row("routes", result.safeRoutes.join(",")));
    lines.push(row("details", "details.result"));
    return lines.join("\n");
}
function row(...fields) {
    return fields.filter((field) => field !== undefined && field !== null && String(field).length > 0).map((field) => String(field).replace(/\r?\n/g, " ").replace(/\|/g, "¦")).join("|");
}
function evidencePaths(store, taskId, agentId) {
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
        alerts: store.pathsForTask(taskId).parentAlertsJson,
        waitState: store.pathsForTask(taskId).waitStateJson,
    };
}
async function readIndexTasks(root) {
    try {
        const index = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
        return Array.isArray(index.tasks) ? index.tasks : [];
    }
    catch {
        return [];
    }
}
function shouldUseFileBackedSend(kind, message) {
    return kind === "follow_up" || kind === "fix" || kind === "task_packet" || message.includes("\n") || message.length > 240;
}
function followUpFileName(kind) {
    const stamp = new Date().toISOString().replace(/[^0-9A-Za-z_-]/g, "-");
    return `${kind}-${stamp}.txt`;
}
function boundedSingleLine(message, maxLength) {
    const line = message.replace(/\s+/g, " ").trim();
    return line.length <= maxLength ? line : `${line.slice(0, maxLength - 1)}…`;
}
function splitLines(text) {
    if (text.length === 0)
        return [];
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}
function clampInteger(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return fallback;
    return Math.max(min, Math.min(max, Math.floor(numeric)));
}
function requireString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} is required`);
    }
    return value;
}
function stringOrUndefined(value) {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
function arrayOrUndefined(value) {
    return Array.isArray(value) ? value : undefined;
}
function truncateLine(value, maxLength) {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
function messageFrom(error) {
    return error instanceof Error ? error.message : String(error);
}
