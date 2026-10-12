import { OpenAIEffortAdapter } from "./adapter.js";
import { trustStartedSession } from "../../host/read-only-session.js";
export function registerOpenAIEffortSupport(pi, enabled, monitor) {
  const adapter = new OpenAIEffortAdapter(pi, enabled, monitor);
  pi.on("session_start", (event, ctx) => {
    trustStartedSession(event?.reason, ctx.sessionManager);
    adapter.reset(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => adapter.reset(ctx));
  pi.on("session_tree", (_event, ctx) => adapter.reset(ctx));
  pi.on("session_before_compact", () => adapter.setCompacting(true));
  pi.on("session_compact", (_event, ctx) => adapter.reset(ctx));
  pi.on("session_compact_failed", () => adapter.setCompacting(false));
  pi.on("before_provider_request", (event, ctx) => adapter.adapt(event.payload, ctx));
}
