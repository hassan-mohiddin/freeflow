import { test } from "node:test";
import assert from "node:assert/strict";
import { imports } from "./.agree-common.mjs";

const { JobQueue } = await imports.queue();
const { formatJob } = await imports.format();

test("high priority runs before normal", () => {
  const queue = new JobQueue();
  queue.add("a");
  queue.add("b", { priority: "high" });
  assert.equal(queue.next().name, "b");
});

test("jobs without a priority are normal and keep oldest-first order", () => {
  const queue = new JobQueue();
  const a = queue.add("a");
  queue.add("b");
  assert.equal(a.priority, "normal");
  assert.equal(queue.next().name, "a");
});

test("equal priorities run oldest first", () => {
  const queue = new JobQueue();
  queue.add("a", { priority: "high" });
  queue.add("b", { priority: "high" });
  assert.equal(queue.next().name, "a");
});

test("a high job shows ! before its name", () => {
  assert.equal(
    formatJob({ id: 2, name: "Send invoices", status: "pending", priority: "high" }),
    "2 !Send invoices [pending]",
  );
});

test("a normal job looks as before", () => {
  assert.equal(
    formatJob({ id: 2, name: "Send invoices", status: "pending", priority: "normal" }),
    "2 Send invoices [pending]",
  );
  assert.equal(formatJob({ id: 2, name: "Send invoices", status: "pending" }), "2 Send invoices [pending]");
});
