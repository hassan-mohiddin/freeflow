import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export function createInvocationId(now = new Date()) {
  const timestamp = now
    .toISOString()
    .replaceAll(/[-:.TZ]/g, "")
    .slice(0, 14);
  return `${timestamp}-${randomBytes(4).toString("hex")}`;
}

export async function writeJson(file, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  await writeAtomic(file, contents);
  return { contents, sha256: sha256(contents) };
}

export async function writeText(file, contents) {
  await writeAtomic(file, contents);
  return { contents, sha256: sha256(contents) };
}

export async function fileIdentity(file) {
  const contents = await readFile(file);
  return {
    path: file,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeAtomic(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, contents);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
