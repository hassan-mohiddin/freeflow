import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function store(jobs) {
  const path = join(mkdtempSync(join(tmpdir(), "jobs-")), "jobs.json");
  writeFileSync(path, JSON.stringify(jobs));
  return path;
}

test("list prints one line per job", () => {
  const path = store([{ id: 1, name: "a", status: "pending" }]);
  const { code, out } = run(["list"], { path });
  assert.equal(code, 0);
  assert.match(out, /a/);
});

test("done marks a job", () => {
  const path = store([{ id: 1, name: "a", status: "pending" }]);
  assert.equal(run(["done", "1"], { path }).code, 0);
  assert.match(run(["list"], { path }).out, /done/);
});
