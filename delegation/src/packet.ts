import { isAbsolute } from "node:path";

import { formatProtocolRow } from "./protocol.js";
import {
  defaultDenySummaryForProfile,
  defaultReturnProtocolForRole,
  isDelegationTool,
  resolveProfileForRole,
} from "./profiles.js";
import { validateSafeId } from "./paths.js";
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

export function compileTaskPacket(input: CompileTaskPacketInput): CompiledTaskPacket {
  const taskId = validateRequiredSafeId(input.taskId, "task id");
  const agentId = validateRequiredSafeId(input.agentId, "agent id");
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

  const allowedCommands = normalizeAllowedCommands(input.allowedCommands ?? []);
  const sourcePointers = normalizeSourcePointers(input.sourcePointers ?? []);
  const inScope = normalizePacketList(input.inScope ?? ["Use the assigned objective and source pointers only."], "in scope");
  const outOfScope = normalizePacketList(input.outOfScope ?? ["Anything not named in this packet."], "out of scope");
  const deny = normalizePacketList(input.deny ?? defaultDenySummaryForProfile(profile), "deny");
  const policySummary = normalizePacketList(input.policySummary ?? defaultPolicySummary(profile, profileDefinition.defaultPolicy.commandPolicy), "policy summary");
  const evidence = normalizeEvidencePointers(input.evidence ?? []);
  const stopConditions = normalizePacketList(input.stopConditions ?? DEFAULT_STOP_CONDITIONS, "stop condition");
  const defaultReturn = defaultReturnProtocolForRole(role);
  const returnProtocol = normalizePacketList(input.returnProtocol ?? defaultReturn.returnProtocol, "return protocol");
  const returnFields = normalizePacketList(input.returnFields ?? defaultReturn.returnFields, "return fields");
  const tracePath = validateRequiredPath(input.tracePath, "trace path");
  const resultPath = validateRequiredPath(input.resultPath, "result path");

  const rows: string[] = ["FREEFLOW_TASK_PACKET"];
  addRow(rows, "IDENTITY", [
    `task=${taskId}`,
    `agent=${agentId}`,
    `role=${role}`,
    `parent=${parentAgentId ?? "none"}`,
    `profile=${profile}`,
  ]);
  addRow(rows, "CWD", [cwd]);
  addRow(rows, "OBJECTIVE", [objective]);

  if (sourcePointers.length === 0) {
    addRow(rows, "SOURCE", ["none"]);
  } else {
    for (const source of sourcePointers) {
      const fields = [source.kind, source.path];
      if (source.note !== undefined) {
        fields.push(source.note);
      }
      addRow(rows, "SOURCE", fields);
    }
  }
  for (const item of inScope) {
    addRow(rows, "IN_SCOPE", [item]);
  }
  for (const item of outOfScope) {
    addRow(rows, "OUT_OF_SCOPE", [item]);
  }

  addRow(rows, "TOOLS", [tools.join(",")]);
  addRow(rows, "DENY", [deny.join(",")]);
  for (const item of policySummary) {
    addRow(rows, "POLICY", [item]);
  }

  if (writeScopes.length === 0) {
    addRow(rows, "WRITE_SCOPE", ["none"]);
  } else {
    for (const scope of writeScopes) {
      addRow(rows, "WRITE_SCOPE", [scope]);
    }
  }

  if (allowedCommands.length === 0) {
    addRow(rows, "ALLOWED_COMMAND", ["none"]);
  } else {
    for (const command of allowedCommands) {
      addRow(rows, "ALLOWED_COMMAND", [command]);
    }
  }

  if (evidence.length === 0) {
    addRow(rows, "EVIDENCE", ["none"]);
  } else {
    for (const pointer of evidence) {
      const ref = pointer.outputId !== undefined ? `outputId=${pointer.outputId}` : `path=${pointer.path ?? ""}`;
      const fields = [pointer.label, ref];
      if (pointer.lines !== undefined) {
        fields.push(`lines=${pointer.lines}`);
      }
      if (pointer.note !== undefined) {
        fields.push(pointer.note);
      }
      addRow(rows, "EVIDENCE", fields);
    }
  }

  for (const condition of stopConditions) {
    addRow(rows, "STOP", [condition]);
  }
  for (const protocol of returnProtocol) {
    addRow(rows, "RETURN", [protocol]);
  }
  addRow(rows, "RETURN_FIELDS", [returnFields.join(",")]);
  addRow(rows, "TRACE_PATH", [tracePath]);
  addRow(rows, "RESULT_PATH", [resultPath]);
  rows.push("END_FREEFLOW_TASK_PACKET");

  return {
    text: `${rows.join("\n")}\n`,
    role,
    profile,
    tools,
    writeScopes,
    allowedCommands,
  };
}

export const compileFreeflowTaskPacket = compileTaskPacket;

function addRow(rows: string[], tag: string, fields: readonly string[]): void {
  rows.push(formatProtocolRow(tag, fields));
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
  return scopes.map((scope, index) => validatePathLike(scope, `write scope ${index + 1}`));
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
