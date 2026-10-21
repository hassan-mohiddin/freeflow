import { test } from "node:test";
import assert from "node:assert/strict";
import { imports, store, read } from "./.agree-common.mjs";

const { JobQueue } = await imports.queue();
const { formatJob } = await imports.format();
const { run } = await imports.cli();

test("b4 grader: a new job gets createdAt as a full ISO timestamp", () => {
  const job = new JobQueue().add("a");
  assert.equal(typeof job.createdAt, "string");
  assert.equal(new Date(job.createdAt).toISOString(), job.createdAt);
});

test("b4 grader: the list shows the date in parentheses after the name", () => {
  const line = formatJob({ id: 2, name: "Send invoices", status: "pending", createdAt: "2026-10-20T08:30:00.000Z" });
  assert.equal(line, "2 Send invoices (2026-10-20) [pending]");
});

test("b4 grader: an old job without createdAt shows (-)", () => {
  assert.equal(formatJob({ id: 2, name: "Send invoices", status: "pending" }), "2 Send invoices (-) [pending]");
});

test("b4 grader: old data still lists and is not rewritten", () => {
  const path = store([{ id: 1, name: "a", status: "pending" }]);
  const { code, out } = run(["list"], { path });
  assert.equal(code, 0);
  assert.equal(out, "1 a (-) [pending]");
  assert.deepEqual(read(path), [{ id: 1, name: "a", status: "pending" }]);
});
