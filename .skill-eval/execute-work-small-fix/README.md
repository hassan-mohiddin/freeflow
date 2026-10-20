# Execute Work small-fix reads

Measures commit `23d09cba` ("Execute Work: small local changes skip Verify Work and Review Work bodies") against main before it (`e87877a7`). The two arms differ only in `freeflow.source`: Pi with Freeflow loaded through the host prompt, `xai/grok-4.7` at medium thinking, bash and the hidden tests in the `freeflow-v0-notes` image with no network.

## Cases

| Group | Fixture | The task | What the change should do |
| --- | --- | --- | --- |
| `small-fix.json` | `fixtures/slug` | Remove a trailing hyphen from `slugify` | Small local change: Execute Work only; Verify Work and Review Work not read |
| `config-fix.json` | `fixtures/settings` | Set the default page size in `config/defaults.json` to the README's 20 | Same |
| `permission-fix.json` | `fixtures/access` | Let users shared with edit access edit | Near miss: a permission change, so Review Work is still read. Two seeded traps pass the visible tests: copying `canView` lets view-only users edit, and `doc.sharedWith.some(...)` throws on stored documents that have no `sharedWith` |

Each group grades the final workspace with hidden tests (`graders/<fixture>.test.mjs`, comparison `hidden-tests`) and records reads of `execute-work/SKILL.md`, `verify-work/SKILL.md` and `review-work/SKILL.md` by the `read` tool. A read through `bash` (`cat`) is not counted; check transcripts for one.

## Adoption rule (declared before any run)

Over 5 trials per arm, adopt the candidate only if all hold:

1. Execute Work is read in at least 3 of 5 candidate runs of each case. Otherwise the result is inconclusive: the change acts only through Execute Work's body.
2. On `small-fix` and `config-fix`, the candidate passes `verify-work-read` and `review-work-read` (not read) in at least 4 of 5 runs each, and more often than the baseline. If the baseline does not read them either, there was nothing to save on that case and it supports no claim.
3. On every case, the candidate's hidden-test pass count is no more than 1 below the baseline's.
4. On `permission-fix`, Review Work is read in at least as many candidate runs as baseline runs.
5. Mean cost per run is lower for the candidate on `small-fix` and `config-fix`.

The suite's `decision` (cost, lower, sign test) records the cost direction per case. With 3 cases a sign test cannot reach p < 0.05, so it reports "no difference shown" at best; the rule above is what decides. Read the transcripts before trusting any count.

## Commands

From the repository root, with the branch checked out and committed (the evaluator refuses uncommitted inputs) and the `freeflow-v0-notes` image built (see `../map-features/image/README.md`):

```bash
# Pilot: small-fix only, 2 trials per arm (4 runs)
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/execute-work-small-fix/groups/small-fix.json --trials 2 --max-cost 1.5

# Full run: 3 cases, 5 trials per arm (30 runs); --reuse counts the pilot's matching runs
node skills/evaluate-behavior/scripts/skill-eval.mjs run .skill-eval/execute-work-small-fix/suite.json --trials 5 --max-cost 15 --reuse
```

Go on to the full run only if every pilot run is valid, the hidden tests ran, and Execute Work was read at least once in each arm.

## Checking the graders without a model

`scripts/grade.sh <slug|settings|access> [<answer folder>...]` lays answer folders over the case's fixture and runs its hidden tests in the pinned image (`GRADE_ON_HOST=1` uses the host's `node` instead). The fixture alone and each folder in `wrong/` must fail at least one test; `reference/<case>` must pass all of them.
