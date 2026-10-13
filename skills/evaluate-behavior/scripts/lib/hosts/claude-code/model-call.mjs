// One model call through Claude Code that is not a subject: a judge, a reviewer, or a simulated user. It runs
// headless without tools, settings sources, MCP servers or slash commands, in its own isolated home and
// configuration directory, with Claude Code's own system prompt (as a Pi judge has Pi's).

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { writeText } from "../../evidence.mjs";
import { baseProcessEnvironment } from "../../process.mjs";
import { prepareClaudeIsolation } from "./isolation.mjs";
import { baseArguments, CLAUDE_CODE_ENVIRONMENT, settingsWithGuard } from "./launch.mjs";
import { runClaudeOneShot } from "./session.mjs";

/**
 * Starts one model call on a prompt in its own directory, which keeps the prompt, events, final response and stderr.
 *
 * @param {string} directory replaced on every call
 * @param {string} prompt
 * @param {{model: string, thinking: string | null, settings: object, signal?: AbortSignal, role?: string}} options
 * @returns {Promise<{response: string | null, errors: string[], usage: any, isolation: any}>}
 */
export async function launchClaudeModel(directory, prompt, options) {
  const { model, thinking, settings = {}, signal, role = "reviewer" } = options;
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await writeText(path.join(directory, "prompt.md"), prompt);

  let isolation;
  let args;
  try {
    isolation = await prepareClaudeIsolation(directory, model, { settings });
    const settingsFile = path.join(isolation.evidence.root, "settings.json");
    await writeFile(settingsFile, `${JSON.stringify(settingsWithGuard(settings), null, 2)}\n`);
    args = [...baseArguments({ model, thinking, settingsFile }), "--tools", ""];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { response: null, errors: [message], usage: null, isolation: isolation?.evidence ?? null };
  }
  const observation = await runClaudeOneShot({
    command: "claude",
    args,
    cwd: directory,
    eventsFile: path.join(directory, "events.jsonl"),
    stderrFile: path.join(directory, "stderr.log"),
    signal,
    prompts: [prompt],
    environment: {
      ...baseProcessEnvironment(),
      PWD: directory,
      ...CLAUDE_CODE_ENVIRONMENT,
      // No tools, so the guard has nothing to allow; it still refuses anything Claude Code would try.
      SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([directory]),
      SKILL_EVAL_WRITABLE_ROOT: directory,
      SKILL_EVAL_ALLOWED_TOOLS: "[]",
      ...isolation.environment,
    },
  });
  await writeText(path.join(directory, "final.md"), `${observation.response}\n`);

  const errors = [];
  if (
    observation.exitCode !== 0 ||
    !observation.settled ||
    observation.assistantError !== null ||
    observation.protocolErrors.length > 0
  ) {
    const protocol = observation.protocolErrors.map((error) => error.reason).join(",") || "none";
    errors.push(
      `${role} did not complete: exit=${observation.exitCode} settled=${observation.settled} error=${observation.assistantError} protocol=${protocol}`,
    );
  }
  return { response: observation.response, errors, usage: observation.usage, isolation: isolation.evidence };
}
