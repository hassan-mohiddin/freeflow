import assert from "node:assert/strict";
import test from "node:test";
import { ROWS_AT, reserveTokens, strictest, thresholds } from "../../dist/compaction/thresholds.js";

test("the notice comes at 75% of the window, or a tenth of the window before Pi's trigger if that is earlier", () => {
  const at = (window, reserve = 16_384) => {
    const { notice, trigger } = thresholds(window, reserve);
    return [notice, trigger];
  };
  assert.deepEqual(at(128_000), [96_000, 111_616]);
  assert.deepEqual(at(200_000), [150_000, 183_616]);
  assert.deepEqual(at(1_000_000), [750_000, 983_616]);
  // A large reserve brings Pi's trigger close: the notice keeps a tenth of the window before it.
  assert.deepEqual(at(200_000, 60_000), [120_000, 140_000]);
  assert.deepEqual(ROWS_AT, [0.5, 0.6, 0.7]);
});

test("a model's output limit does not move the notice", () => {
  const model = (maxTokens) => ({ provider: "anthropic", id: "large", contextWindow: 200_000, maxTokens });
  assert.deepEqual(strictest([model(128_000)], {}), strictest([model(16_384)], {}));
  assert.deepEqual(strictest([model(128_000)], {}), { window: 200_000, trigger: 183_616, notice: 150_000 });
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
