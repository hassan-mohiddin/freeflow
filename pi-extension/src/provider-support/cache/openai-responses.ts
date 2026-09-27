import { createHash } from "node:crypto";
import type { AnchorPlan, CacheLayout, CacheLimits } from "./anchor.js";

/**
 * OpenAI Responses on GPT-5.6+: the implicit breakpoint sits at the latest eligible message, and a
 * lookup checks it, up to 20 earlier eligible message endings, and the latest explicit breakpoints.
 * A position here is an eligible message ending: a user message, or the last tool output of a group.
 */
export const OPENAI_RESPONSES_LIMITS: CacheLimits = { maxBreakpoints: 50, lookback: 20, margin: 5 };

type Handle = { item: number; block: number };
export interface ResponsesLayout {
  layout: CacheLayout;
  handles: (Handle | undefined)[];
}

const OUTPUTS = new Set(["function_call_output", "custom_tool_call_output"]);
const withoutMarkers = (value: unknown) =>
  JSON.stringify(value, (key, v) => (key === "prompt_cache_breakpoint" ? undefined : v));

/** Only routes whose documented cache protocol includes explicit breakpoints are adapted. */
export const supportsExplicitBreakpoints = (model: any) => model?.compat?.supportsExplicitPromptCacheMode === true;

export function responsesLayout(payload: any): ResponsesLayout | undefined {
  if (!payload || !Array.isArray(payload.input)) return;
  const chain: string[] = [],
    handles: (Handle | undefined)[] = [],
    breakpoints: number[] = [];
  let hash = createHash("sha256")
    .update(withoutMarkers([payload.instructions ?? null, payload.tools ?? null]))
    .digest("hex");
  let pending = "";
  const input: any[] = payload.input;
  input.forEach((item, i) => {
    pending += withoutMarkers(item);
    const user = item?.role === "user";
    const lastOutput = OUTPUTS.has(item?.type) && !OUTPUTS.has(input[i + 1]?.type);
    if (!user && !lastOutput) return;
    hash = createHash("sha256").update(hash).update(pending).digest("hex");
    pending = "";
    const content = Array.isArray(item.content) ? item.content : undefined;
    if (content?.some((block: any) => block?.prompt_cache_breakpoint)) breakpoints.push(chain.length);
    chain.push(hash);
    // Breakpoints go on message content blocks; tool outputs have no documented place for one.
    handles.push(user && content?.length ? { item: i, block: content.length - 1 } : undefined);
  });
  // The implicit breakpoint: the latest eligible message ending.
  if (chain.length && breakpoints.at(-1) !== chain.length - 1) breakpoints.push(chain.length - 1);
  return { layout: { chain, breakpoints, yieldable: [] }, handles };
}

export function applyResponsesAnchor(payload: any, { handles }: ResponsesLayout, plan: AnchorPlan): any {
  const handle = handles[plan.add];
  if (!handle) return payload;
  const input = [...payload.input];
  const item = { ...input[handle.item], content: [...input[handle.item].content] };
  item.content[handle.block] = { ...item.content[handle.block], prompt_cache_breakpoint: { mode: "explicit" } };
  input[handle.item] = item;
  return { ...payload, input };
}
