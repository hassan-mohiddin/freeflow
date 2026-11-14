// Task memory's mode for this store (D-060, Setting 2): `local` (on, this machine: the store never pushes or pulls),
// `sync` (on, with the store's private remote) or `off` (nothing is recorded or synced). It is the settings' own
// memory.mode, read through the settings layers the hosts read: session, then this folder, then everywhere, then the
// default (`local`), with a value ticked for this harness winning within its layer.
import {
  readConfigFile,
  readSessionSettings,
  resolveSetting,
  sessionId,
} from "../../../../pi-extension/dist/host/config-store.js";
import { HARNESSES, settingSpec } from "../../../../pi-extension/dist/host/config-validation.js";

/** The harness this process runs for, as the settings name it: FREEFLOW_HARNESS, else Claude Code's session. */
function harnessOf(env) {
  if (HARNESSES.includes(env.FREEFLOW_HARNESS)) return env.FREEFLOW_HARNESS;
  return env.CLAUDE_CODE_SESSION_ID ? "claude-code" : null;
}

/** The memory mode the settings give for this folder and home; `local` when none is set. */
export function memoryModeFor({ home, cwd = process.cwd(), env = process.env }) {
  const repository = readConfigFile(cwd, "repository", home).value;
  const personal = readConfigFile(cwd, "personal", home).value;
  const session = readSessionSettings(home, sessionId(env));
  const spec = settingSpec("memory.mode");
  return resolveSetting(spec, { repository, personal, session }, harnessOf(env)).value ?? "local";
}
