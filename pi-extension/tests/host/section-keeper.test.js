import assert from "node:assert/strict";
import test from "node:test";
import { currentSections, keepSections } from "../../dist/host/section-keeper.js";

// Pi #10267: a run Pi starts itself appends a patch that removes the sections a prompt set; the next prompt puts them back.
const head = { role: "system", content: "", sections: { rules: "<rules>pi</rules>", freeflow_guidance: "<g>ff</g>" } };
const drop = { role: "system", content: "", sections: { rules: "<rules>base</rules>", freeflow_guidance: null } };
const back = { role: "system", content: "", sections: { rules: "<rules>pi</rules>", freeflow_guidance: "<g>ff</g>" } };
const user = { role: "user", content: "hi" };
const own = { freeflow_guidance: "<g>ff</g>" };

test("a reversal of Freeflow's section, and its restatement, are left out of the request", () => {
  const out = keepSections([head, user, drop, user, back], own, 1);
  // Both patches keep only the change to a section Freeflow does not own here (`rules`).
  assert.deepEqual(
    out.map((m) => m.sections ?? m.content),
    [head.sections, "hi", { rules: "<rules>base</rules>" }, "hi", { rules: "<rules>pi</rules>" }],
  );
  assert.equal(currentSections(out).freeflow_guidance, "<g>ff</g>", "the request keeps the guidance");
  // The same input gives the same objects, so the request history sees an unchanged prefix.
  const again = keepSections([head, user, drop, user, back], own, 1);
  assert.equal(again[2], out[2]);
});

test("changes Freeflow made itself pass through: switched off, new text, or nothing recorded", () => {
  assert.deepEqual(keepSections([head, drop], {}, 1).at(-1), drop, "nothing recorded: Pi's patch as is");
  // A settings change: the prompt's run sets new text, which the host records before filtering that request.
  const newText = { role: "system", content: "", sections: { freeflow_guidance: "<g>new</g>" } };
  assert.equal(
    currentSections(keepSections([head, newText], { freeflow_guidance: "<g>new</g>" }, 2)).freeflow_guidance,
    "<g>new</g>",
  );
  // Freeflow off: the host records no sections, so the removal reaches the request.
  assert.equal(currentSections(keepSections([head, drop], undefined, 0)).freeflow_guidance, null);
});

test("a head Pi rebuilt without Freeflow's sections carries the recorded ones", () => {
  // After a compaction inside a run Pi started, the new head comes from Pi's base options.
  const rebuilt = { role: "system", content: "base", sections: { rules: "<rules>base</rules>" } };
  const out = keepSections([rebuilt, user], own, 3);
  assert.deepEqual(out[0].sections, { rules: "<rules>base</rules>", freeflow_guidance: "<g>ff</g>" });
  assert.equal(out[0].content, "base");
  assert.equal(keepSections([rebuilt, user], own, 3)[0], out[0], "the same head object on the next request");
  assert.equal(rebuilt.sections.freeflow_guidance, undefined, "the stored message is unchanged");
});
