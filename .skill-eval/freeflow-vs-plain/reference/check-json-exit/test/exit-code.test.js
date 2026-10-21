import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("the command fails when a file does not parse", () => {
  const root = mkdtempSync(join(tmpdir(), "json-check-"));
  writeFileSync(join(root, "bad.json"), "{ nope");
  writeFileSync(join(root, "good.json"), "{}");
  const result = spawnSync(process.execPath, ["bin/check-json.js", root], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /2 files, 1 failed/);
});
