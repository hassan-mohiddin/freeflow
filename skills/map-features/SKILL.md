---
name: "map-features"
description: "Use when a project needs a saved, tested way to check its software live, or that way is out of date: setting up a feature map, feature files, a live-verification guide and the helper that launches the software and drives each feature as a user would; or rechecking them after the software changed, a feature was added, or a feature file is marked stale."
---

# Map Features

Give a project a tested way to check its software live, and keep it honest as the software changes. The result lives in the project's developer docs, written for an agent that has never seen the software and reads it cold, mid-task:

- a **feature map**: an index and one feature file per user-facing feature, saying what the user sees and the exact steps and observable results that show it working;
- a **live-verification guide** shared by every feature file: launch, health check, drive, evidence, clean-up, and which inputs make paid calls;
- the **helper** script the guide documents, kept in the repository.

[Write Docs](../write-docs/SKILL.md) owns the shapes of the feature file and the guide; read its [Documentation Shapes](../write-docs/references/documentation-shapes.md) before writing either. [Verify Work](../verify-work/SKILL.md) uses the map to check a claim; this skill builds and maintains it.

There are two modes:

- **Set up:** the project has no feature map, or none for the features the work needs.
- **Recheck:** a map exists. Walk it feature by feature, drive each one live, and correct what no longer holds.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- A step is verified only when it was driven. Until one full live run of a feature file has passed, and its evidence still exists after clean-up, mark the file or step unverified, and call a set-up that never ran a draft.
- Never make a step pass by weakening it. When one fails, decide what failed: the steps drifted from deliberate changes (correct them and drive again), the helper cannot drive working behavior (fix it and drive again), or the product is wrong (report it to the user and keep the step as it is).
- Start, drive, stop and clean up only what this run started. Never stop processes by name, and never drive an instance the run did not launch.
- A step that calls a model or another paid service runs only with the user's yes, a pinned cheap model, and its cost stated first. The helper refuses such input unless the run allows it, and starts the software without credentials when it does not.
- Write the map, guide and helper where the project keeps developer docs and tooling. Never put them in an instruction file such as `AGENTS.md` or in one host's skill folder. A project with no developer docs gets a proposal to create them, through Write Docs, and nothing is written until the user agrees.
- Report an entry point you did not drive as not driven, never as verified through another one.

## Interview The Repository

Goal: know what to drive and how before writing a line. Answer from the codebase, its docs and its scripts; ask the user only what you cannot observe.

- **Surface:** what does a user touch? A web UI, a command-line or terminal UI, a desktop or mobile app, an API or service, or a plugin running inside another program, such as an editor or a coding agent. Pick the primary surface and note the rest. A library with nothing to run gets no map: its tests are its live check, so say so and stop.
- **Run:** the project's own documented start command, its ports, environment, seed data and sign-in.
- **Drive:** existing harnesses first (end-to-end specs, terminal helpers, endpoints a script can call); a generic recipe only when none exists.
- **Observe:** screens or terminal text, response bodies, logs, exit codes, files written, stored state.
- **Isolate:** whether two runs can work side by side with their own data, ports, home folder and credentials. If they cannot, the guide says so, and a run refuses to drive an instance it did not start.
- **Paid calls:** which inputs reach a model or a paid API.

If the checkout does not build or start as it is, fix that first when the agreement covers it, or report exactly what fails; steps written against a broken base teach the wrong thing.

Read [Driving Surfaces](references/driving-surfaces.md) when choosing how to launch, drive and observe the surface, and before writing the helper.

## Set Up

Goal: a fresh agent with only the written steps can launch the software, drive a feature, capture evidence and clean up.

1. **Guide and helper.** Write the shared guide in Write Docs' live-verification guide shape, from what the interview found, with no placeholders. Write the helper it documents: executable, with its invocation shown in the guide, covering launch, a read-only health check, driving, saving evidence, and clean-up that keeps the evidence. A helper the reader has to reverse-engineer is not a helper.
2. **Feature files.** Start with the three to five features users rely on most, from commands, routes, menus and the user docs. Write the index and one file per feature in Write Docs' feature file shape. Each `Covers` header names the code behind what the user sees, so the docs check flags the file when that code changes.
3. **Drive everything you wrote.** Follow the guide and every feature file end to end, as written, with no paid calls unless the user agreed to them. When a step fails, decide what failed (Rules), fix the steps or the helper, clean up, and drive again. After the final clean-up, confirm the evidence is still at its named location. Set each file's `Verified at` to the commit you drove.
4. **Name what the run did not prove.** A step that needs a paid call or an unavailable prerequisite stays marked unverified, with the reason. If you drove a stand-in for the real target, such as a container in place of a fresh machine, list each setup step the stand-in did that the target will not; those stay unverified until a run on the target covers them.
5. Run Write Docs' docs check on what you wrote.

## Recheck

Goal: every feature file is checked against the code and driven live, and the map ends in one stated outcome.

1. **Index.** The index lists every feature file, with no missing, duplicate or dead entries.
2. **Source.** For each feature file, read the code its `Covers` names and the user docs for the feature, and note likely drift with the exact lines that show it. Where the host has subagents, cheap read-only readers can take one feature each; they never drive the software or edit files. Otherwise read features one at a time. Look through recent changes for user-facing features the map lacks, and name the source path before calling one missing.
3. **Live.** Drive every feature at least once, as the guide launches it. Run the health check before the first step and after any failed step; where it cannot see a stuck state, relaunch rather than hope. Evidence survives every clean-up, and nothing a step started outlives the run.
4. **Correct.** Decide what each failure was (Rules). Drive every corrected step and every helper fix again before saving it, and move `Verified at` only for files driven in full.
5. **Outcome.** State one: **clean** (every feature driven, nothing to change), **changed** (proven corrections, saved in one change), or **blocked** (what stopped the pass). List product bugs separately, for the user.

A recheck runs when the user asks or accepts a proposal, never on a schedule. Propose one, with what it costs and what it should catch, when the docs check flags a feature file as stale or the software changed in ways the map describes.

## Report And Stop

Report the mode and outcome; features driven, unverified (with the reason) and unreachable (with the prerequisite and the route tried); product bugs; paid calls made and their cost; where the evidence is; and what the user must decide, such as committing the map or creating developer docs.

Stop once the report is given. Return to the activity that asked, such as Verify Work checking a claim.
