import { isChatGPTSignIn } from "../routes.js";
import { planAnchor, type AnchorPlan, type CacheLayout, type CacheLimits } from "./anchor.js";
import { ANTHROPIC_LIMITS, anthropicLayout, applyAnthropicAnchor } from "./anthropic.js";
import {
  OPENAI_RESPONSES_LIMITS,
  applyResponsesAnchor,
  responsesLayout,
  supportsExplicitBreakpoints,
} from "./openai-responses.js";

export { planAnchor } from "./anchor.js";
export type { AnchorPlan, CacheLayout, CacheLimits } from "./anchor.js";

/** Payload support for one API whose prompt cache uses explicit breakpoints. */
interface BreakpointProtocol {
  limits: CacheLimits;
  /** Models on this API whose documented cache protocol matches; all of them when absent. */
  applies?: (model: any) => boolean;
  layout(payload: any): { layout: CacheLayout } | undefined;
  apply(payload: any, layout: any, plan: AnchorPlan): any;
}

const responses: BreakpointProtocol = {
  limits: OPENAI_RESPONSES_LIMITS,
  applies: supportsExplicitBreakpoints,
  layout: responsesLayout,
  apply: applyResponsesAnchor,
};
// APIs with unbounded prefix lookup need no entry: every prefix they wrote stays reachable. The ChatGPT
// Codex backend is one: live probes found full prefix reuse after 60 appended message endings, and it
// rejects prompt_cache_breakpoint, so it must never be adapted. Sign in with ChatGPT on the openai provider
// reaches the same backend (full reuse after 25 endings, breakpoints rejected) and is skipped in adapt().
const PROTOCOLS: Record<string, BreakpointProtocol> = {
  "anthropic-messages": { limits: ANTHROPIC_LIMITS, layout: anthropicLayout, apply: applyAnthropicAnchor },
  "openai-responses": responses,
  "azure-openai-responses": responses,
};

/** Recent requests per session and model; enough to find the requester's own earlier entry. */
const REMEMBERED = 8;

export class CacheAnchorAdapter {
  private lanes = new Map<string, CacheLayout[]>();
  constructor(private readonly enabled: () => boolean = () => true) {}

  reset(): void {
    this.lanes.clear();
  }

  adapt(payload: any, ctx: any): any {
    const model = ctx?.model;
    const protocol = model && PROTOCOLS[model.api];
    if (!protocol || (protocol.applies && !protocol.applies(model)) || !this.enabled()) return payload;
    if (isChatGPTSignIn(model, ctx)) return payload;
    try {
      const session = ctx.sessionManager?.getSessionId?.() ?? "memory";
      const lane = JSON.stringify([session, model.provider, model.api, model.id, model.baseUrl ?? ""]);
      const mapped = protocol.layout(payload);
      if (!mapped) return payload;
      const prior = this.lanes.get(lane) ?? [];
      const plan = planAnchor(prior, mapped.layout, protocol.limits);
      const sent = plan ? protocol.apply(payload, mapped, plan) : payload;
      const remembered = sent === payload ? mapped.layout : protocol.layout(sent)!.layout;
      this.lanes.set(lane, [remembered, ...prior].slice(0, REMEMBERED));
      return sent;
    } catch {
      // Cache placement is an optimization; never turn it into a failed request.
      return payload;
    }
  }
}
