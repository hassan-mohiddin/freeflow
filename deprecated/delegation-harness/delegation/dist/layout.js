import { validateSafeId } from "./paths.js";
export const DELEGATION_LAYOUT_PRESETS = ["default-v1"];
export const DELEGATION_LAYOUT_GROUPS = ["planning", "execution", "review", "scratch"];
export const DELEGATION_LAYOUT_REUSE_POLICIES = ["reuse_role_pane", "new_surface", "new_pane", "none"];
export const DELEGATION_LAYOUT_SLOTS = ["inline", "right-top", "right-bottom", "right-surface-overflow"];
export const DELEGATION_LAYOUT_INTENT_KINDS = ["inline", "agent"];
const DELEGATION_ROLES = ["orchestrator", "planning-parent", "execution-parent", "researcher", "worker", "reviewer", "verifier", "integrator"];
const PARENT_LAYOUT_ROLES = ["planning-parent", "execution-parent"];
const SECONDARY_CHILD_ROLES = ["researcher", "worker", "reviewer", "verifier", "integrator"];
const READ_ONLY_CHILD_ROLES = ["researcher", "reviewer", "verifier"];
export function normalizeDelegationLayoutIntent(input) {
    const normalized = {
        taskId: validateSafeId(input.taskId, "task id"),
        assignmentId: validateSafeId(input.assignmentId, "assignment id"),
        role: oneOf(input.role, DELEGATION_ROLES, "delegation role"),
        preferredGroup: oneOf(input.preferredGroup, DELEGATION_LAYOUT_GROUPS, "layout group"),
        reusePolicy: oneOf(input.reusePolicy, DELEGATION_LAYOUT_REUSE_POLICIES, "layout reuse policy"),
        preset: oneOf(input.preset ?? "default-v1", DELEGATION_LAYOUT_PRESETS, "layout preset"),
        preserveFocus: true,
    };
    if (input.preserveFocus === false) {
        throw new Error("layout intent must preserve focus in V1");
    }
    if (input.intentKind !== undefined) {
        normalized.intentKind = oneOf(input.intentKind, DELEGATION_LAYOUT_INTENT_KINDS, "layout intent kind");
    }
    if (input.parentAgentId !== undefined) {
        normalized.parentAgentId = validateSafeId(input.parentAgentId, "parent agent id");
    }
    if (input.callerWorkspaceRef !== undefined) {
        normalized.callerWorkspaceRef = nonEmptyString(input.callerWorkspaceRef, "caller workspace ref");
    }
    if (input.promptPath !== undefined) {
        normalized.promptPath = nonEmptyString(input.promptPath, "prompt path");
    }
    if (input.reportPath !== undefined) {
        normalized.reportPath = nonEmptyString(input.reportPath, "report path");
    }
    return normalized;
}
export function planDelegationLayoutAllocation(input) {
    const intent = normalizeDelegationLayoutIntent(input.intent);
    const existingAllocations = (input.existingAllocations ?? []).map((allocation) => normalizeDelegationLayoutAllocation(allocation));
    const existing = existingAllocations.find((allocation) => allocation.taskId === intent.taskId && allocation.assignmentId === intent.assignmentId && allocation.role === intent.role);
    if (existing !== undefined) {
        return normalizeDelegationLayoutAllocation({
            ...existing,
            created: false,
            reused: true,
            preserveFocus: true,
            reasonCodes: uniqueNonEmptyStrings([...existing.reasonCodes, "layout_reused_existing_assignment"], "reason code"),
        });
    }
    const workspace = workspaceRefFor(intent, input.refs?.workspaceRef);
    const slotPlan = slotForIntent(intent, existingAllocations);
    const allocation = {
        allocationId: allocationIdFor(intent),
        taskId: intent.taskId,
        assignmentId: intent.assignmentId,
        role: intent.role,
        preset: intent.preset,
        slot: slotPlan.slot,
        workspaceRef: workspace.workspaceRef,
        created: slotPlan.slot !== "inline",
        reused: false,
        preserveFocus: true,
        reasonCodes: uniqueNonEmptyStrings([...slotPlan.reasonCodes, workspace.reasonCode, "preserve_focus_default"], "reason code"),
    };
    if (slotPlan.slot !== "inline") {
        if (input.refs?.paneRef !== undefined) {
            allocation.paneRef = nonEmptyString(input.refs.paneRef, "pane ref");
        }
        if (input.refs?.surfaceRef !== undefined) {
            allocation.surfaceRef = nonEmptyString(input.refs.surfaceRef, "surface ref");
        }
    }
    if (intent.promptPath !== undefined) {
        allocation.promptPath = intent.promptPath;
    }
    if (intent.reportPath !== undefined) {
        allocation.reportPath = intent.reportPath;
    }
    return normalizeDelegationLayoutAllocation(allocation);
}
export function normalizeDelegationLayoutAllocation(input) {
    if (input.created && input.reused) {
        throw new Error("layout allocation cannot be both created and reused");
    }
    if (input.preserveFocus !== true) {
        throw new Error("layout allocation must preserve focus in V1");
    }
    const normalized = {
        allocationId: validateSafeId(input.allocationId, "layout allocation id"),
        taskId: validateSafeId(input.taskId, "task id"),
        assignmentId: validateSafeId(input.assignmentId, "assignment id"),
        role: oneOf(input.role, DELEGATION_ROLES, "delegation role"),
        preset: oneOf(input.preset, DELEGATION_LAYOUT_PRESETS, "layout preset"),
        slot: oneOf(input.slot, DELEGATION_LAYOUT_SLOTS, "layout slot"),
        workspaceRef: nonEmptyString(input.workspaceRef, "workspace ref"),
        created: Boolean(input.created),
        reused: Boolean(input.reused),
        preserveFocus: true,
        reasonCodes: uniqueNonEmptyStrings(input.reasonCodes, "reason code"),
    };
    if (normalized.slot === "inline" && (input.paneRef !== undefined || input.surfaceRef !== undefined)) {
        throw new Error("inline layout allocation must not include paneRef or surfaceRef");
    }
    if (input.paneRef !== undefined) {
        normalized.paneRef = nonEmptyString(input.paneRef, "pane ref");
    }
    if (input.surfaceRef !== undefined) {
        normalized.surfaceRef = nonEmptyString(input.surfaceRef, "surface ref");
    }
    if (input.promptPath !== undefined) {
        normalized.promptPath = nonEmptyString(input.promptPath, "prompt path");
    }
    if (input.reportPath !== undefined) {
        normalized.reportPath = nonEmptyString(input.reportPath, "report path");
    }
    return normalized;
}
function allocationIdFor(intent) {
    return validateSafeId(`layout-${intent.assignmentId}-${intent.role}`, "layout allocation id");
}
function slotForIntent(intent, existingAllocations) {
    if (intent.intentKind === "inline" || intent.role === "orchestrator") {
        return { slot: "inline", reasonCodes: ["layout_inline_no_pane"] };
    }
    if (roleIn(intent.role, PARENT_LAYOUT_ROLES)) {
        return { slot: "right-top", reasonCodes: ["layout_parent_right_top"] };
    }
    if (roleIn(intent.role, READ_ONLY_CHILD_ROLES) && readOnlyChildAllocationCount(intent.taskId, intent.preset, existingAllocations) >= 2) {
        return { slot: "right-surface-overflow", reasonCodes: ["layout_read_only_child_overflow"] };
    }
    if (roleIn(intent.role, SECONDARY_CHILD_ROLES)) {
        return { slot: "right-bottom", reasonCodes: ["layout_secondary_child_right_bottom"] };
    }
    return { slot: "right-bottom", reasonCodes: ["layout_secondary_child_right_bottom"] };
}
function readOnlyChildAllocationCount(taskId, preset, existingAllocations) {
    return existingAllocations.filter((allocation) => allocation.taskId === taskId &&
        allocation.preset === preset &&
        allocation.slot !== "inline" &&
        roleIn(allocation.role, READ_ONLY_CHILD_ROLES)).length;
}
function workspaceRefFor(intent, refsWorkspaceRef) {
    if (intent.callerWorkspaceRef !== undefined) {
        return { workspaceRef: intent.callerWorkspaceRef, reasonCode: "workspace_ref_from_intent" };
    }
    if (refsWorkspaceRef !== undefined) {
        return { workspaceRef: nonEmptyString(refsWorkspaceRef, "workspace ref"), reasonCode: "workspace_ref_from_refs" };
    }
    return { workspaceRef: "caller-workspace", reasonCode: "workspace_ref_defaulted" };
}
function roleIn(role, roles) {
    return roles.includes(role);
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
