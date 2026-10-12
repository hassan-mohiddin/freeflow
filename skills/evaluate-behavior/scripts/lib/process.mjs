import { spawnSync } from "node:child_process";
import { once } from "node:events";

export const NO_PROGRESS_MS = 30 * 60 * 1000;
export const TERMINATION_GRACE_MS = 5000;

export async function pipeStream(source, destination, onActivity) {
  for await (const chunk of source) {
    onActivity();
    await writeStream(destination, chunk);
  }
  destination.end();
  await once(destination, "finish");
}

export async function writeStream(stream, value) {
  if (!stream.write(value)) await once(stream, "drain");
}

export function signalProcessTree(processGroupId, child, signal) {
  if (!processGroupId) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(processGroupId), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (error?.code !== "ESRCH" && child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

export function processGroupExists(processGroupId) {
  if (!processGroupId || process.platform === "win32") return false;
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

export async function waitForForcedKill(promise) {
  await promise;
}

export async function waitForProcessTreeExit(processGroupId, child) {
  if (!processGroupExists(processGroupId)) return;
  await new Promise((resolve) => setTimeout(resolve, TERMINATION_GRACE_MS));
  if (processGroupExists(processGroupId)) signalProcessTree(processGroupId, child, "SIGKILL");
}

export function mergeUsage(current, next) {
  if (!next) return current;
  const previous = current ?? {};
  return {
    input: (previous.input ?? 0) + (next.input ?? 0),
    output: (previous.output ?? 0) + (next.output ?? 0),
    cacheRead: (previous.cacheRead ?? 0) + (next.cacheRead ?? 0),
    cacheWrite: (previous.cacheWrite ?? 0) + (next.cacheWrite ?? 0),
    cost: {
      input: (previous.cost?.input ?? 0) + (next.cost?.input ?? 0),
      output: (previous.cost?.output ?? 0) + (next.cost?.output ?? 0),
      cacheRead: (previous.cost?.cacheRead ?? 0) + (next.cost?.cacheRead ?? 0),
      cacheWrite: (previous.cost?.cacheWrite ?? 0) + (next.cost?.cacheWrite ?? 0),
      total: (previous.cost?.total ?? 0) + (next.cost?.total ?? 0),
    },
  };
}

export function messageText(message) {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}
