import { fail } from "./model.mjs";
import { CHECKPOINT_RESULTS, CHECKPOINT_TYPES, DECISION_OPERATIONS, UPDATE_INPUT_KEYS } from "./contract.mjs";

const COMMON = `All existing-record mutations require --expected-sha from a confirmed view or prior confirmed result.
Semantic JSON is supplied with --input <json-file|->. Unknown fields and incompatible types fail before persistence.`;

const SCHEMAS = {
  init: {
    purpose: "Create a new ignored schema-v2 Working Record.",
    input: `{
  "taskName": "...",
  "goal": "...",
  "whatDefinesTask": "...",
  "settled": "...",
  "tentative": "...",
  "open": "...",
  "currentDirection": "...",
  "boundaries": "...",
  "route": "...",
  "nextAction": "...",
  "blockers": ["..."],
  "upcomingCheckpoints": ["..."]
}`,
    rules: [
      "The CLI supplies --root and --name; JSON supplies optional task context.",
      "Context fields are scalar strings; blockers and upcomingCheckpoints are arrays of strings.",
      "Use the dedicated start path for an explicitly authorized Current Slice.",
    ],
  },
  update: {
    purpose: "Apply one precise current-state or entity mutation without starting or settling a slice.",
    examples: [
      {
        title: "Precise field edit",
        input: `{
  "edits": [
    {
      "target": "currentContext.currentDirection",
      "replaceText": { "old": "old text", "new": "new text" }
    }
  ]
}`,
      },
      {
        title: "Add proposal",
        input: `{
  "edits": [
    {
      "target": { "kind": "proposals" },
      "addEntity": {
        "title": "Implement the bounded result",
        "type": "Delivery",
        "intendedResult": "The accepted result",
        "expectedEvidence": "Focused verification"
      }
    }
  ]
}`,
      },
      {
        title: "Add decision",
        input: `{
  "edits": [
    {
      "target": { "kind": "decisions" },
      "addEntity": {
        "title": "Keep one coherent slice",
        "decision": "Keep related verification inside the same result",
        "establishedBy": "User discussion"
      }
    }
  ]
}`,
      },
      {
        title: "Select pending checkpoint",
        input: `{
  "currentSlice": {
    "selectedCheckpoints": ["Focused review"]
  },
  "upcomingCheckpoints": [
    "Focused review — selected by User discussion — review before continuation"
  ]
}`,
      },
      {
        title: "Resolve pending checkpoint — Add checkpoint History",
        input: `{
  "edits": [
    {
      "target": { "kind": "checkpoints" },
      "addEntity": {
        "title": "Focused review",
        "type": "Independent review",
        "selectedBy": "User explicitly selected the review",
        "condition": "Review before continuation",
        "result": "Completed",
        "judgment": "Pass",
        "evidence": "Focused regression suite",
        "effect": "Continuation is allowed"
      }
    },
    {
      "target": "currentWork.upcomingCheckpoints",
      "set": []
    }
  ]
}`,
      },
      {
        title: "Add Note",
        input: `{
  "edits": [
    {
      "target": { "kind": "notes" },
      "addEntity": {
        "title": "Retained context",
        "source": "User instruction",
        "body": "Context worth preserving without active task effect."
      }
    }
  ]
}`,
      },
      {
        title: "Reorder proposal",
        input: `{
  "edits": [
    {
      "target": { "kind": "proposal", "title": "First proposal" },
      "moveAfter": "Second proposal"
    }
  ]
}`,
      },
      {
        title: "Supersede decision",
        input: `{ "decision": { "operation": "supersede", "id": "D-001", "supersededBy": "D-002" } }`,
      },
    ],
    rules: [
      "Choose one example form; do not combine edits with direct semantic fields.",
      "Use one edit per affected field or entity; unspecified values are preserved.",
      "For a direct context field target use a scalar set value or replaceText {old, new}; context fields are scalar strings.",
      "For an entity target use {field: {old, new}}; list add/remove operations apply only to editable list fields.",
      "replaceText accepts one exact semantic match after line-ending normalization; ambiguous or missing matches fail.",
      `Decision operations are limited to: ${[...DECISION_OPERATIONS].join(", ")}. Decision state and supersession links are controlled by the atomic decision operation, not precise field edits.`,
      `Checkpoint types: ${[...CHECKPOINT_TYPES].join(", ")}. Terminal results: ${[...CHECKPOINT_RESULTS].join(", ")}.`,
      "Use the exact same title in selectedCheckpoints and checkpoint History so settlement can reconcile the boundary.",
      "Selecting a checkpoint preserves its source and condition in upcomingCheckpoints; resolving it adds terminal History and removes its upcoming entry atomically.",
      "Titles are non-empty single-line strings; checkpoint history requires type, selectedBy, condition, and result.",
      `Accepted top-level update fields: ${[...UPDATE_INPUT_KEYS].join(", ")}.`,
      "Whole-object or whole-collection replacement is not accepted; use explicit edits with a target and operation.",
      "Batch related edits in one command for one atomic write.",
    ],
  },
  start: {
    purpose: "Move one authorized proposal or direct result into Current Work.",
    input:
      '{ "proposalTitle": "...", "authoritySource": "...", "reasonAndScope": "...", "expectedEvidence": "...", "stopCondition": "..." }',
    rules: ["The script assigns the S-NNN ID; the caller cannot supply one.", "There may be only one Current Slice."],
  },
  block: {
    purpose: "Move the current In progress slice to Blocked.",
    input:
      '{ "sliceId": "S-NNN", "blocker": { "blocker": "...", "why": "...", "required": "..." }, "resumeWhen": "..." }',
    rules: ["Record why continuation is unsafe and what resolution is required."],
  },
  resume: {
    purpose: "Return the same currently Blocked slice to In progress.",
    input: '{ "sliceId": "S-NNN", "resolutionSource": "..." }',
    rules: ["Use reopen for historical slices."],
  },
  reopen: {
    purpose: "Return a historical outcome to Current Work with the same ID.",
    input:
      '{ "sliceId": "S-NNN", "authoritySource": "...", "reopenReason": "...", "reasonAndScope": "...", "expectedEvidence": "...", "stopCondition": "..." }',
    rules: ["Fresh active declarations are required; a full historical snapshot is never restored."],
  },
  close: {
    purpose: "Compact and settle the current slice.",
    input:
      '{ "sliceId": "S-NNN", "finalState": "Completed", "outcome": "...", "evidence": ["..."], "reviewSummary": "...", "taskEffect": "..." }',
    rules: [
      "finalState must be Completed, Blocked, or Abandoned; Completed requires settled evidence, resolved checkpoints, and no pending boundaries.",
      "Blocked requires deliberate park authority.",
      "Abandoned requires authority, reason, residual effects, and evidence.",
    ],
  },
  unlock: {
    purpose: "Remove one explicitly identified stale mutation lock without touching the record.",
    input:
      '{ "scope": "record", "authoritySource": "...", "lockPid": 999999, "lockCreatedAt": "2000-01-01T00:00:00.000Z" }',
    rules: [
      "The lock must be older than the stale threshold and owned by a dead process.",
      "scope is record by default or init for the repository init lock.",
      "The supplied PID, creation timestamp, and owner path must match the current lock exactly.",
      "Live or changed locks are never removed.",
    ],
  },
  migrate: {
    purpose: "Convert explicitly selected legacy or unsupported content to schema-v2 without semantic compression.",
    input: `{
  "authoritySource": "...",
  "reason": "...",
  "candidateText": "<complete schema-v2 record Markdown>",
  "coverage": [
    {
      "unitId": "U-001",
      "startByte": 0,
      "endByte": 42,
      "sourceSha256": "<exact source-unit hash>",
      "kind": "content|blank",
      "line": 1,
      "disposition": "verbatim|represented|projection-only|formatting-normalized",
      "targetPaths": ["currentContext.goal"]
    }
  ]
}`,
    rules: [
      "Start with inspect and copy each sourceUnits unitId, byte boundary, hash, and kind into coverage.",
      "Every exact source unit must appear once with matching boundaries, hash, and kind.",
      "verbatim requires one exact, unconsumed candidate source unit; every other disposition requires existing targetPaths.",
      "projection-only targets must belong to currentContext or currentWork.",
      "Summarization, consolidation, and removal are rejected; use compress for semantic compaction.",
      "Existing task and slice identities, state, and type cannot change during migration.",
    ],
  },
  compress: {
    purpose: "Compact an explicitly scoped schema-v2 representation with recoverable source evidence.",
    input: `{
  "authoritySource": "...",
  "reason": "...",
  "preservation": "<semantic preservation declaration>",
  "scope": ["history.slices"],
  "candidateText": "<complete schema-v2 record Markdown>"
}`,
    rules: [
      "The candidate may change only paths inside scope.",
      "Task state, IDs and ordering, Current Slice ownership and lifecycle, authority, blockers, pending boundaries, decision links, and strongest evidence are protected.",
      "The source snapshot and operation manifest are created only on apply, never on dry run.",
    ],
  },
};

function renderSchema(command) {
  const names = command === "all" ? Object.keys(SCHEMAS) : [command];
  for (const name of names)
    if (!SCHEMAS[name]) fail("invalid-schema-command", `No input schema exists for command: ${name}`);
  return [
    "# Track Work command schema",
    "",
    `Command: ${command}`,
    "",
    COMMON,
    "",
    ...names.flatMap((name) => {
      const schema = SCHEMAS[name];
      const examples = schema.examples ?? [{ title: "Input", input: schema.input }];
      return [
        `## ${name}`,
        schema.purpose,
        "",
        ...examples.flatMap(({ title, input }) =>
          [title ? `### ${title}` : null, title ? "" : null, "```json", input, "```", ""].filter(Boolean),
        ),
        "Rules:",
        ...schema.rules.map((rule) => `- ${rule}`),
        "",
      ];
    }),
  ].join("\n");
}

export function renderCommandSchema(command = "all") {
  return renderSchema(command);
}
