import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { DEFAULT_OUTPUT_LIMIT_BYTES } from "./constants.mjs";

export function runProcess(command, args, {
  cwd,
  env,
  timeoutMs = 180000,
  outputLimitBytes = DEFAULT_OUTPUT_LIMIT_BYTES,
  transportLimitBytes = outputLimitBytes,
  stdoutLineTransform,
  signal,
} = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date();
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    const stdout = [];
    const stderr = [];
    const decoder = stdoutLineTransform ? new StringDecoder("utf8") : null;
    let pendingLine = "";
    let transportBytes = 0;
    let retainedOutputBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let transportLimitExceeded = false;
    let transformError = null;

    function terminate() {
      if (!child.pid) return;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }

    function retain(target, value) {
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
      retainedOutputBytes += buffer.length;
      if (retainedOutputBytes > outputLimitBytes) {
        outputLimitExceeded = true;
        terminate();
        return false;
      }
      target.push(buffer);
      return true;
    }

    function observeTransport(chunk) {
      transportBytes += Buffer.byteLength(chunk);
      if (transportBytes > transportLimitBytes) {
        transportLimitExceeded = true;
        outputLimitExceeded = true;
        terminate();
        return false;
      }
      return true;
    }

    function transformLine(line, terminated = true) {
      if (transformError || outputLimitExceeded) return;
      try {
        const transformed = stdoutLineTransform(line);
        if (transformed === null || transformed === undefined) return;
        retain(stdout, `${transformed}${terminated ? "\n" : ""}`);
      } catch (error) {
        transformError = error;
        terminate();
      }
    }

    child.stdout.on("data", (chunk) => {
      if (!observeTransport(chunk)) return;
      if (!stdoutLineTransform) {
        retain(stdout, chunk);
        return;
      }
      pendingLine += decoder.write(chunk);
      for (;;) {
        const newline = pendingLine.indexOf("\n");
        if (newline < 0) break;
        const line = pendingLine.slice(0, newline).replace(/\r$/, "");
        pendingLine = pendingLine.slice(newline + 1);
        transformLine(line);
      }
    });
    child.stderr.on("data", (chunk) => {
      if (!observeTransport(chunk)) return;
      retain(stderr, chunk);
    });
    child.on("error", reject);

    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    timer.unref?.();

    const onAbort = () => terminate();
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("close", (code, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (stdoutLineTransform && !outputLimitExceeded) {
        pendingLine += decoder.end();
        if (pendingLine.length > 0) transformLine(pendingLine, false);
      }
      if (transformError) {
        reject(transformError);
        return;
      }
      const endedAt = new Date();
      resolve({
        command,
        args,
        code,
        signal: exitSignal,
        timed_out: timedOut,
        output_limit_exceeded: outputLimitExceeded,
        transport_limit_exceeded: transportLimitExceeded,
        transport_bytes: transportBytes,
        retained_output_bytes: retainedOutputBytes,
        aborted: Boolean(signal?.aborted),
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
      });
    });
  });
}
