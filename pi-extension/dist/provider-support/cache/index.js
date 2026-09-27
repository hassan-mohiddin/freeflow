import { planAnchor } from "./anchor.js";
import { ANTHROPIC_LIMITS, anthropicLayout, applyAnthropicAnchor } from "./anthropic.js";
import {
  OPENAI_RESPONSES_LIMITS,
  applyResponsesAnchor,
  responsesLayout,
  supportsExplicitBreakpoints,
} from "./openai-responses.js";
export { planAnchor } from "./anchor.js";
const responses = {
  limits: OPENAI_RESPONSES_LIMITS,
  applies: supportsExplicitBreakpoints,
  layout: responsesLayout,
  apply: applyResponsesAnchor,
};
// APIs with unbounded prefix lookup need no entry: every prefix they wrote stays reachable. Routes whose
// protocol is not documented (such as the ChatGPT Codex backend) stay untouched until qualified.
const PROTOCOLS = {
  "anthropic-messages": { limits: ANTHROPIC_LIMITS, layout: anthropicLayout, apply: applyAnthropicAnchor },
  "openai-responses": responses,
  "azure-openai-responses": responses,
};
/** Recent requests per session and model; enough to find the requester's own earlier entry. */
const REMEMBERED = 8;
export class CacheAnchorAdapter {
  enabled;
  lanes = new Map();
  constructor(enabled = () => true) {
    this.enabled = enabled;
  }
  reset() {
    this.lanes.clear();
  }
  adapt(payload, ctx) {
    const model = ctx?.model;
    const protocol = model && PROTOCOLS[model.api];
    if (!protocol || (protocol.applies && !protocol.applies(model)) || !this.enabled()) return payload;
    try {
      const session = ctx.sessionManager?.getSessionId?.() ?? "memory";
      const lane = JSON.stringify([session, model.provider, model.api, model.id, model.baseUrl ?? ""]);
      const mapped = protocol.layout(payload);
      if (!mapped) return payload;
      const prior = this.lanes.get(lane) ?? [];
      const plan = planAnchor(prior, mapped.layout, protocol.limits);
      const sent = plan ? protocol.apply(payload, mapped, plan) : payload;
      const remembered = sent === payload ? mapped.layout : protocol.layout(sent).layout;
      this.lanes.set(lane, [remembered, ...prior].slice(0, REMEMBERED));
      return sent;
    } catch {
      // Cache placement is an optimization; never turn it into a failed request.
      return payload;
    }
  }
}
