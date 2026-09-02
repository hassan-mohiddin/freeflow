import assert from "node:assert/strict";
import test from "node:test";

import { archiveContent, fullContent, projectToolResultMessage } from "../../dist/context-virtualization/projector.js";
import { CONTEXT_REF_PREFIX, contextRefForEntry } from "../../dist/freeflow-context/types.js";
import { replayProjectionEntries } from "../../dist/context-virtualization/state.js";

const source = {
  sessionId: "session-1",
  entryId: "abcd1234",
  toolCallId: "call-1",
  toolName: "read",
};

const message = {
  role: "toolResult",
  toolCallId: "call-1",
  toolName: "read",
  content: [
    { type: "text", text: "line one" },
    { type: "image", data: "encoded", mimeType: "image/png" },
  ],
  isError: false,
  timestamp: 1,
};

test("full projection preserves the tool result and adds one projection-only reference", () => {
  const original = structuredClone(message);
  const projected = projectToolResultMessage(message, source, { mode: "full" });

  assert.deepEqual(message, original);
  assert.equal(projected.role, "toolResult");
  assert.equal(projected.toolCallId, message.toolCallId);
  assert.deepEqual(projected.content.slice(0, -1), message.content);
  assert.deepEqual(projected.content.at(-1), {
    type: "text",
    text: `[context-ref: ${CONTEXT_REF_PREFIX}abcd1234]`,
  });
});

test("archive projection removes raw blocks and retains optional model-authored meaning", () => {
  const projected = projectToolResultMessage(message, source, {
    mode: "archived",
    retained: "The file contains the failing authentication path.",
  });

  assert.deepEqual(projected.content, [
    {
      type: "text",
      text: archiveContent(source, "The file contains the failing authentication path."),
    },
  ]);
  assert.equal(projected.toolName, "read");
  assert.equal(projected.isError, false);
});

test("projection helpers produce stable current-session references", () => {
  assert.equal(contextRefForEntry(source.entryId), "ctx:abcd1234");
  assert.equal(fullContent(source).at(-1).text, "[context-ref: ctx:abcd1234]");
});

test("projection journal replay applies resets and latest branch-local changes", () => {
  const state = replayProjectionEntries(
    [
      {
        type: "custom",
        customType: "freeflow-context-projection",
        data: {
          version: 1,
          actor: "model",
          changes: [
            {
              source,
              projection: { mode: "archived", retained: "first" },
            },
          ],
        },
      },
      {
        type: "custom",
        customType: "freeflow-context-projection",
        data: {
          version: 1,
          actor: "user",
          reset: "all",
        },
      },
      {
        type: "custom",
        customType: "freeflow-context-projection",
        data: {
          version: 1,
          actor: "model",
          changes: [
            {
              source,
              projection: { mode: "archived" },
            },
          ],
        },
      },
    ],
    source.sessionId,
  );

  assert.deepEqual(state.get(source.entryId), {
    mode: "archived",
    source,
  });
});
