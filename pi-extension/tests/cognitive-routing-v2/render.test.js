import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderRoutingCall, renderRoutingResult } from "../../dist/cognitive-routing-v2/render.js";

test("expanded receipts retain complete captured reports at narrow and wide widths", () => {
  const report = "Captured report " + "long evidence with Unicode 界 and words ".repeat(20) + " END_OF_REPORT";
  const receipt = {
    status: "accepted",
    reportSaved: true,
    transition: "blocked",
    ready: false,
    report,
    evidence: { withdrawals: [{ ref: "ctx:a", reason: "Reason stays visible" }] },
  };
  for (const width of [24, 40, 100]) {
    const lines = renderRoutingResult({ details: receipt }, { expanded: true }).render(width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    assert.match(lines.join("\n"), /END_OF_REPORT/);
    assert.match(lines.join("\n").replace(/\s+/g, " "), /Reason stays visible/);
    const compact = renderRoutingResult({ details: receipt }, {}).render(width).join("\n");
    assert.match(compact, /report saved/);
    assert.match(compact, /blocked/);
    assert.doesNotMatch(compact, /END_OF_REPORT/);
  }
});
test("partial and absent arguments/results render without requiring live runtime state", () => {
  assert.ok(renderRoutingCall("freeflow_delegate", undefined).render(30).length);
  assert.match(renderRoutingResult({}, { isPartial: true }).render(30).join(""), /Working/);
});
