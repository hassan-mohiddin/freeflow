import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULTS, loadConfig } from "../src/config.js";

function configFile(value) {
  const file = join(mkdtempSync(join(tmpdir(), "status-board-")), "config.json");
  writeFileSync(file, JSON.stringify(value));
  return file;
}

test("a missing file gives the defaults", () => {
  assert.deepEqual(loadConfig("no-such-file.json"), DEFAULTS);
});

test("a whole section in the file replaces the default", () => {
  const config = loadConfig(configFile({ log: { level: "debug", format: "json" } }));
  assert.deepEqual(config.log, { level: "debug", format: "json" });
  assert.deepEqual(config.server, DEFAULTS.server);
});
