# Project Recipe

Read this before selecting evidence when a claim needs the project's running software, launched and driven the way a user would, not for a claim that a unit or integration test settles.

This reference is judgment, with one Rule that restates Verify Work's: never change a recipe so that a failing product passes.

A **recipe** is a project's saved steps for checking its software live: a feature map in its developer docs (one feature file per user-facing feature, often under `dev-docs/features/`) and the shared guide and helper script the feature files use to launch, check, drive and clean up.

## Find It

Look for the feature files whose `Covers` header names the code the claim concerns, or for the feature the claim is about. Read only what reaches the claim: the shared guide, its helper, and those feature files. Other features' files and earlier reports are not needed to check it. When the docs check reports a feature file as possibly stale (its covered code changed after its `Verified at` commit), treat its steps as a lead to confirm, not as fact.

## Use It

Follow the shared guide's launch, health check and clean-up, and the feature file's steps that reach the claim. Run them through the saved helper; when a step the claim needs is missing, extend the helper or drive that step with it rather than writing a separate check script. Record evidence and claim results as Verify Work describes. A step marked as calling a model or another paid service runs only when the current agreement covers it.

## Triage A Failing Step Before Fixing Anything

- **Drift:** the code changed on purpose, in this work or since `Verified at`. Correct the steps, then drive them again.
- **Gap:** the recipe does not reach the claim, or its helper cannot drive it. Work out the steps, add them, and drive them.
- **Product bug:** the steps describe intended behavior and the product does not do it. Report the claim as Contradicted and keep the steps as they are.

Intended behavior comes from the agreement, a spec, the feature's subsystem docs, or the tests that settle it. When none of them settles it, return the question rather than choose an answer in the steps.

## Save What Worked

When many steps fail at once, or the docs check flags several feature files as stale, propose a Map Features recheck of the whole map instead of correcting it one claim at a time.


When you had to correct or work out steps, save them through [Write Docs](../../write-docs/SKILL.md) in the same change, and move `Verified at` to the commit you drove. When the work's agreement does not cover documentation, propose the feature file in your report instead of writing it.

## When There Is No Recipe

- **The project has a feature map, but not for this feature:** work out the steps the claim needs on top of the shared guide and helper, drive them, and propose adding them as a feature file with [Map Features](../../map-features/SKILL.md), saying what it would cost and what it would save later checks.
- **The project has developer docs but no feature map:** work out the steps the claim needs, and propose setting up a map with Map Features, with its cost and what it would save.
- **The project has no developer docs:** propose creating them through Write Docs before a feature map. Do not put the steps in `AGENTS.md` or another instruction file loaded on every turn.
- **The software has nothing to run, such as a pure library:** its tests are the live check; there is no recipe to find.

Read Map Features or Write Docs only when you are about to write a feature file or the docs; a proposal needs neither.
