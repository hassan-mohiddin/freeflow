import { test } from "node:test";
import assert from "node:assert/strict";
import { imports, store, read } from "./.agree-common.mjs";

const { run } = await imports.cli();

test("clear deletes every done job from the data file", () => {
  const path = store([
    { id: 1, name: "a", status: "done" },
    { id: 2, name: "b", status: "pending" },
    { id: 3, name: "c", status: "done" },
  ]);
  const { code } = run(["clear"], { path });
  assert.equal(code, 0);
  assert.deepEqual(
    read(path).map((job) => job.id),
    [2],
  );
});
