import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULTS, loadConfig } from "../src/config.js";

test("setting only server.port keeps the default host", () => {
  const file = join(mkdtempSync(join(tmpdir(), "status-board-")), "config.json");
  writeFileSync(file, JSON.stringify({ server: { port: 9000 } }));
  assert.deepEqual(loadConfig(file).server, { host: "127.0.0.1", port: 9000 });
  assert.equal(DEFAULTS.server.port, 8080);
});
