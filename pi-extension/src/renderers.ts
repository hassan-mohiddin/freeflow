import {
  extractTextContent,
  formatStatus,
  oneLine,
  shortenMiddle,
  splitLines,
  statusIcon,
  textComponent,
  themeBold,
  themeFg,
  truncateText,
} from "./utils.js";

export function commandLabel(command) {
  if (Array.isArray(command)) {
    return truncateText(command.join(" "), 120);
  }
  return truncateText(command ?? "...", 120);
}

function retrieveSourceLabel(source) {
  if (!source || source.kind === "repo") {
    return `repo ${shortenMiddle(source?.path ?? ".", 80)}`;
  }
  if (source.kind === "vault") {
    const stream = source.stream ? `:${source.stream}` : "";
    return `vault ${shortenMiddle(source.outputId ?? "...", 48)}${stream}`;
  }
  return oneLine(source.kind ?? "source");
}

function evidenceLabel(evidence) {
  if (!evidence) {
    return "no evidence";
  }
  const source = evidence.source;
  const path = evidence.path ?? (source?.kind === "repo" ? source.path : source?.kind === "vault" ? source.outputId : "evidence");
  const lines = evidence.lines ? `:${evidence.lines}` : "";
  return `${shortenMiddle(path, 90)}${lines}`;
}

function excerptLines(theme, excerpt, indent = "  ", maxLines = 8) {
  const lines = splitLines(String(excerpt ?? ""));
  const shown = lines.slice(0, maxLines).map((line) => `${indent}${themeFg(theme, "toolOutput", truncateText(line, 140))}`);
  const omitted = lines.length - shown.length;
  if (omitted > 0) {
    shown.push(`${indent}${themeFg(theme, "dim", `… ${omitted} more line(s)`)}`);
  }
  return shown;
}

function routeSummaryLine(theme, result) {
  const route = result?.routing?.status ?? "unknown";
  const preserve = result?.preserve ? ` • preserve: ${result.preserve}` : "";
  return `${themeFg(theme, "muted", "routing:")} ${formatStatus(theme, route)}${themeFg(theme, "dim", preserve)}`;
}

function evidenceSourceSummary(source) {
  if (!source || typeof source !== "object") {
    return "unknown";
  }
  if (source.kind === "repo") {
    return `repo ${source.path ?? "."}`;
  }
  if (source.kind === "vault") {
    const stream = source.stream ? `:${source.stream}` : "";
    return `vault ${source.outputId ?? "..."}${stream}`;
  }
  return oneLine(source.kind ?? "source");
}

function runFilterLabel(filters) {
  if (!filters || typeof filters !== "object") {
    return "";
  }
  const parts = [`stream=${filters.stream ?? "selected"}`];
  if (Array.isArray(filters.include) && filters.include.length > 0) {
    parts.push(`include=${filters.include.join("|")}`);
  }
  if (Array.isArray(filters.exclude) && filters.exclude.length > 0) {
    parts.push(`exclude=${filters.exclude.join("|")}`);
  }
  if (filters.flags) {
    parts.push(`flags=${filters.flags}`);
  }
  for (const key of ["head", "tail", "maxLines", "maxBytes"] as const) {
    if (filters[key] !== undefined) {
      parts.push(`${key}=${filters[key]}`);
    }
  }
  if (filters.selectedLines !== undefined && filters.sourceLines !== undefined) {
    parts.push(`selected=${filters.selectedLines}/${filters.sourceLines}`);
  }
  if (filters.fallbackPreservedFailureEvidence) {
    parts.push("fallback=failure-evidence");
  }
  return parts.join(" ");
}

function runScriptFilterLabel(scriptFilter) {
  if (!scriptFilter || typeof scriptFilter !== "object") {
    return "";
  }
  const parts = [`${scriptFilter.language ?? "script"}:${scriptFilter.status ?? "unknown"}`];
  if (scriptFilter.label) {
    parts.push(`label=${scriptFilter.label}`);
  }
  if (scriptFilter.outputId) {
    parts.push(`derived=${scriptFilter.outputId}`);
  }
  if (scriptFilter.failure?.kind) {
    parts.push(`failure=${scriptFilter.failure.kind}`);
  }
  return parts.join(" ");
}

function appendStorageSection(lines, theme, routed, outputId, title = "Storage") {
  const persistence = routed?.persistence;
  const recoveryOutputId = persistence?.recoveryOutputId ?? persistence?.outputId ?? routed?.recovery?.outputId;
  const hasStorage = routed?.decisionId || outputId || routed?.recordId || persistence?.status || recoveryOutputId;
  if (!hasStorage) {
    return;
  }

  lines.push("", themeFg(theme, "toolTitle", title));
  if (routed?.decisionId) {
    lines.push(`  ${themeFg(theme, "muted", "decisionId:")} ${themeFg(theme, "accent", routed.decisionId)}`);
  }
  if (outputId) {
    lines.push(`  ${themeFg(theme, "muted", "outputId:")} ${themeFg(theme, "accent", outputId)}`);
  }
  if (routed?.recordId) {
    lines.push(`  ${themeFg(theme, "muted", "recordId:")} ${themeFg(theme, "accent", routed.recordId)}`);
  }
  if (persistence?.status) {
    lines.push(`  ${themeFg(theme, "muted", "persistence:")} ${persistence.status} / ${persistence.recoverability ?? "unknown"}`);
  }
  if (recoveryOutputId && recoveryOutputId !== outputId) {
    lines.push(`  ${themeFg(theme, "muted", "recoveryOutputId:")} ${themeFg(theme, "accent", recoveryOutputId)}`);
  }
}

function exactRetrieveHintFromEvidence(packet) {
  if (!packet?.lines) {
    return "";
  }
  const source = packet.source;
  if (source?.kind === "vault" && source.outputId) {
    return `action=retrieve source.kind=vault lineRange=${packet.lines} stream=${source.stream ?? "raw"} outputId=${source.outputId}`;
  }
  const path = packet.path ?? (source?.kind === "repo" ? source.path : undefined);
  if (path && source?.kind !== "vault") {
    return `action=retrieve source.kind=repo lineRange=${packet.lines} path=${path}`;
  }
  return "";
}

function firstExactRetrieveHintFromEvidence(evidence) {
  if (!Array.isArray(evidence)) {
    return "";
  }
  for (const packet of evidence) {
    const hint = exactRetrieveHintFromEvidence(packet);
    if (hint) {
      return hint;
    }
  }
  return "";
}

function exactRetrieveHintFromImportantLines(outputId, importantLines) {
  if (!outputId || !Array.isArray(importantLines)) {
    return "";
  }
  const firstSpan = importantLines.find((line) => line?.lines);
  if (!firstSpan) {
    return "";
  }
  return `action=retrieve source.kind=vault lineRange=${firstSpan.lines} stream=${firstSpan.stream ?? "combined"} outputId=${outputId}`;
}

function recoveryStartingPoint(outputId) {
  return outputId ? `freeflow_retrieve source.kind=vault outputId=${outputId} (choose stream + lineRange, or query/expand)` : "";
}

function routerResultFromToolResult(result) {
  return result?.details?.result;
}

function fallbackResultText(result) {
  const text = extractTextContent(result?.content);
  return text ? truncateText(text, 200) : "No Freeflow result details available.";
}

export function renderFreeflowRetrieveCall(args, theme) {
  const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_retrieve"));
  const action = themeFg(theme, "muted", args?.action ?? "query");
  const source = themeFg(theme, "accent", retrieveSourceLabel(args?.source));
  const query = args?.query ? ` ${themeFg(theme, "dim", `\"${truncateText(args.query, 70)}\"`)}` : "";
  return textComponent(`${title} ${action} ${source}${query}`);
}

export function renderFreeflowRunCall(args, theme) {
  const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_run"));
  const command = themeFg(theme, "accent", `$ ${commandLabel(args?.command)}`);
  const extras = [];
  if (args?.preserve) {
    extras.push(`preserve=${args.preserve}`);
  }
  if (args?.timeoutMs !== undefined) {
    extras.push(`timeout=${args.timeoutMs}ms`);
  }
  if (args?.scriptFilter?.language) {
    extras.push(`script=${args.scriptFilter.language}`);
  }
  const suffix = extras.length > 0 ? ` ${themeFg(theme, "dim", `(${extras.join(", ")})`)}` : "";
  return textComponent(`${title} ${command}${suffix}`);
}

function deriveOperationLabel(operation) {
  if (!operation || typeof operation !== "object") {
    return "operation";
  }
  return String(operation.kind ?? "operation");
}

export function renderFreeflowDeriveCall(args, theme) {
  const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_derive"));
  const operation = themeFg(theme, "accent", deriveOperationLabel(args?.operation));
  const source = themeFg(theme, "muted", retrieveSourceLabel(args?.source));
  const preserve = args?.preserve ? ` ${themeFg(theme, "dim", `(preserve=${args.preserve})`)}` : "";
  return textComponent(`${title} ${operation} ${source}${preserve}`);
}

export function renderFreeflowBatchCall(args, theme) {
  const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_batch"));
  const steps = Array.isArray(args?.steps) ? args.steps : [];
  const kinds = steps.slice(0, 4).map((step) => step?.kind ?? "step").join(", ");
  const more = steps.length > 4 ? ` +${steps.length - 4}` : "";
  const concurrency = args?.concurrency ? ` ${themeFg(theme, "dim", `(concurrency=${args.concurrency})`)}` : "";
  return textComponent(`${title} ${themeFg(theme, "accent", `${steps.length} step(s)`)} ${themeFg(theme, "muted", kinds + more)}${concurrency}`);
}

export function renderFreeflowBatchResult(result, { expanded }: any = {}, theme) {
  const routed = routerResultFromToolResult(result);
  if (!routed) {
    return textComponent(fallbackResultText(result));
  }

  const failed = routed.failedCount ?? 0;
  const icon = failed > 0 || routed.toolStatus === "error" ? "✗" : statusIcon(routed.toolStatus);
  const steps = Array.isArray(routed.steps) ? routed.steps : [];
  const lines = [
    `${themeFg(theme, failed > 0 ? "warning" : "success", icon)} ${themeFg(theme, "toolTitle", "freeflow_batch")} ${themeFg(theme, "muted", `${routed.okCount ?? 0}/${routed.stepCount ?? steps.length} ok`)} • ${routeSummaryLine(theme, routed)}`,
  ];
  if (routed.summary) {
    lines.push(themeFg(theme, "muted", truncateText(routed.summary, 160)));
  }
  lines.push(themeFg(theme, "dim", `concurrency=${routed.concurrency ?? "?"} • child outputs suppressed; full child results in details.result.steps`));

  if (!expanded) {
    lines.push(themeFg(theme, "dim", "ctrl+o to expand child step statuses and recovery pointers"));
    return textComponent(lines.join("\n"));
  }

  lines.push("", themeFg(theme, "toolTitle", "Steps"));
  if (steps.length === 0) {
    lines.push(`  ${themeFg(theme, "dim", "No steps returned.")}`);
  } else {
    steps.forEach((step) => {
      const child = step.result;
      const outputId = child?.outputId ?? child?.recovery?.outputId;
      const status = step.status ?? child?.toolStatus ?? "unknown";
      const pieces = [`${step.kind}`, `status=${status}`, `${step.durationMs ?? 0}ms`];
      if (child?.routing?.status) {
        pieces.push(`routing=${child.routing.status}`);
      }
      if (child?.execution?.status) {
        pieces.push(`execution=${child.execution.status}`);
      }
      if (outputId) {
        pieces.push(`outputId=${outputId}`);
      }
      if (Array.isArray(child?.evidence)) {
        pieces.push(`evidence=${child.evidence.length}`);
      }
      if (Array.isArray(child?.importantLines)) {
        pieces.push(`spans=${child.importantLines.length}`);
      }
      lines.push(`  ${themeFg(theme, status === "failed" ? "warning" : "accent", `#${step.index + 1} ${step.id}`)} ${themeFg(theme, "muted", pieces.join(" • "))}`);
      const message = step.error ?? child?.failure?.message ?? child?.summary ?? child?.routing?.reason;
      if (message) {
        lines.push(`    ${truncateText(message, 180)}`);
      }
      if (outputId) {
        lines.push(`    ${themeFg(theme, "muted", "recovery starting point:")} ${recoveryStartingPoint(outputId)}`);
      }
    });
  }

  lines.push("", themeFg(theme, "toolTitle", "Batch recovery"));
  if (routed.recovery?.how) {
    lines.push(`  ${truncateText(routed.recovery.how, 220)}`);
  }
  lines.push(`  ${themeFg(theme, "dim", "Use details.result.steps for complete child routed results; model-visible output intentionally omits child excerpts.")}`);
  return textComponent(lines.join("\n"));
}

export function renderFreeflowStatusCall(args, theme) {
  const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_status"));
  const action = themeFg(theme, "accent", args?.action ?? "status");
  return textComponent(`${title} ${action}`);
}

export function renderFreeflowStatusResult(result, { expanded }: any = {}, theme) {
  const report = routerResultFromToolResult(result);
  if (!report) {
    return textComponent(fallbackResultText(result));
  }

  const warnings = Array.isArray(report.configWarnings) ? report.configWarnings : [];
  const recommendations = Array.isArray(report.migration?.recommendations) ? report.migration.recommendations : [];
  const providerAvailability = Array.isArray(report.providers?.availability) ? report.providers.availability : [];
  const router = report.effectiveConfig?.outputRouter ?? {};
  const capture = report.effectiveConfig?.capture ?? {};
  const observedRouting = report.observedRouting ?? report.effectiveConfig?.observedRouting ?? {};
  const icon = statusIcon(report.toolStatus);
  const lines = [
    `${themeFg(theme, "success", icon)} ${themeFg(theme, "toolTitle", "freeflow_status")} ${themeFg(theme, "muted", report.action ?? "status")} • router ${formatStatus(theme, router.enabled === false ? "off" : "ok")} ${themeFg(theme, "dim", router.profile ?? "standard")}`,
    `${themeFg(theme, "muted", "vault:")} ${themeFg(theme, "accent", shortenMiddle(report.vault?.root ?? "unknown", 80))} ${themeFg(theme, "dim", report.vault?.writability?.status ?? "unknown")}`,
    `${themeFg(theme, "muted", "capture:")} mediated=${capture.freeflowMediated ?? "raw"} direct-host=${capture.directHostTools ?? "off"} • observed=${observedRouting.enabled ? "on" : "off"} • providers=${providerAvailability.length} • warnings=${warnings.length} • migrations=${recommendations.length}`,
  ];

  if (!expanded) {
    lines.push(themeFg(theme, "dim", "ctrl+o to expand effective config, providers, warnings, and migration recommendations"));
    return textComponent(lines.join("\n"));
  }

  lines.push("", themeFg(theme, "toolTitle", "Mode"));
  lines.push(`  ${themeFg(theme, "muted", "effective:")} ${report.mode?.effectiveMode ?? "workflow"}`);
  lines.push(`  ${themeFg(theme, "muted", "default:")} ${report.mode?.defaultMode ?? "workflow"}`);

  lines.push("", themeFg(theme, "toolTitle", "Router"));
  lines.push(`  ${themeFg(theme, "muted", "enabled:")} ${String(router.enabled !== false)}`);
  lines.push(`  ${themeFg(theme, "muted", "profile:")} ${router.profile ?? "standard"}`);
  lines.push(`  ${themeFg(theme, "muted", "postToolRouting:")} ${router.postToolRouting ?? "off"}`);
  lines.push(`  ${themeFg(theme, "muted", "storagePolicy:")} ${router.storagePolicy ?? "hybrid-dedupe"}`);
  if (router.thresholds) {
    lines.push(`  ${themeFg(theme, "muted", "thresholds:")} ${JSON.stringify(router.thresholds)}`);
  }

  lines.push("", themeFg(theme, "toolTitle", "Capture"));
  lines.push(`  ${themeFg(theme, "muted", "freeflowMediated:")} ${capture.freeflowMediated ?? "raw"}`);
  lines.push(`  ${themeFg(theme, "muted", "directHostTools:")} ${capture.directHostTools ?? "off"}`);
  if (report.capture?.recoverabilityDefault) {
    lines.push(`  ${truncateText(report.capture.recoverabilityDefault, 180)}`);
  }

  const vaultIndex = report.vaultIndex;
  if (vaultIndex) {
    lines.push("", themeFg(theme, "toolTitle", "Vault index"));
    lines.push(`  ${themeFg(theme, "muted", "engine:")} ${vaultIndex.engine ?? "local-json-sidecar"}`);
    lines.push(`  ${themeFg(theme, "muted", "available:")} ${String(Boolean(vaultIndex.available))} degraded=${String(Boolean(vaultIndex.degraded))} stale=${String(Boolean(vaultIndex.stale))} rebuildRecommended=${String(Boolean(vaultIndex.rebuildRecommended))}`);
    lines.push(`  ${themeFg(theme, "muted", "entries:")} ${vaultIndex.entryCount ?? 0} text=${vaultIndex.textEntryCount ?? 0} metadata=${vaultIndex.metadataOnlyEntryCount ?? 0}`);
    if (vaultIndex.lastError) {
      lines.push(`  ${themeFg(theme, "warning", `lastError: ${truncateText(vaultIndex.lastError, 160)}`)}`);
    }
  }

  const scriptDerive = report.scriptDerive;
  if (scriptDerive) {
    lines.push("", themeFg(theme, "toolTitle", "Script derive"));
    lines.push(`  ${themeFg(theme, "muted", "enabled:")} ${String(Boolean(scriptDerive.enabled))}`);
    lines.push(`  ${themeFg(theme, "muted", "adapter:")} ${scriptDerive.adapterStatus ?? "unavailable"}`);
    lines.push(`  ${themeFg(theme, "muted", "languages:")} ${(scriptDerive.configuredLanguages ?? []).join(", ") || "none"}`);
    lines.push(`  ${themeFg(theme, "muted", "network:")} ${scriptDerive.network ?? "off"}`);
    lines.push(`  ${themeFg(theme, "muted", "rawScriptPersistence:")} ${scriptDerive.rawScriptPersistence ?? "disabled"}`);
  }

  lines.push("", themeFg(theme, "toolTitle", "Observed routing"));
  lines.push(`  ${themeFg(theme, "muted", "enabled:")} ${String(Boolean(observedRouting.enabled))}`);
  lines.push(`  ${themeFg(theme, "muted", "onRoutingFailure:")} ${observedRouting.onRoutingFailure ?? "fail-open"}`);
  lines.push(`  ${themeFg(theme, "muted", "host:")} ${observedRouting.host?.name ?? "pi"} outputReplacement=${observedRouting.host?.outputReplacement ?? "available"}`);
  lines.push(`  ${themeFg(theme, "muted", "mcp servers:")} ${observedRouting.mcp?.configuredServerCount ?? 0}`);
  if (observedRouting.web || observedRouting.fetch || observedRouting.codeSearch) {
    lines.push(`  ${themeFg(theme, "muted", "web/fetch/codeSearch:")} web=${observedRouting.web?.enabled ? "on" : "off"} fetch=${observedRouting.fetch?.enabled ? "on" : "off"} codeSearch=${observedRouting.codeSearch?.enabled ? "on" : "off"}`);
  }

  lines.push("", themeFg(theme, "toolTitle", "Providers"));
  if (providerAvailability.length === 0) {
    lines.push(`  ${themeFg(theme, "dim", "No providers enabled in config.")}`);
  } else {
    for (const provider of providerAvailability) {
      lines.push(`  ${themeFg(theme, "accent", provider.id)} ${formatStatus(theme, provider.status)} ${themeFg(theme, "dim", truncateText(provider.reason, 140))}`);
    }
  }
  const custom = report.providers?.customManifests;
  if (custom) {
    lines.push(`  ${themeFg(theme, "muted", "custom manifests:")} valid=${custom.validCount ?? 0} invalid=${custom.invalidCount ?? 0} total=${custom.total ?? 0}`);
  }

  if (warnings.length > 0) {
    lines.push("", themeFg(theme, "toolTitle", "Warnings"));
    warnings.slice(0, 8).forEach((warning) => lines.push(`  ${themeFg(theme, "warning", truncateText(warning, 180))}`));
  }

  if (recommendations.length > 0) {
    lines.push("", themeFg(theme, "toolTitle", "Migration recommendations"));
    recommendations.slice(0, 8).forEach((item) => lines.push(`  ${themeFg(theme, "accent", item.path)} ${themeFg(theme, "muted", item.action)} — ${truncateText(item.message, 160)}`));
    lines.push(`  ${themeFg(theme, "dim", "No config was rewritten; confirmation is required before applying recommendations.")}`);
  }

  return textComponent(lines.join("\n"));
}

export function renderFreeflowRetrieveResult(result, { expanded }: any = {}, theme) {
  const routed = routerResultFromToolResult(result);
  if (!routed) {
    return textComponent(fallbackResultText(result));
  }

  const evidence = Array.isArray(routed.evidence) ? routed.evidence : [];
  const firstEvidence = evidence[0];
  const icon = statusIcon(routed.toolStatus);
  const lines = [
    `${themeFg(theme, "success", icon)} ${themeFg(theme, "toolTitle", "freeflow_retrieve")} ${themeFg(theme, "muted", `${evidence.length} evidence packet(s)`)} • ${routeSummaryLine(theme, routed)}`,
  ];

  if (firstEvidence) {
    lines.push(`${themeFg(theme, "accent", evidenceLabel(firstEvidence))}${firstEvidence.expandable ? themeFg(theme, "dim", " • expandable") : ""}`);
  } else {
    lines.push(themeFg(theme, "warning", truncateText(routed.routing?.reason ?? "No matching evidence returned.", 140)));
  }

  if (!expanded) {
    lines.push(themeFg(theme, "dim", "ctrl+o to expand evidence and recovery details"));
    return textComponent(lines.join("\n"));
  }

  lines.push("", themeFg(theme, "toolTitle", "Source"));
  lines.push(`  ${themeFg(theme, "accent", retrieveSourceLabel(routed.source))}`);
  if (routed.preserve) {
    lines.push(`  ${themeFg(theme, "muted", "preserve:")} ${routed.preserve}`);
  }

  appendStorageSection(lines, theme, routed, routed.outputId || routed.recovery?.outputId);

  lines.push("", themeFg(theme, "toolTitle", "Routing"));
  lines.push(`  ${themeFg(theme, "muted", "toolStatus:")} ${formatStatus(theme, routed.toolStatus)}`);
  lines.push(`  ${themeFg(theme, "muted", "routing.status:")} ${formatStatus(theme, routed.routing?.status)}`);
  lines.push(`  ${themeFg(theme, "muted", "route:")} ${routed.routing?.route ?? "retrieve"}`);
  if (routed.routing?.reason) {
    lines.push(`  ${themeFg(theme, "muted", "reason:")} ${truncateText(routed.routing.reason, 160)}`);
  }

  lines.push("", themeFg(theme, "toolTitle", "Evidence"));
  if (evidence.length === 0) {
    lines.push(`  ${themeFg(theme, "dim", "No evidence packets returned.")}`);
  } else {
    evidence.forEach((packet, index) => {
      lines.push(`  ${themeFg(theme, "accent", `#${index + 1} ${evidenceLabel(packet)}`)} ${themeFg(theme, "dim", `window=${packet.window}`)}`);
      if (packet.id) {
        lines.push(`    ${themeFg(theme, "muted", "evidenceId:")} ${themeFg(theme, "accent", packet.id)}`);
      }
      if (packet.source) {
        lines.push(`    ${themeFg(theme, "muted", "source:")} ${evidenceSourceSummary(packet.source)}`);
      }
      if (packet.expandable !== undefined) {
        lines.push(`    ${themeFg(theme, "muted", "expandable:")} ${String(Boolean(packet.expandable))}`);
      }
      const exactHint = exactRetrieveHintFromEvidence(packet);
      if (exactHint) {
        lines.push(`    ${themeFg(theme, "muted", "exact retrieve:")} ${exactHint}`);
      }
      if (packet.why) {
        lines.push(`    ${themeFg(theme, "muted", "why:")} ${truncateText(packet.why, 160)}`);
      }
      lines.push(...excerptLines(theme, packet.excerpt, "    ", 8));
    });
  }

  if (routed.recovery?.how) {
    lines.push("", themeFg(theme, "toolTitle", "Recovery"));
    lines.push(`  ${truncateText(routed.recovery.how, 180)}`);
    if (routed.recovery.outputId) {
      lines.push(`  ${themeFg(theme, "muted", "outputId:")} ${themeFg(theme, "accent", routed.recovery.outputId)}`);
    }
    const exactHint = firstExactRetrieveHintFromEvidence(evidence);
    if (exactHint) {
      lines.push(`  ${themeFg(theme, "muted", "exact retrieve:")} ${exactHint}`);
    } else if (routed.recovery.outputId) {
      lines.push(`  ${themeFg(theme, "muted", "recovery starting point:")} ${recoveryStartingPoint(routed.recovery.outputId)}`);
    }
    if (routed.recovery.evidenceId) {
      lines.push(`  ${themeFg(theme, "muted", "evidenceId:")} ${themeFg(theme, "accent", routed.recovery.evidenceId)}`);
      lines.push(`  ${themeFg(theme, "muted", "expand hint:")} freeflow_retrieve action=expand evidenceId=${routed.recovery.evidenceId}`);
    }
  }

  return textComponent(lines.join("\n"));
}

export function renderFreeflowRunResult(result, { expanded }: any = {}, theme, context: any = {}) {
  const routed = routerResultFromToolResult(result);
  if (!routed) {
    return textComponent(fallbackResultText(result));
  }

  const executionStatus = routed.execution?.status ?? routed.toolStatus;
  const outputId = routed.outputId;
  const exactRecoveryOutputId = routed.persistence?.recoverability === "exact" ? outputId : routed.recovery?.outputId;
  const icon = statusIcon(executionStatus);
  const importantLines = Array.isArray(routed.importantLines) ? routed.importantLines : [];
  const lines = [
    `${themeFg(theme, executionStatus === "failed" ? "error" : "success", icon)} ${themeFg(theme, "toolTitle", "freeflow_run")} ${themeFg(theme, "muted", "execution:")} ${formatStatus(theme, executionStatus)} • ${routeSummaryLine(theme, routed)}`,
  ];

  const statusParts = [];
  if (routed.execution?.exitCode !== undefined && routed.execution?.exitCode !== null) {
    statusParts.push(`exit ${routed.execution.exitCode}`);
  }
  if (routed.execution?.durationMs !== undefined) {
    statusParts.push(`${routed.execution.durationMs}ms`);
  }
  if (outputId) {
    statusParts.push(`${routed.persistence?.recoverability === "metadata_only" ? "metadataId" : "outputId"} ${outputId}`);
  }
  if (exactRecoveryOutputId && exactRecoveryOutputId !== outputId) {
    statusParts.push(`exact ${exactRecoveryOutputId}`);
  }
  if (routed.scriptFilter?.outputId) {
    statusParts.push(`derived ${routed.scriptFilter.outputId}`);
  }
  if (routed.parser?.name) {
    statusParts.push(`parser ${routed.parser.name} ${Number(routed.parser.confidence ?? 0).toFixed(2)}`);
  }
  if (statusParts.length > 0) {
    lines.push(themeFg(theme, "accent", statusParts.join(" • ")));
  }
  if (routed.summary) {
    lines.push(themeFg(theme, "muted", truncateText(routed.summary, 140)));
  }
  lines.push(themeFg(theme, "dim", `${importantLines.length} important span(s) • ${exactRecoveryOutputId ? (routed.scriptFilter?.outputId ? "raw and script output recoverable from vault" : "raw output recoverable from vault") : "metadata-only record; exact raw output not vaulted"}`));

  if (!expanded) {
    lines.push(themeFg(theme, "dim", "ctrl+o to expand status, evidence, and vault recovery"));
    return textComponent(lines.join("\n"));
  }

  lines.push("", themeFg(theme, "toolTitle", "Command"));
  lines.push(`  ${themeFg(theme, "accent", `$ ${commandLabel(context.args?.command)}`)}`);

  lines.push("", themeFg(theme, "toolTitle", "Status"));
  lines.push(`  ${themeFg(theme, "muted", "toolStatus:")} ${formatStatus(theme, routed.toolStatus)}`);
  lines.push(`  ${themeFg(theme, "muted", "execution.status:")} ${formatStatus(theme, routed.execution?.status)}`);
  lines.push(`  ${themeFg(theme, "muted", "routing.status:")} ${formatStatus(theme, routed.routing?.status)}`);
  if (routed.execution?.exitCode !== undefined) {
    lines.push(`  ${themeFg(theme, "muted", "exitCode:")} ${routed.execution.exitCode}`);
  }
  if (routed.execution?.durationMs !== undefined) {
    lines.push(`  ${themeFg(theme, "muted", "durationMs:")} ${routed.execution.durationMs}`);
  }

  appendStorageSection(lines, theme, routed, outputId);

  if (routed.routing?.reason || routed.summary) {
    lines.push("", themeFg(theme, "toolTitle", "Routing"));
    if (routed.summary) {
      lines.push(`  ${themeFg(theme, "muted", "summary:")} ${truncateText(routed.summary, 160)}`);
    }
    if (routed.routing?.reason) {
      lines.push(`  ${themeFg(theme, "muted", "reason:")} ${truncateText(routed.routing.reason, 180)}`);
    }
  }

  if (routed.filters) {
    lines.push("", themeFg(theme, "toolTitle", "Filters"));
    lines.push(`  ${truncateText(runFilterLabel(routed.filters), 220)}`);
  }

  if (routed.scriptFilter) {
    lines.push("", themeFg(theme, "toolTitle", "Script filter"));
    lines.push(`  ${truncateText(runScriptFilterLabel(routed.scriptFilter), 220)}`);
    if (routed.scriptFilter.rawOutputId) {
      lines.push(`  ${themeFg(theme, "muted", "rawOutputId:")} ${themeFg(theme, "accent", routed.scriptFilter.rawOutputId)}`);
    }
    if (Array.isArray(routed.scriptFilter.sourceAliases)) {
      lines.push(`  ${themeFg(theme, "muted", "sources:")} ${routed.scriptFilter.sourceAliases.join(", ")}`);
    }
    if (routed.scriptFilter.operation) {
      lines.push(`  ${themeFg(theme, "muted", "operation:")} ${truncateText(JSON.stringify(routed.scriptFilter.operation), 180)}`);
    }
    if (routed.scriptFilter.failure?.message) {
      lines.push(`  ${themeFg(theme, "warning", truncateText(routed.scriptFilter.failure.message, 180))}`);
    }
  }

  if (routed.parser?.name) {
    lines.push("", themeFg(theme, "toolTitle", "Parser"));
    lines.push(`  ${themeFg(theme, "muted", "name:")} ${routed.parser.name}`);
    lines.push(`  ${themeFg(theme, "muted", "confidence:")} ${Number(routed.parser.confidence ?? 0).toFixed(2)}`);
    lines.push(`  ${themeFg(theme, "muted", "fidelity:")} ${routed.parser.fidelity ?? "exact"}`);
    lines.push(`  ${themeFg(theme, "muted", "compressed:")} ${String(Boolean(routed.parser.compressed))}`);
    if (routed.parser.counts && Object.keys(routed.parser.counts).length > 0) {
      lines.push(`  ${themeFg(theme, "muted", "counts:")} ${truncateText(JSON.stringify(routed.parser.counts), 160)}`);
    }
    if (Array.isArray(routed.parser.references) && routed.parser.references.length > 0) {
      const refs = routed.parser.references.slice(0, 3).map((ref) => `${ref.path}${ref.line ? `:${ref.line}${ref.column ? `:${ref.column}` : ""}` : ""}${ref.code ? ` ${ref.code}` : ""}`);
      lines.push(`  ${themeFg(theme, "muted", "references:")} ${truncateText(refs.join(", "), 180)}`);
    }
  }

  lines.push("", themeFg(theme, "toolTitle", "Evidence"));
  if (importantLines.length === 0) {
    lines.push(`  ${themeFg(theme, "dim", "No important lines selected.")}`);
  } else {
    importantLines.forEach((line, index) => {
      lines.push(`  ${themeFg(theme, "accent", `#${index + 1} ${line.stream} lines ${line.lines}`)}`);
      lines.push(...excerptLines(theme, line.excerpt, "    ", 8));
    });
  }

  if (routed.recovery?.how || outputId) {
    lines.push("", themeFg(theme, "toolTitle", "Vault recovery"));
    if (outputId) {
      lines.push(`  ${themeFg(theme, "muted", "outputId:")} ${themeFg(theme, "accent", outputId)}`);
    }
    if (routed.recovery?.how) {
      lines.push(`  ${truncateText(routed.recovery.how, 180)}`);
    }
    const evidenceOutputId = routed.scriptFilter?.outputId ?? exactRecoveryOutputId;
    const exactHint = exactRetrieveHintFromImportantLines(evidenceOutputId, importantLines);
    if (exactHint) {
      const hint = routed.scriptFilter?.outputId ? exactHint.replace(/stream=(stdout|stderr|combined)/, "stream=raw") : exactHint;
      lines.push(`  ${themeFg(theme, "muted", "exact retrieve:")} ${hint}`);
      if (routed.scriptFilter?.outputId && outputId) {
        lines.push(`  ${themeFg(theme, "muted", "raw command starting point:")} ${recoveryStartingPoint(outputId)}`);
      }
    } else if (exactRecoveryOutputId) {
      lines.push(`  ${themeFg(theme, "muted", "recovery starting point:")} ${recoveryStartingPoint(exactRecoveryOutputId)}`);
    }
    lines.push(`  ${themeFg(theme, "dim", "Full structured result remains available in details.result.")}`);
  }

  return textComponent(lines.join("\n"));
}

export function renderFreeflowDeriveResult(result, { expanded }: any = {}, theme) {
  const routed = routerResultFromToolResult(result);
  if (!routed) {
    return textComponent(fallbackResultText(result));
  }

  const outputId = routed.outputId || routed.recovery?.outputId;
  const operation = deriveOperationLabel(routed.operation ?? { kind: routed.producer?.name });
  const failed = routed.failure || routed.toolStatus === "error" || routed.routing?.status === "failed";
  const icon = failed ? "✗" : statusIcon(routed.toolStatus);
  const evidence = Array.isArray(routed.evidence) ? routed.evidence : [];
  const sourceLabel = retrieveSourceLabel(routed.source);
  const lines = [
    `${themeFg(theme, failed ? "error" : "success", icon)} ${themeFg(theme, "toolTitle", "freeflow_derive")} ${themeFg(theme, "accent", operation)} • ${routeSummaryLine(theme, routed)}`,
  ];

  const statusParts = [];
  if (outputId) {
    statusParts.push(`outputId ${outputId}`);
  }
  if (routed.recordId) {
    statusParts.push(`recordId ${routed.recordId}`);
  }
  if (routed.persistence?.status) {
    statusParts.push(`persistence ${routed.persistence.status}/${routed.persistence.recoverability}`);
  }
  if (routed.source?.outputId) {
    statusParts.push(`source ${routed.source.outputId}${routed.source.stream ? `:${routed.source.stream}` : ""}`);
  }
  if (statusParts.length > 0) {
    lines.push(themeFg(theme, "accent", statusParts.join(" • ")));
  }

  if (routed.failure?.message) {
    lines.push(themeFg(theme, "warning", `${routed.failure.kind}: ${truncateText(routed.failure.message, 140)}`));
  } else if (routed.summary) {
    lines.push(themeFg(theme, "muted", truncateText(routed.summary, 140)));
  }
  lines.push(themeFg(theme, "dim", `${evidence.length} evidence packet(s)${outputId ? " • derived output recoverable from vault" : ""}`));

  if (!expanded) {
    lines.push(themeFg(theme, "dim", "ctrl+o to expand source, operation, lineage, evidence, and recovery details"));
    return textComponent(lines.join("\n"));
  }

  lines.push("", themeFg(theme, "toolTitle", "Status"));
  lines.push(`  ${themeFg(theme, "muted", "toolStatus:")} ${formatStatus(theme, routed.toolStatus)}`);
  if (routed.deriveExecution?.status) {
    lines.push(`  ${themeFg(theme, "muted", "deriveExecution.status:")} ${formatStatus(theme, routed.deriveExecution.status)}`);
  }
  lines.push(`  ${themeFg(theme, "muted", "routing.status:")} ${formatStatus(theme, routed.routing?.status)}`);
  if (routed.persistence?.status) {
    lines.push(`  ${themeFg(theme, "muted", "persistence:")} ${routed.persistence.status} / ${routed.persistence.recoverability}`);
  }
  if (routed.routing?.reason) {
    lines.push(`  ${themeFg(theme, "muted", "reason:")} ${truncateText(routed.routing.reason, 180)}`);
  }

  appendStorageSection(lines, theme, routed, outputId);

  lines.push("", themeFg(theme, "toolTitle", "Source"));
  lines.push(`  ${themeFg(theme, "accent", sourceLabel)}`);

  lines.push("", themeFg(theme, "toolTitle", "Operation"));
  if (routed.operation) {
    lines.push(`  ${truncateText(JSON.stringify(routed.operation), 220)}`);
  } else {
    lines.push(`  ${themeFg(theme, "dim", operation)}`);
  }

  if (routed.lineage) {
    lines.push("", themeFg(theme, "toolTitle", "Lineage"));
    if (Array.isArray(routed.lineage.sourceOutputIds)) {
      lines.push(`  ${themeFg(theme, "muted", "sourceOutputIds:")} ${routed.lineage.sourceOutputIds.join(", ")}`);
    }
    if (Array.isArray(routed.lineage.sourceRecordIds)) {
      lines.push(`  ${themeFg(theme, "muted", "sourceRecordIds:")} ${routed.lineage.sourceRecordIds.join(", ")}`);
    }
    if (routed.lineage.operation) {
      lines.push(`  ${themeFg(theme, "muted", "operation:")} ${routed.lineage.operation}`);
    }
    if (routed.lineage.operationHash) {
      lines.push(`  ${themeFg(theme, "muted", "operationHash:")} ${shortenMiddle(routed.lineage.operationHash, 80)}`);
    }
  }

  lines.push("", themeFg(theme, "toolTitle", "Evidence"));
  if (evidence.length === 0) {
    lines.push(`  ${themeFg(theme, "dim", "No evidence packets returned.")}`);
  } else {
    evidence.forEach((packet, index) => {
      lines.push(`  ${themeFg(theme, "accent", `#${index + 1} ${evidenceLabel(packet)}`)} ${themeFg(theme, "dim", `window=${packet.window}`)}`);
      if (packet.id) {
        lines.push(`    ${themeFg(theme, "muted", "evidenceId:")} ${themeFg(theme, "accent", packet.id)}`);
      }
      if (packet.source) {
        lines.push(`    ${themeFg(theme, "muted", "source:")} ${evidenceSourceSummary(packet.source)}`);
      }
      if (packet.expandable !== undefined) {
        lines.push(`    ${themeFg(theme, "muted", "expandable:")} ${String(Boolean(packet.expandable))}`);
      }
      const exactHint = exactRetrieveHintFromEvidence(packet);
      if (exactHint) {
        lines.push(`    ${themeFg(theme, "muted", "exact retrieve:")} ${exactHint}`);
      }
      if (packet.why) {
        lines.push(`    ${themeFg(theme, "muted", "why:")} ${truncateText(packet.why, 160)}`);
      }
      lines.push(...excerptLines(theme, packet.excerpt, "    ", 8));
    });
  }

  if (routed.recovery?.how || outputId) {
    lines.push("", themeFg(theme, "toolTitle", "Recovery"));
    if (outputId) {
      lines.push(`  ${themeFg(theme, "muted", "outputId:")} ${themeFg(theme, "accent", outputId)}`);
    }
    if (routed.recovery?.how) {
      lines.push(`  ${truncateText(routed.recovery.how, 180)}`);
    }
    const exactHint = firstExactRetrieveHintFromEvidence(evidence);
    if (exactHint) {
      lines.push(`  ${themeFg(theme, "muted", "exact retrieve:")} ${exactHint}`);
    } else if (outputId) {
      lines.push(`  ${themeFg(theme, "muted", "recovery starting point:")} ${recoveryStartingPoint(outputId)}`);
    }
  }

  return textComponent(lines.join("\n"));
}
