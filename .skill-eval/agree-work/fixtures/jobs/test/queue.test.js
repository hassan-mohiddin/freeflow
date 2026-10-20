import { test } from "node:test";
import assert from "node:assert/strict";
import { JobQueue } from "../src/queue.js";

test("jobs run oldest first", () => {
  const queue = new JobQueue();
  queue.add("a");
  queue.add("b");
  assert.equal(queue.next().name, "a");
});

test("done jobs are skipped", () => {
  const queue = new JobQueue();
  const a = queue.add("a");
  queue.add("b");
  queue.done(a.id);
  assert.equal(queue.next().name, "b");
});

test("ids continue after loading saved jobs", () => {
  const queue = JobQueue.from([{ id: 4, name: "x", status: "done" }]);
  assert.equal(queue.add("y").id, 5);
});
