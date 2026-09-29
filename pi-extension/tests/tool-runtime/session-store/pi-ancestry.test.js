import assert from "node:assert/strict";
import test from "node:test";

import { piAncestrySnapshot } from "../../../dist/tool-runtime/session-store/pi-ancestry.js";

const toolResult = (id, occurrenceId) => ({
  id,
  type: "message",
  message: {
    role: "toolResult",
    toolName: "freeflow_read",
    details: {
      freeflowV2: { version: 1, occurrenceId, persistence: { state: "sidecar-acknowledged" } },
    },
  },
});

test("native result and minimal anchors bind exact occurrences to branch entries", () => {
  const entries = [
    { id: "entry:caller", type: "message", message: { role: "assistant" } },
    toolResult("entry:read-result", "occurrence:read"),
    {
      id: "entry:bash-anchor",
      type: "custom",
      customType: "freeflow-tool-artifact-v2",
      data: {
        version: 1,
        id: "artifact:12345678-1234-1234-1234-123456789012",
        storeId: "store:origin",
        originSessionId: "session:origin",
        occurrenceId: "occurrence:bash",
      },
    },
    {
      id: "entry:program-manifest",
      type: "custom",
      customType: "freeflow-tool-run-v1",
      data: {
        version: 1,
        sessionId: "session:origin",
        runId: "run:one",
        outcomes: [{ seq: 0, occurrenceId: "occurrence:child" }],
      },
    },
    {
      ...toolResult("entry:pending", "occurrence:pending"),
      message: {
        role: "toolResult",
        details: {
          freeflowV2: { version: 1, occurrenceId: "occurrence:pending", persistence: { state: "unavailable" } },
        },
      },
    },
  ];
  const ancestry = piAncestrySnapshot("session:fork", "entry:pending", entries);
  assert.deepEqual(ancestry.nativeOccurrences, [
    { occurrenceId: "occurrence:read", entryId: "entry:read-result" },
    { occurrenceId: "occurrence:bash", entryId: "entry:bash-anchor" },
    { occurrenceId: "occurrence:child", entryId: "entry:program-manifest" },
  ]);
  assert.deepEqual(
    ancestry.nativeEntryIds,
    entries.map((entry) => entry.id),
  );
});
