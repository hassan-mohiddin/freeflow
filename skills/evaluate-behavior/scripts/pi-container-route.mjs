// Pi's last extension in a subject with a container environment: it moves each shell tool's command (bash, and
// Freeflow's bash_background and monitor) into the subject's container. The guard (pi-guard.mjs, loaded first) has
// already decided the call; this runs after every other extension's tool_call handler, so those handlers see the
// command the model wrote, and only then does it become the docker client command Pi's shell runs. Pi runs every
// handler in load order and stops only on a refusal, so a call that runs has passed through here. The guard refuses
// container shell calls when this extension is not loaded.

import { CONTAINER_ROUTE, decideToolCall, guardState, SHELL_TOOLS } from "./guard-rules.mjs";

export default function registerSkillEvalContainerRoute(pi) {
  const state = guardState(process.env);
  globalThis[CONTAINER_ROUTE] = true;
  pi.on("tool_call", (event, ctx) => {
    if (!SHELL_TOOLS.has(event.toolName)) return undefined;
    const decision = decideToolCall(state, event.toolName, event.input, ctx.cwd, process.env);
    if (decision?.block) return decision;
    if (decision?.command === undefined) {
      return { block: true, reason: `${event.toolName} has no container to run in for this evaluation` };
    }
    event.input.command = decision.command;
    return undefined;
  });
}
