export const PARENT_CONTROL_TOOL_NAMES = [
  "delegate_task_init",
  "delegate_route",
  "delegate_apply_route",
  "delegate_spawn",
  "delegate_send",
  "delegate_capture",
  "delegate_cancel",
  "delegate_close",
  "delegate_record_report",
  "delegate_update_execution_map",
];
export const ORCHESTRATOR_ONLY_TOOL_NAMES = ["delegate_request_execution_authorization"];
export const CHILD_LIFECYCLE_TOOL_NAMES = ["delegate_finish", "delegate_attention", "delegate_progress"];
export const READ_RECOVERY_TOOL_NAMES = [
  "delegate_status",
  "delegate_result",
  "delegate_inbox",
  "delegate_ack_alert",
  "delegate_ack_all",
  "delegate_user_attention",
];
export const DELEGATION_TOOL_NAMES = [
  ...PARENT_CONTROL_TOOL_NAMES,
  ...ORCHESTRATOR_ONLY_TOOL_NAMES,
  ...CHILD_LIFECYCLE_TOOL_NAMES,
  ...READ_RECOVERY_TOOL_NAMES,
  "delegate_wait",
];
export const ROUTED_EVIDENCE_TOOL_NAMES = ["freeflow_status", "freeflow_search", "freeflow_run"];
export const PARENT_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  ...ROUTED_EVIDENCE_TOOL_NAMES,
  "web_search",
  "fetch_content",
  "get_search_content",
  "mcp",
  ...DELEGATION_TOOL_NAMES.filter((toolName) => !ORCHESTRATOR_ONLY_TOOL_NAMES.includes(toolName)),
];
export const ORCHESTRATOR_TOOL_NAMES = [...PARENT_TOOL_NAMES, ...ORCHESTRATOR_ONLY_TOOL_NAMES];
export const WRITER_TOOL_NAMES = ["read", "bash", "edit", "write", ...ROUTED_EVIDENCE_TOOL_NAMES];
export const READ_ONLY_TOOL_NAMES = [
  "read",
  ...ROUTED_EVIDENCE_TOOL_NAMES,
  "web_search",
  "fetch_content",
  "get_search_content",
  "mcp",
];
export const CHECK_RUNNER_TOOL_NAMES = ["read", "bash", ...ROUTED_EVIDENCE_TOOL_NAMES];
const LEAF_LIFECYCLE_TOOL_NAMES = [...CHILD_LIFECYCLE_TOOL_NAMES, "delegate_status", "delegate_result"];
const LEAF_WRITER_TOOL_NAMES = [...WRITER_TOOL_NAMES, ...LEAF_LIFECYCLE_TOOL_NAMES];
const LEAF_READ_ONLY_TOOL_NAMES = [...READ_ONLY_TOOL_NAMES, ...LEAF_LIFECYCLE_TOOL_NAMES];
const LEAF_CHECK_RUNNER_TOOL_NAMES = [...CHECK_RUNNER_TOOL_NAMES, ...LEAF_LIFECYCLE_TOOL_NAMES];
const SKILLS_AVAILABLE = {
  hardGated: false,
  note: "Profiles control tools and policy only; installed skills remain available through normal Pi discovery.",
};
function policy(overrides = {}) {
  return {
    denySecretPaths: true,
    requireWriteScope: true,
    productCodeWritesRequireScope: false,
    commandPolicy: "allowed-list",
    allowGitPush: false,
    allowCommits: false,
    allowPublishDeploy: false,
    allowDestructiveCommands: false,
    denyCredentialEnvDumping: true,
    suggestedReroute: "parent",
    ...overrides,
  };
}
function definition(input) {
  return {
    profile: input.profile,
    displayName: input.displayName,
    kind: input.kind,
    allowedRoles: [...input.allowedRoles],
    activeTools: [...input.activeTools],
    contextEmphasis: [...input.contextEmphasis],
    defaultPolicy: input.defaultPolicy,
    skills: SKILLS_AVAILABLE,
  };
}
export const PROFILE_REGISTRY = {
  orchestrator: definition({
    profile: "orchestrator",
    displayName: "Orchestrator",
    kind: "orchestrator",
    allowedRoles: ["orchestrator"],
    activeTools: ORCHESTRATOR_TOOL_NAMES,
    contextEmphasis: [
      "Own user-facing continuity, final closeout, final commit/push decision, and completion claims.",
      "Launch parent panes only when delegation preserves context locality.",
      "Do not inject raw child transcripts into context by default; consume compact reports and evidence pointers.",
    ],
    defaultPolicy: policy({ requireWriteScope: false, commandPolicy: "guarded", suggestedReroute: "orchestrator" }),
  }),
  "planning-parent": definition({
    profile: "planning-parent",
    displayName: "Planning parent",
    kind: "parent",
    allowedRoles: ["planning-parent"],
    activeTools: PARENT_TOOL_NAMES,
    contextEmphasis: [
      "Own deep planning, artifact drafting/review loops, and the planning report.",
      "Use researchers for broad/deep evidence and reviewers for artifacts.",
      "Product-code edits require explicit scope; do not silently turn planning into implementation.",
    ],
    defaultPolicy: policy({
      requireWriteScope: false,
      productCodeWritesRequireScope: true,
      commandPolicy: "guarded",
      suggestedReroute: "orchestrator",
    }),
  }),
  "execution-parent": definition({
    profile: "execution-parent",
    displayName: "Execution parent",
    kind: "parent",
    allowedRoles: ["execution-parent"],
    activeTools: PARENT_TOOL_NAMES,
    contextEmphasis: [
      "Own execution map, work package routing, review/verification adjudication, integration decisions, and execution report.",
      "For broad or multi-slice implementation, assign implementation to a worker stream; decide from the whole package, not the next slice.",
      "Reuse one worker across sequential slices when context remains useful; spawn a new worker only for a real boundary, parallelism, capability, or isolation need.",
      "Parent writes are for coordination, reporting, or mechanical integration; if you edit product/runtime files, state why the edit is not worker-owned.",
      "Intermediate commits require planned checkpoint evidence; final push remains orchestrator/user-owned.",
    ],
    defaultPolicy: policy({ requireWriteScope: false, commandPolicy: "guarded", suggestedReroute: "orchestrator" }),
  }),
  researcher: definition({
    profile: "researcher",
    displayName: "Researcher",
    kind: "leaf",
    allowedRoles: ["researcher"],
    activeTools: LEAF_READ_ONLY_TOOL_NAMES,
    contextEmphasis: [
      "Gather bounded evidence and return compact summaries with source pointers.",
      "Use routed tools for broad/noisy/unknown-size output.",
      "No edits, no mutation, and no parent-control delegation tools.",
      "Use delegate_finish when complete, delegate_attention when blocked, and delegate_progress for store-only updates.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
  worker: definition({
    profile: "worker",
    displayName: "Worker",
    kind: "leaf",
    allowedRoles: ["worker"],
    activeTools: LEAF_WRITER_TOOL_NAMES,
    contextEmphasis: [
      "Implement only the assigned package inside the write scope; the package may span multiple sequential slices when context remains useful.",
      "Run only allowed commands and report files changed, checks, risks, and recommendation.",
      "No parent-control delegation, no push, and no commit unless explicitly planned by the parent policy.",
      "Use delegate_finish when complete, delegate_attention when blocked, and delegate_progress for store-only updates.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
  reviewer: definition({
    profile: "reviewer",
    displayName: "Reviewer",
    kind: "leaf",
    allowedRoles: ["reviewer"],
    activeTools: ["read", ...ROUTED_EVIDENCE_TOOL_NAMES, ...LEAF_LIFECYCLE_TOOL_NAMES],
    contextEmphasis: [
      "Review assigned artifacts or diffs; classify findings as blocking, non-blocking, questions, or needs evidence.",
      "Do not edit or fix findings.",
      "Request reroute to verifier or parent when evidence is outside authority.",
      "Use delegate_finish with reviewer findings; use delegate_attention for blockers that need parent input.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "verifier" }),
  }),
  verifier: definition({
    profile: "verifier",
    displayName: "Verifier",
    kind: "leaf",
    allowedRoles: ["verifier"],
    activeTools: LEAF_CHECK_RUNNER_TOOL_NAMES,
    contextEmphasis: [
      "Run only the checks named in the task packet.",
      "Return pass/fail evidence, output IDs, and unverified areas.",
      "No edits, no fixes, no parent-control delegation.",
      "Use canonical top-level statuses only: completed, completed_with_risks, blocked, failed, cancelled. Check statuses live inside checks.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
  integrator: definition({
    profile: "integrator",
    displayName: "Integrator",
    kind: "leaf",
    allowedRoles: ["integrator"],
    activeTools: LEAF_WRITER_TOOL_NAMES,
    contextEmphasis: [
      "Combine assigned worker outputs sequentially inside the integration checkout.",
      "Resolve mechanical conflicts within scope and escalate behavior/design conflicts.",
      "No push; commits only when explicitly assigned by execution-parent policy.",
      "Use delegate_finish when complete, delegate_attention when blocked, and delegate_progress for store-only updates.",
    ],
    defaultPolicy: policy({
      requireWriteScope: true,
      commandPolicy: "allowed-list",
      suggestedReroute: "execution-parent",
    }),
  }),
  "write-scoped": definition({
    profile: "write-scoped",
    displayName: "Write-scoped leaf",
    kind: "leaf",
    allowedRoles: ["worker", "integrator"],
    activeTools: LEAF_WRITER_TOOL_NAMES,
    contextEmphasis: [
      "Write only inside assigned scope and run only allowed commands; a package may span related sequential slices.",
      "Return compact implementation or integration evidence with paths/output IDs.",
      "No parent-control delegation, no push, and no unplanned commit.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
  "read-only": definition({
    profile: "read-only",
    displayName: "Read-only leaf",
    kind: "leaf",
    allowedRoles: ["researcher", "reviewer"],
    activeTools: LEAF_READ_ONLY_TOOL_NAMES,
    contextEmphasis: [
      "Read and summarize only; no edits or mutation.",
      "Use routed tools for broad/noisy evidence and cite recoverable pointers.",
      "Request reroute for checks, writes, or unavailable capabilities.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
  "check-runner": definition({
    profile: "check-runner",
    displayName: "Check runner",
    kind: "leaf",
    allowedRoles: ["verifier"],
    activeTools: LEAF_CHECK_RUNNER_TOOL_NAMES,
    contextEmphasis: [
      "Run named checks and return concise verification evidence.",
      "Do not edit or diagnose beyond the packet unless rerouted.",
      "No parent-control delegation, no push, no commit.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
};
export function listProfileDefinitions() {
  return Object.values(PROFILE_REGISTRY).map(cloneProfileDefinition);
}
export function getProfileDefinition(profile) {
  const definition = PROFILE_REGISTRY[profile];
  if (definition === undefined) {
    throw new Error(`unknown delegation profile: ${profile}`);
  }
  return cloneProfileDefinition(definition);
}
export function resolveProfileForRole(role, profile = role) {
  if (!isKnownRole(role)) {
    throw new Error(`unknown delegation role: ${role}`);
  }
  const definition = getProfileDefinition(profile);
  if (!definition.allowedRoles.includes(role)) {
    throw new Error(`delegation profile ${profile} cannot be used for role ${role}`);
  }
  return definition;
}
export function isDelegationTool(toolName) {
  return DELEGATION_TOOL_NAMES.includes(toolName);
}
export function isParentControlDelegationTool(toolName) {
  return PARENT_CONTROL_TOOL_NAMES.includes(toolName) || toolName === "delegate_wait";
}
export function isChildLifecycleDelegationTool(toolName) {
  return CHILD_LIFECYCLE_TOOL_NAMES.includes(toolName);
}
export function isReadRecoveryDelegationTool(toolName) {
  return READ_RECOVERY_TOOL_NAMES.includes(toolName);
}
export function isLeafProfile(profile) {
  return getProfileDefinition(profile).kind === "leaf";
}
export function defaultDenySummaryForProfile(profile) {
  const defaultPolicy = getProfileDefinition(profile).defaultPolicy;
  const deny = [];
  if (defaultPolicy.denySecretPaths) {
    deny.push("secret_paths");
  }
  if (defaultPolicy.requireWriteScope || defaultPolicy.productCodeWritesRequireScope) {
    deny.push("writes_outside_write_scope");
  }
  if (!defaultPolicy.allowGitPush) {
    deny.push("git_push");
  }
  if (!defaultPolicy.allowCommits) {
    deny.push("unplanned_commit");
  }
  if (!defaultPolicy.allowDestructiveCommands) {
    deny.push("destructive_shell");
  }
  if (defaultPolicy.denyCredentialEnvDumping) {
    deny.push("credential_env_dumping");
  }
  if (!defaultPolicy.allowPublishDeploy) {
    deny.push("publish_deploy");
  }
  if (defaultPolicy.commandPolicy === "allowed-list") {
    deny.push("commands_not_in_allowed_list");
  }
  return deny;
}
export function defaultReturnProtocolForRole(role) {
  if (role === "planning-parent") {
    return {
      returnProtocol: ["PLANNING_REPORT_REQUIRED", "DELEGATE_FINISH_SUPPORTED"],
      returnFields: [
        "status",
        "goal",
        "artifact_paths",
        "review_status",
        "settled_decisions",
        "open_questions",
        "execution_autonomy",
        "user_checkpoints",
        "execution_guidance",
        "risks",
        "evidence",
      ],
    };
  }
  if (role === "execution-parent") {
    return {
      returnProtocol: ["EXECUTION_REPORT_REQUIRED", "DELEGATE_FINISH_SUPPORTED"],
      returnFields: [
        "status",
        "summary",
        "source_references",
        "work_packages",
        "commits",
        "reviews",
        "checks",
        "files_changed",
        "plan_deviations",
        "stop_conditions_hit",
        "open_questions",
        "risks",
        "final_recommendation",
        "evidence",
      ],
    };
  }
  if (role === "reviewer") {
    return {
      returnProtocol: ["DELEGATE_FINISH_REVIEWER_RESULT", "LEGACY_FFRESULT_BLOCKER_FALLBACK"],
      returnFields: [
        "status",
        "summary",
        "findings(severity,location,problem,recommendation,evidence)",
        "assessment",
        "residual_risk",
        "evidence",
      ],
    };
  }
  if (role === "verifier") {
    return {
      returnProtocol: ["DELEGATE_FINISH_VERIFICATION_RESULT", "LEGACY_FFRESULT_BLOCKER_FALLBACK"],
      returnFields: [
        "status",
        "summary",
        "checks(name,status,outputId,evidence)",
        "unverified_areas",
        "completion_claim_supported",
        "evidence",
      ],
    };
  }
  return {
    returnProtocol: ["DELEGATE_FINISH_REQUIRED", "LEGACY_FFRESULT_FALLBACK"],
    returnFields: ["status", "summary", "files_changed", "checks", "uncertainty", "recommendation", "evidence"],
  };
}
export function returnProtocolForActiveTools(role, activeTools) {
  const defaults = defaultReturnProtocolForRole(role).returnProtocol;
  if (activeTools.includes("delegate_finish")) {
    return defaults;
  }
  if (role === "planning-parent") {
    return ["PLANNING_REPORT_REQUIRED", "LEGACY_CHAT_PARSER_FALLBACK"];
  }
  if (role === "execution-parent") {
    return ["EXECUTION_REPORT_REQUIRED", "LEGACY_CHAT_PARSER_FALLBACK"];
  }
  return ["FFRESULT_REQUIRED"];
}
export function assertLeafProfilesDoNotIncludeDelegationTools() {
  for (const definition of Object.values(PROFILE_REGISTRY)) {
    if (definition.kind === "leaf" && definition.activeTools.some(isParentControlDelegationTool)) {
      throw new Error(`leaf profile ${definition.profile} includes parent-control delegation tools`);
    }
  }
}
function isKnownRole(role) {
  return [
    "orchestrator",
    "planning-parent",
    "execution-parent",
    "researcher",
    "worker",
    "reviewer",
    "verifier",
    "integrator",
  ].includes(role);
}
function cloneProfileDefinition(definition) {
  return {
    profile: definition.profile,
    displayName: definition.displayName,
    kind: definition.kind,
    allowedRoles: [...definition.allowedRoles],
    activeTools: [...definition.activeTools],
    contextEmphasis: [...definition.contextEmphasis],
    defaultPolicy: { ...definition.defaultPolicy },
    skills: { ...definition.skills },
  };
}
