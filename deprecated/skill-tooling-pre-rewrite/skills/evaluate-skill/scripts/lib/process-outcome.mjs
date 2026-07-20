import { completeOperation, incompleteOperation } from "./outcome.mjs";

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

function appendSecondary(current, next) {
  return current ? `${current}; ${next}` : next;
}

function executionFromPi({ id, kind, role, result }) {
  return {
    id,
    kind,
    role,
    process: {
      exit_code: result.process.code,
      signal: result.process.signal,
      timed_out: result.process.timed_out,
      output_limit_exceeded: result.process.output_limit_exceeded,
      transport_limit_exceeded: result.process.transport_limit_exceeded ?? false,
      parse_errors: result.parsed.parse_errors,
    },
    runtime_counters: result.runtime_counters,
    usage: result.parsed.usage,
  };
}

function failedProcess(result) {
  return (
    result.process.code !== 0 ||
    result.process.timed_out ||
    result.process.output_limit_exceeded ||
    result.process.transport_limit_exceeded ||
    result.runtime_counters.hard_turn_limit_reached ||
    result.parsed.parse_errors.length > 0
  );
}

export async function runPiProcessOutcome({
  id,
  kind,
  role,
  run,
  persistSettled = async () => {},
  finish = async (result) => result,
  cleanup = async () => {},
}) {
  let result = null;
  let execution = null;
  let value;
  let primary = null;
  let secondary = null;

  try {
    result = await run();
    execution = executionFromPi({ id, kind, role, result });
    if (failedProcess(result)) primary = `Pi process exited with ${result.process.code} or produced unusable evidence`;
    try {
      await persistSettled(result);
    } catch (error) {
      if (primary) secondary = appendSecondary(secondary, message(error));
      else primary = message(error);
    }
    if (!primary) {
      try {
        value = await finish(result);
      } catch (error) {
        primary = message(error);
      }
    }
  } catch (error) {
    primary = message(error);
  } finally {
    try {
      await cleanup();
    } catch (error) {
      if (primary) secondary = appendSecondary(secondary, message(error));
      else primary = message(error);
    }
  }

  if (primary) return incompleteOperation({ execution, primary, secondary });
  return completeOperation({ execution, value });
}
