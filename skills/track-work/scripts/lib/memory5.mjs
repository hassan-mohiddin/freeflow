// Task memory's mode for this store (D-060, Setting 2): `local` (on, this machine: the store never pushes or pulls),
// `sync` (on, with the store's private remote) or `off` (nothing is recorded or synced). It is the settings' own
// memory.mode, read through the settings layers the hosts read: session, then this folder, then everywhere, then the
// default: `sync` when the store has a remote, else `local` (round 3). A value ticked for this harness wins within its
// layer.
import {
  readConfigFile,
  readSessionSettings,
  resolveSetting,
  sessionId,
} from "../../../../pi-extension/dist/host/config-store.js";
import { HARNESSES, harnessNamed, settingSpec } from "../../../../pi-extension/dist/host/config-validation.js";

/** The harness this process runs for, as the settings name it: FREEFLOW_HARNESS (a driver's name, such as "Pi", included), else Claude Code's session. */
function harnessOf(env) {
  const named = harnessNamed(env.FREEFLOW_HARNESS);
  if (HARNESSES.includes(named)) return named;
  return env.CLAUDE_CODE_SESSION_ID ? "claude-code" : null;
}

/**
 * The memory mode the settings give for this folder and home: an explicit value wins; unset, `sync` when the store has a
 * remote and `local` when it does not (D-060, round 3).
 */
export function memoryModeFor({ home, cwd = process.cwd(), env = process.env }) {
  const repository = readConfigFile(cwd, "repository", home).value;
  const personal = readConfigFile(cwd, "personal", home).value;
  const session = readSessionSettings(home, sessionId(env));
  const spec = settingSpec("memory.mode");
  return resolveSetting(spec, { repository, personal, session }, harnessOf(env), home).value ?? "local";
}
