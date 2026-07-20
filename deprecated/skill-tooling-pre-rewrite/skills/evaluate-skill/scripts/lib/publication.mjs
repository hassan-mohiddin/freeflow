import { lstat, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { completeOperation, failedPublication, incompleteOperation, publishedPath } from "./outcome.mjs";

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

function fsOperations(overrides = {}) {
  return { lstat, mkdir, rename, ...overrides };
}

async function destinationExists(path, operations) {
  try {
    await operations.lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function createStagingDirectory(path, operations = {}) {
  const fs = fsOperations(operations);
  try {
    await fs.mkdir(path, { recursive: false });
    return completeOperation({ value: { path } });
  } catch (error) {
    return incompleteOperation({ primary: message(error) });
  }
}

export async function publishResult({ stagingDir, destinationDir, prepare, verify, operations = {} }) {
  const fs = fsOperations(operations);
  try {
    if (await destinationExists(destinationDir, fs))
      throw new Error(`Result destination already exists: ${destinationDir}`);
    await prepare(stagingDir);
    await verify(stagingDir);
    await fs.mkdir(dirname(destinationDir), { recursive: true });
    await fs.rename(stagingDir, destinationDir);
    return publishedPath(destinationDir);
  } catch (error) {
    return failedPublication(message(error));
  }
}

export async function publishDiagnostic({ stagingDir, destinationDir, writeDiagnostic, operations = {} }) {
  const fs = fsOperations(operations);
  try {
    if (await destinationExists(destinationDir, fs))
      throw new Error(`Diagnostic destination already exists: ${destinationDir}`);
    await writeDiagnostic(stagingDir);
    await fs.mkdir(dirname(destinationDir), { recursive: true });
    await fs.rename(stagingDir, destinationDir);
    return publishedPath(destinationDir);
  } catch (error) {
    return failedPublication(message(error));
  }
}
