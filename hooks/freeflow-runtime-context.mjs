#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, "..");
const VALID_MODES = new Set(["conversation", "workflow", "strict-workflow"]);
const SESSION_STATE_VERSION = 1;
const SESSION_STATE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const CLEAR_TRANSFER_MAX_AGE_MS = 60 * 1000;

function readStdinJson() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    return { input: {}, raw: "" };
  }

  try {
    return { input: JSON.parse(raw), raw };
  } catch {
    return { input: {}, raw };
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function findWorkspaceRoot(cwd) {
  let current = path.resolve(cwd || process.cwd());

  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(cwd || process.cwd());
    }
    current = parent;
  }
}

function loadRuntimeContext(options = {}) {
  const includeInteractionContract = options.interactionContract === true;
  const includeSkills = options.skills === true;
  const interactionContract = includeInteractionContract
    ? readText(path.join(PLUGIN_ROOT, "runtime", "interaction-contract.md"))
    : null;
  const workflowSkill = includeSkills ? readText(path.join(PLUGIN_ROOT, "skills", "workflow", "SKILL.md")) : null;

  if ((includeInteractionContract && !interactionContract) || (includeSkills && !workflowSkill)) {
    throw new Error("Freeflow runtime context files are missing.");
  }

  return { interactionContract, workflowSkill };
}

function readConfig(root) {
  const repository = readConfigLayer(path.join(root, ".freeflow", "config.json"), isValidSetupConfig);
  const local = readConfigLayer(path.join(root, ".freeflow", "local.json"), isValidLocalConfig);
  const localValid = !local.exists || local.valid;
  const configured = repository.valid && localValid;
  const core = resolveCoreConfig(repository.valid ? repository.parsed : {}, local.valid ? local.parsed : {});
  const enabled = configured && core.config.enabled;

  return {
    exists: repository.exists,
    valid: configured,
    configured,
    repositoryValid: repository.valid,
    localExists: local.exists,
    localValid,
    error: !repository.valid ? repository.error : local.error,
    enabled,
    interactionContractEnabled: enabled && core.config.interactionContract,
    skillsEnabled: enabled && core.config.skills.enabled,
    defaultMode: core.config.defaultMode,
    sources: core.sources,
  };
}

function readConfigLayer(filePath, validate) {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, exists: false, valid: false, parsed: {}, error: null };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const error = validate(parsed);
    return {
      path: filePath,
      exists: true,
      valid: error === null,
      parsed: error === null ? parsed : {},
      error,
    };
  } catch (error) {
    return {
      path: filePath,
      exists: true,
      valid: false,
      parsed: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateCoreConfigFields(value) {
  if (Object.hasOwn(value, "defaultMode") && !VALID_MODES.has(value.defaultMode)) {
    return "defaultMode must be conversation, workflow, or strict-workflow";
  }
  if (Object.hasOwn(value, "enabled") && typeof value.enabled !== "boolean") {
    return "enabled must be a boolean";
  }
  if (Object.hasOwn(value, "interactionContract") && typeof value.interactionContract !== "boolean") {
    return "interactionContract must be a boolean";
  }
  if (Object.hasOwn(value, "skills")) {
    if (!isRecord(value.skills)) {
      return "skills must be an object";
    }
    if (Object.hasOwn(value.skills, "enabled") && typeof value.skills.enabled !== "boolean") {
      return "skills.enabled must be a boolean";
    }
  }
  return null;
}

function isValidSetupConfig(value) {
  if (!isRecord(value)) {
    return "repository config must be a JSON object";
  }

  const allowedKeys = new Set([
    "enabled",
    "defaultMode",
    "interactionContract",
    "skills",
    "outputRouter",
    "observedRouting",
    "scriptTransform",
    "cognitiveRouting",
  ]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) {
    return "repository config contains unsupported top-level keys";
  }

  const coreError = validateCoreConfigFields(value);
  if (coreError) {
    return coreError;
  }

  for (const key of ["outputRouter", "observedRouting", "scriptTransform"]) {
    if (Object.hasOwn(value, key) && !isRecord(value[key])) {
      return `${key} must be an object`;
    }
  }
  return null;
}

function isValidLocalConfig(value) {
  if (!isRecord(value)) {
    return "local config must be a JSON object";
  }

  const allowedKeys = new Set([
    "enabled",
    "defaultMode",
    "interactionContract",
    "skills",
    "processing",
    "cognitiveRouting",
  ]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) {
    return "local config contains unsupported top-level keys";
  }
  return validateCoreConfigFields(value);
}

function hasOwn(value, key) {
  return Object.hasOwn(value, key);
}

function resolveLayeredValue(repository, local, key, fallback) {
  if (hasOwn(local, key)) {
    return { value: local[key], source: "local" };
  }
  if (hasOwn(repository, key)) {
    return { value: repository[key], source: "repository" };
  }
  return { value: fallback, source: "builtin" };
}

function resolveCoreConfig(repository, local) {
  const enabled = resolveLayeredValue(repository, local, "enabled", true);
  const interactionContract = resolveLayeredValue(repository, local, "interactionContract", true);
  const defaultMode = resolveLayeredValue(repository, local, "defaultMode", "workflow");
  const repositorySkills = isRecord(repository.skills) ? repository.skills : {};
  const localSkills = isRecord(local.skills) ? local.skills : {};
  const skillsEnabled = resolveLayeredValue(repositorySkills, localSkills, "enabled", true);

  return {
    config: {
      enabled: enabled.value,
      interactionContract: interactionContract.value,
      skills: { enabled: skillsEnabled.value },
      defaultMode: defaultMode.value,
    },
    sources: {
      enabled: enabled.source,
      interactionContract: interactionContract.source,
      skillsEnabled: skillsEnabled.source,
      defaultMode: defaultMode.source,
    },
  };
}

function hostName() {
  return process.env.PLUGIN_DATA ? "codex" : "claude";
}

function pluginDataRoot() {
  const configured = process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA;
  return configured ? path.resolve(configured) : null;
}

function sessionStatePath(sessionId) {
  const dataRoot = pluginDataRoot();
  if (!dataRoot || typeof sessionId !== "string" || sessionId.length === 0) {
    return null;
  }

  const key = crypto.createHash("sha256").update(`${hostName()}\0${sessionId}`).digest("hex");
  return path.join(dataRoot, "session-modes", hostName(), `${key}.json`);
}

function workspaceKey(root) {
  return crypto.createHash("sha256").update(path.resolve(root)).digest("hex");
}

function claudeProcessKey() {
  const processId = process.env.CLAUDE_PID;
  if (typeof processId !== "string" || processId.length === 0) {
    return null;
  }
  return crypto.createHash("sha256").update(processId).digest("hex");
}

function clearTransferPath(root) {
  const dataRoot = pluginDataRoot();
  const processKey = claudeProcessKey();
  if (!dataRoot || hostName() !== "claude" || !processKey) {
    return null;
  }
  return path.join(dataRoot, "session-modes", "claude-clear", `${workspaceKey(root)}-${processKey}.json`);
}

function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Best-effort cleanup of a failed atomic write.
    }
    throw error;
  }
}

function readSessionMode(sessionId) {
  const filePath = sessionStatePath(sessionId);
  if (!filePath) {
    return null;
  }

  try {
    const state = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (state.version !== SESSION_STATE_VERSION || !VALID_MODES.has(state.mode)) {
      return null;
    }
    return state.mode;
  } catch {
    return null;
  }
}

function writeSessionMode(sessionId, mode) {
  const filePath = sessionStatePath(sessionId);
  if (!filePath) {
    return false;
  }

  writeJsonAtomic(filePath, {
    version: SESSION_STATE_VERSION,
    mode,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

function clearSessionMode(sessionId) {
  const filePath = sessionStatePath(sessionId);
  if (!filePath) {
    return false;
  }

  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  return true;
}

function stageClearTransfer(input) {
  if (hostName() !== "claude" || input.reason !== "clear") {
    return;
  }

  const root = findWorkspaceRoot(input.cwd || process.cwd());
  const mode = readSessionMode(input.session_id);
  const filePath = clearTransferPath(root);
  if (!filePath) {
    return;
  }

  if (!mode) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
    return;
  }

  writeJsonAtomic(filePath, {
    version: SESSION_STATE_VERSION,
    mode,
    sourceSessionKey: crypto.createHash("sha256").update(String(input.session_id)).digest("hex"),
    createdAt: new Date().toISOString(),
  });
}

function consumeClearTransfer(input, root) {
  if (hostName() !== "claude" || input.source !== "clear") {
    return null;
  }

  const filePath = clearTransferPath(root);
  if (!filePath) {
    return null;
  }

  const claimedPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.claimed`;
  try {
    fs.renameSync(filePath, claimedPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    return null;
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(claimedPath, "utf8"));
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(claimedPath);
    } catch {
      // The atomic claim already prevents reuse; cleanup is best-effort.
    }
  }

  if (!isRecord(state)) {
    return null;
  }
  const createdAt = Date.parse(state.createdAt);
  if (
    state.version !== SESSION_STATE_VERSION ||
    !VALID_MODES.has(state.mode) ||
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt > CLEAR_TRANSFER_MAX_AGE_MS ||
    Date.now() < createdAt
  ) {
    return null;
  }

  return writeSessionMode(input.session_id, state.mode) ? state.mode : null;
}

function cleanupExpiredSessionModes() {
  const root = pluginDataRoot();
  if (!root) {
    return;
  }

  const stateRoot = path.join(root, "session-modes");
  const cutoff = Date.now() - SESSION_STATE_MAX_AGE_MS;
  for (const host of ["claude", "codex", "claude-clear"]) {
    const directory = path.join(stateRoot, host);
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const filePath = path.join(directory, entry.name);
      try {
        if (fs.statSync(filePath).mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Cleanup is best-effort and must not prevent runtime delivery.
      }
    }
  }
}

function sourceLabel(source) {
  if (source === "local") {
    return "personal";
  }
  return source;
}

function resolveRuntimeState(input) {
  const root = findWorkspaceRoot(input.cwd || process.cwd());
  const config = readConfig(root);
  const restoredMode = config.valid && config.enabled ? consumeClearTransfer(input, root) : null;
  const sessionMode = config.valid && config.enabled ? restoredMode || readSessionMode(input.session_id) : null;
  const resolvedMode = sessionMode || config.defaultMode;

  return {
    root,
    config,
    sessionMode,
    resolvedMode,
    effectiveMode: config.enabled && config.skillsEnabled ? resolvedMode : null,
    modeSource: sessionMode ? "session override" : "configured default",
  };
}

function modeOverlayGuidance(mode) {
  if (mode === "conversation") {
    return [
      "",
      "## Conversation Mode Boundary",
      "",
      "Conversation mode is active and read-only.",
      "",
      "Do not call write, edit, or mutating tools. Do not create, delete, commit, push, or change repository, system, external, or durable state.",
      "",
      "A mutation request does not switch mode, and an execution skill does not override this boundary. Explain that conversation mode is read-only and ask the user to switch to workflow or strict-workflow.",
    ];
  }

  if (mode === "strict-workflow") {
    return [
      "",
      "## Strict Workflow Overlay",
      "",
      "Strict Workflow is active. Use the adaptive Workflow, but increase decision, evidence, verification, and checkpoint pressure at high-risk or hard-to-reverse boundaries.",
      "",
      "For work affecting security, privacy, billing, data loss, migrations, public interfaces, compatibility, deployment, or architecture:",
      "",
      "- stop for any user-owned choice or source conflict;",
      "- inspect the relevant risk surface before crossing the boundary;",
      "- select only artifacts, checkpoints, and independent review that materially reduce risk;",
      "- verify at the affected boundary before claiming success.",
      "",
      "Do not manufacture ceremony for low-risk, reversible work. Strict Workflow does not authorize mutation, bypass safety, or make every implementation detail a user decision.",
    ];
  }

  return [];
}

function stateLines(state, sessionChange = null) {
  const { config } = state;
  const lines = [`Configured default: \`${config.defaultMode}\` (${sourceLabel(config.sources.defaultMode)})`];

  if (sessionChange === "cleared") {
    lines.push("Session override: cleared");
  } else if (state.sessionMode) {
    lines.push(`Session override: \`${state.sessionMode}\``);
  } else {
    lines.push("Session override: none");
  }

  if (state.effectiveMode) {
    lines.push(`Effective mode: \`${state.effectiveMode}\` (${state.modeSource}, active)`);
  } else {
    lines.push(`Resolved mode: \`${state.resolvedMode}\` (dormant because Skills are disabled)`);
  }

  return lines;
}

function capabilityLines(config) {
  return [
    `Interaction Contract: ${config.interactionContractEnabled ? "enabled" : "disabled"}`,
    `Skills: ${config.skillsEnabled ? "enabled" : "disabled"}`,
  ];
}

function renderSessionStart(state) {
  const { config } = state;
  if (!config.valid) {
    return "";
  }

  if (!config.enabled) {
    return [
      "# Freeflow Disabled",
      "",
      `Configured but inactive: \`enabled\` is false (${sourceLabel(config.sources.enabled)}).`,
      "No Freeflow interaction, skill, or mode guidance is effective.",
    ].join("\n");
  }

  const { interactionContract, workflowSkill } = loadRuntimeContext({
    interactionContract: config.interactionContractEnabled,
    skills: config.skillsEnabled,
  });
  const context = [
    "# Freeflow Runtime Context",
    "",
    "Runtime delivery: confirmed for this lifecycle-hook invocation.",
    "This context guides behavior only; user instructions, repository instructions, and host safety or approval policy retain precedence.",
    "",
    "## Effective State",
    "",
    ...stateLines(state),
    ...capabilityLines(config),
  ];

  if (config.interactionContractEnabled) {
    context.push("", interactionContract.trim());
  }
  if (config.skillsEnabled) {
    context.push("", "# Freeflow Workflow Bootstrap", "", workflowSkill.trim());
  }
  if (state.effectiveMode) {
    context.push(...modeOverlayGuidance(state.effectiveMode));
  }

  return context.join("\n");
}

function normalizePrompt(prompt) {
  return prompt
    .trim()
    .replace(/[.!]+$/u, "")
    .replace(/\s+/gu, " ");
}

function parseModeControl(prompt) {
  if (typeof prompt !== "string" || prompt.length > 300 || /\?\s*$/u.test(prompt.trim())) {
    return null;
  }

  const normalized = normalizePrompt(prompt);
  const nativeSet = normalized.match(
    /^(?:\/freeflow mode|\$mode-contract|\/(?:freeflow:)?mode-contract) (conversation|workflow|strict-workflow)$/iu,
  );
  if (nativeSet) {
    return { action: "set", mode: nativeSet[1].toLowerCase() };
  }
  if (/^(?:\/freeflow mode|\$mode-contract|\/(?:freeflow:)?mode-contract) reset$/iu.test(normalized)) {
    return { action: "reset" };
  }

  const setPatterns = [
    /^switch to (conversation|workflow|strict-workflow)(?: mode)?$/iu,
    /^switch (?:this|the) session to (conversation|workflow|strict-workflow)(?: mode)?$/iu,
    /^use (conversation|workflow|strict-workflow)(?: mode)? for (?:this|the) session$/iu,
    /^(?:change|set) (?:the )?(?:current|active|session) mode to (conversation|workflow|strict-workflow)$/iu,
    /^switch (?:the )?(?:current|active|session) mode to (conversation|workflow|strict-workflow)$/iu,
  ];
  for (const pattern of setPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return { action: "set", mode: match[1].toLowerCase() };
    }
  }

  if (/^(?:reset|clear|remove) (?:the )?(?:current |active )?session mode(?: override)?$/iu.test(normalized)) {
    return { action: "reset" };
  }

  return null;
}

function renderPromptModeChange(state, sessionChange) {
  const lines = [
    "# Freeflow Mode Update",
    "",
    ...stateLines(state, sessionChange),
    "",
    "This user-operated session control changed host-managed state before this model request. It changes workflow behavior, not mutation authority, host permissions, or accepted scope.",
    "Acknowledge the effective mode briefly. Do not claim that configured defaults changed.",
  ];
  if (state.effectiveMode) {
    lines.push(...modeOverlayGuidance(state.effectiveMode));
  }
  return lines.join("\n");
}

function handleUserPromptSubmit(input) {
  const control = parseModeControl(input.prompt);
  if (!control) {
    return "";
  }

  const before = resolveRuntimeState(input);
  if (!before.config.valid || !before.config.enabled) {
    return "";
  }
  if (!before.config.skillsEnabled) {
    return [
      "# Freeflow Mode Update Unavailable",
      "",
      `Resolved mode remains \`${before.resolvedMode}\`, but no Freeflow mode is effective because Skills are disabled.`,
      "Do not claim that the session mode changed.",
    ].join("\n");
  }

  if (control.action === "set") {
    if (!writeSessionMode(input.session_id, control.mode)) {
      return "Freeflow could not establish a session mode override because this host invocation supplied no writable plugin data or session identifier. Do not claim that the mode changed.";
    }
    const state = resolveRuntimeState(input);
    return renderPromptModeChange(state, "set");
  }

  if (!clearSessionMode(input.session_id)) {
    return "Freeflow could not clear the session mode override because this host invocation supplied no writable plugin data or session identifier. Do not claim that the mode changed.";
  }
  const state = resolveRuntimeState(input);
  return renderPromptModeChange(state, "cleared");
}

function shouldHandle(eventName) {
  if (process.env.FREEFLOW_DISABLE_RUNTIME_CONTEXT === "1") {
    return false;
  }
  return eventName === "SessionStart" || eventName === "UserPromptSubmit" || eventName === "SessionEnd";
}

function emitAdditionalContext(eventName, additionalContext) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext,
      },
    })}\n`,
  );
}

function main() {
  const { input, raw } = readStdinJson();
  const eventName = process.argv[2] || input.hook_event_name || "";

  if ((!raw && !eventName) || !shouldHandle(eventName)) {
    return;
  }

  cleanupExpiredSessionModes();
  if (eventName === "SessionEnd") {
    stageClearTransfer(input);
    return;
  }
  const additionalContext =
    eventName === "SessionStart" ? renderSessionStart(resolveRuntimeState(input)) : handleUserPromptSubmit(input);
  if (!additionalContext.trim()) {
    return;
  }
  emitAdditionalContext(eventName, additionalContext);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Freeflow runtime context hook skipped: ${error.message}\n`);
}
