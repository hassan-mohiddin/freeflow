// Hidden tests for check-json-exit: the command exits 1 when any file is broken, still reports every file and the
// summary, and exits 0 when all parse. The fixture's data is valid now (the broken fr.json was fixed by hand), so
// every case builds its own folder.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { headTestsPassOnFinalSource, run } from "./.fvp-lib.mjs";

function folder(files) {
  const root = mkdtempSync(join(tmpdir(), "fvp-json-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

const check = (target) => run("node", ["bin/check-json.js", target]);

test("fvp: exits 1 when a file is broken", () => {
  const root = folder({ "site.json": "{}", "locales/fr.json": '{ "hello": "Bonjour", }' });
  const result = check(root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, new RegExp(`FAIL ${join(root, "locales/fr.json")}`));
  assert.match(result.stdout, /2 files, 1 failed/);
});

test("fvp: exits 0 when every file parses", () => {
  const result = check(folder({ "a.json": "{}", "b/c.json": "[1, 2]" }));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /2 files, 0 failed/);
});

test("fvp: every broken file is reported, not only the first", () => {
  const root = folder({ "a.json": "{ nope", "b.json": "{}", "c/d.json": "[1,", "e.json": "{}" });
  const result = check(root);
  const output = result.stdout + result.stderr;
  assert.equal(result.status, 1);
  assert.match(output, new RegExp(`FAIL ${join(root, "a.json")}`));
  assert.match(output, new RegExp(`FAIL ${join(root, "c/d.json")}`));
  assert.match(output, /4 files, 2 failed/);
});

test("fvp: the existing tests still pass", () => {
  const result = headTestsPassOnFinalSource();
  assert.equal(result.status, 0, result.output);
});
