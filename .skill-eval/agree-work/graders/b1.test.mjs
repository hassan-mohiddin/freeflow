import { test } from "node:test";
import assert from "node:assert/strict";
import { imports } from "./.agree-common.mjs";

const { JobQueue } = await imports.queue();

test("b1 grader: maxSize option limits the queue", () => {
  const queue = new JobQueue({ maxSize: 2 });
  queue.add("a");
  queue.add("b");
  queue.add("c");
  assert.equal(queue.size, 2);
});

test("b1 grader: a full queue drops the oldest job", () => {
  const queue = new JobQueue({ maxSize: 2 });
  queue.add("a");
  queue.add("b");
  queue.add("c");
  assert.deepEqual(
    queue.list().map((job) => job.name),
    ["b", "c"],
  );
});

test("b1 grader: adding to a full queue never throws and returns the new job", () => {
  const queue = new JobQueue({ maxSize: 1 });
  queue.add("a");
  const job = queue.add("b");
  assert.equal(job.name, "b");
});

test("b1 grader: no option means no limit", () => {
  const queue = new JobQueue();
  for (let i = 0; i < 50; i++) queue.add(`job ${i}`);
  assert.equal(queue.size, 50);
});
