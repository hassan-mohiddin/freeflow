import { access, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { CmuxAdapter, CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION, CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION, CURRENT_DELEGATION_PROTOCOL_VERSION, activeLeasesForAgent, assertLeafProfilesDoNotIncludeDelegationTools, compileTaskPacket, createDelegationStore, delegationRootForRepo, deriveDelegationInlineLease, deriveRoutedAttemptId, deriveRoutedRecoveryAttemptId, findActiveLegacyAssignmentLease, isBroadWriteScope, isPathInsideScope, parseModelText, planDelegationLayoutAllocation, priorityForParentAlert, resolveAssignmentAttemptIdentity, resolveProfileForRole, routeDelegationRequest, normalizeDelegationRouteRequest, shellQuote, validateSafeId, validateTaskPacketIdentity, } from "../../../delegation/dist/index.js";
import { renderDelegationCall, renderDelegationResult } from "./renderers.js";
import { readCapabilityState } from "../runtime-context.js";
const STRING_SCHEMA = { type: "string" };
const NON_EMPTY_STRING_SCHEMA = { type: "string", minLength: 1 };
const ROLE_SCHEMA = {
    type: "string",
    enum: ["planning-parent", "execution-parent", "researcher", "worker", "reviewer", "verifier", "integrator"],
};
const ROUTE_ROLE_SCHEMA = {
    type: "string",
    enum: ["orchestrator", "planning-parent", "execution-parent", "researcher", "worker", "reviewer", "verifier", "integrator"],
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
const ROUTE_ACTION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        kind: { type: "string", enum: ["plan", "implement", "research", "review", "verify", "fix", "spawn", "ask_user", "close"] },
        breadth: { type: "string", enum: ["tiny", "single_file", "multi_file", "broad"] },
        description: STRING_SCHEMA,
    },
    required: ["kind", "breadth"],
};
const ROUTE_EXECUTION_AUTHORIZATION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        schemaVersion: { type: "integer", enum: [1] },
        executionId: NON_EMPTY_STRING_SCHEMA,
        planningReportReadyEventId: NON_EMPTY_STRING_SCHEMA,
        planApprovedEventId: NON_EMPTY_STRING_SCHEMA,
        executionAuthorizedEventId: NON_EMPTY_STRING_SCHEMA,
        taskState: { type: "string", enum: ["ready_for_execution"] },
        taskId: NON_EMPTY_STRING_SCHEMA,
        executionMapPath: NON_EMPTY_STRING_SCHEMA,
        planArtifactPath: NON_EMPTY_STRING_SCHEMA,
        approvedBy: { type: "string", enum: ["user", "orchestrator"] },
    },
    required: ["schemaVersion", "executionId", "planningReportReadyEventId", "planApprovedEventId", "executionAuthorizedEventId", "taskState", "taskId", "executionMapPath", "planArtifactPath", "approvedBy"],
};
const ROUTE_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        taskId: NON_EMPTY_STRING_SCHEMA,
        agentId: NON_EMPTY_STRING_SCHEMA,
        role: ROUTE_ROLE_SCHEMA,
        action: ROUTE_ACTION_SCHEMA,
        hasApprovedPlan: { type: "boolean", description: "Caller hint only; does not authorize execution without stored evidence." },
        executionAuthorization: ROUTE_EXECUTION_AUTHORIZATION_SCHEMA,
        targetFiles: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
        writeScopes: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
        riskFlags: { type: "array", items: { type: "string", enum: ["user_owned_decision", "public_api", "security", "privacy", "data_loss", "irreversible", "unknown"] } },
        routeId: NON_EMPTY_STRING_SCHEMA,
    },
    required: ["taskId", "agentId", "role", "action"],
};
const REQUEST_EXECUTION_AUTHORIZATION_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        taskId: NON_EMPTY_STRING_SCHEMA,
    },
    required: ["taskId"],
};
const APPLY_ROUTE_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        taskId: NON_EMPTY_STRING_SCHEMA,
        routeId: NON_EMPTY_STRING_SCHEMA,
        callerWorkspaceRef: STRING_SCHEMA,
    },
    required: ["taskId", "routeId"],
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
        planArtifactPath: STRING_SCHEMA,
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
export function registerDelegationTools(pi) {
    assertLeafProfilesDoNotIncludeDelegationTools();
    const toolDefinitions = [
        delegationTool("delegate_task_init", "Delegate Task Init", "Create repo-local delegation task state for an orchestrator or parent.", TASK_INIT_PARAMETERS, executeTaskInit, "parent-control"),
        delegationTool("delegate_route", "Delegate Route", "Return and store a deterministic delegation route decision without spawning panes, applying routes, or issuing leases.", ROUTE_PARAMETERS, (params, _signal, ctx) => executeRoute(params, ctx), "parent-control"),
        delegationTool("delegate_request_execution_authorization", "Request Execution Authorization", "Ask the host user to confirm the canonical stored plan before recording owner-bound execution authorization.", REQUEST_EXECUTION_AUTHORIZATION_PARAMETERS, (params, _signal, ctx) => executeRequestExecutionAuthorization(params, ctx), "parent-control"),
        delegationTool("delegate_apply_route", "Delegate Apply Route", "Apply a stored delegation route decision for inline, parent, or child routes without trusting caller-provided target hints.", APPLY_ROUTE_PARAMETERS, (params, signal, ctx) => executeApplyRoute(pi, params, signal, ctx), "parent-control"),
        delegationTool("delegate_spawn", "Delegate Spawn", "Open a visible cmux pane and start a delegated Pi child after fail-closed preflight.", SPAWN_PARAMETERS, (params, signal, ctx) => executeSpawn(pi, params, signal, ctx), "parent-control"),
        delegationTool("delegate_status", "Delegate Status", "Return compact delegation task/agent/preflight status with no raw transcript dump.", STATUS_PARAMETERS, (params, signal, ctx) => executeStatus(pi, params, signal, ctx), "read-recovery"),
        delegationTool("delegate_wait", "Delegate Wait", "Explicit bounded watch mode for terminal/attention lifecycle changes; timeout is required.", WAIT_PARAMETERS, (params, signal, ctx) => executeWait(params, signal, ctx), "parent-control"),
        delegationTool("delegate_result", "Delegate Result", "Return compact parsed result/report pointers without raw transcript injection.", TARGET_PARAMETERS, (params, signal, ctx) => executeResult(pi, params, signal, ctx), "read-recovery"),
        delegationTool("delegate_send", "Delegate Send", "Send a bounded note or file-backed follow-up/fix packet to a delegated pane.", SEND_PARAMETERS, (params, signal, ctx) => executeSend(pi, params, signal, ctx), "parent-control"),
        delegationTool("delegate_capture", "Delegate Capture", "Capture a bounded cmux screen snapshot and store it as evidence without dumping raw screens.", CAPTURE_PARAMETERS, (params, signal, ctx) => executeCapture(pi, params, signal, ctx), "parent-control"),
        delegationTool("delegate_cancel", "Delegate Cancel", "Cancel a valid delegated target without deleting evidence.", CLOSE_PARAMETERS, (params, signal, ctx) => executeCancel(pi, params, signal, ctx), "parent-control"),
        delegationTool("delegate_close", "Delegate Close", "Close a valid delegated cmux surface while preserving delegation evidence.", CLOSE_PARAMETERS, (params, signal, ctx) => executeClose(pi, params, signal, ctx), "parent-control"),
        delegationTool("delegate_record_report", "Delegate Record Report", "Record planning/execution reports and kickoff blocks with deterministic parser evidence.", REPORT_PARAMETERS, (params, _signal, ctx) => executeRecordReport(params, ctx), "parent-control"),
        delegationTool("delegate_finish", "Delegate Finish", "Store a structured delegated result/report for the current agent and alert the direct parent without echoing full JSON.", FINISH_PARAMETERS, (params, _signal, ctx) => executeFinish(params, ctx), "child-lifecycle"),
        delegationTool("delegate_attention", "Delegate Attention", "Request parent attention or record a blocker for the current delegated agent.", ATTENTION_PARAMETERS, (params, _signal, ctx) => executeAttention(params, ctx), "child-lifecycle"),
        delegationTool("delegate_progress", "Delegate Progress", "Record store-only delegated progress without waking the parent by default.", PROGRESS_PARAMETERS, (params, _signal, ctx) => executeProgress(params, ctx), "child-lifecycle"),
        delegationTool("delegate_inbox", "Delegate Inbox", "Read compact parent inbox alerts for a delegation task.", INBOX_PARAMETERS, (params, _signal, ctx) => executeInbox(params, ctx), "read-recovery"),
        delegationTool("delegate_ack_alert", "Delegate Ack Alert", "Mark one parent inbox alert as read.", ACK_ALERT_PARAMETERS, (params, _signal, ctx) => executeAckAlert(params, ctx), "read-recovery"),
        delegationTool("delegate_ack_all", "Delegate Ack All", "Mark all parent inbox alerts for a task as read.", ACK_ALL_PARAMETERS, (params, _signal, ctx) => executeAckAll(params, ctx), "read-recovery"),
        delegationTool("delegate_user_attention", "Delegate User Attention", "Request harness-owned user attention through configured Pi/TUI notification channels.", USER_ATTENTION_PARAMETERS, (params, _signal, ctx) => executeUserAttention(params, ctx), "read-recovery"),
        delegationTool("delegate_update_execution_map", "Delegate Update Execution Map", "Upsert one work package into the canonical execution map through harness validation.", UPDATE_EXECUTION_MAP_PARAMETERS, (params, _signal, ctx) => executeUpdateExecutionMap(params, ctx), "parent-control"),
    ];
    for (const definition of toolDefinitions) {
        pi.registerTool(definition);
    }
}
export async function executeDelegationOperation(pi, operation, params, signal, ctx) {
    const disabled = await disabledByConfigResult(operation, ctx);
    if (disabled) {
        return disabled;
    }
    switch (operation) {
        case "delegate_status": return executeStatus(pi, params, signal, ctx);
        case "delegate_route": return executeRoute(params, ctx);
        case "delegate_apply_route": return executeApplyRoute(pi, params, signal, ctx);
        case "delegate_inbox": return executeInbox(params, ctx);
        case "delegate_result": return executeResult(pi, params, signal, ctx);
        case "delegate_capture": return executeCapture(pi, params, signal, ctx);
        case "delegate_close": return executeClose(pi, params, signal, ctx);
        case "delegate_ack_alert": return executeAckAlert(params, ctx);
        case "delegate_ack_all": return executeAckAll(params, ctx);
        default: return typedError(operation, "unsupported_delegation_batch_operation", `unsupported delegation operation for batch: ${operation}`);
    }
}
function delegationTool(name, label, description, parameters, handler, toolClass) {
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
        async execute(_toolCallId, params, signal, _onUpdate, ctx) {
            try {
                const disabled = await disabledByConfigResult(name, ctx);
                if (disabled) {
                    return toToolResult(name, disabled);
                }
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
async function executeRequestExecutionAuthorization(params, ctx) {
    const operation = "delegate_request_execution_authorization";
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    if (stringOrUndefined(process.env.FREEFLOW_DELEGATION_TASK_ID) !== undefined || stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID) !== undefined) {
        return typedError(operation, "owner_confirmation_requires_orchestrator_root", "delegated child and parent sessions cannot request owner execution authorization", {
            taskId,
            actionTaken: "no_owner_prompt_or_authorization_mutation",
        });
    }
    if (ctx?.hasUI !== true || (ctx?.mode !== "tui" && ctx?.mode !== "rpc") || typeof ctx?.ui?.confirm !== "function") {
        return typedError(operation, "owner_confirmation_unavailable", "execution authorization requires an interactive Pi TUI or RPC owner confirmation", {
            taskId,
            actionTaken: "no_owner_prompt_or_authorization_mutation",
        });
    }
    const store = createStore(ctx);
    const existing = await store.readExecutionAuthorization(taskId).catch(() => undefined);
    if (existing !== undefined) {
        return {
            toolStatus: "ok",
            operation,
            status: "ready_for_execution",
            code: "already_authorized",
            taskId,
            approvedBy: existing.approvedBy,
            planArtifactPath: existing.planArtifactPath,
            planningReportReadyEventId: existing.planningReportReadyEventId,
            planApprovedEventId: existing.planApprovedEventId,
            executionAuthorizedEventId: existing.executionAuthorizedEventId,
            executionId: existing.executionId,
            actionTaken: "existing_owner_authorization_reused_without_prompt",
            paths: { task: store.pathsForTask(taskId).taskJson, events: store.pathsForTask(taskId).eventsJsonl, executionMap: existing.executionMapPath },
        };
    }
    let request;
    try {
        request = await store.readExecutionApprovalRequest(taskId);
    }
    catch (error) {
        return typedError(operation, "execution_approval_unavailable", messageFrom(error), {
            taskId,
            actionTaken: "no_owner_prompt_or_authorization_mutation",
        });
    }
    const confirmed = await ctx.ui.confirm("Authorize delegated execution?", [
        `Task: ${safeConfirmationText(request.taskId)}`,
        `Plan: ${safeConfirmationText(request.planArtifactPath)}`,
        `Planning-ready event: ${safeConfirmationText(request.planningReportReadyEventId)}`,
        `Execution map: ${safeConfirmationText(request.executionMapPath)}`,
        "Confirming records your approval and authorizes execution for exactly this stored identity.",
    ].join("\n"));
    if (!confirmed) {
        return typedError(operation, "owner_confirmation_declined", "the host user declined execution authorization", {
            taskId,
            actionTaken: "owner_prompt_declined_no_authorization_mutation",
        });
    }
    try {
        const transitioned = await store.approveAndAuthorizeExecution(taskId, request);
        return {
            toolStatus: "ok",
            operation,
            status: "ready_for_execution",
            taskId,
            approvedBy: transitioned.evidence.approvedBy,
            planArtifactPath: transitioned.evidence.planArtifactPath,
            planningReportReadyEventId: transitioned.evidence.planningReportReadyEventId,
            planApprovedEventId: transitioned.evidence.planApprovedEventId,
            executionAuthorizedEventId: transitioned.evidence.executionAuthorizedEventId,
            executionId: transitioned.evidence.executionId,
            commitState: transitioned.commitState,
            recoveryReason: transitioned.recoveryReason,
            actionTaken: transitioned.commitState === "committed_reconciled"
                ? "owner_authorization_committed_and_reconciled_after_projection_failure"
                : "owner_confirmation_recorded_and_execution_authorized",
            paths: { task: store.pathsForTask(taskId).taskJson, events: store.pathsForTask(taskId).eventsJsonl, executionMap: transitioned.evidence.executionMapPath },
        };
    }
    catch (error) {
        const reason = messageFrom(error);
        const commitState = error?.commitState;
        const code = reason.includes("approval preview is stale")
            ? "execution_approval_stale"
            : commitState === "indeterminate"
                ? "execution_authorization_indeterminate"
                : "execution_authorization_failed";
        return typedError(operation, code, reason, {
            taskId,
            commitState,
            actionTaken: code === "execution_approval_stale"
                ? "confirmed_preview_was_stale_no_approval_or_authorization_recorded"
                : code === "execution_authorization_indeterminate"
                    ? "authorization_may_have_committed_inspect_stored_authorization_before_retry"
                    : "authorization_not_confirmed_stored_approval_may_require_retry",
        });
    }
}
async function executeRoute(params, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
    const role = requireString(params.role, "role");
    const store = createStore(ctx);
    const authorization = await lookupStoredExecutionAuthorization(store, taskId, params.executionAuthorization !== undefined);
    const request = {
        taskId,
        agentId,
        role,
        action: routeActionFromParams(params.action),
    };
    if (params.routeId !== undefined)
        request.routeId = validateSafeId(requireString(params.routeId, "routeId"), "route id");
    if (params.hasApprovedPlan !== undefined)
        request.hasApprovedPlan = Boolean(params.hasApprovedPlan);
    if (authorization.evidence !== undefined)
        request.executionAuthorization = authorization.evidence;
    const targetFiles = stringArrayParam(params.targetFiles, "targetFiles");
    if (targetFiles !== undefined)
        request.targetFiles = targetFiles;
    const writeScopes = stringArrayParam(params.writeScopes, "writeScopes");
    if (writeScopes !== undefined)
        request.writeScopes = writeScopes;
    const riskFlags = stringArrayParam(params.riskFlags, "riskFlags");
    if (riskFlags !== undefined)
        request.riskFlags = riskFlags;
    const normalizedRequest = normalizeDelegationRouteRequest(request);
    const decision = routeDelegationRequest(normalizedRequest);
    const record = await store.appendRouteDecision(taskId, decision, { request: normalizedRequest });
    const actionGuidance = routeActionGuidance(decision);
    return {
        toolStatus: "ok",
        operation: "delegate_route",
        status: decision.kind,
        taskId,
        agentId,
        role,
        action: normalizedRequest.action,
        routeId: decision.routeId,
        decision,
        authorization,
        route: actionGuidance,
        actionGuidance,
        storedDecision: { routeId: record.routeId, recordedAt: record.recordedAt },
        actionTaken: decision.kind === "inline_allowed" && decision.lease !== undefined
            ? "route_decision_stored_with_inactive_deterministic_lease_no_pane_spawned"
            : "route_decision_stored_no_pane_spawned_no_lease_issued",
        paths: { task: store.pathsForTask(taskId).taskJson, routes: store.pathsForTask(taskId).routesJsonl },
    };
}
async function executeApplyRoute(pi, params, signal, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const routeId = validateSafeId(requireString(params.routeId, "routeId"), "route id");
    const store = createStore(ctx);
    const routeRecord = await readStoredRouteDecision(store, taskId, routeId);
    if (!routeRecord.ok)
        return routeRecord.result;
    const existingApplication = await readStoredRouteApplication(store, taskId, routeId);
    if (!existingApplication.ok)
        return existingApplication.result;
    if (existingApplication.application !== undefined) {
        const legacyParent = await classifyLegacyParentRouteApplication(store, taskId, routeId, routeRecord.record.decision, existingApplication.application);
        if (legacyParent !== undefined)
            return legacyParent;
        return alreadyAppliedRouteResult(store, taskId, routeId, routeRecord.record.decision, existingApplication.application);
    }
    const decision = routeRecord.record.decision;
    if (decision.kind === "inline_allowed") {
        const derivedLease = decision.lease ?? (routeRecord.record.request === undefined
            ? undefined
            : deriveDelegationInlineLease(routeRecord.record.request, routeId));
        const leaseIds = [];
        if (derivedLease !== undefined) {
            const activated = await store.ensureLeaseActive(taskId, derivedLease, `inline route ${routeId} applied`);
            leaseIds.push(activated.lease.leaseId);
        }
        const applicationResult = await store.recordRouteApplication({
            applicationId: routeApplicationIdFor(routeId),
            routeId,
            taskId,
            state: "applied",
            decisionKind: decision.kind,
            leaseIds,
            waitingFor: "INLINE_WORK",
        });
        return appliedRouteResult(store, taskId, routeId, decision, applicationResult.application, applicationResult.recorded, undefined);
    }
    if (decision.kind === "ask_user") {
        return declinedApplyRouteResult(store, taskId, routeId, decision, "ask_user_route_not_applied", decision.question, "ask_user_before_applying_route");
    }
    if (decision.kind === "blocked") {
        return declinedApplyRouteResult(store, taskId, routeId, decision, "blocked_route_not_applied", decision.reason, "route_parent_or_user_adjudication_required");
    }
    if (isChildRouteRole(decision.targetRole)) {
        return applyChildRouteSpawnReuse(pi, params, signal, ctx, store, taskId, routeId, decision, routeRecord.record.request);
    }
    if (decision.targetRole !== "planning-parent" && decision.targetRole !== "execution-parent") {
        return {
            toolStatus: "ok",
            operation: "delegate_apply_route",
            status: "unsupported",
            code: "route_target_not_supported_in_phase4c",
            taskId,
            routeId,
            kind: decision.kind,
            target: decision.targetRole,
            decision,
            route: `target ${decision.targetRole} is not implemented by delegate_apply_route Phase 4c`,
            nextAction: "leave route unapplied; this target role has no materialization contract in the current slice",
            actionTaken: "no_route_application_or_layout_state_mutated",
            paths: applyRoutePaths(store, taskId),
        };
    }
    let authorization;
    if (decision.targetRole === "execution-parent") {
        authorization = await lookupStoredExecutionAuthorization(store, taskId, false);
        if (authorization.evidence === undefined) {
            return typedError("delegate_apply_route", "execution_authorization_missing", "execution-parent route application requires stored planning_report.ready, plan.approved, and execution.authorized evidence", {
                status: "failed",
                taskId,
                routeId,
                kind: decision.kind,
                target: decision.targetRole,
                decision,
                authorization,
                actionTaken: "no_route_application_or_layout_state_mutated",
                nextAction: "record stored execution authorization or route back to planning-parent before applying execution-parent",
                paths: applyRoutePaths(store, taskId),
            });
        }
    }
    else {
        authorization = { present: false, source: "not_required", callerProvided: false, callerEvidenceUsed: false };
    }
    const agentId = parentRouteAgentId(decision.targetRole);
    let layoutState;
    try {
        layoutState = await store.readLayoutState(taskId);
    }
    catch (error) {
        return typedError("delegate_apply_route", "layout_state_malformed", messageFrom(error), {
            status: "failed",
            taskId,
            routeId,
            kind: decision.kind,
            target: decision.targetRole,
            actionTaken: "no_route_application_or_layout_state_mutated",
            paths: applyRoutePaths(store, taskId),
        });
    }
    let allocation;
    try {
        const agentPaths = store.pathsForAgent(taskId, agentId);
        allocation = planDelegationLayoutAllocation({
            intent: {
                taskId,
                assignmentId: agentId,
                role: decision.targetRole,
                preferredGroup: decision.targetRole === "planning-parent" ? "planning" : "execution",
                reusePolicy: "reuse_role_pane",
                preset: "default-v1",
                preserveFocus: true,
                intentKind: "agent",
                parentAgentId: defaultParentAgentId(),
                callerWorkspaceRef: stringOrUndefined(params.callerWorkspaceRef),
                promptPath: agentPaths.taskPacketRaw,
                reportPath: agentPaths.resultJson,
            },
            existingAllocations: layoutState.allocations,
        });
    }
    catch (error) {
        return typedError("delegate_apply_route", "layout_allocation_failed", messageFrom(error), {
            status: "failed",
            taskId,
            routeId,
            kind: decision.kind,
            target: decision.targetRole,
            actionTaken: "no_route_application_or_layout_state_mutated",
            paths: applyRoutePaths(store, taskId),
        });
    }
    const recordedAllocation = await store.recordLayoutAllocation(allocation);
    const applicationResult = await store.recordRouteApplication({
        applicationId: routeApplicationIdFor(routeId),
        routeId,
        taskId,
        state: "applied",
        decisionKind: decision.kind,
        layoutAllocationId: recordedAllocation.allocationId,
        waitingFor: decision.targetRole === "planning-parent" ? "PLANNING_REPORT" : "EXECUTION_REPORT",
    });
    return appliedRouteResult(store, taskId, routeId, decision, applicationResult.application, applicationResult.recorded, recordedAllocation, authorization);
}
async function applyChildRouteSpawnReuse(pi, params, signal, ctx, store, taskId, routeId, decision, request) {
    const role = decision.targetRole;
    const agentId = childRouteAssignmentId(role, routeId);
    const attemptId = deriveRoutedAttemptId(routeId);
    const requestEvidence = validateChildRouteRequestEvidence(store, taskId, routeId, decision, request);
    if (!requestEvidence.ok)
        return requestEvidence.result;
    const profile = childRouteProfile(role);
    const parentAgentId = validateSafeId(requestEvidence.request.agentId, "parent agent id");
    const commandAuthority = role === "worker"
        ? await routedWorkerCommandAuthority(store, taskId, agentId, requestEvidence.request, ctx.cwd)
        : { status: "role_not_command_authorized", allowedCommands: [], packageId: undefined };
    const profileDefinition = resolveProfileForRole(role, profile);
    const activeToolGating = activeToolsForSpawn(pi, profileDefinition.activeTools);
    if (activeToolGating.ok === false) {
        return typedError("delegate_apply_route", "active_tools_unavailable", activeToolGating.reason, {
            status: "failed",
            taskId,
            routeId,
            agentId,
            kind: decision.kind,
            target: role,
            actionTaken: "no_route_application_registry_packet_or_cmux_mutation",
            paths: applyRoutePaths(store, taskId),
        });
    }
    const paths = store.pathsForAgent(taskId, agentId);
    let compiled;
    try {
        compiled = compileTaskPacket({
            taskId,
            agentId,
            assignmentId: agentId,
            attemptId,
            identitySchemaVersion: CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION,
            profileSchemaVersion: CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION,
            protocolVersion: CURRENT_DELEGATION_PROTOCOL_VERSION,
            parentAgentId,
            role: role,
            profile: profile,
            cwd: ctx.cwd,
            objective: requestEvidence.objective,
            sourcePointers: childRouteSourcePointers(requestEvidence.request),
            inScope: childRouteInScope(requestEvidence.request, role),
            outOfScope: childRouteOutOfScope(role),
            tools: activeToolGating.tools,
            writeScope: requestEvidence.writeScopes,
            allowedCommands: commandAuthority.allowedCommands,
            evidence: childRouteEvidencePointers(store, taskId, routeId, requestEvidence.request),
            tracePath: paths.transcriptLog,
            resultPath: paths.resultJson,
        });
    }
    catch (error) {
        return typedError("delegate_apply_route", "task_packet_compile_failed", messageFrom(error), {
            status: "failed",
            taskId,
            routeId,
            agentId,
            kind: decision.kind,
            target: role,
            actionTaken: "no_route_application_registry_packet_or_cmux_mutation",
            paths: applyRoutePaths(store, taskId),
        });
    }
    const assignmentLease = assignmentLeaseFor({
        taskId,
        agentId,
        role,
        writeScopes: compiled.writeScopes,
        allowedCommands: compiled.allowedCommands,
        routeId,
        assignmentId: agentId,
        attemptId,
        source: "routed",
        cwd: ctx.cwd,
    });
    let layoutState;
    try {
        layoutState = await store.readLayoutState(taskId);
    }
    catch (error) {
        return typedError("delegate_apply_route", "layout_state_malformed", messageFrom(error), {
            status: "failed",
            taskId,
            routeId,
            kind: decision.kind,
            target: role,
            actionTaken: "no_route_application_or_spawn_mutation",
            paths: applyRoutePaths(store, taskId),
        });
    }
    const reusable = await findReusableChildRouteAgent(store, taskId, agentId, attemptId, role, profile, parentAgentId);
    if (!reusable.ok)
        return reusable.result;
    let plannedAllocation;
    try {
        plannedAllocation = planChildRouteLayoutAllocation(store, taskId, agentId, role, parentAgentId, layoutState.allocations, {
            callerWorkspaceRef: reusable.agent?.manifest.workspaceRef ?? stringOrUndefined(params.callerWorkspaceRef),
            paneRef: reusable.agent?.manifest.paneRef,
            surfaceRef: reusable.agent?.manifest.surfaceRef,
            workspaceRef: reusable.agent?.manifest.workspaceRef,
        });
    }
    catch (error) {
        return typedError("delegate_apply_route", "layout_allocation_failed", messageFrom(error), {
            status: "failed",
            taskId,
            routeId,
            kind: decision.kind,
            target: role,
            actionTaken: "no_route_application_or_spawn_mutation",
            paths: applyRoutePaths(store, taskId),
        });
    }
    const runner = createPiCmuxRunner(pi, signal);
    const cmux = new CmuxAdapter(runner, { cwd: ctx.cwd, timeoutMs: 10_000 });
    const preflight = await cmux.ensureReady({
        storeRoot: store.root,
        env: process.env,
    });
    if (!preflight.ok) {
        return {
            ...unavailableResult("delegate_apply_route", { taskId, agentId }, preflight),
            routeId,
            kind: decision.kind,
            target: role,
            decision,
            actionTaken: "no_route_application_registry_packet_or_cmux_mutation",
            paths: applyRoutePaths(store, taskId),
        };
    }
    if (reusable.agent !== undefined) {
        const recordedAllocation = await store.recordLayoutAllocation(plannedAllocation);
        await store.updateAgentManifest(taskId, agentId, {
            writeScope: compiled.writeScopes.length === 1 ? compiled.writeScopes[0] : undefined,
            writeScopes: compiled.writeScopes,
            allowedCommands: compiled.allowedCommands,
        });
        const leaseIds = [];
        let applicationResult;
        try {
            if (assignmentLease !== undefined) {
                const activated = await store.ensureLeaseActive(taskId, assignmentLease, `routed assignment ${routeId} reused`);
                leaseIds.push(activated.lease.leaseId);
            }
            applicationResult = await store.recordRouteApplication({
                applicationId: routeApplicationIdFor(routeId),
                routeId,
                taskId,
                state: "applied",
                decisionKind: decision.kind,
                layoutAllocationId: recordedAllocation.allocationId,
                leaseIds,
                reused: [agentId],
                waitingFor: childWaitingFor(role),
            });
        }
        catch (error) {
            const failure = startupFailure(error, "route_spawn_startup_failed", "reused route application persistence failed");
            const cleanup = await failStartupTransactionBestEffort(store, taskId, agentId, failure.message, failure.reason, assignmentLease !== undefined);
            return routeSpawnStartupError(store, taskId, routeId, agentId, role, decision, preflight, failure, cleanup, compactManifestCmuxRefs(reusable.agent.manifest));
        }
        return appliedRouteResult(store, taskId, routeId, decision, applicationResult.application, applicationResult.recorded, recordedAllocation, undefined, {
            preflight,
            profile,
            role,
            agentId,
            policy: { ...childRoutePolicy(compiled), commandAuthority },
            cmux: compactManifestCmuxRefs(reusable.agent.manifest),
            actionTaken: "existing_child_agent_reused_no_cmux_new_pane_or_task_packet",
        });
    }
    await store.initTask({ taskId, goal: requestEvidence.objective });
    await store.registerAgent({
        taskId,
        agentId,
        role: role,
        profile: profile,
        attemptId,
        attemptSource: "routed",
        parentAgentId,
        cwd: ctx.cwd,
        writeScope: compiled.writeScopes,
        allowedCommands: compiled.allowedCommands,
        state: "starting",
        retention: "auto",
        layoutPolicy: normalizeLayoutPolicy(undefined, role),
    });
    const packetPath = await store.writeAgentModelText(taskId, agentId, "task-packet.txt", compiled.text);
    const leaseIds = [];
    let pane;
    let recordedAllocation;
    let status;
    let applicationResult;
    try {
        if (assignmentLease !== undefined) {
            const activated = await store.ensureLeaseActive(taskId, assignmentLease, `routed assignment ${routeId} starting`);
            leaseIds.push(activated.lease.leaseId);
        }
        await store.appendAgentEvent(taskId, agentId, { type: "agent-starting", state: "starting", message: "preflight passed; opening cmux pane from stored route", data: { routeId, packetPath, leaseIds } });
        await store.appendTaskEvent(taskId, { type: "agent-starting", state: "starting", message: `${agentId} starting from route ${routeId}`, data: { agentId, role, profile, routeId, packetPath } });
        try {
            pane = await cmux.newPane({ direction: directionForRole(role), focus: false, workspaceRef: stringOrUndefined(params.callerWorkspaceRef) });
        }
        catch (error) {
            throw new StartupTransactionError("cmux_new_pane_failed", "cmux new-pane failed", error);
        }
        if (!pane.refs.surfaceRef) {
            throw new StartupTransactionError("cmux_surface_ref_missing", "cmux new-pane returned no surface ref", new Error("cmux new-pane did not return a usable surface ref"), { cmux: pane.refs });
        }
        const launchCommand = buildChildPiLaunchCommand({
            cwd: ctx.cwd,
            storeRoot: store.root,
            taskId,
            agentId,
            attemptId,
            parentAgentId,
            role,
            profile,
            packetPath,
            noSession: true,
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
            throw new StartupTransactionError("child_pi_start_failed", "child Pi startup send failed", error, { cmux: pane.refs });
        }
        const allocationWithRefs = planChildRouteLayoutAllocation(store, taskId, agentId, role, parentAgentId, layoutState.allocations, {
            callerWorkspaceRef: pane.refs.workspaceRef ?? stringOrUndefined(params.callerWorkspaceRef),
            paneRef: pane.refs.paneRef,
            surfaceRef: pane.refs.surfaceRef,
            workspaceRef: pane.refs.workspaceRef,
        });
        recordedAllocation = await store.recordLayoutAllocation(allocationWithRefs);
        status = await store.writeAgentStatus(taskId, agentId, { state: "running", message: "child Pi startup command sent to visible cmux pane from stored route" });
        await store.appendAgentEvent(taskId, agentId, { type: "agent-running", state: "running", message: "child Pi started in visible cmux pane from stored route", data: { routeId, cmux: pane.refs, packetPath } });
        await store.appendTaskEvent(taskId, { type: "agent-running", state: "running", message: `${agentId} running from route ${routeId}`, data: { agentId, role, profile, routeId, cmux: pane.refs, packetPath } });
        applicationResult = await store.recordRouteApplication({
            applicationId: routeApplicationIdFor(routeId),
            routeId,
            taskId,
            state: "applied",
            decisionKind: decision.kind,
            layoutAllocationId: recordedAllocation.allocationId,
            leaseIds,
            spawned: [agentId],
            waitingFor: childWaitingFor(role),
        });
    }
    catch (error) {
        const failure = startupFailure(error, "route_spawn_startup_failed", "routed child startup transaction failed");
        const cleanup = await failStartupTransactionBestEffort(store, taskId, agentId, failure.message, failure.reason, assignmentLease !== undefined);
        return routeSpawnStartupError(store, taskId, routeId, agentId, role, decision, preflight, failure, cleanup, pane?.refs);
    }
    return appliedRouteResult(store, taskId, routeId, decision, applicationResult.application, applicationResult.recorded, recordedAllocation, undefined, {
        preflight,
        profile,
        role,
        agentId,
        cmux: pane.refs,
        delivery: { kind: "task_packet", fileBacked: true, packetPath },
        policy: { ...childRoutePolicy(compiled), commandAuthority },
        agentStatus: status,
        actionTaken: "pane_opened_child_pi_started_with_file_backed_task_packet_route_application_recorded",
    });
}
async function executeSpawn(pi, params, signal, ctx) {
    const cwd = requireString(params.cwd, "cwd");
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
    const attemptId = validateSafeId(`attempt-${agentId}`, "attempt id");
    const role = requireString(params.role, "role");
    const profile = stringOrUndefined(params.profile) ?? role;
    const parentAgentId = validateSafeId(stringOrUndefined(params.parentAgentId) ?? defaultParentAgentId(), "parent agent id");
    const profileDefinition = resolveProfileForRole(role, profile);
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
        assignmentId: agentId,
        attemptId,
        identitySchemaVersion: CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION,
        profileSchemaVersion: CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION,
        protocolVersion: CURRENT_DELEGATION_PROTOCOL_VERSION,
        parentAgentId,
        role: role,
        profile: profile,
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
    const assignmentLease = assignmentLeaseFor({
        taskId,
        agentId,
        role,
        writeScopes: compiled.writeScopes,
        allowedCommands: compiled.allowedCommands,
        assignmentId: agentId,
        attemptId,
        source: "direct",
        cwd,
    });
    const existing = await findReusableDirectSpawn(store, {
        taskId,
        agentId,
        role,
        profile,
        parentAgentId,
        cwd,
        compiled,
        assignmentLease,
        expectedLaunchCommand: buildChildPiLaunchCommand({
            cwd,
            storeRoot: store.root,
            taskId,
            agentId,
            attemptId,
            parentAgentId,
            role,
            profile,
            packetPath: paths.taskPacketRaw,
            noSession: params.noSession !== false,
        }),
        retention: normalizeRetention(params.retention),
        layoutPolicy: normalizeLayoutPolicy(params.layoutPolicy, role),
        workspaceRef: stringOrUndefined(params.workspaceRef),
        windowRef: stringOrUndefined(params.windowRef),
    });
    if (!existing.ok)
        return existing.result;
    if (existing.agent !== undefined) {
        const existingCmux = new CmuxAdapter(createPiCmuxRunner(pi, signal), { cwd, timeoutMs: 10_000 });
        try {
            await existingCmux.readScreen({
                surfaceRef: existing.agent.manifest.surfaceRef,
                workspaceRef: existing.agent.manifest.workspaceRef,
                windowRef: existing.agent.manifest.windowRef,
                lines: 1,
                scrollback: false,
            });
        }
        catch (error) {
            return typedError("delegate_spawn", "direct_spawn_surface_invalid", `existing assignment surface could not be validated: ${messageFrom(error)}`, {
                taskId,
                agentId,
                cmux: compactManifestCmuxRefs(existing.agent.manifest),
                actionTaken: "existing_assignment_failed_closed_before_preflight_registration_packet_lease_or_pane_mutation",
                nextAction: "inspect or close the lost surface and create a new explicit task or agent attempt",
                paths: evidencePaths(store, taskId, agentId),
            });
        }
        return {
            toolStatus: "ok",
            operation: "delegate_spawn",
            status: "already_running",
            taskId,
            agentId,
            role,
            profile,
            profileKind: profileDefinition.kind,
            reused: true,
            leaseIds: existing.leaseIds,
            cmux: compactManifestCmuxRefs(existing.agent.manifest),
            retention: existing.agent.manifest.retention ?? normalizeRetention(params.retention),
            policy: {
                writeScope: compiled.writeScopes,
                allowedCommands: compiled.allowedCommands,
                tools: compiled.tools,
                leaseIds: existing.leaseIds,
            },
            agentStatus: existing.agent.status,
            paths: evidencePaths(store, taskId, agentId),
            actionTaken: "existing_complete_running_assignment_reused_no_preflight_pane_send_packet_or_lease_mutation",
        };
    }
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
        attemptId,
        attemptSource: "direct_compat_adapter",
        parentAgentId,
        cwd,
        writeScope: compiled.writeScopes,
        allowedCommands: compiled.allowedCommands,
        state: "starting",
        retention: normalizeRetention(params.retention),
        layoutPolicy: normalizeLayoutPolicy(params.layoutPolicy, role),
    });
    const packetPath = await store.writeAgentModelText(taskId, agentId, "task-packet.txt", compiled.text);
    const leaseIds = [];
    const cmux = new CmuxAdapter(runner, { cwd, timeoutMs: 10_000 });
    let pane;
    let status;
    try {
        if (assignmentLease !== undefined) {
            const activated = await store.ensureLeaseActive(taskId, assignmentLease, `direct spawn ${agentId} starting`);
            leaseIds.push(activated.lease.leaseId);
        }
        await store.appendAgentEvent(taskId, agentId, { type: "agent-starting", state: "starting", message: "preflight passed; opening cmux pane", data: { packetPath, leaseIds } });
        await store.appendTaskEvent(taskId, { type: "agent-starting", state: "starting", message: `${agentId} starting`, data: { agentId, role, profile, packetPath } });
        try {
            pane = await cmux.newPane({ direction: params.direction ?? directionForRole(role), focus: params.focus ?? true, workspaceRef: stringOrUndefined(params.workspaceRef), windowRef: stringOrUndefined(params.windowRef) });
        }
        catch (error) {
            throw new StartupTransactionError("cmux_new_pane_failed", "cmux new-pane failed", error);
        }
        if (!pane.refs.surfaceRef) {
            throw new StartupTransactionError("cmux_surface_ref_missing", "cmux new-pane returned no surface ref", new Error("cmux new-pane did not return a usable surface ref"), { cmux: pane.refs });
        }
        const launchCommand = buildChildPiLaunchCommand({
            cwd,
            storeRoot: store.root,
            taskId,
            agentId,
            attemptId,
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
            throw new StartupTransactionError("child_pi_start_failed", "child Pi startup send failed", error, { cmux: pane.refs });
        }
        status = await store.writeAgentStatus(taskId, agentId, { state: "running", message: "child Pi startup command sent to visible cmux pane" });
        await store.appendAgentEvent(taskId, agentId, { type: "agent-running", state: "running", message: "child Pi started in visible cmux pane", data: { cmux: pane.refs, packetPath } });
        await store.appendTaskEvent(taskId, { type: "agent-running", state: "running", message: `${agentId} running`, data: { agentId, role, profile, cmux: pane.refs, packetPath } });
    }
    catch (error) {
        const failure = startupFailure(error, "direct_spawn_startup_failed", "direct child startup transaction failed");
        const cleanup = await failStartupTransactionBestEffort(store, taskId, agentId, failure.message, failure.reason, assignmentLease !== undefined);
        return typedError("delegate_spawn", failure.code, failure.reason, {
            taskId,
            agentId,
            cmux: failure.extra.cmux ?? pane?.refs,
            preflight,
            paths: evidencePaths(store, taskId, agentId),
            authorityCleanupErrors: cleanup.authorityCleanupErrors,
            failurePersistenceErrors: cleanup.failurePersistenceErrors,
            actionTaken: cleanup.authorityCleanupErrors.length === 0
                ? "startup_failed_assignment_authority_revoked_before_best_effort_failure_persistence"
                : "startup_failed_assignment_authority_revocation_attempted_before_best_effort_failure_persistence",
        });
    }
    return {
        toolStatus: "ok",
        operation: "delegate_spawn",
        status: status.state,
        taskId,
        agentId,
        role,
        profile,
        profileKind: profileDefinition.kind,
        leaseIds,
        cmux: pane.refs,
        layout: { policy: normalizeLayoutPolicy(params.layoutPolicy, role), direction: params.direction ?? directionForRole(role), manualOverride: params.direction !== undefined },
        retention: normalizeRetention(params.retention),
        policy: {
            writeScope: compiled.writeScopes,
            allowedCommands: compiled.allowedCommands,
            tools: compiled.tools,
            leaseIds,
        },
        preflight,
        paths: evidencePaths(store, taskId, agentId),
        actionTaken: "pane_opened_child_pi_started_with_file_backed_task_packet",
    };
}
async function executeStatus(pi, params, signal, ctx) {
    const store = createStore(ctx);
    const requestedTaskId = stringOrUndefined(params.taskId);
    const envTaskId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_TASK_ID);
    const envAgentId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID);
    const taskId = requestedTaskId ?? envTaskId;
    const agentId = stringOrUndefined(params.agentId);
    const parentAlertScope = defaultParentAlertScope(taskId, agentId, envTaskId, envAgentId);
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
    result.unreadParentAlerts = await store.readParentAlerts(taskId, parentAlertScope);
    result.paths = { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson, executionMap: store.pathsForTask(taskId).executionMapJson, events: store.pathsForTask(taskId).eventsJsonl, alerts: store.pathsForTask(taskId).parentAlertsJson };
    try {
        result.task = await store.readTask(taskId);
    }
    catch (error) {
        return typedError("delegate_status", "task_not_found", messageFrom(error), { taskId, paths: result.paths, preflight: result.preflight });
    }
    try {
        result.registry = await store.readRegistry(taskId);
    }
    catch (error) {
        result.status = "degraded";
        result.degraded = appendDegraded(result.degraded, "registry_invalid", messageFrom(error), store.pathsForTask(taskId).registryJson);
        result.registry = { taskId, agents: [], degraded: true };
    }
    try {
        result.executionMap = compactExecutionMap(await store.readExecutionMap(taskId));
    }
    catch (error) {
        result.status = "degraded";
        result.degraded = appendDegraded(result.degraded, "execution_map_invalid", messageFrom(error), store.pathsForTask(taskId).executionMapJson);
        result.executionMap = { status: "degraded", packages: [], integrationOrder: [], reason: messageFrom(error) };
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
async function executeResult(pi, params, signal, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = stringOrUndefined(params.agentId);
    const store = createStore(ctx);
    if (agentId !== undefined) {
        const target = await readWaitTarget(store, taskId, agentId, "delegate_result");
        if (!target.ok)
            return target.result;
        const record = await store.readAgentResult(taskId, agentId);
        if (!record.exists) {
            const absent = parsedAgentResultSemantic({ ok: true, results: [] }, target);
            return {
                toolStatus: "ok",
                operation: "delegate_result",
                status: absent.status,
                code: absent.code,
                reason: absent.reason,
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
            executionMap: compactExecutionMap(await store.readExecutionMap(taskId)),
            unreadParentAlerts: await store.readParentAlerts(taskId, { unreadOnly: true }),
            paths: { task: store.pathsForTask(taskId).taskJson, registry: store.pathsForTask(taskId).registryJson, executionMap: store.pathsForTask(taskId).executionMapJson, alerts: store.pathsForTask(taskId).parentAlertsJson },
        };
    }
    catch (error) {
        return typedError("delegate_result", "task_not_found", messageFrom(error), { taskId, paths: { task: store.pathsForTask(taskId).taskJson } });
    }
}
async function executeFinish(params, ctx) {
    const store = createStore(ctx);
    const target = await lifecycleTarget(params, ctx, store, "delegate_finish");
    if (!target.ok)
        return target.result;
    const role = target.manifest.role;
    const validation = validateFinishPayload(params, role);
    if (!validation.ok) {
        const rejected = await store.publishTerminalOutcome(target.taskId, {
            agentId: target.agentId,
            assignmentId: target.identity.assignmentId,
            attemptId: target.identity.attemptId,
            role,
            status: typeof params.status === "string" ? params.status : "failed",
            rawText: "",
            source: { transport: "delegate_finish" },
            evidence: JSON.parse(JSON.stringify(params ?? {})),
        });
        if (rejected.status !== "rejected")
            throw new Error("invalid delegate_finish evidence unexpectedly committed");
        return typedError("delegate_finish", "result_schema_invalid", validation.reason, {
            taskId: target.taskId,
            agentId: target.agentId,
            hint: validation.hint,
            actionTaken: "rejected_terminal_evidence_recorded_without_accepted_state_mutation",
            paths: { ...evidencePaths(store, target.taskId, target.agentId), rejectedRaw: rejected.rawPath, rejectedJson: rejected.jsonPath },
        });
    }
    if (role === "planning-parent" || role === "execution-parent") {
        return finishParentReport(params, validation, target, store, role);
    }
    const payload = {
        transport: "delegate_finish",
        taskId: target.taskId,
        agentId: target.agentId,
        assignmentId: target.identity.assignmentId,
        attemptId: target.identity.attemptId,
        identitySchemaVersion: target.identity.schemaVersion,
        protocolVersion: target.identity.protocolVersion,
        role,
        status: validation.status,
        summary: validation.summary,
    };
    for (const key of ["filesChanged", "filesRead", "toolsUsed", "checks", "evidence", "findings", "assessment", "residualRisk", "recommendation", "uncertainty", "unverifiedAreas", "completionClaimSupported", "data"]) {
        if (params[key] !== undefined)
            payload[key] = params[key];
    }
    const parsed = directResultRecord(payload);
    const evidence = { summary: validation.summary, resultProjection: JSON.parse(JSON.stringify(parsed)) };
    for (const key of ["filesChanged", "filesRead", "toolsUsed", "checks", "evidence", "findings", "assessment", "residualRisk", "recommendation", "uncertainty", "unverifiedAreas", "completionClaimSupported", "data"]) {
        if (payload[key] !== undefined)
            evidence[key] = JSON.parse(JSON.stringify(payload[key]));
    }
    const publication = await store.publishTerminalOutcome(target.taskId, {
        agentId: target.agentId,
        assignmentId: target.identity.assignmentId,
        attemptId: target.identity.attemptId,
        role,
        status: validation.status,
        rawText: "",
        source: { transport: "delegate_finish" },
        evidence,
    });
    if (publication.status === "rejected") {
        return typedError("delegate_finish", "terminal_outcome_rejected", publication.reason ?? "terminal outcome rejected", {
            taskId: target.taskId,
            agentId: target.agentId,
            assignmentId: target.identity.assignmentId,
            attemptId: target.identity.attemptId,
            actionTaken: "rejected_terminal_evidence_recorded_without_accepted_state_mutation",
            paths: { rejectedRaw: publication.rawPath, rejectedJson: publication.jsonPath },
        });
    }
    const projectionPaths = store.pathsForAgent(target.taskId, target.agentId);
    const alertResult = publication.alert === undefined ? undefined : {
        alert: publication.alert,
        wakeAttempt: publication.wakeAttempt,
        wakeAttemptError: publication.wakeAttemptError,
    };
    return {
        toolStatus: "ok",
        operation: "delegate_finish",
        status: "stored",
        taskId: target.taskId,
        agentId: target.agentId,
        assignmentId: target.identity.assignmentId,
        attemptId: target.identity.attemptId,
        attemptKind: target.identity.kind,
        terminalOutcomeId: publication.outcomeId,
        commitState: publication.commitState,
        pendingEffects: publication.pendingEffects,
        recoveryReason: publication.recoveryReason,
        resultStatus: validation.status,
        agentState: publication.agentState,
        endedLeaseIds: publication.endedLeaseIds ?? [],
        alert: publication.alert ? compactAlert(publication.alert) : undefined,
        wakeDisposition: alertResult ? compactWakeDisposition(alertResult) : { status: "not_required" },
        actionTaken: publication.commitState === "committed_incomplete"
            ? "terminal_outcome_accepted_reconciliation_required"
            : "terminal_outcome_accepted_parent_alerted",
        paths: {
            raw: projectionPaths.resultRaw,
            json: projectionPaths.resultJson,
            acceptedRaw: publication.rawPath,
            acceptedJson: publication.jsonPath,
            alerts: store.pathsForTask(target.taskId).parentAlertsJson,
        },
    };
}
async function finishParentReport(params, validation, target, store, role) {
    const reportName = role === "planning-parent" ? "planning-report" : "execution-report";
    const built = buildParentReportText(params, validation, role);
    if (!built.ok) {
        const rejected = await store.publishTerminalOutcome(target.taskId, {
            agentId: target.agentId,
            assignmentId: target.identity.assignmentId,
            attemptId: target.identity.attemptId,
            role,
            status: validation.status,
            rawText: "",
            source: { transport: "delegate_finish" },
            evidence: { summary: validation.summary, submittedReport: JSON.parse(JSON.stringify(params ?? {})) },
        });
        if (rejected.status !== "rejected")
            throw new Error("invalid parent delegate_finish evidence unexpectedly committed");
        return typedError("delegate_finish", "result_schema_invalid", built.reason, {
            taskId: target.taskId,
            agentId: target.agentId,
            hint: built.hint,
            actionTaken: "rejected_terminal_evidence_recorded_without_accepted_state_mutation",
            paths: { ...evidencePaths(store, target.taskId, target.agentId), rejectedRaw: rejected.rawPath, rejectedJson: rejected.jsonPath },
        });
    }
    let report;
    let reportPaths;
    let planArtifactPath;
    let planningReadyEventId;
    let planningPublicationId;
    if (role === "planning-parent") {
        const publication = await store.publishPlanningReport(target.taskId, {
            rawText: built.rawText,
            source: {
                transport: "delegate_finish",
                agentId: target.agentId,
                assignmentId: target.identity.assignmentId,
                attemptId: target.identity.attemptId,
            },
        });
        if (publication.status === "rejected") {
            return typedError("delegate_finish", "report_schema_invalid", publication.errors?.[0]?.message ?? `${reportName} could not be parsed`, {
                taskId: target.taskId,
                agentId: target.agentId,
                actionTaken: "rejected_planning_evidence_recorded_without_accepted_state_mutation",
                paths: { ...evidencePaths(store, target.taskId, target.agentId), rejectedRaw: publication.rawPath, rejectedJson: publication.jsonPath },
            });
        }
        if (publication.commitState === "committed_incomplete") {
            return typedError("delegate_finish", "planning_report_publication_incomplete", publication.recoveryReason ?? "accepted planning report requires publication recovery", {
                taskId: target.taskId,
                agentId: target.agentId,
                commitState: publication.commitState,
                publicationId: publication.publicationId,
                actionTaken: "accepted_planning_report_committed_agent_remains_running_for_retry",
                paths: { ...evidencePaths(store, target.taskId, target.agentId), acceptedRaw: publication.rawPath, acceptedJson: publication.jsonPath },
            });
        }
        const parsed = parseModelText(built.rawText);
        report = parsed.planningReports[0];
        if (report === undefined)
            throw new Error("accepted planning publication has no parsed report");
        reportPaths = { rawPath: publication.rawPath, jsonPath: publication.jsonPath };
        planArtifactPath = publication.planArtifactPath;
        planningReadyEventId = publication.planningReadyEventId;
        planningPublicationId = publication.publicationId;
    }
    else {
        const parsed = parseModelText(built.rawText);
        report = parsed.executionReports[0];
        if (!parsed.ok || report === undefined) {
            return typedError("delegate_finish", "report_schema_invalid", compactErrors(parsed.errors)[0]?.message ?? `${reportName} could not be parsed`, { taskId: target.taskId, agentId: target.agentId, paths: evidencePaths(store, target.taskId, target.agentId) });
        }
        const taskPaths = store.pathsForTask(target.taskId);
        reportPaths = { rawPath: taskPaths.executionReportRaw, jsonPath: taskPaths.executionReportJson };
    }
    const payload = {
        transport: "delegate_finish",
        taskId: target.taskId,
        agentId: target.agentId,
        assignmentId: target.identity.assignmentId,
        attemptId: target.identity.attemptId,
        identitySchemaVersion: target.identity.schemaVersion,
        protocolVersion: target.identity.protocolVersion,
        role,
        status: validation.status,
        summary: validation.summary,
        reportName,
        reportStatus: report.status,
        data: params.data,
    };
    const agentParsed = directResultRecord({ ...payload, evidence: params.evidence, recommendation: params.recommendation });
    if (role === "planning-parent")
        agentParsed.planningReports = [report];
    else
        agentParsed.executionReports = [report];
    const evidence = {
        summary: validation.summary,
        reportName,
        reportStatus: report.status,
        resultProjection: JSON.parse(JSON.stringify(agentParsed)),
    };
    if (role === "planning-parent")
        evidence.planningPublicationId = planningPublicationId;
    else
        evidence.report = JSON.parse(JSON.stringify(report));
    for (const key of ["filesChanged", "checks", "findings", "completionClaimSupported", "recommendation", "data"]) {
        if (params[key] !== undefined)
            evidence[key] = JSON.parse(JSON.stringify(params[key]));
    }
    const publication = await store.publishTerminalOutcome(target.taskId, {
        agentId: target.agentId,
        assignmentId: target.identity.assignmentId,
        attemptId: target.identity.attemptId,
        role,
        status: validation.status,
        rawText: built.rawText,
        source: { transport: "delegate_finish" },
        evidence,
    });
    if (publication.status === "rejected") {
        return typedError("delegate_finish", "terminal_outcome_rejected", publication.reason ?? "terminal parent outcome rejected", {
            taskId: target.taskId,
            agentId: target.agentId,
            reportName,
            actionTaken: "rejected_terminal_evidence_recorded_without_accepted_state_mutation",
            paths: { rejectedRaw: publication.rawPath, rejectedJson: publication.jsonPath },
        });
    }
    const resultPaths = store.pathsForAgent(target.taskId, target.agentId);
    const alertResult = publication.alert === undefined ? undefined : {
        alert: publication.alert,
        wakeAttempt: publication.wakeAttempt,
        wakeAttemptError: publication.wakeAttemptError,
    };
    return {
        toolStatus: "ok",
        operation: "delegate_finish",
        status: "stored",
        taskId: target.taskId,
        agentId: target.agentId,
        assignmentId: target.identity.assignmentId,
        attemptId: target.identity.attemptId,
        attemptKind: target.identity.kind,
        terminalOutcomeId: publication.outcomeId,
        commitState: publication.commitState,
        pendingEffects: publication.pendingEffects,
        recoveryReason: publication.recoveryReason,
        resultStatus: validation.status,
        reportName,
        reportStatus: report.status,
        planningReadyEventId,
        planArtifactPath,
        agentState: publication.agentState,
        endedLeaseIds: publication.endedLeaseIds ?? [],
        alert: publication.alert ? compactAlert(publication.alert) : undefined,
        wakeDisposition: alertResult ? compactWakeDisposition(alertResult) : { status: "not_required" },
        actionTaken: publication.commitState === "committed_incomplete"
            ? "terminal_outcome_accepted_reconciliation_required"
            : "terminal_outcome_accepted_parent_alerted",
        paths: {
            raw: reportPaths.rawPath,
            json: reportPaths.jsonPath,
            resultJson: resultPaths.resultJson,
            acceptedRaw: publication.rawPath,
            acceptedJson: publication.jsonPath,
            alerts: store.pathsForTask(target.taskId).parentAlertsJson,
        },
    };
}
function buildParentReportText(params, validation, role) {
    if (role === "planning-parent")
        return buildPlanningReportText(params, validation);
    return buildExecutionReportText(params, validation);
}
function buildPlanningReportText(params, validation) {
    const reportStatus = stringOrUndefined(params.reportStatus) ?? (validation.status === "completed_with_risks" ? "ready_with_open_questions" : validation.status === "blocked" || validation.status === "failed" ? "blocked" : "ready");
    const planArtifactPath = reportField(params, "planArtifactPath");
    const rows = [
        ["STATUS", reportStatus],
        ["GOAL", reportField(params, "goal")],
        ...(planArtifactPath === undefined ? [] : [["PLAN_ARTIFACT_PATH", planArtifactPath]]),
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
function buildExecutionReportText(params, validation) {
    const reportStatus = stringOrUndefined(params.reportStatus) ?? validation.status;
    const rows = [
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
function buildReportBlock(kind, rows) {
    const missing = rows.filter(([, value]) => value === undefined || value.trim().length === 0).map(([tag]) => tag);
    if (missing.length > 0) {
        return { ok: false, reason: `${kind} delegate_finish is missing required report field(s): ${missing.join(", ")}`, hint: "Provide parent report fields as top-level camelCase parameters or under data." };
    }
    return { ok: true, rawText: [kind, ...rows.map(([tag, value]) => formatReportRow(tag, value ?? "")), `END_${kind}`].join("\n") };
}
function reportField(params, key) {
    const value = params[key] ?? params.data?.[key];
    if (value === undefined || value === null)
        return undefined;
    if (Array.isArray(value)) {
        const parts = value.map((item) => reportValuePart(item)).filter((item) => item.length > 0);
        return parts.length > 0 ? parts.join(", ") : undefined;
    }
    return reportValuePart(value) || undefined;
}
function reportValuePart(value) {
    if (value === undefined || value === null)
        return "";
    if (typeof value === "string")
        return value.trim();
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
function formatReportRow(tag, value) {
    return `${tag}|${String(value).replace(/\r\n|\r|\n/g, " ").replace(/\|/g, "¦")}`;
}
async function executeAttention(params, ctx) {
    const store = createStore(ctx);
    const target = await lifecycleTarget(params, ctx, store, "delegate_attention");
    if (!target.ok)
        return target.result;
    const message = requireString(params.message, "message");
    const level = stringOrUndefined(params.level) ?? "attention";
    const terminal = params.terminal === true || level === "blocked" || level === "failed" || level === "capability_gap";
    const state = level === "blocked" || level === "capability_gap" ? "blocked" : level === "failed" ? "failed" : terminal ? "attention" : "waiting_for_parent";
    const outcome = level === "capability_gap" ? "capability_gap" : state === "blocked" ? "blocked" : state === "failed" ? "failed" : "attention";
    const status = await store.writeAgentStatus(target.taskId, target.agentId, { state: state, message, reason: terminal ? message : undefined });
    const endedLeases = terminal
        ? await store.endActiveAssignmentLeases(target.taskId, target.agentId, "revoked", `delegate_attention ${level}`)
        : { leaseIds: [] };
    const event = await store.appendAgentEvent(target.taskId, target.agentId, { type: "agent-attention", state: state, message, data: params.data });
    await store.appendTaskEvent(target.taskId, { type: "agent-attention", state: state, message, data: { agentId: target.agentId, level, ...(params.data ?? {}) } });
    const alert = await store.queueParentAlert(target.taskId, { agentId: target.agentId, outcome: outcome, state: state, eventType: "agent-attention", sourceEventId: event.eventId, message, data: params.data });
    return {
        toolStatus: "ok",
        operation: "delegate_attention",
        status: status.state,
        taskId: target.taskId,
        agentId: target.agentId,
        endedLeaseIds: endedLeases.leaseIds,
        alert: compactAlert(alert.alert),
        wakeDisposition: compactWakeDisposition(alert),
        actionTaken: "attention_stored_parent_alerted",
        paths: evidencePaths(store, target.taskId, target.agentId),
    };
}
async function executeProgress(params, ctx) {
    const store = createStore(ctx);
    const target = await lifecycleTarget(params, ctx, store, "delegate_progress");
    if (!target.ok)
        return target.result;
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
async function executeInbox(params, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const store = createStore(ctx);
    const scope = parentAlertScopeFromParams(params, taskId, "delegate_inbox", params.unreadOnly !== false);
    if (!scope.ok)
        return scope.result;
    const alerts = sortParentAlerts(await store.readParentAlerts(taskId, scope.options));
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
async function executeAckAlert(params, ctx) {
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
async function executeAckAll(params, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const store = createStore(ctx);
    const scope = parentAlertScopeFromParams(params, taskId, "delegate_ack_all", true);
    if (!scope.ok)
        return scope.result;
    const candidates = await store.readParentAlerts(taskId, scope.options);
    const read = await store.markParentAlertsRead(taskId, candidates.map((alert) => alert.alertId));
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
async function executeUserAttention(params, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const summary = requireString(params.summary, "summary");
    const level = stringOrUndefined(params.level) ?? "needs_review";
    const store = createStore(ctx);
    const agentId = stringOrUndefined(params.agentId);
    const alert = await store.queueParentAlert(taskId, { agentId, outcome: "user_attention", state: "attention", eventType: "user-attention", message: summary, dedupeKey: ["user", taskId, agentId ?? "task", level, summary].join(":"), data: { level } });
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
        wakeDisposition: compactWakeDisposition(alert),
        actionTaken: params.notify === false ? "user_attention_stored_without_notification" : "user_attention_stored_and_notified",
        paths: { alerts: store.pathsForTask(taskId).parentAlertsJson },
    };
}
async function executeUpdateExecutionMap(params, ctx) {
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
async function executeSend(pi, params, signal, ctx) {
    const taskId = validateSafeId(requireString(params.taskId, "taskId"), "task id");
    const agentId = validateSafeId(requireString(params.agentId, "agentId"), "agent id");
    const message = requireString(params.message, "message");
    const kind = stringOrUndefined(params.kind) ?? "note";
    const store = createStore(ctx);
    const target = await resolveValidTarget(store, taskId, agentId, "delegate_send");
    if (!target.ok)
        return target.result;
    if (isTerminalState(target.status.state)) {
        return typedError("delegate_send", "target_terminal_requires_new_attempt", "cannot send a follow-up to a terminal agent; spawn a new child or create an explicit new attempt", { taskId, agentId, state: target.status.state, paths: evidencePaths(store, taskId, agentId) });
    }
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
        await store.endActiveAssignmentLeases(taskId, agentId, "revoked", "delegate_cancel observed already closed target");
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
        await store.endActiveAssignmentLeases(taskId, agentId, "revoked", "delegate_cancel retry observed terminal target");
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
    if (reconciliation !== undefined)
        return reconciliation;
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
    const endedLeases = await store.endActiveAssignmentLeases(taskId, agentId, "revoked", "delegate_cancel terminal lifecycle");
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
        endedLeaseIds: endedLeases.leaseIds,
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
    if (reportName === "planning-report") {
        const envTaskId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_TASK_ID);
        const envAgentId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID);
        const envAttemptId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_ATTEMPT_ID);
        let source = { transport: "delegate_record_report" };
        if (envTaskId !== undefined || envAgentId !== undefined || envAttemptId !== undefined) {
            const target = await lifecycleTarget({ taskId, agentId: envAgentId }, ctx, store, "delegate_record_report");
            if (!target.ok)
                return target.result;
            if (target.manifest.role !== "planning-parent" || target.manifest.profile !== "planning-parent") {
                return typedError("delegate_record_report", "planning_report_role_forbidden", "delegated planning-report publication requires the current planning-parent assignment", {
                    taskId,
                    agentId: target.agentId,
                    role: target.manifest.role,
                    profile: target.manifest.profile,
                });
            }
            source = {
                transport: "delegate_record_report",
                agentId: target.agentId,
                assignmentId: target.identity.assignmentId,
                attemptId: target.identity.attemptId,
            };
        }
        const publication = await store.publishPlanningReport(taskId, {
            rawText,
            source,
        });
        if (publication.status === "rejected") {
            const alert = await store.queueParentAlert(taskId, {
                outcome: "failed",
                state: "failed",
                eventType: "planning_report.rejected",
                sourceEventId: publication.eventId,
                message: "planning-report malformed",
                evidence: { rawPath: publication.rawPath, jsonPath: publication.jsonPath },
            });
            return {
                toolStatus: "ok",
                operation: "delegate_record_report",
                status: "failed",
                code: "report_malformed",
                taskId,
                reportName,
                errors: publication.errors ?? [],
                alert: compactAlert(alert.alert),
                paths: { raw: publication.rawPath, json: publication.jsonPath, alerts: store.pathsForTask(taskId).parentAlertsJson },
            };
        }
        const state = stateForRecordedReport(reportName, publication.reportStatus);
        let terminalPublication;
        if (source.agentId !== undefined) {
            const parsed = parseModelText(rawText);
            const projection = {
                ...parsed,
                assignmentId: source.assignmentId,
                attemptId: source.attemptId,
                identitySchemaVersion: 1,
                protocolVersion: 1,
            };
            terminalPublication = await store.publishTerminalOutcome(taskId, {
                agentId: source.agentId,
                assignmentId: source.assignmentId,
                attemptId: source.attemptId,
                role: "planning-parent",
                status: publication.reportStatus === "blocked" ? "blocked" : publication.reportStatus === "failed" ? "failed" : "completed",
                rawText,
                source: { transport: "delegate_record_report" },
                evidence: {
                    summary: `Planning report ${publication.reportStatus ?? "accepted"}.`,
                    reportName: "planning-report",
                    reportStatus: publication.reportStatus,
                    planningPublicationId: publication.publicationId,
                    resultProjection: JSON.parse(JSON.stringify(projection)),
                },
            });
            if (terminalPublication.status === "rejected") {
                return typedError("delegate_record_report", "terminal_outcome_rejected", terminalPublication.reason ?? "planning parent terminal outcome rejected", {
                    taskId,
                    agentId: source.agentId,
                    paths: { rejectedRaw: terminalPublication.rawPath, rejectedJson: terminalPublication.jsonPath },
                });
            }
        }
        const outcome = alertOutcomeForRecordedReport(reportName, publication.reportStatus, state);
        const rootAlert = source.agentId === undefined && outcome !== undefined ? await store.queueParentAlert(taskId, {
            outcome: outcome,
            state: state,
            status: publication.reportStatus,
            eventType: "planning_report.accepted",
            sourceEventId: publication.eventId,
            message: `planning-report recorded${publication.reportStatus ? `: ${publication.reportStatus}` : ""}`,
            evidence: { rawPath: publication.rawPath, jsonPath: publication.jsonPath },
        }) : undefined;
        const alert = terminalPublication?.alert ?? rootAlert?.alert;
        return {
            toolStatus: "ok",
            operation: "delegate_record_report",
            status: state,
            reportStatus: publication.reportStatus,
            taskId,
            reportName,
            terminalOutcomeId: terminalPublication?.outcomeId,
            planningReadyEventId: publication.planningReadyEventId,
            planArtifactPath: publication.planArtifactPath,
            commitState: terminalPublication?.commitState ?? publication.commitState,
            pendingEffects: terminalPublication?.pendingEffects,
            recoveryReason: terminalPublication?.recoveryReason ?? publication.recoveryReason,
            alert: alert ? compactAlert(alert) : undefined,
            paths: {
                raw: publication.rawPath,
                json: publication.jsonPath,
                ...(terminalPublication === undefined ? {} : { acceptedRaw: terminalPublication.rawPath, acceptedJson: terminalPublication.jsonPath }),
                alerts: store.pathsForTask(taskId).parentAlertsJson,
            },
        };
    }
    if (reportName === "execution-report") {
        const envTaskId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_TASK_ID);
        const envAgentId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID);
        if (envTaskId === undefined || envAgentId === undefined) {
            return typedError("delegate_record_report", "delegated_lifecycle_identity_required", "execution-report publication is available only to the current delegated execution parent", { taskId, reportName });
        }
        const target = await lifecycleTarget({ taskId, agentId: envAgentId }, ctx, store, "delegate_record_report");
        if (!target.ok)
            return target.result;
        if (target.manifest.role !== "execution-parent" || target.manifest.profile !== "execution-parent") {
            return typedError("delegate_record_report", "execution_report_role_forbidden", "delegated execution-report publication requires the current execution-parent assignment", {
                taskId,
                agentId: target.agentId,
                role: target.manifest.role,
                profile: target.manifest.profile,
            });
        }
        const parsed = parseModelText(rawText);
        const report = parsed.executionReports[0];
        const summary = report?.fields?.SUMMARY?.[0]?.[0];
        const reportStatus = report?.status;
        const terminalStatus = reportStatus === "blocked" ? "blocked"
            : reportStatus === "failed" ? "failed"
                : reportStatus === "cancelled" ? "cancelled"
                    : reportStatus === "completed_with_risks" ? "completed_with_risks"
                        : "completed";
        const evidence = !parsed.ok || report === undefined
            ? { parseErrors: compactErrors(report === undefined ? [{ lineNumber: 1, message: "execution-report block was not found" }, ...parsed.errors] : parsed.errors) }
            : {
                summary: typeof summary === "string" && summary.trim().length > 0 ? summary : `Execution report ${reportStatus ?? "accepted"}.`,
                reportName: "execution-report",
                reportStatus,
                report: JSON.parse(JSON.stringify(report)),
                reportRawText: report.rawText,
                resultProjection: JSON.parse(JSON.stringify({
                    ...parsed,
                    assignmentId: target.identity.assignmentId,
                    attemptId: target.identity.attemptId,
                    identitySchemaVersion: target.identity.schemaVersion,
                    protocolVersion: target.identity.protocolVersion,
                })),
            };
        const publication = await store.publishTerminalOutcome(taskId, {
            agentId: target.agentId,
            assignmentId: target.identity.assignmentId,
            attemptId: target.identity.attemptId,
            role: target.manifest.role,
            status: terminalStatus,
            rawText,
            source: { transport: "delegate_record_report" },
            evidence,
        });
        if (publication.status === "rejected") {
            return {
                toolStatus: "ok",
                operation: "delegate_record_report",
                status: "attention",
                code: "report_malformed",
                taskId,
                agentId: target.agentId,
                reportName,
                reason: publication.reason,
                actionTaken: "rejected_terminal_evidence_recorded_without_accepted_state_mutation",
                paths: { raw: publication.rawPath, json: publication.jsonPath },
            };
        }
        const alertResult = publication.alert === undefined ? undefined : {
            alert: publication.alert,
            wakeAttempt: publication.wakeAttempt,
            wakeAttemptError: publication.wakeAttemptError,
        };
        return {
            toolStatus: "ok",
            operation: "delegate_record_report",
            status: stateForRecordedReport(reportName, reportStatus),
            reportStatus,
            taskId,
            agentId: target.agentId,
            terminalOutcomeId: publication.outcomeId,
            commitState: publication.commitState,
            pendingEffects: publication.pendingEffects,
            recoveryReason: publication.recoveryReason,
            alert: publication.alert ? compactAlert(publication.alert) : undefined,
            wakeDisposition: alertResult ? compactWakeDisposition(alertResult) : { status: "not_required" },
            paths: {
                raw: store.pathsForTask(taskId).executionReportRaw,
                json: store.pathsForTask(taskId).executionReportJson,
                acceptedRaw: publication.rawPath,
                acceptedJson: publication.jsonPath,
            },
        };
    }
    await store.initTask({ taskId });
    const parsed = parseModelText(rawText);
    const reportsByName = {
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
    const reportStatus = report.status;
    const paths = await store.recordTaskReport(taskId, reportName, report.rawText, report);
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
        await store.endActiveAssignmentLeases(taskId, agentId, "revoked", "delegate_close retry observed terminal target");
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
    if (reconciliation !== undefined)
        return reconciliation;
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
    const endedLeases = await store.endActiveAssignmentLeases(taskId, agentId, "revoked", "delegate_close terminal lifecycle");
    await store.appendAgentEvent(taskId, agentId, { type: "agent-closed", state: "closed", message: "cmux surface closed; evidence preserved", data: { surfaceRef: target.manifest.surfaceRef } });
    await store.appendTaskEvent(taskId, { type: "agent-closed", state: "closed", message: `${agentId} closed`, data: { agentId, surfaceRef: target.manifest.surfaceRef } });
    return {
        toolStatus: "ok",
        operation: "delegate_close",
        status: status.state,
        taskId,
        agentId,
        actionTaken: target.status.state === "cancelled" ? "cmux_close_surface_called_for_cancelled_target_evidence_preserved" : "cmux_close_surface_called_evidence_preserved",
        endedLeaseIds: endedLeases.leaseIds,
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
function defaultParentAlertScope(taskId, agentId, envTaskId, envAgentId) {
    const scope = { unreadOnly: true };
    if (agentId !== undefined) {
        scope.agentId = agentId;
        return scope;
    }
    if (taskId !== undefined && envTaskId !== undefined && taskId === envTaskId && envAgentId !== undefined) {
        scope.parentAgentId = envAgentId;
    }
    return scope;
}
function parentAlertScopeFromParams(params, taskId, operation, unreadOnly) {
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
    const options = { unreadOnly };
    if (explicitAgentId !== undefined)
        options.agentId = explicitAgentId;
    if (explicitParentAgentId !== undefined)
        options.parentAgentId = explicitParentAgentId;
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
function currentDelegatedParentAgentIdForTask(taskId) {
    const envTaskId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_TASK_ID);
    const envAgentId = stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID);
    return envTaskId === taskId ? envAgentId : undefined;
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
function compactExecutionMap(executionMap) {
    if (!executionMap || typeof executionMap !== "object")
        return undefined;
    return {
        version: executionMap.version,
        taskId: executionMap.taskId,
        updatedAt: executionMap.updatedAt,
        integrationOrder: Array.isArray(executionMap.integrationOrder) ? executionMap.integrationOrder : [],
        packages: Array.isArray(executionMap.packages)
            ? executionMap.packages.map((pkg) => ({
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
                commitCheckpoints: Array.isArray(pkg.commitCheckpoints) ? pkg.commitCheckpoints.map((checkpoint) => ({ checkpointId: checkpoint.checkpointId, status: checkpoint.status, intendedFiles: checkpoint.intendedFiles })) : [],
            }))
            : [],
    };
}
function compactParsedAgentResult(parsed) {
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
function compactDirectResult(direct) {
    if (!direct || typeof direct !== "object")
        return undefined;
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
function directResultRecord(payload) {
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
                checks: Array.isArray(payload.checks) ? payload.checks.map((check, index) => ({ tag: "CHECK", fields: [check.name, check.status, check.outputId ? `outputId=${check.outputId}` : "", check.evidence ?? check.notes ?? ""].filter(Boolean), lineNumber: index + 1 })) : [],
                evidence: Array.isArray(payload.evidence) ? payload.evidence.map((item, index) => ({ tag: "EVIDENCE", fields: [item.label, item.outputId ? `outputId=${item.outputId}` : `path=${item.path ?? ""}`, item.lines ? `lines=${item.lines}` : "", item.note ?? ""].filter(Boolean), lineNumber: index + 1 })) : [],
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
        priority: alertPriority(alert),
        alertState: alert.alertState ?? (alert.readAt === undefined ? "queued" : "acked"),
        outcome: alert.outcome,
        state: alert.state,
        status: alert.status,
        message: alert.message,
        evidence: alert.evidence,
        escalatedFromAlertId: alert.escalatedFromAlertId,
        createdAt: alert.createdAt,
    };
}
function compactWakeDisposition(result) {
    if (result?.wakeAttemptError) {
        return { status: "degraded", transport: "next-turn-context", reason: result.wakeAttemptError };
    }
    if (result?.wakeAttempt) {
        return {
            status: result.wakeAttempt.outcome,
            attemptId: result.wakeAttempt.attemptId,
            transport: result.wakeAttempt.transport,
        };
    }
    return { status: "not_required" };
}
function sortParentAlerts(alerts) {
    return [...alerts].sort((left, right) => {
        const priorityDelta = alertPriorityRank(alertPriority(left)) - alertPriorityRank(alertPriority(right));
        if (priorityDelta !== 0)
            return priorityDelta;
        const createdDelta = String(left?.createdAt ?? "").localeCompare(String(right?.createdAt ?? ""));
        if (createdDelta !== 0)
            return createdDelta;
        return String(left?.alertId ?? "").localeCompare(String(right?.alertId ?? ""));
    });
}
function alertPriorityRank(priority) {
    return priority === "P0" ? 0 : priority === "P1" ? 1 : priority === "P2" ? 2 : 3;
}
function alertPriority(alert) {
    if (alert?.priority === "P0" || alert?.priority === "P1" || alert?.priority === "P2" || alert?.priority === "P3") {
        return alert.priority;
    }
    try {
        return priorityForParentAlert(alert);
    }
    catch {
        return "P3";
    }
}
async function lifecycleTarget(params, ctx, store, operation) {
    const envTask = stringOrUndefined(process.env.FREEFLOW_DELEGATION_TASK_ID);
    const envAgent = stringOrUndefined(process.env.FREEFLOW_DELEGATION_AGENT_ID);
    const envAttempt = stringOrUndefined(process.env.FREEFLOW_DELEGATION_ATTEMPT_ID);
    if (["delegate_finish", "delegate_attention", "delegate_progress"].includes(operation) && (envTask === undefined || envAgent === undefined)) {
        return {
            ok: false,
            result: typedError(operation, "delegated_lifecycle_identity_required", `${operation} is available only to the current delegated assignment; parent recovery uses a distinct parent-control operation`),
        };
    }
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
    let manifest;
    let status;
    try {
        manifest = await store.readAgentManifest(taskId, agentId);
        status = await store.readAgentStatus(taskId, agentId);
    }
    catch (error) {
        return { ok: false, result: typedError(operation, "target_not_found", messageFrom(error), { taskId, agentId }) };
    }
    try {
        const identity = resolveAssignmentAttemptIdentity({ manifest, status, environmentAttemptId: envAttempt });
        const delegatedEnvironment = envTask !== undefined || envAgent !== undefined;
        if (delegatedEnvironment && identity.kind === "versioned" && envAttempt === undefined) {
            return { ok: false, result: typedError(operation, "missing_lifecycle_attempt_identity", "FREEFLOW_DELEGATION_ATTEMPT_ID is required for a versioned delegated assignment", { taskId, agentId, attemptId: identity.attemptId }) };
        }
        if (identity.kind === "legacy_synthetic") {
            try {
                const view = await store.readActiveLeaseView(taskId);
                const legacyLease = findActiveLegacyAssignmentLease({
                    taskId,
                    agentId,
                    assignmentId: identity.assignmentId,
                    syntheticAttemptId: identity.attemptId,
                    role: manifest.role,
                    activeLeases: activeLeasesForAgent(view, agentId),
                });
                if (legacyLease === undefined) {
                    return { ok: false, result: typedError(operation, "legacy_finish_lease_missing", "synthetic legacy completion requires an existing same-assignment active lease", { taskId, agentId, attemptId: identity.attemptId }) };
                }
            }
            catch (error) {
                return { ok: false, result: typedError(operation, "legacy_finish_lease_missing", `synthetic legacy completion requires readable existing active lease evidence: ${messageFrom(error)}`, { taskId, agentId, attemptId: identity.attemptId }) };
            }
        }
        if (identity.kind === "versioned") {
            try {
                const canonicalPacketPath = store.pathsForAgent(taskId, agentId).taskPacketRaw;
                if (manifest.modelTaskPacketPath !== canonicalPacketPath) {
                    throw new Error(`manifest task packet path ${manifest.modelTaskPacketPath} does not match canonical ${canonicalPacketPath}`);
                }
                validateTaskPacketIdentity(await readFile(canonicalPacketPath, "utf8"), {
                    taskId,
                    agentId,
                    assignmentId: identity.assignmentId,
                    attemptId: identity.attemptId,
                    role: manifest.role,
                    profile: manifest.profile,
                    identitySchemaVersion: identity.schemaVersion,
                    profileSchemaVersion: identity.profileSchemaVersion,
                    protocolVersion: identity.protocolVersion,
                });
            }
            catch (error) {
                return { ok: false, result: typedError(operation, "lifecycle_packet_identity_mismatch", messageFrom(error), { taskId, agentId, attemptId: identity.attemptId }) };
            }
        }
        return { ok: true, taskId, agentId, manifest, status, identity };
    }
    catch (error) {
        const reason = messageFrom(error);
        const code = /environment attempt .* does not match manifest attempt/i.test(reason)
            ? "lifecycle_attempt_mismatch"
            : "lifecycle_identity_invalid";
        return { ok: false, result: typedError(operation, code, reason, { taskId, agentId }) };
    }
}
function validateFinishPayload(params, role) {
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
async function maybeAutoCloseAfterResultRead(pi, signal, ctx, store, taskId, agentId, target, compact, semantic) {
    let manifest;
    try {
        manifest = await store.readAgentManifest(taskId, agentId);
    }
    catch (error) {
        return { mode: "unknown", action: "not_closed", reason: messageFrom(error) };
    }
    const mode = manifest.retention ?? "auto";
    if (mode !== "auto")
        return { mode, action: "kept_open" };
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
    }
    catch (error) {
        await store.appendAgentEvent(taskId, agentId, { type: "agent-auto-close-failed", state: "attention", message: messageFrom(error), data: { previousState: target.state } });
        return { mode, action: "close_failed", reason: messageFrom(error) };
    }
}
function shouldAutoCloseRoleResult(role, compact, semantic, target) {
    if (semantic.status !== "ok" || target.state !== "completed")
        return false;
    if (role === "researcher")
        return true;
    if (role === "verifier")
        return verifierResultPassing(compact);
    if (role === "reviewer")
        return reviewerResultPassing(compact);
    return false;
}
function reviewerResultPassing(compact) {
    const findings = compact?.direct?.findings;
    if (Array.isArray(findings)) {
        return findings.every((finding) => finding?.severity === "non_blocking");
    }
    const first = compact?.results?.[0];
    return first?.status === "completed" && (!Array.isArray(first?.blockers) || first.blockers.length === 0);
}
function verifierResultPassing(compact) {
    const direct = compact?.direct;
    if (direct?.completionClaimSupported === false)
        return false;
    const checks = Array.isArray(direct?.checks) ? direct.checks : [];
    if (checks.length > 0)
        return checks.every((check) => check?.status === "pass" || check?.status === "skipped");
    const first = compact?.results?.[0];
    return first?.status === "completed";
}
function appendDegraded(existing, code, reason, path) {
    return [...(Array.isArray(existing) ? existing : []), { code, reason, path, recovery: "inspect the JSON file or regenerate through harness tools" }];
}
function activeToolsForSpawn(pi, requestedTools) {
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
    const available = new Set(allTools.map((tool) => tool?.name).filter((name) => typeof name === "string"));
    return { ok: true, tools: requestedTools.filter((tool) => available.has(tool)) };
}
function routeActionFromParams(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("action with kind and breadth is required");
    }
    const input = value;
    const action = {
        kind: requireString(input.kind, "action.kind"),
        breadth: requireString(input.breadth, "action.breadth"),
    };
    const description = stringOrUndefined(input.description);
    if (description !== undefined)
        action.description = description;
    return action;
}
async function lookupStoredExecutionAuthorization(store, taskId, callerProvided) {
    try {
        const evidence = await store.readExecutionAuthorization(taskId);
        if (evidence !== undefined) {
            return {
                present: true,
                source: "store",
                callerProvided,
                callerEvidenceUsed: false,
                taskState: evidence.taskState,
                planArtifactPath: evidence.planArtifactPath,
                approvedBy: evidence.approvedBy,
                evidence,
            };
        }
        return { present: false, source: "missing", callerProvided, callerEvidenceUsed: false };
    }
    catch (error) {
        return { present: false, source: "error", callerProvided, callerEvidenceUsed: false, reason: messageFrom(error) };
    }
}
async function readStoredRouteDecision(store, taskId, routeId) {
    let records;
    try {
        records = await store.readRouteDecisions(taskId);
    }
    catch (error) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "route_decisions_malformed", messageFrom(error), {
                status: "failed",
                taskId,
                routeId,
                actionTaken: "no_route_application_or_layout_state_mutated",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    const record = records.filter((candidate) => candidate.routeId === routeId).at(-1);
    if (record === undefined) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "route_decision_missing", `stored route decision not found: ${routeId}`, {
                status: "failed",
                taskId,
                routeId,
                actionTaken: "no_route_application_or_layout_state_mutated",
                nextAction: "call delegate_route first and then apply the stored routeId",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    return { ok: true, record };
}
async function readStoredRouteApplication(store, taskId, routeId) {
    try {
        const applications = await store.readRouteApplications(taskId);
        return { ok: true, application: applications.find((application) => application.routeId === routeId) };
    }
    catch (error) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "route_applications_malformed", messageFrom(error), {
                status: "failed",
                taskId,
                routeId,
                actionTaken: "no_route_application_or_layout_state_mutated",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
}
async function classifyLegacyParentRouteApplication(store, taskId, routeId, decision, application) {
    if (decision?.kind !== "route_required" || (decision.targetRole !== "planning-parent" && decision.targetRole !== "execution-parent")) {
        return undefined;
    }
    const role = decision.targetRole;
    const agentId = parentRouteAgentId(role);
    let manifest;
    let status;
    try {
        [manifest, status] = await Promise.all([
            store.readAgentManifest(taskId, agentId),
            store.readAgentStatus(taskId, agentId),
        ]);
    }
    catch (error) {
        return legacyParentRouteAttention(store, {
            taskId,
            routeId,
            agentId,
            role,
            decision,
            application,
            classification: "legacy_incomplete",
            code: "legacy_parent_application_incomplete",
            status: "attention_required",
            reason: `stored parent route application has no complete manifest/status/running evidence: ${messageFrom(error)}`,
            eventType: "legacy-parent-application-incomplete",
            nextAction: "keep historical route/layout evidence; create a routed-recovery attempt through the startup coordinator before treating this parent as applied",
        });
    }
    let identity;
    try {
        identity = resolveAssignmentAttemptIdentity({ manifest, status });
    }
    catch (error) {
        return legacyParentRouteAttention(store, {
            taskId,
            routeId,
            agentId,
            role,
            decision,
            application,
            classification: "legacy_invalid",
            code: "legacy_parent_identity_invalid",
            status: "attention_required",
            reason: messageFrom(error),
            eventType: "legacy-parent-identity-invalid",
            nextAction: "inspect preserved manifest/status evidence and route a new parent attempt; do not rewrite or resend the old startup blindly",
        });
    }
    if (identity.kind === "legacy_synthetic") {
        const recoveryAttemptId = deriveRoutedRecoveryAttemptId(routeId);
        return legacyParentRouteAttention(store, {
            taskId,
            routeId,
            agentId,
            role,
            decision,
            application,
            classification: "legacy_recovery_candidate",
            code: "legacy_parent_recovery_required",
            status: "recovery_required",
            reason: "stored legacy parent is visibly running, but its synthetic attempt is finish-only and cannot be adopted as new routed authority without the startup coordinator",
            eventType: "legacy-parent-recovery-required",
            nextAction: "use the startup coordinator to adopt visible evidence into the routed-recovery attempt without resending the launch command",
            recovery: {
                authority: "routed_recovery",
                attemptId: recoveryAttemptId,
                sourceAttemptId: identity.attemptId,
                resendAllowed: false,
            },
        });
    }
    const active = ["running", "waiting_for_parent", "attention", "attention_required"].includes(status.state);
    if (!active || !stringOrUndefined(manifest.surfaceRef) || !stringOrUndefined(manifest.launchCommand)) {
        return legacyParentRouteAttention(store, {
            taskId,
            routeId,
            agentId,
            role,
            decision,
            application,
            classification: "legacy_incomplete",
            code: "legacy_parent_application_incomplete",
            status: "attention_required",
            reason: "stored parent route application lacks active status, visible surface, or launch evidence",
            eventType: "legacy-parent-application-incomplete",
            nextAction: "keep historical route/layout evidence and create a new routed-recovery attempt through the startup coordinator",
        });
    }
    return undefined;
}
async function legacyParentRouteAttention(store, input) {
    const event = await store.appendTaskEvent(input.taskId, {
        type: input.eventType,
        state: "attention_required",
        message: input.reason,
        data: {
            routeId: input.routeId,
            agentId: input.agentId,
            role: input.role,
            classification: input.classification,
            applicationId: input.application.applicationId,
            ...(input.recovery === undefined ? {} : { recovery: input.recovery }),
        },
    });
    await store.queueParentAlert(input.taskId, {
        agentId: input.agentId,
        parentAgentId: "orchestrator",
        outcome: "attention",
        state: "attention_required",
        eventType: input.eventType,
        sourceEventId: event.eventId,
        message: input.reason,
        dedupeKey: `${input.eventType}:${input.taskId}:${input.routeId}`,
        data: {
            routeId: input.routeId,
            classification: input.classification,
            applicationId: input.application.applicationId,
            ...(input.recovery === undefined ? {} : { recovery: input.recovery }),
        },
    });
    return typedError("delegate_apply_route", input.code, input.reason, {
        status: input.status,
        taskId: input.taskId,
        routeId: input.routeId,
        agentId: input.agentId,
        target: input.role,
        decision: input.decision,
        routeApplication: input.application,
        legacy: { classification: input.classification, historicalEvidencePreserved: true },
        recovery: input.recovery,
        actionTaken: "legacy_route_classified_parent_attention_recorded_no_route_layout_registry_packet_or_cmux_mutation",
        nextAction: input.nextAction,
        paths: applyRoutePaths(store, input.taskId),
    });
}
async function alreadyAppliedRouteResult(store, taskId, routeId, decision, application) {
    const allocationResult = await layoutAllocationForAlreadyAppliedRoute(store, taskId, routeId, decision, application);
    if (!allocationResult.ok)
        return allocationResult.result;
    const completeness = validateAlreadyAppliedChildRouteHasTarget(store, taskId, routeId, decision, application);
    if (!completeness.ok)
        return completeness.result;
    const allocation = allocationResult.allocation;
    const displayApplication = { ...application, state: "already_applied" };
    const materialization = childMaterializationFor(decision, allocation, displayApplication);
    const appliedAgentId = childRouteApplicationAgentId(displayApplication);
    return {
        toolStatus: "ok",
        operation: "delegate_apply_route",
        status: "already_applied",
        code: "route_already_applied",
        taskId,
        routeId,
        agentId: appliedAgentId,
        spawned: displayApplication.spawned ?? [],
        reused: displayApplication.reused ?? [],
        kind: decision.kind,
        target: routeTargetLabel(decision),
        decision,
        application: displayApplication,
        routeApplication: displayApplication,
        layout: compactLayoutAllocation(allocation),
        materialization,
        actionTaken: materialization
            ? "existing_child_route_application_reused_no_cmux_new_pane_or_task_packet"
            : "existing_route_application_reused_no_new_layout_or_cmux_action",
        nextAction: nextApplyRouteAction(decision, displayApplication, allocation),
        paths: applyRoutePaths(store, taskId),
    };
}
function appliedRouteResult(store, taskId, routeId, decision, application, recorded, allocation, authorization = undefined, extra = {}) {
    const status = recorded ? "applied" : "already_applied";
    const displayApplication = recorded ? application : { ...application, state: "already_applied" };
    const materialization = childMaterializationFor(decision, allocation, displayApplication);
    const appliedAgentId = childRouteApplicationAgentId(displayApplication);
    const defaultActionTaken = recorded
        ? (materialization ? "child_route_spawn_or_reuse_recorded" : "route_application_recorded_no_cmux_or_spawn_called")
        : (materialization ? "existing_child_route_application_reused_no_cmux_new_pane_or_task_packet" : "existing_route_application_reused_no_new_layout_or_cmux_action");
    return {
        toolStatus: "ok",
        operation: "delegate_apply_route",
        status,
        code: recorded ? undefined : "route_already_applied",
        taskId,
        routeId,
        agentId: extra.agentId ?? appliedAgentId,
        role: extra.role,
        profile: extra.profile,
        spawned: displayApplication.spawned ?? [],
        reused: displayApplication.reused ?? [],
        kind: decision.kind,
        target: routeTargetLabel(decision),
        decision,
        authorization,
        application: displayApplication,
        routeApplication: displayApplication,
        layout: compactLayoutAllocation(allocation),
        materialization,
        cmux: extra.cmux,
        delivery: extra.delivery,
        policy: extra.policy,
        preflight: extra.preflight,
        agentStatus: extra.agentStatus,
        actionTaken: extra.actionTaken ?? defaultActionTaken,
        nextAction: nextApplyRouteAction(decision, displayApplication, allocation),
        paths: extra.agentId !== undefined ? evidencePaths(store, taskId, extra.agentId) : applyRoutePaths(store, taskId),
    };
}
function declinedApplyRouteResult(store, taskId, routeId, decision, code, reason, nextAction) {
    return {
        toolStatus: "ok",
        operation: "delegate_apply_route",
        status: "declined",
        code,
        taskId,
        routeId,
        kind: decision.kind,
        target: routeTargetLabel(decision),
        decision,
        reason,
        actionTaken: "no_route_application_or_layout_state_mutated",
        nextAction,
        paths: applyRoutePaths(store, taskId),
    };
}
async function layoutAllocationForAlreadyAppliedRoute(store, taskId, routeId, decision, application) {
    if (!routeApplicationRequiresLayout(decision)) {
        return { ok: true, allocation: undefined };
    }
    if (application?.layoutAllocationId === undefined) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "route_application_layout_missing", "stored non-inline route application has no layout allocation evidence", {
                status: "failed",
                taskId,
                routeId,
                kind: decision.kind,
                target: routeTargetLabel(decision),
                decision,
                routeApplication: application,
                actionTaken: "no_new_route_application_or_layout_state_mutated",
                nextAction: "repair or cancel the stored route application before any spawn/reuse slice can proceed",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    let layoutState;
    try {
        layoutState = await store.readLayoutState(taskId);
    }
    catch (error) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "layout_state_malformed", messageFrom(error), {
                status: "failed",
                taskId,
                routeId,
                kind: decision.kind,
                target: routeTargetLabel(decision),
                decision,
                routeApplication: application,
                actionTaken: "no_new_route_application_or_layout_state_mutated",
                nextAction: "repair layout state before any spawn/reuse slice can proceed",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    const allocation = layoutState.allocations.find((candidate) => candidate.allocationId === application.layoutAllocationId);
    if (allocation === undefined) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "route_application_layout_missing", `stored route application references missing layout allocation: ${application.layoutAllocationId}`, {
                status: "failed",
                taskId,
                routeId,
                kind: decision.kind,
                target: routeTargetLabel(decision),
                decision,
                routeApplication: application,
                actionTaken: "no_new_route_application_or_layout_state_mutated",
                nextAction: "repair or cancel the stored route application before any spawn/reuse slice can proceed",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    const childValidation = validateChildAlreadyAppliedLayoutAllocation(store, taskId, routeId, decision, application, allocation);
    if (!childValidation.ok)
        return childValidation;
    return { ok: true, allocation };
}
function validateChildAlreadyAppliedLayoutAllocation(store, taskId, routeId, decision, application, allocation) {
    if (decision?.kind !== "route_required" || !isChildRouteRole(decision.targetRole)) {
        return { ok: true };
    }
    const expectedAssignmentId = childRouteAssignmentId(decision.targetRole, routeId);
    const expectedPaths = store.pathsForAgent(taskId, expectedAssignmentId);
    const violations = [];
    if (allocation.assignmentId !== expectedAssignmentId) {
        violations.push(`assignmentId expected ${expectedAssignmentId} got ${allocation.assignmentId ?? "missing"}`);
    }
    if (allocation.role !== decision.targetRole) {
        violations.push(`role expected ${decision.targetRole} got ${allocation.role ?? "missing"}`);
    }
    if (allocation.promptPath !== expectedPaths.taskPacketRaw) {
        violations.push("promptPath does not match canonical agent task packet path");
    }
    if (allocation.reportPath !== expectedPaths.resultJson) {
        violations.push("reportPath does not match canonical agent result path");
    }
    if (violations.length === 0) {
        return { ok: true };
    }
    return {
        ok: false,
        result: typedError("delegate_apply_route", "route_application_layout_invalid", `stored child layout allocation does not match route decision: ${violations.join("; ")}`, {
            status: "failed",
            taskId,
            routeId,
            kind: decision.kind,
            target: routeTargetLabel(decision),
            decision,
            routeApplication: application,
            layout: compactLayoutAllocation(allocation),
            expectedLayout: {
                assignmentId: expectedAssignmentId,
                role: decision.targetRole,
                promptPath: expectedPaths.taskPacketRaw,
                reportPath: expectedPaths.resultJson,
            },
            actionTaken: "no_new_route_application_or_layout_state_mutated",
            nextAction: "repair or cancel the stored child route application before any spawn/reuse slice can proceed",
            paths: applyRoutePaths(store, taskId),
        }),
    };
}
function validateAlreadyAppliedChildRouteHasTarget(store, taskId, routeId, decision, application) {
    if (decision?.kind !== "route_required" || !isChildRouteRole(decision.targetRole)) {
        return { ok: true };
    }
    const expectedAssignmentId = childRouteAssignmentId(decision.targetRole, routeId);
    const appliedIds = [...(application.spawned ?? []), ...(application.reused ?? [])];
    if (appliedIds.length === 0) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "child_route_application_incomplete", "stored child route application has layout evidence but no spawned or reused agent id", {
                status: "failed",
                taskId,
                routeId,
                kind: decision.kind,
                target: routeTargetLabel(decision),
                decision,
                routeApplication: application,
                actionTaken: "no_new_route_application_layout_cmux_registry_or_packet_mutation",
                nextAction: "repair or cancel the stored materialization-only route application, then rerun delegate_route and delegate_apply_route",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    if (!appliedIds.includes(expectedAssignmentId)) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "child_route_application_target_mismatch", `stored child route application target does not match deterministic assignment id ${expectedAssignmentId}`, {
                status: "failed",
                taskId,
                routeId,
                kind: decision.kind,
                target: routeTargetLabel(decision),
                decision,
                routeApplication: application,
                actionTaken: "no_new_route_application_layout_cmux_registry_or_packet_mutation",
                nextAction: "repair or cancel the stored route application before reapplying",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    return { ok: true };
}
function routeApplicationRequiresLayout(decision) {
    return decision?.kind === "route_required";
}
function routeApplicationIdFor(routeId) {
    return validateSafeId(`apply-${routeId}`, "route application id");
}
function parentRouteAgentId(role) {
    return validateSafeId(`${role}-1`, "parent route agent id");
}
function isChildRouteRole(role) {
    return role === "worker" || role === "reviewer" || role === "verifier" || role === "researcher";
}
function childRouteProfile(role) {
    if (role === "verifier")
        return "check-runner";
    if (role === "reviewer" || role === "researcher")
        return "read-only";
    return "worker";
}
function childRouteAssignmentId(role, routeId) {
    return validateSafeId(`${role}-${routeId}`, "child route assignment id");
}
function childPreferredLayoutGroup(role) {
    if (role === "worker")
        return "execution";
    if (role === "reviewer" || role === "verifier")
        return "review";
    return "scratch";
}
function childWaitingFor(role) {
    if (role === "worker")
        return "WORKER_RESULT";
    if (role === "reviewer")
        return "REVIEW_RESULT";
    if (role === "verifier")
        return "VERIFICATION_RESULT";
    return "RESEARCH_RESULT";
}
function validateChildRouteRequestEvidence(store, taskId, routeId, decision, request) {
    if (request === undefined) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "route_request_evidence_missing", "child route application requires stored route request evidence", {
                status: "failed",
                taskId,
                routeId,
                kind: decision.kind,
                target: routeTargetLabel(decision),
                decision,
                actionTaken: "no_cmux_preflight_route_application_registry_packet_or_layout_mutation",
                nextAction: "rerun delegate_route with action.description, targetFiles, and role-appropriate writeScopes before applying this child route",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    const objective = stringOrUndefined(request.action?.description);
    if (objective === undefined) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "route_request_action_description_missing", "child route application requires stored request.action.description as the child objective", {
                status: "failed",
                taskId,
                routeId,
                kind: decision.kind,
                target: routeTargetLabel(decision),
                decision,
                actionTaken: "no_cmux_preflight_route_application_registry_packet_or_layout_mutation",
                nextAction: "rerun delegate_route with a non-empty action.description before applying this child route",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    const writeScopes = Array.isArray(request.writeScopes) ? request.writeScopes : [];
    if (decision.targetRole === "worker" && writeScopes.length === 0) {
        return {
            ok: false,
            result: typedError("delegate_apply_route", "worker_write_scope_missing", "worker route application requires stored request.writeScopes and fails closed without them", {
                status: "failed",
                taskId,
                routeId,
                kind: decision.kind,
                target: routeTargetLabel(decision),
                decision,
                actionTaken: "no_cmux_preflight_route_application_registry_packet_or_layout_mutation",
                nextAction: "rerun delegate_route with explicit worker writeScopes, or route to a read-only/check role instead",
                paths: applyRoutePaths(store, taskId),
            }),
        };
    }
    return {
        ok: true,
        request,
        objective,
        writeScopes: decision.targetRole === "worker" ? writeScopes : undefined,
    };
}
async function findReusableDirectSpawn(store, input) {
    const taskPaths = store.pathsForTask(input.taskId);
    const agentPaths = store.pathsForAgent(input.taskId, input.agentId);
    let taskExists;
    let registryExists;
    let manifestExists;
    let statusExists;
    let packetExists;
    try {
        [taskExists, registryExists, manifestExists, statusExists, packetExists] = await Promise.all([
            pathExistsStrict(taskPaths.taskJson),
            pathExistsStrict(taskPaths.registryJson),
            pathExistsStrict(agentPaths.manifestJson),
            pathExistsStrict(agentPaths.statusJson),
            pathExistsStrict(agentPaths.taskPacketRaw),
        ]);
    }
    catch (error) {
        return directSpawnExistingStateError(store, input, "direct_spawn_existing_state_unavailable", messageFrom(error));
    }
    if (!registryExists) {
        if (taskExists || manifestExists || statusExists || packetExists) {
            return directSpawnExistingStateError(store, input, "direct_spawn_assignment_incomplete", "task or agent artifacts exist without a readable registry entry; repair or cancel the partial assignment before spawning");
        }
        return { ok: true, agent: undefined };
    }
    let registry;
    try {
        registry = await store.readRegistry(input.taskId);
    }
    catch (error) {
        return directSpawnExistingStateError(store, input, "direct_spawn_existing_state_unavailable", messageFrom(error));
    }
    if (registry.taskId !== input.taskId || !Array.isArray(registry.agents)) {
        return directSpawnExistingStateError(store, input, "direct_spawn_existing_state_unavailable", "registry identity or agents list is malformed");
    }
    const entries = registry.agents.filter((agent) => agent.agentId === input.agentId);
    if (entries.length === 0) {
        if (manifestExists || statusExists || packetExists) {
            return directSpawnExistingStateError(store, input, "direct_spawn_assignment_incomplete", "agent artifacts exist without a matching registry identity; repair or cancel the partial assignment before spawning");
        }
        try {
            const leaseHistory = await store.readLeaseEvents(input.taskId);
            if (leaseHistory.some((event) => event.lease?.agentId === input.agentId)) {
                return directSpawnExistingStateError(store, input, "direct_spawn_assignment_incomplete", "lease history exists without a matching registry identity; use a new explicit agent attempt instead of overwriting the orphaned identity");
            }
        }
        catch (error) {
            return directSpawnExistingStateError(store, input, "direct_spawn_existing_state_unavailable", `lease history is malformed: ${messageFrom(error)}`);
        }
        return { ok: true, agent: undefined };
    }
    if (entries.length !== 1) {
        return directSpawnExistingStateError(store, input, "direct_spawn_existing_state_unavailable", `registry contains ${entries.length} entries for ${input.agentId}`);
    }
    const entry = entries[0];
    let manifest;
    let status;
    let packetText;
    try {
        [manifest, status, packetText] = await Promise.all([
            store.readAgentManifest(input.taskId, input.agentId),
            store.readAgentStatus(input.taskId, input.agentId),
            readFile(agentPaths.taskPacketRaw, "utf8"),
        ]);
    }
    catch (error) {
        return directSpawnExistingStateError(store, input, "direct_spawn_assignment_incomplete", `existing assignment manifest, status, or task packet is missing or malformed: ${messageFrom(error)}`);
    }
    if (isTerminalDelegationState(entry.state) || isTerminalDelegationState(status.state)) {
        return directSpawnExistingStateError(store, input, "direct_spawn_terminal_assignment", `existing assignment ${input.agentId} is terminal (${entry.state}/${status.state}); create an explicit new task or agent attempt instead of resurrecting it`);
    }
    if (entry.state !== "running" || status.state !== "running") {
        return directSpawnExistingStateError(store, input, "direct_spawn_assignment_incomplete", `existing assignment ${input.agentId} is not provably running (${entry.state}/${status.state})`);
    }
    if (!stringOrUndefined(manifest.surfaceRef) || !stringOrUndefined(manifest.launchCommand)) {
        return directSpawnExistingStateError(store, input, "direct_spawn_assignment_incomplete", `existing running assignment ${input.agentId} is missing a surface ref or launch command`);
    }
    const manifestWriteScopes = Array.isArray(manifest.writeScopes)
        ? manifest.writeScopes
        : stringOrUndefined(manifest.writeScope) === undefined ? [] : [manifest.writeScope];
    const mismatches = [];
    if (entry.role !== input.role || manifest.role !== input.role)
        mismatches.push("role");
    if (entry.profile !== input.profile || manifest.profile !== input.profile)
        mismatches.push("profile");
    if (entry.parentAgentId !== input.parentAgentId || manifest.parentAgentId !== input.parentAgentId)
        mismatches.push("parentAgentId");
    if (manifest.taskId !== input.taskId || manifest.agentId !== input.agentId || status.taskId !== input.taskId || status.agentId !== input.agentId)
        mismatches.push("identity");
    if (manifest.cwd !== input.cwd)
        mismatches.push("cwd");
    if (!sameStringSet(manifestWriteScopes, input.compiled.writeScopes))
        mismatches.push("writeScope");
    if (!sameStringSet(manifest.allowedCommands ?? [], input.compiled.allowedCommands))
        mismatches.push("allowedCommands");
    if (manifest.retention !== input.retention)
        mismatches.push("retention");
    if (manifest.layoutPolicy !== input.layoutPolicy)
        mismatches.push("layoutPolicy");
    if (input.workspaceRef !== undefined && manifest.workspaceRef !== input.workspaceRef)
        mismatches.push("workspaceRef");
    if (input.windowRef !== undefined && manifest.windowRef !== input.windowRef)
        mismatches.push("windowRef");
    if (manifest.launchCommand !== input.expectedLaunchCommand)
        mismatches.push("launchCommand");
    if (packetText !== input.compiled.text)
        mismatches.push("taskPacket");
    if (mismatches.length > 0) {
        return directSpawnExistingStateError(store, input, "direct_spawn_assignment_mismatch", `existing running assignment ${input.agentId} does not match requested ${[...new Set(mismatches)].join(", ")}`);
    }
    let activeView;
    let activeLeaseIds = [];
    try {
        const activeViewExists = await pathExistsStrict(taskPaths.activeLeasesJson);
        if (!activeViewExists && input.assignmentLease === undefined) {
            const leaseHistory = await store.readLeaseEvents(input.taskId);
            if (leaseHistory.some((event) => event.lease?.agentId === input.agentId)) {
                return directSpawnExistingStateError(store, input, "direct_spawn_lease_state_invalid", "lease history exists for a no-authority assignment but its active materialized view is missing");
            }
        }
        else {
            activeView = await store.readActiveLeaseView(input.taskId);
            activeLeaseIds = activeView.activeLeaseIdsByAgent[input.agentId] ?? [];
        }
    }
    catch (error) {
        return directSpawnExistingStateError(store, input, "direct_spawn_lease_state_invalid", `active lease view is unavailable or invalid: ${messageFrom(error)}`);
    }
    if (input.assignmentLease === undefined) {
        if (activeLeaseIds.length !== 0) {
            return directSpawnExistingStateError(store, input, "direct_spawn_lease_state_invalid", `existing no-authority assignment unexpectedly has active leases: ${activeLeaseIds.join(", ")}`);
        }
    }
    else {
        const activeLease = activeView.leasesById[input.assignmentLease.leaseId];
        if (activeLeaseIds.length !== 1 || activeLeaseIds[0] !== input.assignmentLease.leaseId || activeLease?.state !== "active" || !sameLeaseAuthority(activeLease, input.assignmentLease)) {
            return directSpawnExistingStateError(store, input, "direct_spawn_lease_state_invalid", `existing assignment ${input.agentId} does not have exactly one matching active assignment lease`);
        }
    }
    return { ok: true, agent: { entry, manifest, status }, leaseIds: [...activeLeaseIds] };
}
function directSpawnExistingStateError(store, input, code, reason) {
    return {
        ok: false,
        result: typedError("delegate_spawn", code, reason, {
            taskId: input.taskId,
            agentId: input.agentId,
            actionTaken: "existing_assignment_failed_closed_before_preflight_registration_packet_lease_or_pane_mutation",
            nextAction: "inspect delegate_status and stored manifest/status/lease evidence; use a new explicit task or agent attempt for terminal work",
            paths: evidencePaths(store, input.taskId, input.agentId),
        }),
    };
}
function sameStringSet(left, right) {
    return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}
function sameLeaseAuthority(left, right) {
    if (left === undefined || right === undefined)
        return left === right;
    return left.leaseId === right.leaseId
        && left.taskId === right.taskId
        && left.agentId === right.agentId
        && left.role === right.role
        && left.expires === right.expires
        && left.routeId === right.routeId
        && left.assignmentId === right.assignmentId
        && left.attemptId === right.attemptId
        && left.maxFilesChanged === right.maxFilesChanged
        && sameStringSet(left.actions ?? [], right.actions ?? [])
        && sameStringSet(left.writeScopes ?? [], right.writeScopes ?? [])
        && sameStringSet(left.allowedCommands ?? [], right.allowedCommands ?? []);
}
function isTerminalDelegationState(state) {
    return ["blocked", "completed", "completed_with_risks", "failed", "cancelled", "closed", "result_malformed"].includes(state);
}
async function pathExistsStrict(path) {
    try {
        await access(path);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
async function findReusableChildRouteAgent(store, taskId, agentId, expectedAttemptId, role, expectedProfile, expectedParentAgentId) {
    let registry;
    try {
        registry = await store.readRegistry(taskId);
    }
    catch (error) {
        return { ok: false, result: typedError("delegate_apply_route", "registry_malformed", messageFrom(error), { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    const entry = (registry.agents ?? []).find((agent) => agent.agentId === agentId);
    if (entry === undefined) {
        return { ok: true, agent: undefined };
    }
    if (entry.role !== role) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_conflict", `existing deterministic assignment ${agentId} has role ${entry.role}, expected ${role}`, { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    if (entry.profile !== expectedProfile) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_profile_mismatch", `existing deterministic assignment ${agentId} registry profile ${entry.profile}, expected ${expectedProfile}`, { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    let manifest;
    let status;
    try {
        manifest = await store.readAgentManifest(taskId, agentId);
        status = await store.readAgentStatus(taskId, agentId);
    }
    catch (error) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_manifest_missing", messageFrom(error), { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    if (manifest.taskId !== taskId || manifest.agentId !== agentId || status.taskId !== taskId || status.agentId !== agentId) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_identity_mismatch", `existing deterministic assignment ${agentId} manifest/status identity does not match task and agent ids`, { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    let identity;
    try {
        identity = resolveAssignmentAttemptIdentity({ manifest, status });
    }
    catch (error) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_identity_invalid", messageFrom(error), { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    if (identity.kind !== "versioned" || identity.attemptId !== expectedAttemptId || manifest.attemptSource !== "routed") {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_attempt_mismatch", `existing deterministic assignment ${agentId} attempt ${identity.attemptId}/${manifest.attemptSource ?? identity.kind} does not match routed attempt ${expectedAttemptId}/routed`, { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    const canonicalPacketPath = store.pathsForAgent(taskId, agentId).taskPacketRaw;
    try {
        if (manifest.modelTaskPacketPath !== canonicalPacketPath) {
            throw new Error(`manifest task packet path ${manifest.modelTaskPacketPath} does not match canonical ${canonicalPacketPath}`);
        }
        validateTaskPacketIdentity(await readFile(canonicalPacketPath, "utf8"), {
            taskId,
            agentId,
            assignmentId: identity.assignmentId,
            attemptId: identity.attemptId,
            role: role,
            profile: expectedProfile,
            identitySchemaVersion: identity.schemaVersion,
            profileSchemaVersion: identity.profileSchemaVersion,
            protocolVersion: identity.protocolVersion,
        });
    }
    catch (error) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_packet_identity_mismatch", messageFrom(error), { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    const entryActive = isActiveRouteAgentState(entry.state);
    const statusActive = isActiveRouteAgentState(status.state);
    if (!entryActive && !statusActive) {
        return { ok: true, agent: undefined };
    }
    if (entryActive !== statusActive) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_state_mismatch", `existing deterministic assignment ${agentId} registry state ${entry.state} and status state ${status.state} disagree on active reuse`, { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    if (manifest.role !== role) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_conflict", `existing deterministic assignment ${agentId} manifest has role ${manifest.role}, expected ${role}`, { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    if (manifest.profile !== expectedProfile) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_profile_mismatch", `existing deterministic assignment ${agentId} manifest profile ${manifest.profile}, expected ${expectedProfile}`, { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    if (manifest.parentAgentId !== expectedParentAgentId) {
        return { ok: false, result: typedError("delegate_apply_route", "route_assignment_parent_mismatch", `existing deterministic assignment ${agentId} parent ${manifest.parentAgentId ?? "missing"}, expected ${expectedParentAgentId}`, { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", paths: applyRoutePaths(store, taskId) }) };
    }
    if (!manifest.surfaceRef) {
        return { ok: false, result: typedError("delegate_apply_route", "active_child_surface_missing", `existing active assignment ${agentId} has no stored cmux surface ref`, { status: "failed", taskId, agentId, target: role, actionTaken: "no_route_application_layout_cmux_or_packet_mutation", nextAction: "repair or cancel the active registry entry before reapplying the route", paths: applyRoutePaths(store, taskId) }) };
    }
    return { ok: true, agent: { entry, manifest, status } };
}
function isActiveRouteAgentState(state) {
    return !["blocked", "completed", "completed_with_risks", "failed", "cancelled", "closed", "result_malformed"].includes(state);
}
function planChildRouteLayoutAllocation(store, taskId, agentId, role, parentAgentId, existingAllocations, refs = {}) {
    const paths = store.pathsForAgent(taskId, agentId);
    return planDelegationLayoutAllocation({
        intent: {
            taskId,
            assignmentId: agentId,
            role: role,
            preferredGroup: childPreferredLayoutGroup(role),
            reusePolicy: "new_surface",
            preset: "default-v1",
            preserveFocus: true,
            intentKind: "agent",
            parentAgentId,
            callerWorkspaceRef: refs.callerWorkspaceRef,
            promptPath: paths.taskPacketRaw,
            reportPath: paths.resultJson,
        },
        existingAllocations,
        refs: {
            workspaceRef: refs.workspaceRef,
            paneRef: refs.paneRef,
            surfaceRef: refs.surfaceRef,
        },
    });
}
function childRouteSourcePointers(request) {
    return (request.targetFiles ?? []).map((path) => ({ kind: "target_file", path, note: "stored route request targetFiles" }));
}
function childRouteInScope(request, role) {
    const items = [`Use the stored route request objective for ${role}; ignore caller-supplied apply_route target hints.`];
    for (const path of request.targetFiles ?? [])
        items.push(`Source/in-scope target file: ${path}`);
    if (role === "worker") {
        for (const scope of request.writeScopes ?? [])
            items.push(`Worker write scope: ${scope}`);
    }
    if (Array.isArray(request.riskFlags) && request.riskFlags.length > 0) {
        items.push(`Risk flags are context only, not authorization: ${request.riskFlags.join(", ")}`);
    }
    return items;
}
function childRouteOutOfScope(role) {
    const items = ["Caller-supplied apply_route target/kind hints; stored route decision is the only target authority."];
    if (role !== "worker") {
        items.push("Edits, writes, fixes, commits, pushes, and mutation outside read-only/check-runner authority.");
    }
    else {
        items.push("Files outside the stored worker writeScopes; commits, pushes, destructive commands, and child spawning.");
    }
    return items;
}
function childRouteEvidencePointers(store, taskId, routeId, request) {
    const pointers = [{ label: "stored_route_decision", path: store.pathsForTask(taskId).routesJsonl, note: `routeId=${routeId}` }];
    if (Array.isArray(request.riskFlags) && request.riskFlags.length > 0) {
        pointers.push({ label: "risk_flags_context_only", path: store.pathsForTask(taskId).routesJsonl, note: `not authorization: ${request.riskFlags.join(",")}` });
    }
    return pointers;
}
function childRoutePolicy(compiled) {
    return {
        writeScope: compiled.writeScopes,
        allowedCommands: compiled.allowedCommands,
        tools: compiled.tools,
    };
}
function assignmentLeaseFor(input) {
    const editScopes = roleSafeEditScopes(input.role, input.writeScopes, input.cwd, input.source);
    const allowedCommands = input.source === "routed" && input.role !== "worker"
        ? []
        : [...new Set(input.allowedCommands)];
    const actions = [];
    if (editScopes.length > 0)
        actions.push("edit");
    if (allowedCommands.length > 0)
        actions.push("run_allowlisted");
    if (actions.length === 0)
        return undefined;
    const identity = input.source === "routed" ? input.routeId ?? input.assignmentId : input.assignmentId;
    const lease = {
        leaseId: validateSafeId(`lease-${input.source}-${identity}`, "lease id"),
        taskId: input.taskId,
        agentId: input.agentId,
        role: input.role,
        state: "issued",
        actions,
        writeScopes: editScopes,
        allowedCommands,
        expires: "on_assignment_terminal",
        assignmentId: input.assignmentId,
        attemptId: input.attemptId,
    };
    if (input.routeId !== undefined)
        lease.routeId = input.routeId;
    return lease;
}
function roleSafeEditScopes(role, scopes, cwd, source) {
    if (role === "researcher" || role === "reviewer" || role === "verifier")
        return [];
    if (source === "routed" && role !== "worker")
        return [];
    const explicit = [...new Set(scopes)].filter((scope) => !isBroadWriteScope(scope, cwd));
    if (role === "planning-parent") {
        return explicit.filter((scope) => isPlanningArtifactScope(scope, cwd));
    }
    if (role === "orchestrator" || role === "execution-parent" || role === "worker" || role === "integrator") {
        return explicit;
    }
    return [];
}
function isPlanningArtifactScope(scope, cwd) {
    const withoutGlob = scope.replace(/\\/g, "/").replace(/\/\*\*$/, "").replace(/\/$/, "");
    const relativeScope = isAbsolute(withoutGlob)
        ? relative(resolve(cwd), resolve(withoutGlob)).replace(/\\/g, "/")
        : withoutGlob.replace(/^\.\//, "");
    return ["docs", "plugin-docs", "evals", ".freeflow/delegation"].some((prefix) => relativeScope === prefix || relativeScope.startsWith(`${prefix}/`));
}
async function routedWorkerCommandAuthority(store, taskId, agentId, request, cwd) {
    let executionMap;
    try {
        executionMap = await store.readExecutionMap(taskId);
    }
    catch (error) {
        return { status: "execution_map_unavailable", allowedCommands: [], packageId: undefined, candidateCount: 0, reason: messageFrom(error) };
    }
    const requestScopes = Array.isArray(request.writeScopes) ? request.writeScopes : [];
    const targetFiles = Array.isArray(request.targetFiles) ? request.targetFiles : [];
    let candidates = (executionMap.packages ?? []).filter((pkg) => {
        if (pkg.role !== "worker")
            return false;
        if (pkg.agentId !== undefined && pkg.agentId !== agentId)
            return false;
        const packageCheckout = isAbsolute(pkg.checkoutPath) ? resolve(pkg.checkoutPath) : resolve(cwd, pkg.checkoutPath);
        if (resolve(cwd) !== packageCheckout)
            return false;
        const packageScopes = Array.isArray(pkg.expectedWriteScopes) ? pkg.expectedWriteScopes : [];
        if (packageScopes.length === 0)
            return false;
        if (!requestScopes.every((scope) => scopeCompatibleWithPackage(scope, packageScopes, cwd)))
            return false;
        return targetFiles.every((path) => packageScopes.some((scope) => isPathInsideScope(path, scope, cwd)));
    });
    const exactAgent = candidates.filter((pkg) => pkg.agentId === agentId);
    if (exactAgent.length > 0)
        candidates = exactAgent;
    candidates.sort((left, right) => left.packageId.localeCompare(right.packageId));
    if (candidates.length !== 1) {
        return {
            status: candidates.length === 0 ? "no_unique_package" : "ambiguous_package",
            allowedCommands: [],
            packageId: undefined,
            candidateCount: candidates.length,
            candidatePackageIds: candidates.map((pkg) => pkg.packageId),
        };
    }
    const selected = candidates[0];
    return {
        status: "unique_package",
        allowedCommands: [...selected.allowedCommands],
        packageId: selected.packageId,
        candidateCount: 1,
        evidence: {
            role: selected.role,
            agentId: selected.agentId,
            checkoutPath: selected.checkoutPath,
            expectedWriteScopes: selected.expectedWriteScopes,
        },
    };
}
function scopeCompatibleWithPackage(requestScope, packageScopes, cwd) {
    const withoutGlob = requestScope.replace(/\\/g, "/").replace(/\/\*\*$/, "").replace(/\/$/, "");
    return packageScopes.some((scope) => isPathInsideScope(withoutGlob, scope, cwd));
}
function compactManifestCmuxRefs(manifest) {
    return {
        windowRef: manifest.windowRef,
        workspaceRef: manifest.workspaceRef,
        paneRef: manifest.paneRef,
        surfaceRef: manifest.surfaceRef,
    };
}
function childRouteApplicationAgentId(application) {
    return application?.spawned?.[0] ?? application?.reused?.[0];
}
function routeTargetLabel(decision) {
    if (decision?.kind === "inline_allowed")
        return "inline";
    if (decision?.kind === "route_required")
        return decision.targetRole;
    if (decision?.kind === "blocked")
        return decision.suggestedReroute ? `blocked:${decision.suggestedReroute}` : "blocked";
    if (decision?.kind === "ask_user")
        return "ask_user";
    return "unknown";
}
function compactLayoutAllocation(allocation) {
    if (!allocation)
        return undefined;
    return {
        allocationId: allocation.allocationId,
        assignmentId: allocation.assignmentId,
        slot: allocation.slot,
        role: allocation.role,
        workspaceRef: allocation.workspaceRef,
        paneRef: allocation.paneRef,
        surfaceRef: allocation.surfaceRef,
        preserveFocus: allocation.preserveFocus,
        reused: allocation.reused,
        created: allocation.created,
        promptPath: allocation.promptPath,
        reportPath: allocation.reportPath,
    };
}
function childMaterializationFor(decision, allocation, application) {
    if (decision?.kind !== "route_required" || !isChildRouteRole(decision.targetRole) || allocation === undefined) {
        return undefined;
    }
    const spawned = application?.spawned ?? [];
    const reused = application?.reused ?? [];
    const running = spawned.length + reused.length > 0;
    return {
        status: spawned.length > 0 ? "spawned" : reused.length > 0 ? "reused" : "planned",
        role: decision.targetRole,
        assignmentId: allocation.assignmentId,
        agentId: spawned[0] ?? reused[0],
        spawned,
        reused,
        running,
        promptPath: allocation.promptPath,
        reportPath: allocation.reportPath,
        nextAction: running ? `wait_for_${childWaitingFor(decision.targetRole).toLowerCase()}` : "repair_or_reapply_required",
    };
}
function nextApplyRouteAction(decision, application, allocation) {
    if (decision.kind === "inline_allowed") {
        return "continue inline in the current pane; no cmux call, child spawn, or layout pane allocation was made";
    }
    if (decision.kind === "route_required" && decision.targetRole === "planning-parent") {
        return `${application.state === "already_applied" ? "reuse" : "use"} stored ${allocation?.slot ?? "right-top"} planning-parent allocation; later slice may spawn or reuse the parent pane`;
    }
    if (decision.kind === "route_required" && decision.targetRole === "execution-parent") {
        return `${application.state === "already_applied" ? "reuse" : "use"} stored ${allocation?.slot ?? "right-top"} execution-parent allocation; later slice may spawn or reuse the parent pane`;
    }
    if (decision.kind === "route_required" && isChildRouteRole(decision.targetRole)) {
        const agentId = childRouteApplicationAgentId(application) ?? allocation?.assignmentId ?? childRouteAssignmentId(decision.targetRole, decision.routeId);
        return `wait for ${childWaitingFor(decision.targetRole)} from ${agentId}; use delegate_wait or delegate_result, do not spawn a duplicate pane`;
    }
    return "inspect route decision and reroute through the parent harness";
}
function applyRoutePaths(store, taskId) {
    const paths = store.pathsForTask(taskId);
    return {
        task: paths.taskJson,
        routes: paths.routesJsonl,
        routeApplications: paths.routeApplicationsJsonl,
        layout: paths.layoutJson,
        leases: paths.leasesJsonl,
        activeLeases: paths.activeLeasesJson,
    };
}
function routeActionGuidance(decision) {
    if (decision.kind === "route_required") {
        return `route to ${decision.targetRole}; do not implement inline; delegate_route stored the decision only`;
    }
    if (decision.kind === "inline_allowed") {
        return decision.lease !== undefined
            ? "inline allowed with a deterministic inactive lease; call delegate_apply_route before consequential edits"
            : "inline allowed for a non-consequential action; no active lease was created";
    }
    if (decision.kind === "ask_user") {
        return `ask user: ${decision.question}`;
    }
    if (decision.kind === "blocked") {
        return decision.suggestedReroute ? `stop; reroute to ${decision.suggestedReroute}` : "stop; request parent adjudication";
    }
    return "inspect stored route decision";
}
function stringArrayParam(value, label) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${label} must be an array of strings`);
    }
    return value.map((item, index) => requireString(item, `${label}[${index}]`));
}
function normalizeWriteScopeParam(value) {
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
function normalizeRetention(value) {
    return value === "keep-open" || value === "debug" ? value : "auto";
}
function normalizeLayoutPolicy(value, role) {
    if (["manual", "orchestrator", "planning", "execution", "review-dock"].includes(String(value)))
        return String(value);
    if (role === "orchestrator")
        return "orchestrator";
    if (role === "planning-parent" || role === "researcher")
        return "planning";
    if (role === "reviewer" || role === "verifier")
        return "review-dock";
    return "execution";
}
function directionForRole(role) {
    if (role === "orchestrator")
        return "left";
    if (role === "reviewer" || role === "verifier")
        return "down";
    return "right";
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
async function parentDescendantReconciliationBlock(store, taskId, agentId, manifest, operation) {
    if (!["orchestrator", "planning-parent", "execution-parent"].includes(manifest.role)) {
        return undefined;
    }
    let registry;
    try {
        registry = await store.readRegistry(taskId);
    }
    catch (error) {
        return typedError(operation, "descendant_registry_unavailable", messageFrom(error), { taskId, agentId, paths: evidencePaths(store, taskId, agentId) });
    }
    const descendants = descendantAgents(registry.agents ?? [], agentId);
    if (descendants.length === 0) {
        return undefined;
    }
    const unread = await store.readParentAlerts(taskId, { unreadOnly: true, parentAgentId: agentId });
    const activeDescendants = descendants.filter((descendant) => !["closed", "cancelled", "completed"].includes(descendant.state));
    const unconsumedCompleted = descendants.filter((descendant) => descendant.state === "completed" && unread.some((alert) => alert.agentId === descendant.agentId));
    if (activeDescendants.length === 0 && unconsumedCompleted.length === 0) {
        return undefined;
    }
    return typedError(operation, "descendant_reconciliation_required", "parent close/cancel requires descendant close, cancel, adopt, or park decisions before the parent pane disappears", {
        status: "blocked",
        taskId,
        agentId,
        activeDescendants: activeDescendants.map(compactRegistryAgent),
        unconsumedCompleted: unconsumedCompleted.map(compactRegistryAgent),
        unreadAlertIds: unread.filter((alert) => descendants.some((descendant) => descendant.agentId === alert.agentId)).map((alert) => alert.alertId),
        route: "consume_or_ack_completed_results_then_close_cancel_adopt_or_park_descendants",
        paths: evidencePaths(store, taskId, agentId),
    });
}
function descendantAgents(agents, parentAgentId) {
    const output = [];
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
function compactRegistryAgent(agent) {
    return { agentId: agent.agentId, role: agent.role, profile: agent.profile, state: agent.state, parentAgentId: agent.parentAgentId };
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
        ["FREEFLOW_DELEGATION_ATTEMPT_ID", input.attemptId],
        ["FREEFLOW_PARENT_AGENT_ID", input.parentAgentId],
        ["FREEFLOW_AGENT_ROLE", input.role],
        ["FREEFLOW_CONTEXT_PROFILE", input.profile],
    ].map(([key, value]) => `${key}=${shellQuote(value)}`).join(" ");
    const sessionArg = input.noSession ? " --no-session" : "";
    return `cd ${shellQuote(input.cwd)} && env ${env} pi${sessionArg} --name ${shellQuote(input.agentId)} "$(cat ${shellQuote(input.packetPath)})"`;
}
class StartupTransactionError extends Error {
    code;
    failureMessage;
    extra;
    constructor(code, failureMessage, cause, extra = {}) {
        super(messageFrom(cause));
        this.name = "StartupTransactionError";
        this.code = code;
        this.failureMessage = failureMessage;
        this.extra = extra;
    }
}
function startupFailure(error, fallbackCode, fallbackMessage) {
    if (error instanceof StartupTransactionError) {
        return { code: error.code, message: error.failureMessage, reason: error.message, extra: error.extra };
    }
    return { code: fallbackCode, message: fallbackMessage, reason: messageFrom(error), extra: {} };
}
async function failStartupTransactionBestEffort(store, taskId, agentId, message, reason, revokeAuthority) {
    const authorityCleanupErrors = [];
    const failurePersistenceErrors = [];
    if (revokeAuthority) {
        try {
            await store.endActiveAssignmentLeases(taskId, agentId, "revoked", `startup failure: ${message}`);
        }
        catch (error) {
            authorityCleanupErrors.push(`revoke: ${messageFrom(error)}`);
            try {
                await store.rebuildActiveLeaseView(taskId);
            }
            catch (rebuildError) {
                authorityCleanupErrors.push(`rebuild: ${messageFrom(rebuildError)}`);
            }
        }
    }
    try {
        await store.writeAgentStatus(taskId, agentId, { state: "failed", message, reason });
    }
    catch (error) {
        failurePersistenceErrors.push(`status: ${messageFrom(error)}`);
    }
    let sourceEventId;
    try {
        const event = await store.appendAgentEvent(taskId, agentId, { type: "agent-start-failed", state: "failed", message, data: { error: reason } });
        sourceEventId = event.eventId;
    }
    catch (error) {
        failurePersistenceErrors.push(`agent event: ${messageFrom(error)}`);
    }
    try {
        await store.appendTaskEvent(taskId, { type: "agent-start-failed", state: "failed", message: `${agentId}: ${message}`, data: { agentId, error: reason } });
    }
    catch (error) {
        failurePersistenceErrors.push(`task event: ${messageFrom(error)}`);
    }
    try {
        await store.queueParentAlert(taskId, {
            agentId,
            outcome: "failed",
            state: "failed",
            eventType: "agent-start-failed",
            ...(sourceEventId === undefined ? {} : { sourceEventId }),
            message: `${agentId}: ${message}`,
            data: { error: reason },
        });
    }
    catch (error) {
        failurePersistenceErrors.push(`parent alert: ${messageFrom(error)}`);
    }
    return { authorityCleanupErrors, failurePersistenceErrors };
}
function routeSpawnStartupError(store, taskId, routeId, agentId, role, decision, preflight, failure, cleanup, cmux) {
    return typedError("delegate_apply_route", failure.code, failure.reason, {
        status: "failed",
        taskId,
        routeId,
        agentId,
        kind: decision.kind,
        target: role,
        cmux: failure.extra.cmux ?? cmux,
        preflight,
        paths: evidencePaths(store, taskId, agentId),
        authorityCleanupErrors: cleanup.authorityCleanupErrors,
        failurePersistenceErrors: cleanup.failurePersistenceErrors,
        actionTaken: cleanup.authorityCleanupErrors.length === 0
            ? "route_spawn_failed_assignment_authority_revoked_before_best_effort_failure_persistence_no_successful_route_application"
            : "route_spawn_failed_assignment_authority_revocation_attempted_before_best_effort_failure_persistence_no_successful_route_application",
    });
}
function createStore(ctx) {
    return createDelegationStore({ root: delegationRootForRepo(ctx.cwd) });
}
async function disabledByConfigResult(operation, ctx) {
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
    appendDecisionRows(lines, result);
    if (toolName === "delegate_route")
        appendRouteRows(lines, result);
    if (toolName === "delegate_apply_route")
        appendApplyRouteRows(lines, result);
    if (toolName === "delegate_status")
        appendStatusRows(lines, result);
    if (toolName === "delegate_wait")
        appendWaitRows(lines, result);
    if (toolName === "delegate_result")
        appendResultRows(lines, result);
    if (toolName === "delegate_send")
        appendSendRows(lines, result);
    if (toolName === "delegate_inbox" || toolName === "delegate_ack_alert" || toolName === "delegate_ack_all")
        appendAlertRows(lines, result?.alerts, "alert");
    if (result?.alert)
        appendAlertRows(lines, [result.alert], "alert");
    if (result?.delivery?.fileBacked)
        lines.push(row("delivery", "file_backed", result.delivery.packetPath ?? ""));
    else if (result?.delivery)
        lines.push(row("delivery", "inline"));
    if (result?.snapshot?.screenPath)
        lines.push(row("screen", result.snapshot.screenPath, `lines=${result.snapshot.capturedLines ?? 0}`, `bytes=${result.snapshot.bytes ?? 0}`));
    appendPathRows(lines, result?.paths);
    if (Array.isArray(result?.safeRoutes))
        lines.push(row("routes", result.safeRoutes.join(",")));
    lines.push(row("details", "details.result"));
    return lines.join("\n");
}
function appendDecisionRows(lines, result) {
    if (result?.message)
        lines.push(row("message", truncateLine(result.message, 220)));
    if (result?.route)
        lines.push(row("route", result.route));
    if (result?.resultStatus)
        lines.push(row("result_status", result.resultStatus));
    if (result?.reportName || result?.reportStatus)
        lines.push(row("report", result.reportName, result.reportStatus));
    if (result?.agentState)
        lines.push(row("agent_state", result.agentState));
}
function appendRouteRows(lines, result) {
    const decision = result?.decision;
    if (!decision || typeof decision !== "object")
        return;
    lines.push(row("route_decision", decision.kind, decision.targetRole ? `target=${decision.targetRole}` : undefined, decision.suggestedReroute ? `suggested=${decision.suggestedReroute}` : undefined, decision.routeId ? `routeId=${decision.routeId}` : undefined));
    if (result?.authorization) {
        lines.push(row("authorization", result.authorization.source, result.authorization.present ? result.authorization.taskState ?? "present" : "missing", result.authorization.callerProvided ? "callerProvided=true" : undefined));
    }
    if (Array.isArray(decision.reasonCodes)) {
        for (const reasonCode of decision.reasonCodes.slice(0, 10))
            lines.push(row("reason_code", reasonCode));
        if (decision.reasonCodes.length > 10)
            lines.push(row("reason_codes_more", decision.reasonCodes.length - 10));
    }
    if (decision.question)
        lines.push(row("question", truncateLine(decision.question, 240)));
    if (decision.reason)
        lines.push(row("blocked_reason", truncateLine(decision.reason, 240)));
    if (result?.actionGuidance)
        lines.push(row("next_action", truncateLine(result.actionGuidance, 260)));
}
function appendApplyRouteRows(lines, result) {
    const decision = result?.decision;
    lines.push(row("apply_route", result?.routeId, result?.kind ?? decision?.kind, result?.target ? `target=${result.target}` : undefined, `state=${result?.status ?? "unknown"}`));
    if (result?.routeApplication) {
        lines.push(row("route_application", result.routeApplication.state, `id=${result.routeApplication.applicationId}`, result.routeApplication.waitingFor ? `waitingFor=${result.routeApplication.waitingFor}` : undefined));
    }
    if (result?.layout) {
        lines.push(row("layout", result.layout.slot, `allocation=${result.layout.allocationId}`, result.layout.preserveFocus ? "focus=preserved" : undefined));
    }
    if (Array.isArray(result?.spawned) && result.spawned.length > 0) {
        for (const agentId of result.spawned.slice(0, 4))
            lines.push(row("spawned", agentId));
    }
    if (Array.isArray(result?.reused) && result.reused.length > 0) {
        for (const agentId of result.reused.slice(0, 4))
            lines.push(row("reused", agentId));
    }
    if (result?.materialization) {
        lines.push(row("materialization", result.materialization.status, `assignment=${result.materialization.assignmentId}`, `role=${result.materialization.role}`, result.materialization.running === false ? "running=false" : result.materialization.running === true ? "running=true" : undefined));
    }
    if (result?.legacy?.classification) {
        lines.push(row("legacy", result.legacy.classification, result.legacy.historicalEvidencePreserved ? "history=preserved" : undefined));
    }
    if (result?.recovery) {
        lines.push(row("recovery", result.recovery.authority, `attempt=${result.recovery.attemptId}`, result.recovery.resendAllowed === false ? "resend=false" : undefined));
    }
    if (result?.authorization) {
        lines.push(row("authorization", result.authorization.source, result.authorization.present ? result.authorization.taskState ?? "present" : "missing"));
    }
    if (result?.nextAction)
        lines.push(row("next_action", truncateLine(result.nextAction, 260)));
}
function appendStatusRows(lines, result) {
    if (result?.preflight)
        lines.push(row("preflight", result.preflight.ok === true ? "ok" : "blocked", result.preflight.code ?? result.preflight.reason));
    if (result?.task)
        lines.push(row("task_state", result.task.state, truncateLine(result.task.goal ?? result.task.message ?? "", 180)));
    appendAgentStateRow(lines, result?.agentStatus);
    if (result?.agent)
        lines.push(row("agent", result.agent.agentId, `role=${result.agent.role ?? ""}`, `profile=${result.agent.profile ?? ""}`, result.agent.parentAgentId ? `parent=${result.agent.parentAgentId}` : undefined));
    appendRegistryRows(lines, result?.registry?.agents ?? result?.tasks);
    appendExecutionMapRows(lines, result?.executionMap);
    appendAlertRows(lines, result?.unreadParentAlerts, "unread_alert");
}
function appendWaitRows(lines, result) {
    appendAgentStateRow(lines, result?.heartbeat, "heartbeat");
    if (result?.terminalAgent)
        lines.push(row("terminal_agent", result.terminalAgent.agentId, result.terminalAgent.state, truncateLine(result.terminalAgent.message ?? "", 160)));
    if (result?.attentionAgent)
        lines.push(row("attention_agent", result.attentionAgent.agentId, result.attentionAgent.state, truncateLine(result.attentionAgent.message ?? "", 160)));
    appendAlertRows(lines, result?.unreadParentAlerts, "unread_alert");
}
function appendResultRows(lines, result) {
    appendAgentStateRow(lines, result?.agentStatus);
    if (result?.retention?.action)
        lines.push(row("retention", result.retention.action, result.retention.reason));
    appendParsedResultRows(lines, result?.result);
    appendTaskReportsRows(lines, result?.reports);
    appendRegistryRows(lines, result?.agents);
    appendExecutionMapRows(lines, result?.executionMap);
    appendAlertRows(lines, result?.unreadParentAlerts, "unread_alert");
}
function appendSendRows(lines, result) {
    if (result?.state)
        lines.push(row("target_state", result.state));
    if (result?.delivery?.packetPath)
        lines.push(row("follow_up", result.delivery.kind, result.delivery.packetPath));
}
function appendParsedResultRows(lines, result) {
    if (!result || typeof result !== "object")
        return;
    lines.push(row("parsed_result", result.status, result.transport ? `transport=${result.transport}` : undefined));
    const direct = result.direct;
    const primary = Array.isArray(result.results) ? result.results[0] : undefined;
    const summary = direct?.summary ?? primary?.summary;
    if (summary)
        lines.push(row("summary", truncateLine(summary, 260)));
    if (direct?.assessment)
        lines.push(row("assessment", truncateLine(direct.assessment, 260)));
    appendFileRows(lines, "file_changed", direct?.filesChanged ?? primary?.filesChanged);
    appendCheckRows(lines, direct?.checks ?? primary?.checks);
    appendEvidenceRows(lines, direct?.evidence ?? primary?.evidence);
    appendFindingRows(lines, direct?.findings);
    appendCompactItems(lines, "blocking", primary?.blockers);
    appendCompactItems(lines, "request", primary?.requests);
    if (direct?.residualRisk ?? primary?.uncertainty)
        lines.push(row("residual_risk", truncateLine(direct?.residualRisk ?? primary?.uncertainty, 260)));
    if (direct?.recommendation ?? primary?.recommendation)
        lines.push(row("recommendation", truncateLine(direct?.recommendation ?? primary?.recommendation, 260)));
    appendCompactReportGroup(lines, "planning", result.reports?.planning);
    appendCompactReportGroup(lines, "execution_kickoff", result.reports?.executionKickoff);
    appendCompactReportGroup(lines, "execution", result.reports?.execution);
    appendCompactItems(lines, "status_signal", result.statuses);
    appendCompactItems(lines, "attention", result.attentions);
    appendCompactItems(lines, "parse_error", result.errors);
}
function appendTaskReportsRows(lines, reports) {
    if (!Array.isArray(reports))
        return;
    for (const report of reports.slice(0, 5)) {
        lines.push(row("report", report.reportName, report.exists ? "exists" : "missing", report.report?.status));
    }
    if (reports.length > 5)
        lines.push(row("reports_more", reports.length - 5));
}
function appendAgentStateRow(lines, status, label = "agent_state") {
    if (!status)
        return;
    lines.push(row(label, status.state, status.agentId ? `agent=${status.agentId}` : undefined, truncateLine(status.message ?? status.reason ?? "", 180)));
}
function appendRegistryRows(lines, agents) {
    if (!Array.isArray(agents))
        return;
    const counts = countBy(agents, (agent) => agent.state ?? "unknown");
    lines.push(row("agents", `total=${agents.length}`, ...Object.entries(counts).map(([state, count]) => `${state}=${count}`)));
    for (const agent of agents.slice(0, 6)) {
        lines.push(row("agent", agent.agentId ?? agent.taskId, agent.role, agent.profile, agent.state));
    }
    if (agents.length > 6)
        lines.push(row("agents_more", agents.length - 6));
}
function appendExecutionMapRows(lines, executionMap) {
    const packages = executionMap?.packages;
    if (!Array.isArray(packages))
        return;
    const counts = countBy(packages, (pkg) => pkg.state ?? "unknown");
    lines.push(row("packages", `total=${packages.length}`, ...Object.entries(counts).map(([state, count]) => `${state}=${count}`)));
    for (const pkg of packages.slice(0, 5)) {
        lines.push(row("package", pkg.packageId, pkg.role, pkg.agentId ? `agent=${pkg.agentId}` : undefined, pkg.state));
    }
    if (packages.length > 5)
        lines.push(row("packages_more", packages.length - 5));
}
function appendAlertRows(lines, alerts, label) {
    if (!Array.isArray(alerts))
        return;
    const sorted = sortParentAlerts(alerts);
    lines.push(row(`${label}s`, `count=${sorted.length}`));
    for (const alert of sorted.slice(0, 5)) {
        lines.push(row(label, alertPriority(alert), alert.outcome ?? alert.status ?? alert.state, `state=${alert.alertState ?? (alert.readAt === undefined ? "queued" : "acked")}`, alert.agentId ? `agent=${alert.agentId}` : undefined, alert.alertId ? `id=${alert.alertId}` : undefined, truncateLine(alert.message ?? "", 220)));
    }
    if (sorted.length > 5)
        lines.push(row(`${label}s_more`, sorted.length - 5));
}
function appendFileRows(lines, label, files) {
    if (!Array.isArray(files))
        return;
    const countLabel = label === "file_changed" ? "files_changed" : `${label}s`;
    lines.push(row(countLabel, `count=${files.length}`));
    for (const file of files.slice(0, 5))
        lines.push(row(label, file));
    if (files.length > 5)
        lines.push(row(`${countLabel}_more`, files.length - 5));
}
function appendCheckRows(lines, checks) {
    if (!Array.isArray(checks))
        return;
    lines.push(row("checks", `count=${checks.length}`));
    for (const check of checks.slice(0, 6))
        lines.push(row("check", ...compactCheckFields(check)));
    if (checks.length > 6)
        lines.push(row("checks_more", checks.length - 6));
}
function compactCheckFields(check) {
    if (Array.isArray(check?.fields))
        return check.fields.map((field) => truncateLine(String(field), 180));
    const outputId = check?.outputId ? `outputId=${check.outputId}` : undefined;
    return [check?.name, check?.status, outputId, check?.evidence ?? check?.notes].filter(Boolean).map((field) => truncateLine(String(field), 180));
}
function appendEvidenceRows(lines, evidence) {
    if (!Array.isArray(evidence))
        return;
    lines.push(row("evidence_items", `count=${evidence.length}`));
    for (const item of evidence.slice(0, 5))
        lines.push(row("evidence", ...compactEvidenceFields(item)));
    if (evidence.length > 5)
        lines.push(row("evidence_more", evidence.length - 5));
}
function compactEvidenceFields(item) {
    if (Array.isArray(item?.fields))
        return item.fields.map((field) => truncateLine(String(field), 180));
    return [item?.label, item?.outputId ? `outputId=${item.outputId}` : item?.path ? `path=${item.path}` : undefined, item?.lines ? `lines=${item.lines}` : undefined, item?.note].filter(Boolean).map((field) => truncateLine(String(field), 180));
}
function appendFindingRows(lines, findings) {
    if (!Array.isArray(findings))
        return;
    const blocking = findings.filter((finding) => String(finding?.severity ?? "").includes("block"));
    lines.push(row("findings", `count=${findings.length}`, blocking.length > 0 ? `blocking=${blocking.length}` : undefined));
    for (const finding of findings.slice(0, 5)) {
        lines.push(row("finding", finding.severity, finding.location, truncateLine(finding.problem ?? finding.recommendation ?? "", 220)));
    }
    if (findings.length > 5)
        lines.push(row("findings_more", findings.length - 5));
}
function appendCompactReportGroup(lines, label, reports) {
    if (!Array.isArray(reports) || reports.length === 0)
        return;
    for (const report of reports.slice(0, 3))
        lines.push(row("report", label, report.status, report.kind));
    if (reports.length > 3)
        lines.push(row("reports_more", label, reports.length - 3));
}
function appendCompactItems(lines, label, items) {
    if (!Array.isArray(items) || items.length === 0)
        return;
    lines.push(row(`${label}s`, `count=${items.length}`));
    for (const item of items.slice(0, 4))
        lines.push(row(label, compactItemText(item)));
    if (items.length > 4)
        lines.push(row(`${label}s_more`, items.length - 4));
}
function compactItemText(item) {
    if (Array.isArray(item?.fields))
        return item.fields.map((field) => String(field)).join("|");
    if (item?.message)
        return truncateLine(String(item.message), 220);
    if (item?.problem)
        return truncateLine(String(item.problem), 220);
    if (item?.summary)
        return truncateLine(String(item.summary), 220);
    if (item?.kind || item?.state)
        return truncateLine([item.kind, item.state].filter(Boolean).join(" "), 220);
    return truncateLine(String(item), 220);
}
function appendPathRows(lines, paths) {
    if (!paths || typeof paths !== "object")
        return;
    if (paths.taskPacket)
        lines.push(row("packet", paths.taskPacket));
    if (paths.executionMap)
        lines.push(row("execution_map", paths.executionMap));
    if (paths.status)
        lines.push(row("status", paths.status));
    if (paths.resultJson)
        lines.push(row("result", paths.resultJson));
    if (paths.alerts)
        lines.push(row("alerts", paths.alerts));
    if (paths.routes)
        lines.push(row("routes", paths.routes));
    if (paths.routeApplications)
        lines.push(row("route_applications", paths.routeApplications));
    if (paths.layout)
        lines.push(row("layout_path", paths.layout));
}
function countBy(items, keyFn) {
    const counts = {};
    for (const item of items) {
        const key = keyFn(item);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}
function row(...fields) {
    return fields.filter((field) => field !== undefined && field !== null && String(field).length > 0).map((field) => String(field).replace(/\r?\n/g, " ").replace(/\|/g, "¦")).join("|");
}
function evidencePaths(store, taskId, agentId) {
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
function safeConfirmationText(value) {
    const withoutTerminalControls = String(value)
        .replace(/\u001B\][\s\S]*?(?:\u0007|\u001B\\)/g, " ")
        .replace(/\p{Cf}/gu, " ")
        .replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ");
    return truncateLine(withoutTerminalControls.replace(/\s+/g, " ").trim(), 320);
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
