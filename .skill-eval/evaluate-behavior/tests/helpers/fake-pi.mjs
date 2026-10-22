// Test helper only: a small Pi stand-in shared by the shell and container tests.
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function write(file, contents, mode) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  if (mode) await chmod(file, mode);
  return file;
}

/**
 * A small Pi stand-in. In JSON mode it loads each --extension with a minimal extension API (on, registerTool),
 * asks the configured models.json endpoint for tool calls, passes each through the extensions' tool_call
 * handlers, and runs it with an extension's tool or, failing that, the host shell, reporting Pi's JSON events.
 * In RPC mode it answers a body subject's prompt with a short reply, first running \`rpcTools\` (or \`rpcBash\`, one
 * bash call) through the extensions, as Pi would: bash with the host shell, and \`write\` and \`read\` as Pi's file tools
 * do, on the host path they are given. In every string input, \`{skill}\` becomes the first declared skill's directory,
 * \`{cwd}\` the working directory Pi reports and \`{freeflow}\` the loaded Freeflow package. Each call and its output is
 * appended to \`tools\`. An --extension that is a package directory loads its package.json "main".
 */
export async function installFakePi(root, { rpcBash = null, rpcTools = null } = {}) {
  const bin = path.join(root, "bin");
  const log = path.join(root, "pi.jsonl");
  const toolsLog = path.join(root, "pi-tools.jsonl");
  const calls = rpcTools ?? (rpcBash === null ? [] : [{ toolName: "bash", input: { command: rpcBash } }]);
  await write(
    path.join(bin, "pi"),
    `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
const flag = (name) => args.flatMap((arg, index) => (arg === name ? [args[index + 1]] : []));
const mode = flag("--mode")[0];
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ mode, cwd: process.cwd() }) + "\\n");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const handlers = new Map();
const tools = new Map();
const api = {
  on: (event, handler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
  registerTool: (tool) => tools.set(tool.name, tool),
  registerCommand: () => {},
};
// A package directory loads its package.json "main" (or index.js), as Pi loads an installed package.
const entryOf = (extension) => {
  try {
    if (!statSync(extension).isDirectory()) return extension;
  } catch {
    return extension;
  }
  const manifest = JSON.parse(readFileSync(path.join(extension, "package.json"), "utf8"));
  return path.join(extension, manifest.main ?? "index.js");
};
for (const extension of flag("--extension")) (await import(pathToFileURL(entryOf(extension)).href)).default(api);
if (mode === "rpc") {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line === "") continue;
      const command = JSON.parse(line);
      const response = { type: "response", id: command.id, command: command.type, success: true };
      if (command.type === "get_commands") response.data = { commands: [] };
      emit(response);
      if (command.type !== "prompt") continue;
      if (process.env.FAKE_PI_HANG) {
        appendFileSync(process.env.FAKE_PI_HANG, "prompted\\n");
        emit({ type: "agent_start" });
        continue;
      }
      const message = { role: "assistant", content: [{ type: "text", text: "done" }], provider: "fake", model: "fake", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } }, stopReason: "stop" };
      emit({ type: "agent_start" });
      const skill = flag("--skill")[0] ?? "";
      const cwd = process.cwd();
      // The loaded Freeflow package: the readable root the evaluator gave its build.
      const freeflow = JSON.parse(process.env.SKILL_EVAL_ALLOWED_ROOTS ?? "[]").find((root) => root.endsWith("/package")) ?? "";
      for (const [index, call] of ${JSON.stringify(calls)}.entries()) {
        const toolName = call.toolName;
        const input = Object.fromEntries(Object.entries(call.input).map(([key, value]) => [key, typeof value === "string" ? value.replaceAll("{skill}", skill).replaceAll("{cwd}", cwd).replaceAll("{freeflow}", freeflow) : value]));
        const toolCallId = index === 0 ? "b" : "b" + index;
        emit({ type: "tool_execution_start", toolCallId, toolName, args: { ...input } });
        const blocked = (handlers.get("tool_call") ?? []).map((handler) => handler({ toolName, input }, { cwd })).find((result) => result?.block);
        let output = "";
        let isError = false;
        if (blocked) {
          output = blocked.reason;
          isError = true;
        } else if (toolName === "bash") {
          const result = spawnSync("/bin/sh", ["-c", input.command], { cwd, env: process.env, encoding: "utf8" });
          output = (result.stdout ?? "") + (result.stderr ?? "");
          isError = result.status !== 0;
        } else {
          try {
            const file = path.resolve(cwd, input.path);
            if (toolName === "write") writeFileSync(file, input.content);
            output = toolName === "read" ? readFileSync(file, "utf8") : "Successfully wrote " + input.path;
          } catch (error) {
            output = error.message;
            isError = true;
          }
        }
        appendFileSync(${JSON.stringify(toolsLog)}, JSON.stringify({ toolName, input, cwd, output, isError }) + "\\n");
        emit({ type: "tool_execution_end", toolCallId, toolName, result: { content: [{ type: "text", text: output }] }, isError });
      }
      emit({ type: "message_end", message });
      emit({ type: "turn_end", message, toolResults: [] });
      emit({ type: "agent_end", messages: [message], willRetry: false });
      emit({ type: "agent_settled" });
    }
  });
} else {
  const [provider, model] = flag("--model")[0].split("/");
  const models = JSON.parse(readFileSync(path.join(process.env.PI_CODING_AGENT_DIR, "models.json"), "utf8"));
  const endpoint = models.providers[provider].baseUrl + "/chat/completions";
  const messages = [{ role: "user", content: args.at(-1) }];
  const ask = async () => {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: true, messages }) });
    const calls = [];
    let text = "";
    for (const line of (await response.text()).split("\\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      for (const choice of JSON.parse(line.slice(6)).choices ?? []) {
        text += choice.delta?.content ?? "";
        for (const call of choice.delta?.tool_calls ?? []) calls[call.index] = call;
      }
    }
    return { calls, text };
  };
  const first = await ask();
  messages.push({ role: "assistant", tool_calls: first.calls });
  for (const call of first.calls) {
    const input = JSON.parse(call.function.arguments);
    const ctx = { cwd: process.cwd() };
    emit({ type: "tool_execution_start", toolCallId: call.id, toolName: call.function.name, args: input });
    let text;
    let isError = false;
    const blocked = (handlers.get("tool_call") ?? []).map((handler) => handler({ toolName: call.function.name, input }, ctx)).find((result) => result?.block);
    if (blocked) {
      text = blocked.reason;
      isError = true;
    } else if (tools.has(call.function.name)) {
      const result = await tools.get(call.function.name).execute(call.id, input, undefined, undefined, ctx);
      text = result.content.map((part) => part.text).join("");
    } else {
      const result = spawnSync("/bin/sh", ["-c", input.command], { cwd: ctx.cwd, env: process.env, encoding: "utf8" });
      text = result.stdout + result.stderr;
      isError = result.status !== 0;
    }
    emit({ type: "tool_execution_end", toolCallId: call.id, toolName: call.function.name, result: { content: [{ type: "text", text }] }, isError });
    messages.push({ role: "tool", tool_call_id: call.id, content: text });
  }
  const final = await ask();
  emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: final.text }], provider, model, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } }, stopReason: "stop" } });
  emit({ type: "agent_settled" });
}
`,
    0o755,
  );
  return { bin, log, tools: toolsLog };
}
