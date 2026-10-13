// Claude Code's part of the shell tier's confinement probes (shell.mjs): a headless Claude Code with the evaluator's
// guard hook runs every probe as a Bash call from a local scripted Anthropic endpoint, and reports what each returned.

import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { baseProcessEnvironment } from "../../process.mjs";
import { baseArguments, CLAUDE_CODE_ENVIRONMENT, settingsWithGuard } from "./launch.mjs";
import { runClaudeOneShot } from "./session.mjs";

// The stub answers every request, so no model is called; the name only keeps Claude Code on a model it knows.
const PROBE_MODEL = "claude-haiku-5-5";

function toolUseId(probe) {
  return `toolu_probe_${probe.id.replaceAll("-", "_")}`;
}

/**
 * Runs the probes through Claude Code. `guard` is the guard's environment for the probe workspace; `isolation` is
 * the probe's prepared isolation, which carries no login.
 *
 * @returns {Promise<{observation: any, launchError: string | null, results: Map<string, {ran: boolean, isError: boolean, output: string}>}>}
 */
export async function probeClaudeShell({ probes, workspace, isolation, guard, eventsFile, stderrFile, signal }) {
  const model = await startMessagesStub(probes);
  try {
    const settingsFile = path.join(isolation.evidence.root, "settings.json");
    await writeFile(settingsFile, `${JSON.stringify(settingsWithGuard({}), null, 2)}\n`);
    const args = [
      ...baseArguments({ model: PROBE_MODEL, settingsFile }),
      "--tools",
      "Bash",
      "--system-prompt",
      "Run each confinement probe with Bash, exactly as given.",
    ];
    const noProxy = [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");
    const environment = {
      ...baseProcessEnvironment(),
      ...CLAUDE_CODE_ENVIRONMENT,
      ...guard,
      ...isolation.environment,
      ANTHROPIC_API_KEY: "probe",
      ANTHROPIC_BASE_URL: model.baseUrl,
      NO_PROXY: noProxy,
      no_proxy: noProxy,
    };
    let observation = null;
    let launchError = null;
    try {
      observation = await runClaudeOneShot({
        command: "claude",
        args,
        cwd: workspace,
        eventsFile,
        stderrFile,
        signal,
        prompts: ["Run the confinement probes."],
        environment,
      });
    } catch (error) {
      launchError = error instanceof Error ? error.message : String(error);
    }
    // Whatever Claude Code reported before a launch error still counts.
    return { observation, launchError, results: await toolResults(eventsFile, probes) };
  } finally {
    await model.close();
  }
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text")
    .map((part) => part.text)
    .join("");
}

/** Each probe's tool result from Claude Code's stream-json events, by probe ID. */
async function toolResults(eventsFile, probes) {
  const byToolUse = new Map(probes.map((probe) => [toolUseId(probe), probe.id]));
  const results = new Map();
  const contents = await readFile(eventsFile, "utf8").catch(() => "");
  for (const line of contents.split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== "user" || !Array.isArray(event.message?.content)) continue;
    for (const block of event.message.content) {
      if (block?.type !== "tool_result" || !byToolUse.has(block.tool_use_id)) continue;
      results.set(byToolUse.get(block.tool_use_id), {
        ran: true,
        isError: block.is_error === true,
        output: resultText(block.content),
      });
    }
  }
  return results;
}

/**
 * A local Anthropic Messages endpoint that answers a request without tool results with every probe as a Bash
 * tool call, and any request carrying tool results with a short final answer. No model is called.
 */
function startMessagesStub(probes) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        if (request.method !== "POST" || !request.url.startsWith("/v1/messages")) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end("{}");
          return;
        }
        let parsed = {};
        try {
          parsed = JSON.parse(body || "{}");
        } catch {
          // Answered as a first request.
        }
        if (request.url.includes("count_tokens")) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ input_tokens: 0 }));
          return;
        }
        const followUp =
          Array.isArray(parsed.messages) &&
          parsed.messages.some(
            (message) =>
              Array.isArray(message?.content) && message.content.some((block) => block?.type === "tool_result"),
          );
        const content = followUp
          ? [{ type: "text", text: "Probes finished." }]
          : probes.map((probe) => ({
              type: "tool_use",
              id: toolUseId(probe),
              name: "Bash",
              input: { command: probe.command, description: probe.id },
            }));
        const stopReason = followUp ? "end_turn" : "tool_use";
        const usage = { input_tokens: 0, output_tokens: 0 };
        const message = {
          id: "msg_probe",
          type: "message",
          role: "assistant",
          model: parsed.model ?? PROBE_MODEL,
          stop_sequence: null,
        };
        if (parsed.stream !== true) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ ...message, content, stop_reason: stopReason, usage }));
          return;
        }
        response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        const send = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
        send("message_start", { message: { ...message, content: [], stop_reason: null, usage } });
        for (const [index, block] of content.entries()) {
          if (block.type === "text") {
            send("content_block_start", { index, content_block: { type: "text", text: "" } });
            send("content_block_delta", { index, delta: { type: "text_delta", text: block.text } });
          } else {
            send("content_block_start", { index, content_block: { ...block, input: {} } });
            send("content_block_delta", {
              index,
              delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) },
            });
          }
          send("content_block_stop", { index });
        }
        send("message_delta", { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 0 } });
        send("message_stop", {});
        response.end();
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}
