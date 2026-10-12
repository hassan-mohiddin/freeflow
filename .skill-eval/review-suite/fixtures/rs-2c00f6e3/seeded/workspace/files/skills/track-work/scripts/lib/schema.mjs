import { fail } from "./model.mjs";

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
    purpose: "Apply precise current-state edits and atomic decision changes without starting or settling a slice.",
    input: `{
  "edits": [
    {
      "target": "currentContext.currentDirection" | { "kind": "proposal|decision|slice|note", "id|title": "..." },
      "set": { "field": "value" },
      "clear": ["field"],
      "replaceText": { "old": "exact", "new": "replacement" } | { "field": { "old": "exact", "new": "replacement" } },
      "add": { "listField": ["member"] },
      "remove": { "listField": ["member"] },
      "rename": "new title",
      "moveBefore": "proposal title",
      "moveAfter": "proposal title"
    },
    {
      "target": { "kind": "proposals|decisions|notes" },
      "addEntity": { "title": "...", "type": "Delivery", "intendedResult": "...", "expectedEvidence": "..." },
      "removeEntity": { "id|title": "..." }
    }
  ]
}

or for a decision lifecycle transition:

{ "decision": { "operation": "supersede", "id": "D-NNN", "supersededBy": "D-NNN" } }`,
    rules: [
      "Use one edit per affected field or entity; unspecified values are preserved.",
      "For a direct context field target use a scalar set value or replaceText {old, new}; context fields are scalar strings.",
      "For an entity target use {field: {old, new}}; list add/remove operations apply only to editable list fields.",
      "replaceText requires one exact match; ambiguous or missing matches fail.",
      "Decision state and supersession links are controlled by the atomic decision operation, not precise field edits.",
      "Whole-object or whole-collection replacement requires an explicit set operation.",
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
      '{ "sliceId": "S-NNN", "finalState": "Completed|Blocked|Abandoned", "outcome": "...", "evidence": ["..."], "reviewSummary": "...", "taskEffect": "..." }',
    rules: [
      "Completed requires settled evidence and boundaries.",
      "Blocked requires deliberate park authority.",
      "Abandoned requires authority, reason, residual effects, and evidence.",
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
      return [
        `## ${name}`,
        schema.purpose,
        "",
        "```json",
        schema.input,
        "```",
        "",
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
