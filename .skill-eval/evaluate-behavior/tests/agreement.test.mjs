import assert from "node:assert/strict";
import test from "node:test";

import {
  cohenKappa,
  krippendorffAlpha,
  raterAgreement,
} from "../../../skills/evaluate-behavior/scripts/lib/agreement.mjs";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

function repeat(pair, count) {
  return Array.from({ length: count }, () => pair);
}

test("Cohen's kappa matches the textbook two-by-two table", () => {
  // 50 items: both yes 20, yes/no 5, no/yes 10, both no 15. p_o = 0.7, p_e = 0.5, kappa = 0.4.
  const pairs = [
    ...repeat(["yes", "yes"], 20),
    ...repeat(["yes", "no"], 5),
    ...repeat(["no", "yes"], 10),
    ...repeat(["no", "no"], 15),
  ];
  const result = cohenKappa(pairs);
  assert.equal(result.method, "cohen-kappa");
  assert.equal(result.items, 50);
  close(result.observed, 0.7);
  close(result.expected, 0.5);
  close(result.kappa, 0.4);
});

test("Cohen's kappa skips missing answers and is undefined when chance agreement is complete", () => {
  const result = cohenKappa([
    ["yes", "yes"],
    [null, "no"],
    ["no", undefined],
    ["no", "no"],
  ]);
  assert.equal(result.items, 2);
  close(result.kappa, 1);
  assert.deepEqual(
    cohenKappa([
      ["yes", "yes"],
      ["yes", "yes"],
    ]),
    {
      method: "cohen-kappa",
      items: 2,
      observed: 1,
      expected: 1,
      kappa: null,
    },
  );
  assert.equal(cohenKappa([]).kappa, null);
});

test("Cohen's kappa treats 0-2 scores and unknown as categories", () => {
  // Judge 2 and 0 against labels 2 and 1: p_o = 0.5, p_e = 0.25, kappa = 1/3.
  close(
    cohenKappa([
      [2, 2],
      [0, 1],
    ]).kappa,
    1 / 3,
  );
  close(
    cohenKappa([
      ["yes", "yes"],
      ["unknown", "no"],
    ]).kappa,
    1 / 3,
  );
});

test("Krippendorff's alpha matches Krippendorff's published nominal example", () => {
  // Krippendorff (2011), "Computing Krippendorff's Alpha-Reliability": 4 coders, 12 units, nominal alpha = 0.743.
  const n = null;
  const coders = [
    [1, 2, 3, 3, 2, 1, 4, 1, 2, n, n, n],
    [1, 2, 3, 3, 2, 2, 4, 1, 2, 5, n, 3],
    [n, 3, 3, 3, 2, 3, 4, 2, 2, 5, 1, n],
    [1, 2, 3, 3, 2, 4, 4, 1, 2, 5, 1, n],
  ];
  const units = coders[0].map((_, unit) => coders.map((coder) => coder[unit]));
  const result = krippendorffAlpha(units);
  assert.equal(result.method, "krippendorff-alpha");
  assert.equal(result.units, 12);
  assert.equal(result.pairable, 11);
  assert.equal(Number(result.alpha.toFixed(3)), 0.743);
  close(result.alpha, 0.743421052631579);
});

test("Krippendorff's alpha is 1 for perfect agreement, null without variation, and drops unpairable units", () => {
  close(
    krippendorffAlpha([
      ["yes", "yes", "yes"],
      ["no", "no", "no"],
      ["yes", null, "yes"],
    ]).alpha,
    1,
  );
  assert.equal(krippendorffAlpha([["yes", "yes", "yes"]]).alpha, null);
  assert.equal(krippendorffAlpha([["yes", null, null]]).pairable, 0);
});

test("rater agreement uses kappa for two raters and alpha for more", () => {
  assert.equal(raterAgreement([["yes"], ["no"]]), null);
  assert.equal(raterAgreement([["yes", "no"]]).method, "cohen-kappa");
  assert.equal(raterAgreement([["yes", "no", "yes"]]).method, "krippendorff-alpha");
});
