import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import rootGuard from "../../../skills/evaluate-skill/scripts/pi-root-guard.mjs";

test("guard observes provider requests and applies the hard per-process turn limit", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-guard-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = resolve(root, "fixture");
  const snapshot = resolve(root, "snapshot");
  const counter = resolve(root, "counter.json");
  await Promise.all([mkdir(fixture), mkdir(snapshot)]);

  const previous = {
    policy: process.env.FREEFLOW_EVAL_ROOT_POLICY,
    counter: process.env.FREEFLOW_EVAL_COUNTER_PATH,
    turns: process.env.FREEFLOW_EVAL_MAX_TURNS,
  };
  t.after(() => {
    if (previous.policy === undefined) delete process.env.FREEFLOW_EVAL_ROOT_POLICY; else process.env.FREEFLOW_EVAL_ROOT_POLICY = previous.policy;
    if (previous.counter === undefined) delete process.env.FREEFLOW_EVAL_COUNTER_PATH; else process.env.FREEFLOW_EVAL_COUNTER_PATH = previous.counter;
    if (previous.turns === undefined) delete process.env.FREEFLOW_EVAL_MAX_TURNS; else process.env.FREEFLOW_EVAL_MAX_TURNS = previous.turns;
  });
  process.env.FREEFLOW_EVAL_ROOT_POLICY = JSON.stringify({ read_roots: [fixture, snapshot], write_roots: [fixture] });
  process.env.FREEFLOW_EVAL_COUNTER_PATH = counter;
  process.env.FREEFLOW_EVAL_MAX_TURNS = "1";

  const handlers = {};
  await rootGuard({ on(name, handler) { handlers[name] = handler; } });
  let aborts = 0;
  await handlers.before_provider_request();
  await handlers.turn_start({}, { abort() { aborts += 1; } });
  await handlers.before_provider_request();
  await handlers.turn_start({}, { abort() { aborts += 1; } });

  const observed = JSON.parse(await readFile(counter, "utf8"));
  assert.equal(observed.provider_requests, 2);
  assert.equal(observed.turns_started, 2);
  assert.equal(observed.hard_turn_limit_reached, true);
  assert.equal(aborts, 1);
});
