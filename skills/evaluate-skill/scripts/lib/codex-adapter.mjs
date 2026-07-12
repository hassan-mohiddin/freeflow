import { chmod, copyFile, cp, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { makeReadOnly } from "./materialize.mjs";
import { runProcess } from "./process.mjs";

export const CODEX_ADAPTER_VERSION = "codex-exec-diagnostic-v1";
export const CODEX_ISOLATION_PROFILE = "codex-diagnostic-macos-v1";

function tomlString(value) {
  return JSON.stringify(String(value));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function buildCodexInvocation({ workspace, model, thinking, skillName, prompt }) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) throw new Error(`Invalid Codex skill name: ${skillName}`);
  if (typeof prompt !== "string") throw new Error("Codex prompt must be a string");
  return {
    command: "codex",
    args: [
      "exec",
      "--strict-config",
      "--ephemeral",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--json",
      "-C", workspace,
      "-m", model,
      "-c", 'model_provider="openai"',
      "-c", `model_reasoning_effort=${tomlString(thinking)}`,
      "-c", 'approval_policy="never"',
      `$${skillName}\n\n${prompt}`,
    ],
  };
}

export async function prepareCodexEnvironment({ configDir, workspace, skillSnapshot, skillName, authPath = resolve(homedir(), ".codex", "auth.json") }) {
  const codexHome = resolve(configDir, "codex-home");
  const isolatedHome = resolve(configDir, "home");
  const skillsRoot = resolve(codexHome, "skills");
  const declaredSkill = resolve(skillsRoot, skillName);
  await Promise.all([
    mkdir(codexHome, { recursive: true }),
    mkdir(isolatedHome, { recursive: true }),
    mkdir(skillsRoot, { recursive: true }),
  ]);
  await copyFile(authPath, resolve(codexHome, "auth.json"));
  await chmod(resolve(codexHome, "auth.json"), 0o600);
  await cp(skillSnapshot, declaredSkill, { recursive: true, force: true });
  await makeReadOnly(declaredSkill);
  const config = [
    "project_doc_max_bytes = 0",
    'model_provider = "openai"',
    'approval_policy = "never"',
    `default_permissions = ${tomlString(CODEX_ISOLATION_PROFILE)}`,
    "",
    "[skills.bundled]",
    "enabled = false",
    "",
    `[permissions.${CODEX_ISOLATION_PROFILE}.filesystem]`,
    '":minimal" = "read"',
    `${tomlString(workspace)} = "write"`,
    `${tomlString(declaredSkill)} = "read"`,
    "",
    `[permissions.${CODEX_ISOLATION_PROFILE}.network]`,
    "enabled = false",
    "",
  ].join("\n");
  await writeFile(resolve(codexHome, "config.toml"), config, { mode: 0o600 });
  return { codexHome, isolatedHome, declaredSkill, config };
}

function isReasoningRecord(record) {
  return ["item.started", "item.updated", "item.completed"].includes(record?.type) && record.item?.type === "reasoning";
}

export function compactCodexJsonLine(line, context = {}) {
  if (context.terminated === false) throw new Error("Codex JSONL record was not LF-terminated");
  let record;
  try {
    record = JSON.parse(line);
  } catch (error) {
    throw new Error(`Malformed Codex JSONL: ${error.message}`);
  }
  if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.type !== "string") throw new Error("Malformed Codex JSONL record");
  if (isReasoningRecord(record)) return null;
  return JSON.stringify(record);
}

export function parseCodexJsonl(stdout) {
  const records = [];
  const parseErrors = [];
  if (stdout.length > 0 && !stdout.endsWith("\n")) parseErrors.push({ line: null, error: "Codex JSONL record was not LF-terminated" });
  for (const [index, line] of stdout.split("\n").entries()) {
    if (line.length === 0) continue;
    try {
      const record = JSON.parse(line);
      if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.type !== "string") throw new Error("record must be an object with type");
      records.push(record);
    } catch (error) {
      parseErrors.push({ line: index + 1, error: errorMessage(error) });
    }
  }
  const byType = (type) => records.filter((record) => record.type === type);
  const threadStarted = byType("thread.started");
  const turnStarted = byType("turn.started");
  const turnCompleted = byType("turn.completed");
  if (threadStarted.length !== 1) parseErrors.push({ line: null, error: `Expected one thread.started; got ${threadStarted.length}` });
  if (turnStarted.length !== 1) parseErrors.push({ line: null, error: `Expected one turn.started; got ${turnStarted.length}` });
  if (turnCompleted.length !== 1) parseErrors.push({ line: null, error: `Expected one turn.completed; got ${turnCompleted.length}` });
  const threadIndex = records.findIndex((record) => record.type === "thread.started");
  const turnIndex = records.findIndex((record) => record.type === "turn.started");
  const terminalIndex = records.findIndex((record) => record.type === "turn.completed");
  if (threadIndex !== 0) parseErrors.push({ line: null, error: "Codex thread.started must be the first retained record" });
  if (turnIndex !== 1) parseErrors.push({ line: null, error: "Codex turn.started must follow thread.started" });
  if (terminalIndex < 0 || terminalIndex !== records.length - 1) parseErrors.push({ line: null, error: "Codex turn.completed must be the terminal retained record with no evidence after it" });
  if (byType("turn.failed").length > 0 || byType("error").length > 0) parseErrors.push({ line: null, error: "Codex reported failed terminal evidence" });
  const messages = records.filter((record, index) => index > turnIndex && index < terminalIndex && record.type === "item.completed" && record.item?.type === "agent_message" && typeof record.item.text === "string");
  const finalText = messages.at(-1)?.item.text ?? "";
  if (finalText.length === 0) parseErrors.push({ line: null, error: "Codex final assistant text is missing" });
  const usageRecord = turnCompleted.at(-1)?.usage;
  const usage = usageRecord && ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"].every((key) => Number.isFinite(usageRecord[key]))
    ? {
        input: usageRecord.input_tokens,
        output: usageRecord.output_tokens,
        cache_read: usageRecord.cached_input_tokens,
        cache_write: 0,
        total_tokens: usageRecord.input_tokens + usageRecord.output_tokens,
        reasoning_output: usageRecord.reasoning_output_tokens,
        cost: null,
      }
    : null;
  const toolEvents = records.filter((record) => ["item.started", "item.updated", "item.completed"].includes(record.type) && ["command_execution", "file_change", "mcp_tool_call", "web_search"].includes(record.item?.type));
  const completedToolIds = new Set(toolEvents.filter((record) => record.type === "item.completed").map((record) => record.item?.id).filter(Boolean));
  return {
    records,
    parse_errors: parseErrors,
    final_text: finalText,
    usage,
    tool_events: toolEvents,
    skill_read: false,
    runtime_counters: {
      provider_requests: null,
      turns_started: turnStarted.length,
      tool_calls: completedToolIds.size,
      hard_turn_limit_reached: null,
    },
  };
}

export async function runCodexSubject({
  prompt,
  provider,
  model,
  thinking,
  tools,
  skillName,
  skillSnapshot,
  workspace,
  configDir,
  timeoutMs,
  outputLimitBytes,
  transportLimitBytes,
  authPath,
  startProcess = runProcess,
}) {
  if (provider !== "openai") throw new Error("Codex subject provider must be openai");
  if (JSON.stringify(tools) !== JSON.stringify(["read", "write"])) throw new Error("Codex diagnostic tools must be exactly read, write");
  const environment = await prepareCodexEnvironment({ configDir, workspace, skillSnapshot, skillName, authPath });
  const invocation = buildCodexInvocation({ workspace, model, thinking, skillName, prompt });
  const env = {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin",
    HOME: environment.isolatedHome,
    CODEX_HOME: environment.codexHome,
    TMPDIR: resolve(configDir, "tmp"),
  };
  await mkdir(env.TMPDIR, { recursive: true });
  let process;
  try {
    process = await startProcess(invocation.command, invocation.args, {
      cwd: workspace,
      env,
      timeoutMs,
      outputLimitBytes,
      transportLimitBytes,
      stdoutLineTransform: compactCodexJsonLine,
    });
  } catch (error) {
    const failure = errorMessage(error);
    return {
      invocation,
      process: { code: null, signal: null, timed_out: false, output_limit_exceeded: false, transport_limit_exceeded: false, protocol_failed: true, aborted: false, transport_bytes: 0, retained_output_bytes: 0, stdout: "", stderr: failure },
      parsed: { events: [], parse_errors: [{ line: null, error: failure }], final_text: "", usage: null, tool_events: [], skill_read: false },
      runtime_counters: { provider_requests: null, turns_started: 0, tool_calls: 0, hard_turn_limit_reached: null },
    };
  }
  const parsed = parseCodexJsonl(process.stdout);
  return {
    invocation,
    process: { ...process, protocol_failed: parsed.parse_errors.length > 0 },
    parsed: { events: parsed.records, parse_errors: parsed.parse_errors, final_text: parsed.final_text, usage: parsed.usage, tool_events: parsed.tool_events, skill_read: parsed.skill_read },
    runtime_counters: parsed.runtime_counters,
  };
}

export function redactedCodexInvocation(invocation) {
  const args = [...invocation.args];
  const cwd = args.indexOf("-C");
  if (cwd >= 0 && cwd + 1 < args.length) args[cwd + 1] = "<workspace>";
  if (args.length > 0) args[args.length - 1] = "<explicit-skill-prompt>";
  return { command: invocation.command, args };
}
