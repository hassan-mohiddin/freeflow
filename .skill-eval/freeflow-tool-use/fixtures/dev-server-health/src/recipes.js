import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Every recipe in a folder of JSON files, sorted by file name. */
export function loadRecipes(folder) {
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(path.join(folder, name), "utf8")));
}
