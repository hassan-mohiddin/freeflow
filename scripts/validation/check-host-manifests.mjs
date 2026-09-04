#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_PLUGINS_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const AGENT_PLUGIN_KEYS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);
const CURSOR_MANIFEST_KEYS = new Set([
  "name",
  "description",
  "version",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "logo",
  "rules",
  "agents",
  "skills",
  "commands",
  "hooks",
  "mcpServers",
  "variables",
]);
const GEMINI_MANIFEST_KEYS = new Set([
  "name",
  "version",
  "description",
  "mcpServers",
  "contextFileName",
  "excludeTools",
  "migratedTo",
  "plan",
  "settings",
]);
const PORTABLE_HOST_KEYWORDS = ["agent-plugins", "gemini", "cursor", "copilot", "vscode", "kiro", "opencode", "hermes"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function pluginNameIsValid(value) {
  return (
    typeof value === "string" && value.length <= 64 && /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)
  );
}

function skillNameIsValid(value) {
  return typeof value === "string" && /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
}

function validateMetadata(manifest, label, errors, { allowSchema = false } = {}) {
  if (!isRecord(manifest)) {
    errors.push(`${label} must contain a JSON object`);
    return;
  }

  if (typeof manifest.name !== "string" || manifest.name.length === 0) {
    errors.push(`${label} must contain a non-empty name`);
  }
  if (manifest.version !== undefined && typeof manifest.version !== "string") {
    errors.push(`${label}.version must be a string`);
  }
  for (const field of ["description", "homepage", "repository", "license", "logo"]) {
    if (manifest[field] !== undefined && typeof manifest[field] !== "string") {
      errors.push(`${label}.${field} must be a string`);
    }
  }
  if (manifest.keywords !== undefined && !isStringArray(manifest.keywords)) {
    errors.push(`${label}.keywords must be an array of strings`);
  }
  if (manifest.author !== undefined) {
    if (!isRecord(manifest.author)) {
      errors.push(`${label}.author must be an object`);
    } else {
      for (const key of Object.keys(manifest.author)) {
        if (!["name", "email", "url"].includes(key)) errors.push(`${label}.author.${key} is not supported`);
        else if (typeof manifest.author[key] !== "string") errors.push(`${label}.author.${key} must be a string`);
      }
    }
  }
  if (allowSchema && manifest.$schema !== AGENT_PLUGINS_SCHEMA) {
    errors.push(`${label}.$schema must be ${AGENT_PLUGINS_SCHEMA}`);
  }
}

export function validateAgentPluginManifest(manifest, label = "plugin.json") {
  const errors = [];
  if (!isRecord(manifest)) {
    errors.push(`${label} must contain a JSON object`);
    return errors;
  }

  for (const key of Object.keys(manifest)) {
    if (!AGENT_PLUGIN_KEYS.has(key)) errors.push(`${label} contains unsupported top-level field: ${key}`);
  }
  validateMetadata(manifest, label, errors, { allowSchema: true });
  if (!pluginNameIsValid(manifest.name)) {
    errors.push(`${label}.name must use Agent Plugins 1.0 lowercase plugin-name rules`);
  }
  if (manifest.extensions !== undefined) {
    if (!isRecord(manifest.extensions)) {
      errors.push(`${label}.extensions must be an object`);
    } else {
      for (const [namespace, value] of Object.entries(manifest.extensions)) {
        if (!isRecord(value)) errors.push(`${label}.extensions.${namespace} must be an object`);
      }
    }
  }
  return errors;
}

function validateCursorManifest(manifest, label, errors) {
  if (!isRecord(manifest)) {
    errors.push(`${label} must contain a JSON object`);
    return;
  }
  for (const key of Object.keys(manifest)) {
    if (!CURSOR_MANIFEST_KEYS.has(key)) errors.push(`${label} contains unsupported field: ${key}`);
  }
  validateMetadata(manifest, label, errors);
  if (!pluginNameIsValid(manifest.name)) errors.push(`${label}.name must use lowercase plugin-name rules`);
  if (manifest.skills !== "./skills/") errors.push(`${label}.skills must be ./skills/`);
  if (manifest.hooks !== "./hooks/cursor/hooks.json") {
    errors.push(`${label}.hooks must be ./hooks/cursor/hooks.json`);
  }
}

function validateGeminiManifest(manifest, label, errors) {
  if (!isRecord(manifest)) {
    errors.push(`${label} must contain a JSON object`);
    return;
  }
  for (const key of Object.keys(manifest)) {
    if (!GEMINI_MANIFEST_KEYS.has(key)) errors.push(`${label} contains unsupported field: ${key}`);
  }
  validateMetadata(manifest, label, errors);
  if (!pluginNameIsValid(manifest.name)) errors.push(`${label}.name must use lowercase extension-name rules`);
}

function validateOpenCodeConfig(config, label, errors) {
  if (!isRecord(config)) {
    errors.push(`${label} must contain a JSON object`);
    return;
  }
  if (config.$schema !== "https://opencode.ai/config.json") {
    errors.push(`${label}.$schema must be https://opencode.ai/config.json`);
  }
  if (!isStringArray(config.skills)) {
    errors.push(`${label}.skills must be an array`);
    return;
  }
  if (!config.skills.includes("./skills")) {
    errors.push(`${label}.skills must include ./skills`);
  }
}

function readJson(root, relativePath, errors) {
  const filePath = join(root, relativePath);
  if (!existsSync(filePath)) {
    errors.push(`missing host integration file: ${relativePath}`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    errors.push(`invalid JSON: ${relativePath}`);
    return undefined;
  }
}

function requireFiles(root, relativePaths, errors) {
  for (const relativePath of relativePaths) {
    if (!existsSync(join(root, relativePath))) errors.push(`missing host integration file: ${relativePath}`);
  }
}

function requireVersion(manifest, label, version, errors) {
  if (manifest && manifest.version !== version) {
    errors.push(`${label}.version must match package.json (${version}), got ${String(manifest.version)}`);
  }
}

function hookHandlers(config, event, label, errors) {
  if (!isRecord(config) || !isRecord(config.hooks)) {
    errors.push(`${label} must contain a hooks object`);
    return [];
  }
  const unexpectedEvents = Object.keys(config.hooks).filter((configuredEvent) => configuredEvent !== event);
  if (unexpectedEvents.length > 0) {
    errors.push(`${label} must not configure unsupported hook events: ${unexpectedEvents.join(", ")}`);
  }
  const handlers = config.hooks[event];
  if (!Array.isArray(handlers) || handlers.length !== 1) {
    errors.push(`${label} must define exactly one ${event} hook`);
    return [];
  }
  return handlers;
}

function validateClaudeCodexHook(config, label, variable, adapter, errors) {
  const groups = hookHandlers(config, "SessionStart", label, errors);
  if (groups.length === 0) return;
  const group = groups[0];
  if (group.matcher !== "startup|resume|clear|compact") {
    errors.push(`${label} must preserve the startup|resume|clear|compact matcher`);
  }
  if (!Array.isArray(group.hooks) || group.hooks.length !== 1) {
    errors.push(`${label} must contain exactly one command handler`);
    return;
  }
  const handler = group.hooks[0];
  if (handler.type !== "command") errors.push(`${label} must use a command handler`);
  if (typeof handler.command !== "string" || !handler.command.includes(`${variable}/hooks/adapters/${adapter}`)) {
    errors.push(`${label} must invoke the ${adapter} adapter through ${variable}`);
  }
}

function validateGeminiHook(config, label, errors) {
  const groups = hookHandlers(config, "SessionStart", label, errors);
  if (groups.length === 0) return;
  const group = groups[0];
  if (Object.prototype.hasOwnProperty.call(group, "matcher")) {
    errors.push(`${label} must omit matcher for SessionStart`);
  }
  if (!Array.isArray(group.hooks) || group.hooks.length !== 1) {
    errors.push(`${label} must contain exactly one command handler`);
    return;
  }
  const handler = group.hooks[0];
  if (handler.type !== "command") errors.push(`${label} must use a command handler`);
  if (handler.name !== "freeflow-runtime-context") errors.push(`${label} must name the runtime-context hook`);
  if (
    typeof handler.command !== "string" ||
    !handler.command.includes("${extensionPath}/hooks/adapters/gemini-session-start.mjs")
  ) {
    errors.push(`${label} must invoke the Gemini adapter through ${extensionPath}`);
  }
  if (handler.timeout !== 5000) errors.push(`${label} must use a 5000ms timeout`);
}

function validateCursorHook(config, label, errors) {
  const handlers = hookHandlers(config, "sessionStart", label, errors);
  if (handlers.length === 0) return;
  const handler = handlers[0];
  if (typeof handler.command !== "string" || !handler.command.includes("hooks/adapters/cursor-session-start.mjs")) {
    errors.push(`${label} must invoke the Cursor adapter from the plugin root`);
  }
  if (handler.command?.includes("${")) errors.push(`${label} must not rely on an undocumented path placeholder`);
}

function validateCopilotHook(config, label, errors) {
  if (!isRecord(config) || config.version !== 1) errors.push(`${label} must declare hook configuration version 1`);
  const handlers = hookHandlers(config, "SessionStart", label, errors);
  if (handlers.length === 0) return;
  const handler = handlers[0];
  if (handler.type !== "command") errors.push(`${label} must use a command handler`);
  if (
    typeof handler.command !== "string" ||
    !handler.command.includes("${PLUGIN_ROOT}/hooks/adapters/copilot-session-start.mjs")
  ) {
    errors.push(`${label} must invoke the Copilot adapter through ${PLUGIN_ROOT}`);
  }
}

function frontmatterName(text) {
  const match = /^---\s*\n([\s\S]*?)\n---(?:\r?\n|$)/.exec(text);
  if (!match) return undefined;
  const nameLine = match[1].split(/\r?\n/).find((line) => /^name:\s*/.test(line));
  if (!nameLine) return undefined;
  return nameLine
    .slice("name:".length)
    .trim()
    .replace(/^("|')(.*)\1$/, "$2");
}

function validateSkillSurface(root, errors) {
  const skillsRoot = join(root, "skills");
  if (!existsSync(skillsRoot)) {
    errors.push("missing portable skills directory: skills/");
    return;
  }
  const skillDirectories = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
  if (skillDirectories.length !== 25) {
    errors.push(`portable skills directory must contain exactly 25 skills, found ${skillDirectories.length}`);
  }
  for (const directory of skillDirectories) {
    const name = frontmatterName(readFileSync(join(skillsRoot, directory, "SKILL.md"), "utf8"));
    if (name !== directory || !skillNameIsValid(name)) {
      errors.push(`skills/${directory}/SKILL.md must declare matching plain kebab-case name`);
    }
  }
  for (const duplicateRoot of [".github/skills", ".agents/skills", ".gemini/skills", ".kiro/skills"]) {
    if (existsSync(join(root, duplicateRoot)))
      errors.push(`duplicate maintained skill tree is not allowed: ${duplicateRoot}/`);
  }
}

export function validateHostManifests(root = process.cwd()) {
  const errors = [];
  const packageJson = readJson(root, "package.json", errors);
  const version = packageJson?.version;
  const rootManifest = readJson(root, "plugin.json", errors);
  const geminiManifest = readJson(root, "gemini-extension.json", errors);
  const openCodeConfig = readJson(root, "opencode.json", errors);
  const cursorManifest = readJson(root, ".cursor-plugin/plugin.json", errors);
  const codexManifest = readJson(root, ".codex-plugin/plugin.json", errors);
  const claudeManifest = readJson(root, ".claude-plugin/plugin.json", errors);
  const geminiHooks = readJson(root, "hooks/hooks.json", errors);
  const claudeHooks = readJson(root, "hooks/claude/hooks.json", errors);
  const codexHooks = readJson(root, "hooks/codex/hooks.json", errors);
  const cursorHooks = readJson(root, "hooks/cursor/hooks.json", errors);
  const copilotHooks = readJson(root, "com.github.copilot/hooks/hooks.json", errors);

  requireFiles(
    root,
    [
      "hooks/shared/runtime-context.mjs",
      "hooks/freeflow-runtime-context.mjs",
      "hooks/adapters/claude-session-start.mjs",
      "hooks/adapters/codex-session-start.mjs",
      "hooks/adapters/gemini-session-start.mjs",
      "hooks/adapters/cursor-session-start.mjs",
      "hooks/adapters/copilot-session-start.mjs",
    ],
    errors,
  );

  if (packageJson && !Array.isArray(packageJson.files)) errors.push("package.json.files must be an allowlist array");
  for (const requiredPattern of [
    "plugin.json",
    "gemini-extension.json",
    ".cursor-plugin/**",
    "com.github.copilot/**",
  ]) {
    if (!packageJson?.files?.includes(requiredPattern))
      errors.push(`package.json.files must include ${requiredPattern}`);
  }
  for (const keyword of PORTABLE_HOST_KEYWORDS) {
    if (!rootManifest?.keywords?.includes(keyword)) errors.push(`plugin.json.keywords must include ${keyword}`);
    if (!packageJson?.keywords?.includes(keyword)) errors.push(`package.json.keywords must include ${keyword}`);
  }

  errors.push(...validateAgentPluginManifest(rootManifest));
  validateGeminiManifest(geminiManifest, "gemini-extension.json", errors);
  validateOpenCodeConfig(openCodeConfig, "opencode.json", errors);
  validateCursorManifest(cursorManifest, ".cursor-plugin/plugin.json", errors);
  requireVersion(rootManifest, "plugin.json", version, errors);
  requireVersion(geminiManifest, "gemini-extension.json", version, errors);
  requireVersion(cursorManifest, ".cursor-plugin/plugin.json", version, errors);
  requireVersion(codexManifest, ".codex-plugin/plugin.json", version, errors);
  requireVersion(claudeManifest, ".claude-plugin/plugin.json", version, errors);

  if (!isRecord(rootManifest?.extensions) || !isRecord(rootManifest.extensions["com.github.copilot"])) {
    errors.push("plugin.json must reserve the com.github.copilot extension namespace");
  }
  if (codexManifest?.hooks !== "./hooks/codex/hooks.json") {
    errors.push(".codex-plugin/plugin.json must point to ./hooks/codex/hooks.json");
  }
  if (claudeManifest?.hooks !== "./hooks/claude/hooks.json") {
    errors.push(".claude-plugin/plugin.json must point to ./hooks/claude/hooks.json");
  }

  validateClaudeCodexHook(
    claudeHooks,
    "hooks/claude/hooks.json",
    "${CLAUDE_PLUGIN_ROOT}",
    "claude-session-start.mjs",
    errors,
  );
  validateClaudeCodexHook(codexHooks, "hooks/codex/hooks.json", "${PLUGIN_ROOT}", "codex-session-start.mjs", errors);
  validateGeminiHook(geminiHooks, "hooks/hooks.json", errors);
  validateCursorHook(cursorHooks, "hooks/cursor/hooks.json", errors);
  validateCopilotHook(copilotHooks, "com.github.copilot/hooks/hooks.json", errors);
  validateSkillSurface(root, errors);

  return { errors, version };
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const result = validateHostManifests(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`FAIL: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Host manifest check passed: Agent Plugins 1.0, Gemini, Cursor, Copilot/VS Code, Kiro, OpenCode, and Hermes surfaces share ${result.version}.`,
    );
  }
}
