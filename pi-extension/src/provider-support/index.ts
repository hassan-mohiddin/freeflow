import type { CacheMonitor } from "../efficiency/cache-monitor.js";
import { CacheAnchorAdapter } from "./cache/index.js";
import { CacheKeepAlive } from "./cache/keepalive.js";
import { registerOpenAIEffortSupport } from "./openai/index.js";

export interface ProviderSupport {
  keepAlive: CacheKeepAlive;
}

export function registerProviderSupport(pi: any, enabled?: () => boolean, monitor?: CacheMonitor): ProviderSupport {
  registerOpenAIEffortSupport(pi, enabled, monitor);
  const anchor = new CacheAnchorAdapter(enabled);
  const report = () => monitor?.set("keep-alive", keepAlive.status());
  const keepAlive = new CacheKeepAlive({
    enabled,
    onRefresh: (record) => {
      try {
        // Pi's session usage totals are host-owned; keep-alive spend is recorded for Freeflow attribution.
        pi.appendEntry?.("freeflow-cache-keepalive-v1", { ...record, at: Date.now() });
      } catch {}
      report();
    },
  });
  const evaluate = (ctx: any) => {
    keepAlive.evaluate(ctx);
    report();
  };
  pi.on("session_shutdown", () => {
    anchor.reset();
    keepAlive.reset();
    report();
  });
  pi.on("before_provider_request", (event: any, ctx: any) => {
    const sent = anchor.adapt(event.payload, ctx);
    try {
      keepAlive.record(sent, ctx);
      evaluate(ctx);
    } catch {
      // Keep-alive bookkeeping never affects the request being sent.
    }
    return sent;
  });
  pi.on("message_end", (event: any, ctx: any) => {
    const message = event?.message;
    if (message?.role === "assistant" && message.provider && message.model)
      keepAlive.observe(ctx, message.usage, { provider: message.provider, modelId: message.model });
  });
  pi.on("agent_start", (_event: any, ctx: any) => evaluate(ctx));
  pi.on("agent_end", (_event: any, ctx: any) => evaluate(ctx));
  return { keepAlive };
}
