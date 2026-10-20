import type { CacheMonitor } from "../cache/monitor.js";
import { OpenAIEffortAdapter } from "./adapter.js";
import { trustStartedSession } from "../../host/read-only-session.js";

export function registerOpenAIEffortSupport(pi: any, enabled?: () => boolean, monitor?: CacheMonitor): void {
  const adapter = new OpenAIEffortAdapter(pi, enabled, monitor);
  pi.on("session_start", (event: any, ctx: any) => {
    trustStartedSession(event?.reason, ctx.sessionManager);
    adapter.reset(ctx);
  });
  pi.on("session_shutdown", (_event: any, ctx: any) => adapter.reset(ctx));
  pi.on("session_tree", (_event: any, ctx: any) => adapter.reset(ctx));
  pi.on("session_before_compact", () => adapter.setCompacting(true));
  pi.on("session_compact", (_event: any, ctx: any) => adapter.reset(ctx));
  pi.on("session_compact_failed", () => adapter.setCompacting(false));
  pi.on("before_provider_request", (event: any, ctx: any) => adapter.adapt(event.payload, ctx));
}
