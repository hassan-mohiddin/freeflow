---
name: "context-virtualization"
description: "Use after broad or noisy tool evidence has been safely narrowed or exhausted, or when an activity boundary leaves raw results that no longer need to remain active."
---

# Context Virtualization

Keep the active tool-evidence working set focused without removing evidence current work still needs. Context Virtualization changes future model projection, not canonical session history.

This skill begins after a tool result has been consumed. It owns that result's continued residency, not tool selection, task state, authority, or source truth.

Each resolvable tool result receives a current-session `ctx:<entryId>` reference and begins **Full**.

## Protect Current Work

Keep a result Full while its raw text, images, structure, wording, or exact evidence may still support the current activity, its self-review, or its expected continuation.

Keep governing instructions, active skill bodies, current authority and task memory, active accepted artifacts, unresolved evidence, and current verification evidence Full while they govern work.

Archive only after positively establishing that the raw result is exhausted or has been adequately replaced. Size, age, tool name, consumption, or summarization alone does not establish that. When uncertain, keep it Full.

## Narrow Broad Exploration

Treat broad discovery output as a temporary search surface:

1. use it to locate relevant sources or evidence;
2. inspect the focused source;
3. confirm the focused evidence is sufficient for current work;
4. archive the broad result.

When the focused result now carries everything required, archive the broad result without retained meaning. When paths, queries, URLs, candidates, provenance, or unresolved findings still matter, preserve them as retained meaning.

Do not archive a broad result while exact evidence remains trapped inside it. Materialize or inspect that evidence first.

```text
broad repository search
-> focused file or symbol read
-> focused evidence remains Full
-> broad search result becomes Reference-only
```

## Clean At Meaningful Boundaries

Reconsider visible results when:

- an exploratory activity finishes;
- verification and self-review settle an evidence boundary;
- the route changes;
- one task ends and another begins;
- work resumes and the active working set is reconciled.

Start with likely pollutants: broad searches, repository inventories, verbose MCP or web output, logs, repeated diagnostics, and superseded exploratory paths. Then consider stale reads, mutation receipts, and superseded checks.

Tool type and output size determine inspection priority, not the final decision. A shell result may be exact verification evidence; a file read may be disposable exploration.

Review completed work once and batch related transitions when practical. Do not manage every result merely because it exists, wait for token pressure, or archive to satisfy a quota.

## Choose The Required Fidelity

Decide in this order:

1. **Full:** current work may still need the raw result.
2. **Retained:** raw content is exhausted, but transformed conclusions, identifiers, constraints, provenance, or unresolved failures still matter.
3. **Reference-only:** neither raw content nor its meaning needs to remain active.

Full wins whenever more than one state appears plausible.

Retained meaning is working memory, not verbatim evidence. Preserve enough for later work without copying the raw result. Include the relevant command, query, source, filters, paths, line numbers, URLs, failure states, provenance, uncertainty, contradictions, or next step when they matter. If exact content or quotation may still matter, keep the result Full.

## Apply Transitions

Archive reference-only:

```text
freeflow_context({ operation: "archive", targets: [{ ref: "ctx:<entryId>" }] })
```

Archive with retained meaning:

```text
freeflow_context({
  operation: "archive",
  targets: [{ ref: "ctx:<entryId>", retained: "<necessary transformed meaning>" }],
})
```

Archive only references present in the current model-visible request; never guess or fabricate one.

For every non-`ok` transition:

- read its status, reason, message, and changed references; treat only references reported as changed as applied;
- when the failure is safely caller-correctable, rebuild the request from currently eligible references, correct or remove invalid items, recompute affected retained meaning, and retry once;
- for unavailable, unstructured, persistence-uncertain, or repeated failures, do not loop; re-observe state when the outcome may be uncertain, otherwise report the failure and stop.

## Recover Exact Evidence

Use `restore` when an archived result must rejoin ongoing work and its marker remains visible:

```text
freeflow_context({ operation: "restore", refs: ["ctx:<entryId>"] })
```

Restore reverses projection; it does not retrieve content removed by compaction. When Conversation History is available, use its search and retrieve guidance for hidden historical sources. Never reconstruct exact evidence from retained meaning.
