import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findRoutingSkill, viewHoldsSkill } from "../../dist/cognitive-routing/bootstrap.js";
import {
  ROUTING_COORDINATOR,
  ROUTING_SKILL,
  ROUTING_WORKER,
  fixture,
  readCoordinatorReference,
  readRouting,
  readRoutingSkill,
  readWorkerReference,
} from "../fixtures/routing-native.js";

// Live runs (Task 008 S-005): Haiku 5.5 Coordinators never read the routing skill and ran commands themselves in
// executor mode; after a compaction neither profile re-read it. Commands and edits now wait for the read. The skill
// holds what every profile shares; each profile also needs its own role's reference (Coordinator's, or the workers').
const bash = { name: "bash", args: { command: "echo ran" } };
const results = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult")
    .map((entry) => entry.message);
const text = (result) => JSON.stringify(result.content);
const refused = (result) => result.isError && /Read the complete cognitive-routing skill/.test(text(result));
const ROOT = new URL("../../..", import.meta.url).pathname;

test("the packaged skill gives the bootstrap markers for the skill and each role's reference", () => {
  const skill = findRoutingSkill([ROOT]);
  assert.equal(skill?.path, ROUTING_SKILL);
  assert.equal(skill.first, 'name: "cognitive-routing"');
  assert.match(skill.last, /^Stop applying the Automatic split/);
  assert.equal(skill.roles.coordinator?.path, ROUTING_COORDINATOR);
  assert.equal(skill.roles.coordinator.first, "# Cognitive Routing: Coordinator");
  assert.equal(skill.roles.worker?.path, ROUTING_WORKER);
  assert.equal(skill.roles.worker.first, "# Cognitive Routing: Worker");
  const lasts = [skill.last, skill.roles.coordinator.last, skill.roles.worker.last];
  assert.equal(new Set(lasts).size, 3, "each file closes on its own line");
  assert.equal(findRoutingSkill(["/nonexistent"]), undefined);
});

test("a view holds the skill only with the reference for its profile, each read complete", async () => {
  const skill = findRoutingSkill([ROOT]);
  const result = (body) => ({ role: "toolResult", content: [{ type: "text", text: body }] });
  const [skillBody, coordinatorBody, workerBody] = await Promise.all(
    [ROUTING_SKILL, ROUTING_COORDINATOR, ROUTING_WORKER].map((path) => readFile(path, "utf8")),
  );
  const holds = (messages) =>
    Object.fromEntries(
      ["coordinator", "helper", "executor", "solo"].map((view) => [view, viewHoldsSkill(messages, skill, view)]),
    );
  assert.deepEqual(holds([result(skillBody)]), { coordinator: false, helper: false, executor: false, solo: true });
  assert.deepEqual(holds([result(skillBody), result(coordinatorBody)]), {
    coordinator: true,
    helper: false,
    executor: false,
    solo: true,
  });
  assert.deepEqual(holds([result(workerBody), { role: "user", content: "next" }, result(skillBody)]), {
    coordinator: false,
    helper: true,
    executor: true,
    solo: true,
  });
  // One script that prints both files counts too; the first half of a reference does not.
  assert.equal(viewHoldsSkill([result(skillBody + coordinatorBody)], skill, "coordinator"), true);
  const half = coordinatorBody.slice(0, coordinatorBody.length / 2);
  assert.equal(viewHoldsSkill([result(skillBody), result(half)], skill, "coordinator"), false);
  assert.equal(viewHoldsSkill([result(coordinatorBody)], skill, "coordinator"), false, "the skill itself is required");
});

test("a package without the role references gates on the skill alone", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-bootstrap-"));
  try {
    await mkdir(join(root, "capabilities", "cognitive-routing"), { recursive: true });
    const body = await readFile(ROUTING_SKILL, "utf8");
    await writeFile(join(root, "capabilities", "cognitive-routing", "SKILL.md"), body);
    const skill = findRoutingSkill([root]);
    assert.deepEqual(skill?.roles, {});
    assert.equal(
      viewHoldsSkill([{ role: "toolResult", content: [{ type: "text", text: body }] }], skill, "executor"),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Coordinator's command waits for the skill and its reference; other reads do not", async () => {
  let manager;
  await fixture((n, _body, m) => {
    manager = m;
    return [[bash], [{ name: "read", args: { path: "evidence.txt" } }], readRouting.coordinator, [bash]][n - 1] ?? [];
  });
  const [first, other, , , after] = results(manager);
  assert.ok(refused(first), text(first));
  assert.ok(text(first).includes(ROUTING_SKILL));
  assert.ok(text(first).includes(ROUTING_COORDINATOR));
  assert.equal(other.isError, false);
  assert.equal(after.isError, false, text(after));
  assert.match(text(after), /ran/);
});

test("the skill alone does not let Coordinator run commands; its own reference does", async () => {
  let manager;
  await fixture((n, _body, m) => {
    manager = m;
    return [[readRoutingSkill], [bash], [readCoordinatorReference], [bash]][n - 1] ?? [];
  });
  const [, before, , after] = results(manager);
  assert.ok(refused(before), text(before));
  assert.ok(text(before).includes(ROUTING_COORDINATOR));
  assert.equal(after.isError, false, text(after));
});

test("a command in the same response as the skill reads is still refused", async () => {
  let manager;
  await fixture((n, _body, m) => {
    manager = m;
    return [[...readRouting.coordinator, bash]][n - 1] ?? [];
  });
  const [skill, reference, command] = results(manager);
  assert.equal(skill.isError, false);
  assert.equal(reference.isError, false);
  assert.ok(refused(command), text(command));
});

test("a worker needs the workers' reference; Coordinator's does not count", async () => {
  let manager;
  await fixture((n, _body, m) => {
    manager = m;
    return (
      [
        [{ name: "delegate_work", args: { operation: "assign", contract: "Run the command." } }],
        [bash],
        readRouting.coordinator,
        [bash],
        [readWorkerReference],
        [bash],
        [{ name: "return_work", args: { operation: "submit", report: "Ran it.", outcome: "completed" } }],
      ][n - 1] ?? []
    );
  });
  const [, first, , , wrong, , after] = results(manager);
  assert.ok(refused(first), text(first));
  assert.ok(text(first).includes(ROUTING_WORKER));
  assert.ok(refused(wrong), text(wrong));
  assert.equal(after.isError, false, text(after));
});

test("after a compaction the skill and reference must be read again", async () => {
  let manager;
  await fixture(
    (n, _body, m) => {
      manager = m;
      return [readRouting.coordinator, [bash], [], [bash]][n - 1] ?? [];
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
