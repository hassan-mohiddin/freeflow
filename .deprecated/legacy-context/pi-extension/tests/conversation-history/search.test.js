import assert from "node:assert/strict";
import test from "node:test";

import { searchConversationEntries } from "../../dist/conversation-history/search.js";

function entry(ref, text, kind = "toolResult", position = 0) {
  return {
    ref,
    kind,
    text,
    timestamp: `2026-08-23T00:00:0${position}Z`,
    position,
  };
}

test("Conversation History ranks distinct entries by their strongest matching passage", () => {
  const noisy = entry(
    "ctx:noisy",
    `${"authentication succeeded\n".repeat(180)}\nThe database eventually reported a timeout after unrelated output.`,
    "toolResult",
    1,
  );
  const exact = entry(
    "ctx:exact",
    "The authentication request failed because the database timeout expired.",
    "assistant",
    2,
  );

  const result = searchConversationEntries([noisy, exact], { query: "database timeout", limit: 1 });

  assert.equal(result.returned, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.hits[0].ref, "ctx:exact");
  assert.equal(result.hits[0].match.type, "exact-phrase");
  assert.match(result.hits[0].snippet, /database timeout/i);
});

test("Conversation History uses the complete filtered corpus for BM25 statistics", () => {
  const candidate = (length, counts) => {
    const values = [];
    for (const [term, count] of Object.entries(counts)) {
      for (let index = 0; index < count; index += 1) values.push(term, "separator");
    }
    while (values.length < length) values.push("filler");
    return values.slice(0, length).join(" ");
  };
  const entries = [
    entry("ctx:alpha-heavy", candidate(115, { alpha: 5, beta: 7, gamma: 1 }), "assistant", 1),
    entry("ctx:alpha-gamma", candidate(99, { alpha: 3, gamma: 3 }), "assistant", 2),
    entry("ctx:gamma-heavy", candidate(163, { gamma: 8 }), "assistant", 3),
    entry("ctx:beta-only", candidate(134, { beta: 5 }), "assistant", 4),
    entry("ctx:balanced", candidate(205, { alpha: 7, beta: 3, gamma: 4 }), "assistant", 5),
    ...Array.from({ length: 60 }, (_, index) =>
      entry(`ctx:unrelated-${index}`, "filler ".repeat(200), "user", 10 + index),
    ),
  ];

  const result = searchConversationEntries(entries, { query: "alpha beta gamma", limit: 5 });

  assert.deepEqual(
    result.hits.map((hit) => hit.ref),
    ["ctx:balanced", "ctx:alpha-heavy", "ctx:alpha-gamma", "ctx:beta-only", "ctx:gamma-heavy"],
  );
});

test("Conversation History applies kind/tool filters and reports partial lexical matches", () => {
  const result = searchConversationEntries(
    [
      entry("ctx:read", "The database timeout appeared in the read output.", "toolResult", 1),
      { ...entry("ctx:bash", "The database error appeared in bash output.", "toolResult", 2), toolNames: ["bash"] },
      entry("ctx:assistant", "The database was discussed.", "assistant", 3),
    ],
    { query: "database timeout", kinds: ["toolResult"], toolNames: ["bash"], limit: 8 },
  );

  assert.deepEqual(
    result.hits.map((hit) => hit.ref),
    ["ctx:bash"],
  );
  assert.equal(result.hits[0].match.type, "partial-terms");
  assert.deepEqual(result.hits[0].match.matchedTerms, ["database"]);
});

test("Conversation History returns one hit per entry and reports lexical zero matches", () => {
  const result = searchConversationEntries(
    [
      entry("ctx:first", "The build completed.", "toolResult", 1),
      entry("ctx:second", "The tests passed.", "assistant", 2),
    ],
    { query: "unrelated phrase", limit: 8 },
  );

  assert.deepEqual(result.hits, []);
  assert.equal(result.returned, 0);
  assert.equal(result.truncated, false);
});
