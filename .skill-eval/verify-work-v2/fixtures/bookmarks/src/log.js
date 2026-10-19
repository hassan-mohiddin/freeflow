/**
 * A logger that writes one JSON object per line: `{ time, level, msg, ...fields }`.
 * @param {NodeJS.WritableStream} stream
 */
export function createLogger(stream = process.stdout) {
  const write =
    (level) =>
    (msg, fields = {}) => {
      stream.write(`${JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })}\n`);
    };
  return { info: write("info"), warn: write("warn"), error: write("error") };
}
