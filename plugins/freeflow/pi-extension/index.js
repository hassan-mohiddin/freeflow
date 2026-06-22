import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createVault,
  findExactDuplicateTextOutput,
  freeflowRetrieve,
  freeflowRun,
  isNativeSafetyNetEnabled,
  normalizeRouterConfig,
  storeTextOutput,
  textOutputFingerprints,
} from "../router/dist/index.js";

const VALID_MODES = new Set(["conversation", "workflow", "strict-workflow"]);

const WORKFLOW_COMMANDS = [
  { command: "discover", skill: "discover" },
  { command: "write-spec", skill: "write-spec" },
  { command: "review-artifact", skill: "review-artifact" },
  { command: "write-plan", skill: "write-plan" },
  { command: "execute-plan", skill: "execute-plan" },
  { command: "diagnose-failure", skill: "diagnose-failure" },
  { command: "verify-work", skill: "verify-work" },
  { command: "review-work", skill: "review-work" },
  { command: "commit-work", skill: "commit-work" },
  { command: "handoff", skill: "handoff" },
  { command: "bypass", skill: "bypass" },
  { command: "output-router", skill: "output-router" },
];

const CONTRIBUTOR_COMMANDS = [
  "setup-freeflow",
  "write-skill",
  "evaluate-skill",
];

const MODE_STATE_ENTRY = "freeflow-mode";
const RESET_MODE_ARGS = new Set(["reset"]);
const SAFETY_NET_NATIVE_TOOLS = new Set(["read", "bash"]);
const SAFETY_NET_EXCERPT_LINES = 8;
const SAFETY_NET_HEURISTIC_MIN_BYTES = 16_384;
const SAFETY_NET_HEURISTIC_MIN_LINES = 200;

let runtimeContextCache = null;
let currentModeOverride = null;
let lastRouterConfigWarningKey = null;

async function loadRuntimeContext() {
  const [workflowSkill, workflowMap, interviewGateSkill, outputRouterSkill, outputRouterSafetyPolicy] = await Promise.all([
    readFile(new URL("../skills/workflow/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/workflow/references/workflow-map.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/interview-gate/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/output-router/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/output-router/references/safety-policy.md", import.meta.url), "utf8"),
  ]);

  return { workflowSkill, workflowMap, interviewGateSkill, outputRouterSkill, outputRouterSafetyPolicy };
}

async function refreshRuntimeContext() {
  runtimeContextCache = await loadRuntimeContext();
  return runtimeContextCache;
}

async function getRuntimeContext() {
  if (runtimeContextCache) {
    return runtimeContextCache;
  }
  return refreshRuntimeContext();
}

async function readFreeflowConfig(cwd) {
  try {
    const raw = await readFile(join(cwd, ".freeflow/config.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function readDefaultMode(cwd) {
  const parsed = await readFreeflowConfig(cwd);
  return VALID_MODES.has(parsed.defaultMode) ? parsed.defaultMode : "workflow";
}

async function readOutputRouterConfig(cwd) {
  const parsed = await readFreeflowConfig(cwd);
  return normalizeRouterConfig(parsed.outputRouter);
}

function notifyRouterConfigWarnings(ctx, routerConfigResult) {
  if (!routerConfigResult.warnings.length) {
    return;
  }

  const key = routerConfigResult.warnings.join("\n");
  if (key === lastRouterConfigWarningKey) {
    return;
  }

  lastRouterConfigWarningKey = key;
  ctx.ui.notify(`Freeflow outputRouter config warning: ${routerConfigResult.warnings.join(" ")}`, "warning");
}

function restoreModeOverride(ctx) {
  currentModeOverride = null;
  const entries = ctx.sessionManager?.getEntries?.() ?? [];

  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== MODE_STATE_ENTRY) {
      continue;
    }

    const mode = entry.data?.currentMode;
    currentModeOverride = VALID_MODES.has(mode) ? mode : null;
  }
}

async function readModeState(cwd) {
  const defaultMode = await readDefaultMode(cwd);
  const currentMode = VALID_MODES.has(currentModeOverride) ? currentModeOverride : null;
  return {
    defaultMode,
    currentMode,
    effectiveMode: currentMode ?? defaultMode,
  };
}

function setModeStatus(ctx, modeState) {
  ctx.ui.setStatus("freeflow", `freeflow: ${modeState.effectiveMode}`);
}

function describeModeState(modeState) {
  if (modeState.currentMode) {
    return `current ${modeState.currentMode}; default ${modeState.defaultMode}`;
  }
  return `default ${modeState.defaultMode}`;
}

function skillPrompt(skill, args) {
  const trimmed = args?.trim();
  return trimmed ? `/skill:${skill}\n\n${trimmed}` : `/skill:${skill}`;
}

function hasFreeflowActivation(systemPrompt) {
  return (
    systemPrompt.includes("## Loaded Workflow Skill") &&
    systemPrompt.includes("## Loaded Workflow Map") &&
    systemPrompt.includes("## Loaded Interview Gate Skill")
  );
}

function hasOutputRouterActivation(systemPrompt) {
  return (
    systemPrompt.includes("## Loaded Output Router Skill") &&
    systemPrompt.includes("## Loaded Output Router Safety Policy")
  );
}

function outputRouterModeGuidance(mode) {
  if (mode === "conversation") {
    return "conversation mode: keep routed-tool guidance soft; answer questions directly.";
  }
  if (mode === "strict-workflow") {
    return "strict-workflow mode: strongest guidance; prefer exact, recoverable routed evidence for risky work.";
  }
  return "workflow mode: prefer routed tools for exploration and likely-large command output.";
}

function outputRouterContext(modeState, freeflowContext, routerConfigResult) {
  const safetyNetText =
    routerConfigResult.config.postToolRouting === "off"
      ? ""
      : "\n\nOutput-router config note: large native read/bash outputs may be vaulted and replaced with labeled routed output. Use freeflow_retrieve with the output id to recover exact content.";

  return `## Loaded Output Router Skill

Mode guidance: ${outputRouterModeGuidance(modeState.effectiveMode)}${safetyNetText}

\`\`\`md
${freeflowContext.outputRouterSkill.trim()}
\`\`\`

## Loaded Output Router Safety Policy

\`\`\`md
${freeflowContext.outputRouterSafetyPolicy.trim()}
\`\`\``;
}

function runtimeContext(modeState, freeflowContext, routerConfigResult, alreadyActivated, routerAlreadyActivated) {
  const currentMode = modeState.currentMode ?? "none";

  if (alreadyActivated) {
    return `## Freeflow Runtime Context

Repo default mode from \`.freeflow/config.json\`: ${modeState.defaultMode}.
Current session mode override: ${currentMode}.
Effective Freeflow mode: ${modeState.effectiveMode}.

Use the installed Freeflow skills when they match the task. This Pi extension loads context and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.${routerAlreadyActivated ? "" : `\n\n${outputRouterContext(modeState, freeflowContext, routerConfigResult)}`}`;
  }

  return `# Freeflow Runtime Context

Freeflow Pi extension loaded this before the agent turn.
These instructions are context-loading only. They do not override user instructions, repo instructions, or host safety and approval policy.

## Repo Setup

Repo default mode from \`.freeflow/config.json\`: \`${modeState.defaultMode}\`.
Current session mode override: \`${currentMode}\`.
Effective Freeflow mode: \`${modeState.effectiveMode}\`.
Treat the effective mode as the current mode for this agent turn.
For mode changes or mode interpretation, use \`mode-contract\`.
Do not announce the current mode on every reply. Mention it when the user asks, setup/config is discussed, or the mode changes the next action.

${routerAlreadyActivated ? "" : `${outputRouterContext(modeState, freeflowContext, routerConfigResult)}\n\n`}## Loaded Workflow Skill

\`\`\`md
${freeflowContext.workflowSkill.trim()}
\`\`\`

## Loaded Interview Gate Skill

\`\`\`md
${freeflowContext.interviewGateSkill.trim()}
\`\`\`

## Loaded Workflow Map

\`\`\`md
${freeflowContext.workflowMap.trim()}
\`\`\`

This Pi extension loads context and routes commands only; it does not enforce policy, block tools, grant permissions, or create repo-local hooks.`;
}

const STRING_SCHEMA = { type: "string" };
const PRESERVE_SCHEMA = { type: "string", enum: ["summary", "important", "full"] };
const RETRIEVE_ACTION_SCHEMA = {
  type: "string",
  enum: ["query", "locate", "retrieve", "expand", "explain"],
};
const EXPANSION_SCHEMA = { type: "string", enum: ["lines_30", "lines_80", "full"] };
const STREAM_SCHEMA = { type: "string", enum: ["stdout", "stderr", "combined", "raw"] };

const FREEFLOW_RETRIEVE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { ...RETRIEVE_ACTION_SCHEMA, description: "Retrieval action to perform." },
    source: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["repo", "vault"] },
        path: { ...STRING_SCHEMA, description: "Repo path for source.kind=repo." },
        outputId: { ...STRING_SCHEMA, description: "Vault output id for source.kind=vault." },
        stream: { ...STREAM_SCHEMA, description: "Vault stream to read." },
      },
      required: ["kind"],
      description: "Source to retrieve from. Repo root and vault session are supplied by Freeflow/Pi.",
    },
    query: { ...STRING_SCHEMA, description: "Text query for query/locate actions." },
    preserve: { ...PRESERVE_SCHEMA, description: "Fidelity mode. Default: important." },
    evidence: {
      type: "object",
      additionalProperties: true,
      description: "Evidence packet from a previous freeflow_retrieve result, used for expand.",
    },
    expansion: { ...EXPANSION_SCHEMA, description: "Expansion breadth for expand action." },
    maxFullBytes: { type: "number", description: "Cap for preserve=full before exact chunks are returned." },
    topK: { type: "number", description: "Number of ranked repo candidates for query/locate. Defaults: query=1, locate=5; max 10." },
    lineRange: {
      type: "object",
      additionalProperties: false,
      properties: {
        start: { type: "number" },
        end: { type: "number" },
      },
      required: ["start", "end"],
      description: "Exact 1-based line range for vault retrieve.",
    },
    decision: {
      type: "object",
      additionalProperties: true,
      description: "Prior routed result to explain.",
    },
  },
  required: ["action", "source"],
};

const FREEFLOW_RUN_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    command: { ...STRING_SCHEMA, description: "Shell command to run through Pi's approved command runner." },
    cwd: { ...STRING_SCHEMA, description: "Working directory. Defaults to the current Pi cwd." },
    timeoutMs: { type: "number", description: "Optional timeout in milliseconds." },
    preserve: { ...PRESERVE_SCHEMA, description: "Fidelity mode. Default: important." },
    goal: { ...STRING_SCHEMA, description: "Goal such as verification, test, build, or search." },
  },
  required: ["command"],
};

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function getRouterSessionId(ctx) {
  return ctx.sessionManager?.getSessionId?.() ?? `pi_${stableHash(ctx.cwd).slice(0, 16)}`;
}

function routedToolText(result) {
  return JSON.stringify(result, null, 2);
}

function textComponent(text) {
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

function themeFg(theme, color, text) {
  return typeof theme?.fg === "function" ? theme.fg(color, text) : text;
}

function themeBold(theme, text) {
  return typeof theme?.bold === "function" ? theme.bold(text) : text;
}

function formatStatus(theme, status) {
  const text = String(status ?? "unknown");
  if (text === "ok" || text === "success" || text === "routed" || text === "passed_through") {
    return themeFg(theme, "success", text);
  }
  if (text === "error" || text === "failed") {
    return themeFg(theme, "error", text);
  }
  return themeFg(theme, "warning", text);
}

function statusIcon(status) {
  if (status === "success" || status === "ok") {
    return "✓";
  }
  if (status === "failed" || status === "error") {
    return "✗";
  }
  return "!";
}

function oneLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truncateText(value, maxLength = 120) {
  const text = oneLine(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function shortenMiddle(value, maxLength = 80) {
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

function commandLabel(command) {
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

function routerResultFromToolResult(result) {
  return result?.details?.result;
}

function fallbackResultText(result) {
  const text = extractTextContent(result?.content);
  return text ? truncateText(text, 200) : "No Freeflow result details available.";
}

function renderFreeflowRetrieveCall(args, theme) {
  const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_retrieve"));
  const action = themeFg(theme, "muted", args?.action ?? "query");
  const source = themeFg(theme, "accent", retrieveSourceLabel(args?.source));
  const query = args?.query ? ` ${themeFg(theme, "dim", `\"${truncateText(args.query, 70)}\"`)}` : "";
  return textComponent(`${title} ${action} ${source}${query}`);
}

function renderFreeflowRunCall(args, theme) {
  const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_run"));
  const command = themeFg(theme, "accent", `$ ${commandLabel(args?.command)}`);
  const extras = [];
  if (args?.preserve) {
    extras.push(`preserve=${args.preserve}`);
  }
  if (args?.timeoutMs !== undefined) {
    extras.push(`timeout=${args.timeoutMs}ms`);
  }
  const suffix = extras.length > 0 ? ` ${themeFg(theme, "dim", `(${extras.join(", ")})`)}` : "";
  return textComponent(`${title} ${command}${suffix}`);
}

function renderFreeflowRetrieveResult(result, { expanded } = {}, theme) {
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
    if (routed.recovery.evidenceId) {
      lines.push(`  ${themeFg(theme, "muted", "evidenceId:")} ${themeFg(theme, "accent", routed.recovery.evidenceId)}`);
    }
  }

  return textComponent(lines.join("\n"));
}

function renderFreeflowRunResult(result, { expanded } = {}, theme, context = {}) {
  const routed = routerResultFromToolResult(result);
  if (!routed) {
    return textComponent(fallbackResultText(result));
  }

  const executionStatus = routed.execution?.status ?? routed.toolStatus;
  const outputId = routed.outputId || routed.recovery?.outputId;
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
    statusParts.push(`outputId ${outputId}`);
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
  lines.push(themeFg(theme, "dim", `${importantLines.length} important span(s) • raw output recoverable from vault`));

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

  if (routed.routing?.reason || routed.summary) {
    lines.push("", themeFg(theme, "toolTitle", "Routing"));
    if (routed.summary) {
      lines.push(`  ${themeFg(theme, "muted", "summary:")} ${truncateText(routed.summary, 160)}`);
    }
    if (routed.routing?.reason) {
      lines.push(`  ${themeFg(theme, "muted", "reason:")} ${truncateText(routed.routing.reason, 180)}`);
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
  }

  return textComponent(lines.join("\n"));
}

function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

function splitLines(text) {
  if (text.length === 0) {
    return [];
  }
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function extractTextContent(content) {
  if (!Array.isArray(content) || content.length === 0) {
    return null;
  }

  if (!content.every((part) => part?.type === "text" && typeof part.text === "string")) {
    return null;
  }

  return content.map((part) => part.text).join("\n");
}

async function nativeResultText(event) {
  const fullOutputPath = event.toolName === "bash" ? event.details?.fullOutputPath : undefined;
  if (typeof fullOutputPath === "string" && fullOutputPath.length > 0) {
    try {
      return await readFile(fullOutputPath, "utf8");
    } catch {
      // Fall back to the exact text that would otherwise enter model context.
    }
  }

  return extractTextContent(event.content);
}

function nativeOutputStats(text, truncation) {
  const measuredLines = splitLines(text).length;
  const measuredBytes = byteLength(text);
  return {
    lines: Number.isInteger(truncation?.totalLines) ? truncation.totalLines : measuredLines,
    bytes: Number.isInteger(truncation?.totalBytes) ? truncation.totalBytes : measuredBytes,
    capturedLines: measuredLines,
    capturedBytes: measuredBytes,
  };
}

function isSafetyNetEnabled(routerConfig) {
  return isNativeSafetyNetEnabled(routerConfig.postToolRouting);
}

function shouldRouteNativeToolResult(event, routerConfig, text) {
  if (!SAFETY_NET_NATIVE_TOOLS.has(event.toolName) || !isSafetyNetEnabled(routerConfig)) {
    return { route: false };
  }

  const stats = nativeOutputStats(text, event.details?.truncation);
  if (stats.bytes > routerConfig.thresholds.largeOutputBytes) {
    return {
      route: true,
      stats,
      reason: `native ${event.toolName} output exceeded largeOutputBytes (${stats.bytes} > ${routerConfig.thresholds.largeOutputBytes})`,
    };
  }

  if (stats.lines > routerConfig.thresholds.largeOutputLines) {
    return {
      route: true,
      stats,
      reason: `native ${event.toolName} output exceeded largeOutputLines (${stats.lines} > ${routerConfig.thresholds.largeOutputLines})`,
    };
  }

  if (matchesConfiguredNoiseHint(event, routerConfig) && exceedsHeuristicMinimum(stats, routerConfig)) {
    return {
      route: true,
      stats,
      reason: `native ${event.toolName} output matched configured noisy/generated-output hints and exceeded the conservative heuristic floor`,
    };
  }

  return { route: false };
}

function exceedsHeuristicMinimum(stats, routerConfig) {
  const byteFloor = Math.min(routerConfig.thresholds.largeOutputBytes, SAFETY_NET_HEURISTIC_MIN_BYTES);
  const lineFloor = Math.min(routerConfig.thresholds.largeOutputLines, SAFETY_NET_HEURISTIC_MIN_LINES);
  return stats.bytes > byteFloor || stats.lines > lineFloor;
}

function matchesConfiguredNoiseHint(event, routerConfig) {
  if (event.toolName === "bash") {
    const command = typeof event.input?.command === "string" ? event.input.command : "";
    return matchesAnyHint(command, routerConfig.hints?.noisyCommandPatterns);
  }

  if (event.toolName === "read") {
    const path = typeof event.input?.path === "string" ? event.input.path : "";
    return matchesAnyPathHint(path, routerConfig.hints?.generatedPathGlobs);
  }

  return false;
}

function matchesAnyHint(value, hints) {
  if (!value || !Array.isArray(hints)) {
    return false;
  }
  return hints.some((hint) => typeof hint === "string" && hint.length > 0 && value.includes(hint));
}

function matchesAnyPathHint(path, hints) {
  if (!path || !Array.isArray(hints)) {
    return false;
  }
  return hints.some((hint) => matchesSimpleGlob(path, hint));
}

function matchesSimpleGlob(path, pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    return false;
  }

  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }

  if (!pattern.includes("*")) {
    return path === pattern || path.includes(pattern);
  }

  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function nativeSafetyDecisionId(event, text) {
  return `ffdec_native_${stableHash(`${event.toolName}:${event.toolCallId}:${text}`).slice(0, 24)}`;
}

function formatNativeSafetyNetResult({ event, record, duplicate, stats, reason, mode, text }) {
  const lines = splitLines(text);
  const shownLines = lines.slice(0, SAFETY_NET_EXCERPT_LINES);
  const shownEnd = shownLines.length;
  const omittedLines = Math.max(0, stats.capturedLines - shownLines.length);
  const inputLabel = nativeInputLabel(event);
  const duplicateLine = duplicate
    ? `Duplicate: exact native output matches previous outputId=${duplicate.outputId}; current raw output was vaulted as outputId=${record.outputId}.`
    : null;

  return [
    `Freeflow routed this native ${event.toolName} result (post-tool safety net).`,
    `Reason: ${reason}; outputRouter.postToolRouting=${mode}.`,
    `Captured exact native text in the Freeflow vault: outputId=${record.outputId}, stream=raw, lines=${stats.capturedLines}, bytes=${stats.capturedBytes}.`,
    ...(duplicateLine ? [duplicateLine] : []),
    `Original native result stats: lines=${stats.lines}, bytes=${stats.bytes}.${inputLabel ? ` Input: ${inputLabel}.` : ""}`,
    `Recovery: use freeflow_retrieve with action=retrieve, source.kind=vault, outputId=${record.outputId}, stream=raw, and a lineRange to recover exact content.`,
    `Showing exact captured lines 1-${shownEnd}${omittedLines > 0 ? ` (${omittedLines} captured lines omitted from context)` : ""}:`,
    "```text",
    shownLines.join("\n"),
    "```",
  ].join("\n");
}

function nativeInputLabel(event) {
  if (event.toolName === "bash" && typeof event.input?.command === "string") {
    return `command=${JSON.stringify(event.input.command)}`;
  }
  if (event.toolName === "read" && typeof event.input?.path === "string") {
    return `path=${JSON.stringify(event.input.path)}`;
  }
  return "";
}

function appendSafetyNetWarning(event, message) {
  return [
    ...event.content,
    {
      type: "text",
      text: `Freeflow safety-net warning: ${message} Native output was not shortened or removed.`,
    },
  ];
}

// Keep post-tool native transformations aligned with
// plugins/freeflow/skills/output-router/references/safety-policy.md.
async function handleNativeToolSafetyNet(event, ctx) {
  const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
  notifyRouterConfigWarnings(ctx, routerConfigResult);
  const routerConfig = routerConfigResult.config;

  if (!SAFETY_NET_NATIVE_TOOLS.has(event.toolName) || !isSafetyNetEnabled(routerConfig)) {
    return undefined;
  }

  const text = await nativeResultText(event);
  if (text === null) {
    return undefined;
  }

  const routeDecision = shouldRouteNativeToolResult(event, routerConfig, text);
  if (!routeDecision.route) {
    return undefined;
  }

  try {
    const vault = createVault({ root: routerConfig.vault.root, retention: routerConfig.vault.retention });
    const sessionId = getRouterSessionId(ctx);
    const fingerprints = textOutputFingerprints({ raw: text });
    const duplicate = await findExactDuplicateTextOutput(vault, { sessionId, fingerprints });
    const decisionId = nativeSafetyDecisionId(event, text);
    const record = await storeTextOutput(vault, {
      sessionId,
      raw: text,
      sourceKind: "native",
      decisionIds: [decisionId],
    });
    const routedText = formatNativeSafetyNetResult({
      event,
      record,
      duplicate,
      stats: routeDecision.stats,
      reason: routeDecision.reason,
      mode: routerConfig.postToolRouting,
      text,
    });

    return {
      content: [{ type: "text", text: routedText }],
      details: {
        ...(event.details && typeof event.details === "object" ? event.details : {}),
        freeflowOutputRouter: {
          route: "safety-net",
          outputId: record.outputId,
          decisionId,
          reason: routeDecision.reason,
          ...(duplicate ? { duplicateOfOutputId: duplicate.outputId } : {}),
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Freeflow safety-net routing failed; passing native ${event.toolName} output through. ${message}`, "warning");
    return {
      content: appendSafetyNetWarning(event, message),
    };
  }
}

async function normalizeRetrieveParams(params, ctx) {
  const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
  notifyRouterConfigWarnings(ctx, routerConfigResult);
  const source = params.source ?? { kind: "repo" };

  if (source.kind === "repo") {
    return {
      ...params,
      generatedPathGlobs: routerConfigResult.config.hints?.generatedPathGlobs,
      source: {
        kind: "repo",
        root: ctx.cwd,
        ...(source.path ? { path: source.path } : {}),
      },
    };
  }

  if (source.kind === "vault") {
    if (!source.outputId) {
      throw new Error("freeflow_retrieve source.kind=vault requires source.outputId.");
    }
    return {
      ...params,
      source: {
        kind: "vault",
        root: routerConfigResult.config.vault.root,
        sessionId: getRouterSessionId(ctx),
        outputId: source.outputId,
        ...(source.stream ? { stream: source.stream } : {}),
      },
    };
  }

  throw new Error(`Unsupported freeflow_retrieve source kind: ${source.kind}`);
}

function createPiCommandRunner(pi, signal) {
  return {
    async run(request) {
      const startedAt = Date.now();
      const command = Array.isArray(request.command) ? request.command.join(" ") : request.command;
      const result = await pi.exec("bash", ["-lc", command], {
        cwd: request.cwd,
        timeout: request.timeoutMs,
        signal,
      });
      const durationMs = Date.now() - startedAt;
      const killed = Boolean(result.killed);
      const code = typeof result.code === "number" ? result.code : null;
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        executionStatus: signal?.aborted ? "cancelled" : killed ? "timed_out" : code === 0 ? "success" : "failed",
        exitCode: code,
        durationMs,
      };
    },
  };
}

function registerRouterTools(pi) {
  pi.registerTool({
    name: "freeflow_retrieve",
    label: "Freeflow Retrieve",
    description:
      "Retrieve targeted evidence from repo files or Freeflow-vaulted output. Returns labeled, recoverable routed evidence instead of broad raw output.",
    promptSnippet: "Retrieve targeted repo/vault evidence with recoverable routed output.",
    promptGuidelines: [
      "Use freeflow_retrieve for targeted repo or vault evidence before reading whole files or dumping captured output.",
      "Use freeflow_retrieve with source.kind=vault and an outputId to recover exact output from freeflow_run.",
    ],
    parameters: FREEFLOW_RETRIEVE_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await freeflowRetrieve(await normalizeRetrieveParams(params, ctx));
      return {
        content: [{ type: "text", text: routedToolText(result) }],
        details: { result },
      };
    },
    renderCall(args, theme) {
      return renderFreeflowRetrieveCall(args, theme);
    },
    renderResult(result, options, theme) {
      return renderFreeflowRetrieveResult(result, options, theme);
    },
  });

  pi.registerTool({
    name: "freeflow_run",
    label: "Freeflow Run",
    description:
      "Run a command through Pi's approved runner, vault exact stdout/stderr, and return compact routed evidence plus an outputId.",
    promptSnippet: "Run likely-large/noisy commands with vaulted raw output and compact evidence.",
    promptGuidelines: [
      "Use freeflow_run for commands likely to produce large or noisy output when routed evidence is enough.",
      "Use native bash when direct shell behavior or exact small raw output is intentionally needed.",
    ],
    parameters: FREEFLOW_RUN_PARAMETERS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const routerConfigResult = await readOutputRouterConfig(ctx.cwd);
      notifyRouterConfigWarnings(ctx, routerConfigResult);
      const runner = createPiCommandRunner(pi, signal);
      const result = await freeflowRun(
        {
          command: params.command,
          cwd: params.cwd ?? ctx.cwd,
          timeoutMs: params.timeoutMs,
          preserve: params.preserve,
          goal: params.goal,
          sessionId: getRouterSessionId(ctx),
          vaultRoot: routerConfigResult.config.vault.root,
          vaultRetention: routerConfigResult.config.vault.retention,
          thresholds: routerConfigResult.config.thresholds,
        },
        {
          async run(request) {
            if (signal?.aborted) {
              return { stdout: "", stderr: "", executionStatus: "cancelled", exitCode: null };
            }
            return runner.run(request);
          },
        },
      );
      return {
        content: [{ type: "text", text: routedToolText(result) }],
        details: { result },
      };
    },
    renderCall(args, theme) {
      return renderFreeflowRunCall(args, theme);
    },
    renderResult(result, options, theme, context) {
      return renderFreeflowRunResult(result, options, theme, context);
    },
  });
}

async function handleWorkflowCommand(args, ctx, pi) {
  const arg = args?.trim();

  if (VALID_MODES.has(arg)) {
    currentModeOverride = arg;
    pi.appendEntry?.(MODE_STATE_ENTRY, { currentMode: arg });
    const modeState = await readModeState(ctx.cwd);
    setModeStatus(ctx, modeState);
    ctx.ui.notify(
      `Freeflow mode is now ${modeState.effectiveMode} for this session. Repo default remains ${modeState.defaultMode}.`,
      "info"
    );
    return;
  }

  if (RESET_MODE_ARGS.has(arg)) {
    currentModeOverride = null;
    pi.appendEntry?.(MODE_STATE_ENTRY, { currentMode: null });
    const modeState = await readModeState(ctx.cwd);
    setModeStatus(ctx, modeState);
    ctx.ui.notify(`Freeflow mode reset to repo default: ${modeState.defaultMode}.`, "info");
    return;
  }

  const modeState = await readModeState(ctx.cwd);
  setModeStatus(ctx, modeState);
  ctx.ui.notify(
    `Freeflow mode is ${modeState.effectiveMode} (${describeModeState(modeState)}). Use /workflow conversation, /workflow workflow, /workflow strict-workflow, or /workflow reset.`,
    "info"
  );
}

export default function freeflow(pi) {
  registerRouterTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    restoreModeOverride(ctx);
    const [modeState, routerConfigResult] = await Promise.all([
      readModeState(ctx.cwd),
      readOutputRouterConfig(ctx.cwd),
      refreshRuntimeContext(),
    ]);
    setModeStatus(ctx, modeState);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
  });

  pi.on("session_compact", async (_event, ctx) => {
    const [modeState, routerConfigResult] = await Promise.all([
      readModeState(ctx.cwd),
      readOutputRouterConfig(ctx.cwd),
      refreshRuntimeContext(),
    ]);
    setModeStatus(ctx, modeState);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const [modeState, freeflowContext, routerConfigResult] = await Promise.all([
      readModeState(ctx.cwd),
      getRuntimeContext(),
      readOutputRouterConfig(ctx.cwd),
    ]);
    setModeStatus(ctx, modeState);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n" +
        runtimeContext(
          modeState,
          freeflowContext,
          routerConfigResult,
          hasFreeflowActivation(event.systemPrompt),
          hasOutputRouterActivation(event.systemPrompt)
        ),
    };
  });

  pi.on("tool_result", async (event, ctx) => {
    return handleNativeToolSafetyNet(event, ctx);
  });

  for (const { command, skill } of WORKFLOW_COMMANDS) {
    pi.registerCommand(command, {
      description: command === skill ? `Run Freeflow ${skill}` : `Run Freeflow ${skill} via ${command}`,
      handler: async (args) => {
        await pi.sendUserMessage(skillPrompt(skill, args));
      },
    });
  }

  for (const skill of CONTRIBUTOR_COMMANDS) {
    pi.registerCommand(skill, {
      description: `Run Freeflow ${skill}`,
      handler: async (args) => {
        await pi.sendUserMessage(skillPrompt(skill, args));
      },
    });
  }

  pi.registerCommand("workflow", {
    description: "Set or inspect the current Freeflow session mode",
    getArgumentCompletions: (prefix) => {
      const query = prefix ?? "";
      const values = ["conversation", "workflow", "strict-workflow", "reset"];
      const filtered = values.filter((value) => value.startsWith(query));
      return filtered.map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      await handleWorkflowCommand(args, ctx, pi);
    },
  });
}
