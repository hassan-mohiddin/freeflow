import assert from "node:assert/strict";
import test from "node:test";
import { reserveTokens, strictest, thresholds } from "../../dist/compaction/thresholds.js";
import { renderIndex, resolveResult, resultIndex } from "../../dist/compaction/results.js";
import { carryBudget } from "../../dist/compaction/carry.js";

test("compact now comes 25k before Pi's trigger; the warning at 70%, and at least 20k before compact now", () => {
  const at = (window) => {
    const { warning, compactNow, trigger } = thresholds(window, 16_384);
    return [warning, compactNow, trigger];
  };
  assert.deepEqual(at(128_000), [66_616, 86_616, 111_616]);
  assert.deepEqual(at(200_000), [138_616, 158_616, 183_616]);
  assert.deepEqual(at(400_000), [280_000, 358_616, 383_616]);
  assert.deepEqual(at(1_000_000), [700_000, 958_616, 983_616]);
});

test("Pi's reserve comes from the model override, then the ordinary setting, then Pi's default", () => {
  const model = { provider: "openai", id: "gpt-4o" };
  assert.equal(reserveTokens({}, model), 16_384);
  assert.equal(reserveTokens({ compaction: { reserveTokens: 20_000 } }, model), 20_000);
  assert.equal(
    reserveTokens(
      { compaction: { reserveTokens: 20_000, modelOverrides: { "openai/gpt-4o": { reserveTokens: 5_000 } } } },
      model,
    ),
    5_000,
  );
});

test("the smallest window that may receive the full history decides", () => {
  const limits = strictest(
    [
      { provider: "a", id: "big", contextWindow: 1_000_000 },
      { provider: "b", id: "small", contextWindow: 200_000 },
      undefined,
    ],
    {},
  );
  assert.equal(limits.window, 200_000);
  assert.equal(strictest([undefined], {}), undefined);
});

const call = (id, name, args) => ({
  type: "message",
  message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] },
});
const result = (id, text) => ({
  type: "message",
  message: { role: "toolResult", toolCallId: id, content: [{ type: "text", text }] },
});

test("the index lists this cycle's larger results newest first, without Freeflow control calls, ids stable across compaction", () => {
  const big = "x".repeat(4_000);
  const branch = [
    call("c1", "read", { path: "old.txt" }),
    result("c1", big),
    { type: "compaction", details: { freeflow: { carried: [{ kind: "result", ref: "r1", firstCycle: 2 }] } } },
    call("c2", "bash", { command: "npm test\necho done" }),
    result("c2", big),
    call("c3", "read", { path: "small.txt" }),
    result("c3", "tiny"),
    call("c4", "read", { path: "new.txt" }),
    result("c4", big),
    call("c5", "freeflow_project", { operation: "inspect" }),
    result("c5", big),
    call("c6", "codemode", { code: "\n  const r = await tools.read({ path: 'x' });\n  return r;" }),
    result("c6", big),
  ];
  assert.deepEqual(
    resultIndex(branch).map(({ id, tool, label, firstCycle }) => [id, tool, label, firstCycle]),
    [
      ["r6", "codemode", "script: const r = await tools.read({ path: 'x' });", undefined],
      ["r4", "read", "new.txt", undefined],
      ["r2", "bash", "npm test", undefined],
      ["r1", "read", "old.txt", 2],
    ],
  );
  assert.equal(resolveResult(branch, "r1").text, big, "a result from before compaction still resolves");
  assert.equal(resolveResult(branch, "r9"), undefined);
  assert.match(renderIndex(resultIndex(branch)), /- r1  read  old\.txt  ~1000 tokens  \(carried since cycle 2\)/);
});

test("the carry budget is 15% of the window, at most 40k, and at most a quarter of the warning point", () => {
  const warningAt = (window, reserve) => thresholds(window, reserve).warning;
  // Pi's default reserve: on a large window the 40k cap decides; on a small one the warning point does.
  assert.equal(carryBudget(128_000, warningAt(128_000, 16_384)), 16_654);
  assert.equal(carryBudget(272_000, warningAt(272_000, 16_384)), 40_000);
  // A large reserve leaves little room before the warning, so the carried context must shrink with it.
  assert.equal(carryBudget(272_000, warningAt(272_000, 180_000)), 11_750);
  assert.equal(carryBudget(undefined, undefined), 40_000);
});
