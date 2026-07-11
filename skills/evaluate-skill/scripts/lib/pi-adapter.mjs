import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { accessSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "./process.mjs";

export const PI_ADAPTER_VERSION = "pi-bootstrap-v1";
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

export async function runPiSubject({ prompt, provider, model, thinking, tools, skillSnapshot, workspace, configDir, readRoots, writeRoots, timeoutMs, outputLimitBytes, maxTurns, signal }) {
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
    signal,
  });
  const parsed = parsePiJsonEvents(processResult.stdout, { skillSnapshot });
  let runtimeCounters = { provider_requests: parsed.events.filter((event) => event.type === "turn_start").length, turns_started: parsed.events.filter((event) => event.type === "turn_start").length, tool_calls: parsed.tool_events.length, hard_turn_limit_reached: false };
  try { runtimeCounters = JSON.parse(await readFile(counterPath, "utf8")); } catch {}
  return { invocation, process: processResult, parsed, runtime_counters: runtimeCounters };
}

export function redactedInvocation(invocation) {
  const args = [...invocation.args];
  if (args.length > 0) args[args.length - 1] = "<natural-prompt>";
  for (const flag of ["--extension", "--skill"]) {
    const index = args.indexOf(flag);
    if (index >= 0 && index + 1 < args.length) args[index + 1] = `<${flag.slice(2)}>`;
  }
  return { command: invocation.command, args };
}
