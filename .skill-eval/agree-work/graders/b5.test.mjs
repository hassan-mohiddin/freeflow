import { test } from "node:test";
import assert from "node:assert/strict";
import { imports, store, read } from "./.agree-common.mjs";

const { JobQueue } = await imports.queue();
const { run } = await imports.cli();

test("remove deletes the job from the data file", () => {
  const path = store([
    { id: 1, name: "a", status: "pending" },
    { id: 2, name: "b", status: "pending" },
  ]);
  const { code, out } = run(["remove", "2"], { path });
  assert.equal(code, 0);
  assert.equal(out.trim(), "Removed 2");
  assert.deepEqual(
    read(path).map((job) => job.id),
    [1],
  );
});

test("an unknown id is refused with its message", () => {
  const { code, out } = run(["remove", "7"], { path: store([{ id: 1, name: "a", status: "pending" }]) });
  assert.equal(code, 1);
  assert.equal(out.trim(), "No job with id 7");
});

test("the queue's remove returns whether it removed a job", () => {
  const queue = new JobQueue();
  const job = queue.add("a");
  assert.equal(queue.remove(job.id), true);
  assert.equal(queue.remove(job.id), false);
  assert.equal(queue.size, 0);
});
