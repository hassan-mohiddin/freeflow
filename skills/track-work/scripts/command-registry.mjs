import {
  CHECKPOINT_STATES,
  CHECKPOINT_TYPES,
  CLAIM_RESULT_STATES,
  CHECK_RESULT_STATES,
  ENTITY_PREFIXES,
  SLICE_TYPES,
  TASK_STATES,
} from "./model.mjs";

const PREFIXES_BY_KIND = Object.fromEntries(Object.entries(ENTITY_PREFIXES).map(([kind, prefix]) => [kind, prefix]));
const ENTITY_ID_PATTERN = /^[A-Z]+-\d{3,}$/;
const TERMINAL_CHECKPOINT_STATES = [...CHECKPOINT_STATES].filter((state) => state !== "upcoming");
const CORRECTABLE_KINDS = ["slice", "checkpoint", "decision"];
const REJECTED_ALIASES = new Set(["start.proposal", "proposalTitle", "proposal", "authority", "result", "name"]);

function stringField(options = {}) {
  return { type: "string", ...options };
}

function idField(kind, options = {}) {
  return { type: "id", kind, ...options };
}

function listField(items, options = {}) {
  return { type: "list", items, ...options };
}

function referenceField(kinds = null) {
  return { type: "reference", ...(kinds ? { kinds } : {}) };
}

const COMMON_TEXT = {
  authoritySource: stringField({ required: true, nonEmpty: true }),
  reason: stringField({ required: true, nonEmpty: true }),
};

const COMMAND_DEFINITIONS = [
  {
    name: "init",
    operation: "record.init",
    purpose: "Create one minimal schema-v3 Working Record through the dedicated initialization boundary.",
    specialBoundary: "initialization",
    fields: {
      name: stringField({ nonEmpty: true, singleLine: true }),
      state: { type: "enum", values: [...TASK_STATES] },
      stateSource: stringField({ required: true, nonEmpty: true, singleLine: true }),
      goal: stringField({ required: true, nonEmpty: true }),
      sourceRefs: listField(stringField({ nonEmpty: true, singleLine: true })),
      direction: stringField({ required: true, nonEmpty: true }),
      nextAction: stringField({ required: true, nonEmpty: true }),
    },
    examples: [
      {
        title: "Create minimal task memory",
        input: {
          name: "Track the bounded task",
          stateSource: "User instruction",
          goal: "Preserve the task across context loss",
          direction: "Maintain one canonical Markdown record",
          nextAction: "Confirm the initialized record",
        },
      },
    ],
    rules: [
      "Initialization creates one canonical record and is not an existing-record mutation.",
      "Decisions, Proposals, Checkpoints, Notes, and a Current Slice use their dedicated operations after initialization.",
    ],
  },
  {
    name: "update",
    operation: "record.update",
    purpose: "Apply one precise current-state or Note maintenance operation without bypassing lifecycle ownership.",
    fields: {
      target: { type: "enum", values: ["context", "current", "statement", "boundary", "note"], required: true },
      action: { type: "enum", values: ["set", "add", "remove", "move"], required: true },
      id: { type: "entity-id" },
      field: {
        type: "enum",
        values: [
          "goal",
          "direction",
          "sourceRefs",
          "routeOwner",
          "routeReason",
          "nextAction",
          "text",
          "basisRefs",
          "title",
          "source",
          "body",
        ],
      },
      group: { type: "enum", values: ["settled", "tentative", "open"] },
      value: stringField(),
      values: listField(stringField({ nonEmpty: true, singleLine: true })),
      basisRefs: listField(stringField({ nonEmpty: true, singleLine: true })),
      title: stringField({ singleLine: true }),
      source: stringField(),
      body: stringField(),
      beforeId: idField("context"),
      afterId: idField("context"),
    },
    examples: [
      {
        title: "Set one context field",
        input: { target: "context", action: "set", field: "goal", value: "Preserve the current task meaning" },
      },
      {
        title: "Add one context statement",
        input: {
          target: "statement",
          action: "add",
          group: "settled",
          value: "The selected direction remains supported",
        },
      },
      {
        title: "Add an inert Note",
        input: {
          target: "note",
          action: "add",
          title: "Retained context",
          source: "User instruction",
          body: "This Note has no active task effect.",
        },
      },
    ],
    rules: [
      "Update targets one declared current-state or Note field; it cannot replace the record or perform a Slice transition.",
      "Statement and boundary IDs are script-owned and remain stable across edits, moves, and removal.",
      "Notes may be added or edited but cannot be deleted through update.",
    ],
    conditional: "record-update",
  },
  {
    name: "task.set-state",
    operation: "task.setState",
    purpose: "Apply one explicit user-authorized task-state change.",
    fields: {
      state: { type: "enum", values: [...TASK_STATES], required: true },
      authoritySource: stringField({ required: true, nonEmpty: true, singleLine: true }),
    },
    examples: [{ title: "Pause the task", input: { state: "paused", authoritySource: "User instruction" } }],
    rules: ["Task state is user-owned; terminal states require no Current Slice."],
    conditional: "task-state",
  },
  {
    name: "decision.add",
    operation: "decision.add",
    purpose: "Add one active Decision with its rationale and source.",
    fields: {
      title: stringField({ required: true, nonEmpty: true, singleLine: true }),
      decision: stringField({ required: true, nonEmpty: true }),
      establishedBy: stringField({ required: true, nonEmpty: true }),
      rationale: stringField({ required: true, nonEmpty: true }),
      sourceRefs: listField(stringField({ nonEmpty: true, singleLine: true })),
      consequences: stringField({ required: true, nonEmpty: true }),
      revisitWhen: stringField({ required: true, nonEmpty: true }),
    },
    examples: [
      {
        title: "Record one Decision",
        input: {
          title: "Keep Markdown canonical",
          decision: "record.md remains canonical",
          establishedBy: "User instruction",
          rationale: "Readable recovery needs one source",
          consequences: "JSON remains transport only",
          revisitWhen: "The storage direction changes",
        },
      },
    ],
    rules: ["The script assigns the D-NNN ID; adding a Decision does not authorize implementation."],
  },
  {
    name: "decision.update",
    operation: "decision.update",
    purpose: "Update one active Decision field without changing its lifecycle state.",
    fields: {
      decisionId: idField("decision", { required: true }),
      title: stringField({ nonEmpty: true, singleLine: true }),
      decision: stringField({ nonEmpty: true }),
      establishedBy: stringField({ nonEmpty: true }),
      rationale: stringField({ nonEmpty: true }),
      sourceRefs: listField(stringField({ nonEmpty: true, singleLine: true })),
      consequences: stringField({ nonEmpty: true }),
      revisitWhen: stringField({ nonEmpty: true }),
    },
    examples: [
      {
        title: "Revise one active Decision",
        input: { decisionId: "D-001", rationale: "The source remains required for recovery" },
      },
    ],
    rules: ["Only active Decisions can be updated; retirement and supersession use dedicated operations."],
    conditional: "decision-update",
  },
  {
    name: "decision.retire",
    operation: "decision.retire",
    purpose: "Retire one active Decision while retaining explicit authority, reason, and time.",
    fields: {
      decisionId: idField("decision", { required: true }),
      authoritySource: stringField({ required: true, nonEmpty: true }),
      reason: stringField({ required: true, nonEmpty: true }),
    },
    examples: [
      {
        title: "Retire a Decision",
        input: {
          decisionId: "D-001",
          authoritySource: "User instruction",
          reason: "The Decision no longer governs current work",
        },
      },
    ],
    rules: ["Retirement preserves the Decision content and writes a durable retirement record."],
  },
  {
    name: "decision.supersede",
    operation: "decision.supersede",
    purpose: "Supersede one active Decision with another active Decision using reciprocal links.",
    fields: {
      decisionId: idField("decision", { required: true }),
      supersededById: idField("decision", { required: true }),
    },
    examples: [{ title: "Supersede one Decision", input: { decisionId: "D-001", supersededById: "D-002" } }],
    rules: ["Both Decisions remain readable; the links are reciprocal and one-to-one."],
  },
  {
    name: "migrate",
    operation: "migration.copy",
    purpose: "Run the explicitly bounded copy-only migration boundary.",
    specialBoundary: "migration",
    fields: {
      sourcePath: stringField({ required: true, nonEmpty: true, singleLine: true }),
      destinationPath: stringField({ required: true, nonEmpty: true, singleLine: true }),
      sourceSha256: stringField({ required: true, nonEmpty: true, singleLine: true }),
      authoritySource: stringField({ required: true, nonEmpty: true }),
    },
    examples: [
      {
        title: "Plan a source migration copy",
        input: {
          sourcePath: "fixtures/source.md",
          destinationPath: "copies/record.md",
          sourceSha256: "0000000000000000000000000000000000000000000000000000000000000000",
          authoritySource: "User instruction",
        },
      },
    ],
    rules: ["Migration is copy-only, exact-source, snapshot-backed, and never an ordinary record mutation."],
  },
  {
    name: "compress",
    operation: "compression.run",
    purpose: "Run the explicitly bounded maintenance-only compression boundary.",
    specialBoundary: "compression",
    fields: {
      scope: { type: "enum", values: ["canonical-markdown"], required: true },
      sourceSha256: stringField({ required: true, nonEmpty: true, singleLine: true }),
      authoritySource: stringField({ required: true, nonEmpty: true }),
    },
    examples: [
      {
        title: "Plan a bounded compression",
        input: {
          scope: "canonical-markdown",
          sourceSha256: "0000000000000000000000000000000000000000000000000000000000000000",
          authoritySource: "User instruction",
        },
      },
    ],
    rules: ["Compression is maintenance-only and must preserve semantic equality plus exact rollback evidence."],
  },
  {
    name: "propose",
    operation: "proposal.add",
    purpose: "Add one unselected future outcome to the ordered Proposal queue.",
    fields: {
      title: stringField({ required: true, nonEmpty: true, singleLine: true }),
      type: { type: "enum", values: [...SLICE_TYPES], required: true },
      intendedResult: stringField({ required: true, nonEmpty: true }),
      expectedEvidence: stringField({ required: true, nonEmpty: true }),
      dependencies: listField(stringField({ nonEmpty: true, singleLine: true })),
      selectedCheckpoints: listField(idField("checkpoint")),
    },
    examples: [
      {
        title: "Add a future result",
        input: {
          title: "Implement the bounded result",
          type: "delivery",
          intendedResult: "The accepted result is implemented",
          expectedEvidence: "Focused verification",
        },
      },
    ],
    rules: [
      "Proposal creation carries no execution authority.",
      "The script assigns the P-NNN ID and preserves queue order.",
    ],
  },
  {
    name: "proposal.update",
    operation: "proposal.update",
    fields: {
      proposalId: idField("proposal", { required: true }),
      title: stringField({ nonEmpty: true, singleLine: true }),
      type: { type: "enum", values: [...SLICE_TYPES] },
      intendedResult: stringField({ nonEmpty: true }),
      expectedEvidence: stringField({ nonEmpty: true }),
      dependencies: listField(stringField({ nonEmpty: true, singleLine: true })),
      selectedCheckpoints: listField(idField("checkpoint")),
    },
    rules: [
      "Only an unselected Proposal can be revised.",
      "At least one Proposal field besides proposalId is required.",
    ],
    conditional: "proposal-update",
    examples: [{ title: "Revise one Proposal", input: { proposalId: "P-001", title: "The revised future result" } }],
  },
  {
    name: "proposal.withdraw",
    operation: "proposal.withdraw",
    fields: {
      proposalId: idField("proposal", { required: true }),
      ...COMMON_TEXT,
    },
    examples: [
      {
        title: "Withdraw a future result",
        input: { proposalId: "P-001", authoritySource: "User instruction", reason: "The result is no longer needed" },
      },
    ],
    rules: ["Withdrawal removes only the Proposal's queue entry and preserves authority, reason, and time."],
  },
  {
    name: "proposal.move",
    operation: "proposal.move",
    fields: {
      proposalId: idField("proposal", { required: true }),
      beforeId: idField("proposal"),
      afterId: idField("proposal"),
    },
    examples: [{ title: "Move before another Proposal", input: { proposalId: "P-002", beforeId: "P-001" } }],
    rules: ["Supply exactly one of beforeId or afterId."],
    conditional: "proposal-move",
  },
  {
    name: "start",
    operation: "slice.start",
    fields: {
      proposalId: idField("proposal"),
      title: stringField({ nonEmpty: true, singleLine: true }),
      type: { type: "enum", values: [...SLICE_TYPES] },
      intendedResult: stringField({ nonEmpty: true }),
      authoritySource: stringField({ required: true, nonEmpty: true }),
      reasonAndScope: stringField({ required: true, nonEmpty: true }),
      expectedEvidence: stringField({ nonEmpty: true }),
      stopCondition: stringField({ required: true, nonEmpty: true }),
      startingState: stringField({ required: true, nonEmpty: true }),
      dependencies: listField(stringField({ nonEmpty: true, singleLine: true })),
      selectedCheckpoints: listField(idField("checkpoint")),
    },
    examples: [
      {
        title: "Start one direct authorized result",
        input: {
          title: "Implement the direct result",
          type: "delivery",
          intendedResult: "The direct result is complete",
          authoritySource: "User instruction",
          reasonAndScope: "Implement the bounded result",
          expectedEvidence: "Focused verification",
          stopCondition: "Stop after verification",
          startingState: "No implementation exists",
        },
      },
      {
        title: "Start an authorized Proposal",
        input: {
          proposalId: "P-001",
          authoritySource: "User instruction",
          reasonAndScope: "Start the selected Proposal",
          stopCondition: "Stop after the Proposal result",
          startingState: "No implementation exists",
        },
      },
    ],
    rules: [
      "Use proposalId for Proposal selection or provide the complete direct-start declaration; never mix the forms.",
      "The script assigns the S-NNN ID and preserves Proposal material fields and lineage.",
    ],
    conditional: "start",
  },
  {
    name: "extend",
    operation: "slice.addExtension",
    fields: {
      sliceId: idField("slice", { required: true }),
      ...COMMON_TEXT,
      addedScope: stringField({ required: true, nonEmpty: true }),
      addedEvidenceBoundary: stringField({ required: true, nonEmpty: true }),
      stopConditionChange: stringField({ nullable: true }),
      startingState: stringField({ required: true, nonEmpty: true }),
    },
    examples: [
      {
        title: "Accept an in-scope extension",
        input: {
          sliceId: "S-001",
          authoritySource: "User instruction",
          reason: "The same result needs one focused addition",
          addedScope: "One compatibility check",
          addedEvidenceBoundary: "The compatibility test",
          stopConditionChange: null,
          startingState: "The base result exists",
        },
      },
    ],
    rules: ["Extensions preserve the original Slice and activation boundary."],
  },
  {
    name: "block",
    operation: "slice.block",
    fields: {
      sliceId: idField("slice", { required: true }),
      whyUnsafe: stringField({ required: true, nonEmpty: true }),
      requiredResolution: stringField({ required: true, nonEmpty: true }),
      resumeWhen: stringField({ required: true, nonEmpty: true }),
    },
    examples: [
      {
        title: "Block unsafe continuation",
        input: {
          sliceId: "S-001",
          whyUnsafe: "A required decision is missing",
          requiredResolution: "User decision",
          resumeWhen: "The user decides",
        },
      },
    ],
    rules: ["Blocking keeps the Slice current and records an active Blocker."],
  },
  {
    name: "resume",
    operation: "slice.resume",
    fields: { sliceId: idField("slice", { required: true }) },
    examples: [{ title: "Resume after resolution", input: { sliceId: "S-001" } }],
    rules: ["Resume targets only the current blocked Slice after its Blockers are resolved."],
  },
  {
    name: "park",
    operation: "slice.park",
    fields: {
      sliceId: idField("slice", { required: true }),
      summary: stringField({ required: true, nonEmpty: true }),
      evidenceIds: listField(idField("evidence"), { required: true, minItems: 1 }),
      reviewSummary: stringField({ required: true, nonEmpty: true }),
      taskEffect: stringField({ required: true, nonEmpty: true }),
      blockerId: idField("blocker"),
      authoritySource: stringField({ nonEmpty: true }),
      reason: stringField({ nonEmpty: true }),
      residualEffects: stringField({ nonEmpty: true }),
    },
    examples: [
      {
        title: "Park a blocked attempt",
        input: {
          sliceId: "S-001",
          summary: "The attempt remains parked",
          evidenceIds: ["E-001"],
          reviewSummary: "No correction is needed",
          taskEffect: "The attempt remains recoverable",
          blockerId: "B-001",
        },
      },
    ],
    rules: ["Parking removes the Slice from Current Work without deleting its Blocker or Evidence."],
  },
  {
    name: "close",
    operation: "slice.close",
    fields: {
      sliceId: idField("slice", { required: true }),
      finalState: { type: "enum", values: ["completed", "abandoned"], required: true },
      summary: stringField({ required: true, nonEmpty: true }),
      evidenceIds: listField(idField("evidence"), { required: true, minItems: 1 }),
      reviewSummary: stringField({ required: true, nonEmpty: true }),
      taskEffect: stringField({ required: true, nonEmpty: true }),
      authoritySource: stringField({ nonEmpty: true }),
      reason: stringField({ nonEmpty: true }),
      residualEffects: stringField({ nonEmpty: true }),
    },
    examples: [
      {
        title: "Complete a Slice",
        input: {
          sliceId: "S-001",
          finalState: "completed",
          summary: "The intended result is settled",
          evidenceIds: ["E-001"],
          reviewSummary: "The result is recoverable",
          taskEffect: "The task may continue",
        },
      },
    ],
    rules: [
      "Completed and abandoned Slices require evidence; abandoned Slices additionally require authority, reason, and residual effects.",
    ],
    conditional: "close",
  },
  {
    name: "reopen",
    operation: "slice.reopen",
    fields: {
      sliceId: idField("slice", { required: true }),
      authoritySource: stringField({ required: true, nonEmpty: true }),
      reasonAndScope: stringField({ required: true, nonEmpty: true }),
      expectedEvidence: stringField({ required: true, nonEmpty: true }),
      stopCondition: stringField({ required: true, nonEmpty: true }),
      startingState: stringField({ required: true, nonEmpty: true }),
    },
    examples: [
      {
        title: "Reopen the same historical Slice",
        input: {
          sliceId: "S-001",
          authoritySource: "User instruction",
          reasonAndScope: "Continue the original result",
          expectedEvidence: "Continuation evidence",
          stopCondition: "Stop after continuation",
          startingState: "The settled result exists",
        },
      },
    ],
    rules: ["Reopen retains the S-NNN identity and appends a fresh activation."],
  },
  {
    name: "evidence.add",
    operation: "evidence.add",
    fields: {
      claim: stringField({ required: true, nonEmpty: true }),
      requiredBoundary: stringField({ required: true, nonEmpty: true }),
      observer: stringField({ required: true, nonEmpty: true }),
      checkResult: { type: "enum", values: [...CHECK_RESULT_STATES], required: true },
      claimResult: { type: "enum", values: [...CLAIM_RESULT_STATES], required: true },
      proves: stringField({ required: true, nonEmpty: true }),
      doesNotProve: stringField({ required: true, nonEmpty: true }),
      pointer: stringField({ required: true, nonEmpty: true }),
      supersedesId: idField("evidence"),
      appliesTo: listField(referenceField(), { required: true, minItems: 1 }),
    },
    examples: [
      {
        title: "Record one observation",
        input: {
          claim: "The lifecycle result is supported",
          requiredBoundary: "Pure lifecycle operation",
          observer: "Node test",
          checkResult: "passed",
          claimResult: "supported",
          proves: "The declared state is valid",
          doesNotProve: "Filesystem persistence",
          pointer: "output:lifecycle",
          appliesTo: [{ kind: "slice", id: "S-001" }],
        },
      },
    ],
    rules: ["Evidence is append-only; use supersedesId for a newer observation."],
  },
  {
    name: "evidence.supersede",
    operation: "evidence.supersede",
    fields: {
      supersedesId: idField("evidence", { required: true }),
      claim: stringField({ required: true, nonEmpty: true }),
      requiredBoundary: stringField({ required: true, nonEmpty: true }),
      observer: stringField({ required: true, nonEmpty: true }),
      checkResult: { type: "enum", values: [...CHECK_RESULT_STATES], required: true },
      claimResult: { type: "enum", values: [...CLAIM_RESULT_STATES], required: true },
      proves: stringField({ required: true, nonEmpty: true }),
      doesNotProve: stringField({ required: true, nonEmpty: true }),
      pointer: stringField({ required: true, nonEmpty: true }),
      appliesTo: listField(referenceField(), { required: true, minItems: 1 }),
    },
    examples: [
      {
        title: "Supersede one observation",
        input: {
          supersedesId: "E-001",
          claim: "The corrected result is supported",
          requiredBoundary: "Pure lifecycle operation",
          observer: "Second Node test",
          checkResult: "passed",
          claimResult: "supported",
          proves: "The corrected state is valid",
          doesNotProve: "Filesystem persistence",
          pointer: "output:lifecycle-correction",
          appliesTo: [{ kind: "slice", id: "S-001" }],
        },
      },
    ],
    rules: ["The prior observation remains readable and immutable."],
  },
  {
    name: "blocker.resolve",
    operation: "blocker.resolve",
    fields: {
      blockerId: idField("blocker", { required: true }),
      resolutionSource: stringField({ required: true, nonEmpty: true }),
    },
    examples: [
      {
        title: "Resolve the actual Blocker",
        input: { blockerId: "B-001", resolutionSource: "User decision in the current conversation" },
      },
    ],
    rules: ["Resolving a Blocker does not resume a Slice by itself; use resume explicitly."],
  },
  {
    name: "checkpoint.select",
    operation: "checkpoint.select",
    fields: {
      title: stringField({ required: true, nonEmpty: true, singleLine: true }),
      type: { type: "enum", values: [...CHECKPOINT_TYPES], required: true },
      selectedBy: stringField({ required: true, nonEmpty: true }),
      condition: stringField({ required: true, nonEmpty: true }),
      appliesTo: referenceField(["slice", "task"]),
    },
    examples: [
      {
        title: "Select an independent review",
        input: {
          title: "Focused lifecycle review",
          type: "independent_review",
          selectedBy: "User instruction",
          condition: "Review before continuation",
          appliesTo: { kind: "slice", id: "S-001" },
        },
      },
    ],
    rules: [
      "A Slice-level Checkpoint belongs to the Current Slice; a task-level Checkpoint may remain upcoming without one.",
    ],
  },
  {
    name: "checkpoint.resolve",
    operation: "checkpoint.resolve",
    fields: {
      checkpointId: idField("checkpoint", { required: true }),
      state: { type: "enum", values: TERMINAL_CHECKPOINT_STATES, required: true },
      judgment: stringField({ required: true, nonEmpty: true }),
      decision: stringField({ required: true, nonEmpty: true }),
      evidenceIds: listField(idField("evidence"), { required: true, minItems: 1 }),
      taskEffect: stringField({ required: true, nonEmpty: true }),
      reason: stringField({ required: true, nonEmpty: true }),
      replacedById: idField("checkpoint"),
    },
    examples: [
      {
        title: "Complete a selected Checkpoint",
        input: {
          checkpointId: "C-001",
          state: "completed",
          judgment: "Pass",
          decision: "Continue",
          evidenceIds: ["E-001"],
          taskEffect: "Continuation is allowed",
          reason: "The condition was met",
        },
      },
    ],
    rules: ["Use replacedById only when state is replaced; resolution removes only this Checkpoint's upcoming entry."],
    conditional: "checkpoint-resolve",
  },
  {
    name: "history.correct",
    operation: "history.correct",
    fields: {
      entityKind: { type: "enum", values: CORRECTABLE_KINDS, required: true },
      entityId: { type: "entity-id", required: true },
      field: stringField({ required: true, nonEmpty: true, singleLine: true }),
      before: stringField({ required: true, nonEmpty: true }),
      after: stringField({ required: true, nonEmpty: true }),
      reason: stringField({ required: true, nonEmpty: true }),
      authoritySource: stringField({ required: true, nonEmpty: true }),
      evidenceIds: listField(idField("evidence"), { required: true, minItems: 1 }),
    },
    examples: [
      {
        title: "Correct settled history explicitly",
        input: {
          entityKind: "slice",
          entityId: "S-001",
          field: "title",
          before: "Original settled title",
          after: "Corrected settled title",
          reason: "The original title was clerically wrong",
          authoritySource: "User instruction",
          evidenceIds: ["E-001"],
        },
      },
    ],
    rules: ["Corrections require a settled target, the prior and corrected values, authority, reason, and evidence."],
  },
];

const COMMANDS = new Map(COMMAND_DEFINITIONS.map((definition) => [definition.name, definition]));
export const OPERATION_INPUT_KEYS = Object.fromEntries(
  COMMAND_DEFINITIONS.map((definition) => [definition.operation, new Set(Object.keys(definition.fields))]),
);

const FIXED_COMMAND_DEFINITIONS = [
  {
    name: "view",
    operation: "public.view",
    purpose: "Render one bounded direct-Markdown Working Record view.",
    fields: {},
    rules: ["Views are read-only and emit direct Markdown rather than JSON transport."],
  },
  {
    name: "schema",
    operation: "public.schema",
    purpose: "Expose the generated public command and CLI option contract.",
    fields: {},
    rules: ["Schema output is transport metadata; record.md remains canonical Markdown state."],
  },
  {
    name: "validate",
    operation: "public.validate",
    purpose: "Validate one existing schema-v3 Working Record without mutation.",
    fields: {},
    rules: ["Validation is read-only and does not establish semantic authority or completion."],
  },
  {
    name: "inspect",
    operation: "public.inspect",
    purpose: "Inspect one record's representation, recovery, lock, and size facts.",
    fields: {},
    rules: ["Inspection is read-only and reports facts at its local filesystem boundary."],
  },
  {
    name: "reconcile",
    operation: "public.reconcile",
    purpose: "Reconcile one publication recovery marker after fresh inspection.",
    fields: {},
    rules: ["Reconciliation classifies local publication state; it does not settle task meaning."],
  },
  {
    name: "unlock",
    operation: "public.unlock",
    purpose: "Recover one explicitly confirmed stale mutation lock.",
    fields: {
      token: stringField({ required: true, nonEmpty: true, singleLine: true }),
      pid: { type: "integer", required: true, minimum: 1 },
      createdAt: stringField({ required: true, nonEmpty: true, singleLine: true }),
      path: stringField({ required: true, nonEmpty: true, singleLine: true }),
    },
    examples: [
      {
        title: "Recover one exact stale lock",
        input: {
          token: "stale-token",
          pid: 12345,
          createdAt: "2026-09-01T00:00:00.000Z",
          path: "/workspace/.freeflow/tasks/task-001-record/record.md",
        },
      },
    ],
    rules: ["Unlock requires exact inspected lock selectors and never confirms record content."],
  },
];

const PUBLIC_COMMANDS = new Map([
  ...COMMANDS.entries(),
  ...FIXED_COMMAND_DEFINITIONS.map((definition) => [definition.name, definition]),
]);

const CLI_OPTION_DEFINITIONS = {
  root: { name: "--root", kind: "value", valueType: "path", description: "Root directory for task records." },
  name: { name: "--name", kind: "value", valueType: "short-name", description: "Short name for a new task directory." },
  record: { name: "--record", kind: "value", valueType: "record-path", description: "Existing record.md path." },
  expectedSha: {
    name: "--expected-sha",
    kind: "value",
    valueType: "sha256",
    description: "Exact SHA-256 of the confirmed existing record.",
  },
  input: {
    name: "--input",
    kind: "value",
    valueType: "json-or-stdin",
    description: "JSON transport input or - for stdin.",
  },
  dryRun: { name: "--dry-run", kind: "flag", description: "Validate without durable publication." },
  help: { name: "--help", kind: "flag", description: "Show command help." },
  command: {
    name: "--command",
    kind: "value",
    valueType: "command-name",
    description: "Command whose generated schema is requested.",
  },
  view: { name: "--view", kind: "value", valueType: "view-name", description: "Purpose-owned view name." },
  entity: { name: "--entity", kind: "value", valueType: "stable-id", description: "Stable entity ID for entity view." },
  limit: { name: "--limit", kind: "value", valueType: "integer", description: "Bound for recent view results." },
};

function cliOptions(names, requiredNames = []) {
  return {
    required: requiredNames.map((name) => CLI_OPTION_DEFINITIONS[name].name),
    options: names.map((name) => ({
      ...CLI_OPTION_DEFINITIONS[name],
      required: requiredNames.includes(name),
    })),
  };
}

const CLI_OPTIONS_BY_COMMAND = new Map([
  ["init", cliOptions(["name", "root", "input", "dryRun", "help"], ["name", "input"])],
  ["migrate", cliOptions(["root", "input", "dryRun", "help"], ["input"])],
  ["compress", cliOptions(["root", "record", "input", "dryRun", "help"], ["record", "input"])],
  ["view", cliOptions(["root", "record", "view", "entity", "limit", "help"], ["record", "view"])],
  ["schema", cliOptions(["command", "help"])],
  ["validate", cliOptions(["root", "record", "help"], ["record"])],
  ["inspect", cliOptions(["root", "record", "help"], ["record"])],
  ["reconcile", cliOptions(["root", "record", "help"], ["record"])],
  ["unlock", cliOptions(["root", "record", "input", "help"], ["record", "input"])],
]);
for (const name of COMMANDS.keys())
  if (!CLI_OPTIONS_BY_COMMAND.has(name))
    CLI_OPTIONS_BY_COMMAND.set(
      name,
      cliOptions(["root", "record", "expectedSha", "input", "dryRun", "help"], ["record", "expectedSha", "input"]),
    );

export class CommandContractError extends Error {
  constructor(errors) {
    super(`Command input is invalid: ${errors.map((error) => error.message).join("; ")}`);
    this.name = "CommandContractError";
    this.code = "invalid-command-input";
    this.errors = errors;
  }
}

function add(errors, code, message, path) {
  errors.push({ code, message, ...(path ? { path } : {}) });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function descriptorSchema(descriptor) {
  if (descriptor.type === "string") {
    return {
      type: "string",
      ...(descriptor.nonEmpty ? { minLength: 1 } : {}),
      ...(descriptor.singleLine ? { pattern: "^[^\\r\\n]*$" } : {}),
      ...(descriptor.nullable ? { type: ["string", "null"] } : {}),
    };
  }
  if (descriptor.type === "enum") return { type: "string", enum: descriptor.values };
  if (descriptor.type === "id") return { type: "string", pattern: `^${PREFIXES_BY_KIND[descriptor.kind]}-\\d{3,}$` };
  if (descriptor.type === "entity-id") return { type: "string", pattern: ENTITY_ID_PATTERN.source };
  if (descriptor.type === "integer")
    return { type: "integer", ...(descriptor.minimum === undefined ? {} : { minimum: descriptor.minimum }) };
  if (descriptor.type === "reference")
    return {
      type: "object",
      additionalProperties: false,
      required: ["kind", "id"],
      properties: {
        kind: { type: "string", ...(descriptor.kinds ? { enum: descriptor.kinds } : {}) },
        id: { type: "string", pattern: ENTITY_ID_PATTERN.source },
      },
    };
  if (descriptor.type === "list")
    return {
      type: "array",
      ...(descriptor.minItems === undefined ? {} : { minItems: descriptor.minItems }),
      items: descriptorSchema(descriptor.items),
    };
  throw new Error(`Unknown command field type: ${descriptor.type}`);
}

function requiredFields(definition) {
  return Object.entries(definition.fields)
    .filter(([, descriptor]) => descriptor.required)
    .map(([name]) => name);
}

function schemaForDefinition(definition) {
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `freeflow/track-work/${definition.name}`,
    title: `Track Work ${definition.name} input`,
    description: definition.purpose,
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(definition.fields).map(([name, descriptor]) => [name, descriptorSchema(descriptor)]),
    ),
    required: requiredFields(definition),
    examples: definition.examples?.map((example) => structuredClone(example.input)) ?? [],
    "x-rules": [...(definition.rules ?? [])],
    "x-cli": cliOptionsForCommand(definition.name),
  };
  if (definition.conditional === "start") {
    schema.oneOf = [
      {
        required: ["proposalId", "authoritySource", "reasonAndScope", "stopCondition", "startingState"],
        not: {
          anyOf: ["title", "type", "intendedResult", "expectedEvidence", "dependencies", "selectedCheckpoints"].map(
            (field) => ({ required: [field] }),
          ),
        },
      },
      {
        required: [
          "title",
          "type",
          "intendedResult",
          "authoritySource",
          "reasonAndScope",
          "expectedEvidence",
          "stopCondition",
          "startingState",
        ],
        not: { required: ["proposalId"] },
      },
    ];
  }
  if (definition.conditional === "proposal-update")
    schema.anyOf = ["title", "type", "intendedResult", "expectedEvidence", "dependencies", "selectedCheckpoints"].map(
      (field) => ({ required: [field] }),
    );
  if (definition.conditional === "proposal-move")
    schema.oneOf = [
      { required: ["beforeId"], not: { required: ["afterId"] } },
      { required: ["afterId"], not: { required: ["beforeId"] } },
    ];
  if (definition.conditional === "close")
    schema.oneOf = [
      { properties: { finalState: { const: "completed" } } },
      {
        properties: { finalState: { const: "abandoned" } },
        required: ["authoritySource", "reason", "residualEffects"],
      },
    ];
  if (definition.conditional === "checkpoint-resolve")
    schema.oneOf = [
      { properties: { state: { const: "replaced" } }, required: ["replacedById"] },
      { not: { anyOf: [{ properties: { state: { const: "replaced" } } }, { required: ["replacedById"] }] } },
    ];
  if (definition.conditional) schema["x-conditional"] = definition.conditional;
  if (definition.specialBoundary) schema["x-special-boundary"] = definition.specialBoundary;
  return schema;
}

function validateDescriptor(value, descriptor, path, errors) {
  if (value === null && descriptor.nullable) return;
  if (descriptor.type === "string") {
    if (typeof value !== "string") {
      add(errors, "invalid-type", `${path} must be a string`, path);
      return;
    }
    if (descriptor.nonEmpty && !value.trim()) add(errors, "empty-field", `${path} must not be empty`, path);
    if (descriptor.singleLine && /[\r\n]/.test(value))
      add(errors, "multiline-field", `${path} must be single-line`, path);
    return;
  }
  if (descriptor.type === "enum") {
    if (typeof value !== "string" || !descriptor.values.includes(value))
      add(errors, "invalid-enum", `${path} has an unsupported value`, path);
    return;
  }
  if (descriptor.type === "id") {
    if (typeof value !== "string" || !new RegExp(`^${PREFIXES_BY_KIND[descriptor.kind]}-\\d{3,}$`).test(value))
      add(errors, "invalid-id", `${path} must use the ${descriptor.kind} ID format`, path);
    return;
  }
  if (descriptor.type === "entity-id") {
    if (typeof value !== "string" || !ENTITY_ID_PATTERN.test(value))
      add(errors, "invalid-id", `${path} must use a stable entity ID`, path);
    return;
  }
  if (descriptor.type === "integer") {
    if (!Number.isSafeInteger(value)) {
      add(errors, "invalid-type", `${path} must be an integer`, path);
      return;
    }
    if (descriptor.minimum !== undefined && value < descriptor.minimum)
      add(errors, "invalid-number", `${path} must be at least ${descriptor.minimum}`, path);
    return;
  }
  if (descriptor.type === "reference") {
    if (!isObject(value)) {
      add(errors, "invalid-reference", `${path} must be a reference object`, path);
      return;
    }
    for (const key of Object.keys(value))
      if (!new Set(["kind", "id"]).has(key))
        add(errors, "unknown-field", `Unknown field: ${path}.${key}`, `${path}.${key}`);
    if (typeof value.kind !== "string" || (descriptor.kinds && !descriptor.kinds.includes(value.kind)))
      add(errors, "invalid-reference", `${path}.kind is not supported`, `${path}.kind`);
    const prefix = PREFIXES_BY_KIND[value.kind];
    if (!prefix || typeof value.id !== "string" || !new RegExp(`^${prefix}-\\d{3,}$`).test(value.id))
      add(
        errors,
        "invalid-reference",
        `${path}.id is not valid for ${value.kind ?? "the reference kind"}`,
        `${path}.id`,
      );
    return;
  }
  if (descriptor.type === "list") {
    if (!Array.isArray(value)) {
      add(errors, "invalid-type", `${path} must be an array`, path);
      return;
    }
    if (descriptor.minItems !== undefined && value.length < descriptor.minItems)
      add(errors, "missing-field", `${path} requires at least ${descriptor.minItems} item(s)`, path);
    value.forEach((item, index) => validateDescriptor(item, descriptor.items, `${path}[${index}]`, errors));
    return;
  }
  add(errors, "invalid-schema", `Unknown descriptor type: ${descriptor.type}`, path);
}

function hasOwn(input, key) {
  return Object.hasOwn(input, key);
}

function requireUpdateField(input, key, errors) {
  if (!hasOwn(input, key)) add(errors, "missing-field", `update requires ${key}`, `update.${key}`);
}

function requireUpdateValue(input, key, errors) {
  if (typeof input[key] !== "string" || !input[key].trim())
    add(errors, "empty-field", `update.${key} requires non-empty text`, `update.${key}`);
}

function rejectUpdateFields(input, allowed, errors) {
  for (const key of Object.keys(input))
    if (!allowed.has(key)) add(errors, "unknown-field", `Unknown update field for target: ${key}`, `update.${key}`);
}

function validateUpdateId(input, field, prefix, errors) {
  if (
    hasOwn(input, field) &&
    (typeof input[field] !== "string" || !new RegExp(`^${prefix}-\\d{3,}$`).test(input[field]))
  )
    add(errors, "invalid-id", `update.${field} must use ${prefix}-NNN`, `update.${field}`);
}

function validateRecordUpdate(input, errors) {
  const target = input.target;
  const action = input.action;
  const common = new Set(["target", "action"]);
  if (!["context", "current", "statement", "boundary", "note"].includes(target)) {
    add(errors, "invalid-target", "update.target is not supported", "update.target");
    return;
  }
  if (target === "context") {
    rejectUpdateFields(input, new Set([...common, "field", "value", "values"]), errors);
    if (action !== "set") add(errors, "invalid-operation", "Context update supports only set", "update.action");
    requireUpdateField(input, "field", errors);
    if (!["goal", "direction", "sourceRefs"].includes(input.field))
      add(errors, "invalid-field", "Context update field is not supported", "update.field");
    if (input.field === "sourceRefs") {
      if (hasOwn(input, "value")) add(errors, "invalid-form", "sourceRefs uses values, not value", "update.value");
      requireUpdateField(input, "values", errors);
    } else {
      if (hasOwn(input, "values"))
        add(errors, "invalid-form", "Scalar context fields use value, not values", "update.values");
      requireUpdateValue(input, "value", errors);
    }
    return;
  }
  if (target === "current") {
    rejectUpdateFields(input, new Set([...common, "field", "value"]), errors);
    if (action !== "set") add(errors, "invalid-operation", "Current Work update supports only set", "update.action");
    requireUpdateField(input, "field", errors);
    if (!["routeOwner", "routeReason", "nextAction"].includes(input.field))
      add(errors, "invalid-field", "Current Work update field is not supported", "update.field");
    requireUpdateValue(input, "value", errors);
    return;
  }
  if (target === "statement") {
    validateUpdateId(input, "id", "CTX", errors);
    validateUpdateId(input, "beforeId", "CTX", errors);
    validateUpdateId(input, "afterId", "CTX", errors);
    if (action === "add") {
      rejectUpdateFields(input, new Set([...common, "group", "value", "basisRefs"]), errors);
      requireUpdateField(input, "group", errors);
      requireUpdateValue(input, "value", errors);
      return;
    }
    if (action === "set") {
      rejectUpdateFields(input, new Set([...common, "id", "field", "value", "values"]), errors);
      requireUpdateField(input, "id", errors);
      requireUpdateField(input, "field", errors);
      if (!["text", "basisRefs"].includes(input.field))
        add(errors, "invalid-field", "Statement update field is not supported", "update.field");
      if (input.field === "basisRefs") {
        if (hasOwn(input, "value")) add(errors, "invalid-form", "basisRefs uses values, not value", "update.value");
        requireUpdateField(input, "values", errors);
      } else requireUpdateValue(input, "value", errors);
      return;
    }
    if (action === "remove") {
      rejectUpdateFields(input, new Set([...common, "id"]), errors);
      requireUpdateField(input, "id", errors);
      return;
    }
    if (action === "move") {
      rejectUpdateFields(input, new Set([...common, "id", "group", "beforeId", "afterId"]), errors);
      requireUpdateField(input, "id", errors);
      requireUpdateField(input, "group", errors);
      if (hasOwn(input, "beforeId") && hasOwn(input, "afterId"))
        add(errors, "invalid-form", "Statement move accepts only one of beforeId or afterId", "update");
      return;
    }
    add(errors, "invalid-operation", "Statement update action is not supported", "update.action");
    return;
  }
  if (target === "boundary") {
    validateUpdateId(input, "id", "BND", errors);
    if (action === "add") {
      rejectUpdateFields(input, new Set([...common, "value"]), errors);
      requireUpdateValue(input, "value", errors);
      return;
    }
    if (action === "set") {
      rejectUpdateFields(input, new Set([...common, "id", "field", "value"]), errors);
      requireUpdateField(input, "id", errors);
      requireUpdateField(input, "field", errors);
      if (input.field !== "text") add(errors, "invalid-field", "Boundary update field must be text", "update.field");
      requireUpdateValue(input, "value", errors);
      return;
    }
    if (action === "remove") {
      rejectUpdateFields(input, new Set([...common, "id"]), errors);
      requireUpdateField(input, "id", errors);
      return;
    }
    add(errors, "invalid-operation", "Boundary update action is not supported", "update.action");
    return;
  }
  if (target === "note") {
    validateUpdateId(input, "id", "N", errors);
    if (action === "add") {
      rejectUpdateFields(input, new Set([...common, "title", "source", "body"]), errors);
      for (const field of ["title", "source", "body"]) requireUpdateValue(input, field, errors);
      return;
    }
    if (action === "set") {
      rejectUpdateFields(input, new Set([...common, "id", "field", "value"]), errors);
      requireUpdateField(input, "id", errors);
      requireUpdateField(input, "field", errors);
      if (!["title", "source", "body"].includes(input.field))
        add(errors, "invalid-field", "Note update field is not supported", "update.field");
      requireUpdateValue(input, "value", errors);
      return;
    }
    add(errors, "invalid-operation", "Notes cannot be removed or moved through update", "update.action");
  }
}

function validateConditional(definition, input, errors) {
  if (definition.conditional === "record-update") validateRecordUpdate(input, errors);
  if (definition.conditional === "decision-update") {
    if (Object.keys(input).length === 1)
      add(errors, "missing-field", "Decision update requires an editable field", "decision.update");
  }
  if (definition.name === "decision.supersede" && input.decisionId === input.supersededById)
    add(errors, "invalid-operation", "A Decision cannot supersede itself", "decision.supersede");
  if (Object.hasOwn(definition.fields, "sourceSha256") && !/^[a-f0-9]{64}$/.test(input.sourceSha256 ?? ""))
    add(errors, "invalid-sha", `${definition.name} requires a SHA-256 source value`, `${definition.name}.sourceSha256`);
  if (definition.conditional === "start") {
    const hasProposal = Object.hasOwn(input, "proposalId");
    const proposalFields = [
      "title",
      "type",
      "intendedResult",
      "expectedEvidence",
      "dependencies",
      "selectedCheckpoints",
    ];
    const directFields = ["title", "type", "intendedResult", "expectedEvidence"];
    if (hasProposal) {
      for (const field of proposalFields)
        if (Object.hasOwn(input, field))
          add(errors, "proposal-form", `${field} cannot be supplied with proposalId`, field);
      for (const field of ["authoritySource", "reasonAndScope", "stopCondition", "startingState"])
        if (!Object.hasOwn(input, field)) add(errors, "missing-field", `Proposal start requires ${field}`, field);
    } else {
      for (const field of [...directFields, "authoritySource", "reasonAndScope", "stopCondition", "startingState"])
        if (!Object.hasOwn(input, field)) add(errors, "direct-form", `Direct start requires ${field}`, field);
    }
  }
  if (definition.conditional === "proposal-update" && Object.keys(input).length === 1)
    add(errors, "missing-field", "Proposal update requires an editable field", "proposal.update");
  if (
    definition.conditional === "proposal-move" &&
    Object.hasOwn(input, "beforeId") === Object.hasOwn(input, "afterId")
  )
    add(errors, "destination", "Proposal move requires exactly one of beforeId or afterId", "proposal.move");
  if (definition.conditional === "close" && input.finalState === "abandoned")
    for (const field of ["authoritySource", "reason", "residualEffects"])
      if (!Object.hasOwn(input, field)) add(errors, "abandonment-field", `Abandoned close requires ${field}`, field);
  if (definition.conditional === "checkpoint-resolve") {
    if (input.state === "replaced" && !Object.hasOwn(input, "replacedById"))
      add(errors, "replacement-field", "Replaced checkpoint requires replacedById", "replacedById");
    if (input.state !== "replaced" && Object.hasOwn(input, "replacedById"))
      add(errors, "replacement-field", "replacedById is only valid for replaced checkpoints", "replacedById");
  }
}

export function commandNames() {
  return [...COMMANDS.keys()];
}

export function publicCommandNames() {
  return [...PUBLIC_COMMANDS.keys()];
}

export function getCommandDefinition(command) {
  const definition = COMMANDS.get(command);
  if (!definition)
    throw new CommandContractError([
      { code: "unknown-command", message: `Unknown command: ${command}`, path: "command" },
    ]);
  return structuredClone(definition);
}

export function getPublicCommandDefinition(command) {
  const definition = PUBLIC_COMMANDS.get(command);
  if (!definition)
    throw new CommandContractError([
      { code: "unknown-command", message: `Unknown public command: ${command}`, path: "command" },
    ]);
  return structuredClone(definition);
}

export function cliOptionsForCommand(command) {
  if (!CLI_OPTIONS_BY_COMMAND.has(command)) getPublicCommandDefinition(command);
  return structuredClone(CLI_OPTIONS_BY_COMMAND.get(command));
}

export function schemaForCommand(command) {
  if (command === "all")
    return Object.fromEntries(
      publicCommandNames().map((name) => [name, schemaForDefinition(PUBLIC_COMMANDS.get(name))]),
    );
  return schemaForDefinition(getPublicCommandDefinition(command));
}

export function validateCommandInput(command, input = {}) {
  const definition = COMMANDS.has(command) ? getCommandDefinition(command) : getPublicCommandDefinition(command);
  const errors = [];
  if (!isObject(input)) {
    add(errors, "invalid-type", `${command} input must be an object`, command);
    throw new CommandContractError(errors);
  }
  const fields = definition.fields;
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(fields, key)) {
      add(
        errors,
        REJECTED_ALIASES.has(key) ? "alias-rejected" : "unknown-field",
        `Unknown ${command} field: ${key}`,
        `${command}.${key}`,
      );
    }
  }
  for (const [name, descriptor] of Object.entries(fields)) {
    if (descriptor.required && !Object.hasOwn(input, name))
      add(errors, "missing-field", `${command} requires ${name}`, `${command}.${name}`);
    if (Object.hasOwn(input, name)) validateDescriptor(input[name], descriptor, `${command}.${name}`, errors);
  }
  validateConditional(definition, input, errors);
  if (errors.length) throw new CommandContractError(errors);
  return structuredClone(input);
}

export function parseCommandArgs(command, args = []) {
  getCommandDefinition(command);
  if (!Array.isArray(args))
    throw new CommandContractError([{ code: "invalid-arguments", message: "Command arguments must be an array" }]);
  let inputText = null;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      help = true;
      continue;
    }
    if (argument === "--input" || argument.startsWith("--input=")) {
      if (inputText !== null)
        throw new CommandContractError([{ code: "duplicate-option", message: "--input may be supplied once" }]);
      if (argument === "--input") {
        inputText = args[++index];
        if (inputText === undefined)
          throw new CommandContractError([{ code: "missing-option-value", message: "--input requires a value" }]);
      } else inputText = argument.slice("--input=".length);
      continue;
    }
    throw new CommandContractError([{ code: "unknown-option", message: `Unknown command option: ${argument}` }]);
  }
  if (help) return { help: true, input: {} };
  if (inputText === null || inputText === "-") return { input: {}, inputSource: inputText === "-" ? "stdin" : "none" };
  try {
    const input = JSON.parse(inputText);
    return { input };
  } catch {
    throw new CommandContractError([{ code: "invalid-input-json", message: "--input must contain valid JSON" }]);
  }
}

export function renderCommandSchema(command = "all") {
  const names = command === "all" ? publicCommandNames() : [command];
  return [
    "# Track Work command schema",
    "",
    "JSON is transport only; record.md remains canonical Markdown state.",
    "",
    ...names.flatMap((name) => {
      const definition = getPublicCommandDefinition(name);
      const schema = schemaForDefinition(definition);
      return [
        `## ${name}`,
        definition.purpose,
        "",
        "```json",
        JSON.stringify(schema, null, 2),
        "```",
        "",
        "Examples:",
        ...(definition.examples ?? []).flatMap((example) => [
          `### ${example.title}`,
          "",
          "```json",
          JSON.stringify(example.input, null, 2),
          "```",
          "",
        ]),
        "Rules:",
        ...(definition.rules ?? []).map((rule) => `- ${rule}`),
        "",
      ];
    }),
  ].join("\n");
}
