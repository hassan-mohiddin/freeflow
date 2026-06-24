const BUILT_IN_PI_PRODUCERS = {
  web_search: {
    configKey: "web",
    producer: { kind: "web", tool: "web_search" },
    risk: { classification: "read", source: "manifest", reason: "Pi web_search is a read-only evidence producer." },
  },
  fetch_content: {
    configKey: "fetch",
    producer: { kind: "fetch", tool: "fetch_content" },
    risk: { classification: "read", source: "manifest", reason: "Pi fetch_content is a read-only evidence producer." },
  },
  code_search: {
    configKey: "codeSearch",
    producer: { kind: "code_search", tool: "code_search" },
    risk: { classification: "read", source: "manifest", reason: "Pi code_search is a read-only evidence producer." },
  },
} as const;

const READ_VERBS = [
  "get",
  "list",
  "search",
  "fetch",
  "read",
  "query",
  "find",
  "describe",
  "diagnostic",
  "diagnostics",
  "overview",
  "lookup",
  "show",
];

const WRITE_VERBS = [
  "create",
  "update",
  "delete",
  "remove",
  "patch",
  "post",
  "put",
  "deploy",
  "restart",
  "rename",
  "mutate",
  "set",
  "write",
  "send",
  "transition",
  "close",
  "merge",
  "rerun",
  "cancel",
];

export function resolvePiObservedRoutingDecision(event: any, observedRoutingConfig: any) {
  const host = { name: "pi", toolName: typeof event?.toolName === "string" ? event.toolName : "unknown" };

  if (!observedRoutingConfig || observedRoutingConfig.enabled !== true) {
    return { route: false, reason: "observedRouting.enabled is not true." };
  }

  const mcpProducer = identifyPiMcpProducer(event);
  if (mcpProducer) {
    const serverConfig = observedRoutingConfig.mcp?.servers?.[mcpProducer.server];
    if (!serverConfig?.enabled) {
      return { route: false, reason: `MCP server ${mcpProducer.server} is not enabled for observed routing.` };
    }
    return {
      route: true,
      host,
      producer: mcpProducer,
      persistence: serverConfig.persistence,
      risk: classifyObservedProducerRisk(mcpProducer, event),
    };
  }

  const builtIn = identifyBuiltInPiProducer(event);
  if (builtIn) {
    const producerConfig = observedRoutingConfig[builtIn.configKey];
    if (!producerConfig?.enabled) {
      return { route: false, reason: `Pi ${host.toolName} observed routing is not enabled.` };
    }
    return {
      route: true,
      host,
      producer: { ...builtIn.producer },
      persistence: producerConfig.persistence,
      risk: { ...builtIn.risk },
    };
  }

  return { route: false, reason: `Pi tool ${host.toolName} is not an observed-routing producer.` };
}

export function identifyPiMcpProducer(event: any) {
  const toolName = typeof event?.toolName === "string" ? event.toolName : "";
  const input = isRecord(event?.input) ? event.input : {};
  const details = isRecord(event?.details) ? event.details : {};
  const detailMcp = isRecord(details.mcp) ? details.mcp : {};
  const inputProducer = isRecord(input.producer) ? input.producer : {};
  const detailProducer = isRecord(details.producer) ? details.producer : {};
  const split = splitMcpToolName(toolName);

  const server = firstString(
    input.server,
    input.mcpServer,
    inputProducer.server,
    details.server,
    detailMcp.server,
    detailProducer.server,
    split?.server,
  );
  const tool = firstString(
    input.tool,
    input.name,
    inputProducer.tool,
    details.tool,
    detailMcp.tool,
    detailProducer.tool,
    split?.tool,
  );

  if (!server || !tool) {
    return undefined;
  }

  if (toolName !== "mcp" && !toolName.startsWith("mcp__") && !detailMcp.server && detailProducer.kind !== "mcp" && inputProducer.kind !== "mcp") {
    return undefined;
  }

  return { kind: "mcp", server, tool };
}

export function identifyBuiltInPiProducer(event: any) {
  const toolName = typeof event?.toolName === "string" ? event.toolName : "";
  return BUILT_IN_PI_PRODUCERS[toolName as keyof typeof BUILT_IN_PI_PRODUCERS];
}

export function classifyObservedProducerRisk(producer: any, event?: any) {
  const configured = configuredRisk(event);
  if (configured) {
    return configured;
  }

  const annotation = mcpAnnotationRisk(event);
  if (annotation) {
    return annotation;
  }

  if (producer?.kind === "web" || producer?.kind === "fetch" || producer?.kind === "code_search") {
    return { classification: "read", source: "manifest", reason: `${producer.kind} is treated as a read-only Pi evidence producer.` };
  }

  const tool = typeof producer?.tool === "string" ? producer.tool : "";
  if (matchesVerb(tool, WRITE_VERBS)) {
    return { classification: "write", source: "heuristic", reason: `MCP tool name ${tool} matched a write-like verb heuristic.` };
  }
  if (matchesVerb(tool, READ_VERBS)) {
    return { classification: "read", source: "heuristic", reason: `MCP tool name ${tool} matched a read-like verb heuristic.` };
  }

  return { classification: "unknown", source: "unknown", reason: "No configured risk, MCP annotation, manifest entry, or deterministic name heuristic matched." };
}

function configuredRisk(event: any) {
  const candidate = event?.details?.freeflow?.risk ?? event?.details?.observedRouting?.risk;
  if (!isRecord(candidate)) {
    return undefined;
  }
  if (!["read", "write", "unknown"].includes(String(candidate.classification))) {
    return undefined;
  }
  return {
    classification: candidate.classification,
    source: "configured",
    reason: typeof candidate.reason === "string" ? candidate.reason : "Configured observed producer risk override.",
  };
}

function mcpAnnotationRisk(event: any) {
  const annotations = event?.details?.mcp?.annotations ?? event?.details?.annotations;
  if (!isRecord(annotations)) {
    return undefined;
  }
  if (annotations.destructiveHint === true || annotations.write === true || annotations.mutating === true) {
    return { classification: "write", source: "mcp_annotation", reason: "MCP annotations indicate a mutating/destructive operation." };
  }
  if (annotations.readOnlyHint === true || annotations.readOnly === true) {
    return { classification: "read", source: "mcp_annotation", reason: "MCP annotations indicate a read-only operation." };
  }
  return undefined;
}

function splitMcpToolName(toolName: string): { server: string; tool: string } | undefined {
  if (!toolName.startsWith("mcp__")) {
    return undefined;
  }
  const parts = toolName.split("__");
  if (parts.length < 3) {
    return undefined;
  }
  return { server: parts[1], tool: parts.slice(2).join("__") };
}

function matchesVerb(toolName: string, verbs: readonly string[]): boolean {
  const normalized = toolName.toLowerCase();
  return verbs.some((verb) => {
    const escaped = verb.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    return new RegExp(`(^|[_-])${escaped}([_-]|$)`).test(normalized);
  });
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
