import { spawn } from "node:child_process";

export function runProcess(command, args, { cwd, env, timeoutMs = 180000, outputLimitBytes = 1048576, signal } = {}) {
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
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;

    function terminate() {
      if (!child.pid) return;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }

    function collect(target, chunk, stream) {
      const buffer = Buffer.from(chunk);
      if (stream === "stdout") stdoutBytes += buffer.length;
      else stderrBytes += buffer.length;
      if (stdoutBytes + stderrBytes > outputLimitBytes) {
        outputLimitExceeded = true;
        terminate();
        return;
      }
      target.push(buffer);
    }

    child.stdout.on("data", (chunk) => collect(stdout, chunk, "stdout"));
    child.stderr.on("data", (chunk) => collect(stderr, chunk, "stderr"));
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
      const endedAt = new Date();
      resolve({
        command,
        args,
        code,
        signal: exitSignal,
        timed_out: timedOut,
        output_limit_exceeded: outputLimitExceeded,
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
