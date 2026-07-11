import { spawnSync } from "node:child_process";

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
    capabilities: {
      one_shot_json: available && text.includes("--mode <mode>") && text.includes("json"),
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

export function capabilitiesFor(host) {
  if (host === "none") {
    return {
      id: "none",
      available: true,
      version: null,
      capabilities: {
        structure: true,
      },
    };
  }
  if (host === "pi") return probePi();
  return { id: host, available: false, version: null, capabilities: {} };
}

export function supportedEvidenceClasses(host, mode) {
  if (host === "none" || mode === "deterministic") return new Set(["structure"]);
  if (host === "pi" && mode === "json") {
    return new Set(["structure", "explicit-instruction", "native-activation", "artifact-outcome"]);
  }
  return new Set();
}
