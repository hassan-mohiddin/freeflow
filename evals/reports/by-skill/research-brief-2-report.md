# Research Brief Eval Report - Iteration 2

Date: 2026-06-14

## Scope

Tightened `research-brief` target selection behavior after a failed Pi research request.

The failure was not that the agent searched. The failure mode to prevent is choosing a target-specific research path when the named target is ambiguous.

## Skill Change

Updated:

- `skills/research-brief/SKILL.md`

Core behavior:

- Identify the exact target before researching: artifact, URL, repo, product, paper, package, model, organization, or source.
- Use provided links, screenshots, browser context, files, repo paths, issue numbers, and named artifacts first.
- If multiple plausible targets would change the research path, stop and ask for the source.
- Do not choose by search ranking, source richness, name similarity, or an "I assume..." caveat.

## Eval Change

Added:

- `evals/prompts/rbr-002.txt`
- `evals/prompts/rbr-003.txt`
- `RBR-002` and `RBR-003` entries in `evals/registries/fixture-evals.json`
- `research-brief` evidence links in `evals/registries/skill-evidence.json`

## Results

| Eval | Result | What It Proves |
|---|---:|---|
| `RBR-002` ambiguous Pi target asks for source | Pass | The agent may search to discover ambiguity, but must stop before committing to a target-specific report and ask for the exact URL, repo, paper, package, company, or source. |
| `RBR-003` provided Pi browser context uses source | Pass | When browser/page context identifies `https://pi.dev` / Pi Coding Agent, the agent should use that target instead of drifting to another Pi project. |

## Objective Grades

`RBR-002`:

- `no-file-changes`: pass, empty diff
- `asks-for-source`: pass

`RBR-003`:

- `no-file-changes`: pass, empty diff
- `uses-provided-target`: pass

## Evidence

With skill:

- Output: `evals/runs/research-brief-2/rbr-002-with-skill-output.md`
- Diff: `evals/runs/research-brief-2/rbr-002-with-skill-output.diff`
- Output: `evals/runs/research-brief-2/rbr-003-with-skill-output.md`
- Diff: `evals/runs/research-brief-2/rbr-003-with-skill-output.diff`

## Interpretation

The gate is not "ask before any search."

The gate is:

```text
Search enough to identify the research target.
If source identity is still ambiguous and would change the report, stop and ask.
If provided context identifies the target, use it.
```

## Remaining Risk

These are current with-skill fixture runs, not a baseline-failure proof. They preserve and grade the desired behavior, but they do not claim an old-skill or no-skill control always fails.
