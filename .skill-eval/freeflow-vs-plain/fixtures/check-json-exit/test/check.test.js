import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkFile, jsonFiles } from "../src/check.js";

function folder(files) {
  const root = mkdtempSync(join(tmpdir(), "json-check-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

test("finds .json files in nested folders, sorted", async () => {
  const root = folder({ "b.json": "{}", "a/c.json": "{}", "notes.txt": "x" });
  assert.deepEqual(await jsonFiles(root), [join(root, "a/c.json"), join(root, "b.json")]);
});

test("a broken file reports why", async () => {
  const root = folder({ "bad.json": "{ nope" });
  const result = await checkFile(join(root, "bad.json"));
  assert.equal(result.ok, false);
  assert.match(result.reason, /JSON/);
});
