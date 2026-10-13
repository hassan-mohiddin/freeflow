// Pi's part of the shell tier's confinement probes (shell.mjs): the arm's own Pi, with its extensions and the
// evaluator's guard, runs every probe as a bash call from a local scripted model, and reports what each returned.

import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { baseProcessEnvironment } from "../../process.mjs";
import { guardExtensionPath, runPiProcess } from "./process.mjs";

const PROBE_PROVIDER = "skill-eval-probe";
const PROBE_MODEL = "confinement";

/**
 * Runs the probes through Pi in JSON mode. `guard` is the guard's environment for the probe workspace; `isolation`
 * is the probe's prepared isolation, whose agent directory gets the scripted model.
 *
 * @returns {Promise<{observation: any, launchError: string | null, results: Map<string, {ran: boolean, isError: boolean, output: string}>}>}
 */
export async function probeShell({ probes, workspace, isolation, extensions, guard, eventsFile, stderrFile, signal }) {
  const model = await startModelStub(probes);
  try {
    const agent = path.join(isolation.evidence.root, "agent");
    await writeFile(
      path.join(agent, "models.json"),
      `${JSON.stringify({ providers: { [PROBE_PROVIDER]: { baseUrl: model.baseUrl, api: "openai-completions", apiKey: "probe", models: [{ id: PROBE_MODEL }] } } }, null, 2)}\n`,
    );
    const environment = {
      ...baseProcessEnvironment(),
      PI_SKIP_VERSION_CHECK: "1",
      PI_TELEMETRY: "0",
      ...guard,
      ...isolation.environment,
    };
    const args = ["--mode", "json", "-p", "--no-session", "--no-extensions", "--extension", guardExtensionPath()];
    for (const extension of extensions) args.push("--extension", extension.path);
    args.push(
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-approve",
      "--tools",
      "bash",
      "--model",
      `${PROBE_PROVIDER}/${PROBE_MODEL}`,
      "Run each confinement probe with bash, exactly as given.",
    );
    let observation = null;
    let launchError = null;
    try {
      observation = await runPiProcess({
        command: "pi",
        args,
        cwd: workspace,
        eventsFile,
        stderrFile,
        signal,
        environment,
      });
    } catch (error) {
      launchError = error instanceof Error ? error.message : String(error);
    }
    // Whatever Pi reported before a launch error still counts.
    return { observation, launchError, results: await toolResults(eventsFile) };
  } finally {
    await model.close();
  }
}

/** Each probe's tool result from Pi's JSON events, by tool call ID. */
async function toolResults(eventsFile) {
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
    if (event.type !== "tool_execution_end" || typeof event.toolCallId !== "string") continue;
    const content = Array.isArray(event.result?.content) ? event.result.content : [];
    results.set(event.toolCallId, {
      ran: true,
      isError: event.isError === true,
      output: content
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join(""),
    });
  }
  return results;
}

/**
 * A local OpenAI-compatible chat-completions endpoint that answers the first request with every probe as a bash
 * tool call, and any request carrying tool results with a short final answer. No model is called.
 */
function startModelStub(probes) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        let parsed = {};
        try {
          parsed = JSON.parse(body || "{}");
        } catch {
          // Answered as a first request.
        }
        const followUp = Array.isArray(parsed.messages) && parsed.messages.some((message) => message?.role === "tool");
        const message = followUp
          ? { role: "assistant", content: "Probes finished." }
          : {
              role: "assistant",
              content: null,
              tool_calls: probes.map((probe, index) => ({
                index,
                id: probe.id,
                type: "function",
                function: { name: "bash", arguments: JSON.stringify({ command: probe.command }) },
              })),
            };
        const finish = followUp ? "stop" : "tool_calls";
        const base = { id: "probe", created: 0, model: parsed.model ?? PROBE_MODEL };
        const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        if (parsed.stream !== true) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              ...base,
              object: "chat.completion",
              choices: [
                {
                  index: 0,
                  message: { ...message, tool_calls: message.tool_calls?.map(({ index: _index, ...call }) => call) },
                  finish_reason: finish,
                },
              ],
              usage,
            }),
          );
          return;
        }
        response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        const send = (chunk) =>
          response.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", ...chunk })}\n\n`);
        send({ choices: [{ index: 0, delta: message, finish_reason: null }] });
        send({ choices: [{ index: 0, delta: {}, finish_reason: finish }] });
        send({ choices: [], usage });
        response.end("data: [DONE]\n\n");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}
