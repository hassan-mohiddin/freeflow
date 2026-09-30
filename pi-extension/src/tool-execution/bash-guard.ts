// Two shell habits that lose work once background commands exist: a trailing `&` leaves a process running after the
// call with no notice and no saved output, and a long foreground sleep holds the session while waiting on something.

/** Seconds at or above which a foreground sleep is refused. */
export const LONGEST_FOREGROUND_SLEEP_S = 10;

const UNIT_SECONDS: Record<string, number> = { "": 1, s: 1, m: 60, h: 3600, d: 86400 };

function sleepSeconds(command: string): number {
  let longest = 0;
  // A sleep that starts a command: at the start, or after ; & | && || ( { then do.
  for (const match of command.matchAll(/(?:^|[;&|({]|\bthen\b|\bdo\b)\s*sleep\s+(\d+(?:\.\d+)?)([smhd]?)\b/g))
    longest = Math.max(longest, Number(match[1]) * UNIT_SECONDS[match[2]]);
  return longest;
}

/** Why a bash command should run through bash_background instead, as one next action; undefined when it need not. */
export function backgroundRefusal(command: unknown): string | undefined {
  if (typeof command !== "string") return undefined;
  const trimmed = command.replace(/\s+$/, "");
  if (/(^|[^&])&$/.test(trimmed))
    return "A command ending in & keeps running after this call, with no exit notice and no saved output. Run it with bash_background instead, without the &.";
  const seconds = sleepSeconds(command);
  if (seconds >= LONGEST_FOREGROUND_SLEEP_S)
    return `A foreground sleep of ${seconds} s holds the session. To wait for a condition, run a loop that exits when it holds, such as until <check>; do sleep 1; done, with bash_background; you will be notified when it exits.`;
  return undefined;
}
