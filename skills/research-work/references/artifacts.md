# Research Artifacts

This reference is a contract: every Research Work artifact follows it as written. [artifact](../scripts/artifact.mjs) creates each one and refuses a file that breaks it:

```text
node <research-work-directory>/scripts/artifact.mjs init <kind> <path> --title <title> --owner <owner> [--rigor check|study|publication]
node <research-work-directory>/scripts/artifact.mjs init project <folder> --title <title> --owner <owner> [--rigor check|study|publication]
node <research-work-directory>/scripts/artifact.mjs validate <path> [--sources <source ledger>]
node <research-work-directory>/scripts/artifact.mjs counts <search ledger .jsonl> [--flow <flow.json>]
```

Kinds: `research-brief`, `source-ledger`, `search-ledger`, `claims-register`, `study-plan`, `judge-validation`, `paper-outline`, `rebuttal`, `evidence-table`, `recheck`. A research report has no kind: it follows the Research Report shape below and is checked by `cite-check` and `trace`. `init` never overwrites. A study's run ledger and deviation log are written only by [study](../scripts/study.mjs), as [running](study.md#running-the-study) says. Artifacts live where the user says; otherwise where the work puts them. Research done for another task (a study or report that informs a change) goes in that task's folder, under `sources/`. A task that is itself research goes in the project's research folder, laid out by `init project` when there is none. A quick question answered from facts in hand is not research and gets no research artifact.

`init project` lays out a research folder: `brief.md`; `sources/` (`sources.md`, `searches.jsonl`, saved copies); `study/` (the plan, its lock and ledgers, `results/`); `claims.md`; `paper/` (`outline.md`, `paper.md`, `figures/`, `refs.bib`, `build/`, `runs.jsonl` for the paper's own receipts, `rebuttal.md`); `reviews/`. Every path inside an artifact is relative, so another layout works as well.

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
- Words in angle brackets, as the skeletons write them (`<what the work covers>`), are a placeholder; validation refuses an artifact that still has one. A comparison such as `x < 3` is not a placeholder.

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
| Pin | `doi:10.…/…`, `arXiv:NNNN.NNNNN`, `<repository>@<commit>`, `ISBN …`, a URL followed by `(accessed YYYY-MM-DD)`, or `none` when known only from memory. `<repository>` is a short name of your choosing (`codex`), the one you pass to `cite-check --repo` |
| Lookup | `verified` (found at its identifier), `unresolved` (not found, which does not make it fabricated), `refuted` (its identifier resolves to something else; only an identifier can refute), `not-looked-up` |
| Checked | `opened` (read the source itself), `repository-read` (read the code at the pinned commit), `ran` (executed it), `abstract`, `summary-only` (a search result or someone else's summary), `memory` |
| Read | `full`, `partial`, `abstract`, `none`. For a repository, `full` means every file the claims rest on was read whole; `partial`, only the cited ranges and what led to them |
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
- A hit names its `query` (defined on an earlier line) and its `title`. Its `state` is `included`, `excluded`, `duplicate` or `unscreened`; `duplicate` needs a `reason`, `excluded` a `reason` or a `criterion`. An included hit's `source` is its source-ledger ID.
- `artifact.mjs counts` computes the counts per query and in total. Report those counts, never hand-counted ones.

A screened review adds its criteria, its screeners and each hit's stage. All are optional, so a ledger without them stays valid:

```json
{"kind":"criterion","id":"E1","text":"not about model judges","stage":"title-abstract"}
{"kind":"criterion","id":"E2","text":"no agreement measured against people","stage":"full-text"}
{"kind":"screener","id":"P1","person":"Hassan Mohiddin"}
{"kind":"screener","id":"M1","model":"claude-haiku-5-5 (2026-10-01)","judge":"screening-judge.md"}
{"kind":"hit","query":"Q1","title":"…","state":"excluded","criterion":"E2","stage":"full-text","screener":"M1"}
{"kind":"hit","query":"Q1","title":"…","state":"included","stage":"full-text","source":"S5","screens":[{"screener":"P1","state":"included"},{"screener":"M1","state":"excluded","criterion":"E2"}],"settled_by":"Hassan Mohiddin"}
```

- A **criterion** (`E1`, …) is a ground for exclusion, written before screening, with its `text` and the `stage` that can apply it: `title-abstract` (it applies at either stage) or `full-text` (only the full text can settle it). Once the ledger defines criteria, every excluded hit cites the one that excluded it, as `criterion`, defined on an earlier line.
- A hit's **stage** is where it was last screened: `title-abstract` or `full-text`. A hit that cites a criterion names its stage, and a full-text criterion cannot exclude at `title-abstract`.
- A **screener** is a `person` or a `model`. A model screener names, as `judge`, its [judge validation record](#judge-validation-record), relative to the ledger: a sample of hits screened by a person is the gold set. Until that record passes, every hit the model screened is refused. A hit names who screened it as `screener`.
- **Two screeners:** `screens` holds both decisions (`screener`, `state` of `included` or `excluded`, and the `criterion` for an exclusion), and the hit's own `state` is the decision that counts. Where the two disagree, or the state is not the one they both gave, `settled_by` names the person who settled it; a disagreement not yet settled leaves the hit `unscreened`. The screens are at the hit's stage.

`counts` also reports, for each pair of screeners and stage, their raw agreement, Cohen's kappa and the disagreements, with how many no person has settled. `counts --flow <flow.json>` writes the review's flow, PRISMA-style, for `figure.mjs` to draw (Figure Spec, below), and writes nothing from a ledger with problems:

| Field | Holds |
| --- | --- |
| `kind`, `computed_by` | `search-flow`, `artifact.mjs counts --flow` |
| `identified` | `records`, every hit line, and `databases`: each database's `database` and `records` |
| `duplicates`, `awaiting`, `screened` | Hits marked duplicate, still unscreened, and screened (included or excluded) |
| `excluded_title_abstract`, `excluded_stage_not_recorded` | `records` and `reasons`: each criterion's (or free reason's) `criterion`, `reason` and `records` |
| `full_text` | `assessed` and `excluded` as above, or `null` when no hit records the full-text stage |
| `included` | Hits included |

## Citations In A Report

A report, a worker's return and the claims register's Source column cite in these forms, which the checks read:

- **Code:** `S<n>:path:line` or `S<n>:path:start-end`, where `S<n>` is a ledger row pinned as `<repository>@<commit>` and the path is relative to the repository root (`S1:codex-rs/core/src/codex.rs:120-145`).
- **A quote:** the quoted words in double quotes followed by the source ID, `"the exact words" (S3)`, or for a repository the file too, `"the exact words" (S1:path)`. Quote at least four words, copied exactly; the check looks for them in the saved copy of S3, or in the file at the pinned commit.
- **A claim:** its register ID, `C4`, or several, `C4, C7`, where a finding states it.

## Claims Register

The contract between the stages: every claim a report or paper makes is a row here before any prose states it. One table with these columns, in order:

| Column | Holds |
| --- | --- |
| ID | `C1`, `C2`, … never reused |
| Claim | The claim, in one sentence |
| Numbers | Every number the claim states, with its interval where it has one (`0.83 [0.79, 0.86]`), or `-` |
| Source | Source-ledger IDs, the result files or log lines the numbers come from (`S2; runs/aggregate.json`, `log.txt:40-42`), `judge:<record>` for a claim resting on a judge's verdicts, and `search:Q<n>` for the search a claim of absence rests on; paths are relative to the register |
| Level | `L0` to `L5` on the evidence scale |
| Kind | `confirmatory` (tested by a decision rule fixed before the data) or `exploratory` |
| Scope | Where the claim holds |
| Limit | What it does not show |

- An exploratory claim is at most L3.
- A claim worded as an absence (being first, nothing or nobody having done it, novel, unprecedented, unexplored) cites the search behind it as `search:Q<n>`; validation refuses one that cites none, reading the wording, and with `--search <search ledger>` a query the ledger lacks.
- Validate a register with `--sources <source ledger>`. That check refuses a source ID the ledger lacks, a refuted source, and a level above what the sources' checking allows.
- Validate a study's register with `--plan <study plan>` too. It refuses a confirmatory claim unless its ID is a confirmatory hypothesis of the plan, the plan is locked as it stands, and no amendment changed that hypothesis after study runs existed; and it refuses an analysis variant the plan lists, or listed in any locked version, that no row's Claim, Scope or Limit names as `variant V<n>`.
- A claim citing `judge:<record>` is at most L1 unless that judge validation record validates and its Result is `pass`; validation checks this whenever a row cites one. When the plan lists a model as `judge` or `annotator`, validation with `--plan` refuses a claim above L1 that cites a result file and neither `judge:<record>` nor `judge:none` (no model's labels feed it).
- With `--plan`, a confirmatory claim whose hypothesis names a `stats.mjs` Method is checked against the result files it cites that hold its numbers (every cited one, when none does): each must record `computed_by` as a part of the Method, and at least one as its last part, the correction when one is listed (`stats.mjs correct holm`; the raw test's file may sit beside it), and a receipt run under the locked plan, with `stats.mjs` as its program or node's script, must have written it as it is now. `stats.mjs --out <file>` writes the result for the receipt to declare.
- `claims.mjs trace --results` finds each number in the Numbers column in the result files the row's Source names, at the precision written (0.83 matches 0.8333; 65% matches 0.65). A row with numbers and no result file is listed as not checked.

## Study Plan

Written at Design, before the first run that counts; `init study-plan --rigor <rigor>` creates the sections for that rigor. The header adds **Rigor**. Sections, none empty:

| Section | Holds |
| --- | --- |
| `## 1. The claim` … `## 12. Where it holds` | The answers to the twelve questions in [study design](study.md#answer-the-twelve-questions). At `check` rigor only 1, 3, 4, 5 and 10 are required |
| `## Hypotheses` | One table: `ID` (the claim ID the register will use), `Hypothesis`, `Kind` (`confirmatory` or `exploratory`), `Metric`, `Decision rule`, and optionally `Method`: the `stats.mjs` family and method that computes the rule (`paired mcnemar`), followed by any correction applied to it (`paired mcnemar; correct holm`), or `computed: <how>`. A confirmatory row names its metric, rule and, with the column, its method; `-` is allowed only for an exploratory one |
| `## Planned runs` | One table: `Unit`, `Arm`, `Trials` (a whole number of at least 1), then optionally `Split` (`tuning` or `held-out`), then optionally `Budget` (the tuning effort and compute the arm gets; `control` for a do-nothing or oracle arm; `not compared: <why>` for an arm outside the comparison), one row per unit and arm. With a confirmatory hypothesis, every Budget other than those two must be the same |
| `## Analysis variants` | At `study` and `publication` rigor: `none`, or one table, `ID` (`V1`, …, each once), `Variant`, `What it changes`: each other reasonable analysis that will be run and reported. The lock records them, so an amendment cannot drop one unreported |
| `## Models in the method` | At `study` and `publication` rigor: `none`, or one table, `Role` (`judge`, `annotator`, `generator` or `subject`), `Model`, `Snapshot` (the exact version, never `latest`), `Accessed` (`YYYY-MM-DD`, no later than today) |
| `## Contamination` | At `study` and `publication` rigor: one table, `Route`, `Control`, with one row for each of `training data`, `prompts and examples`, `tuning`, `tools and web` and `grader and harness`, and its control or `unknown` ([study design](study.md#close-the-routes-contamination-takes)) |
| `## Amendments` | `none`, then one line per amendment, written by `study.mjs amend` |

The three sections at `study` and `publication` rigor, the `Method` column and the `Budget` column are validated when present and noted by `study.mjs check` when absent, so plans locked before they existed stay valid; add them by amendment. A Method added after study runs changes its hypothesis, which becomes exploratory, so add it before the runs that count.

`study.mjs lock` writes `<plan>.lock.json` beside the plan: the plan's sha256 (over everything but `## Amendments`), `by` (who agreed, their words and the date, and who ran the lock when that was someone else), when, its hypotheses, and `git`: the commit and path that hold the plan, or the reason it is not anchored; each amendment adds an entry with its hash, who, when, why, and every hypothesis it added or changed after study runs existed, none of which can then be confirmatory. Never edit the lock by hand.

## Run Ledger

`runs.jsonl` beside the plan, one receipt per line, appended by `study.mjs run` and never edited. A receipt holds: `id` (`R1`, …), `unit`, `arm`, `trial`, `split` (from the plan, or null), `validity` (true on a validity check run with `--validity`), `plan_sha256` and `plan_locked` (whether that hash was locked when it ran), `argv`, `cwd`, `program` (the resolved path and its sha256), `inputs` and `outputs` (each path, relative to the plan's folder, with its sha256, or null when absent), `started_at`, `finished_at`, `duration_ms`, `exit_code` (null when the command could not start), `signal`, `error`, the last 2 KB of stdout and stderr, and `prev_sha256`, the sha256 of the line before it (null on the first). The chain makes an edited, removed or reordered line visible: `study.mjs check` reports where it breaks.

## Deviation Log

`deviations.jsonl` beside the plan, appended by `study.mjs deviation` and `study.mjs clear`. A `deviation` line has `id` (`D1`, …), `what`, `unit` and `arm` (or null), `by` (who logged it) and `at`; a `clearance` line has the deviation's `id`, `by` (who cleared it) and `at`. Its lines are hash-chained like the run ledger's. A deviation without a clearance holds `study.mjs check`. A cleared deviation naming a unit (and arm) covers that unit's missing trials.

## Judge Validation Record

One per judge configuration and rubric, made before any of the judge's answers count. The header adds these fields, all filled:

| Field | Holds |
| --- | --- |
| Judge | The model, its version and settings |
| Rubric | The path of the frozen rubric |
| Rubric sha256 | Its sha256, 64 lowercase hex characters |
| Gold items | How many items with known answers it was scored on |
| Agreement | Its agreement with the gold answers, 0 to 1 |
| Interval | `[low, high]` and the method, from `stats.mjs` |
| Required lower bound | The lowest interval bound the study accepts, fixed before scoring |
| Both orders, Length control, Decoys, Repeatability | `passed`, `failed` or `not run`; Both orders may also be `not applicable`, for a judge that rates one output at a time; Repeatability is the judge's agreement with itself on a rerun |
| Judge and graded | `different family`, `different model`, or `same model: <why no other model was available>` |
| Result | `pass` or `fail` |

Result can be `pass` only when the interval's lower bound reaches the required bound and all four controls `passed` (Both orders may be `not applicable`); validation refuses a record that says otherwise. A `## Notes` section says how the gold set was built and what the decoys were.

## Judge Answers

A JSONL file, one answer per line: `item`, `score`, `quote` (the judged output's own words supporting the score, at least four of them) and `output` (the judged output's path, relative to the answers file). `sources.mjs quote-check <answers.jsonl>` refuses an answer with no quote, a quote under four words, or one not found in its output.

## Research Report

The shape of an in-depth report or a study's report, from a quick answer to a long synthesis. Its header follows Header above, with Type `Research` and the date the evidence was gathered; leave out a section with nothing to say. A quick answer may need only Question, Answer and Evidence.

```markdown
## Question        what is asked, who will use the answer, and the decision or work it serves
## Answer          the answer in plain words, with its evidence level
## Findings        each finding with its claim IDs and its level, most important first
## Evidence        each source: what it shows, and how it was checked
## Method          how the evidence was gathered: scope, searches or runs, what was left out
## Limits          where sources disagree and how that was settled, and what the evidence cannot show
## Open Questions  what is still unknown, and what would settle it
## Implications    what the answer means for the reader's decision
```

- **Answer before evidence.** The reader knows the claim before reading what supports it.
- **State strength once,** as the evidence level, where the finding is stated; keep the limits in Limits. A qualifier repeated in every sentence hides the claim without making it more accurate.
- **Say how each source was checked,** as its source-ledger row records, with the version or date of anything that changes. Never present a source known only from a summary as verified.
- **Recommendations are proposals.** Implications may recommend; the owner decides. A finding becomes a requirement or a decision only through its owner, as any other source does.

[claims](claims.md#write-the-report-from-the-register) says how to write it from the register.

## Paper Outline

Written before a paper's prose ([paper](paper.md)). The header adds **Register:** the claims register the paper draws on, relative to the outline, and **Runs:** the run ledger holding the figures' receipts (a study's `runs.jsonl` or the paper's own), or `none`. Sections:

- `## Proposition`: one sentence, the paper's message, or `not yet stated` while the message is still being found.
- `## Contributions`: a table `| ID | Contribution | Claims |`; IDs `K1`, `K2`; each row names at least one claim ID.
- `## Paragraphs`: a table `| Section | Paragraph | Role | Claims |`, one row per planned paragraph; Claims lists claim IDs or `-`.
- `## Figures`: a table `| ID | Figure | Claims | Data | File | Receipt |`; IDs `F1`, `F2` for figures and `T1`, `T2` for tables; Data is the data file, relative to the outline, which must exist; File is the figure file (`-` for a table set in the text); Receipt is the run that drew it (`R<n>` in the Runs ledger), or `-` until it is drawn. A paper with no figures says `none` under the heading instead of a table.
- `## Objections`: a table `| Objection | Answered in |`, or `none found within these searches`.
- `## Limits`: where the limits are stated.

Validation refuses an empty proposition, a contribution or figure with no claim ID, a claim ID the register does not have or a register it cannot read, a figure whose data file does not exist, an objection with no answer, and a placeholder left in the header. A filled Receipt must exist in the Runs ledger, have exited 0, and have read the Data file and written the File as they are now, by their hashes (a File that does not exist fails); when the receipt read a figure spec, the spec's data must be the Data file; `claims.mjs draft-check --outline` also refuses a figure with no receipt.

## Rebuttal

One per review round set, answering a venue's reviewers ([paper](paper.md#rebuttal)). The header adds **Stage:** `drafted` or `submitted`, and **Paper:** the version reviewed. One table:

| Column | Holds |
| --- | --- |
| ID | `R1`, `R2`, … |
| Reviewer | Who wrote the comment |
| Round | 1, 2, … |
| Comment | The comment, quoted |
| Choice | `will address`, `won't` or `not on point` |
| Reason | Why |
| Commitment | What you commit to; `-` unless the choice is `will address` |
| Fulfilled | Where the commitment was done (a section or a commit), or `-` |
| New | `-` in round 1; later, `yes` for a request the earlier round did not make, or `continues R<n>` naming that reviewer's earlier comment |

Validation refuses a missing choice or reason, a "will address" without a commitment, a later-round comment that is neither new nor continues an earlier comment of the same reviewer, and, at Stage `submitted`, a commitment with no Fulfilled. It lists the new requests.

## Evidence Table

For a literature review: one row per study it compares. One table, `| Source | Design | n | Result | Failure condition | Level |`, optionally followed by `Weakness`: the study's main weakness, or `-`; then optionally by both `Bias tool` and `Risk of bias`: the tool that assessed the study's risk of bias, chosen for its design (RoB 2 for a randomized trial, ROBINS-I for a study that did not randomize), and the tool's overall judgment, `low`, `some concerns`, `high` or `not assessed` (with Bias tool `-`). Source is a source-ledger ID; n is a whole number or `-`; Failure condition is the result that would have refuted the study's claim; Level is capped, with `--sources`, by how the source was checked, as for a claim. Validation refuses a judgment outside the four, a judgment with no tool, and RoB 2 or ROBINS-I named against a design that reads the other way.

## Recheck Table

For rechecking the numbers another study reports, as [investigation](investigation.md#rechecking-a-studys-numbers) says. One table, `| ID | Source | Where | Check | Reported | Status |`:

| Column | Holds |
| --- | --- |
| ID | `N` and a number |
| Source | A source-ledger ID |
| Where | The page, table or line the numbers are printed on |
| Check | `grim`, `grimmer`, `debit`, `p`, `d` or `n-df` |
| Reported | The values with their labels, each number copied as printed |
| Status | Written by `stats.mjs recheck --write`: `consistent`, `mismatch`, `decision error`, or `not computable: <reason>`. The reason is one of `not read`, `missing input`, `n too large`, `not a single item`, `not binary`, `d type unknown` or `design unknown` |

Validation refuses a Status other than the one the Reported text computes to, and, with `--sources`, a Source the ledger lacks.

## Support Packets And Verdicts

`claims.mjs support` writes the packets, one JSON object per line: `packet` (`P1`, …), `claim` (its register ID), `statement`, `numbers`, `scope` and `limit` from the register, `evidence` (each with `cite`, `text` and a `note` saying what the text is; code lines carry their line numbers, the cited ones marked `>`, and the lines that open the enclosing blocks come first, before a `...` line; a range longer than 200 lines is cut, and `cut` names the lines not shown), `unread` (citations whose text could not be read, with why) and `question`, the same for every packet. Never edit a packet; build them again.

The reader writes the verdicts, one JSON object per line:

```json
{"packet":"P1","verdict":"partial","quote":"if policy.allow_retry and attempts < 2","missing":"the retry happens only when the policy allows it"}
```

- `verdict` is `supported`, `partial` (the evidence shows part of the claim, or only under a condition the claim leaves out) or `unsupported`.
- `quote` is at least four words of the packet's evidence, copied exactly (without line numbers).
- `missing` says what the evidence does not show; required for `partial` and `unsupported`.
- `adjudication` is added by the author only: `rejected: "<four or more words of the packet's evidence>" <reason>` for an answer the evidence shows to be wrong.

`claims.mjs support-check` refuses an answer naming no packet, a packet answered twice or not at all, a verdict outside the list, a quote under four words or not in that packet's evidence, a partial or unsupported answer without `missing`, and a rejection whose quote is under four words or not in the packet's evidence. It passes when every packet has a valid answer and every partial or unsupported answer is settled.

## Figure Spec

The JSON that [figure](../scripts/figure.mjs) draws an SVG from: `node figure.mjs draw <spec.json> --out <figure.svg>`. Draw it through `paper.mjs run` or `study.mjs run`, with the spec and data as inputs and the SVG as output, so its receipt can go in the outline.

| Field | Holds |
| --- | --- |
| `type` | `line`, `points`, `bar` (categories on x) or `scatter`; or `flow`, below |
| `data` | The data file, relative to the spec: a JSON array of rows (at the dotted path `rows` names inside the file, when given), JSONL, or CSV with a header row. Values typed into the spec are refused |
| `series` | One entry per series: `label`, the `x` and `y` columns, optional `low` and `high` columns for an interval, optional `where` (column values a row must have) |
| `x`, `y` | Optional `label`, `min` and `max` for each axis |
| `title`, `description`, `reference`, `width`, `height` | Optional: a title and a description, written into the SVG as its title and alternative text; reference lines `[{ "y": 0.95, "label": "nominal" }]`; the size in pixels (640 by 400) |

The output is the same bytes for the same spec and data. Colors follow Okabe and Ito's palette, with a different marker per series.

A review's flow is a spec of `type` `flow` whose `data` is the file `counts --flow` wrote, with only `title`, `description` and `width` beside them. It draws the steps down the left (identified, screened, full texts assessed, included) and what leaves at each step to the right (duplicates, those awaiting screening, the exclusions with their reasons), and refuses a flow whose counts do not add up. Run `counts --flow` through the same receipt route, with the ledger as input.

## Revision Patch

`paper.mjs anchor <draft.md>` writes `<draft>.blocks.json`: the draft's sha256 and its blocks (runs of non-blank lines, each top-level list item its own block, a fenced code block kept whole), each with an ID `B1`, `B2`…, its lines, sha256 and first words. A patch is JSON:

```json
{
  "base_sha256": "<the anchored draft's sha256, from the manifest>",
  "changes": [{ "block": "B12", "finding": "R7:3", "op": "replace", "text": "The revised paragraph." }]
}
```

`op` is `replace`, `delete` or `insert-after`; `finding` names the review finding the change answers, as the review report numbers it (`R7:3`); apply checks only that one is named. `paper.mjs apply` refuses a patch whose `base_sha256` is not the anchored draft's, a draft that changed since it was anchored, `--out` naming the draft itself, a block the manifest lacks, a change without a finding, and two edits of one block; it writes the revised draft and `<revised>.apply.json`, the base and result hashes and each change with its finding.
