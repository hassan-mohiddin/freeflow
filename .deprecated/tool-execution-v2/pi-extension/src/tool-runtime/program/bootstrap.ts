export function guestProgramSource(code: string): string {
  return `
(async () => {
  "use strict";
  const __hostInvoke = globalThis.__ffInvoke;
  const __hostEmit = globalThis.__ffEmit;
  const __inputJson = globalThis.__ffInputJson;
  try { delete globalThis.__ffInvoke; delete globalThis.__ffEmit; delete globalThis.__ffInputJson; } catch {}

  const __deepFreeze = value => {
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) __deepFreeze(value[key]);
      Object.freeze(value);
    }
    return value;
  };
  const __encode = value => JSON.stringify(value);
  const __nondeterministic = () => { throw new Error("Nondeterministic clock and random APIs are disabled."); };
  Object.defineProperty(Math, "random", { value: __nondeterministic, writable: false, configurable: false });
  Object.freeze(Math);
  const __reply = raw => {
    const envelope = JSON.parse(raw);
    if (!envelope || envelope.ok !== true) {
      const detail = envelope && envelope.error ? envelope.error : { code: "operation_failed", message: "Operation failed." };
      const error = new Error(String(detail.message || "Operation failed."));
      error.code = String(detail.code || "operation_failed");
      error.effectState = String(detail.effectState || "unknown");
      throw error;
    }
    return envelope.value;
  };
  const tools = Object.freeze({
    invoke: async (id, args) => __reply(await __hostInvoke("call", String(id), __encode(args)))
  });
  const results = Object.freeze({
    read: async (id, range = {}) => __reply(await __hostInvoke("capture-read", String(id), __encode(range)))
  });
  const emit = value => __hostEmit(__encode(value));
  const mapLimit = async (items, concurrency, fn) => {
    if (!Array.isArray(items)) throw new TypeError("mapLimit items must be an array");
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new RangeError("mapLimit concurrency must be 1-32");
    if (typeof fn !== "function") throw new TypeError("mapLimit callback must be a function");
    const output = new Array(items.length);
    let next = 0;
    let stopped = false;
    const worker = async () => {
      while (!stopped) {
        const index = next++;
        if (index >= items.length) return;
        try { output[index] = await fn(items[index], index); }
        catch (error) { stopped = true; throw error; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
    return output;
  };
  const input = __deepFreeze(JSON.parse(__inputJson));
  return await (async (input, tools, results, emit, mapLimit) => {
${code}
  })(input, tools, results, emit, mapLimit);
})()
`;
}
