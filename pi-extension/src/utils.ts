import { createHash } from "node:crypto";

export function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function getRouterSessionId(ctx) {
  return ctx.sessionManager?.getSessionId?.() ?? `pi_${stableHash(ctx.cwd).slice(0, 16)}`;
}

export function routedToolText(result) {
  return JSON.stringify(result, null, 2);
}

export function compactBatchToolText(result) {
  const lines = [row("freeflow_batch", result?.routing?.status ?? result?.toolStatus ?? "unknown", `steps=${result?.stepCount ?? 0}`, `ok=${result?.okCount ?? 0}`, `failed=${result?.failedCount ?? 0}`, `c=${result?.concurrency ?? "?"}`)];
  if (result?.summary) {
    lines.push(row("s", truncateRawLine(result.summary, 220)));
  } else if (result?.routing?.reason) {
    lines.push(row("why", truncateRawLine(result.routing.reason, 220)));
  }

  const queries = Array.isArray(result?.queries) ? result.queries : [];
  queries.slice(0, 5).forEach((answer) => {
    lines.push(row("q", answer?.status ?? "query", truncateRawLine(answer?.query ?? "query", 120), truncateRawLine(answer?.summary ?? "", 700)));
  });
  appendOmittedRow(lines, "q", queries.length, 5, "details.result.queries");

  const steps = Array.isArray(result?.steps) ? result.steps : [];
  steps.slice(0, 8).forEach((step) => lines.push(compactBatchStepLine(step)));
  appendOmittedRow(lines, "step", steps.length, 8, "details.result.steps");
  lines.push(row("details", queries.length > 0 ? "details.result steps+queries" : "details.result.steps"));
  return lines.join("\n");
}

export function compactRunToolText(result) {
  const executionStatus = result?.execution?.status ?? result?.toolStatus ?? "unknown";
  const outputId = result?.outputId ?? result?.recovery?.outputId;
  const header = ["freeflow_run", executionStatus];
  if (result?.execution?.exitCode !== undefined && result?.execution?.exitCode !== null) header.push(`exit=${result.execution.exitCode}`);
  if (result?.routing?.status) header.push(`route=${result.routing.status}`);
  if (result?.parser?.name) header.push(`parser=${result.parser.name}`);
  const counts = compactParserCounts(result?.parser?.counts);
  if (counts) header.push(counts);
  if (outputId) header.push(`${result?.persistence?.recoverability === "exact" ? "raw" : "metadata"}=${outputId}`);
  if (result?.persistence?.recoverability !== "exact" && result?.recovery?.outputId) header.push(`exact=${result.recovery.outputId}`);
  if (result?.scriptFilter?.outputId) header.push(`derived=${result.scriptFilter.outputId}`);

  const lines = [row(...header)];
  if (result?.summary) lines.push(row("s", truncateRawLine(result.summary, 220)));
  const filterText = compactRunFilterText(result?.filters);
  if (filterText) lines.push(row("filter", filterText));
  const scriptFilterText = compactRunScriptFilterText(result?.scriptFilter);
  if (scriptFilterText) lines.push(row("script", scriptFilterText));

  const importantLines = Array.isArray(result?.importantLines) ? result.importantLines : [];
  importantLines.slice(0, 3).forEach((line) => appendExcerptRows(lines, "p", `${line?.stream ?? "stream"}:${line?.lines ?? "?"}`, line?.excerpt, 4));
  appendOmittedRow(lines, "p", importantLines.length, 3, "details.result");
  appendRunRecoveryRow(lines, result, outputId, importantLines[0]);
  lines.push(row("details", "details.result"));
  return lines.join("\n");
}

export function compactRetrieveToolText(result) {
  const routeStatus = result?.routing?.status ?? result?.toolStatus ?? "unknown";
  const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
  const source = compactSourceLabel(result?.source ?? evidence[0]?.source);
  const lines = [row("freeflow_retrieve", routeStatus, source, `e=${evidence.length}`, result?.recovery?.outputId ? `out=${result.recovery.outputId}` : "")];
  if (result?.failure?.message) {
    lines.push(row("fail", truncateRawLine(result.failure.message, 220)));
  } else if (result?.routing?.reason) {
    lines.push(row("why", truncateRawLine(result.routing.reason, 220)));
  }
  appendEvidenceRows(lines, evidence, 3, 4);
  appendRecoveryRow(lines, result?.recovery, evidence, result?.recovery?.outputId);
  lines.push(row("details", "details.result"));
  return lines.join("\n");
}

export function compactDeriveToolText(result) {
  const failed = result?.failure || result?.routing?.status === "failed" || result?.toolStatus === "error";
  const routeStatus = failed ? "failed" : result?.routing?.status ?? result?.toolStatus ?? "unknown";
  const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
  const operation = compactOperationLabel(result?.operation ?? { kind: result?.producer?.name });
  const outputId = result?.outputId ?? result?.recovery?.outputId;
  const source = compactSourceLabel(result?.source);
  const lines = [row("freeflow_derive", routeStatus, operation, source, outputId ? `out=${outputId}` : "")];
  if (result?.failure?.message) {
    lines.push(row("fail", truncateRawLine(result.failure.message, 220)));
  } else if (result?.summary) {
    lines.push(row("s", truncateRawLine(result.summary, 220)));
  } else if (result?.routing?.reason) {
    lines.push(row("why", truncateRawLine(result.routing.reason, 220)));
  }
  appendEvidenceRows(lines, evidence, 3, 4);
  appendRecoveryRow(lines, result?.recovery, evidence, outputId);
  lines.push(row("details", "details.result"));
  return lines.join("\n");
}

function row(...fields) {
  return fields.filter((field) => field !== undefined && field !== null && String(field).length > 0).map(escapeRowField).join("|");
}

function escapeRowField(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "¦");
}

function appendOmittedRow(lines, tag, total, shown, target) {
  const omitted = total - Math.min(total, shown);
  if (omitted > 0) {
    lines.push(row("more", tag, omitted, target));
  }
}

function appendExcerptRows(lines, tag, label, excerpt, maxLines) {
  lines.push(row(tag, label));
  const excerptLines = splitLines(String(excerpt ?? ""));
  excerptLines.slice(0, maxLines).forEach((excerptLine) => lines.push(row(">", truncateRawLine(excerptLine, 220))));
  appendOmittedRow(lines, ">", excerptLines.length, maxLines, "details.result");
}

function appendEvidenceRows(lines, evidence, maxPackets, maxLines) {
  evidence.slice(0, maxPackets).forEach((packet, index) => {
    const match = packet?.match ? `${packet.match.type}:${Number(packet.match.confidence ?? 0).toFixed(2)}` : "";
    lines.push(row("e", index + 1, compactEvidenceLabel(packet), match));
    splitLines(String(packet?.excerpt ?? "")).slice(0, maxLines).forEach((excerptLine) => lines.push(row(">", truncateRawLine(excerptLine, 220))));
    appendOmittedRow(lines, ">", splitLines(String(packet?.excerpt ?? "")).length, maxLines, "details.result");
  });
  appendOmittedRow(lines, "e", evidence.length, maxPackets, "details.result");
}

function appendRunRecoveryRow(lines, result, outputId, firstImportantLine) {
  const exactRecoveryOutputId = result?.scriptFilter?.outputId ?? (result?.persistence?.recoverability === "exact" ? outputId : result?.recovery?.outputId);
  const evidenceStream = result?.scriptFilter?.outputId ? "raw" : firstImportantLine?.stream ?? "combined";
  if (exactRecoveryOutputId && firstImportantLine?.lines) {
    lines.push(row("rec", "vault", exactRecoveryOutputId, evidenceStream, firstImportantLine.lines));
    if (result?.scriptFilter?.outputId && outputId) {
      lines.push(row("raw", outputId));
    }
    return;
  }
  if (result?.persistence?.recoverability === "exact" && outputId) {
    lines.push(row("rec", "vault", outputId));
    return;
  }
  if (result?.recovery?.how) {
    lines.push(row("rec", truncateRawLine(result.recovery.how, 160)));
  }
}

function appendRecoveryRow(lines, recovery, evidence, fallbackOutputId) {
  const first = Array.isArray(evidence) ? evidence.find((packet) => packet?.lines) : undefined;
  if (first?.source?.kind === "vault" && first.source.outputId && first.lines) {
    lines.push(row("rec", "vault", first.source.outputId, first.source.stream ?? "raw", first.lines));
    return;
  }
  if (first?.source?.kind === "repo" && (first.path || first.source.path) && first.lines) {
    lines.push(row("rec", "repo", `${first.path ?? first.source.path}:${first.lines}`));
    return;
  }
  const outputId = recovery?.outputId ?? fallbackOutputId;
  if (outputId) {
    lines.push(row("rec", "vault", outputId));
    return;
  }
  if (recovery?.how) {
    lines.push(row("rec", truncateRawLine(recovery.how, 160)));
  }
}

function compactBatchStepLine(step) {
  const result = step?.result;
  const outputId = result?.outputId ?? result?.recovery?.outputId;
  const parts = ["step", Number(step?.index ?? 0) + 1, step?.id ?? "step", step?.kind ?? "step", step?.status ?? "unknown"];
  if (result?.routing?.status) parts.push(`route=${result.routing.status}`);
  if (step?.durationMs !== undefined) parts.push(`${step.durationMs}ms`);
  if (outputId) parts.push(`out=${outputId}`);
  if (Array.isArray(result?.evidence)) parts.push(`e=${result.evidence.length}`);
  if (Array.isArray(result?.importantLines)) parts.push(`p=${result.importantLines.length}`);
  if (result?.execution?.status) parts.push(`exec=${result.execution.status}`);
  const message = step?.error ?? result?.failure?.message ?? result?.summary;
  if (message) parts.push(truncateRawLine(message, 160));
  return row(...parts);
}

function compactRunFilterText(filters) {
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
  if (filters.head !== undefined) {
    parts.push(`head=${filters.head}`);
  }
  if (filters.tail !== undefined) {
    parts.push(`tail=${filters.tail}`);
  }
  if (filters.maxLines !== undefined) {
    parts.push(`maxLines=${filters.maxLines}`);
  }
  if (filters.maxBytes !== undefined) {
    parts.push(`maxBytes=${filters.maxBytes}`);
  }
  if (filters.selectedLines !== undefined && filters.sourceLines !== undefined) {
    parts.push(`selected=${filters.selectedLines}/${filters.sourceLines}`);
  }
  if (filters.fallbackPreservedFailureEvidence) {
    parts.push("fallback=failure-evidence");
  }
  return parts.join(" ");
}

function compactRunScriptFilterText(scriptFilter) {
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

function compactEvidenceLabel(packet) {
  if (!packet || typeof packet !== "object") {
    return "evidence";
  }
  const source = compactSourceLabel(packet.source);
  const path = packet.path ?? source;
  const lines = packet.lines ? `:${packet.lines}` : "";
  return `${shortenMiddle(path || "evidence", 90)}${lines}`;
}

function compactSourceLabel(source) {
  if (!source || typeof source !== "object") {
    return "";
  }
  if (source.kind === "repo") {
    return `repo ${shortenMiddle(source.path ?? ".", 80)}`;
  }
  if (source.kind === "vault") {
    const stream = source.stream ? `:${source.stream}` : "";
    return `vault ${shortenMiddle(source.outputId ?? "...", 48)}${stream}`;
  }
  return String(source.kind ?? "source");
}

function compactOperationLabel(operation) {
  if (!operation || typeof operation !== "object") {
    return "operation";
  }
  return String(operation.kind ?? operation.name ?? "operation");
}

function compactParserCounts(counts) {
  if (!counts || typeof counts !== "object") {
    return "";
  }
  const parts = [];
  if (counts.testsFailed !== undefined || counts.testsPassed !== undefined || counts.testsTotal !== undefined) {
    if (counts.testsFailed !== undefined) {
      parts.push(`${counts.testsFailed} failed`);
    }
    if (counts.testsPassed !== undefined) {
      parts.push(`${counts.testsPassed} passed`);
    }
    if (counts.testsTotal !== undefined) {
      parts.push(`${counts.testsTotal} total`);
    }
    return parts.join("/");
  }
  if (counts.errors !== undefined) {
    parts.push(`${counts.errors} errors`);
  }
  if (counts.warnings !== undefined) {
    parts.push(`${counts.warnings} warnings`);
  }
  if (counts.duplicateOutputs !== undefined) {
    parts.push(`${counts.duplicateOutputs} duplicate`);
  }
  return parts.join("/");
}

function truncateRawLine(value, maxLength = 220) {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function textComponent(text) {
  return {
    render(width = 120) {
      const maxWidth = Number.isFinite(width) ? Math.max(1, width) : 120;
      return String(text).split("\n").map((line) => truncateAnsiToWidth(line, maxWidth));
    },
    invalidate() {},
  };
}

function truncateAnsiToWidth(input, width) {
  const text = String(input);
  let output = "";
  let visible = 0;

  for (let index = 0; index < text.length;) {
    const ansi = readAnsiSequence(text, index);
    if (ansi) {
      output += ansi.sequence;
      index = ansi.end;
      continue;
    }

    if (visible >= width - 1) {
      output += "…";
      return output;
    }

    const codePoint = text.codePointAt(index);
    const character = String.fromCodePoint(codePoint);
    output += character;
    visible += 1;
    index += character.length;
  }

  return output;
}

function readAnsiSequence(text, index) {
  if (text.charCodeAt(index) !== 0x1b) {
    return null;
  }

  const next = text[index + 1];
  if (next === "[") {
    let end = index + 2;
    while (end < text.length && !/[\x40-\x7e]/.test(text[end])) {
      end += 1;
    }
    return { sequence: text.slice(index, Math.min(end + 1, text.length)), end: Math.min(end + 1, text.length) };
  }

  if (next === "]") {
    const bellEnd = text.indexOf("\x07", index + 2);
    const stEnd = text.indexOf("\x1b\\", index + 2);
    const candidates = [bellEnd, stEnd === -1 ? -1 : stEnd + 1].filter((value) => value !== -1);
    const end = candidates.length > 0 ? Math.min(...candidates) + 1 : text.length;
    return { sequence: text.slice(index, end), end };
  }

  return { sequence: text.slice(index, Math.min(index + 2, text.length)), end: Math.min(index + 2, text.length) };
}

export function themeFg(theme, color, text) {
  return typeof theme?.fg === "function" ? theme.fg(color, text) : text;
}

export function themeBold(theme, text) {
  return typeof theme?.bold === "function" ? theme.bold(text) : text;
}

export function formatStatus(theme, status) {
  const text = String(status ?? "unknown");
  if (text === "ok" || text === "success" || text === "routed" || text === "passed_through") {
    return themeFg(theme, "success", text);
  }
  if (text === "error" || text === "failed") {
    return themeFg(theme, "error", text);
  }
  return themeFg(theme, "warning", text);
}

export function statusIcon(status) {
  if (status === "success" || status === "ok") {
    return "✓";
  }
  if (status === "failed" || status === "error") {
    return "✗";
  }
  return "!";
}

export function oneLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function truncateText(value, maxLength = 120) {
  const text = oneLine(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function shortenMiddle(value, maxLength = 80) {
  const text = oneLine(value);
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 5) {
    return text.slice(0, maxLength);
  }
  const keep = maxLength - 1;
  const head = Math.ceil(keep * 0.45);
  const tail = Math.floor(keep * 0.55);
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

export function splitLines(text) {
  if (text.length === 0) {
    return [];
  }
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

export function extractTextContent(content) {
  if (!Array.isArray(content) || content.length === 0) {
    return null;
  }

  if (!content.every((part) => part?.type === "text" && typeof part.text === "string")) {
    return null;
  }

  return content.map((part) => part.text).join("\n");
}
