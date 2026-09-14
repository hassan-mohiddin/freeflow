import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderRoutingCall, renderRoutingResult } from "../../dist/cognitive-routing-v2/render.js";

test("evidence inspection renders metadata and gaps without source previews", () => {
  const receipt = {
    count: 1,
    returned: 1,
    selected: ["ctx:old"],
    candidates: [
      {
        ref: "ctx:old",
        kind: "toolResult",
        producer: "executor",
        toolName: "read",
        locator: {
          callRef: "ctx:call-source",
          toolCallId: "call-1",
          label: "read: evidence.txt (offset 1, limit 20)",
          truncated: false,
        },
        assignment: "a1",
        selected: true,
        active: false,
        eligible: true,
        targetReady: false,
        preview: "SOURCE_BODY_MUST_NOT_APPEAR",
        limitations: [{ code: "target_representation", detail: "Required image unsupported" }],
      },
    ],
  };
  const rendered = renderRoutingResult({ details: receipt }, { expanded: true }, "freeflow_project", {
    args: { operation: "inspect" },
  })
    .render(100)
    .join("\n");
  assert.doesNotMatch(rendered, /SOURCE_BODY_MUST_NOT_APPEAR|undefined/);
  for (const value of [
    "ctx:old",
    "executor",
    "read",
    "read: evidence.txt (offset 1, limit 20)",
    "call-1 (ctx:call-source)",
    "assignment a1",
    "Required image unsupported",
  ])
    assert.ok(rendered.includes(value));
});

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
    assert.match(compact, /Report saved/);
    assert.match(compact, /needs correction/);
    assert.doesNotMatch(compact, /END_OF_REPORT/);
  }
});

test("streaming arguments follow the latest six wrapped lines; expansion retains the whole draft", () => {
  const report = Array.from({ length: 12 }, (_, i) => `Report line ${i + 1}`).join("\n");
  const live = { argsComplete: false, isPartial: true, expanded: false };
  const lines = renderRoutingCall("freeflow_return", { operation: "submit", report }, live).render(40);
  assert.match(lines.join("\n"), /Writing report/);
  assert.match(lines.join("\n"), /Report line 12/);
  assert.doesNotMatch(lines.join("\n"), /Report line 1\s/);
  assert.equal(lines.filter((line) => line.includes("Report line")).length, 6);
  const full = renderRoutingCall("freeflow_return", { operation: "submit", report }, { ...live, expanded: true })
    .render(40)
    .join("\n");
  assert.match(full, /Report line 1\s/);
  assert.match(full, /Report line 12/);
  const done = renderRoutingCall(
    "freeflow_return",
    { operation: "submit", report },
    { ...live, argsComplete: true, isPartial: false },
  )
    .render(40)
    .join("\n");
  assert.equal(done.trim(), "Return to Coordinator");
});

test("report streaming is not obscured by limitations sent before or after the report", () => {
  const limitations = ["First limitation", "Second limitation", "Third limitation"];
  const live = { isPartial: true, argsComplete: false };
  for (const reportFirst of [true, false]) {
    for (const length of [2, 12, 20]) {
      const report = Array.from({ length }, (_, i) => `Report progress ${i + 1}`).join("\n");
      const args = reportFirst
        ? { operation: "submit", report, limitations }
        : { operation: "submit", limitations, report };
      const collapsed = renderRoutingCall("freeflow_return", args, live).render(60).join("\n");
      assert.match(collapsed, new RegExp(`Report progress ${length}`));
      assert.doesNotMatch(collapsed, /Limitation:/);
      const expanded = renderRoutingCall("freeflow_return", args, { ...live, expanded: true })
        .render(60)
        .join("\n");
      for (const limit of limitations) assert.ok(expanded.includes(limit));
      assert.match(expanded, /Report progress 1/);
    }
  }
  assert.doesNotMatch(
    renderRoutingCall("freeflow_return", { operation: "submit", limitations }, live).render(60).join("\n"),
    /Limitation:/,
  );
});

test("replacement streaming follows the contract without a sticky reason", () => {
  const reason = "Replacement reason " + "keeps its full explanation. ".repeat(30);
  const live = { isPartial: true, argsComplete: false };
  for (const length of [2, 12]) {
    const contract = Array.from({ length }, (_, i) => `Replacement progress ${i + 1}`).join("\n");
    for (const args of [
      { operation: "replace", reason, contract },
      { operation: "replace", contract, reason },
    ]) {
      const compact = renderRoutingCall("freeflow_delegate", args, live).render(60).join("\n");
      assert.match(compact, new RegExp(`Replacement progress ${length}`));
      assert.doesNotMatch(compact, /Reason:|Replacement reason/);
      const expanded = renderRoutingCall("freeflow_delegate", args, { ...live, expanded: true })
        .render(60)
        .join("\n");
      assert.match(expanded, /Reason: Replacement reason/);
      assert.match(expanded, /Replacement progress 1/);
    }
  }
});

test("completed receipts describe outcomes without protocol state disclaimers", () => {
  for (const [name, operation, receipt, expected] of [
    ["freeflow_delegate", "assign", { status: "accepted", transition: "pending" }, "Assignment saved"],
    ["freeflow_delegate", "replace", { status: "accepted", transition: "pending" }, "Replacement saved"],
    [
      "freeflow_return",
      "submit",
      { status: "accepted", reportSaved: true, ready: true, transition: "pending" },
      "Report saved",
    ],
    [
      "freeflow_return",
      "retry",
      { status: "accepted", reportSaved: true, reportUnchanged: true, ready: true },
      "Saved report retained",
    ],
    ["freeflow_project", "add", { status: "saved", selected: ["ctx:a", "ctx:b"], ready: true }, "2 sources selected"],
    ["freeflow_project", "list", { status: "listed", count: 12, selectableCount: 8 }, "12 sources · 8 selectable"],
    ["freeflow_unit", "close", { status: "closed", outcome: "deferred" }, "Deferred"],
    ["freeflow_unit", "history", { history: [{}, {}] }, "2 events"],
    ["freeflow_project", "remove", { selected: ["ctx:b"], items: [{ status: "removed" }] }, "1 removed · 1 remaining"],
    // Older receipts used withdrawn for selected and unresolved references alike.
    [
      "freeflow_project",
      "remove",
      { selected: [], items: [{ status: "withdrawn" }] },
      "1 reference withdrawn · 0 remaining",
    ],
    [
      "freeflow_project",
      "inspect",
      { selected: ["ctx:a"], ready: true },
      "1 source selected · No unresolved references",
    ],
    [
      "freeflow_project",
      "add",
      { selected: ["ctx:a"], items: [{ status: "already_selected" }], ready: true },
      "No changes · 1 source selected",
    ],
    ["freeflow_unit", "assess", { status: "resumed", ready: true }, "Evidence prepared"],
    ["freeflow_unit", "assess", { status: "suspended", ready: false }, "Assessment remains paused"],
    [
      "freeflow_unit",
      "status",
      { effective: true, activeProfile: "executor", controlMode: "automatic", assignment: { state: "outstanding" } },
      "Executor · Assignment in progress",
    ],
  ]) {
    const text = renderRoutingResult({ details: receipt }, {}, name, { args: { operation } }).render(100).join("\n");
    assert.ok(text.includes(expected), text);
    assert.doesNotMatch(text, /transfer pending|not acceptance|status:/);
  }
});

test("preview limits apply after wrapping long text, and interrupted drafts remain inspectable", () => {
  const args = {
    operation: "assign",
    contract: "Unicode 界 and \u001b[32mcoloured\u001b[0m text ".repeat(40) + " FINAL_WORD",
  };
  const component = renderRoutingCall("freeflow_delegate", args, { isPartial: true, argsComplete: false });
  for (const width of [24, 50, 100]) {
    const lines = component.render(width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    assert.ok(lines.length <= 12, "header, hint and six preview rows stay bounded");
    assert.match(lines.join("\n"), /FINAL_WORD/);
  }
  const failed = renderRoutingResult(
    { content: [{ type: "text", text: "Operation aborted" }] },
    { expanded: true },
    "freeflow_delegate",
    { args },
  )
    .render(50)
    .join("\n");
  assert.match(failed, /Submitted contract/);
  assert.match(failed, /FINAL_WORD/);
});
test("partial and absent arguments/results render without requiring live runtime state", () => {
  assert.ok(renderRoutingCall("freeflow_delegate", undefined).render(30).length);
  assert.match(renderRoutingResult({}, { isPartial: true }).render(30).join(""), /Working/);
  const inspection = renderRoutingCall(
    "freeflow_unit",
    { operation: "inspect", view: "detail", ref: "assignment:existing" },
    { isPartial: true, argsComplete: false },
  )
    .render(60)
    .join("\n");
  assert.match(inspection, /View: detail/);
  assert.match(inspection, /Ref: assignment:existing/);
});

test("native error results with empty details never look like successful saved assignments", () => {
  const result = { content: [{ type: "text", text: "Operation aborted" }], details: {} };
  const rendered = renderRoutingResult(result, {}, "freeflow_delegate", {
    args: { operation: "assign" },
    isError: true,
  })
    .render(60)
    .join("\n");
  assert.match(rendered, /Operation aborted/);
  assert.doesNotMatch(rendered, /Assignment saved/);
});
