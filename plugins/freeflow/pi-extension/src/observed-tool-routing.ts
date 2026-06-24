import { normalizeFreeflowConfig, routeObservedToolOutput } from "../../router/dist/index.js";
import { resolvePiObservedRoutingDecision } from "./host-producer-identification.js";
import { notifyRouterConfigWarnings, readFreeflowConfig } from "./runtime-context.js";
import { getRouterSessionId } from "./utils.js";

export async function handleObservedToolRouting(event: any, ctx: any) {
  const parsedConfig = await readFreeflowConfig(ctx.cwd);
  const normalized = normalizeFreeflowConfig(parsedConfig);
  notifyRouterConfigWarnings(ctx, { warnings: normalized.warnings });

  if (normalized.config.outputRouter.enabled === false) {
    return undefined;
  }

  const decision = resolvePiObservedRoutingDecision(event, normalized.config.observedRouting);
  if (!decision.route) {
    return undefined;
  }

  const rawResult = rawObservedResult(event);
  const routed = await routeObservedToolOutput({
    sessionId: getRouterSessionId(ctx),
    host: decision.host,
    producer: decision.producer as any,
    rawResult,
    persistence: decision.persistence,
    risk: decision.risk as any,
    preserve: "important",
    vaultRoot: normalized.config.outputRouter.vault.root,
    vaultRetention: normalized.config.outputRouter.vault.retention,
    thresholds: normalized.config.outputRouter.thresholds,
  });

  if (routed.passthrough) {
    return {
      content: [{ type: "text", text: formatObservedFailOpen(routed) }],
      details: observedDetails(event, routed),
    };
  }

  return {
    content: [{ type: "text", text: formatObservedRoutedResult(routed) }],
    details: observedDetails(event, routed),
  };
}

function rawObservedResult(event: any): unknown {
  if (event?.details?.result !== undefined) {
    return event.details.result;
  }
  if (event?.details?.rawResult !== undefined) {
    return event.details.rawResult;
  }
  if (Array.isArray(event?.content)) {
    return { content: event.content };
  }
  if (event?.content !== undefined) {
    return event.content;
  }
  return "";
}

function observedDetails(event: any, routed: any) {
  return {
    ...(event.details && typeof event.details === "object" ? event.details : {}),
    freeflowObservedRouting: {
      route: "observed",
      decisionId: routed.decisionId,
      routingStatus: routed.routing?.status,
      outputId: routed.outputId,
      recordId: routed.recordId,
      persistence: routed.persistence,
      producer: routed.producer,
      risk: routed.risk,
      recovery: routed.recovery,
      failure: routed.failure,
    },
  };
}

function formatObservedRoutedResult(routed: any): string {
  const evidence = Array.isArray(routed.evidence) ? routed.evidence : [];
  const evidenceText = evidence.length > 0
    ? evidence.slice(0, 3).map((packet, index) => [
        `Evidence ${index + 1}${packet.lines ? ` lines ${packet.lines}` : ""}:`,
        "```text",
        packet.excerpt ?? "",
        "```",
      ].join("\n")).join("\n")
    : "No evidence packets returned.";
  const producer = producerLabel(routed.producer);
  const output = routed.outputId ? ` outputId=${routed.outputId}` : "";
  const recovery = routed.recovery?.how ? `\nRecovery: ${routed.recovery.how}` : "";
  const persistence = routed.persistence
    ? `persistence=${routed.persistence.status}; recoverability=${routed.persistence.recoverability}`
    : "persistence=unknown";

  return [
    `Freeflow routed this observed ${routed.host?.toolName ?? "tool"} result.`,
    `Producer: ${producer}; ${persistence}; routing.status=${routed.routing?.status}.${output}`,
    `Reason: ${routed.routing?.reason ?? "Observed output routed."}`,
    routed.summary ? `Summary: ${routed.summary}` : "",
    recovery,
    evidenceText,
  ].filter(Boolean).join("\n");
}

function formatObservedFailOpen(routed: any): string {
  const original = routed.passthrough?.text ?? "";
  return [
    `Freeflow observed-routing warning: ${routed.failure?.message ?? "routing failed"}`,
    "Observed routing failed open; original host output was not shortened or removed.",
    routed.recovery?.how ? `Recovery: ${routed.recovery.how}` : "Recovery: unavailable.",
    "Original output:",
    "```text",
    original,
    "```",
  ].join("\n");
}

function producerLabel(producer: any): string {
  if (!producer) {
    return "unknown";
  }
  return [producer.kind, producer.server, producer.tool, producer.name].filter(Boolean).join(":");
}
