# Review Gate

Read this at a hand-over, before dispatching, proposing, or skipping an independent review of the work.

This reference is judgment; Review Work's Rules still bind, and what each mode permits restates its first Rule.

A **hand-over** is the end of the agreed work, when it goes back to the user to accept: before [Deliver Work](../../../skills/deliver-work/SKILL.md) merges or opens a pull request for it, or before the final report when nothing is delivered. Self-review of an intermediate result, such as one Slice or a small local fix, needs no gate.

## Find The Mode

The user sets a review mode, and optionally a reviewer model, as `"review": { "mode": ..., "model": ... }` in `.freeflow/local.json` (personal) or `.freeflow/config.json` (shared). The Runtime State shows a `Review:` line when one is set; with none, the mode is `auto`.

- `auto`: the triggers below decide. When one fires, dispatch an independent review; the trigger and the mode are its authorization. When none fires, self-review is enough.
- `off`: never dispatch on your own. When a trigger would fire, propose an independent review to the user with the trigger and its estimated cost, and run it only after their yes.
- `always`: dispatch an independent review at every hand-over.

A user's explicit request for an independent review authorizes it in any mode.

## Check The Triggers

The gate fires when the change touches:

- security, authentication, authorization, or secrets;
- possible data loss, or a migration of stored data;
- CI or release files;
- a public interface: anything users or other code depend on, such as CLI flags, config keys, exported APIs, and skill names and descriptions;
- a path the project's Review Rules mark sensitive;
- anything the Work Agreement names for review.

Judge from the diff against the base, not from how the task was described. A trigger that fires is enough; a small diff does not cancel it.

## Choose The Reviewer

Use the user's reviewer model when set. Otherwise use the cheapest model capable of the review: the `standard` tier. When a security, authentication, authorization, or secrets trigger fires, use a stronger model: the `security` tier. The estimated cost names the reviewer model and roughly what one review of a change this size costs on it.

## Record The Gate

When the task has a Working Record, record the gate as one Material update through [Track Work](../../../skills/track-work/SKILL.md), in the shape its format reference defines:

```text
- Review gate — mode: auto | off | always; tier: ...; because: <trigger> | no trigger; result: dispatched | proposed | skipped
```

The tier is `standard`, `security`, or `none` when the result is `skipped`. Without a record, state the same in the hand-over report. Before a dispatched review, read [Independent Reviewer Contract](reviewer-contract.md).
