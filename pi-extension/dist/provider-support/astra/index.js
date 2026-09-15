import { AstraAdapter } from "./adapter.js";
export function registerAstraSupport(pi) {
  const adapter = new AstraAdapter(pi);
  pi.on("session_start", (_event, ctx) => adapter.reset(ctx));
  pi.on("session_shutdown", (_event, ctx) => adapter.reset(ctx));
  pi.on("session_tree", (_event, ctx) => adapter.reset(ctx));
  pi.on("session_before_compact", () => adapter.setCompacting(true));
  pi.on("session_compact", (_event, ctx) => adapter.reset(ctx));
  pi.on("session_compact_failed", () => adapter.setCompacting(false));
  pi.on("before_provider_request", (event, ctx) => adapter.adapt(event.payload, ctx));
}
