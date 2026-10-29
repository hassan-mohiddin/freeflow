// The pilot's harness check: before a pilot's first subject, every selected arm whose subject has a shell runs five
// probes through its own host and extensions, with the shell tier's local scripted model, so no model is called. It
// shows what the shell and the host's permissions do with commands a subject commonly sends: one in the workspace,
// one naming a path outside it, the first again (a host can deny the shell for the rest of a run after the second), a
// scratch write under /tmp, and which interpreters the shell has. The findings apply to every arm: the pilot stops
// when the shell stopped working after a probe, or when two arms of a group found different things, since the arms
// would then differ in more than their component; otherwise the findings are recorded and printed.

import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { SHELL_TOOLS } from "../guard-rules.mjs";
import { hostAdapter } from "./hosts/index.mjs";
import { runShellProbes } from "./shell.mjs";

const OUTPUT_TAIL = 2000;
const TOOLS = ["node", "python3", "git"];

/**
 * The probes, in the order they run; `outside-path` comes between the two runs of the same workspace command. Each
 * ends by printing `marker`, so a probe counts as run only when the shell ran it through: a host or an isolation can
 * refuse a command with an ordinary result as well as an error.
 */
function harnessProbes(nonce, marker) {
  const scratch = `/tmp/skill-eval-harness-${nonce}`;
  return [
    { id: "workspace", purpose: "a command in the workspace runs", command: `pwd && echo ${marker}` },
    {
      id: "outside-path",
      purpose: "a command naming a path outside the workspace",
      command: `cd /tmp && pwd && echo ${marker}`,
    },
    {
      id: "workspace-again",
      purpose: "the first command again: the shell still runs after the path outside the workspace",
      command: `pwd && echo ${marker}`,
    },
    {
      id: "tmp-write",
      purpose: "a scratch write under /tmp",
      command: `printf ok > ${scratch} && cat ${scratch} && rm -f ${scratch} && echo ${marker}`,
    },
    {
      // `command -v` prints the tool's path to stderr, so the command itself names no path.
      id: "tools",
      purpose: `which of ${TOOLS.join(", ")} the shell has`,
      command: `${TOOLS.map((tool) => `if command -v ${tool} >&2; then echo "${tool}: yes"; else echo "${tool}: no"; fi`).join("; ")}; echo ${marker}`,
    },
  ];
}

/**
 * Runs the harness probes for one arm and writes `harness.json` in `directory`. The record's `findings` are what
 * the arms of a group are compared on.
 *
 * @param {{ arm: string, host?: string, shell: any, extensions: any[], directory: string, groupDirectory: string, signal?: AbortSignal }} options
 */
export async function checkHarness({ arm, host = "pi", shell, extensions, directory, groupDirectory, signal }) {
  await rm(directory, { recursive: true, force: true });
  const workspace = path.join(directory, "workspace");
  await mkdir(workspace, { recursive: true });
  const nonce = randomBytes(8).toString("hex");
  const marker = `HARNESS-RAN-${nonce}`;
  const adapter = hostAdapter(host);
  const isolation = await adapter.prepareIsolation(directory, null, { settings: adapter.effectiveSettings({}) });
  const probes = harnessProbes(nonce, marker);
  const worked = (probe) => probe.ran === true && (probe.output ?? "").includes(marker);
  const probed = await runShellProbes({ host, shell, extensions, directory, workspace, isolation, probes, signal });
  const judged = probes.map((probe) => ({ ...probe, ...probed.results.get(probe.id) }));
  const byId = Object.fromEntries(judged.map((probe) => [probe.id, probe]));
  const outcome = (probe) => (worked(probe) ? "ran" : probe.ran === true ? "refused" : "not run");
  const tools = Object.fromEntries(
    TOOLS.map((tool) => [tool, new RegExp(`^${tool}: yes$`, "m").test(byId.tools.output ?? "")]),
  );
  const findings = {
    workspace: outcome(byId.workspace),
    outsidePath: outcome(byId["outside-path"]),
    workspaceAgain: outcome(byId["workspace-again"]),
    tmpWrite: outcome(byId["tmp-write"]),
    tools: worked(byId.tools) ? tools : null,
  };
  const record = {
    arm,
    directory: path.relative(groupDirectory, directory).split(path.sep).join("/"),
    // The shell ran the workspace command, then stopped running the same command after the path outside it.
    shellStopped: findings.workspace === "ran" && findings.workspaceAgain !== "ran",
    findings,
    probes: judged.map((probe) => ({
      id: probe.id,
      purpose: probe.purpose,
      command: probe.command,
      ran: probe.ran === true,
      isError: probe.isError ?? null,
      output: (probe.output ?? "").slice(-OUTPUT_TAIL),
    })),
    [host]: {
      exitCode: probed.observation?.exitCode ?? null,
      terminationReason: probed.observation?.terminationReason ?? (probed.timedOut ? "timeout" : null),
      error: probed.launchError,
      stderr: probed.stderr,
    },
  };
  await writeFile(path.join(directory, "harness.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/**
 * Runs the harness check for every selected arm of a group whose subject has a shell. Returns each arm's record,
 * keyed by arm; an empty object when no arm has one.
 *
 * @param {{ group: any, variants: Record<string, string>, hostExtensions: Record<string, any[]>, groupDirectory: string, signal?: AbortSignal }} options
 */
export async function prepareHarness({ group, variants, hostExtensions, groupDirectory, signal }) {
  const records = {};
  if (!group.tools.some((tool) => SHELL_TOOLS.has(tool))) return records;
  for (const [arm, state] of Object.entries(variants)) {
    const shell = group.variants[arm]?.shell;
    if (state !== "selected" || shell === undefined) continue;
    records[arm] = await checkHarness({
      arm,
      host: group.host ?? "pi",
      shell,
      extensions: hostExtensions[arm] ?? [],
      directory: path.join(groupDirectory, "harness", arm),
      groupDirectory,
      signal,
    });
  }
  return records;
}

/** One line per arm for the pilot's report; `records` are keyed by arm. */
export function harnessLines(groupId, records) {
  return Object.entries(records).map(([arm, { findings }]) => {
    const tools =
      findings.tools === null
        ? "tools unknown"
        : TOOLS.map((tool) => `${tool} ${findings.tools[tool] ? "yes" : "no"}`).join(", ");
    return `${groupId} ${arm}: workspace ${findings.workspace}; path outside ${findings.outsidePath}; workspace after it ${findings.workspaceAgain}; /tmp write ${findings.tmpWrite}; ${tools}`;
  });
}

/** What stops a pilot in a group's harness records: a shell that stopped working, or arms that found different things. */
export function harnessProblems(groupId, records) {
  const problems = [];
  for (const [arm, { shellStopped, findings }] of Object.entries(records)) {
    if (findings.workspace !== "ran") {
      problems.push(
        `${groupId}: arm ${arm}'s harness check could not run a command in the workspace (see harness/${arm}/harness.json)`,
      );
    }
    if (shellStopped) {
      problems.push(
        `${groupId}: arm ${arm}'s shell stopped working after a command naming a path outside the workspace (see harness/${arm}/harness.json); every subject that sends one loses its shell for the rest of the run`,
      );
    }
  }
  const entries = Object.values(records);
  const differing = entries.filter((entry) => JSON.stringify(entry.findings) !== JSON.stringify(entries[0].findings));
  if (differing.length > 0) {
    problems.push(
      `${groupId}: the arms' harness differs, so they differ in more than their component: ${harnessLines(groupId, records).join(" | ")}`,
    );
  }
  return problems;
}
