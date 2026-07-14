import { createHash } from "node:crypto";
import { validateSafeId } from "./paths.js";
import { normalizeDelegationLease } from "./leases.js";
export const DELEGATION_TASK_WORKFLOW_STATES = [
    "created",
    "routing",
    "planning",
    "awaiting_user_approval",
    "ready_for_execution",
    "executing",
    "reviewing",
    "needs_parent_adjudication",
    "blocked",
    "completed",
    "failed",
    "cancelled",
];
export const DELEGATION_ASSIGNMENT_STATES = [
    "created",
    "assigned",
    "running",
    "waiting_for_parent",
    "attention_required",
    "result_malformed",
    "completed",
    "completed_with_risks",
    "blocked",
    "failed",
    "cancelled",
];
export const DELEGATION_PANE_STATES = ["not_started", "opening", "active", "idle", "retained", "stale", "closing", "closed", "open_failed", "lost"];
export const DELEGATION_ROUTE_APPLICATION_STATES = ["pending", "applied", "already_applied", "failed", "cancelled"];
export const DELEGATION_ALERT_STATES = ["queued", "delivered", "seen", "acked", "resolved", "escalated"];
export const DELEGATION_ALERT_PRIORITIES = ["P0", "P1", "P2", "P3"];
export const DELEGATION_ROUTE_DECISION_KINDS = ["inline_allowed", "route_required", "ask_user", "blocked"];
export const DELEGATION_ROUTE_ACTION_KINDS = ["plan", "implement", "research", "review", "verify", "fix", "spawn", "ask_user", "close"];
export const DELEGATION_ROUTE_BREADTHS = ["tiny", "single_file", "multi_file", "broad"];
export const DELEGATION_ROUTE_RISK_FLAGS = ["user_owned_decision", "public_api", "security", "privacy", "data_loss", "irreversible", "unknown"];
export const DELEGATION_EXECUTION_AUTHORIZATION_EVENT_TYPES = ["planning_report.ready", "plan.approved", "execution.authorized"];
export const DELEGATION_ROLE_ASSESSMENT_STATUSES = ["pass", "pass_with_non_blocking", "fail", "blocked", "not_run", "accepted_not_run"];
const DELEGATION_ROLES = ["orchestrator", "planning-parent", "execution-parent", "researcher", "worker", "reviewer", "verifier", "integrator"];
const LEAF_DELEGATION_ROLES = ["researcher", "worker", "reviewer", "verifier", "integrator"];
const NON_IMPLEMENTING_LEAF_ROLES = ["researcher", "reviewer", "verifier", "integrator"];
const INLINE_BLOCKING_RISK_FLAGS = ["user_owned_decision", "public_api", "security", "privacy", "data_loss", "irreversible", "unknown"];
export function routeDelegationRequest(input) {
    const request = normalizeDelegationRouteRequest(input);
    const routeId = routeIdFor(request);
    if (request.action.kind === "ask_user") {
        return askUserDecision(routeId, "Ask the user before continuing with this delegation route.", ["ask_user_requested"]);
    }
    if (hasRiskFlag(request, "user_owned_decision")) {
        return askUserDecision(routeId, "Resolve the user-owned decision before routing execution or edits.", ["user_owned_decision_unresolved"]);
    }
    if (request.action.kind === "spawn") {
        return routeSpawnIntent(request, routeId);
    }
    if (isImplementationAction(request.action.kind)) {
        return routeImplementationIntent(request, routeId);
    }
    return routeNonImplementationIntent(request, routeId);
}
export function normalizeDelegationRouteRequest(input) {
    const normalized = {
        taskId: validateSafeId(input.taskId, "task id"),
        agentId: validateSafeId(input.agentId, "agent id"),
        role: oneOf(input.role, DELEGATION_ROLES, "delegation role"),
        action: normalizeRouteAction(input.action),
    };
    if (input.routeId !== undefined) {
        normalized.routeId = validateSafeId(input.routeId, "route id");
    }
    if (input.hasApprovedPlan !== undefined) {
        normalized.hasApprovedPlan = Boolean(input.hasApprovedPlan);
    }
    if (input.executionAuthorization !== undefined) {
        const authorization = normalizeExecutionAuthorizationEvidence(input.executionAuthorization);
        if (authorization.taskId !== normalized.taskId) {
            throw new Error(`execution authorization task id ${authorization.taskId} does not match route task ${normalized.taskId}`);
        }
        normalized.executionAuthorization = authorization;
    }
    if (input.targetFiles !== undefined) {
        normalized.targetFiles = uniqueNonEmptyStrings(input.targetFiles, "target file");
    }
    if (input.writeScopes !== undefined) {
        normalized.writeScopes = uniqueNonEmptyStrings(input.writeScopes, "write scope");
    }
    if (input.riskFlags !== undefined) {
        normalized.riskFlags = [...new Set(input.riskFlags.map((flag) => oneOf(flag, DELEGATION_ROUTE_RISK_FLAGS, "risk flag")))];
    }
    return normalized;
}
export function normalizeDelegationRouteDecision(input) {
    const routeId = validateSafeId(input.routeId, "route id");
    const reasonCodes = uniqueNonEmptyStrings(input.reasonCodes, "reason code");
    switch (input.kind) {
        case "inline_allowed": {
            const normalized = { kind: "inline_allowed", routeId, reasonCodes };
            if (input.lease !== undefined) {
                normalized.lease = normalizeDelegationLease(input.lease);
            }
            return normalized;
        }
        case "route_required":
            return { kind: "route_required", routeId, targetRole: oneOf(input.targetRole, DELEGATION_ROLES, "target role"), reasonCodes };
        case "ask_user":
            return { kind: "ask_user", routeId, question: nonEmptyString(input.question, "question"), reasonCodes };
        case "blocked": {
            const normalized = { kind: "blocked", routeId, reason: nonEmptyString(input.reason, "blocked reason"), reasonCodes };
            if (input.suggestedReroute !== undefined) {
                normalized.suggestedReroute = oneOf(input.suggestedReroute, DELEGATION_ROLES, "suggested reroute");
            }
            return normalized;
        }
    }
}
export function normalizeDelegationRouteApplication(input) {
    const normalized = {
        applicationId: validateSafeId(input.applicationId, "route application id"),
        routeId: validateSafeId(input.routeId, "route id"),
        taskId: validateSafeId(input.taskId, "task id"),
        state: oneOf(input.state, DELEGATION_ROUTE_APPLICATION_STATES, "route application state"),
        decisionKind: oneOf(input.decisionKind, DELEGATION_ROUTE_DECISION_KINDS, "route decision kind"),
    };
    if (input.layoutAllocationId !== undefined) {
        normalized.layoutAllocationId = validateSafeId(input.layoutAllocationId, "layout allocation id");
    }
    if (input.leaseIds !== undefined) {
        normalized.leaseIds = uniqueSafeIds(input.leaseIds, "lease id");
    }
    if (input.spawned !== undefined) {
        normalized.spawned = uniqueSafeIds(input.spawned, "spawned agent id");
    }
    if (input.reused !== undefined) {
        normalized.reused = uniqueSafeIds(input.reused, "reused agent id");
    }
    if (input.waitingFor !== undefined) {
        normalized.waitingFor = nonEmptyString(input.waitingFor, "waitingFor");
    }
    if (input.appliedAt !== undefined) {
        normalized.appliedAt = nonEmptyString(input.appliedAt, "appliedAt");
    }
    return normalized;
}
export function hasExecutionAuthorizationEvidence(evidence) {
    if (evidence === undefined) {
        return false;
    }
    return normalizeExecutionAuthorizationEvidence(evidence).taskState === "ready_for_execution";
}
export function normalizeExecutionAuthorizationEvidence(input) {
    if (input.schemaVersion !== 1) {
        throw new Error(`unsupported execution authorization schema version: ${String(input.schemaVersion)}`);
    }
    return {
        schemaVersion: 1,
        executionId: validateSafeId(input.executionId, "execution id"),
        planningReportReadyEventId: validateSafeId(input.planningReportReadyEventId, "planning report ready event id"),
        planApprovedEventId: validateSafeId(input.planApprovedEventId, "plan approved event id"),
        executionAuthorizedEventId: validateSafeId(input.executionAuthorizedEventId, "execution authorized event id"),
        taskState: oneOf(input.taskState, ["ready_for_execution"], "authorization task state"),
        taskId: validateSafeId(input.taskId, "authorization task id"),
        executionMapPath: nonEmptyString(input.executionMapPath, "execution map path"),
        planArtifactPath: nonEmptyString(input.planArtifactPath, "plan artifact path"),
        approvedBy: oneOf(input.approvedBy, ["user", "orchestrator"], "approver"),
    };
}
function routeImplementationIntent(request, routeId) {
    const hasStoredAuthorization = hasExecutionAuthorizationEvidence(request.executionAuthorization);
    if (request.role === "planning-parent") {
        if (hasStoredAuthorization) {
            return routeRequiredDecision(routeId, "execution-parent", [
                "planning_parent_implementation_requires_execution_parent",
                "stored_execution_authorization_present",
            ]);
        }
        return blockedDecision(routeId, "Planning-parent cannot perform implementation before stored execution authorization exists.", ["planning_parent_implementation_blocked", ...missingAuthorizationReasonCodes(request)], "orchestrator");
    }
    if (roleIn(request.role, NON_IMPLEMENTING_LEAF_ROLES)) {
        return blockedDecision(routeId, "This leaf role cannot perform implementation edits; route the work through execution-parent.", ["leaf_implementation_blocked"], "execution-parent");
    }
    if (request.role === "execution-parent") {
        if (isTinySingleFileInlineAllowed(request)) {
            return inlineAllowedDecision(routeId, ["tiny_single_file_inline_allowed", "execution_parent_tiny_inline_allowed"], request);
        }
        if (isBroadImplementationScope(request)) {
            return routeRequiredDecision(routeId, "worker", ["execution_parent_broad_implementation_routes_worker"]);
        }
        return routeRequiredDecision(routeId, "worker", ["execution_parent_implementation_routes_worker"]);
    }
    if (request.role === "orchestrator") {
        if (isTinySingleFileInlineAllowed(request)) {
            return inlineAllowedDecision(routeId, ["tiny_single_file_inline_allowed", "orchestrator_tiny_inline_allowed"], request);
        }
        if (hasStoredAuthorization) {
            return routeRequiredDecision(routeId, "execution-parent", [
                "orchestrator_implementation_requires_execution_parent",
                "stored_execution_authorization_present",
            ]);
        }
        return routeRequiredDecision(routeId, "planning-parent", [
            "orchestrator_implementation_requires_planning_parent",
            ...missingAuthorizationReasonCodes(request),
        ]);
    }
    return inlineAllowedDecision(routeId, ["worker_implementation_inside_assignment"], request);
}
function routeSpawnIntent(request, routeId) {
    if (roleIn(request.role, LEAF_DELEGATION_ROLES)) {
        return blockedDecision(routeId, "Leaf agents cannot spawn children or perform parent-control routing.", ["leaf_spawn_blocked"], "execution-parent");
    }
    if (request.role === "planning-parent") {
        return routeRequiredDecision(routeId, "researcher", ["planning_parent_spawn_routes_researcher"]);
    }
    if (request.role === "execution-parent") {
        return routeRequiredDecision(routeId, "worker", ["execution_parent_spawn_routes_worker"]);
    }
    if (hasExecutionAuthorizationEvidence(request.executionAuthorization)) {
        return routeRequiredDecision(routeId, "execution-parent", ["orchestrator_spawn_routes_execution_parent", "stored_execution_authorization_present"]);
    }
    return routeRequiredDecision(routeId, "planning-parent", ["orchestrator_spawn_routes_planning_parent", ...missingAuthorizationReasonCodes(request)]);
}
function routeNonImplementationIntent(request, routeId) {
    switch (request.action.kind) {
        case "plan":
            if (request.role === "planning-parent") {
                return inlineAllowedDecision(routeId, ["planning_parent_plan_inline_allowed"]);
            }
            return routeRequiredDecision(routeId, "planning-parent", ["plan_routes_planning_parent"]);
        case "research":
            if (request.role === "researcher") {
                return inlineAllowedDecision(routeId, ["researcher_research_inline_allowed"]);
            }
            return routeRequiredDecision(routeId, "researcher", ["research_routes_researcher"]);
        case "review":
            if (request.role === "reviewer") {
                return inlineAllowedDecision(routeId, ["reviewer_review_inline_allowed"]);
            }
            return routeRequiredDecision(routeId, "reviewer", ["review_routes_reviewer"]);
        case "verify":
            if (request.role === "verifier") {
                return inlineAllowedDecision(routeId, ["verifier_verify_inline_allowed"]);
            }
            return routeRequiredDecision(routeId, "verifier", ["verify_routes_verifier"]);
        case "close":
            return inlineAllowedDecision(routeId, ["close_inline_allowed"]);
        case "ask_user":
            return askUserDecision(routeId, "Ask the user before continuing with this delegation route.", ["ask_user_requested"]);
        case "spawn":
            return routeSpawnIntent(request, routeId);
        case "implement":
        case "fix":
            return routeImplementationIntent(request, routeId);
    }
}
function inlineAllowedDecision(routeId, reasonCodes, request) {
    const decision = { kind: "inline_allowed", routeId, reasonCodes: normalizeReasonCodes(reasonCodes) };
    const lease = request === undefined ? undefined : deriveDelegationInlineLease(request, routeId);
    if (lease !== undefined) {
        decision.lease = lease;
    }
    return normalizeDelegationRouteDecision(decision);
}
export function deriveDelegationInlineLease(input, routeId) {
    const request = normalizeDelegationRouteRequest(input);
    const resolvedRouteId = validateSafeId(routeId ?? request.routeId ?? routeIdFor(request), "route id");
    if (!isImplementationAction(request.action.kind)) {
        return undefined;
    }
    if (request.role !== "orchestrator" && request.role !== "execution-parent" && request.role !== "worker" && request.role !== "integrator") {
        return undefined;
    }
    const writeScopes = request.writeScopes?.length ? request.writeScopes : request.targetFiles ?? [];
    if (writeScopes.length === 0) {
        return undefined;
    }
    return normalizeDelegationLease({
        leaseId: validateSafeId(`lease-${resolvedRouteId}`, "lease id"),
        taskId: request.taskId,
        agentId: request.agentId,
        role: request.role,
        state: "issued",
        actions: ["edit"],
        writeScopes,
        allowedCommands: [],
        expires: "on_assignment_terminal",
        routeId: resolvedRouteId,
        assignmentId: request.agentId,
    });
}
function routeRequiredDecision(routeId, targetRole, reasonCodes) {
    return normalizeDelegationRouteDecision({ kind: "route_required", routeId, targetRole, reasonCodes: normalizeReasonCodes(reasonCodes) });
}
function askUserDecision(routeId, question, reasonCodes) {
    return normalizeDelegationRouteDecision({ kind: "ask_user", routeId, question, reasonCodes: normalizeReasonCodes(reasonCodes) });
}
function blockedDecision(routeId, reason, reasonCodes, suggestedReroute) {
    const decision = { kind: "blocked", routeId, reason, reasonCodes: normalizeReasonCodes(reasonCodes) };
    if (suggestedReroute !== undefined) {
        decision.suggestedReroute = suggestedReroute;
    }
    return normalizeDelegationRouteDecision(decision);
}
function routeIdFor(request) {
    if (request.routeId !== undefined) {
        return request.routeId;
    }
    const stableRequest = {
        taskId: request.taskId,
        agentId: request.agentId,
        role: request.role,
        action: request.action,
        hasApprovedPlan: request.hasApprovedPlan ?? false,
        executionAuthorization: request.executionAuthorization ?? null,
        targetFiles: canonicalStringArray(request.targetFiles),
        writeScopes: canonicalStringArray(request.writeScopes),
        riskFlags: canonicalStringArray(request.riskFlags),
    };
    const digest = createHash("sha256").update(JSON.stringify(stableRequest)).digest("hex").slice(0, 16);
    return `route-${digest}`;
}
function canonicalStringArray(values) {
    return [...new Set(values ?? [])].sort();
}
function missingAuthorizationReasonCodes(request) {
    const reasonCodes = ["stored_execution_authorization_missing"];
    if (request.hasApprovedPlan === true) {
        reasonCodes.push("approved_plan_hint_ignored_without_stored_evidence");
    }
    return reasonCodes;
}
function isImplementationAction(kind) {
    return kind === "implement" || kind === "fix";
}
function isBroadImplementationScope(request) {
    return request.action.breadth === "broad" || request.action.breadth === "multi_file" || (request.targetFiles?.length ?? 0) > 1 || (request.writeScopes?.length ?? 0) > 1;
}
function isTinySingleFileInlineAllowed(request) {
    const targetFileCount = request.targetFiles?.length ?? 0;
    const writeScopeCount = request.writeScopes?.length ?? 0;
    const hasKnownSingleFileScope = targetFileCount === 1 || writeScopeCount === 1;
    return request.action.breadth === "tiny" && hasKnownSingleFileScope && targetFileCount <= 1 && writeScopeCount <= 1 && !hasAnyRiskFlag(request, INLINE_BLOCKING_RISK_FLAGS);
}
function hasRiskFlag(request, riskFlag) {
    return (request.riskFlags ?? []).includes(riskFlag);
}
function hasAnyRiskFlag(request, riskFlags) {
    return riskFlags.some((riskFlag) => hasRiskFlag(request, riskFlag));
}
function roleIn(role, roles) {
    return roles.includes(role);
}
function normalizeReasonCodes(reasonCodes) {
    return uniqueNonEmptyStrings([...reasonCodes], "reason code");
}
function normalizeRouteAction(input) {
    const normalized = {
        kind: oneOf(input.kind, DELEGATION_ROUTE_ACTION_KINDS, "route action kind"),
        breadth: oneOf(input.breadth, DELEGATION_ROUTE_BREADTHS, "route breadth"),
    };
    if (input.description !== undefined) {
        normalized.description = nonEmptyString(input.description, "route action description");
    }
    return normalized;
}
function oneOf(value, allowed, label) {
    if (allowed.includes(value)) {
        return value;
    }
    throw new Error(`invalid ${label}: ${value}`);
}
function nonEmptyString(value, label) {
    if (value.length === 0 || value.trim() !== value) {
        throw new Error(`${label} must be a non-empty string without surrounding whitespace`);
    }
    return value;
}
function uniqueNonEmptyStrings(values, label) {
    return [...new Set(values.map((value, index) => nonEmptyString(value, `${label} ${index + 1}`)))];
}
function uniqueSafeIds(values, label) {
    return [...new Set(values.map((value, index) => validateSafeId(value, `${label} ${index + 1}`)))];
}
