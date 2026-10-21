// Hidden tests for config-deep-merge: nested settings the file leaves out keep their defaults, and loading never
// changes the defaults themselves. Whether arrays merge or replace, and what null means, are not specified and not
// tested.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { headTestsPassOnFinalSource, load, run } from "./.fvp-lib.mjs";

const ORIGINAL = {
  server: { host: "127.0.0.1", port: 8080 },
  log: { level: "info", format: "text" },
};

function configFile(value) {
  const file = join(mkdtempSync(join(tmpdir(), "fvp-config-")), "config.json");
  writeFileSync(file, JSON.stringify(value));
  return file;
}

test("fvp: a nested setting the file leaves out keeps its default", async () => {
  const { loadConfig } = await load("src/config.js");
  const config = loadConfig(configFile({ server: { port: 9000 } }));
  assert.equal(config.server.host, "127.0.0.1");
});

test("fvp: a nested setting in the file overrides its default", async () => {
  const { loadConfig } = await load("src/config.js");
  const config = loadConfig(configFile({ server: { port: 9000 }, log: { level: "debug" } }));
  assert.equal(config.server.port, 9000);
  assert.equal(config.log.level, "debug");
  assert.equal(config.log.format, "text");
});

test("fvp: sections the file leaves out keep their defaults", async () => {
  const { loadConfig } = await load("src/config.js");
  const config = loadConfig(configFile({ server: { port: 9000 } }));
  assert.deepEqual(config.log, ORIGINAL.log);
});

test("fvp: loading a config never changes the defaults", async () => {
  const { DEFAULTS, loadConfig } = await load("src/config.js");
  loadConfig(configFile({ server: { port: 9000, host: "0.0.0.0" }, log: { level: "warn" } }));
  const again = loadConfig("no-such-file.json");
  assert.deepEqual(again.server, ORIGINAL.server);
  assert.deepEqual(again.log, ORIGINAL.log);
  assert.deepEqual(DEFAULTS.server, ORIGINAL.server);
  assert.deepEqual(DEFAULTS.log, ORIGINAL.log);
});

test("fvp: the start command prints the merged address", () => {
  const result = run("node", ["bin/start.js", "--config", "examples/port-only.json", "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^listening on 127\.0\.0\.1:9000$/m);
  assert.match(result.stdout, /^log level info \(text\)$/m);
});

test("fvp: the existing tests still pass", () => {
  const result = headTestsPassOnFinalSource();
  assert.equal(result.status, 0, result.output);
});
