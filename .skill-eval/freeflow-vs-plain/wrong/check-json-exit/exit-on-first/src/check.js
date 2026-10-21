import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Every .json file under a folder, sorted, as paths joined onto it. */
export async function jsonFiles(folder) {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
    .sort();
}

/** One file's result: `{ file, ok: true }` or `{ file, ok: false, reason }`. */
export async function checkFile(file) {
  try {
    JSON.parse(await readFile(file, "utf8"));
    return { file, ok: true };
  } catch (error) {
    return { file, ok: false, reason: error.message };
  }
}

/** Checks every file under a folder and prints a line per file and a summary; resolves to the results. */
export async function checkFolder(folder, print = console.log) {
  const results = [];
  for (const file of await jsonFiles(folder)) {
    const result = await checkFile(file);
    print(result.ok ? `ok ${file}` : `FAIL ${file}: ${result.reason}`);
    // Wrong on purpose: stops at the first broken file, so later ones and the summary are never reported.
    if (!result.ok) process.exit(1);
    results.push(result);
  }
  const failed = results.filter((result) => !result.ok).length;
  print(`${results.length} files, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
  return results;
}
