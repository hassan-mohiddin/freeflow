import { DEFAULT_SCRIPT_DERIVE_CONFIG, SCRIPT_DERIVE_LANGUAGES } from "./config.js";
import type { ScriptDeriveConfig, ScriptDeriveLanguage } from "./types.js";

export const SCRIPT_SANDBOX_ADAPTER_CONTRACT_VERSION = 1;

export const SCRIPT_SANDBOX_REQUIRED_PROOFS = [
  "env_access_denied",
  "home_access_denied",
  "repo_access_denied",
  "vault_access_denied",
  "network_access_denied",
  "input_read_only",
  "output_escape_denied",
  "stdout_stderr_bounded",
  "timeout_enforced",
] as const;

export type ScriptSandboxProof = (typeof SCRIPT_SANDBOX_REQUIRED_PROOFS)[number];
export type ScriptSandboxAvailability = "available" | "unavailable";

export interface ScriptSandboxRuntimeInfo {
  name: string;
  version?: string;
}

export interface ScriptSandboxProbeResult {
  status: ScriptSandboxAvailability;
  reason: string;
  passedProofs: ScriptSandboxProof[];
  failedProofs: ScriptSandboxProof[];
  runtime?: ScriptSandboxRuntimeInfo;
}

export interface ScriptSandboxSourceMount {
  alias: string;
  path: string;
  bytes: number;
  sha256: string;
}

export interface ScriptSandboxExecutionRequest {
  language: ScriptDeriveLanguage;
  code: string;
  inputDir: string;
  workDir: string;
  outputDir: string;
  sources: ScriptSandboxSourceMount[];
  limits: ScriptDeriveConfig["limits"];
  network: ScriptDeriveConfig["network"];
}

export interface ScriptSandboxExecutionResult {
  status: "success" | "failed" | "timed_out" | "policy_violation";
  stdout: string;
  stderr: string;
  outputFiles: Array<{ path: string; bytes: number; sha256?: string }>;
  exitCode?: number | null;
  durationMs?: number;
  reason?: string;
}

export interface ScriptSandboxAdapter {
  id: string;
  version: string;
  languages: readonly ScriptDeriveLanguage[];
  probe(language: ScriptDeriveLanguage, config: ScriptDeriveConfig): Promise<ScriptSandboxProbeResult>;
  execute(request: ScriptSandboxExecutionRequest): Promise<ScriptSandboxExecutionResult>;
}

export interface ScriptSandboxCandidateMechanism {
  id: string;
  languages: readonly ScriptDeriveLanguage[];
  status: "rejected" | "candidate_unproven";
  reason: string;
}

export interface ScriptSandboxLanguageStatus {
  language: ScriptDeriveLanguage;
  status: ScriptSandboxAvailability;
  reason: string;
  adapterId?: string;
  adapterVersion?: string;
  runtime?: ScriptSandboxRuntimeInfo;
  requiredProofs: ScriptSandboxProof[];
  passedProofs: ScriptSandboxProof[];
  failedProofs: ScriptSandboxProof[];
}

export interface ScriptSandboxProbeReport {
  contractVersion: number;
  sandbox: ScriptDeriveConfig["sandbox"];
  network: ScriptDeriveConfig["network"];
  configuredLanguages: ScriptDeriveLanguage[];
  adapterAvailable: boolean;
  adapterStatus: ScriptSandboxAvailability;
  availableLanguages: ScriptDeriveLanguage[];
  unavailableLanguages: ScriptSandboxLanguageStatus[];
  languages: ScriptSandboxLanguageStatus[];
  registeredAdapters: Array<{ id: string; version: string; languages: ScriptDeriveLanguage[] }>;
  requiredProofs: ScriptSandboxProof[];
  candidateMechanisms: ScriptSandboxCandidateMechanism[];
  notes: string[];
}

export const SCRIPT_SANDBOX_CANDIDATE_MECHANISMS: ScriptSandboxCandidateMechanism[] = [
  {
    id: "node-vm",
    languages: ["javascript"],
    status: "rejected",
    reason: "Node vm or an unsandboxed Node subprocess does not isolate filesystem, environment, child process, or network access to the Freeflow contract.",
  },
  {
    id: "plain-python-subprocess",
    languages: ["python"],
    status: "rejected",
    reason: "A Python subprocess without OS isolation can access ambient filesystem, environment, imports, and network.",
  },
  {
    id: "plain-jq-subprocess",
    languages: ["jq"],
    status: "rejected",
    reason: "A jq subprocess still needs an OS sandbox before Freeflow can prove filesystem, output, and network boundaries.",
  },
  {
    id: "os-sandbox-adapter",
    languages: [...SCRIPT_DERIVE_LANGUAGES],
    status: "candidate_unproven",
    reason: "An OS-level sandbox may be acceptable only after an adapter implementation passes all required adversarial proofs on the target platform.",
  },
];

export interface ProbeScriptSandboxAdaptersOptions {
  config?: ScriptDeriveConfig;
  adapters?: readonly ScriptSandboxAdapter[];
}

export async function probeScriptSandboxAdapters(options: ProbeScriptSandboxAdaptersOptions = {}): Promise<ScriptSandboxProbeReport> {
  const config = cloneScriptDeriveConfig(options.config ?? DEFAULT_SCRIPT_DERIVE_CONFIG);
  const adapters = options.adapters ?? [];
  const statuses: ScriptSandboxLanguageStatus[] = [];

  for (const language of config.languages) {
    statuses.push(await probeLanguage(language, config, adapters));
  }

  const availableLanguages = statuses.filter((status) => status.status === "available").map((status) => status.language);
  const unavailableLanguages = statuses.filter((status) => status.status === "unavailable");

  return {
    contractVersion: SCRIPT_SANDBOX_ADAPTER_CONTRACT_VERSION,
    sandbox: config.sandbox,
    network: config.network,
    configuredLanguages: [...config.languages],
    adapterAvailable: availableLanguages.length > 0,
    adapterStatus: availableLanguages.length > 0 ? "available" : "unavailable",
    availableLanguages,
    unavailableLanguages,
    languages: statuses,
    registeredAdapters: adapters.map((adapter) => ({ id: adapter.id, version: adapter.version, languages: [...adapter.languages] })),
    requiredProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
    candidateMechanisms: SCRIPT_SANDBOX_CANDIDATE_MECHANISMS.map((candidate) => ({ ...candidate, languages: [...candidate.languages] })),
    notes: [
      "Script derive has no unsandboxed fallback.",
      "Languages remain unavailable until a registered adapter passes every required proof.",
      "Adapter availability alone does not execute scripts while scriptDerive.enabled is false.",
    ],
  };
}

export async function selectScriptSandboxAdapter(
  language: ScriptDeriveLanguage,
  config: ScriptDeriveConfig,
  adapters: readonly ScriptSandboxAdapter[] = [],
): Promise<
  | { ok: true; adapter: ScriptSandboxAdapter; status: ScriptSandboxLanguageStatus }
  | { ok: false; status: ScriptSandboxLanguageStatus }
> {
  const status = await probeLanguage(language, cloneScriptDeriveConfig(config), adapters);
  if (status.status !== "available" || !status.adapterId) {
    return { ok: false, status };
  }
  const adapter = adapters.find((candidate) => candidate.id === status.adapterId);
  if (!adapter) {
    return {
      ok: false,
      status: {
        ...status,
        status: "unavailable",
        reason: `Adapter ${status.adapterId} passed probing but is not registered for execution.`,
        failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
      },
    };
  }
  return { ok: true, adapter, status };
}

async function probeLanguage(
  language: ScriptDeriveLanguage,
  config: ScriptDeriveConfig,
  adapters: readonly ScriptSandboxAdapter[],
): Promise<ScriptSandboxLanguageStatus> {
  if (!config.languages.includes(language)) {
    return unavailableLanguageStatus(language, `Language ${language} is not enabled by scriptDerive.languages.`);
  }

  const matchingAdapters = adapters.filter((adapter) => adapter.languages.includes(language));
  if (matchingAdapters.length === 0) {
    return unavailableLanguageStatus(language, `No script derive sandbox adapter is registered for language ${language}.`);
  }

  const failedStatuses: ScriptSandboxLanguageStatus[] = [];

  for (const adapter of matchingAdapters) {
    try {
      const probe = await adapter.probe(language, config);
      if (probe.status === "available" && hasEveryRequiredProof(probe.passedProofs)) {
        const status: ScriptSandboxLanguageStatus = {
          language,
          status: "available",
          reason: probe.reason,
          adapterId: adapter.id,
          adapterVersion: adapter.version,
          requiredProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
          passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
          failedProofs: [],
        };
        if (probe.runtime) {
          status.runtime = probe.runtime;
        }
        return status;
      }
      const failedProofs = missingRequiredProofs(probe.passedProofs, probe.failedProofs);
      const status: ScriptSandboxLanguageStatus = {
        language,
        status: "unavailable",
        reason: probe.reason || `Adapter ${adapter.id} did not pass every required proof for ${language}.`,
        adapterId: adapter.id,
        adapterVersion: adapter.version,
        requiredProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        passedProofs: dedupeProofs(probe.passedProofs),
        failedProofs,
      };
      if (probe.runtime) {
        status.runtime = probe.runtime;
      }
      failedStatuses.push(status);
    } catch (error) {
      failedStatuses.push({
        ...unavailableLanguageStatus(language, `Adapter ${adapter.id} probe failed for ${language}: ${errorMessage(error)}`),
        adapterId: adapter.id,
        adapterVersion: adapter.version,
      });
    }
  }

  const bestFailure = bestUnavailableStatus(failedStatuses);
  if (bestFailure) {
    return {
      ...bestFailure,
      reason: `No script derive sandbox adapter passed required proofs for language ${language}. Best failure from ${bestFailure.adapterId ?? "unknown adapter"}: ${bestFailure.reason}`,
    };
  }

  return unavailableLanguageStatus(language, `No script derive sandbox adapter passed required proofs for language ${language}.`);
}

function bestUnavailableStatus(statuses: readonly ScriptSandboxLanguageStatus[]): ScriptSandboxLanguageStatus | undefined {
  let best: ScriptSandboxLanguageStatus | undefined;
  for (const status of statuses) {
    if (!best || status.passedProofs.length > best.passedProofs.length) {
      best = status;
    }
  }
  return best;
}

function unavailableLanguageStatus(language: ScriptDeriveLanguage, reason: string): ScriptSandboxLanguageStatus {
  return {
    language,
    status: "unavailable",
    reason,
    requiredProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
    passedProofs: [],
    failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
  };
}

function hasEveryRequiredProof(proofs: readonly ScriptSandboxProof[]): boolean {
  return SCRIPT_SANDBOX_REQUIRED_PROOFS.every((proof) => proofs.includes(proof));
}

function missingRequiredProofs(passedProofs: readonly ScriptSandboxProof[], failedProofs: readonly ScriptSandboxProof[] = []): ScriptSandboxProof[] {
  const missing = SCRIPT_SANDBOX_REQUIRED_PROOFS.filter((proof) => !passedProofs.includes(proof));
  return dedupeProofs([...failedProofs, ...missing]);
}

function dedupeProofs(proofs: readonly ScriptSandboxProof[]): ScriptSandboxProof[] {
  const result: ScriptSandboxProof[] = [];
  for (const proof of proofs) {
    if (SCRIPT_SANDBOX_REQUIRED_PROOFS.includes(proof) && !result.includes(proof)) {
      result.push(proof);
    }
  }
  return result;
}

function cloneScriptDeriveConfig(config: ScriptDeriveConfig): ScriptDeriveConfig {
  return {
    ...config,
    languages: [...config.languages],
    limits: { ...config.limits },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
