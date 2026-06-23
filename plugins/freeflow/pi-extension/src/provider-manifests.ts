import { normalizeProvidersConfig } from "../../router/dist/index.js";
import { isMcpServerConfigured } from "./mcp-capture.js";

const MAX_CAPABILITIES = 6;
const MAX_PAIRING_RULES = 4;
const MAX_LINE_LENGTH = 180;
const CONTROL_TEXT_PATTERN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;

export const BUILT_IN_PROVIDER_MANIFESTS = [
  {
    id: "serena",
    displayName: "Serena",
    producerKind: "mcp",
    capabilities: [
      {
        id: "code.symbol.find",
        category: "symbols",
        useWhen: "Need read-only code-symbol discovery beyond text search.",
        risk: "read",
      },
      {
        id: "code.references.find",
        category: "references",
        useWhen: "Need real references, not text matches.",
        risk: "read",
      },
      {
        id: "code.diagnostics.read",
        category: "diagnostics",
        useWhen: "Need read-only diagnostics from the language backend.",
        risk: "read",
      },
    ],
    pairingRules: [
      "Use Serena through freeflow_capture for the configured read-only evidence categories.",
      "Call Serena mutating refactor tools directly only after explicit user intent; then use Freeflow retrieve/run/review/verify for evidence and closeout.",
    ],
  },
  {
    id: "codebase-memory",
    displayName: "codebase-memory",
    producerKind: "mcp",
    capabilities: [
      {
        id: "code.graph.search",
        category: "graph",
        useWhen: "Need read-only graph/search evidence from a configured codebase memory provider.",
        risk: "read",
      },
      {
        id: "code.architecture.read",
        category: "architecture",
        useWhen: "Need read-only architecture or relationship memory from a configured provider.",
        risk: "read",
      },
    ],
    pairingRules: [
      "Use codebase-memory only when a safe read-only adapter is configured; recover important evidence through Freeflow routing.",
    ],
  },
];

export function validateProviderManifest(value, source = "custom") {
  const issues = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Expected provider manifest object." }] };
  }

  validateNonEmptyString(value.id, "$.id", issues);
  validateNonEmptyString(value.displayName, "$.displayName", issues);
  validateNonEmptyString(value.producerKind, "$.producerKind", issues);

  if (!Array.isArray(value.capabilities) || value.capabilities.length === 0) {
    issues.push({ path: "$.capabilities", message: "Expected one or more provider capabilities." });
  } else if (value.capabilities.length > MAX_CAPABILITIES) {
    issues.push({ path: "$.capabilities", message: `Expected at most ${MAX_CAPABILITIES} provider capabilities.` });
  } else {
    value.capabilities.forEach((capability, index) => validateCapability(capability, `$.capabilities[${index}]`, issues));
  }

  if (value.pairingRules !== undefined) {
    if (!Array.isArray(value.pairingRules)) {
      issues.push({ path: "$.pairingRules", message: "Expected pairingRules to be an array of strings." });
    } else if (value.pairingRules.length > MAX_PAIRING_RULES) {
      issues.push({ path: "$.pairingRules", message: `Expected at most ${MAX_PAIRING_RULES} pairing rules.` });
    } else {
      value.pairingRules.forEach((rule, index) => validateNonEmptyString(rule, `$.pairingRules[${index}]`, issues));
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      id: value.id.trim(),
      displayName: value.displayName.trim(),
      producerKind: value.producerKind.trim(),
      capabilities: value.capabilities.map((capability) => ({
        id: capability.id.trim(),
        useWhen: capability.useWhen.trim(),
        risk: capability.risk.trim(),
      })),
      pairingRules: Array.isArray(value.pairingRules) ? value.pairingRules.map((rule) => rule.trim()) : [],
      source,
    },
  };
}

export async function providerRuntimeContext(cwd, freeflowConfig = {}) {
  const config = isRecord(freeflowConfig) ? freeflowConfig : {};
  const providersConfig = (config as any).providers;
  const normalizedProviders = normalizeProvidersConfig(providersConfig).config;
  const enabledProviders = configuredProviderMap(normalizedProviders);
  const customManifests = configuredCustomManifests(providersConfig);
  const builtIns = new Map(BUILT_IN_PROVIDER_MANIFESTS.map((manifest) => [manifest.id, manifest]));
  const available = [];
  const unavailable = [];
  const invalidCustom = [];

  if (await isMcpServerConfigured("serena", cwd)) {
    available.push({ manifest: builtIns.get("serena"), label: "built-in", enablement: enabledProviders.get("serena") });
  } else if (enabledProviders.has("serena")) {
    unavailable.push({ manifest: builtIns.get("serena"), reason: "MCP server serena is not configured for Pi." });
  }

  if (enabledProviders.has("codebase-memory")) {
    unavailable.push({ manifest: builtIns.get("codebase-memory"), reason: "No Pi read-only capture adapter is registered yet." });
  }

  for (const [index, rawManifest] of customManifests.entries()) {
    const validated = validateProviderManifest(rawManifest, "custom");
    if (!validated.ok) {
      invalidCustom.push({ index, issues: validated.issues });
      continue;
    }
    if (!enabledProviders.has(validated.value.id)) {
      continue;
    }
    available.push({ manifest: validated.value, label: "custom/unverified", enablement: enabledProviders.get(validated.value.id) });
  }

  return renderProviderRuntimeContext({ available, unavailable, invalidCustom });
}

function renderProviderRuntimeContext({ available, unavailable, invalidCustom }) {
  if (available.length === 0 && unavailable.length === 0 && invalidCustom.length === 0) {
    return "";
  }

  const lines = ["## Freeflow Producer Providers"];

  if (available.length > 0) {
    lines.push("", "Available:");
    for (const entry of available) {
      lines.push(...renderProviderEntry(entry.manifest, entry.label, entry.enablement));
    }
  }

  if (unavailable.length > 0) {
    lines.push("", "Unavailable but configured:");
    for (const entry of unavailable) {
      lines.push(`- ${truncate(entry.manifest.displayName)}: ${truncate(entry.reason)}`);
    }
  }

  if (invalidCustom.length > 0) {
    lines.push("", `Ignored custom manifests: ${invalidCustom.length} invalid manifest(s). They are not injected as provider guidance.`);
  }

  return lines.join("\n");
}

function renderProviderEntry(manifest, label, enablement) {
  const labelText = label === "custom/unverified" ? " (custom/unverified)" : "";
  const displayName = truncate(manifest.displayName);
  const capabilities = filterCapabilitiesByEnablement(manifest.capabilities, enablement)
    .slice(0, MAX_CAPABILITIES);
  const capabilityText = capabilities.length > 0
    ? capabilities.map((capability) => capability.useWhen).join(" ")
    : "No built-in capability summary matches the configured provider categories.";
  const lines = [`- ${displayName}${labelText}: ${truncate(capabilityText)}`];

  for (const rule of manifest.pairingRules.slice(0, 2)) {
    lines.push(`  Pairing: ${truncate(rule)}`);
  }

  return lines;
}

function filterCapabilitiesByEnablement(capabilities, enablement) {
  if (!enablement || !Array.isArray(enablement.categories) || enablement.categories.length === 0) {
    return capabilities;
  }

  const categories = new Set(enablement.categories);
  return capabilities.filter((capability) => categories.has(capability.category));
}

function configuredProviderMap(providersConfig) {
  const enabled = new Map();
  if (!isRecord(providersConfig) || !Array.isArray(providersConfig.enabled)) {
    return enabled;
  }

  for (const entry of providersConfig.enabled) {
    if (isRecord(entry) && typeof entry.id === "string" && entry.id.trim().length > 0) {
      enabled.set(entry.id.trim(), entry);
    }
  }

  return enabled;
}

function configuredCustomManifests(providersConfig) {
  if (!isRecord(providersConfig)) {
    return [];
  }
  if (Array.isArray(providersConfig.manifests)) {
    return providersConfig.manifests;
  }
  if (Array.isArray(providersConfig.customManifests)) {
    return providersConfig.customManifests;
  }
  return [];
}

function validateCapability(value, path, issues) {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected capability object." });
    return;
  }
  validateNonEmptyString(value.id, `${path}.id`, issues);
  validateNonEmptyString(value.useWhen, `${path}.useWhen`, issues);
  if (typeof value.risk !== "string" || !["read", "write", "unknown"].includes(value.risk)) {
    issues.push({ path: `${path}.risk`, message: "Expected risk read, write, or unknown." });
  }
}

function validateNonEmptyString(value, path, issues) {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: "Expected non-empty string." });
    return;
  }
  if (CONTROL_TEXT_PATTERN.test(value)) {
    issues.push({ path, message: "Expected single-line string without control characters." });
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(value) {
  const singleLine = String(value).replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  if (singleLine.length <= MAX_LINE_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, MAX_LINE_LENGTH - 1)}…`;
}
