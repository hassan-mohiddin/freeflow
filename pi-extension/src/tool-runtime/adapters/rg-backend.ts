import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

import { WorkspaceError } from "./workspace.js";

const MAX_STDERR_BYTES = 4096;
const DEFAULT_OUTPUT_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

export type RgBackend = Readonly<{ path: string; identity: string; version: string }>;

async function execute(
  path: string,
  args: readonly string[],
  signal?: AbortSignal,
  maximumBytes = DEFAULT_OUTPUT_BYTES,
  cwd?: string,
): Promise<{ bytes: Buffer; code: number }> {
  if (signal?.aborted) throw new WorkspaceError("cancelled", "Ripgrep search was cancelled.");
  return new Promise((resolve, reject) => {
    const child = spawn(path, ["--no-config", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stderr = "";
    let failure: WorkspaceError | undefined;
    const stop = (error: WorkspaceError) => {
      if (!failure) failure = error;
      child.kill("SIGTERM");
    };
    const onAbort = () => stop(new WorkspaceError("cancelled", "Ripgrep search was cancelled."));
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(
      () => stop(new WorkspaceError("backend_timeout", "Ripgrep search timed out.")),
      TIMEOUT_MS,
    );
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        stop(new WorkspaceError("backend_output_limit", "Ripgrep output exceeds the bounded acquisition limit."));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8").slice(0, Math.max(0, MAX_STDERR_BYTES - stderr.length));
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      failure ??= new WorkspaceError(
        error.code === "ENOENT" ? "backend_unavailable" : "backend_failed",
        "Ripgrep executable is unavailable or could not start.",
      );
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (failure) return reject(failure);
      if (code !== 0 && code !== 1)
        return reject(new WorkspaceError("backend_failed", `Ripgrep exited unsuccessfully: ${stderr.slice(0, 256)}`));
      resolve({ bytes: Buffer.concat(chunks), code: code ?? 1 });
    });
  });
}

export async function resolveRgBackend(signal?: AbortSignal): Promise<RgBackend> {
  if (process.platform !== "darwin")
    throw new WorkspaceError("backend_unavailable", "Ripgrep search is not qualified for this platform.");
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory || !isAbsolute(directory)) continue;
    const candidate = join(directory, "rg");
    let path: string;
    try {
      path = await realpath(candidate);
      const info = await stat(path);
      if (!info.isFile()) continue;
      await access(path, constants.X_OK);
    } catch {
      continue;
    }
    const version = (await execute(path, ["--version"], signal, 4096)).bytes.toString("utf8").split("\n")[0]!.trim();
    if (version !== "ripgrep 15.1.0")
      throw new WorkspaceError("backend_unavailable", "Ripgrep executable version is not qualified.");
    const info = await stat(path, { bigint: true });
    const identity = createHash("sha256")
      .update([path, version, info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join("\0"))
      .digest("hex");
    return { path, version, identity };
  }
  throw new WorkspaceError("backend_unavailable", "No qualified ripgrep executable is available on PATH.");
}

export function runRg(
  backend: RgBackend,
  args: readonly string[],
  signal?: AbortSignal,
  maximumBytes?: number,
  cwd?: string,
): Promise<{ bytes: Buffer; code: number }> {
  return execute(backend.path, args, signal, maximumBytes, cwd);
}
