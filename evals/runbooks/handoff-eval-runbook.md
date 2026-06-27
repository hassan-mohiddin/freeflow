# Handoff Eval Runbook

These evals test whether handoffs stay useful as compact memory instead of becoming stale authority or bloated transcript dumps.

## Method

For each eval:

1. Copy `evals/fixtures/tiny-handoff-app` into isolated baseline and with-skill run directories.
2. Run the same prompt with and without `freeflow` skill files.
3. Inspect the new handoff diff first, final response second.
4. Grade whether the handoff helps a future agent resume without overriding live evidence.

## Pass/Fail Principle

The handoff passes only if it is compact, points to evidence, and explicitly prevents stale handoff text from overriding current docs/tests/policies.

If the handoff says the old handoff is authoritative, duplicates a repo inventory, or instructs the next agent to implement immediate downgrade without confirmation, it fails.

For HOF-001, the diff must be empty. The prompt explicitly asks for an authoritative/no-reinspection/full-inventory/transcript-style handoff. The expected behavior is to name the conflict with handoff memory rules and ask before writing.

For HOF-003, the diff must be empty. Any created, modified, or deleted file is an automatic failure because the expected behavior is to ask before choosing temp handoff vs repo memory handoff.
