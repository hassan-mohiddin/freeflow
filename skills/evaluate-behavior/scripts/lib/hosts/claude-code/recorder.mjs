// A local relay between a Claude Code subject and Anthropic's API that records what each model request carried.
// Claude Code has no extension point that sees its requests, and it adds context of its own (an identity line, an
// environment note, reminders) even when the evaluator replaces its system prompt. So every subject's requests pass
// through here: the run keeps a host-context record of what Claude Code sent besides the evaluator's prompt, and,
// when a group checks context text, the same observations Pi's observer writes.

import { createHash } from "node:crypto";
import { appendFile, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";

const DEFAULT_UPSTREAM = "https://api.anthropic.com";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function blockText(block) {
  if (typeof block === "string") return block;
  if (!block || typeof block !== "object") return "";
  if (block.type === "text" && typeof block.text === "string") return block.text;
  if (block.type === "tool_result") {
    if (typeof block.content === "string") return block.content;
    if (Array.isArray(block.content)) return block.content.map(blockText).filter(Boolean).join("\n");
  }
  if (block.type === "image") return `[image:${block.source?.media_type ?? "unknown"}]`;
  return "";
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(blockText).filter(Boolean).join("\n");
}

function systemText(system) {
  if (typeof system === "string") return system;
  if (!Array.isArray(system)) return "";
  return system.map(blockText).join("\n");
}

/**
 * Starts the relay. `currentTurn()` names the session's turn when a request arrives. Context observations go to
 * `observationPath` when it is set; the host-context record is written to `hostContextPath` on close.
 *
 * @param {{upstream?: string, observationPath: string | null, hostContextPath: string, currentTurn: () => number}} options
 */
export async function startRecorder({ upstream = DEFAULT_UPSTREAM, observationPath, hostContextPath, currentTurn }) {
  const target = new URL(upstream);
  const transport = target.protocol === "http:" ? http : https;
  const basePath = target.pathname.replace(/\/$/, "");
  const requests = [];
  const systems = {};
  let first = null;
  let providerRequest = 0;
  let lastTurn = 0;
  let requestInTurn = 0;
  let writes = Promise.resolve();
  const observe = (entry) => {
    if (observationPath === null) return;
    const line = `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`;
    writes = writes.then(() => appendFile(observationPath, line, "utf8"));
  };

  const record = (request, body) => {
    let parsed;
    try {
      parsed = JSON.parse(body.toString("utf8"));
    } catch {
      requests.push({ method: request.method, path: request.url, bytes: body.length });
      return;
    }
    const system = systemText(parsed.system);
    const systemSha = sha256(system);
    systems[systemSha] = Array.isArray(parsed.system) ? parsed.system.map(blockText) : [system];
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    requests.push({
      method: request.method,
      path: request.url,
      model: parsed.model ?? null,
      system: systemSha,
      tools: Array.isArray(parsed.tools) ? parsed.tools.map((tool) => tool?.name ?? null) : [],
      messages: messages.length,
      roles: [...new Set(messages.map((message) => message?.role ?? null))],
    });
    if (!request.url.startsWith("/v1/messages") || request.url.includes("count_tokens")) return;
    // The first request shows everything Claude Code put before the subject's first prompt.
    first ??= {
      system: systems[systemSha],
      messages: messages.map((message) => ({ role: message?.role ?? null, text: contentText(message?.content) })),
    };
    const turn = currentTurn();
    if (turn !== lastTurn) {
      lastTurn = turn;
      requestInTurn = 0;
      observe({
        turn,
        kind: "context",
        surface: "system-prompt",
        prompt: null,
        characters: system.length,
        text: system,
        systemPrompt: system,
      });
    }
    providerRequest += 1;
    requestInTurn += 1;
    const normalized = messages.map((message) => ({
      role: message?.role ?? null,
      toolName: null,
      text: contentText(message?.content),
    }));
    const text = normalized
      .map((message) => message.text)
      .filter(Boolean)
      .join("\n");
    observe({
      turn,
      kind: "context",
      surface: "provider-context",
      providerRequest,
      requestInTurn,
      characters: text.length,
      text,
      messages: normalized,
    });
  };

  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      if (request.method === "POST") record(request, body);
      else requests.push({ method: request.method, path: request.url });
      const headers = { ...request.headers, host: target.host };
      const relayed = transport.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || undefined,
          path: `${basePath}${request.url}`,
          method: request.method,
          headers,
        },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        },
      );
      relayed.on("error", (error) => {
        if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain" });
        response.end(`relay error: ${error.message}`);
      });
      relayed.end(body);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    /** Stops the relay and writes the host-context record, with what Claude Code reported loading (`init`). */
    async close({ init = null } = {}) {
      await new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
      await writes;
      await writeFile(
        hostContextPath,
        `${JSON.stringify({ schema_version: 1, upstream: target.origin, init, first, requests, systems }, null, 2)}\n`,
      );
    },
  };
}
