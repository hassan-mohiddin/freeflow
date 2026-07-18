import { isAbsolute } from "node:path";

import { formatProtocolRow } from "./protocol.js";
import {
  defaultDenySummaryForProfile,
  defaultReturnProtocolForRole,
  isDelegationTool,
  resolveProfileForRole,
  returnProtocolForActiveTools,
} from "./profiles.js";
import { validateSafeId } from "./paths.js";
import {
  CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION,
  CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION,
  CURRENT_DELEGATION_PROTOCOL_VERSION,
} from "./identity.js";
import type {
  CompiledTaskPacket,
  CompileTaskPacketInput,
  DelegationProfile,
  TaskPacketEvidencePointer,
  TaskPacketSourcePointer,
} from "./types.js";

const MAX_PACKET_FIELD_CHARS = 2_000;

const DEFAULT_STOP_CONDITIONS = [
  "Spec/plan/source-truth contradiction.",
  "Need product, public API, compatibility, security, privacy, billing, data-loss, or permission decision.",
  "Capability gap, forbidden tool, forbidden command, or path outside scope.",
  "Checks fail after bounded diagnosis within assigned scope.",
];

export interface TaskPacketIdentity {
  taskId: string;
  agentId: string;
  assignmentId: string;
  attemptId: string;
  role: CompileTaskPacketInput["role"];
  profile: DelegationProfile;
  identitySchemaVersion: 1;
  profileSchemaVersion: 1;
  protocolVersion: 1;
}

export interface NormalizedTaskPacket {
  taskId: string;
  agentId: string;
  assignmentId: string;
  attemptId: string;
  identitySchemaVersion: 1;
  profileSchemaVersion: 1;
  protocolVersion: 1;
  parentAgentId?: string;
  role: CompileTaskPacketInput["role"];
  profile: DelegationProfile;
  cwd: string;
  objective: string;
  tools: string[];
  writeScopes: string[];
  allowedCommands: string[];
  sourcePointers: TaskPacketSourcePointer[];
  inScope: string[];
  outOfScope: string[];
  deny: string[];
  policySummary: string[];
  evidence: TaskPacketEvidencePointer[];
  stopConditions: string[];
  returnProtocol: string[];
  returnFields: string[];
  tracePath: string;
  resultPath: string;
}

export function compileTaskPacket(input: CompileTaskPacketInput): CompiledTaskPacket {
  const packet = normalizeTaskPacket(input);
  return {
    text: renderTaskPacketMarkdown(packet),
    assignmentId: packet.assignmentId,
    attemptId: packet.attemptId,
    identitySchemaVersion: packet.identitySchemaVersion,
    profileSchemaVersion: packet.profileSchemaVersion,
    protocolVersion: packet.protocolVersion,
    role: packet.role,
    profile: packet.profile,
    tools: packet.tools,
    writeScopes: packet.writeScopes,
    allowedCommands: packet.allowedCommands,
  };
}

export const compileFreeflowTaskPacket = compileTaskPacket;

export function validateTaskPacketIdentity(text: string, expected: Partial<TaskPacketIdentity>): TaskPacketIdentity {
  const taskId = validateRequiredSafeId(packetIdentityField(text, /^- task: (.+)$/m, "taskId"), "packet task id");
  const assignmentMatch = packetIdentityMatch(text, /^- agent\/assignment: (.+) \/ (.+)$/m, "agentId/assignmentId");
  const agentId = validateRequiredSafeId(assignmentMatch[1] ?? "", "packet agent id");
  const assignmentId = validateRequiredSafeId(assignmentMatch[2] ?? "", "packet assignment id");
  const attemptId = validateRequiredSafeId(packetIdentityField(text, /^- attempt: (.+)$/m, "attemptId"), "packet attempt id");
  const versionMatch = packetIdentityMatch(text, /^- identity\/profile\/protocol versions: (\d+) \/ (\d+) \/ (\d+)$/m, "identity/profile/protocol versions");
  const identitySchemaVersion = currentVersion(Number(versionMatch[1]), CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION, "packet identity schema");
  const profileSchemaVersion = currentVersion(Number(versionMatch[2]), CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION, "packet profile schema");
  const protocolVersion = currentVersion(Number(versionMatch[3]), CURRENT_DELEGATION_PROTOCOL_VERSION, "packet protocol");
  const roleProfileMatch = packetIdentityMatch(text, /^- role\/profile: (.+) \/ (.+)$/m, "role/profile");
  const role = roleProfileMatch[1] as CompileTaskPacketInput["role"];
  const profile = roleProfileMatch[2] as DelegationProfile;
  resolveProfileForRole(role, profile);

  const identity: TaskPacketIdentity = {
    taskId,
    agentId,
    assignmentId,
    attemptId,
    role,
    profile,
    identitySchemaVersion,
    profileSchemaVersion,
    protocolVersion,
  };
  for (const field of Object.keys(identity) as Array<keyof TaskPacketIdentity>) {
    const expectedValue = expected[field];
    if (expectedValue !== undefined && expectedValue !== identity[field]) {
      throw new Error(`packet ${field} ${String(identity[field])} does not match expected ${String(expectedValue)}`);
    }
  }
  return identity;
}

export function renderTaskPacketMarkdown(packet: NormalizedTaskPacket): string {
  const lines: string[] = [];
  lines.push(`# Delegated task: ${packet.agentId}`, "");
  lines.push("## Identity");
  lines.push(`- task: ${packet.taskId}`);
  lines.push(`- agent/assignment: ${packet.agentId} / ${packet.assignmentId}`);
  lines.push(`- attempt: ${packet.attemptId}`);
  lines.push(`- identity/profile/protocol versions: ${packet.identitySchemaVersion} / ${packet.profileSchemaVersion} / ${packet.protocolVersion}`);
  lines.push(`- role/profile: ${packet.role} / ${packet.profile}`);
  lines.push(`- parent: ${packet.parentAgentId ?? "none"}`);
  lines.push(`- cwd: ${packet.cwd}`, "");

  lines.push("## Objective", packet.objective, "");

  lines.push("## Source pointers");
  if (packet.sourcePointers.length === 0) {
    lines.push("- none");
  } else {
    for (const source of packet.sourcePointers) {
      lines.push(`- ${source.kind}: ${source.path}${source.note ? ` — ${source.note}` : ""}`);
    }
  }
  lines.push("");

  lines.push("## Scope", "In:");
  for (const item of packet.inScope) lines.push(`- ${item}`);
  lines.push("", "Out:");
  for (const item of packet.outOfScope) lines.push(`- ${item}`);
  lines.push("");

  lines.push("## Tools and policy", "Allowed tools:");
  for (const tool of packet.tools) lines.push(`- ${tool}`);
  lines.push("", "Denied / constrained:");
  for (const item of packet.deny) lines.push(`- ${item}`);
  lines.push("", "Policy notes:");
  for (const item of packet.policySummary) lines.push(`- ${item}`);
  lines.push("", "Write scope:");
  if (packet.writeScopes.length === 0) lines.push("- none");
  else for (const scope of packet.writeScopes) lines.push(`- ${scope}`);
  lines.push("", "Allowed commands:");
  if (packet.allowedCommands.length === 0) lines.push("- none");
  else for (const command of packet.allowedCommands) lines.push(`- ${command}`);
  lines.push("");

  lines.push("## Evidence handles");
  if (packet.evidence.length === 0) {
    lines.push("- none");
  } else {
    for (const pointer of packet.evidence) {
      const handle = pointer.outputId !== undefined ? `outputId=${pointer.outputId}` : `path=${pointer.path ?? ""}`;
      const suffix = [pointer.lines ? `lines=${pointer.lines}` : undefined, pointer.note].filter(Boolean).join(" — ");
      lines.push(`- ${pointer.label}: ${handle}${suffix.length > 0 ? ` — ${suffix}` : ""}`);
    }
  }
  lines.push("");

  lines.push("## Stop conditions");
  for (const condition of packet.stopConditions) lines.push(`- ${condition}`);
  lines.push("");

  lines.push("## Return");
  for (const protocol of packet.returnProtocol) lines.push(`- ${protocol}`);
  lines.push("", "Return fields:");
  for (const field of packet.returnFields) lines.push(`- ${field}`);
  if (packet.tools.includes("delegate_finish")) {
    lines.push("", "Use `delegate_finish` when complete. It stores the result and alerts the direct parent without echoing the full result in chat.");
  }
  if (packet.tools.includes("delegate_attention")) {
    lines.push("Use `delegate_attention` when blocked or parent input is needed.");
  }
  if (packet.tools.includes("delegate_progress")) {
    lines.push("Use `delegate_progress` only for store-only progress that should not wake the parent.");
  }
  lines.push("", "Legacy fallback (only if lifecycle tools are unavailable):");
  lines.push("```text");
  lines.push("FFRESULT");
  lines.push("STATUS|completed");
  lines.push("SUMMARY|One-line result summary.");
  lines.push("END_FFRESULT");
  lines.push("```");
  lines.push("");

  lines.push("## Evidence storage");
  lines.push(`- transcript: ${packet.tracePath}`);
  lines.push(`- result: ${packet.resultPath}`);
  lines.push("");

  lines.push("Do not stage, commit, push, spawn children, or use tools outside this packet unless the parent explicitly sends a new packet.");
  return `${lines.join("\n")}\n`;
}

export function renderTaskPacketRows(input: CompileTaskPacketInput): string {
  const packet = normalizeTaskPacket(input);
  const rows: string[] = ["FREEFLOW_TASK_PACKET"];
  addRow(rows, "IDENTITY", [
    `task=${packet.taskId}`,
    `agent=${packet.agentId}`,
    `assignment=${packet.assignmentId}`,
    `attempt=${packet.attemptId}`,
    `identityVersion=${packet.identitySchemaVersion}`,
    `profileVersion=${packet.profileSchemaVersion}`,
    `protocolVersion=${packet.protocolVersion}`,
    `role=${packet.role}`,
    `parent=${packet.parentAgentId ?? "none"}`,
    `profile=${packet.profile}`,
  ]);
  addRow(rows, "CWD", [packet.cwd]);
  addRow(rows, "OBJECTIVE", [packet.objective]);
  if (packet.sourcePointers.length === 0) {
    addRow(rows, "SOURCE", ["none"]);
  } else {
    for (const source of packet.sourcePointers) {
      const fields = [source.kind, source.path];
      if (source.note !== undefined) fields.push(source.note);
      addRow(rows, "SOURCE", fields);
    }
  }
  for (const item of packet.inScope) addRow(rows, "IN_SCOPE", [item]);
  for (const item of packet.outOfScope) addRow(rows, "OUT_OF_SCOPE", [item]);
  addRow(rows, "TOOLS", [packet.tools.join(",")]);
  addRow(rows, "DENY", [packet.deny.join(",")]);
  for (const item of packet.policySummary) addRow(rows, "POLICY", [item]);
  for (const scope of packet.writeScopes.length === 0 ? ["none"] : packet.writeScopes) addRow(rows, "WRITE_SCOPE", [scope]);
  for (const command of packet.allowedCommands.length === 0 ? ["none"] : packet.allowedCommands) addRow(rows, "ALLOWED_COMMAND", [command]);
  if (packet.evidence.length === 0) {
    addRow(rows, "EVIDENCE", ["none"]);
  } else {
    for (const pointer of packet.evidence) {
      const ref = pointer.outputId !== undefined ? `outputId=${pointer.outputId}` : `path=${pointer.path ?? ""}`;
      const fields = [pointer.label, ref];
      if (pointer.lines !== undefined) fields.push(`lines=${pointer.lines}`);
      if (pointer.note !== undefined) fields.push(pointer.note);
      addRow(rows, "EVIDENCE", fields);
    }
  }
  for (const condition of packet.stopConditions) addRow(rows, "STOP", [condition]);
  for (const protocol of packet.returnProtocol) addRow(rows, "RETURN", [protocol]);
  addRow(rows, "RETURN_FIELDS", [packet.returnFields.join(",")]);
  addRow(rows, "TRACE_PATH", [packet.tracePath]);
  addRow(rows, "RESULT_PATH", [packet.resultPath]);
  rows.push("END_FREEFLOW_TASK_PACKET");
  return `${rows.join("\n")}\n`;
}

function normalizeTaskPacket(input: CompileTaskPacketInput): NormalizedTaskPacket {
  const taskId = validateRequiredSafeId(input.taskId, "task id");
  const agentId = validateRequiredSafeId(input.agentId, "agent id");
  const missingIdentity = (["assignmentId", "attemptId", "identitySchemaVersion", "profileSchemaVersion", "protocolVersion"] as const)
    .filter((field) => input[field] === undefined);
  if (missingIdentity.length > 0) {
    throw new Error(`task packet identity requires explicit assignmentId, attemptId, identitySchemaVersion, profileSchemaVersion, protocolVersion; missing ${missingIdentity.join(", ")}`);
  }
  const assignmentId = validateRequiredSafeId(input.assignmentId, "assignment id");
  if (assignmentId !== agentId) {
    throw new Error(`assignment id ${assignmentId} must match agent id ${agentId}`);
  }
  const attemptId = validateRequiredSafeId(input.attemptId, "attempt id");
  const identitySchemaVersion = currentVersion(input.identitySchemaVersion, CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION, "identity schema");
  const profileSchemaVersion = currentVersion(input.profileSchemaVersion, CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION, "profile schema");
  const protocolVersion = currentVersion(input.protocolVersion, CURRENT_DELEGATION_PROTOCOL_VERSION, "protocol");
  const role = input.role;
  const profile = input.profile ?? (role as DelegationProfile);
  const profileDefinition = resolveProfileForRole(role, profile);
  const parentAgentId = input.parentAgentId !== undefined ? validateRequiredSafeId(input.parentAgentId, "parent agent id") : undefined;
  const cwd = validateCwd(input.cwd);
  const objective = validatePacketField(input.objective, "objective");
  if (objective.trim().length === 0) {
    throw new Error("objective must not be empty");
  }

  const tools = normalizeTools(input.tools ?? profileDefinition.activeTools, profileDefinition.activeTools, profile);
  const writeScopes = normalizeWriteScopes(input.writeScope);
  if (profileDefinition.defaultPolicy.requireWriteScope && profileDefinition.activeTools.some((tool) => tool === "edit" || tool === "write") && writeScopes.length === 0) {
    throw new Error(`profile ${profile} requires at least one write scope`);
  }
  const defaultReturnSpec = defaultReturnProtocolForRole(role);
  const returnProtocol = normalizeReturnProtocol(input.returnProtocol, defaultReturnSpec.returnProtocol, role, tools);

  return {
    taskId,
    agentId,
    assignmentId,
    attemptId,
    identitySchemaVersion,
    profileSchemaVersion,
    protocolVersion,
    ...(parentAgentId !== undefined ? { parentAgentId } : {}),
    role,
    profile,
    cwd,
    objective,
    tools,
    writeScopes,
    allowedCommands: normalizeAllowedCommands(input.allowedCommands ?? []),
    sourcePointers: normalizeSourcePointers(input.sourcePointers ?? []),
    inScope: normalizePacketList(input.inScope ?? ["Use the assigned objective and source pointers only."], "in scope"),
    outOfScope: normalizePacketList(input.outOfScope ?? ["Anything not named in this packet."], "out of scope"),
    deny: normalizePacketList(input.deny ?? defaultDenySummaryForProfile(profile), "deny"),
    policySummary: normalizePacketList(input.policySummary ?? defaultPolicySummary(profile, profileDefinition.defaultPolicy.commandPolicy), "policy summary"),
    evidence: normalizeEvidencePointers(input.evidence ?? []),
    stopConditions: normalizePacketList(input.stopConditions ?? DEFAULT_STOP_CONDITIONS, "stop condition"),
    returnProtocol,
    returnFields: normalizePacketList(input.returnFields ?? defaultReturnSpec.returnFields, "return fields"),
    tracePath: validateRequiredPath(input.tracePath, "trace path"),
    resultPath: validateRequiredPath(input.resultPath, "result path"),
  };
}

function addRow(rows: string[], tag: string, fields: readonly string[]): void {
  rows.push(formatProtocolRow(tag, fields));
}

function packetIdentityField(text: string, pattern: RegExp, label: string): string {
  return packetIdentityMatch(text, pattern, label)[1] ?? "";
}

function packetIdentityMatch(text: string, pattern: RegExp, label: string): RegExpMatchArray {
  const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`task packet identity is incomplete or ambiguous: expected one ${label} field, found ${matches.length}`);
  }
  return matches[0] as RegExpMatchArray;
}

function currentVersion(value: number, expected: 1, label: string): 1 {
  const actual = value;
  if (actual !== expected) {
    throw new Error(`${label} version ${actual} is not supported; expected ${expected}`);
  }
  return expected;
}

function validateRequiredSafeId(value: string, label: string): string {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return validateSafeId(String(value), label);
}

function validateCwd(value: string): string {
  const cwd = validatePathLike(value, "cwd");
  if (!isAbsolute(cwd)) {
    throw new Error("cwd must be an absolute path");
  }
  return cwd;
}

function normalizeTools(tools: readonly string[], activeTools: readonly string[], profile: DelegationProfile): string[] {
  const normalized = normalizePacketList(tools, "tool");
  for (const tool of normalized) {
    if (!activeTools.includes(tool)) {
      throw new Error(`tool ${tool} is not active for profile ${profile}`);
    }
    if (isDelegationTool(tool) && !activeTools.some(isDelegationTool)) {
      throw new Error(`profile ${profile} cannot receive delegation tool ${tool}`);
    }
  }
  if (normalized.some(isDelegationTool) && activeTools.every((tool) => !isDelegationTool(tool))) {
    throw new Error(`profile ${profile} cannot receive delegation tools`);
  }
  return [...new Set(normalized)];
}

function normalizeWriteScopes(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  const scopes = Array.isArray(value) ? value : [value];
  return [...new Set(scopes.map((scope, index) => validateWriteScope(scope, `write scope ${index + 1}`)))];
}

function normalizeReturnProtocol(input: readonly string[] | undefined, defaultProtocol: readonly string[], role: CompileTaskPacketInput["role"], tools: readonly string[]): string[] {
  const protocol = input === undefined
    ? returnProtocolForActiveTools(role, tools)
    : normalizePacketList(input, "return protocol");
  if (!tools.includes("delegate_finish") && protocol.some((item) => item.includes("DELEGATE_FINISH"))) {
    throw new Error("return protocol must not mention delegate_finish unless delegate_finish is active for this packet");
  }
  if (input === undefined && protocol.length === 0) {
    return [...defaultProtocol];
  }
  return protocol;
}

function normalizeAllowedCommands(commands: readonly string[]): string[] {
  return commands.map((command, index) => validateCommand(command, `allowed command ${index + 1}`));
}

function normalizeSourcePointers(pointers: readonly TaskPacketSourcePointer[]): TaskPacketSourcePointer[] {
  return pointers.map((pointer, index) => {
    const kind = validatePacketField(pointer.kind, `source ${index + 1} kind`);
    const path = validatePathLike(pointer.path, `source ${index + 1} path`);
    if (pointer.note === undefined) {
      return { kind, path };
    }
    return { kind, path, note: validatePacketField(pointer.note, `source ${index + 1} note`) };
  });
}

function normalizeEvidencePointers(pointers: readonly TaskPacketEvidencePointer[]): TaskPacketEvidencePointer[] {
  return pointers.map((pointer, index) => {
    const label = validatePacketField(pointer.label, `evidence ${index + 1} label`);
    const hasPath = pointer.path !== undefined && pointer.path.trim().length > 0;
    const hasOutputId = pointer.outputId !== undefined && pointer.outputId.trim().length > 0;
    if (!hasPath && !hasOutputId) {
      throw new Error(`evidence ${index + 1} must reference a path or outputId`);
    }
    const normalized: TaskPacketEvidencePointer = { label };
    if (hasPath) {
      normalized.path = validatePathLike(pointer.path ?? "", `evidence ${index + 1} path`);
    }
    if (hasOutputId) {
      normalized.outputId = validatePacketField(pointer.outputId ?? "", `evidence ${index + 1} outputId`);
    }
    if (pointer.lines !== undefined) {
      normalized.lines = validatePacketField(pointer.lines, `evidence ${index + 1} lines`);
    }
    if (pointer.note !== undefined) {
      normalized.note = validatePacketField(pointer.note, `evidence ${index + 1} note`);
    }
    return normalized;
  });
}

function normalizePacketList(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be a list`);
  }
  const normalized = values.map((value, index) => validatePacketField(value, `${label} ${index + 1}`));
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function validatePacketField(value: string, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  if (value.includes("\0")) {
    throw new Error(`${label} must not contain NUL bytes`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  if (value.length > MAX_PACKET_FIELD_CHARS) {
    throw new Error(`${label} is too long; store raw detail in a path or outputId and reference it`);
  }
  return value;
}

function validateRequiredPath(value: string | undefined, label: string): string {
  if (value === undefined) {
    throw new Error(`${label} is required`);
  }
  return validatePathLike(value, label);
}

function validateWriteScope(value: string, label: string): string {
  const scope = validatePathLike(value, label);
  if (/[,;|]/.test(scope) || /\s/.test(scope)) {
    throw new Error(`${label} must be a path or glob scope only; pass multiple scopes as an array, not prose or comma-separated text`);
  }
  return scope;
}

function validatePathLike(value: string, label: string): string {
  const path = validatePacketField(value, label);
  if (/\r|\n/.test(path)) {
    throw new Error(`${label} must not contain newlines`);
  }
  if (path.split(/[\\/]+/).includes("..")) {
    throw new Error(`${label} must not contain traversal segments`);
  }
  return path;
}

function validateCommand(value: string, label: string): string {
  const command = validatePacketField(value, label).trim();
  if (/\r|\n/.test(command)) {
    throw new Error(`${label} must not contain newlines`);
  }
  return command;
}

function defaultPolicySummary(profile: DelegationProfile, commandPolicy: string): string[] {
  const summary = [
    `profile=${profile}`,
    "skills_not_hard_gated",
    "use_routed_tools_for_broad_noisy_unknown_output",
    "return_compact_summaries_with_paths_or_outputIds",
  ];
  if (commandPolicy === "allowed-list") {
    summary.push("commands_require_ALLOWED_COMMAND_rows");
  }
  return summary;
}
