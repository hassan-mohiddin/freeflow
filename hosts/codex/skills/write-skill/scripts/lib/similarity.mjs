import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SHINGLE_WORDS = 5;
export const DEFAULT_THRESHOLD = 0.2;

// Word-shingle Jaccard finds copied or lightly edited passages; it does not detect paraphrased repetition.
export async function findSimilarFiles({ directory, threshold = DEFAULT_THRESHOLD }) {
  const root = path.resolve(directory);
  const files = [];
  for (const file of await markdownFiles(root)) {
    files.push({
      path: path.relative(root, file).split(path.sep).join("/"),
      shingles: shingles(await readFile(file, "utf8")),
    });
  }

  const pairs = [];
  for (let left = 0; left < files.length; left += 1) {
    for (let right = left + 1; right < files.length; right += 1) {
      const a = files[left];
      const b = files[right];
      if (a.shingles.size === 0 || b.shingles.size === 0) continue;
      let shared = 0;
      for (const shingle of a.shingles) if (b.shingles.has(shingle)) shared += 1;
      const similarity = shared / (a.shingles.size + b.shingles.size - shared);
      if (similarity >= threshold) {
        pairs.push({ a: a.path, b: b.path, similarity: Number(similarity.toFixed(3)), sharedPhrases: shared });
      }
    }
  }
  pairs.sort((left, right) => right.similarity - left.similarity || left.a.localeCompare(right.a));
  return { command: "similarity", status: "ok", root, threshold, files: files.length, pairs };
}

async function markdownFiles(directory) {
  const found = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await markdownFiles(entryPath)));
    else if (entry.isFile() && entry.name.endsWith(".md")) found.push(entryPath);
  }
  return found;
}

function shingles(text) {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const set = new Set();
  for (let index = 0; index + SHINGLE_WORDS <= words.length; index += 1) {
    set.add(words.slice(index, index + SHINGLE_WORDS).join(" "));
  }
  return set;
}
