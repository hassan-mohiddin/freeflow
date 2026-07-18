# Artifact Standards

Read this when a durable spec-like artifact needs a destination, identity, status, source trail, or revision history. Follow established repository conventions before introducing these defaults.

## Choose The Destination

Place the artifact where its intended readers and authority belong.

- Use an established product, design, API, issue, migration, policy, or architecture location when one exists.
- For a task-local artifact, read [Track Work](../../track-work/SKILL.md) and use the `specs/` location it owns unless the artifact should become canonical repo documentation.
- Use the repository's issue tracker when the requested artifact is an issue and that system is available and intended.
- Ask before choosing between task-local memory and canonical repository documentation when the distinction changes authority, review, or longevity.

Do not create a new top-level docs convention for one artifact without a real need.

## Give Durable Artifacts Identity

Use the repository's required frontmatter or metadata format. When no convention exists and identity will help future readers, use a compact title and header:

```md
# Team Invitations API

> **Doc ID:** SPEC-001-team-invitations-api
> **Type:** API Contract
> **Status:** Draft
> **Owner:** User
> **Source:** Working Record task-004 and accepted product decisions
```

Add only useful fields:

- **Doc ID:** stable identifier when links, review history, or supersession need one.
- **Type:** the artifact's actual job, such as PRD, Issue, Technical Design, API Contract, Migration Contract, or Decision.
- **Status:** current artifact state under the repository or owner's vocabulary.
- **Owner:** person or role with authority over the artifact's intent.
- **Source:** compact pointers to accepted context and evidence.
- **Date / Last Updated:** only when a reliable date matters.
- **Supersedes / Superseded by:** when readers must follow artifact lineage.

Do not invent an owner, approval, date, or authority merely to complete a header. Writing or reviewing an artifact does not make it `Approved`.

## Represent Status Honestly

Use the repository's statuses when available. Otherwise keep the vocabulary small, for example:

```text
Draft | Reviewed | Approved | Rejected | Superseded
```

The appropriate statuses depend on the artifact type. An issue, policy, ADR, and API contract need not share one lifecycle.

Status communicates artifact state; it does not replace review evidence or user authority.

## Preserve Sources Without Copying Them

Link to stable sources such as:

```text
file:<path>#<section>
working-record:<task>/record.md#<section>
commit:<sha>
issue:<id>
output:<output-id>
session:<session-id>/turn:<turn-id>
```

Use identifiers that actually exist. Prefer links and concise quotations over copied inventories, logs, diffs, or transcripts.

A source trail should let a future reader recover why the artifact says what it says. It does not require preserving every conversation turn.

## Revise Without Rewriting History

Do not add a changelog on first creation unless repository policy requires one.

For material revisions:

- update the artifact's current content and status honestly;
- preserve consequential rationale through a change note, decision record, supersession link, or version control;
- record only changes that help readers understand current intent or avoid repeating rejected work;
- do not turn the changelog into execution status or transcript history.

Use the Working Record for task progress, slice history, and current execution state.

## Keep The Artifact Usable

A durable artifact should be identifiable, source-backed, and understandable without the original conversation. It should contain enough depth for its intended use while avoiding information owned by a Plan, Working Record, Handoff, or another canonical document.
