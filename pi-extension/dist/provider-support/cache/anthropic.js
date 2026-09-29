import { createHash } from "node:crypto";
/** Anthropic Messages: four explicit breakpoints, each reading entries up to 20 positions back. */
export const ANTHROPIC_LIMITS = { maxBreakpoints: 4, lookback: 20, margin: 5 };
// Consecutive tool_use blocks, and consecutive tool_result blocks, form one lookback position.
const RUN_TYPES = new Set(["tool_use", "tool_result"]);
// Thinking blocks cannot carry cache_control.
const UNMARKABLE = new Set(["thinking", "redacted_thinking"]);
const withoutMarkers = (value) => JSON.stringify(value, (key, v) => (key === "cache_control" ? undefined : v));
export function anthropicLayout(payload) {
  if (!payload || !Array.isArray(payload.messages)) return;
  const chain = [],
    handles = [],
    breakpoints = [];
  let hash = "",
    pending = "";
  const push = (fingerprint, handle, marked) => {
    hash = createHash("sha256").update(hash).update(pending).update(fingerprint).digest("hex");
    pending = "";
    if (marked) breakpoints.push(chain.length);
    chain.push(hash);
    handles.push(handle);
  };
  if (Array.isArray(payload.tools) && payload.tools.length)
    push(
      `tools:${withoutMarkers(payload.tools)}`,
      { kind: "tools" },
      payload.tools.some((t) => t?.cache_control),
    );
  const system = typeof payload.system === "string" ? [{ type: "text", text: payload.system }] : (payload.system ?? []);
  system.forEach((block, index) =>
    push(
      `system:${withoutMarkers(block)}`,
      typeof payload.system === "string" ? undefined : { kind: "system", index },
      !!block?.cache_control,
    ),
  );
  payload.messages.forEach((message, m) => {
    const start = `message:${message.role}:`;
    if (!Array.isArray(message.content)) {
      // Unmarkable without reshaping the message, but still part of the prefix.
      push(`${start}${withoutMarkers(message.content)}`, undefined, false);
      return;
    }
    if (!message.content.length) {
      // Content-less messages (such as per-message effort) change the prefix without adding a position.
      pending += `${start}${withoutMarkers(message)}`;
      return;
    }
    // Mid-conversation role:"system" updates carry markers too; Pi puts the final one there when an update ends the request.
    const markable = message.role === "user" || message.role === "assistant" || message.role === "system";
    let b = 0;
    while (b < message.content.length) {
      const type = message.content[b]?.type;
      let end = b;
      if (RUN_TYPES.has(type)) while (message.content[end + 1]?.type === type) end++;
      const run = message.content.slice(b, end + 1);
      push(
        `${b === 0 ? start : ""}${withoutMarkers(run)}`,
        markable && !UNMARKABLE.has(message.content[end]?.type) ? { kind: "block", message: m, block: end } : undefined,
        run.some((block) => block?.cache_control),
      );
      b = end + 1;
    }
  });
  if (pending) push("", undefined, false);
  const systemMarks = breakpoints.filter((p) => handles[p]?.kind === "system");
  const yieldable = [
    ...breakpoints.filter((p) => handles[p]?.kind === "tools"),
    // The last system breakpoint covers every earlier one while the system prompt is unchanged.
    ...systemMarks.slice(0, -1),
  ];
  return { layout: { chain, breakpoints, yieldable }, handles };
}
function markerAt(payload, handle) {
  if (handle?.kind === "tools") return payload.tools.findLast((t) => t.cache_control)?.cache_control;
  if (handle?.kind === "system") return payload.system[handle.index].cache_control;
  if (handle?.kind === "block") return payload.messages[handle.message].content[handle.block].cache_control;
}
/** Apply a plan without mutating the host payload: only the touched containers are copied. */
export function applyAnthropicAnchor(payload, { layout, handles }, plan) {
  const add = handles[plan.add];
  // Reuse the final breakpoint's marker so TTL ordering (longer lifetimes first) is preserved.
  const marker = markerAt(payload, handles[layout.breakpoints.at(-1)]);
  if (add?.kind !== "block" || !marker) return payload;
  const next = { ...payload, messages: [...payload.messages] };
  const message = { ...next.messages[add.message], content: [...next.messages[add.message].content] };
  message.content[add.block] = { ...message.content[add.block], cache_control: marker };
  next.messages[add.message] = message;
  const remove = plan.remove === undefined ? undefined : handles[plan.remove];
  if (remove?.kind === "tools")
    next.tools = payload.tools.map((tool) => {
      if (!tool?.cache_control) return tool;
      const { cache_control: _marker, ...rest } = tool;
      return rest;
    });
  else if (remove?.kind === "system") {
    next.system = [...payload.system];
    const { cache_control: _marker, ...rest } = next.system[remove.index];
    next.system[remove.index] = rest;
  }
  return next;
}
