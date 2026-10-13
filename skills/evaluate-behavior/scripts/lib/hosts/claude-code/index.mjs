// The Claude Code host adapter: subjects, judges and simulated users run in headless Claude Code (`claude -p`),
// behind the interface in ../index.mjs. Logins come only from the evaluator's environment (isolation.mjs); what a
// definition may ask of this host is in constraints.mjs.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { baseProcessEnvironment } from "../../process.mjs";
import { probeClaudeShell } from "./confinement.mjs";
import { prepareClaudeIsolation } from "./isolation.mjs";
import { prepareClaudeLaunch } from "./launch.mjs";
import { launchClaudeModel } from "./model-call.mjs";
import { runClaudeOneShot, runClaudeSession } from "./session.mjs";

const run = promisify(execFile);

export const claudeCodeHost = Object.freeze({
  name: "claude-code",
  label: "Claude Code",
  command: "claude",

  /** The installed Claude Code's version: the first word `claude --version` prints, such as 2.1.296. */
  async version(environment = baseProcessEnvironment()) {
    const { stdout } = await run("claude", ["--version"], { env: environment, timeout: 30000 });
    return stdout.trim().split(/\s+/)[0] ?? "";
  },

  /** Claude Code loads no Pi packages; definitions refuse them, so any reaching here is an error. */
  async resolveExtensions(declared) {
    if (declared.length > 0) throw new Error("Claude Code loads no host extensions");
    return [];
  },

  /** Logins come from the environment and are never copied, so there is nothing to refresh. */
  async refreshLogins() {},

  /** No evaluator defaults are settings; Claude Code's switches are environment variables (launch.mjs). */
  effectiveSettings: (declared = {}) => ({ ...declared }),
  prepareIsolation: prepareClaudeIsolation,
  /** No credential is ever written into the isolation, so nothing is removed. */
  async removeCredentials() {},

  prepareLaunch: prepareClaudeLaunch,
  runOneShot: runClaudeOneShot,
  runSession: runClaudeSession,
  modelCall: launchClaudeModel,
  probeShell: probeClaudeShell,
});
