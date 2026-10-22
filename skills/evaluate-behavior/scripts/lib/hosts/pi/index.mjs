// The Pi host adapter: everything the evaluator does that depends on Pi, behind the interface in ../index.mjs.

import { installedHostVersion } from "../../identity.mjs";
import { baseProcessEnvironment } from "../../process.mjs";
import { probeShell } from "./confinement.mjs";
import { effectivePiSettings, ensureLogin, resolveHostExtensions } from "./host.mjs";
import { prepareIsolation, removeCopiedCredentials, TARGET_MINUTES } from "./isolation.mjs";
import { launchModel } from "./model-call.mjs";
import { piArguments, runPiProcess } from "./process.mjs";
import { runRpcBodySession } from "./rpc.mjs";

export const piHost = Object.freeze({
  name: "pi",
  label: "Pi",
  command: "pi",

  /** The installed Pi's version, as `pi --version` prints it. */
  version: (environment = baseProcessEnvironment()) => installedHostVersion("pi", environment),

  resolveExtensions: resolveHostExtensions,

  /** Makes each provider's stored OAuth login valid for the target window, once, before a batch. */
  async refreshLogins(providers) {
    for (const provider of providers)
      await ensureLogin(provider, { threshold: TARGET_MINUTES, target: TARGET_MINUTES });
  },

  effectiveSettings: effectivePiSettings,
  prepareIsolation,
  removeCredentials: removeCopiedCredentials,

  /** Pi's arguments and its own environment switches for one subject. */
  async prepareLaunch({
    group,
    variant,
    environment,
    runtime,
    mode,
    observeContext,
    sessionDirectory,
    model,
    freeflowEntry,
    hostExtensions,
  }) {
    return {
      args: piArguments(
        group,
        environment,
        runtime,
        mode,
        observeContext,
        sessionDirectory,
        model,
        freeflowEntry,
        hostExtensions,
        group.variants[variant]?.shell?.container !== undefined,
      ),
      environment: { PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" },
    };
  },

  /** One prompt in JSON mode; the prompt is the last argument. */
  runOneShot: runPiProcess,

  /** A persistent RPC session over the declared prompts, then any `nextPrompt` replies. */
  runSession: runRpcBodySession,

  modelCall: launchModel,
  probeShell,
});
