import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { accessSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_OUTPUT_LIMIT_BYTES } from "./constants.mjs";
import { runProcess } from "./process.mjs";
import { startRpcClient } from "./rpc-client.mjs";
import { sha256 } from "./hash.mjs";

export const PI_ADAPTER_VERSION = "pi-bootstrap-v2";
export const PI_RPC_ADAPTER_VERSION = "pi-rpc-scripted-v1";
const here = dirname(fileURLToPath(import.meta.url));
export const PI_ROOT_GUARD_PATH = resolve(here, "..", "pi-root-guard.mjs");

function sourceAgentDir(env) {
  return resolve(env.PI_CODING_AGENT_DIR ?? resolve(homedir(), ".pi", "agent"));
}

export async function prepareIsolatedPiConfig(configDir, env = process.env) {
  await mkdir(configDir, { recursive: true });
  await writeFile(resolve(configDir, "settings.json"), `${JSON.stringify({
    defaultProjectTrust: "never",
    enableInstallTelemetry: false,
    enableUpdateCheck: false,
    quietStartup: true,
    retry: {
      enabled: false,
      maxRetries: 0,
      provider: { maxRetries: 0 },
    },
  }, null, 2)}\n`);
  const authSource = resolve(sourceAgentDir(env), "auth.json");
  try {
    accessSync(authSource, constants.R_OK);
    await copyFile(authSource, resolve(configDir, "auth.json"));
  } catch {}
}

export function buildPiInvocation({ prompt, provider, model, thinking, tools, skillSnapshot }) {
  if (!provider || !model || !thinking) throw new Error("Pi runs require provider, model, and thinking");
  const args = [
    "--mode", "json",
    "--print",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
    "--offline",
    "--extension", PI_ROOT_GUARD_PATH,
    "--provider", provider,
    "--model", model,
    "--thinking", thinking,
  ];
  if (tools.length === 0) args.push("--no-tools");
  else args.push("--tools", tools.join(","));
  if (skillSnapshot) args.push("--skill", skillSnapshot);
  args.push(prompt.startsWith("-") ? ` ${prompt}` : prompt);
  return { command: "pi", args };
}

export function buildPiRpcInvocation({ provider, model, thinking, tools, skillSnapshot }) {
  if (!provider || !model || !thinking) throw new Error("Pi RPC runs require provider, model, and thinking");
  const args = [
    "--mode", "rpc",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
    "--offline",
    "--extension", PI_ROOT_GUARD_PATH,
    "--provider", provider,
    "--model", model,
    "--thinking", thinking,
  ];
  if (tools.length === 0) args.push("--no-tools");
  else args.push("--tools", tools.join(","));
  if (skillSnapshot) args.push("--skill", skillSnapshot);
  return { command: "pi", args };
}

export function compactPiRpcRecord(event) {
  if (event?.type === "message_update") {
    const { partial: _partial, delta: _delta, thinking: _thinking, ...assistantMessageEvent } = event.assistantMessageEvent ?? {};
    if (!String(assistantMessageEvent.type ?? "").startsWith("thinking_")) {
      if (event.assistantMessageEvent?.delta !== undefined) assistantMessageEvent.delta = event.assistantMessageEvent.delta;
    }
    return { type: event.type, assistantMessageEvent };
  }
  if (event?.type === "message_start") return { type: event.type, message: { id: event.message?.id, role: event.message?.role } };
  if (event?.type === "message_end") {
    const message = { ...event.message };
    if (Array.isArray(message.content)) message.content = message.content.filter((part) => part?.type !== "thinking");
    return { type: event.type, message };
  }
  if (event?.type === "turn_end" || event?.type === "agent_end") return { type: event.type, willRetry: event.willRetry ?? false };
  if (event?.type === "tool_execution_update") return { type: event.type, toolCallId: event.toolCallId, toolName: event.toolName };
  return event;
}

export function compactPiJsonLine(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return line;
  }
  if (event.type === "message_update") {
    const { partial: _partial, ...assistantMessageEvent } = event.assistantMessageEvent ?? {};
    return JSON.stringify({ type: event.type, assistantMessageEvent });
  }
  if (event.type === "message_start") {
    return JSON.stringify({ type: event.type, message: { id: event.message?.id, role: event.message?.role } });
  }
  if (event.type === "turn_end" || event.type === "agent_end") return JSON.stringify({ type: event.type });
  if (event.type === "tool_execution_update") {
    return JSON.stringify({ type: event.type, toolCallId: event.toolCallId, toolName: event.toolName });
  }
  return line;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
}

export function parsePiJsonEvents(raw, { skillSnapshot } = {}) {
  const events = [];
  const parseErrors = [];
  for (const [index, line] of raw.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      parseErrors.push({ line: index + 1, error: error.message });
    }
  }

  const assistantMessages = events
    .filter((event) => event.type === "message_end" && event.message?.role === "assistant")
    .map((event) => event.message);
  const finalMessage = assistantMessages.at(-1) ?? null;
  const seen = new Set();
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0, total_tokens: 0, cost: null };
  let hasUsage = false;
  let costTotal = 0;
  let hasCost = false;
  for (const message of assistantMessages) {
    const key = message.id ?? JSON.stringify(message.usage ?? {});
    if (seen.has(key)) continue;
    seen.add(key);
    const item = message.usage;
    if (!item) continue;
    hasUsage = true;
    usage.input += item.input ?? 0;
    usage.output += item.output ?? 0;
    usage.cache_read += item.cacheRead ?? 0;
    usage.cache_write += item.cacheWrite ?? 0;
    usage.total_tokens += item.totalTokens ?? (item.input ?? 0) + (item.output ?? 0);
    const cost = item.cost?.total;
    if (typeof cost === "number") {
      hasCost = true;
      costTotal += cost;
    }
  }
  if (hasCost) usage.cost = { total_usd: costTotal };

  const toolEvents = events.filter((event) => event.type === "tool_execution_start").map((event) => ({
    tool_call_id: event.toolCallId,
    tool_name: event.toolName,
    args: event.args,
  }));
  const normalizedSkill = skillSnapshot ? resolve(skillSnapshot, "SKILL.md") : null;
  const skillRead = normalizedSkill !== null && toolEvents.some((event) => {
    if (event.tool_name !== "read" || typeof event.args?.path !== "string") return false;
    return resolve(event.args.path.replace(/^@/, "")) === normalizedSkill;
  });

  return {
    events,
    parse_errors: parseErrors,
    final_text: finalMessage ? textFromContent(finalMessage.content) : "",
    usage: hasUsage ? usage : null,
    tool_events: toolEvents,
    skill_read: skillRead,
  };
}

export async function runPiSubject({ prompt, provider, model, thinking, tools, skillSnapshot, workspace, configDir, readRoots, writeRoots, timeoutMs, outputLimitBytes, transportLimitBytes, maxTurns, signal }) {
  await prepareIsolatedPiConfig(configDir);
  const invocation = buildPiInvocation({ prompt, provider, model, thinking, tools, skillSnapshot });
  const counterPath = resolve(configDir, "runtime-counters.json");
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: configDir,
    PI_TELEMETRY: "0",
    FREEFLOW_EVAL_ROOT_POLICY: JSON.stringify({ read_roots: readRoots, write_roots: writeRoots }),
    FREEFLOW_EVAL_COUNTER_PATH: counterPath,
    FREEFLOW_EVAL_MAX_TURNS: String(maxTurns ?? 0),
  };
  const processResult = await runProcess(invocation.command, invocation.args, {
    cwd: workspace,
    env,
    timeoutMs,
    outputLimitBytes,
    transportLimitBytes: transportLimitBytes ?? Math.max(outputLimitBytes, DEFAULT_OUTPUT_LIMIT_BYTES),
    stdoutLineTransform: compactPiJsonLine,
    signal,
  });
  const parsed = parsePiJsonEvents(processResult.stdout, { skillSnapshot });
  let runtimeCounters = { provider_requests: parsed.events.filter((event) => event.type === "turn_start").length, turns_started: parsed.events.filter((event) => event.type === "turn_start").length, tool_calls: parsed.tool_events.length, hard_turn_limit_reached: false };
  try { runtimeCounters = JSON.parse(await readFile(counterPath, "utf8")); } catch {}
  return { invocation, process: processResult, parsed, runtime_counters: runtimeCounters };
}

function canonicalEntry(entry) {
  if (entry?.type !== "message" || !entry.message) return entry;
  const message = { ...entry.message };
  if (Array.isArray(message.content)) message.content = message.content.filter((part) => part?.type !== "thinking");
  return { ...entry, message };
}

function normalizeSessionUsage(stats) {
  const tokens = stats?.tokens;
  if (!tokens) return null;
  const usage = {
    input: tokens.input ?? 0,
    output: tokens.output ?? 0,
    cache_read: tokens.cacheRead ?? 0,
    cache_write: tokens.cacheWrite ?? 0,
    total_tokens: tokens.total ?? (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.cacheRead ?? 0) + (tokens.cacheWrite ?? 0),
    cost: null,
  };
  if (typeof stats.cost === "number") usage.cost = { total_usd: stats.cost };
  return usage;
}

function usageDelta(current, previous) {
  if (!current) return null;
  const prior = previous ?? { input: 0, output: 0, cache_read: 0, cache_write: 0, total_tokens: 0, cost: { total_usd: 0 } };
  const delta = {
    input: current.input - (prior.input ?? 0),
    output: current.output - (prior.output ?? 0),
    cache_read: current.cache_read - (prior.cache_read ?? 0),
    cache_write: current.cache_write - (prior.cache_write ?? 0),
    total_tokens: current.total_tokens - (prior.total_tokens ?? 0),
    cost: null,
  };
  if (current.cost && (previous === null || prior.cost)) delta.cost = { total_usd: current.cost.total_usd - (prior.cost?.total_usd ?? 0) };
  return delta;
}

function counterDelta(current, previous) {
  return {
    provider_requests: (current.provider_requests ?? 0) - (previous.provider_requests ?? 0),
    turns_started: (current.turns_started ?? 0) - (previous.turns_started ?? 0),
    tool_calls: (current.tool_calls ?? 0) - (previous.tool_calls ?? 0),
    hard_turn_limit_reached: Boolean(current.hard_turn_limit_reached),
  };
}

function textFromLastAssistant(response) {
  return typeof response?.data?.text === "string" ? response.data.text : "";
}

function toolEvents(events) {
  return events.filter((event) => event.type === "tool_execution_start").map((event) => ({
    tool_call_id: event.toolCallId,
    tool_name: event.toolName,
    args: event.args,
  }));
}

async function readRuntimeCounters(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

function requireRpcSuccess(response, command) {
  if (!response?.success) throw new Error(`Pi RPC ${command} failed: ${response?.error ?? "unknown error"}`);
  return response.data;
}

export async function runPiRpcSubject({
  turns,
  provider,
  model,
  thinking,
  tools,
  skillSnapshot,
  workspace,
  configDir,
  readRoots,
  writeRoots,
  timeoutMs,
  outputLimitBytes,
  transportLimitBytes,
  maxTurns,
  maxUsd,
  signal,
  onTurnSettled = async () => null,
  startClient = startRpcClient,
}) {
  await prepareIsolatedPiConfig(configDir);
  const invocation = buildPiRpcInvocation({ provider, model, thinking, tools, skillSnapshot });
  const counterPath = resolve(configDir, "runtime-counters.json");
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: configDir,
    PI_TELEMETRY: "0",
    FREEFLOW_EVAL_ROOT_POLICY: JSON.stringify({ read_roots: readRoots, write_roots: writeRoots }),
    FREEFLOW_EVAL_COUNTER_PATH: counterPath,
    FREEFLOW_EVAL_MAX_TURNS: String(maxTurns ?? 0),
  };

  let client = null;
  let processResult = null;
  let operationError = null;
  let canonicalOutputLimitExceeded = false;
  let canonicalRetainedBytes = 0;
  let previousLeaf = null;
  let previousUsage = null;
  let previousCounters = { provider_requests: 0, turns_started: 0, tool_calls: 0, hard_turn_limit_reached: false };
  const settledTurns = [];
  const normalizedSkill = skillSnapshot ? resolve(skillSnapshot, "SKILL.md") : null;
  const skillReadForEvents = (events) => normalizedSkill !== null && events.some((event) => event.tool_name === "read" && typeof event.args?.path === "string" && resolve(event.args.path.replace(/^@/, "")) === normalizedSkill);
  try {
    client = await startClient(invocation.command, invocation.args, {
      cwd: workspace,
      env,
      timeoutMs,
      outputLimitBytes,
      transportLimitBytes: transportLimitBytes ?? Math.max(outputLimitBytes, DEFAULT_OUTPUT_LIMIT_BYTES),
      signal,
      recordTransform: compactPiRpcRecord,
    });
    requireRpcSuccess(await client.request("set_auto_retry", { enabled: false }), "set_auto_retry");
    requireRpcSuccess(await client.request("set_auto_compaction", { enabled: false }), "set_auto_compaction");
    const initialState = requireRpcSuccess(await client.request("get_state"), "get_state");
    if (initialState.isStreaming || initialState.isCompacting || initialState.messageCount !== 0 || initialState.pendingMessageCount !== 0) {
      throw new Error("Pi RPC session did not start empty and settled");
    }

    for (const [index, turn] of turns.entries()) {
      const startedAt = new Date();
      const settled = await client.promptAndSettle({ turnId: turn.id, message: turn.prompt });
      const entriesData = requireRpcSuccess(await client.request("get_entries", previousLeaf ? { since: previousLeaf } : {}), "get_entries");
      const finalData = requireRpcSuccess(await client.request("get_last_assistant_text"), "get_last_assistant_text");
      const stats = requireRpcSuccess(await client.request("get_session_stats"), "get_session_stats");
      const state = requireRpcSuccess(await client.request("get_state"), "get_state");
      if (state.isStreaming || state.isCompacting || state.pendingMessageCount !== 0) throw new Error(`Pi RPC ${turn.id} did not remain settled`);
      const currentUsage = normalizeSessionUsage(stats);
      const currentCounters = await readRuntimeCounters(counterPath, {
        provider_requests: client.records.filter((event) => event.type === "turn_start").length,
        turns_started: client.records.filter((event) => event.type === "turn_start").length,
        tool_calls: client.records.filter((event) => event.type === "tool_execution_start").length,
        hard_turn_limit_reached: false,
      });
      const events = settled.events;
      const toolsForTurn = toolEvents(events);
      const endedAt = new Date();
      const turnEvidence = {
        id: turn.id,
        index,
        prompt_sha256: sha256(turn.prompt),
        response: settled.response,
        entries: (entriesData.entries ?? []).map(canonicalEntry),
        leaf_id: entriesData.leafId ?? null,
        final_text: textFromLastAssistant({ data: finalData }),
        events,
        tool_events: toolsForTurn,
        usage: currentUsage,
        usage_delta: usageDelta(currentUsage, previousUsage),
        runtime_counters: currentCounters,
        runtime_counter_delta: counterDelta(currentCounters, previousCounters),
        started_at: startedAt.toISOString(),
        settled_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        workspace: null,
        skill_read: skillReadForEvents(toolsForTurn),
      };
      turnEvidence.workspace = await onTurnSettled(turnEvidence);
      settledTurns.push(turnEvidence);
      previousLeaf = entriesData.leafId ?? previousLeaf;
      previousUsage = currentUsage;
      previousCounters = currentCounters;
      canonicalRetainedBytes = Buffer.byteLength(`${JSON.stringify({ schema_version: 1, turns: settledTurns }, null, 2)}\n`);
      if (canonicalRetainedBytes > outputLimitBytes) {
        canonicalOutputLimitExceeded = true;
        throw new Error(`Pi RPC canonical retained evidence exceeded ${outputLimitBytes} bytes`);
      }
      if (index < turns.length - 1) {
        if (maxTurns > 0 && currentCounters.provider_requests >= maxTurns) throw new Error(`Pi RPC provider-turn limit reached before ${turns[index + 1].id}`);
        if (maxUsd !== null && maxUsd !== undefined && currentUsage?.cost && currentUsage.cost.total_usd >= maxUsd) {
          throw new Error(`Pi RPC observed spend ceiling reached before ${turns[index + 1].id}`);
        }
      }
    }
  } catch (error) {
    operationError = error instanceof Error ? error.message : String(error);
  } finally {
    if (client) processResult = await client.dispose();
  }

  if (!processResult) throw new Error(operationError ?? "Pi RPC process did not start");
  const runtimeCounters = await readRuntimeCounters(counterPath, previousCounters);
  const allToolEvents = settledTurns.flatMap((turn) => turn.tool_events);
  const skillRead = skillReadForEvents(allToolEvents);
  canonicalRetainedBytes = Buffer.byteLength(`${JSON.stringify({ schema_version: 1, turns: settledTurns }, null, 2)}\n`);
  if (canonicalRetainedBytes > outputLimitBytes) {
    canonicalOutputLimitExceeded = true;
    operationError ??= `Pi RPC canonical retained evidence exceeded ${outputLimitBytes} bytes`;
  }
  processResult = {
    ...processResult,
    output_limit_exceeded: Boolean(processResult.output_limit_exceeded || canonicalOutputLimitExceeded),
    retained_output_bytes: Math.max(Number(processResult.retained_output_bytes ?? 0), canonicalRetainedBytes),
  };
  const parseErrors = operationError || processResult.protocol_failed
    ? [{ line: null, error: operationError ?? processResult.failure ?? "Pi RPC protocol failure" }]
    : [];
  return {
    invocation,
    process: processResult,
    parsed: {
      events: client.records,
      parse_errors: parseErrors,
      final_text: settledTurns.at(-1)?.final_text ?? "",
      usage: previousUsage,
      tool_events: allToolEvents,
      skill_read: skillRead,
      turns: settledTurns,
    },
    runtime_counters: runtimeCounters,
  };
}

export function redactedInvocation(invocation) {
  const args = [...invocation.args];
  const modeIndex = args.indexOf("--mode");
  if (args[modeIndex + 1] !== "rpc" && args.length > 0) args[args.length - 1] = "<natural-prompt>";
  for (const flag of ["--extension", "--skill"]) {
    const index = args.indexOf(flag);
    if (index >= 0 && index + 1 < args.length) args[index + 1] = `<${flag.slice(2)}>`;
  }
  return { command: invocation.command, args };
}
