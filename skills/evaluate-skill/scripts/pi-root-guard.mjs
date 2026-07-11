import { writeFile } from "node:fs/promises";
import { createRootPolicy, authorizeToolPath } from "./lib/path-policy.mjs";

const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["write", "edit"]);
const ALWAYS_BLOCKED_TOOLS = new Set(["bash"]);

function parsePolicyEnvironment(env = process.env) {
  const raw = env.FREEFLOW_EVAL_ROOT_POLICY;
  if (!raw) throw new Error("FREEFLOW_EVAL_ROOT_POLICY is required");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid FREEFLOW_EVAL_ROOT_POLICY JSON: ${error.message}`);
  }

  return {
    readRoots: parsed.read_roots,
    writeRoots: parsed.write_roots,
  };
}

function inputPathFor(event, cwd) {
  const value = event?.input?.path;
  return typeof value === "string" && value.length > 0 ? value : cwd;
}

export async function createGuard(env = process.env) {
  return createRootPolicy(parsePolicyEnvironment(env));
}

export default async function rootGuard(pi) {
  const policy = await createGuard();
  const counterPath = process.env.FREEFLOW_EVAL_COUNTER_PATH;
  const maxTurns = Number(process.env.FREEFLOW_EVAL_MAX_TURNS ?? 0);
  const counters = { provider_requests: 0, turns_started: 0, tool_calls: 0, hard_turn_limit_reached: false };

  async function persistCounters() {
    if (counterPath) await writeFile(counterPath, `${JSON.stringify(counters, null, 2)}\n`);
  }

  await persistCounters();

  pi.on("before_provider_request", async () => {
    if (maxTurns > 0 && counters.provider_requests >= maxTurns) {
      counters.hard_turn_limit_reached = true;
      await persistCounters();
      throw new Error(`Hard turn limit reached before provider request ${counters.provider_requests + 1}`);
    }
    counters.provider_requests += 1;
    await persistCounters();
  });

  pi.on("turn_start", async (_event, ctx) => {
    counters.turns_started += 1;
    if (maxTurns > 0 && counters.turns_started > maxTurns) {
      counters.hard_turn_limit_reached = true;
      await persistCounters();
      ctx.abort();
    } else {
      await persistCounters();
    }
  });

  if (process.env.FREEFLOW_EVAL_GUARD_PROBE === "1") {
    process.stderr.write("FREEFLOW_EVAL_GUARD_LOADED\n");
  }

  pi.on("tool_call", async (event, ctx) => {
    counters.tool_calls += 1;
    await persistCounters();
    if (ALWAYS_BLOCKED_TOOLS.has(event.toolName)) {
      return { block: true, reason: `${event.toolName} is disabled in isolated skill evals` };
    }

    const operation = WRITE_TOOLS.has(event.toolName)
      ? "write"
      : READ_TOOLS.has(event.toolName)
        ? "read"
        : null;

    if (!operation) {
      return { block: true, reason: `Tool is not allowed by the skill-eval root guard: ${event.toolName}` };
    }

    try {
      const result = await authorizeToolPath({
        inputPath: inputPathFor(event, ctx.cwd),
        cwd: ctx.cwd,
        operation,
        policy,
      });
      if (!result.allowed) {
        return { block: true, reason: `${operation} path is outside the isolated skill-eval roots` };
      }
    } catch (error) {
      return { block: true, reason: `Unable to prove isolated ${operation} path: ${error.message}` };
    }

    return undefined;
  });
}
