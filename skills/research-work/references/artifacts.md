# Research Artifacts

This reference is a contract: every Research Work artifact follows it as written. [artifact](../scripts/artifact.mjs) creates each one and refuses a file that breaks it:

```text
node <research-work-directory>/scripts/artifact.mjs init <kind> <path> --title <title> --owner <owner> [--rigor check|study|publication]
node <research-work-directory>/scripts/artifact.mjs validate <path> [--sources <source ledger>]
node <research-work-directory>/scripts/artifact.mjs counts <search ledger .jsonl>
```

Kinds: `research-brief`, `source-ledger`, `search-ledger`, `claims-register`. `init` never overwrites. Artifacts live in the project's research folder when it has one, otherwise in the task folder's `sources/`.

## Header

Every Markdown artifact starts with a title, `# <Type>: <title>`, and a header with Write Docs' fields:

```markdown
# Claims Register: Codex harness report

> **Type:** Claims Register
> **Status:** Draft
> **Owner:** Hassan Mohiddin
> **Source:** brief agreed 2026-10-27 in the task's Working Record
```

- **Status** is one of `Draft`, `Reviewed`, `Accepted`, `Rejected`, `Superseded`, `Retired`. `Accepted` needs a **Source** naming where the owner accepted it.
- Text in angle brackets is a placeholder; validation refuses an artifact that still has one.

## Research Brief

Written at Frame, inside Discuss Work's agreement, before the first search or run. The header adds **Rigor:** `check`, `study` or `publication`, which the user chooses. Six sections, none empty:

| Section | Holds |
| --- | --- |
| `## Question` | One sentence, without jargon, naming the quantity, the comparison and the scope |
| `## Reader and decision` | Who uses the result, and what changes under each outcome |
| `## Claim sought` | The claim the work should let you make; `none: a descriptive report` for a report with no claim to test |
| `## Prediction` | What you expect and the result that counts as failure, written now; `none: a descriptive report` when there is no prediction |
| `## Scope` | A `- In:` line and a `- Out:` line |
| `## Constraints` | Each constraint in the user's words, with the date given; `none` when there are none |

## Source Ledger

One row per source the work relies on, in one table with these columns, in order:

| Column | Holds |
| --- | --- |
| ID | `S1`, `S2`, … never reused |
| Source | Authors, year and title, or the repository and path |
| Pin | `doi:10.…/…`, `arXiv:NNNN.NNNNN`, `<repository>@<commit>`, `ISBN …`, a URL followed by `(accessed YYYY-MM-DD)`, or `none` when known only from memory |
| Lookup | `verified` (found at its identifier), `unresolved` (not found, which does not make it fabricated), `refuted` (its identifier resolves to something else; only an identifier can refute), `not-looked-up` |
| Checked | `opened` (read the source itself), `repository-read` (read the code at the pinned commit), `ran` (executed it), `abstract`, `summary-only` (a search result or someone else's summary), `memory` |
| Read | `full`, `partial`, `abstract`, `none` |
| Supports | The claim IDs it supports (`C1, C3`), or `-` |

How a source was checked caps the claims resting on it: `abstract`, `summary-only` and `memory` support at most L1, whatever study stands behind the source. Write `|` inside a cell as `\|`.

## Search Ledger

A JSONL file, one record per line, appended as the search runs:

```json
{"kind":"query","id":"Q1","query":"LLM judge position bias","database":"arXiv","date":"2026-10-27"}
{"kind":"hit","query":"Q1","title":"Judging LLM-as-a-Judge with MT-Bench","state":"included","source":"S4"}
{"kind":"hit","query":"Q1","title":"An unrelated survey","state":"excluded","reason":"not about judges"}
```

- A query has `id` (`Q1`, …), `query`, `database` and `date` (`YYYY-MM-DD`). It never carries a typed hit count.
- A hit names its `query` (defined on an earlier line) and its `title`. Its `state` is `included`, `excluded`, `duplicate` or `unscreened`; `excluded` and `duplicate` need a `reason`. An included hit's `source` is its source-ledger ID.
- `artifact.mjs counts` computes the counts per query and in total. Report those counts, never hand-counted ones.

## Citations In A Report

A report, a worker's return and the claims register's Source column cite in these forms, which the checks read:

- **Code:** `S<n>:path:line` or `S<n>:path:start-end`, where `S<n>` is a ledger row pinned as `<repository>@<commit>` and the path is relative to the repository root (`S1:codex-rs/core/src/codex.rs:120-145`).
- **A quote:** the quoted words in double quotes followed by the source ID, `"the exact words" (S3)`. Quote at least four words, copied exactly; the check looks for them in the saved copy of S3.
- **A claim:** its register ID, `C4`, or several, `C4, C7`, where a finding states it.

## Claims Register

The contract between the stages: every claim a report or paper makes is a row here before any prose states it. One table with these columns, in order:

| Column | Holds |
| --- | --- |
| ID | `C1`, `C2`, … never reused |
| Claim | The claim, in one sentence |
| Numbers | Every number the claim states, with its interval where it has one (`0.83 [0.79, 0.86]`), or `-` |
| Source | Source-ledger IDs and the result files or log lines the numbers come from (`S2; runs/aggregate.json`) |
| Level | `L0` to `L5` on the evidence scale |
| Kind | `confirmatory` (tested by a decision rule fixed before the data) or `exploratory` |
| Scope | Where the claim holds |
| Limit | What it does not show |

- An exploratory claim is at most L3.
- Validate a register with `--sources <source ledger>`. That check refuses a source ID the ledger lacks, a refuted source, and a level above what the sources' checking allows.
