import { createHash } from "node:crypto";
import type { AnchorPlan, CacheLayout, CacheLimits } from "./anchor.js";

/** Anthropic Messages: four explicit breakpoints, each reading entries up to 20 positions back. */
export const ANTHROPIC_LIMITS: CacheLimits = { maxBreakpoints: 4, lookback: 20, margin: 5 };

type Handle = { kind: "tools" } | { kind: "system"; index: number } | { kind: "block"; message: number; block: number };
export interface AnthropicLayout {
  layout: CacheLayout;
  /** Where each position's breakpoint lives; undefined when the position cannot carry one. */
  handles: (Handle | undefined)[];
}

// Consecutive tool_use blocks, and consecutive tool_result blocks, form one lookback position.
const RUN_TYPES = new Set(["tool_use", "tool_result"]);
// Thinking blocks cannot carry cache_control.
const UNMARKABLE = new Set(["thinking", "redacted_thinking"]);
const withoutMarkers = (value: unknown) => JSON.stringify(value, (key, v) => (key === "cache_control" ? undefined : v));

export function anthropicLayout(payload: any): AnthropicLayout | undefined {
  if (!payload || !Array.isArray(payload.messages)) return;
  const chain: string[] = [],
    handles: (Handle | undefined)[] = [],
    breakpoints: number[] = [];
  let hash = "",
    pending = "";
  const push = (fingerprint: string, handle: Handle | undefined, marked: boolean) => {
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
      payload.tools.some((t: any) => t?.cache_control),
    );
  const system = typeof payload.system === "string" ? [{ type: "text", text: payload.system }] : (payload.system ?? []);
  system.forEach((block: any, index: number) =>
    push(
      `system:${withoutMarkers(block)}`,
      typeof payload.system === "string" ? undefined : { kind: "system", index },
      !!block?.cache_control,
    ),
  );
  payload.messages.forEach((message: any, m: number) => {
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
    const markable = message.role === "user" || message.role === "assistant";
    let b = 0;
    while (b < message.content.length) {
      const type = message.content[b]?.type;
      let end = b;
      if (RUN_TYPES.has(type)) while (message.content[end + 1]?.type === type) end++;
      const run = message.content.slice(b, end + 1);
      push(
        `${b === 0 ? start : ""}${withoutMarkers(run)}`,
        markable && !UNMARKABLE.has(message.content[end]?.type) ? { kind: "block", message: m, block: end } : undefined,
        run.some((block: any) => block?.cache_control),
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

function markerAt(payload: any, handle: Handle | undefined): any {
  if (handle?.kind === "tools") return payload.tools.findLast((t: any) => t.cache_control)?.cache_control;
  if (handle?.kind === "system") return payload.system[handle.index].cache_control;
  if (handle?.kind === "block") return payload.messages[handle.message].content[handle.block].cache_control;
}

/** Apply a plan without mutating the host payload: only the touched containers are copied. */
export function applyAnthropicAnchor(payload: any, { layout, handles }: AnthropicLayout, plan: AnchorPlan): any {
  const add = handles[plan.add];
  // Reuse the final breakpoint's marker so TTL ordering (longer lifetimes first) is preserved.
  const marker = markerAt(payload, handles[layout.breakpoints.at(-1)!]);
  if (add?.kind !== "block" || !marker) return payload;
  const next = { ...payload, messages: [...payload.messages] };
  const message = { ...next.messages[add.message], content: [...next.messages[add.message].content] };
  message.content[add.block] = { ...message.content[add.block], cache_control: marker };
  next.messages[add.message] = message;
  const remove = plan.remove === undefined ? undefined : handles[plan.remove];
  if (remove?.kind === "tools")
    next.tools = payload.tools.map((tool: any) => {
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
