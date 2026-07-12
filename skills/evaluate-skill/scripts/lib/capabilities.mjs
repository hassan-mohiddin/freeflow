import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { startRpcClient } from "./rpc-client.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    command,
    args,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

export function probePi() {
  const version = run("pi", ["--version"]);
  const help = run("pi", ["--help"]);
  const available = version.status === 0 && help.status === 0;
  const text = help.stdout;

  return {
    id: "pi",
    available,
    version: available ? version.stdout.trim() : null,
    error: available ? null : version.error ?? version.stderr.trim() ?? help.stderr.trim(),
    rpc_error: null,
    capabilities: {
      one_shot_json: available && text.includes("--mode <mode>") && text.includes("json"),
      rpc_jsonl: false,
      native_skill_loading: available && text.includes("--skill <path>"),
      explicit_extensions: available && text.includes("--extension"),
      disable_extension_discovery: available && text.includes("--no-extensions"),
      disable_context_files: available && text.includes("--no-context-files"),
      tool_allowlist: available && text.includes("--tools"),
      usage_events: available,
      multi_turn: false,
      strict_tool_isolation: available && text.includes("--extension") && text.includes("--tools"),
    },
  };
}

export async function probePiRpc(base = probePi(), dependencies = {}) {
  if (!base.available) return base;
  const startClient = dependencies.startRpcClient ?? startRpcClient;
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-pi-rpc-probe-"));
  const configDir = resolve(root, "pi-config");
  let client = null;
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(resolve(configDir, "settings.json"), `${JSON.stringify({
      defaultProjectTrust: "never",
      enableInstallTelemetry: false,
      enableUpdateCheck: false,
      quietStartup: true,
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    }, null, 2)}\n`);
    client = await startClient("pi", [
      "--mode", "rpc",
      "--no-session",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-approve",
      "--offline",
      "--no-tools",
    ], {
      env: { ...process.env, PI_CODING_AGENT_DIR: configDir, PI_TELEMETRY: "0" },
      timeoutMs: 10000,
      outputLimitBytes: 1024 * 1024,
      transportLimitBytes: 2 * 1024 * 1024,
    });
    const retry = await client.request("set_auto_retry", { enabled: false });
    const compaction = await client.request("set_auto_compaction", { enabled: false });
    const state = await client.request("get_state");
    const commands = await client.request("get_commands");
    const processResult = await client.dispose();
    const supported = retry.success
      && compaction.success
      && state.success
      && commands.success
      && state.data?.isStreaming === false
      && state.data?.isCompacting === false
      && state.data?.messageCount === 0
      && processResult.code === 0
      && !processResult.timed_out
      && !processResult.output_limit_exceeded
      && !processResult.transport_limit_exceeded
      && !processResult.protocol_failed;
    return {
      ...base,
      rpc_error: supported ? null : "Pi RPC handshake returned an unsupported state",
      capabilities: { ...base.capabilities, rpc_jsonl: supported, multi_turn: supported },
    };
  } catch (error) {
    return {
      ...base,
      rpc_error: error instanceof Error ? error.message : String(error),
      capabilities: { ...base.capabilities, rpc_jsonl: false, multi_turn: false },
    };
  } finally {
    if (client) await client.dispose().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}

export function probeCodex(dependencies = {}) {
  const runVersion = dependencies.run ?? run;
  const version = runVersion("codex", ["--version"]);
  const available = version.status === 0;
  const value = available ? version.stdout.trim() : null;
  const provenVersion = value === "codex-cli 0.144.1";
  return {
    id: "codex",
    available,
    version: value,
    error: available ? null : version.error ?? version.stderr.trim(),
    fidelity: "diagnostic",
    isolation_profile: "codex-diagnostic-macos-v1",
    capabilities: {
      exec_jsonl: provenVersion,
      isolated_home: provenVersion,
      strict_config: provenVersion,
      ephemeral: provenVersion,
      ignore_rules: provenVersion,
      ambient_context_disabled: provenVersion,
      explicit_skill: provenVersion,
      strict_filesystem_isolation: provenVersion,
      network_disabled: provenVersion,
      process_limits: provenVersion,
      provider_request_bound: false,
      spend_bound: false,
    },
  };
}

export async function capabilitiesFor(host, mode) {
  if (host === "none") {
    return {
      id: "none",
      available: true,
      version: null,
      capabilities: { structure: true },
    };
  }
  if (host === "pi") {
    const base = probePi();
    return mode === "rpc-scripted" ? probePiRpc(base) : base;
  }
  if (host === "codex") return probeCodex();
  return { id: host, available: false, version: null, capabilities: {} };
}

export function supportedEvidenceClasses(host, mode) {
  if (host === "none" || mode === "deterministic") return new Set(["structure"]);
  if (host === "pi" && mode === "json") {
    return new Set(["structure", "explicit-instruction", "native-activation", "artifact-outcome"]);
  }
  if (host === "pi" && mode === "rpc-scripted") {
    return new Set(["structure", "explicit-instruction", "native-activation", "artifact-outcome", "multi-turn"]);
  }
  if (host === "codex" && mode === "exec") return new Set(["structure", "explicit-instruction", "native-activation", "artifact-outcome"]);
  return new Set();
}
