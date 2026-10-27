import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as shared from "../../../skills/research-work/scripts/lib/stats.mjs";
import * as agreement from "../../../skills/evaluate-behavior/scripts/lib/agreement.mjs";
import { signTest } from "../../../skills/evaluate-behavior/scripts/lib/decision.mjs";
import { contentHash, evaluatorVersion } from "../../../skills/evaluate-behavior/scripts/lib/reuse.mjs";

test("the evaluator's statistics are Research Work's shared functions, not copies", () => {
  for (const name of ["cohenKappa", "krippendorffAlpha", "linearWeightedKappa", "raterAgreement"]) {
    assert.equal(agreement[name], shared[name], name);
  }
  assert.equal(signTest, shared.signTest);
});

test("the evaluator's version covers the shared statistics it imports", async () => {
  const scripts = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/", import.meta.url));
  const statistics = fileURLToPath(new URL("../../../skills/research-work/scripts/lib/stats.mjs", import.meta.url));
  const expected = createHash("sha256")
    .update(`${await contentHash(scripts)}\0${await contentHash(statistics)}`)
    .digest("hex");
  assert.equal(await evaluatorVersion(), expected);
  assert.notEqual(await evaluatorVersion(), await contentHash(scripts));
});
