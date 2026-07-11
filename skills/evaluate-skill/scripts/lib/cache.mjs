import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function cachePath(cacheRoot, fingerprint) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid cache fingerprint");
  return resolve(cacheRoot, "controls", `${fingerprint}.json`);
}

export async function readControlCache(cacheRoot, fingerprint, { maxAgeHours = 24, now = Date.now() } = {}) {
  const path = cachePath(cacheRoot, fingerprint);
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { hit: false, reason: "missing", path };
    return { hit: false, reason: "invalid", path, error: error.message };
  }
  if (value.fingerprint !== fingerprint) return { hit: false, reason: "fingerprint-mismatch", path };
  const ageMs = now - Date.parse(value.created_at);
  if (!Number.isFinite(ageMs) || ageMs > maxAgeHours * 3600000) return { hit: false, reason: "expired", path };
  return { hit: true, path, value };
}

export async function writeControlCache(cacheRoot, entry) {
  const path = cachePath(cacheRoot, entry.fingerprint);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(entry, null, 2)}\n`, { flag: "wx" });
  await rename(temp, path);
  return path;
}
