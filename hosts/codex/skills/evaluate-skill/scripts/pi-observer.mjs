import { appendFileSync } from "node:fs";

const outputPath = process.env.SKILL_EVAL_CONTEXT_OBSERVATION_PATH;
let turn = 0;
let requestInTurn = 0;
let providerRequest = 0;

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      if (block.type === "text" && typeof block.text === "string") return block.text;
      if (block.type === "image" && typeof block.mimeType === "string") return `[image:${block.mimeType}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function append(event) {
  if (!outputPath) return;
  appendFileSync(outputPath, `${JSON.stringify({ timestamp: new Date().toISOString(), turn, ...event })}\n`, "utf8");
}

export default function skillEvaluationObserver(pi) {
  pi.on("before_agent_start", (event, ctx) => {
    turn += 1;
    requestInTurn = 0;
    const systemPrompt =
      typeof event?.systemPrompt === "string" ? event.systemPrompt : String(ctx?.getSystemPrompt?.() ?? "");
    append({
      kind: "context",
      surface: "system-prompt",
      prompt: typeof event?.prompt === "string" ? event.prompt : null,
      characters: systemPrompt.length,
      text: systemPrompt,
      systemPrompt,
    });
  });

  pi.on("context", (event) => {
    providerRequest += 1;
    requestInTurn += 1;
    const messages = Array.isArray(event?.messages) ? event.messages : [];
    const normalized = messages.map((message) => ({
      role: message?.role ?? null,
      toolName: message?.toolName ?? null,
      text: textFromContent(message?.content),
    }));
    const text = normalized
      .map((message) => message.text)
      .filter(Boolean)
      .join("\n");
    append({
      kind: "context",
      surface: "provider-context",
      providerRequest,
      requestInTurn,
      characters: text.length,
      text,
      messages: normalized,
    });
  });
}
