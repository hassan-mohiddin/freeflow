// One model call that is not a subject: a judge, a reviewer, or a simulated user. It runs without tools, skills,
// context files or session, in its own isolated home and agent directory, with the provider's login copied in and
// removed afterward.

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { writeText } from "./evidence.mjs";
import { prepareIsolation, removeCopiedCredentials } from "./isolation.mjs";
import { baseProcessEnvironment, runPiProcess } from "./pi.mjs";

/**
 * Starts one model call on a prompt in its own directory, which keeps the prompt, events, final response and stderr.
 *
 * @param {string} directory replaced on every call
 * @param {string} prompt
 * @param {{model: string, thinking: string | null, extensions: Array<{path: string}>, settings: object, signal?: AbortSignal, role?: string}} options
 * @returns {Promise<{response: string | null, errors: string[], usage: any, isolation: any}>}
 */
export async function launchModel(directory, prompt, options) {
  const { model, thinking, extensions, settings, signal, role = "reviewer" } = options;
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await writeText(path.join(directory, "prompt.md"), prompt);

  const args = [
    "--mode",
    "json",
    "-p",
    "--no-session",
    "--no-extensions",
    ...extensions.flatMap((extension) => ["--extension", extension.path]),
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
    "--no-tools",
    "--model",
    model,
  ];
  if (thinking !== null) args.push("--thinking", thinking);
  args.push(prompt);
  let isolation;
  try {
    isolation = await prepareIsolation(directory, model, { settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { response: null, errors: [message], usage: null, isolation: null };
  }
  const observation = await runPiProcess({
    command: "pi",
    args,
    cwd: directory,
    eventsFile: path.join(directory, "events.jsonl"),
    stderrFile: path.join(directory, "stderr.log"),
    signal,
    environment: {
      ...baseProcessEnvironment(),
      PWD: directory,
      PI_SKIP_VERSION_CHECK: "1",
      PI_TELEMETRY: "0",
      ...isolation.environment,
    },
  });
  await removeCopiedCredentials(directory);
  await writeText(path.join(directory, "final.md"), `${observation.response}\n`);

  const errors = [];
  if (observation.exitCode !== 0 || !observation.settled || observation.assistantError !== null) {
    errors.push(
      `${role} did not complete: exit=${observation.exitCode} settled=${observation.settled} error=${observation.assistantError}`,
    );
  }
  return { response: observation.response, errors, usage: observation.usage, isolation: isolation.evidence };
}
