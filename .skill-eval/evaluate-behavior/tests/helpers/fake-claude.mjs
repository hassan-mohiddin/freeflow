// Test helper only: a small Claude Code stand-in and a scripted Anthropic Messages endpoint.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

/**
 * A small Claude Code stand-in for headless stream-json mode. It reports `system/init` with the `--tools` it was
 * given, reads user messages from stdin, asks ANTHROPIC_BASE_URL's Messages endpoint for each step, passes every tool
 * call through the PreToolUse hook in its `--settings` file, runs allowed Bash, Read and Write calls itself, and
 * writes Claude Code's assistant, user and result events. Each start is logged with its arguments and the variables
 * the tests check.
 */
export async function installFakeClaude(root) {
  const bin = path.join(root, "claude-bin");
  const log = path.join(root, "claude.jsonl");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "claude");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
const args = process.argv.slice(2);
if (args[0] === "--version") {
  process.stdout.write("9.9.9 (Claude Code)\\n");
  process.exit(0);
}
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const LOGGED = ["HOME", "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "DISABLE_AUTO_COMPACT", "CONFINEMENT_PROBE", "SKILL_EVAL_ALLOWED_TOOLS", "PARENT_ONLY"];
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd(), env: Object.fromEntries(LOGGED.map((key) => [key, process.env[key] ?? null])) }) + "\\n");
const tools = (flag("--tools") ?? "").split(",").filter(Boolean);
const model = flag("--model");
const hook = JSON.parse(readFileSync(flag("--settings"), "utf8")).hooks?.PreToolUse?.[0]?.hooks?.[0]?.command;
let system = flag("--system-prompt") ?? (flag("--system-prompt-file") ? readFileSync(flag("--system-prompt-file"), "utf8") : "Claude Code's own prompt.");
if (flag("--append-system-prompt-file")) system += "\\n\\n" + readFileSync(flag("--append-system-prompt-file"), "utf8");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "system", subtype: "init", tools, mcp_servers: [], model, claude_code_version: "9.9.9", skills: [], slash_commands: [], plugins: [], permissionMode: flag("--permission-mode") });
const messages = [];
let cost = 0;
let step = 0;
async function ask() {
  const response = await fetch(process.env.ANTHROPIC_BASE_URL + "/v1/messages?beta=true", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "oauth" },
    body: JSON.stringify({ model, system: [{ type: "text", text: "You are a Claude agent, built on Anthropic's Claude Agent SDK." }, { type: "text", text: system }], messages, tools: tools.map((name) => ({ name })), stream: false }),
  });
  if (!response.ok) throw new Error("API error " + response.status);
  return response.json();
}
function runTool(name, input) {
  const decided = spawnSync("/bin/sh", ["-c", hook], { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: name, tool_input: input, cwd: process.cwd() }), env: process.env, encoding: "utf8" });
  const decision = JSON.parse(decided.stdout || "{}").hookSpecificOutput;
  if (decision?.permissionDecision !== "allow") return { text: "PreToolUse:" + name + " hook error: " + (decision?.permissionDecisionReason ?? "no decision"), isError: true };
  const allowed = decision.updatedInput ?? input;
  try {
    if (name === "Bash") {
      const result = spawnSync("/bin/sh", ["-c", allowed.command], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
      return { text: result.stdout + result.stderr, isError: result.status !== 0 };
    }
    if (name === "Read") return { text: readFileSync(path.resolve(allowed.file_path), "utf8"), isError: false };
    if (name === "Write") {
      mkdirSync(path.dirname(path.resolve(allowed.file_path)), { recursive: true });
      writeFileSync(path.resolve(allowed.file_path), allowed.content);
      return { text: "File written", isError: false };
    }
  } catch (error) {
    return { text: String(error.message), isError: true };
  }
  return { text: "unsupported tool " + name, isError: true };
}
async function turn(prompt) {
  messages.push({ role: "user", content: prompt });
  for (let round = 0; round < 10; round += 1) {
    let reply;
    try {
      reply = await ask();
    } catch (error) {
      emit({ type: "result", subtype: "success", is_error: true, result: error.message, usage: {}, total_cost_usd: cost });
      return;
    }
    step += 1;
    for (const block of reply.content) emit({ type: "assistant", message: { id: "msg_" + step, model, role: "assistant", content: [block] } });
    messages.push({ role: "assistant", content: reply.content });
    const uses = reply.content.filter((block) => block.type === "tool_use");
    if (uses.length === 0) {
      cost += 0.01;
      const text = reply.content.filter((block) => block.type === "text").map((block) => block.text).join("");
      emit({ type: "result", subtype: "success", is_error: false, result: text, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 }, total_cost_usd: cost });
      return;
    }
    const results = uses.map((use) => {
      const result = runTool(use.name, use.input);
      return { type: "tool_result", tool_use_id: use.id, content: result.text, is_error: result.isError };
    });
    emit({ type: "user", message: { role: "user", content: results } });
    messages.push({ role: "user", content: results });
  }
}
for await (const line of createInterface({ input: process.stdin })) {
  if (line.trim() === "") continue;
  const message = JSON.parse(line);
  await turn(message.message.content);
}
`,
  );
  await chmod(executable, 0o755);
  return { bin, log };
}

/** The fake claude's logged starts. */
export async function claudeStarts(log) {
  return (await readFile(log, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * A scripted Anthropic Messages endpoint: `respond(body)` returns the reply's content blocks for each request body.
 * Every request body is kept in `requests`.
 */
export function startScriptedApi(respond) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      requests.push({ url: request.url, body: parsed });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "msg", type: "message", role: "assistant", content: respond(parsed) }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

/** Whether a request body's last message carries tool results. */
export function answersTools(body) {
  const last = body.messages?.at(-1);
  return Array.isArray(last?.content) && last.content.some((block) => block?.type === "tool_result");
}
