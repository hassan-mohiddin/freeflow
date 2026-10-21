// Human durations to milliseconds: "90s", "15m", "2h", "1h30m", "250ms".

const UNITS = { h: 3_600_000, m: 60_000, s: 1_000, ms: 1 };
const PART = /(\d+)(ms|h|m|s)/g;

/** The duration in milliseconds; throws RangeError for anything that is not a sequence of number-unit parts. */
export function parseDuration(text) {
  const input = String(text).trim();
  if (!/^(?:\d+(?:ms|h|m|s))+$/.test(input)) throw new RangeError(`not a duration: ${text}`);
  let total = 0;
  for (const [, amount, unit] of input.matchAll(PART)) total += Number(amount) * UNITS[unit];
  return total;
}
