// Evaluation hosts. A host is the agent program that runs a subject's model and tools (Pi today). The evaluator's
// core is host-neutral; each host's adapter implements the same interface:
//
// - name, label, command; version(environment): the installed host's version.
// - resolveExtensions(declared, { deferSources }): declared host extensions, found among the installed ones.
// - refreshLogins(providers): make every login a batch uses valid before it starts.
// - effectiveSettings(declared): the evaluator's host defaults with declared settings winning.
// - prepareIsolation(directory, model, { settings }) -> { environment, evidence }: a private home, temp and host
//   configuration for one process, with only the declared provider's login; removeCredentials(directory) after.
// - prepareLaunch(context) -> { args, environment }: one subject's arguments and the host's own variables.
// - runOneShot(options), runSession(options): run a subject and return the normalized observation (see subject.mjs).
// - modelCall(directory, prompt, options): one tool-less call for a judge, reviewer or simulated user.
// - probeShell(options): run the shell tier's confinement probes through the host (see shell.mjs).
//
// Names a definition may use are in names.mjs, which definitions.mjs reads without loading any adapter.

import { piHost } from "./pi/index.mjs";

const ADAPTERS = new Map([[piHost.name, piHost]]);

/** The adapter for a host name; an unknown name is an error, never a fallback to Pi. */
export function hostAdapter(name) {
  const adapter = ADAPTERS.get(name);
  if (adapter === undefined) throw new Error(`unknown evaluation host: ${name}`);
  return adapter;
}
