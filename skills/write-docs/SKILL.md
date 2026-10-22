---
name: write-docs
description: "Use when writing or revising a document for a reader: a spec, PRD, issue, API contract, technical design, decision record or ADR; an implementation, remediation or migration plan; user or developer docs or a README; or when a change makes docs wrong."
---

# Write Docs

Write a document a reader will act on: true to its sources, no more certain than they are, and holding only what its use needs.

Documents come in two kinds, with different lives:

- **Specs and Plans decide work before it happens.** A Spec defines what to build or decide: a PRD, issue, requirements, technical design, API or migration contract. A Plan orders how to carry out agreed work. They are task artifacts, kept beside the task's Working Record (`specs/`, `plans/`) unless the repository keeps them elsewhere; they are drafted, accepted by the user, and left behind once the work is done. A decision record is written the same way and can outlive the task.
- **Documentation describes software that exists:** how it works and why, for the people and agents who use or change it. It lives in the repository and stays true only if it changes with the code; its header names the code it `Covers` and the commit it was `Verified at`. A document that decides work not yet done is a Spec or a Plan, not documentation.

Readers include agents. An agent that reads code sees what it does but not why; without the why, it may treat a deliberate choice as a bug, rebuild a design that was rejected for a reason, or break a rule nobody wrote down.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

| Situation | Read |
| --- | --- |
| A spec, PRD, issue, requirements, technical design, API or interface contract, or migration contract; an ordered plan for implementation, remediation, migration or operations | [spec and plan shapes](references/spec-and-plan-shapes.md) |
| Preserving a decision and its rationale: a decision note or ADR | [decision records](references/decision-records.md) |
| Where a Spec, Plan or decision record goes, its header, status and source trail | Header, Status And Sources, below |
| Finding a project's developer docs or proposing them; the structure of an overview, subsystem doc, folder README, feature file or live-verification guide; a new or rewritten subsystem doc or overview | [documentation shapes](references/documentation-shapes.md) |
| A design whose open representation, identity, ownership, algorithm or failure choices could invalidate dependent work | Execute Work's [design](../execute-work/references/design.md) |
| Direction or alternatives still open, a user-owned choice, or conflicting sources | [Discuss Work](../discuss-work/SKILL.md) |
| Planning a fix whose cause is not supported | Execute Work's [diagnose](../execute-work/references/diagnose.md) |

## Rules

- A document grants no permission. Accepting a Spec or Plan is not permission to execute it, and review establishes fitness, not acceptance or authority. Writing or revising one does not trigger independent review; never label author self-review as independent review, or give a document an accepted status without its source.
- Never add an obligation without an accepted source or a reason the stated outcome needs it. Never infer requirements from nearby code, existing tests or available machinery, invent a user-owned choice or scale, retry, recovery or extension machinery, or reduce agreed scope into an unapproved MVP, roadmap or later-version split.
- Label proposed design as proposed. Never write an assumption, a reviewer's suggestion or your own preference as an accepted decision, or a hoped-for answer or unsettled owner choice as a planning assumption. Authorization to investigate or draft an option does not accept its undisclosed production consequences.
- Stop the affected writing when it would silently settle a user-owned choice, as [Discuss Work](../discuss-work/SKILL.md) defines it, or a hard-to-reverse design; never settle such a choice through normative prose, an unexplained assumption or a polished placeholder. Return the concrete effect and supported alternatives to the owner through Discuss Work.
- Never rewrite source truth to suit implementation, let available tests redefine acceptance, or rewrite a historical decision as though it always contained the new choice.
- Check each factual claim against its source (the code, its tests, an observed run, or the accepted source) before writing it as fact; state what you could not check as unverified, or leave it out. Never claim whole-system completion from a narrow observer.
- Documentation says what is true now. Plans, task progress and open work belong in the task's record, Spec or Plan; history appears only as a short list of major changes.
- When your change makes a document wrong, correct it in the same change. Writing new documentation, or rewriting more than your change made wrong, needs a request or the repository's documentation rules.
- Follow the repository's documentation rules (`AGENTS.md` or its equivalent): where documents live, which parts need the user's approval to change, and what is public.
- Keep secrets, credentials, private task notes and personal data out of documents others can read.

## Write The Document

Goal: a reader with only the document and its sources can act correctly, and can tell what is required, what is fact, and what is still open.

**Know the reader and the use.** Identify the document type, who reads it and for what later action, the accepted scope, the destination, and the open questions it must keep. Answer a question about a document without editing it unless revision is requested. Use Discuss Work when direction or alternatives are still materially open; do not repeat discussion that already settled the document's purpose. An agreement to implement accepted work may include documenting its supported contract; do not manufacture another approval because a document was produced.

**Ground it in current sources:** current user direction and accepted discussion, including later amendments; the Specs, issues, decisions and contracts it revises or consumes; live code, tests, policy and ADRs; current primary sources when an external version or interface constrains it; and the Working Record through [Track Work](../track-work/SKILL.md) when one exists. For documentation, start from the code and its tests, then read what explains them: specs, task records, decision records, commit messages, review threads. A reason that exists only in a task record or a conversation is the one most worth writing down, because it disappears with them.

A record or summary cannot override contradictory current intent or accepted source truth. Distinguish what was requested, proposed, accepted and observed, and know which accepted version or amendment the document follows; an earlier reviewed baseline does not excuse ignoring a later accepted change. An experiment produces evidence, not a requirement: carry its consequences only where they were selected for this outcome. A test can faithfully protect an unnecessary mechanism.

**Write only what the use needs**, in the shape the routes above name. Give the depth the reader needs, including architecture and ownership where the use requires it; do not cut necessary detail just to shorten the document, and leave out a section with nothing true to say. Keep distinguishable: required behavior and accepted decisions; supported facts and their limits; proposed mechanisms; assumptions and open questions; deferrals and superseded direction. Use the repository's vocabulary, and put a consequential uncertainty where the reader makes the affected decision, not in a distant caveat. A limitation of one technique does not establish a need for stronger guarantees, host changes, new persistence, retries or a subsystem. Open questions need not stop unrelated content; a document can be fit for discussion while unfit to guide production, so say which. Give each fact one home and link shared rationale instead of copying it.

**Self-review once before anyone relies on it.** After checking factual claims, use [Review Work](../review-work/SKILL.md) for one silent author self-review of the complete document against its use: it keeps accepted intent and amendments, separates requirements from proposals, has the evidence and acceptance conditions it needs, and keeps dependent documents coherent; for a Plan, also that the ordered work can achieve the outcome, its dependencies hold, later uncertainty is honest, final checks match acceptance, and selected checkpoints are proportionate. Correct clear defects and recheck what they affect; return an unresolved owner decision instead of inventing an answer to make the document consistent. Independent review applies only when selected and authorized to protect a concrete boundary: give the reviewer the complete document, its sources, dependencies and limits through Review Work, and adjudicate the report before revision or use. Respect a selected approval checkpoint, but do not create one for every document.

## Specs And Plans

A Spec describes content, behavior, constraints and uncertainty for its use; it is not an implementation sequence, a Working Record, a transcript or a permission grant. Useful technical depth is welcome; hypothetical completeness is not required. A Plan describes intended execution; the Working Record keeps actual work, evolving state and the next useful action. Keep ordered execution in a Plan and live progress in the record.

When a Working Record exists and the Spec or Plan is accepted for its task, list it under the record's `What defines this task` through Track Work, so every recovery reads it.

Revise for a change in the contract or strategy, not for progress. Preserve accepted content that still holds, change only what new intent or evidence affects, update the status honestly, and keep consequential prior rationale recoverable through a change note, decision record, supersession link or version control; a change note explains current intent or keeps rejected work from being repeated, never execution status or a transcript, and a first version needs none unless repository policy requires it. When an accepted amendment or learning result changes the contract, find the affected Plan, acceptance check or implementation assumption: reconcile it when authorized, otherwise mark it contingent and return the needed revision before dependent use. Learning does not enter the contract by itself: keep findings selected for implementation apart from observations kept as evidence. Do not keep an older baseline after the user accepted a change, synchronize unrelated documents, or repair consistency by silently changing the required outcome.

### Header, Status And Sources

These apply to Specs, Plans and decision records; documentation uses the header in [documentation shapes](references/documentation-shapes.md#header) instead.

**Destination.** A task-local Spec or Plan goes in the task folder Track Work owns (`specs/`, `plans/`). Use an established product, design, API, issue, migration, policy or architecture location instead when the document should be canonical there, and the repository's issue tracker for an issue when it is available and intended. Ask before choosing between task-local memory and canonical repository documentation when the choice changes authority, review or longevity. Do not start a new top-level docs convention for one document.

**Header.** Use the repository's required metadata. Otherwise, when identity helps future readers, give a title and a compact header with only useful fields:

```md
# Team Invitations API

> **Doc ID:** SPEC-001-team-invitations-api
> **Type:** API Contract
> **Status:** Draft
> **Owner:** User
> **Source:** Working Record task-004 and accepted product decisions
```

**Doc ID** when links, review history or supersession need one; **Type** the document's actual job, such as PRD, Issue, Technical Design, API Contract, Migration Contract, Implementation Plan or Decision; **Owner** the person or role with authority over its intent; **Source** compact pointers to accepted context and evidence; a date, or **Supersedes** / **Superseded by**, only when reliable and needed. Never invent an owner, approval, date or authority to complete a header.

**Status.** Use the repository's statuses when it has them. Otherwise give one current status from this vocabulary, the same for every Spec, Plan and decision record, using only the states its life reaches:

| Status | Means |
| --- | --- |
| `Draft` | Being written, or proposed and not yet accepted. |
| `Reviewed` | Reviewed and not yet accepted; say whether by author self-review or selected independent review. |
| `Accepted` | The owner accepted it; `Source` names where. |
| `Rejected` | The owner declined it. |
| `Superseded` | Replaced; link the replacement both ways. |
| `Retired` | Dropped with nothing replacing it, with the date and the reason. |

Writing or reviewing a document never makes it `Accepted`, and `Accepted` is not permission to execute it. Status reports the document's state; it does not replace review evidence or user authority.

**Source trail.** Link stable sources that actually exist, such as `file:<path>#<section>`, `working-record:<task>/record.md#<section>`, `commit:<sha>`, `issue:<id>`, `output:<output-id>` or `session:<session-id>/turn:<turn-id>`, with concise quotations rather than copied inventories, logs, diffs or transcripts. The trail lets a later reader recover why the document says what it says, without preserving every turn: for a consequential choice, keep the proposal, its disclosed consequences and the acceptance source together rather than an isolated "proceed" or an agent's summary of approval, and keep accepted amendments apart from unselected experimental findings.

A Spec or Plan stays identifiable, source-backed and understandable without the original conversation, holding no information a Working Record, handoff or another canonical document owns.

## Documentation

### Choose The Document

Goal: each fact lives in one place, written for the reader who needs it.

| Reader | Document | Holds |
| --- | --- | --- |
| Someone using the software | User guide | What it does and how to use it: tasks, settings, commands, from the user's side. |
| Someone finding their way around the code | Overview (an `ARCHITECTURE.md`, or the index of the developer docs) | The problem the software solves, its parts and how they relate, a map of where things are, and the rules that hold across parts. Short and slow to change. |
| Someone changing one subsystem | Subsystem doc | How the subsystem works and why: its surface, state, invariants, decisions, failure behavior, code map, and tests. |
| Someone editing files in one folder | Folder `README.md` | What each file owns, local rules, and a pointer to its subsystem doc. |
| Someone checking a feature in the running software | Feature file, plus a shared live-verification guide | What the user sees and the exact steps that show it works. |
| Anyone revisiting a hard-to-reverse choice | Decision record | The decision and why, in the [decision records](references/decision-records.md) shape. |

Prefer extending an existing document to creating a new one: a small set of current documents serves readers better than many partly current ones. A subsystem earns its own doc when the reasons behind it cannot be read from the code and readers keep needing them: agents re-derive the same design, or mistake a deliberate behavior for a bug. A user guide and a subsystem doc about the same feature are different documents for different readers; link them rather than merging them.

Each kind of knowledge has one home. How the code works and why, its decisions, and behavior that looks wrong but is intended: developer docs, with hard-to-reverse choices in decision records and what the user sees in feature files. Rules for agents working in the repository: its instruction files. Task progress and decisions in flight: the task's record, until settled decisions move to the docs. The user's own preferences: the host's memory.

Write documentation where the repository keeps it; [documentation shapes](references/documentation-shapes.md#starting-developer-docs) says where to look, and what to propose when there is none. If the repository keeps none and you are asked to start, propose a location and confirm with the user before creating it. When a project has code and no developer docs, propose creating them and wait for the user's yes; keep that knowledge out of `AGENTS.md`, `CLAUDE.md` and other always-loaded instruction files, which every request pays for.

### Write It For The Next Change

Goal: a reader with only the document and the code can make a correct change, and can tell what is deliberate.

- **Name, do not link to lines.** Write paths, functions, types, configuration keys, and messages exactly, in backticks, so readers and search tools find them. Line numbers go stale with the next edit.
- **Write invariants, including absences.** "Nothing outside `config.ts` reads the config file" or "the request path never reads session files" cannot be seen by reading any one file, so state it.
- **Say what looks wrong but is intended.** For behavior a careful reader would take for a bug, state the behavior, the reason, and what would break if it changed.
- **Keep explanation apart from reference.** Explanation (purpose, how it works, why) is read once to understand; reference (surface, state, invariants, code map, tests) is consulted while working. Put them in separate sections so a reader looking up a fact does not wade through reasoning.
- **Prefer present-tense facts to narrative.** "Compaction runs at the end of a turn" rather than "We changed compaction so that it now runs at the end of a turn". History gets one short section of major changes, with commits.

Depth follows the reader's risk. A subsystem with many hidden reasons needs most of the shape; a small one may need only purpose, surface, and code map.

### Keep It Current

Goal: documentation stays true as the code changes, without anyone remembering to check.

- When you finish a change, ask whether any document now says something false: a user guide, a subsystem doc, a folder README, an overview. Correct it in the same change.
- When work settles a decision about a documented subsystem (a design choice, a rejected alternative, a limit accepted on purpose), record the decision and its reason in the subsystem doc once the work it decided is done. The task record is deleted or forgotten with the task; the doc stays.
- Before you treat behavior in a documented subsystem as a bug, read its decisions and its list of intended behavior that looks wrong. If the behavior is listed there, changing it is a design change for the user to decide, not a fix.
- Delete or correct documentation that is no longer true. A wrong document misleads more than a missing one.
- After checking a document against the code, update the commit it records as verified.

### Check It

Run the bundled [docs check](scripts/docs-check.mjs) after writing or changing documentation:

```text
node <write-docs-directory>/scripts/docs-check.mjs <docs-file-or-directory>... [--root <repository>] [--strict] [--json]
node <write-docs-directory>/scripts/docs-check.mjs [<docs-file-or-directory>...] --covering <path>... [--root <repository>] [--json]
```

It reports paths a document names that do not exist and, for documents with the header, those whose covered code changed since the commit they record as verified. A change made together with the document, in the same commit or both uncommitted, counts as reviewed with it. Missing paths are errors (exit code 1). Changed code is a warning, since many changes leave a document true; `--strict` makes it an error. Read the changes it lists and update the document or its verified commit.

`--covering` instead lists the documents that cover each path and whether each is current: the ones a change should reread or update.

A passing check shows that the named paths exist; it does not prove every claim is current. A new or substantially rewritten subsystem doc or overview also gets the reader test in [documentation shapes](references/documentation-shapes.md#test-it-on-a-new-reader). Report what was checked.

## Stop

Report the document's path, type and intended use, its source basis, what is unresolved, contingent or unverified, and what was checked. For a Spec or Plan, also report a Plan's invalidation conditions and selected checkpoints, and the actual review, acceptance and execution-authority status.

Stop when the document is fit for its use, or its blocking decision or evidence limit is explicit; for documentation, when it says only what is true now, each claim is checked or marked unverified, and the docs check passes. Then return to the activity that asked for it: if the agreement covers implementation, continue through the normal route; if it asks for a Plan first, stop there. Do not begin work outside that agreement or call an unresolved strategy ready.

Stop and ask when where a document lives, who may change it, or whether a disputed behavior is intended cannot be settled from the code, its tests and its sources.
