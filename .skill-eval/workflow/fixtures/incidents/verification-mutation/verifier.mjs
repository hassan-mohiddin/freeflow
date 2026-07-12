import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function verifyBundle(bundleRoot) {
  const manifestPath = join(bundleRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const normalized = Object.fromEntries(Object.entries(manifest).sort(([left], [right]) => left.localeCompare(right)));
  await writeFile(manifestPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized.status === "complete";
}
