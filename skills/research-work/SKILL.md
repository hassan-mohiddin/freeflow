---
name: research-work
description: "Use when a question has to be answered from evidence gathered and checked first: an in-depth report on a codebase, library, agent harness or tool; a survey or literature review of papers, docs or prior work; finding out what sources actually say before relying on them; a study or experiment whose plan is fixed before the data, or a quick check on about twenty tasks of whether a change helped; writing a paper from results with its figures, references and PDF, and answering its reviewers. Also use when citing code at a pinned commit, deciding how strong a claim's evidence is, checking that every number traces to its source or log, designing a measurement or a model judge, and computing statistics for a result (intervals, paired comparisons, clustered runs, rater agreement, pass@k, multiple comparisons, power). Comparing options from facts already in hand is Discuss Work's; checking whether a change works is Verify Work's."
---

# Research Work

Answer a question from evidence: agree what is being asked, gather and check the sources or run a study planned in advance, register what the evidence supports and how strongly, and report it so a reader can act on it and check it.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

| Situation | Go to |
| --- | --- |
| The question is vague, broad, a comparison, or a claim that something is new; or choosing how rigorous to be | [framing](references/framing.md) |
| Gathering sources: reading code at a pinned commit, searching papers or the web, judging a source, or splitting a large subject across worker agents | [investigation](references/investigation.md) |
| Turning findings into claims, choosing each claim's level, sources that conflict, an absence ("none found"), or writing the report from the register | [claims](references/claims.md) |
| Designing or running a study or a quick check: the twelve questions, the claim class, the decision rule, baselines, sample size, pilots, held-out items; locking the plan, receipts, deviations, amendments, raw data, the cost of runs | [study](references/study.md), with [study.mjs](scripts/study.mjs) |
| Whether a measure tracks the claim: validity, fair tasks, reliability, reading raw outputs, a model judge and its validation record, a detector | [measurement](references/measurement.md) |
| The arms are agent configurations run on a host: a skill, prompt, model or setting change | [Evaluate Behavior](../evaluate-behavior/SKILL.md) runs them and owns its suite decision rule; it computes with `stats.mjs` |
| Writing a paper from the register: the outline, abstract, figures, draft, references, one review, revision, the build to PDF or Word, and the rebuttal to its reviewers; a literature review's evidence table | [paper](references/paper.md), with [paper](scripts/paper.mjs) and [figure](scripts/figure.mjs) |
| Creating or checking a research brief, source ledger, search ledger, claims register, study plan, judge validation record, paper outline, rebuttal or evidence table | [artifacts](references/artifacts.md), with [artifact](scripts/artifact.mjs) |
| Checking a report before it goes out: each `S<n>:path:line` citation exists at its pinned commit, each quote appears in its source, every number and claim ID traces to the register | Run [sources](scripts/sources.mjs) `cite-check` and [claims](scripts/claims.mjs) `trace`, as Check The Report says |
| Checking that each of a judge's scores quotes the output it judged | Run [sources](scripts/sources.mjs) `quote-check`, as [measurement](references/measurement.md#judges) says |
| A result with numbers from a sample: an interval, a comparison, agreement between raters, pass@k, power | Numbers From Samples, below, and [stats](scripts/stats.mjs) |
| The report itself | The [Research Report](references/artifacts.md#research-report) shape |
| Agreeing the brief, or a choice the user owns comes up | [Discuss Work](../discuss-work/SKILL.md) |
| Reviewing the brief or the report | [Review Work](../review-work/SKILL.md) |

## Rules

- Agree the research brief with the user before the first search or read of sources: the question, who uses the answer, the claim sought, the scope and the rigor are the user's. When no one can answer (a routed worker, an unattended run), write the brief with your defaults and put it first in the report.
- Record how every source was checked, as the source ledger defines. Never present a source you know only from a summary, an abstract or memory as checked, and never give a claim a level above what its sources' checking allows.
- A lookup that finds nothing makes a source unresolved, not fabricated. Only an identifier that resolves to something else refutes it.
- At study or publication rigor, every claim the report makes is in the claims register before the prose states it, and the report goes out only after `artifact.mjs validate --sources`, `sources.mjs cite-check` and `claims.mjs trace` pass (for a study, with `--plan` and `--results`), or with each failure they report, and each item they could not check, listed in the report.
- Lock a study's plan with `study.mjs lock`, after the user agrees it, before the first run that counts; the agent the user talks to locks it, and a routed worker runs the plan already locked. A claim is confirmatory only as a confirmatory hypothesis of that locked plan; everything else is exploratory.
- Run every command that produces a study's data through `study.mjs run`. Never edit a raw output, drop a receipt, or clear a deviation that changes what the result can claim without the user.
- A model judge's verdicts count toward a claim only with a judge validation record that passes; without one, the claim is at most L1.
- Compute every statistic with `stats.mjs` when it offers the method, and report the method with its interval. Never compute one by hand from memory.
- Run the mechanical checks before any model review of the report.

## The Evidence Scale

Every claim gets one level. The level carries the uncertainty, so the report states the claim plainly at that level instead of hedging each sentence.

| Level | Name | Means | Write it as |
| --- | --- | --- | --- |
| L0 | Proposed | A hypothesis or a design, with no evidence yet | "we propose" |
| L1 | Reported | Someone claims it; not checked here | "X reports" |
| L2 | Checked | Checked against the primary source or mechanically: the paper opened, the code read at a pinned commit, a test run, a value computed exactly under a stated model | a plain statement of the fact |
| L3 | Observed | Seen in use, an uncontrolled observation, or one case | "we observed, in …" |
| L4 | Compared | A controlled comparison at a stated boundary, its decision rule fixed before the data; computed values compared under a locked rule count | "raises", "causes", or the bound stated plainly, on that boundary |
| L5 | Replicated | Holds across independent models, tasks, hosts, groups or sources | a general statement, with its range |

- How a source was checked caps the claim: a source known only from a summary, an abstract or memory supports at most L1, whatever study stands behind it.
- A comparison whose decision rule was not fixed before the data is exploratory, at most L3.
- A field may split a level into finer steps; it never changes what the level means.

## Rigor

The user picks the rigor in the brief; it decides what the work must produce.

| Rigor | For | Produces |
| --- | --- | --- |
| `check` | A quick answer for one decision | A brief and a source ledger; the answer cites its sources with levels. A quick check adds its five-question plan and the paired result |
| `study` | A result others will act on | Brief, source ledger, search ledger when searching, claims register, the report, all checks; a study adds its locked plan, run ledger and deviation log |
| `publication` | A result others will scrutinize | As study, with every source opened or run, and review through Review Work |

Default to `study` when the user does not say. Raise it when the answer will be published or decides something costly to reverse; lower it when the answer feeds one reversible choice.

## The In-Depth Report

Goal: a report that answers the brief's question, where every claim can be traced to a source and every source says how it was checked.

1. **Frame.** Create the brief with `artifact.mjs init research-brief` and agree it with the user through Discuss Work. A question someone else could not answer as written is not ready: read [framing](references/framing.md).
2. **Survey.** Pin each source before relying on it: a repository at a commit, a paper by DOI or arXiv ID, a page by URL and access date. Read the primary source, record it in the source ledger as you go, and log searches in the search ledger. Read code in dependency order and cite it as `S<n>:path:line`. For a subject too large to read in one context, split it across workers as [investigation](references/investigation.md) says, and decide from their returns yourself.
3. **Conclude.** Register each claim with its numbers, sources, level, kind, scope and limit, and settle conflicts between sources as [claims](references/claims.md) says. What you looked for and did not find is a finding too, with the search that looked.
4. **Report.** Write the report in the Research Report shape: the answer first, each finding citing its claim IDs, strength stated once from the levels, limits in one place. If the host will not let you write the report file (some refuse files from a subagent), return the report's full text instead, so whoever routed the work can save it unchanged and run the checks; run them yourself first on the text, reading it from `/dev/stdin`.
5. **Check.** Run the checks below, fix what they report, and run them again.
6. **Review.** At publication rigor, or when the user asks, review the report through Review Work's artifact review; give the reviewer the brief, the ledgers, the register and the check output, not your summary.

Stop when the report and its checks are handed to the user, with what stayed unresolved, unchecked or out of scope.

## A Study

Goal: a result decided by a rule fixed before the data, where every number traces to a command that produced it.

1. **Frame.** Agree the brief as for a report. The claim sought names what the study tests.
2. **Survey.** Find what is already known at the depth the design needs: prior results, the baseline in use, a measure that already exists.
3. **Design.** Create the plan with `artifact.mjs init study-plan --rigor <rigor>` and answer its questions as [study design](references/study.md) says, with each hypothesis's decision rule. Pilot to check the measure ([measurement](references/measurement.md)) and its cost. Agree the plan with the user through Discuss Work, then lock it.
4. **Run.** Run every step through `study.mjs run`, log deviations as they happen, and ask before any paid run, as [running](references/study.md#running-the-study) says.
5. **Analyze.** Run `study.mjs check`, read the raw outputs, then apply the plan's decision rule with `stats.mjs`.
6. **Conclude.** Register each claim with the result files its numbers come from; a judged claim cites its judge's record.
7. **Report, check and review** as for a report, with the study checks below.

A quick check is this route at `check` rigor: five questions, about twenty paired tasks, the paired interval ([study design](references/study.md#the-quick-check)).

## A Paper

Goal: a paper whose one message a result could contradict and whose every number traces to the register.

1. **Register.** Start from a study's register, or register what existing results show, as for a report. Which claims the paper makes is the user's choice. A new project can start from `artifact.mjs init project <folder>`.
2. **Outline.** Create it with `artifact.mjs init paper-outline`: the proposition, the contributions with their claim IDs, one sentence per planned paragraph, the figures with their data, the objections and where each is answered. Validate it with `artifact.mjs validate <outline.md>`, then agree the outline and the abstract with the user; when no one can answer, take your defaults and list them first in the hand-over, as for the brief.
3. **Figures and draft.** Draw each figure from its data with `figure.mjs` through a receipt, and put the receipt in the outline. Draft from the outline, then run the checks below (`trace` with `--results` when the register comes from a study, `cite-check` when the draft cites code as `S<n>:path:line` or quotes) and `claims.mjs draft-check`, which checks `[@S<n>]` citations against the ledger.
4. **Review once** through Review Work, then revise by patch with `paper.mjs anchor` and `apply`, naming the finding each change answers, as [paper](references/paper.md) says.
5. **Build and submit.** Make `refs.bib` with `sources.mjs bib`, build with `paper.mjs build --venue`, and check the PDF with `paper.mjs check-pdf`. Answer the venue's reviewers in a rebuttal ledger (`artifact.mjs init rebuttal`); submission is the user's.

## Check The Report

```text
node <research-work-directory>/scripts/artifact.mjs validate <claims.md> --sources <sources.md> [--plan <plan.md>]
node <research-work-directory>/scripts/sources.mjs cite-check <report.md> --ledger <sources.md> [--repo <name>=<clone>]... [--copy S<n>=<saved file>]...
node <research-work-directory>/scripts/claims.mjs trace <report.md> --register <claims.md> [--results]
```

- `artifact.mjs validate` refuses a register whose sources are missing or refuted, or whose levels exceed their sources' checking; with `--plan`, a confirmatory claim the locked plan does not hold as a confirmatory hypothesis; and a claim above L1 resting on a judge record that does not pass.
- `cite-check` reads each cited file at the commit pinned in the ledger, using a local clone you name, and finds each quote in a saved copy of its source. Anything it could not check, it lists as not checked, never as passed. It exits 0 when nothing failed, so read its summary: the check passes only with 0 failed and 0 not checked.
- `trace` lists every number and claim ID in the report that the register does not support. It reads the report by paragraph, list item, table row and heading, and a number passes only when the same one cites the claim it comes from. Every digit outside code counts, so write a design constant (a grid spacing, a seed) in words or put it in its claim's Numbers. It skips code spans and blocks, so a number the report states belongs outside backticks. With `--results`, it also finds each register number in the result file or log its Source names (a JSON file's numeric values only). That shows the number is there, not that the analysis computed it; it passes only with 0 problems and 0 rows not checked.

Passing checks show that each cited range exists and each number is registered, not that a range shows its claim. Read the lines a key claim rests on again before handing the report over: the common failure is a claim that is true on the path you read and drops the condition that selects that path.

## Numbers From Samples

When a result comes from a sample of items, runs or raters, compute it with `stats.mjs` (`node <research-work-directory>/scripts/stats.mjs --help` lists the methods) and report the estimate with its interval and method.

| The data | Use | Not |
| --- | --- | --- |
| A pass rate on under a few hundred items | `interval wilson` | a normal (Wald) interval, which undercovers there |
| Two arms on the same items, pass or fail | `paired mcnemar` on the items where the arms disagree | two separate rates compared by eye |
| Two arms on the same items, a score | `paired difference`, or `paired permutation` for few items | an unpaired comparison |
| Several runs of each task, or items grouped by source | `interval clustered` or `interval bootstrap` with clusters; `interval clustered-bayes` for pass or fail values with few clusters | counting runs as independent items |
| Agreement between two raters | `agreement cohen`, with `agreement pabak` when one answer dominates; `agreement weighted` on an ordered scale | raw percent agreement alone |
| Several planned comparisons | `correct holm` | reporting each p value alone |
| pass@k or pass^k from n runs per task | `passk task` or `passk suite` | the share of runs that passed |
| How many items a comparison needs | `power mcnemar-cases` or `power paired-cases`, before running | deciding the count after seeing results |

"No significant difference" is not "no difference": say what the interval rules out, or test equivalence with `tost paired` against bounds set in advance.
