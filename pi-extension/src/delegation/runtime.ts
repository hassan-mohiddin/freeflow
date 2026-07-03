import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

import {
  createDelegationStore,
  defaultDenySummaryForProfile,
  defaultReturnProtocolForRole,
  evaluatePolicy,
  isDelegationTool,
  parseModelText,
  resolveProfileForRole,
  validateSafeId,
} from "../../../delegation/dist/index.js";

const DELEGATION_ENV_KEYS = [
  "FREEFLOW_DELEGATION_STORE",
  "FREEFLOW_DELEGATION_TASK_ID",
  "FREEFLOW_DELEGATION_AGENT_ID",
  "FREEFLOW_PARENT_AGENT_ID",
  "FREEFLOW_AGENT_ROLE",
  "FREEFLOW_CONTEXT_PROFILE",
] as const;

const DELEGATION_STATES = new Set([
  "created",
  "starting",
  "running",
  "waiting_for_parent",
  "attention",
  "blocked",
  "completed",
  "failed",
  "cancelled",
  "closed",
]);

const TERMINAL_RESULT_STATUS_TO_STATE = {
  completed: "completed",
  completed_with_risks: "completed",
  blocked: "blocked",
  failed: "failed",
  cancelled: "cancelled",
};

const MUTATING_MCP_TOOL_RE = /(?:^|_)(?:create|update|edit|write|delete|remove|close|merge|push|publish|deploy|send|post|mutate|apply)(?:_|$)/i;

const startupEventKeys = new Set<string>();
const notificationKeys = new Set<string>();

export function hasDelegationEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return DELEGATION_ENV_KEYS.some((key) => hasEnvValue(env[key]));
}

export function detectDelegatedRuntime(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  if (!hasDelegationEnv(env)) {
    return { mode: "normal" as const };
  }

  const errors: string[] = [];
  const rawValues: Record<string, string | undefined> = {};
  for (const key of DELEGATION_ENV_KEYS) {
    rawValues[key] = env[key];
    const raw = env[key];
    if (!hasEnvValue(raw)) {
      errors.push(`${key} is required for delegated runtime`);
      continue;
    }
    if (raw?.includes("\0")) {
      errors.push(`${key} must not contain NUL bytes`);
    }
    if (raw?.trim() !== raw) {
      errors.push(`${key} must not have surrounding whitespace`);
    }
  }

  const storeRoot = normalizeStoreRoot(env.FREEFLOW_DELEGATION_STORE, cwd, errors);
  const taskId = validateEnvSafeId(env.FREEFLOW_DELEGATION_TASK_ID, "FREEFLOW_DELEGATION_TASK_ID", errors);
  const agentId = validateEnvSafeId(env.FREEFLOW_DELEGATION_AGENT_ID, "FREEFLOW_DELEGATION_AGENT_ID", errors);
  const parentAgentId = validateEnvSafeId(env.FREEFLOW_PARENT_AGENT_ID, "FREEFLOW_PARENT_AGENT_ID", errors);
  const role = env.FREEFLOW_AGENT_ROLE;
  const profile = env.FREEFLOW_CONTEXT_PROFILE;

  let profileDefinition;
  if (hasEnvValue(role) && hasEnvValue(profile)) {
    try {
      profileDefinition = resolveProfileForRole(role as any, profile as any);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "invalid delegation role/profile");
    }
  }

  if (errors.length > 0) {
    return {
      mode: "blocked" as const,
      reason: "delegated_runtime_env_invalid",
      errors,
      rawValues,
      storeRoot,
      taskId,
      agentId,
      parentAgentId,
      role,
      profile,
    };
  }

  return {
    mode: "delegated" as const,
    storeRoot,
    taskId,
    agentId,
    parentAgentId,
    role,
    profile,
    profileDefinition,
  };
}

export async function handleDelegationSessionStart(pi: any, ctx: any) {
  const setup = await prepareDelegatedRuntime(pi, ctx);
  if (setup.detection.mode === "normal") {
    return;
  }
  await recordStartupState(setup, ctx);
}

export async function appendDelegatedRuntimeContext(pi: any, event: any, ctx: any, systemPrompt: string): Promise<string> {
  const setup = await prepareDelegatedRuntime(pi, ctx);
  if (setup.detection.mode === "normal") {
    return systemPrompt;
  }
  await recordStartupState(setup, ctx);
  return `${systemPrompt}\n\n${delegatedRuntimePrompt(setup)}`;
}

export async function handleDelegatedToolCall(event: any, ctx: any, pi?: any) {
  const setup = await prepareDelegatedRuntime(pi, ctx);
  if (setup.detection.mode === "normal") {
    return undefined;
  }

  if (setup.detection.mode === "blocked" || setup.blockers.length > 0) {
    const reason = setup.blockers.length > 0
      ? setup.blockers.join("; ")
      : setup.detection.errors.join("; ");
    await recordPolicyBlockedToolCall(setup, event, {
      allowed: false,
      status: "blocked",
      code: "malformed_intent",
      reason: `delegated runtime unavailable: ${reason}`,
      suggestedReroute: "parent",
      request: { kind: "policy_block", detail: "respawn delegated pane with valid runtime env and supported Pi active-tool API" },
    });
    return { block: true, reason: formatPolicyDeniedReason({ code: "delegated_runtime_unavailable", reason, suggestedReroute: "parent" }) };
  }

  const intent = toolCallToPolicyIntent(event);
  const taskPolicy = await loadTaskPolicy(setup, ctx);
  const decision = evaluatePolicy({
    role: setup.detection.role,
    profile: setup.detection.profile,
    intent,
    taskPolicy,
  });

  if (decision.allowed) {
    return undefined;
  }

  await recordPolicyBlockedToolCall(setup, event, decision);
  return { block: true, reason: formatPolicyDeniedReason(decision) };
}

export async function handleDelegatedAssistantMessageEnd(event: any, ctx: any) {
  const setup = await prepareDelegatedRuntime(undefined, ctx, { applyActiveTools: false });
  if (setup.detection.mode === "normal") {
    return undefined;
  }

  const message = event?.message;
  if (!message || message.role !== "assistant") {
    return undefined;
  }

  if (!canAddressAgentStore(setup.detection)) {
    return undefined;
  }

  const rawText = extractAssistantText(message);
  const isFinal = isFinalAssistantMessage(message);
  const hasProtocolLikeText = /(?:^|\n)(?:FFRESULT|PLANNING_REPORT|EXECUTION_KICKOFF|EXECUTION_REPORT|FFSTATUS\||FFATTENTION\|)/.test(rawText);
  if (!isFinal && !hasProtocolLikeText) {
    return undefined;
  }

  const store = createDelegationStore({ root: setup.detection.storeRoot });
  const rawSnapshotPath = await store.writeAgentModelText(
    setup.detection.taskId,
    setup.detection.agentId,
    assistantRawFileName(rawText),
    rawText,
  );
  const parsed = parseModelTextSafely(rawText);
  const latestResultPaths = await store.recordAgentResult(setup.detection.taskId, setup.detection.agentId, rawText, parsed);
  const resultPaths = { ...latestResultPaths, rawPath: rawSnapshotPath, latestRawPath: latestResultPaths.rawPath };

  await recordStatusSignals(store, setup, parsed, resultPaths);
  await recordAttentionSignals(store, setup, parsed, resultPaths);

  if (!parsed.ok) {
    await recordMalformedAssistantOutput(store, setup, parsed, resultPaths, "failed");
    return undefined;
  }

  await recordParsedReports(store, setup, parsed, resultPaths);
  await recordParsedResults(store, setup, parsed, resultPaths);

  if (isFinal && hasMissingRequiredTerminalOutput(setup, parsed)) {
    const state = message.stopReason === "length" || message.stopReason === "error" ? "failed" : "attention";
    await recordMissingRequiredOutput(store, setup, parsed, resultPaths, state);
  }

  return undefined;
}

export function toolCallToPolicyIntent(event: any) {
  const toolName = typeof event?.toolName === "string" ? event.toolName : "";
  const input = event?.input && typeof event.input === "object" ? event.input : {};

  if (toolName === "read") {
    return { kind: "read" as const, path: stringInput(input.path), toolName };
  }
  if (toolName === "edit" || toolName === "write") {
    return { kind: "write" as const, path: stringInput(input.path), toolName };
  }
  if (toolName === "bash") {
    return { kind: "command" as const, command: stringInput(input.command), toolName };
  }
  if (toolName === "freeflow_run") {
    if (typeof input.command === "string") {
      return { kind: "command" as const, command: input.command, toolName };
    }
    return { kind: "tool" as const, toolName };
  }
  if (toolName === "freeflow_search") {
    const source = input.source && typeof input.source === "object" ? input.source : undefined;
    const path = sourcePathForPolicy(source);
    if (path !== undefined) {
      return { kind: "read" as const, path, toolName };
    }
    return { kind: "tool" as const, toolName };
  }
  if (toolName === "mcp") {
    const mcpTool = typeof input.tool === "string" ? input.tool : "";
    if (mcpTool.length > 0 && MUTATING_MCP_TOOL_RE.test(mcpTool)) {
      return { kind: "tool" as const, toolName: `mcp:${mcpTool}` };
    }
    return { kind: "tool" as const, toolName };
  }
  if (isDelegationTool(toolName)) {
    return { kind: "tool" as const, toolName };
  }
  return { kind: "tool" as const, toolName };
}

async function prepareDelegatedRuntime(pi: any, ctx: any, options: { applyActiveTools?: boolean } = {}) {
  const detection = detectDelegatedRuntime(process.env, ctx?.cwd ?? process.cwd());
  const setup: any = {
    detection,
    blockers: [],
    warnings: [],
    activeTools: [],
    activeToolsApplied: false,
    manifest: undefined,
  };

  if (detection.mode === "normal") {
    return setup;
  }

  if (detection.mode === "delegated") {
    try {
      const store = createDelegationStore({ root: detection.storeRoot });
      setup.manifest = await store.readAgentManifest(detection.taskId, detection.agentId);
    } catch (error) {
      setup.warnings.push(`delegation manifest unavailable; writes and commands fail closed without task packet policy (${messageFrom(error)})`);
    }
  }

  if (options.applyActiveTools === false) {
    return setup;
  }

  await applyActiveTools(pi, ctx, setup);
  return setup;
}

async function applyActiveTools(pi: any, ctx: any, setup: any): Promise<void> {
  if (typeof pi?.setActiveTools !== "function") {
    setup.blockers.push("Pi active-tool API unavailable; delegated runtime cannot apply profile tools");
    notifyOnce(ctx, "active-tools-unavailable", "Freeflow delegation blocked: Pi active-tool API unavailable.", "error");
    return;
  }

  if (setup.detection.mode === "blocked") {
    pi.setActiveTools([]);
    setup.activeTools = [];
    setup.activeToolsApplied = true;
    setDelegationStatus(ctx, "delegation: blocked");
    return;
  }

  const requestedTools = setup.detection.profileDefinition.activeTools;
  const allTools = typeof pi.getAllTools === "function" ? pi.getAllTools() : undefined;
  const availableNames = Array.isArray(allTools) ? new Set(allTools.map((tool) => tool?.name).filter(Boolean)) : undefined;
  const activeTools = availableNames === undefined
    ? requestedTools
    : requestedTools.filter((tool) => availableNames.has(tool));

  pi.setActiveTools(activeTools);
  setup.activeTools = activeTools;
  setup.activeToolsApplied = true;
  setDelegationStatus(ctx, `delegation: ${setup.detection.role}/${setup.detection.profile}`);
}

async function loadTaskPolicy(setup: any, ctx: any) {
  if (setup.detection.mode !== "delegated") {
    return { cwd: ctx?.cwd };
  }

  let manifest = setup.manifest;
  if (manifest === undefined) {
    try {
      manifest = await createDelegationStore({ root: setup.detection.storeRoot }).readAgentManifest(setup.detection.taskId, setup.detection.agentId);
      setup.manifest = manifest;
    } catch {
      manifest = undefined;
    }
  }

  return {
    cwd: manifest?.cwd ?? ctx?.cwd,
    writeScopes: manifest?.writeScope ? [manifest.writeScope] : [],
    allowedCommands: Array.isArray(manifest?.allowedCommands) ? manifest.allowedCommands : [],
  };
}

function delegatedRuntimePrompt(setup: any): string {
  if (setup.detection.mode === "blocked" || setup.blockers.length > 0) {
    return blockedRuntimePrompt(setup);
  }

  const detection = setup.detection;
  const profile = detection.profileDefinition;
  const returnSpec = defaultReturnProtocolForRole(detection.role);
  const writeScope = setup.manifest?.writeScope ?? "none recorded; write/command policy may fail closed";
  const allowedCommands = Array.isArray(setup.manifest?.allowedCommands) && setup.manifest.allowedCommands.length > 0
    ? setup.manifest.allowedCommands.join(", ")
    : "none recorded";
  const activeTools = setup.activeTools.length > 0 ? setup.activeTools.join(", ") : profile.activeTools.join(", ");
  const warnings = setup.warnings.length > 0 ? `\nWarnings:\n${setup.warnings.map((warning) => `- ${warning}`).join("\n")}` : "";

  return `# Freeflow Delegated Runtime Context

This Pi pane is running as a delegated Freeflow agent. Normal non-delegated sessions do not receive this context.

Identity:
- task: ${detection.taskId}
- agent: ${detection.agentId}
- parent: ${detection.parentAgentId}
- role/profile: ${detection.role} / ${detection.profile}
- store: ${detection.storeRoot}
- cwd: ${setup.manifest?.cwd ?? "current Pi cwd"}

Profile emphasis:
${profile.contextEmphasis.map((item) => `- ${item}`).join("\n")}

Skills:
- Skills remain available through normal Pi discovery; the profile controls tools and policy, not skill discovery.

Tool and policy summary:
- active tools: ${activeTools}
- denied by default: ${defaultDenySummaryForProfile(detection.profile).join(", ")}
- write scope: ${writeScope}
- allowed commands: ${allowedCommands}
- no dynamic tool grants; capability gaps must be reported to the parent.

Output-router guidance:
- Use Freeflow routed tools for broad/noisy/unknown-size output: repo-wide search, tests, logs, builds, broad diffs, generated output.
- Use direct read only for exact known-small files.
- Return compact summaries with evidence pointers, paths, or outputIds; do not dump raw transcripts or command output.

Expected result/report protocol:
- return protocol: ${returnSpec.returnProtocol.join(", ")}
- return fields: ${returnSpec.returnFields.join(", ")}
- Parent/report blocks and FFRESULT blocks are parsed by the Freeflow delegation runtime and written to the delegation store.

Stop conditions:
- Source truth, spec, plan, or task-packet contradiction.
- Product, public API, compatibility, security, privacy, billing, data-loss, or permission decision is needed.
- Capability gap, policy-denied tool, forbidden command, or path outside scope.
- Checks fail outside bounded diagnosis within the assigned scope.
${warnings}`;
}

function blockedRuntimePrompt(setup: any): string {
  const detection = setup.detection;
  const reasons = detection.mode === "blocked" ? detection.errors : setup.blockers;
  const identity = [
    detection.taskId ? `- task: ${detection.taskId}` : undefined,
    detection.agentId ? `- agent: ${detection.agentId}` : undefined,
    detection.parentAgentId ? `- parent: ${detection.parentAgentId}` : undefined,
    detection.role || detection.profile ? `- role/profile: ${detection.role ?? "unknown"} / ${detection.profile ?? "unknown"}` : undefined,
    detection.storeRoot ? `- store: ${detection.storeRoot}` : undefined,
  ].filter(Boolean).join("\n");

  return `# Freeflow Delegated Runtime Context

Status: blocked. Delegated env is present, but this pane cannot safely run as an unconstrained child.

${identity.length > 0 ? `Identity detected:\n${identity}\n\n` : ""}Blocking reason:
${reasons.map((reason) => `- ${reason}`).join("\n")}

Failure contract:
- Do not proceed as a normal unrestricted Pi session.
- Do not use tools unless the runtime policy guard explicitly allows them.
- Return a compact blocked/capability-gap result if you can, for example:

FFRESULT
STATUS|blocked
SUMMARY|Delegated runtime unavailable; env/profile/tool setup failed closed.
BLOCKER|delegated_runtime_unavailable|${reasons.join("; ")}
RECOMMENDATION|Ask the parent/orchestrator to respawn this pane with valid FREEFLOW_DELEGATION_* env and supported Pi active-tool API.
END_FFRESULT`;
}

async function recordStartupState(setup: any, ctx: any): Promise<void> {
  if (setup.detection.mode !== "blocked" && setup.blockers.length === 0) {
    return;
  }
  if (!canAddressAgentStore(setup.detection)) {
    setDelegationStatus(ctx, "delegation: blocked");
    return;
  }
  const key = `${setup.detection.storeRoot}:${setup.detection.taskId}:${setup.detection.agentId}:startup-blocked:${[...(setup.detection.errors ?? []), ...setup.blockers].join("|")}`;
  if (startupEventKeys.has(key)) {
    return;
  }
  startupEventKeys.add(key);

  const store = createDelegationStore({ root: setup.detection.storeRoot });
  const reasons = setup.detection.mode === "blocked" ? setup.detection.errors : setup.blockers;
  const data = { reasons, runtime: "delegated", rawEnvPresent: true };
  await appendStoreEvents(store, setup.detection.taskId, setup.detection.agentId, {
    type: "delegated-runtime-blocked",
    state: "blocked",
    message: reasons.join("; "),
    data,
    taskEvent: true,
  });
  await writeAgentStatusIfPossible(store, setup.detection.taskId, setup.detection.agentId, {
    state: "blocked",
    message: "delegated runtime unavailable",
    reason: reasons.join("; "),
  });
}

async function recordPolicyBlockedToolCall(setup: any, event: any, decision: any): Promise<void> {
  if (!canAddressAgentStore(setup.detection)) {
    return;
  }
  const store = createDelegationStore({ root: setup.detection.storeRoot });
  await appendStoreEvents(store, setup.detection.taskId, setup.detection.agentId, {
    type: "tool-policy-blocked",
    state: "blocked",
    message: decision.reason,
    data: {
      toolName: event?.toolName ?? "unknown",
      toolCallId: event?.toolCallId ?? "unknown",
      code: decision.code ?? "delegated_runtime_unavailable",
      suggestedReroute: decision.suggestedReroute ?? "parent",
      request: decision.request,
    },
    taskEvent: false,
  });
}

async function recordStatusSignals(store: any, setup: any, parsed: any, resultPaths: any): Promise<void> {
  for (const signal of parsed.statuses) {
    const state = asDelegationState(signal.state);
    if (signal.state !== undefined && state === undefined) {
      const message = `unknown FFSTATUS state: ${signal.state}`;
      await appendStoreEvents(store, setup.detection.taskId, setup.detection.agentId, {
        type: "agent-status-malformed",
        state: "attention",
        message,
        data: { rawPath: resultPaths.rawPath, lineNumber: signal.lineNumber, raw: signal.raw, fields: signal.fields, attributes: signal.attributes },
        taskEvent: true,
      });
      await writeAgentStatusIfPossible(store, setup.detection.taskId, setup.detection.agentId, {
        state: "attention",
        message,
        reason: "unknown delegated status",
      });
      continue;
    }

    await store.appendAgentEvent(setup.detection.taskId, setup.detection.agentId, {
      type: "agent-status",
      ...(state !== undefined ? { state } : {}),
      message: signal.message ?? signal.state ?? "status",
      data: { rawPath: resultPaths.rawPath, lineNumber: signal.lineNumber, fields: signal.fields, attributes: signal.attributes },
    });
    if (state !== undefined && state !== "completed" && state !== "blocked" && state !== "failed" && state !== "cancelled" && state !== "closed") {
      await writeAgentStatusIfPossible(store, setup.detection.taskId, setup.detection.agentId, {
        state,
        message: signal.message ?? signal.state ?? "status",
      });
    }
  }
}

async function recordAttentionSignals(store: any, setup: any, parsed: any, resultPaths: any): Promise<void> {
  for (const signal of parsed.attentions) {
    const message = signal.message ?? signal.state ?? "attention requested";
    await appendStoreEvents(store, setup.detection.taskId, setup.detection.agentId, {
      type: "agent-attention",
      state: "attention",
      message,
      data: { rawPath: resultPaths.rawPath, lineNumber: signal.lineNumber, fields: signal.fields, attributes: signal.attributes },
      taskEvent: true,
    });
    await writeAgentStatusIfPossible(store, setup.detection.taskId, setup.detection.agentId, { state: "attention", message });
  }
}

async function recordParsedReports(store: any, setup: any, parsed: any, resultPaths: any): Promise<void> {
  for (const report of parsed.planningReports) {
    const paths = await store.recordTaskReport(setup.detection.taskId, "planning-report", report.rawText, report);
    const state = report.status === "blocked" ? "blocked" : "completed";
    await appendReportEvent(store, setup, "planning-report", state, report.status, paths, resultPaths);
  }
  for (const report of parsed.executionKickoffs) {
    const paths = await store.recordTaskReport(setup.detection.taskId, "execution-kickoff", report.rawText, report);
    await appendReportEvent(store, setup, "execution-kickoff", "running", report.status, paths, resultPaths);
  }
  for (const report of parsed.executionReports) {
    const paths = await store.recordTaskReport(setup.detection.taskId, "execution-report", report.rawText, report);
    const state = TERMINAL_RESULT_STATUS_TO_STATE[report.status] ?? "completed";
    await appendReportEvent(store, setup, "execution-report", state, report.status, paths, resultPaths);
  }
}

async function appendReportEvent(store: any, setup: any, reportName: string, state: string, status: string | undefined, paths: any, resultPaths: any): Promise<void> {
  await appendStoreEvents(store, setup.detection.taskId, setup.detection.agentId, {
    type: `task-${reportName}`,
    state: asDelegationState(state) ?? "completed",
    message: `${reportName} recorded${status ? `: ${status}` : ""}`,
    data: { reportName, status, rawPath: paths.rawPath, jsonPath: paths.jsonPath, agentRawPath: resultPaths.rawPath },
    taskEvent: true,
  });
  if (state !== "running") {
    await writeAgentStatusIfPossible(store, setup.detection.taskId, setup.detection.agentId, {
      state: asDelegationState(state) ?? "completed",
      message: `${reportName} recorded${status ? `: ${status}` : ""}`,
    });
  }
}

async function recordParsedResults(store: any, setup: any, parsed: any, resultPaths: any): Promise<void> {
  for (const result of parsed.results) {
    const state = TERMINAL_RESULT_STATUS_TO_STATE[result.status] ?? "failed";
    await appendStoreEvents(store, setup.detection.taskId, setup.detection.agentId, {
      type: "agent-result",
      state,
      message: result.summary ?? `FFRESULT ${result.status}`,
      data: {
        resultStatus: result.status,
        rawPath: resultPaths.rawPath,
        jsonPath: resultPaths.jsonPath,
        filesChanged: result.filesChanged,
        blockers: result.blockers,
        requests: result.requests,
      },
      taskEvent: true,
    });
    await writeAgentStatusIfPossible(store, setup.detection.taskId, setup.detection.agentId, {
      state,
      message: result.summary ?? `FFRESULT ${result.status}`,
      reason: result.status === "blocked" || result.status === "failed" ? result.recommendation : undefined,
    });
  }
}

async function recordMalformedAssistantOutput(store: any, setup: any, parsed: any, resultPaths: any, state: "failed" | "attention"): Promise<void> {
  const message = parsed.errors.map((error) => error.message).join("; ") || "assistant output did not match delegation protocol";
  await appendStoreEvents(store, setup.detection.taskId, setup.detection.agentId, {
    type: "agent-output-malformed",
    state,
    message,
    data: { rawPath: resultPaths.rawPath, jsonPath: resultPaths.jsonPath, errors: parsed.errors },
    taskEvent: true,
  });
  await writeAgentStatusIfPossible(store, setup.detection.taskId, setup.detection.agentId, { state, message, reason: "malformed delegated output" });
}

async function recordMissingRequiredOutput(store: any, setup: any, parsed: any, resultPaths: any, state: "failed" | "attention"): Promise<void> {
  const expected = expectedTerminalOutput(setup);
  const message = `required delegated terminal output was not found: ${expected.join(" or ")}`;
  await appendStoreEvents(store, setup.detection.taskId, setup.detection.agentId, {
    type: "agent-required-output-missing",
    state,
    message,
    data: { rawPath: resultPaths.rawPath, jsonPath: resultPaths.jsonPath, expected, stopReason: parsed.stopReason },
    taskEvent: true,
  });
  await writeAgentStatusIfPossible(store, setup.detection.taskId, setup.detection.agentId, { state, message, reason: "missing required delegated output" });
}

async function appendStoreEvents(store: any, taskId: string, agentId: string, input: any): Promise<void> {
  await store.appendAgentEvent(taskId, agentId, {
    type: input.type,
    state: input.state,
    message: input.message,
    data: input.data,
  });
  if (input.taskEvent) {
    await store.appendTaskEvent(taskId, {
      type: input.type,
      state: input.state,
      message: input.message,
      data: { ...input.data, agentId },
    });
  }
}

async function writeAgentStatusIfPossible(store: any, taskId: string, agentId: string, status: any): Promise<void> {
  try {
    await store.writeAgentStatus(taskId, agentId, status);
  } catch {
    // Runtime parsing still preserves raw/events even if a manifest/status file is absent.
  }
}

function hasMissingRequiredTerminalOutput(setup: any, parsed: any): boolean {
  if (parsed.results.length > 0 || parsed.attentions.length > 0) {
    return false;
  }
  if (setup.detection.mode !== "delegated") {
    return true;
  }
  if (setup.detection.role === "planning-parent") {
    return parsed.planningReports.length === 0;
  }
  if (setup.detection.role === "execution-parent") {
    return parsed.executionReports.length === 0;
  }
  if (setup.detection.role === "reviewer" || setup.detection.role === "verifier") {
    return false;
  }
  return true;
}

function expectedTerminalOutput(setup: any): string[] {
  if (setup.detection.mode !== "delegated") {
    return ["FFRESULT"];
  }
  if (setup.detection.role === "planning-parent") {
    return ["PLANNING_REPORT", "FFRESULT blocked/failed"];
  }
  if (setup.detection.role === "execution-parent") {
    return ["EXECUTION_REPORT", "FFRESULT blocked/failed"];
  }
  if (setup.detection.role === "reviewer" || setup.detection.role === "verifier") {
    return ["role-native report", "FFRESULT blocked/failed"];
  }
  return ["FFRESULT"];
}

function assistantRawFileName(rawText: string): string {
  const hash = createHash("sha256").update(rawText).digest("hex").slice(0, 16);
  return `assistant-${hash}.raw.txt`;
}

function parseModelTextSafely(rawText: string): any {
  try {
    return parseModelText(rawText);
  } catch (error) {
    return {
      ok: false,
      rawText,
      results: [],
      planningReports: [],
      executionKickoffs: [],
      executionReports: [],
      statuses: [],
      attentions: [],
      errors: [{ lineNumber: 1, message: messageFrom(error), raw: rawText }],
    };
  }
}

function extractAssistantText(message: any): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function isFinalAssistantMessage(message: any): boolean {
  return message.stopReason === "stop" || message.stopReason === "length" || message.stopReason === "error" || message.stopReason === undefined;
}

function formatPolicyDeniedReason(decision: any): string {
  const fields = [
    `code=${decision.code ?? "policy_block"}`,
    `reason=${decision.reason}`,
    `reroute=${decision.suggestedReroute ?? "parent"}`,
  ];
  if (decision.request?.kind) {
    fields.push(`request=${decision.request.kind}:${decision.request.detail}`);
  }
  return `Freeflow delegation policy denied tool call (${fields.join("; ")}). No dynamic tool grants are available; report a blocked/capability-gap result to the parent.`;
}

function sourcePathForPolicy(source: any): string | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  if (source.kind === "repo" && typeof source.path === "string") {
    return source.path;
  }
  if (source.kind === "local" && typeof source.root === "string") {
    return typeof source.path === "string" ? resolve(source.root, source.path) : source.root;
  }
  return undefined;
}

function normalizeStoreRoot(value: string | undefined, cwd: string, errors: string[]): string | undefined {
  if (!hasEnvValue(value)) {
    return undefined;
  }
  if (value.includes("\0")) {
    return undefined;
  }
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value);
}

function validateEnvSafeId(value: string | undefined, label: string, errors: string[]): string | undefined {
  if (!hasEnvValue(value)) {
    return undefined;
  }
  try {
    return validateSafeId(value, label);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : `${label} is invalid`);
    return undefined;
  }
}

function hasEnvValue(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringInput(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function canAddressAgentStore(detection: any): boolean {
  return Boolean(detection?.storeRoot && detection?.taskId && detection?.agentId);
}

function asDelegationState(value: string | undefined): any {
  return typeof value === "string" && DELEGATION_STATES.has(value) ? value : undefined;
}

function setDelegationStatus(ctx: any, status: string): void {
  ctx?.ui?.setStatus?.("freeflow-delegation", status);
}

function notifyOnce(ctx: any, key: string, message: string, level: "info" | "warning" | "error" = "warning"): void {
  if (notificationKeys.has(key)) {
    return;
  }
  notificationKeys.add(key);
  ctx?.ui?.notify?.(message, level);
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
