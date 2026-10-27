---
name: research-work
description: "Use when a question has to be answered from evidence gathered and checked first: an in-depth report on a codebase, library, agent harness or tool; a survey or literature review of papers, docs or prior work; finding out what sources actually say before relying on them. Also use when citing code at a pinned commit, deciding how strong a claim's evidence is, checking that every number in a report traces to its source, and computing statistics for a result (intervals, paired comparisons, clustered runs, rater agreement, pass@k, multiple comparisons, power). Comparing options from facts already in hand is Discuss Work's; checking whether a change works is Verify Work's."
---

# Research Work

Answer a question from evidence: agree what is being asked, gather and check the sources, register what they support and how strongly, and report it so a reader can act on it and check it.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

| Situation | Go to |
| --- | --- |
| The question is vague, broad, a comparison, or a claim that something is new; or choosing how rigorous to be | [framing](references/framing.md) |
| Gathering sources: reading code at a pinned commit, searching papers or the web, judging a source, or splitting a large subject across worker agents | [investigation](references/investigation.md) |
| Turning findings into claims, choosing each claim's level, sources that conflict, an absence ("none found"), or writing the report from the register | [claims](references/claims.md) |
| Creating or checking a research brief, source ledger, search ledger or claims register | [artifacts](references/artifacts.md), with [artifact](scripts/artifact.mjs) |
| Checking that each `S<n>:path:line` citation exists at its pinned commit and each quote appears in its source | Run [sources](scripts/sources.mjs) `cite-check`, as Check The Report says |
| Checking that every number and claim ID in a draft traces to the claims register | Run [claims](scripts/claims.mjs) `trace`, as Check The Report says |
| A result with numbers from a sample: an interval, a comparison, agreement between raters, pass@k, power | Numbers From Samples, below, and [stats](scripts/stats.mjs) |
| The report itself | Write Docs' [Research](../write-docs/references/spec-and-plan-shapes.md#research) shape |
| Agreeing the brief, or a choice the user owns comes up | [Discuss Work](../discuss-work/SKILL.md) |
| Reviewing the brief or the report | [Review Work](../review-work/SKILL.md) |

## Rules

- Agree the research brief with the user before the first search or read of sources: the question, who uses the answer, the claim sought, the scope and the rigor are the user's. When no one can answer (a routed worker, an unattended run), write the brief with your defaults and put it first in the report.
- Record how every source was checked, as the source ledger defines. Never present a source you know only from a summary, an abstract or memory as checked, and never give a claim a level above what its sources' checking allows.
- A lookup that finds nothing makes a source unresolved, not fabricated. Only an identifier that resolves to something else refutes it.
- At study or publication rigor, every claim the report makes is in the claims register before the prose states it, and the report goes out only after `artifact.mjs validate --sources`, `sources.mjs cite-check` and `claims.mjs trace` pass, or with each failure they report listed in the report.
- Compute every statistic with `stats.mjs` when it offers the method, and report the method with its interval. Never compute one by hand from memory.
- Run the mechanical checks before any model review of the report.

## The Evidence Scale

Every claim gets one level. The level carries the uncertainty, so the report states the claim plainly at that level instead of hedging each sentence.

| Level | Name | Means | Write it as |
| --- | --- | --- | --- |
| L0 | Proposed | A hypothesis or a design, with no evidence yet | "we propose" |
| L1 | Reported | Someone claims it; not checked here | "X reports" |
| L2 | Checked | Checked against the primary source or mechanically: the paper opened, the code read at a pinned commit, a test run | a plain statement of the fact |
| L3 | Observed | Seen in use, an uncontrolled observation, or one case | "we observed, in …" |
| L4 | Compared | A controlled comparison at a stated boundary, its decision rule fixed before the data | "raises", "causes", on that boundary |
| L5 | Replicated | Holds across independent models, tasks, hosts, groups or sources | a general statement, with its range |

- How a source was checked caps the claim: a source known only from a summary, an abstract or memory supports at most L1, whatever study stands behind it.
- A comparison whose decision rule was not fixed before the data is exploratory, at most L3.
- A field may split a level into finer steps; it never changes what the level means.

## Rigor

The user picks the rigor in the brief; it decides what the work must produce.

| Rigor | For | Produces |
| --- | --- | --- |
| `check` | A quick answer for one decision | A brief and a source ledger; the answer cites its sources with levels |
| `study` | A result others will act on | Brief, source ledger, search ledger when searching, claims register, the report, all checks |
| `publication` | A result others will scrutinize | As study, with every source opened or run, and review through Review Work |

Default to `study` when the user does not say. Raise it when the answer will be published or decides something costly to reverse; lower it when the answer feeds one reversible choice.

## The In-Depth Report

Goal: a report that answers the brief's question, where every claim can be traced to a source and every source says how it was checked.

1. **Frame.** Create the brief with `artifact.mjs init research-brief` and agree it with the user through Discuss Work. A question someone else could not answer as written is not ready: read [framing](references/framing.md).
2. **Survey.** Pin each source before relying on it: a repository at a commit, a paper by DOI or arXiv ID, a page by URL and access date. Read the primary source, record it in the source ledger as you go, and log searches in the search ledger. Read code in dependency order and cite it as `S<n>:path:line`. For a subject too large to read in one context, split it across workers as [investigation](references/investigation.md) says, and decide from their returns yourself.
3. **Conclude.** Register each claim with its numbers, sources, level, kind, scope and limit, and settle conflicts between sources as [claims](references/claims.md) says. What you looked for and did not find is a finding too, with the search that looked.
4. **Report.** Write the report in Write Docs' Research shape: the answer first, each finding citing its claim IDs, strength stated once from the levels, limits in one place. If the host will not let you write the report file (some refuse files from a subagent), return the report's full text instead, so whoever routed the work can save it unchanged and run the checks.
5. **Check.** Run the checks below, fix what they report, and run them again.
6. **Review.** At publication rigor, or when the user asks, review the report through Review Work's artifact review; give the reviewer the brief, the ledgers, the register and the check output, not your summary.

Stop when the report and its checks are handed to the user, with what stayed unresolved, unchecked or out of scope.

## Check The Report

```text
node <research-work-directory>/scripts/artifact.mjs validate <claims.md> --sources <sources.md>
node <research-work-directory>/scripts/sources.mjs cite-check <report.md> --ledger <sources.md> [--repo <name>=<clone>]... [--copy S<n>=<saved file>]...
node <research-work-directory>/scripts/claims.mjs trace <report.md> --register <claims.md>
```

- `artifact.mjs validate` refuses a register whose sources are missing or refuted, or whose levels exceed their sources' checking.
- `cite-check` reads each cited file at the commit pinned in the ledger, using a local clone you name, and finds each quote in a saved copy of its source. Anything it could not check, it lists as not checked, never as passed.
- `trace` lists every number and claim ID in the report that the register does not support.

Passing checks show that each cited range exists and each number is registered, not that a range shows its claim. Read the lines a key claim rests on again before handing the report over: the common failure is a claim that is true on the path you read and drops the condition that selects that path.

## Numbers From Samples

When a result comes from a sample of items, runs or raters, compute it with `stats.mjs` (`node <research-work-directory>/scripts/stats.mjs --help` lists the methods) and report the estimate with its interval and method.

| The data | Use | Not |
| --- | --- | --- |
| A pass rate on under a few hundred items | `interval wilson` | a normal (Wald) interval, which undercovers there |
| Two arms on the same items, pass or fail | `paired mcnemar` on the items where the arms disagree | two separate rates compared by eye |
| Two arms on the same items, a score | `paired difference`, or `paired permutation` for few items | an unpaired comparison |
| Several runs of each task, or items grouped by source | `interval clustered` or `interval bootstrap` with clusters | counting runs as independent items |
| Agreement between two raters | `agreement cohen`, with `agreement pabak` when one answer dominates; `agreement weighted` on an ordered scale | raw percent agreement alone |
| Several planned comparisons | `correct holm` | reporting each p value alone |
| pass@k or pass^k from n runs per task | `passk task` or `passk suite` | the share of runs that passed |
| How many items a comparison needs | `power mcnemar-cases` or `power paired-cases`, before running | deciding the count after seeing results |

"No significant difference" is not "no difference": say what the interval rules out, or test equivalence with `tost paired` against bounds set in advance.
