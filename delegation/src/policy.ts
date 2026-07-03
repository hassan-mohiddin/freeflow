import { isAbsolute, relative, resolve } from "node:path";

import {
  getProfileDefinition,
  isDelegationTool,
  resolveProfileForRole,
} from "./profiles.js";
import type {
  DelegationPolicyReroute,
  DelegationProfile,
  DelegationProfileDefinition,
  DelegationRole,
  DelegationTaskPolicy,
  EvaluatePolicyInput,
  PolicyBlockCode,
  PolicyBlockDecision,
  PolicyDecision,
  PolicyIntent,
} from "./types.js";

const SECRET_PATH_PATTERNS = [
  /(^|[\\/])\.env(?:$|[.\\/-])/i,
  /(^|[\\/])\.ssh(?:$|[\\/])/i,
  /(^|[\\/])\.aws(?:$|[\\/])/i,
  /(^|[\\/])\.config[\\/]gh(?:$|[\\/])/i,
  /(^|[\\/])(?:secrets?|credentials?)(?:$|[.\\/-])/i,
  /(?:^|[\\/])(?:id_rsa|id_dsa|id_ed25519|known_hosts)(?:$|[.\\/-])/i,
  /(?:private[_-]?key|access[_-]?token|api[_-]?key)/i,
  /\.(?:pem|key|p12|pfx|crt|cert)$/i,
];

const DOC_OR_ARTIFACT_PREFIXES = [
  "docs/",
  "plugin-docs/",
  "evals/",
  ".freeflow/delegation/",
];

const SHELL_WRAPPER_PAYLOAD_RE = /(?:^|[;&|]\s*)(?:env\s+)?(?:bash|sh|zsh|fish)(?:\s+-[A-Za-z]+)*\s+(?:-[A-Za-z]*c[A-Za-z]*|-c)\s+(?:"((?:\\.|[^"\\])*)"|'([^']*)'|([^;&|]+))/g;
const SHELL_WRAPPER_COMMAND_RE = /(?:^|[;&|]\s*)(?:env\s+)?(?:bash|sh|zsh|fish)(?:\s+-[A-Za-z]+)*\s+(?:-[A-Za-z]*c[A-Za-z]*|-c)(?:\s|$)/;
const DYNAMIC_SHELL_PAYLOAD_RE = /(^|[^\\])(?:`|\$\(|\$\{|\$[A-Za-z_][A-Za-z0-9_]*)/;

export function evaluatePolicy(input: EvaluatePolicyInput): PolicyDecision {
  const role = input.role;
  const profile = input.profile ?? (role as DelegationProfile);
  let definition: DelegationProfileDefinition;
  try {
    definition = resolveProfileForRole(role, profile);
  } catch (error) {
    return blockFromProfileError(error, role, profile);
  }

  const intent = input.intent;
  if (!isValidIntentShape(intent)) {
    return block("malformed_intent", "policy intent is malformed", role, profile, definition.defaultPolicy.suggestedReroute);
  }

  if (intent.kind === "tool" && isDelegationTool(intent.toolName) && definition.kind === "leaf") {
    return block(
      "delegation_tool_for_leaf",
      `leaf profile ${profile} cannot use delegation tool ${intent.toolName}`,
      role,
      profile,
      "parent",
      { kind: "capability_gap", detail: "leaf agents cannot spawn or manage delegated panes" },
    );
  }

  if ((intent.kind === "read" || intent.kind === "write") && definition.defaultPolicy.denySecretPaths && isSecretPath(intent.path)) {
    return block("secret_path", `access to secret or credential path is blocked: ${intent.path}`, role, profile, definition.defaultPolicy.suggestedReroute);
  }

  const toolName = inferToolName(intent, definition);
  if (toolName === undefined || !definition.activeTools.includes(toolName)) {
    const requested = explicitToolName(intent) ?? toolName ?? intent.kind;
    return block(
      "capability_gap",
      `tool ${requested} is not active for profile ${profile}`,
      role,
      profile,
      definition.defaultPolicy.suggestedReroute,
      { kind: "capability_gap", detail: `reroute to a profile with ${requested}` },
    );
  }

  if (intent.kind === "write") {
    const writeDecision = evaluateWrite(intent.path, input.taskPolicy, role, profile, definition);
    if (!writeDecision.allowed) {
      return writeDecision;
    }
  }

  if (intent.kind === "command") {
    const commandDecision = evaluateCommand(intent.command, input.taskPolicy, role, profile, definition);
    if (!commandDecision.allowed) {
      return commandDecision;
    }
  }

  return {
    allowed: true,
    status: "allowed",
    role,
    profile,
    reason: `${intent.kind} intent is allowed for ${role}/${profile}`,
  };
}

export function isSecretPath(path: string): boolean {
  const normalized = normalizeForPolicy(path);
  return SECRET_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function commandMatchesAllowedList(command: string, allowedCommands: readonly string[] = []): boolean {
  const normalized = normalizeCommand(command);
  return allowedCommands.some((allowed) => normalizeCommand(allowed) === normalized);
}

export function isCommandBlockedAsDestructive(command: string): boolean {
  return commandInspectionStrings(command).some((candidate) => [
    /(?:^|[;&|]\s*)(?:sudo\s+)?rm\s+(?=[^;&|]*-[A-Za-z]*[rR])(?=[^;&|]*-[A-Za-z]*[fF])[^;&|]*/,
    /(?:^|[;&|]\s*)git\s+reset\s+--hard\b/,
    /(?:^|[;&|]\s*)git\s+clean\s+(?=[^;&|]*-[A-Za-z]*[fF])(?=[^;&|]*-[A-Za-z]*[dD])[^;&|]*/,
    /(?:^|[;&|]\s*)mkfs(?:\.|\s|$)/,
    /(?:^|[;&|]\s*)dd\s+[^\n;|&]*\bof=/,
    /(?:^|[;&|]\s*)chmod\s+-R\s+777\b/,
    /(?:^|[;&|]\s*)chown\s+-R\b/,
    /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,
  ].some((pattern) => pattern.test(candidate)));
}

export function isCredentialOrEnvDumpCommand(command: string): boolean {
  return commandInspectionStrings(command).some((candidate) => [
    /^(?:env|printenv|set)(?:\s|$)/,
    /^export\s+-p(?:\s|$)/,
    /(?:^|[;&|]\s*)cat\s+[^\n;|&]*(?:\.env|\.ssh|credentials?|secrets?)/i,
    /(?:^|[;&|]\s*)grep\s+[^\n;|&]*(?:\.env|credentials?|secrets?|api[_-]?key|token|password)/i,
    /(?:^|[;&|]\s*)echo\s+\$[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY)[A-Z0-9_]*/,
    /(?:^|[;&|]\s*)aws\s+configure\s+list\b/,
    /(?:^|[;&|]\s*)gcloud\s+auth\b/,
  ].some((pattern) => pattern.test(candidate)));
}

export function isPublishOrDeployCommand(command: string): boolean {
  return commandInspectionStrings(command).some((candidate) => [
    /(?:^|[;&|]\s*)npm\s+publish\b/,
    /(?:^|[;&|]\s*)pnpm\s+publish\b/,
    /(?:^|[;&|]\s*)yarn\s+(?:npm\s+)?publish\b/,
    /(?:^|[;&|]\s*)npm\s+run\s+(?:deploy|release|publish)\b/,
    /(?:^|[;&|]\s*)pnpm\s+(?:deploy|release)\b/,
    /(?:^|[;&|]\s*)yarn\s+(?:deploy|release)\b/,
    /(?:^|[;&|]\s*)gh\s+release\b/,
    /(?:^|[;&|]\s*)(?:vercel|netlify|firebase|wrangler)\s+deploy\b/,
    /(?:^|[;&|]\s*)docker\s+push\b/,
  ].some((pattern) => pattern.test(candidate)));
}

export function isGitPushCommand(command: string): boolean {
  return commandInspectionStrings(command).some((candidate) => /(?:^|[;&|]\s*)git\s+push\b/.test(candidate));
}

export function isGitCommitCommand(command: string): boolean {
  return commandInspectionStrings(command).some((candidate) => /(?:^|[;&|]\s*)git\s+commit\b/.test(candidate));
}

export function isBroadGitStageCommand(command: string): boolean {
  return commandInspectionStrings(command).some((candidate) => /(?:^|[;&|]\s*)git\s+add\s+(?:\.|-A|--all)(?:\s|$)/.test(candidate));
}

function evaluateWrite(
  path: string,
  taskPolicy: DelegationTaskPolicy | undefined,
  role: DelegationRole,
  profile: DelegationProfile,
  definition: DelegationProfileDefinition,
): PolicyDecision {
  const writeScopes = taskPolicy?.writeScopes ?? [];
  if (writeScopes.length === 0 && definition.defaultPolicy.productCodeWritesRequireScope && isLikelyProductCodePath(path, taskPolicy?.cwd)) {
    return block("product_code_write_requires_scope", `product-code write requires explicit write scope: ${path}`, role, profile, definition.defaultPolicy.suggestedReroute);
  }
  if (writeScopes.length === 0 && definition.defaultPolicy.requireWriteScope) {
    return block("missing_write_scope", `profile ${profile} requires an explicit write scope before writing ${path}`, role, profile, definition.defaultPolicy.suggestedReroute);
  }
  if (writeScopes.length > 0 && !isPathInsideAnyScope(path, writeScopes, taskPolicy?.cwd)) {
    return block("write_scope_violation", `write path is outside allowed write scope: ${path}`, role, profile, definition.defaultPolicy.suggestedReroute);
  }
  return { allowed: true, status: "allowed", role, profile, reason: "write is inside policy scope" };
}

function evaluateCommand(
  command: string,
  taskPolicy: DelegationTaskPolicy | undefined,
  role: DelegationRole,
  profile: DelegationProfile,
  definition: DelegationProfileDefinition,
): PolicyDecision {
  if (hasUninspectableShellWrapper(command)) {
    return block("command_not_allowed", "shell wrapper payload is dynamic or not inspectable", role, profile, definition.defaultPolicy.suggestedReroute);
  }

  if (definition.defaultPolicy.denyCredentialEnvDumping && isCredentialOrEnvDumpCommand(command)) {
    return block("credential_env_dump", "credential or environment dumping command is blocked", role, profile, definition.defaultPolicy.suggestedReroute);
  }

  if (isGitPushCommand(command)) {
    if (role === "orchestrator" && taskPolicy?.allowGitPush === true && taskPolicy.explicitUserConfirmation === true) {
      return { allowed: true, status: "allowed", role, profile, reason: "git push explicitly confirmed for orchestrator" };
    }
    return block("git_push_denied", "git push is blocked unless orchestrator has explicit user confirmation", role, profile, "orchestrator");
  }

  if (isGitCommitCommand(command) || isBroadGitStageCommand(command)) {
    if ((taskPolicy?.allowCommits === true || taskPolicy?.plannedCommit === true) && role !== "worker" && role !== "reviewer" && role !== "verifier" && role !== "researcher") {
      return { allowed: true, status: "allowed", role, profile, reason: "planned commit command is allowed for this role" };
    }
    return block("unplanned_commit", "commit or broad staging command is blocked without a planned checkpoint", role, profile, definition.defaultPolicy.suggestedReroute);
  }

  if (!definition.defaultPolicy.allowDestructiveCommands && taskPolicy?.allowDestructiveCommands !== true && isCommandBlockedAsDestructive(command)) {
    return block("destructive_command", "destructive shell command is blocked", role, profile, definition.defaultPolicy.suggestedReroute);
  }

  if (!definition.defaultPolicy.allowPublishDeploy && taskPolicy?.allowPublishDeploy !== true && isPublishOrDeployCommand(command)) {
    return block("publish_deploy_denied", "publish/deploy command is blocked unless explicitly allowed", role, profile, definition.defaultPolicy.suggestedReroute);
  }

  const allowedCommands = taskPolicy?.allowedCommands ?? [];
  if (allowedCommands.length > 0 && !commandMatchesAllowedList(command, allowedCommands)) {
    return block("command_not_allowed", `command is not in the allowed command list: ${command}`, role, profile, definition.defaultPolicy.suggestedReroute);
  }

  if (definition.defaultPolicy.commandPolicy === "none") {
    return block("command_not_allowed", `profile ${profile} does not allow command execution`, role, profile, definition.defaultPolicy.suggestedReroute);
  }

  if (definition.defaultPolicy.commandPolicy === "allowed-list" && allowedCommands.length === 0) {
    return block(
      "command_not_allowed",
      `profile ${profile} requires ALLOWED_COMMAND entries before running commands`,
      role,
      profile,
      definition.defaultPolicy.suggestedReroute,
      { kind: "capability_gap", detail: "request parent to reroute or add an allowed command in a new packet" },
    );
  }

  return { allowed: true, status: "allowed", role, profile, reason: "command passed policy guards" };
}

function inferToolName(intent: PolicyIntent, definition: DelegationProfileDefinition): string | undefined {
  const explicit = explicitToolName(intent);
  if (explicit !== undefined) {
    return explicit;
  }
  if (intent.kind === "read") {
    return "read";
  }
  if (intent.kind === "write") {
    return definition.activeTools.includes("edit") ? "edit" : "write";
  }
  if (intent.kind === "command") {
    if (definition.activeTools.includes("bash")) {
      return "bash";
    }
    if (definition.activeTools.includes("freeflow_run")) {
      return "freeflow_run";
    }
    return undefined;
  }
  return intent.toolName;
}

function explicitToolName(intent: PolicyIntent): string | undefined {
  if (intent.kind === "tool") {
    return intent.toolName;
  }
  return intent.toolName;
}

function isValidIntentShape(intent: PolicyIntent): boolean {
  if (intent.kind === "tool") {
    return typeof intent.toolName === "string" && intent.toolName.trim().length > 0;
  }
  if (intent.kind === "read" || intent.kind === "write") {
    return typeof intent.path === "string" && intent.path.trim().length > 0 && !intent.path.includes("\0");
  }
  if (intent.kind === "command") {
    return typeof intent.command === "string" && intent.command.trim().length > 0 && !intent.command.includes("\0");
  }
  return false;
}

function blockFromProfileError(error: unknown, role: DelegationRole, profile: DelegationProfile): PolicyBlockDecision {
  const message = error instanceof Error ? error.message : "invalid role/profile";
  if (message.includes("unknown delegation role")) {
    return block("unknown_role", message);
  }
  if (message.includes("unknown delegation profile")) {
    return block("unknown_profile", message, role);
  }
  if (message.includes("cannot be used")) {
    return block("role_profile_mismatch", message, role, profile);
  }
  return block("unknown_profile", message, role, profile);
}

function block(
  code: PolicyBlockCode,
  reason: string,
  role?: DelegationRole,
  profile?: DelegationProfile,
  suggestedReroute?: DelegationPolicyReroute,
  request?: PolicyBlockDecision["request"],
): PolicyBlockDecision {
  const decision: PolicyBlockDecision = {
    allowed: false,
    status: "blocked",
    code,
    reason,
  };
  if (role !== undefined) {
    decision.role = role;
  }
  if (profile !== undefined) {
    decision.profile = profile;
  }
  if (suggestedReroute !== undefined) {
    decision.suggestedReroute = suggestedReroute;
  }
  if (request !== undefined) {
    decision.request = request;
  }
  return decision;
}

function isPathInsideAnyScope(path: string, scopes: readonly string[], cwd: string | undefined): boolean {
  return scopes.some((scope) => isPathInsideScope(path, scope, cwd));
}

function isPathInsideScope(path: string, scope: string, cwd: string | undefined): boolean {
  if (scope.trim().length === 0) {
    return false;
  }
  const normalizedScope = normalizeForPolicy(scope);
  const isGlobScope = normalizedScope.endsWith("/**");
  const scopeWithoutGlob = isGlobScope ? normalizedScope.slice(0, -3) : normalizedScope;

  if (isAbsolute(path) || isAbsolute(scopeWithoutGlob) || cwd !== undefined) {
    const absoluteTarget = isAbsolute(path) ? resolve(path) : resolve(cwd ?? process.cwd(), path);
    const absoluteScope = isAbsolute(scopeWithoutGlob) ? resolve(scopeWithoutGlob) : resolve(cwd ?? process.cwd(), scopeWithoutGlob);
    if (absoluteTarget === absoluteScope) {
      return true;
    }
    const rel = relative(absoluteScope, absoluteTarget);
    return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
  }

  const normalizedTarget = normalizeForPolicy(path);
  if (normalizedTarget === scopeWithoutGlob) {
    return true;
  }
  return normalizedTarget.startsWith(`${scopeWithoutGlob.replace(/\/$/, "")}/`);
}

function isLikelyProductCodePath(path: string, cwd: string | undefined): boolean {
  const relativePath = relativePolicyPath(path, cwd);
  return !DOC_OR_ARTIFACT_PREFIXES.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix));
}

function relativePolicyPath(path: string, cwd: string | undefined): string {
  if (cwd !== undefined && isAbsolute(path)) {
    const rel = relative(resolve(cwd), resolve(path));
    if (!rel.startsWith("..") && !isAbsolute(rel)) {
      return normalizeForPolicy(rel);
    }
  }
  return normalizeForPolicy(path.replace(/^\.\//, ""));
}

function hasUninspectableShellWrapper(command: string): boolean {
  const normalized = normalizeCommand(command);
  if (!SHELL_WRAPPER_COMMAND_RE.test(normalized)) {
    return false;
  }
  const payloads = extractShellWrapperPayloads(normalized);
  if (payloads.length === 0) {
    return true;
  }
  return payloads.some((payload) => DYNAMIC_SHELL_PAYLOAD_RE.test(payload));
}

function commandInspectionStrings(command: string): string[] {
  const seen = new Set<string>();
  const queue = [normalizeCommand(command)];
  for (let index = 0; index < queue.length && index < 10; index += 1) {
    const current = queue[index];
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const payload of extractShellWrapperPayloads(current)) {
      const normalizedPayload = normalizeCommand(payload);
      if (normalizedPayload.length > 0 && !seen.has(normalizedPayload)) {
        queue.push(normalizedPayload);
      }
    }
  }
  return [...seen];
}

function extractShellWrapperPayloads(command: string): string[] {
  const payloads: string[] = [];
  SHELL_WRAPPER_PAYLOAD_RE.lastIndex = 0;
  let match = SHELL_WRAPPER_PAYLOAD_RE.exec(command);
  while (match !== null) {
    const payload = match[1] ?? match[2] ?? match[3] ?? "";
    if (payload.trim().length > 0) {
      payloads.push(unescapeShellPayload(payload));
    }
    match = SHELL_WRAPPER_PAYLOAD_RE.exec(command);
  }
  return payloads;
}

function unescapeShellPayload(payload: string): string {
  return payload.replace(/\\(["'`$\\])/g, "$1");
}

function normalizeForPolicy(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}
