import assert from "node:assert/strict";
import test from "node:test";

import {
  DELEGATION_MODEL_VISIBLE_OUTPUT_FORMATS,
  DELEGATION_RESULT_VIEWS,
  isFullOrRawDelegationResultView,
  normalizeDelegationResultViewRequest,
  normalizeModelVisibleOutputFormat,
} from "../dist/index.js";

test("result view contract covers V1 views and defaults to compact model-visible output", () => {
  assert.deepEqual(DELEGATION_RESULT_VIEWS, [
    "alert",
    "summary",
    "default",
    "findings",
    "checks",
    "files",
    "evidence",
    "risks",
    "diff",
    "full",
    "raw",
  ]);
  assert.deepEqual(DELEGATION_MODEL_VISIBLE_OUTPUT_FORMATS, ["compact_text", "markdown", "pipe_rows"]);

  const request = normalizeDelegationResultViewRequest({ taskId: "TASK-RESULT", agentId: "worker-1" });

  assert.equal(request.view, "default");
  assert.equal(request.outputFormat, "compact_text");
  assert.equal(isFullOrRawDelegationResultView(request.view), false);
  assert.equal(isFullOrRawDelegationResultView("full"), true);
  assert.equal(isFullOrRawDelegationResultView("raw"), true);
});

test("result view contract requires explicit full/raw and validates maxBytes", () => {
  assert.equal(
    normalizeDelegationResultViewRequest({ taskId: "TASK-RESULT", agentId: "worker-1", view: "raw" }).view,
    "raw",
  );
  assert.equal(normalizeModelVisibleOutputFormat(undefined), "compact_text");
  assert.equal(normalizeModelVisibleOutputFormat("pipe_rows"), "pipe_rows");
  assert.throws(
    () => normalizeDelegationResultViewRequest({ taskId: "TASK-RESULT", agentId: "worker-1", maxBytes: 0 }),
    /maxBytes/,
  );
  assert.throws(() => normalizeModelVisibleOutputFormat("json"), /output format/);
});
