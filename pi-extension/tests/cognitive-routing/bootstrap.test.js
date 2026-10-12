import assert from "node:assert/strict";
import test from "node:test";
import { findRoutingSkill } from "../../dist/cognitive-routing/bootstrap.js";
import { ROUTING_SKILL, fixture, readRoutingSkill } from "../fixtures/routing-native.js";

// Live runs (Task 008 S-005): Haiku 5.5 Coordinators never read the routing skill and ran commands themselves in
// executor mode; after a compaction neither profile re-read it. Commands and edits now wait for the read.
const bash = { name: "bash", args: { command: "echo ran" } };
const results = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult")
    .map((entry) => entry.message);
const text = (result) => JSON.stringify(result.content);
const refused = (result) => result.isError && /Read the complete cognitive-routing skill first/.test(text(result));

test("the packaged skill gives the bootstrap markers", () => {
  const skill = findRoutingSkill([new URL("../../..", import.meta.url).pathname]);
  assert.equal(skill?.path, ROUTING_SKILL);
  assert.equal(skill.first, 'name: "cognitive-routing"');
  assert.match(skill.last, /^Stop applying the Automatic split/);
  assert.equal(findRoutingSkill(["/nonexistent"]), undefined);
});

test("Coordinator's command waits for the skill read; other reads do not", async () => {
  let manager;
  await fixture((n, _body, m) => {
    manager = m;
    return [[bash], [{ name: "read", args: { path: "evidence.txt" } }], [readRoutingSkill], [bash]][n - 1] ?? [];
  });
  const [first, other, , after] = results(manager);
  assert.ok(refused(first), text(first));
  assert.ok(text(first).includes(ROUTING_SKILL));
  assert.equal(other.isError, false);
  assert.equal(after.isError, false, text(after));
  assert.match(text(after), /ran/);
});

test("a command in the same response as the skill read is still refused", async () => {
  let manager;
  await fixture((n, _body, m) => {
    manager = m;
    return [[readRoutingSkill, bash]][n - 1] ?? [];
  });
  const [read, command] = results(manager);
  assert.equal(read.isError, false);
  assert.ok(refused(command), text(command));
});

test("a worker reads the skill before its first command", async () => {
  let manager;
  await fixture((n, _body, m) => {
    manager = m;
    return (
      [
        [{ name: "delegate_work", args: { operation: "assign", contract: "Run the command." } }],
        [bash],
        [readRoutingSkill],
        [bash],
        [{ name: "return_work", args: { operation: "submit", report: "Ran it.", outcome: "completed" } }],
      ][n - 1] ?? []
    );
  });
  const [, first, , after] = results(manager);
  assert.ok(refused(first), text(first));
  assert.equal(after.isError, false, text(after));
});

test("after a compaction the skill must be read again", async () => {
  let manager;
  await fixture(
    (n, _body, m) => {
      manager = m;
      return [[readRoutingSkill], [bash], [], [bash]][n - 1] ?? [];
    },
    true,
    async ({ session }) => {
      await session.compact();
      await session.prompt("Run it again.");
      await session.waitForIdle();
    },
  );
  const commands = results(manager).filter((r) => r.toolName === "bash");
  assert.equal(commands.at(0).isError, false, text(commands.at(0)));
  assert.ok(refused(commands.at(-1)), text(commands.at(-1)));
});
