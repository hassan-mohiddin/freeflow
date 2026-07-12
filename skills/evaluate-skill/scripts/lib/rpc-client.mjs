import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { DEFAULT_OUTPUT_LIMIT_BYTES } from "./constants.mjs";

const FORBIDDEN_EVENTS = new Set([
  "auto_retry_start",
  "auto_retry_end",
  "compaction_start",
  "compaction_end",
  "queue_update",
  "extension_ui_request",
]);

class RpcProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = "RpcProtocolError";
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function processError(message) {
  const error = new Error(message);
  error.name = "RpcProcessError";
  return error;
}

export async function startRpcClient(command, args, {
  cwd,
  env,
  timeoutMs = 180000,
  outputLimitBytes = DEFAULT_OUTPUT_LIMIT_BYTES,
  transportLimitBytes = outputLimitBytes,
  signal,
  recordTransform,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("RPC timeoutMs must be a positive integer");
  if (!Number.isInteger(outputLimitBytes) || outputLimitBytes < 1) throw new Error("RPC outputLimitBytes must be a positive integer");
  if (!Number.isInteger(transportLimitBytes) || transportLimitBytes < 1) throw new Error("RPC transportLimitBytes must be a positive integer");

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  await new Promise((resolve, reject) => {
    const onSpawn = () => {
      child.off("error", onError);
      resolve();
    };
    const onError = (error) => {
      child.off("spawn", onSpawn);
      reject(error);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });

  return new RpcClient(command, args, child, {
    timeoutMs,
    outputLimitBytes,
    transportLimitBytes,
    signal,
    recordTransform,
  });
}

class RpcClient {
  constructor(command, args, child, { timeoutMs, outputLimitBytes, transportLimitBytes, signal, recordTransform }) {
    this.command = command;
    this.args = [...args];
    this.child = child;
    this.outputLimitBytes = outputLimitBytes;
    this.transportLimitBytes = transportLimitBytes;
    this.startedAt = new Date();
    this.sequence = 0;
    this.pending = new Map();
    this.activeTurn = null;
    this.records = [];
    this.stdout = [];
    this.stderr = [];
    this.transportBytes = 0;
    this.retainedOutputBytes = 0;
    this.timedOut = false;
    this.outputLimitExceeded = false;
    this.transportLimitExceeded = false;
    this.protocolFailed = false;
    this.aborted = false;
    this.disposing = false;
    this.closed = false;
    this.fatalError = null;
    this.result = null;
    this.disposePromise = null;
    this.decoder = new StringDecoder("utf8");
    this.pendingLine = "";
    this.externalSignal = signal;
    this.recordTransform = recordTransform;

    this.closePromise = new Promise((resolve) => { this.resolveClose = resolve; });
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.fail(processError("RPC process timed out"));
    }, timeoutMs);
    this.timer.unref?.();

    this.onAbort = () => {
      this.aborted = true;
      this.fail(processError("RPC process aborted"));
    };
    signal?.addEventListener("abort", this.onAbort, { once: true });

    child.stdout.on("data", (chunk) => this.observeStdout(chunk));
    child.stderr.on("data", (chunk) => this.observeStderr(chunk));
    child.stdin.on("error", (error) => {
      if (!this.disposing && !this.closed) this.fail(processError(`RPC stdin failed: ${error.message}`));
    });
    child.on("error", (error) => this.fail(processError(`RPC process failed: ${error.message}`)));
    child.on("close", (code, exitSignal) => this.onClose(code, exitSignal));
  }

  terminate() {
    if (!this.child.pid || this.closed) return;
    try {
      if (process.platform !== "win32") process.kill(-this.child.pid, "SIGKILL");
      else this.child.kill("SIGKILL");
    } catch {
      try { this.child.kill("SIGKILL"); } catch {}
    }
  }

  observeTransport(chunk) {
    this.transportBytes += Buffer.byteLength(chunk);
    if (this.transportBytes > this.transportLimitBytes) {
      this.transportLimitExceeded = true;
      this.fail(processError("RPC raw transport limit exceeded"));
      return false;
    }
    return true;
  }

  retain(target, value) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (this.retainedOutputBytes + buffer.length > this.outputLimitBytes) {
      this.outputLimitExceeded = true;
      this.fail(processError("RPC retained output limit exceeded"));
      return false;
    }
    target.push(buffer);
    this.retainedOutputBytes += buffer.length;
    return true;
  }

  observeStdout(chunk) {
    if (!this.observeTransport(chunk) || this.fatalError) return;
    this.pendingLine += this.decoder.write(chunk);
    for (;;) {
      const newline = this.pendingLine.indexOf("\n");
      if (newline < 0) break;
      let line = this.pendingLine.slice(0, newline);
      this.pendingLine = this.pendingLine.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.observeLine(line, true);
      if (this.fatalError) return;
    }
  }

  observeStderr(chunk) {
    if (!this.observeTransport(chunk) || this.fatalError) return;
    this.retain(this.stderr, chunk);
  }

  observeLine(line, terminated) {
    if (line.length === 0) return;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      this.fail(new RpcProtocolError(`Malformed RPC JSONL: ${error.message}`));
      return;
    }
    let retainedRecord = record;
    if (this.recordTransform) {
      try {
        retainedRecord = this.recordTransform(record);
      } catch (error) {
        this.fail(new RpcProtocolError(`RPC record transform failed: ${errorMessage(error)}`));
        return;
      }
    }
    if (retainedRecord === null || retainedRecord === undefined) return;
    const retainedLine = JSON.stringify(retainedRecord);
    if (!this.retain(this.stdout, `${retainedLine}${terminated ? "\n" : ""}`)) return;
    this.records.push(retainedRecord);
    this.routeRecord(retainedRecord);
  }

  routeRecord(record) {
    if (record?.type === "response") {
      const pending = typeof record.id === "string" ? this.pending.get(record.id) : null;
      if (!pending) {
        this.fail(new RpcProtocolError(`Unmatched RPC response id: ${String(record?.id)}`));
        return;
      }
      if (record.command !== pending.command) {
        this.fail(new RpcProtocolError(`RPC response command mismatch for ${record.id}: expected ${pending.command}; got ${record.command}`));
        return;
      }
      this.pending.delete(record.id);
      pending.resolve(record);
      return;
    }

    if (FORBIDDEN_EVENTS.has(record?.type)) {
      this.fail(new RpcProtocolError(`Unexpected RPC event: ${record.type}`));
      return;
    }

    if (this.activeTurn) this.activeTurn.events.push(record);
    if (record?.type === "agent_settled") {
      if (!this.activeTurn || this.activeTurn.settled) {
        this.fail(new RpcProtocolError("Unexpected RPC agent_settled event"));
        return;
      }
      this.activeTurn.settled = true;
      this.activeTurn.resolve(record);
    }
  }

  fail(error) {
    if (this.fatalError || this.closed) return;
    this.fatalError = error instanceof Error ? error : new Error(String(error));
    if (this.fatalError instanceof RpcProtocolError) this.protocolFailed = true;
    for (const pending of this.pending.values()) pending.reject(this.fatalError);
    this.pending.clear();
    if (this.activeTurn && !this.activeTurn.settled) this.activeTurn.reject(this.fatalError);
    this.terminate();
  }

  request(type, fields = {}) {
    if (typeof type !== "string" || type.length === 0) return Promise.reject(new Error("RPC command type must be non-empty"));
    if (this.fatalError) return Promise.reject(this.fatalError);
    if (this.closed || this.disposing) return Promise.reject(processError("RPC process is not available"));
    const id = `rpc-${++this.sequence}`;
    const command = { ...fields, id, type };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { command: type, resolve, reject });
      this.child.stdin.write(`${JSON.stringify(command)}\n`, (error) => {
        if (error && this.pending.has(id)) this.fail(processError(`RPC command write failed: ${error.message}`));
      });
    });
  }

  async promptAndSettle({ turnId, message }) {
    if (typeof turnId !== "string" || turnId.length === 0) throw new Error("RPC turnId must be non-empty");
    if (typeof message !== "string") throw new Error("RPC prompt message must be a string");
    if (this.activeTurn) throw new Error("RPC prompt cannot start while another turn is active");

    let resolveSettled;
    let rejectSettled;
    const settledPromise = new Promise((resolve, reject) => {
      resolveSettled = resolve;
      rejectSettled = reject;
    });
    settledPromise.catch(() => {});
    const active = {
      turnId,
      events: [],
      settled: false,
      resolve: resolveSettled,
      reject: rejectSettled,
    };
    this.activeTurn = active;

    try {
      const response = await this.request("prompt", { message });
      if (!response.success) throw new RpcProtocolError(`RPC prompt rejected: ${response.error ?? "unknown error"}`);
      await settledPromise;
      return Object.freeze({
        turn_id: turnId,
        response,
        events: Object.freeze(active.events.map((event) => Object.freeze({ ...event }))),
      });
    } finally {
      if (this.activeTurn === active) this.activeTurn = null;
    }
  }

  onClose(code, exitSignal) {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.externalSignal?.removeEventListener("abort", this.onAbort);

    if (!this.fatalError) {
      this.pendingLine += this.decoder.end();
      if (this.pendingLine.length > 0) this.fail(new RpcProtocolError("RPC JSONL record was not LF-terminated"));
    }
    this.closed = true;

    const earlyExit = !this.disposing && !this.fatalError;
    if (earlyExit) {
      const error = this.activeTurn && !this.activeTurn.settled
        ? processError("RPC process exited before agent_settled")
        : processError(`RPC process exited before command completion (${code ?? exitSignal ?? "unknown"})`);
      this.fatalError = error;
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      if (this.activeTurn && !this.activeTurn.settled) this.activeTurn.reject(error);
    }

    const endedAt = new Date();
    this.result = Object.freeze({
      command: this.command,
      args: Object.freeze([...this.args]),
      code,
      signal: exitSignal,
      timed_out: this.timedOut,
      output_limit_exceeded: this.outputLimitExceeded,
      transport_limit_exceeded: this.transportLimitExceeded,
      protocol_failed: this.protocolFailed,
      aborted: this.aborted,
      transport_bytes: this.transportBytes,
      retained_output_bytes: this.retainedOutputBytes,
      stdout: Buffer.concat(this.stdout).toString("utf8"),
      stderr: Buffer.concat(this.stderr).toString("utf8"),
      started_at: this.startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: endedAt.getTime() - this.startedAt.getTime(),
      failure: this.fatalError ? errorMessage(this.fatalError) : null,
    });
    this.resolveClose(this.result);
  }

  async dispose() {
    if (this.disposePromise) return this.disposePromise;
    this.disposePromise = (async () => {
      if (!this.closed) {
        this.disposing = true;
        try { this.child.stdin.end(); } catch {}
        const cleanupTimer = setTimeout(() => this.terminate(), 250);
        cleanupTimer.unref?.();
        const result = await this.closePromise;
        clearTimeout(cleanupTimer);
        return result;
      }
      return this.result ?? this.closePromise;
    })();
    return this.disposePromise;
  }
}
