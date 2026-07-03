import type {
  DelegationDefaultPolicy,
  DelegationPolicyReroute,
  DelegationProfile,
  DelegationProfileDefinition,
  DelegationProfileKind,
  DelegationRole,
} from "./types.js";

export const DELEGATION_TOOL_NAMES = [
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
] as const;

export const ROUTED_EVIDENCE_TOOL_NAMES = ["freeflow_status", "freeflow_search", "freeflow_run"] as const;

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
  ...DELEGATION_TOOL_NAMES,
] as const;

export const WRITER_TOOL_NAMES = ["read", "bash", "edit", "write", ...ROUTED_EVIDENCE_TOOL_NAMES] as const;
export const READ_ONLY_TOOL_NAMES = ["read", ...ROUTED_EVIDENCE_TOOL_NAMES, "web_search", "fetch_content", "get_search_content", "mcp"] as const;
export const CHECK_RUNNER_TOOL_NAMES = ["read", "bash", ...ROUTED_EVIDENCE_TOOL_NAMES] as const;

const SKILLS_AVAILABLE = {
  hardGated: false,
  note: "Profiles control tools and policy only; installed skills remain available through normal Pi discovery.",
} as const;

function policy(overrides: Partial<DelegationDefaultPolicy> = {}): DelegationDefaultPolicy {
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

function definition(input: {
  profile: DelegationProfile;
  displayName: string;
  kind: DelegationProfileKind;
  allowedRoles: DelegationRole[];
  activeTools: readonly string[];
  contextEmphasis: readonly string[];
  defaultPolicy: DelegationDefaultPolicy;
}): DelegationProfileDefinition {
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

export const PROFILE_REGISTRY: Record<DelegationProfile, DelegationProfileDefinition> = {
  "orchestrator": definition({
    profile: "orchestrator",
    displayName: "Orchestrator",
    kind: "orchestrator",
    allowedRoles: ["orchestrator"],
    activeTools: PARENT_TOOL_NAMES,
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
    defaultPolicy: policy({ requireWriteScope: false, productCodeWritesRequireScope: true, commandPolicy: "guarded", suggestedReroute: "orchestrator" }),
  }),
  "execution-parent": definition({
    profile: "execution-parent",
    displayName: "Execution parent",
    kind: "parent",
    allowedRoles: ["execution-parent"],
    activeTools: PARENT_TOOL_NAMES,
    contextEmphasis: [
      "Own execution map, work packages, review/verification routing, and execution report.",
      "Delegate implementation/review/verification when boundaries are clear; route backward on source-truth conflicts.",
      "Intermediate commits require planned checkpoint evidence; final push remains orchestrator/user-owned.",
    ],
    defaultPolicy: policy({ requireWriteScope: false, commandPolicy: "guarded", suggestedReroute: "orchestrator" }),
  }),
  "researcher": definition({
    profile: "researcher",
    displayName: "Researcher",
    kind: "leaf",
    allowedRoles: ["researcher"],
    activeTools: READ_ONLY_TOOL_NAMES,
    contextEmphasis: [
      "Gather bounded evidence and return compact summaries with source pointers.",
      "Use routed tools for broad/noisy/unknown-size output.",
      "No edits, no mutation, and no delegation.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
  "worker": definition({
    profile: "worker",
    displayName: "Worker",
    kind: "leaf",
    allowedRoles: ["worker"],
    activeTools: WRITER_TOOL_NAMES,
    contextEmphasis: [
      "Implement only the assigned package inside the write scope.",
      "Run only allowed commands and report files changed, checks, risks, and recommendation.",
      "No delegation, no push, and no commit unless explicitly planned by the parent policy.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
  "reviewer": definition({
    profile: "reviewer",
    displayName: "Reviewer",
    kind: "leaf",
    allowedRoles: ["reviewer"],
    activeTools: ["read", ...ROUTED_EVIDENCE_TOOL_NAMES],
    contextEmphasis: [
      "Review assigned artifacts or diffs; classify findings as blocking, non-blocking, questions, or needs evidence.",
      "Do not edit or fix findings.",
      "Request reroute to verifier or parent when evidence is outside authority.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "verifier" }),
  }),
  "verifier": definition({
    profile: "verifier",
    displayName: "Verifier",
    kind: "leaf",
    allowedRoles: ["verifier"],
    activeTools: CHECK_RUNNER_TOOL_NAMES,
    contextEmphasis: [
      "Run only the checks named in the task packet.",
      "Return pass/fail evidence, output IDs, and unverified areas.",
      "No edits, no fixes, no delegation.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
  "integrator": definition({
    profile: "integrator",
    displayName: "Integrator",
    kind: "leaf",
    allowedRoles: ["integrator"],
    activeTools: WRITER_TOOL_NAMES,
    contextEmphasis: [
      "Combine assigned worker outputs sequentially inside the integration checkout.",
      "Resolve mechanical conflicts within scope and escalate behavior/design conflicts.",
      "No push; commits only when explicitly assigned by execution-parent policy.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "execution-parent" }),
  }),
  "write-scoped": definition({
    profile: "write-scoped",
    displayName: "Write-scoped leaf",
    kind: "leaf",
    allowedRoles: ["worker", "integrator"],
    activeTools: WRITER_TOOL_NAMES,
    contextEmphasis: [
      "Write only inside assigned scope and run only allowed commands.",
      "Return compact implementation or integration evidence with paths/output IDs.",
      "No delegation, no push, and no unplanned commit.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
  "read-only": definition({
    profile: "read-only",
    displayName: "Read-only leaf",
    kind: "leaf",
    allowedRoles: ["researcher", "reviewer"],
    activeTools: READ_ONLY_TOOL_NAMES,
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
    activeTools: CHECK_RUNNER_TOOL_NAMES,
    contextEmphasis: [
      "Run named checks and return concise verification evidence.",
      "Do not edit or diagnose beyond the packet unless rerouted.",
      "No delegation, no push, no commit.",
    ],
    defaultPolicy: policy({ requireWriteScope: true, commandPolicy: "allowed-list", suggestedReroute: "parent" }),
  }),
};

export function listProfileDefinitions(): DelegationProfileDefinition[] {
  return Object.values(PROFILE_REGISTRY).map(cloneProfileDefinition);
}

export function getProfileDefinition(profile: DelegationProfile): DelegationProfileDefinition {
  const definition = PROFILE_REGISTRY[profile];
  if (definition === undefined) {
    throw new Error(`unknown delegation profile: ${profile}`);
  }
  return cloneProfileDefinition(definition);
}

export function resolveProfileForRole(role: DelegationRole, profile: DelegationProfile = role): DelegationProfileDefinition {
  if (!isKnownRole(role)) {
    throw new Error(`unknown delegation role: ${role}`);
  }
  const definition = getProfileDefinition(profile);
  if (!definition.allowedRoles.includes(role)) {
    throw new Error(`delegation profile ${profile} cannot be used for role ${role}`);
  }
  return definition;
}

export function isDelegationTool(toolName: string): boolean {
  return DELEGATION_TOOL_NAMES.includes(toolName as (typeof DELEGATION_TOOL_NAMES)[number]);
}

export function isLeafProfile(profile: DelegationProfile): boolean {
  return getProfileDefinition(profile).kind === "leaf";
}

export function defaultDenySummaryForProfile(profile: DelegationProfile): string[] {
  const defaultPolicy = getProfileDefinition(profile).defaultPolicy;
  const deny: string[] = [];
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

export function defaultReturnProtocolForRole(role: DelegationRole): { returnProtocol: string[]; returnFields: string[] } {
  if (role === "planning-parent") {
    return {
      returnProtocol: ["PLANNING_REPORT_REQUIRED"],
      returnFields: ["status", "goal", "artifact_paths", "review_status", "settled_decisions", "open_questions", "execution_guidance", "risks", "evidence"],
    };
  }
  if (role === "execution-parent") {
    return {
      returnProtocol: ["EXECUTION_REPORT_REQUIRED"],
      returnFields: ["status", "summary", "work_packages", "reviews", "checks", "files_changed", "plan_deviations", "risks", "evidence"],
    };
  }
  if (role === "reviewer") {
    return {
      returnProtocol: ["ROLE_NATIVE_REVIEW_OR_FFRESULT_BLOCKER"],
      returnFields: ["blocking", "non_blocking", "questions", "assessment", "residual_risk"],
    };
  }
  if (role === "verifier") {
    return {
      returnProtocol: ["VERIFICATION_EVIDENCE_OR_FFRESULT_BLOCKER"],
      returnFields: ["checks_run", "pass_fail", "output_ids", "unverified_areas", "completion_claim_supported"],
    };
  }
  return {
    returnProtocol: ["FFRESULT_REQUIRED"],
    returnFields: ["summary", "files_changed", "checks_run", "tests_status", "uncertainty", "recommendation"],
  };
}

export function assertLeafProfilesDoNotIncludeDelegationTools(): void {
  for (const definition of Object.values(PROFILE_REGISTRY)) {
    if (definition.kind === "leaf" && definition.activeTools.some(isDelegationTool)) {
      throw new Error(`leaf profile ${definition.profile} includes delegation tools`);
    }
  }
}

function isKnownRole(role: string): role is DelegationRole {
  return ["orchestrator", "planning-parent", "execution-parent", "researcher", "worker", "reviewer", "verifier", "integrator"].includes(role);
}

function cloneProfileDefinition(definition: DelegationProfileDefinition): DelegationProfileDefinition {
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
