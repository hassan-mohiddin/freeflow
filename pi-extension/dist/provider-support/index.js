import { CacheAnchorAdapter } from "./cache/index.js";
import { CacheKeepAlive } from "./cache/keepalive.js";
import { registerOpenAIEffortSupport } from "./openai/index.js";
export function registerProviderSupport(pi, enabled) {
  registerOpenAIEffortSupport(pi, enabled);
  const anchor = new CacheAnchorAdapter(enabled);
  let statusCtx;
  const showStatus = () => {
    try {
      statusCtx?.ui?.setStatus?.("freeflow-cache-keepalive", keepAlive.holding() ? keepAlive.status() : undefined);
    } catch {}
  };
  const keepAlive = new CacheKeepAlive({
    enabled,
    onRefresh: (record) => {
      try {
        // Pi's session usage totals are host-owned; keep-alive spend is recorded for Freeflow attribution.
        pi.appendEntry?.("freeflow-cache-keepalive-v1", { ...record, at: Date.now() });
      } catch {}
      showStatus();
    },
  });
  const evaluate = (ctx) => {
    statusCtx = ctx;
    keepAlive.evaluate(ctx);
    showStatus();
  };
  pi.on("session_shutdown", () => {
    anchor.reset();
    keepAlive.reset();
  });
  pi.on("before_provider_request", (event, ctx) => {
    const sent = anchor.adapt(event.payload, ctx);
    try {
      keepAlive.record(sent, ctx);
      evaluate(ctx);
    } catch {
      // Keep-alive bookkeeping never affects the request being sent.
    }
    return sent;
  });
  pi.on("message_end", (event, ctx) => {
    const message = event?.message;
    if (message?.role === "assistant" && message.provider && message.model)
      keepAlive.observe(ctx, message.usage, { provider: message.provider, modelId: message.model });
  });
  pi.on("agent_start", (_event, ctx) => evaluate(ctx));
  pi.on("agent_end", (_event, ctx) => evaluate(ctx));
  return { keepAlive };
}
