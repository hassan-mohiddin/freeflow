# Claims

This reference is judgment: adapt it to the findings. The claims register's columns and checks are a contract, defined in [artifacts](artifacts.md); the evidence scale is in [Research Work](../SKILL.md#the-evidence-scale).

Goal: the report says exactly what the evidence supports, once and plainly, and a reader can trace each statement to its source.

## One Claim Per Row

A claim is one statement that could be wrong. A claim about code names the condition that selects the path it describes (the policy, the flag, the platform, the model), or says it holds on every path; a branch read as the whole is the most common error in code reports. Split a sentence that bundles several ("the loop retries twice and logs each failure" is two claims) so each gets its own sources and level. Write the claim in the words the report will use, with every number it states in the Numbers column (`3 of 12`, `0.83 [0.79, 0.86]`), so the trace check can match the report against it.

## Choose The Level

Give each claim the highest level its evidence reaches, and no higher:

- **L1:** you have only someone's statement: a README, a vendor page, a paper's abstract, a search result, a worker's claim you did not check.
- **L2:** you checked it against the primary source: read the code at the pinned commit, opened the paper's method or table, ran a test that asserts it.
- **L3:** you saw it happen, once or in an uncontrolled way: ran the tool and watched its behavior, one case study, an observation in logs.
- **L4:** a controlled comparison at a stated boundary, with its decision rule fixed before the data. Reading or running alone never reaches L4.
- **L5:** it holds across independent replications: other models, tasks, groups or sources found the same.

Then apply the caps: `artifact.mjs validate --sources` refuses a level above what the sources' checking allows, and an exploratory claim above L3. Every source a row cites caps it, so cite only the sources the claim rests on; a weaker source that only agrees goes in Limit, not Source.

`Kind` is `confirmatory` only for a claim tested by a decision rule fixed before the data; everything a report finds while reading is `exploratory`.

## Scope And Limit

Every row says where the claim holds (`codex@1a2b3c4, the default config`, `ML-venue BibTeX, 2024`) and what it does not show (`not checked at runtime`, `one benchmark`). This is where the qualification lives, once, so the sentence in the report can be plain.

## Conflicts And Absences

- **Sources disagree:** state each source's exact claim, how each was checked, and which you rely on and why. Prefer the source checked more directly and pinned more exactly; between two at the same level, prefer the more recent version of the same artifact (a later commit, an erratum). Where you cannot settle it, register the conflict itself as the claim ("S3 and S5 disagree on …") and put it in Limits.
- **Several findings feed one conclusion:** the conclusion's level is the lowest level among the findings it needs, not the highest.
- **Nothing found:** an absence is a claim like any other, with the search that looked: "within the agent loop at this commit, no retry path exists (searched `retry`, `backoff`, every caller of `run_turn`)". Without the search, it is not a finding.
- **A worker's claim:** stays at L1 until you checked its citations; then it takes the level of what you checked.

Counter-arguments and caveats are not owed for their own sake. When you looked for evidence against a claim and found none, "none found within these searches" is a complete answer.

## Write The Report From The Register

Write the report in the [Research Report](artifacts.md#research-report) shape, drafted from the register rather than from memory:

- **Answer first,** in plain words, with its level.
- **Each finding cites its claim IDs** (`C3, C4`) and states the claim at its level: L2 as a plain fact, L3 as "we observed", L1 as "X reports". The level replaces hedging; do not attach a qualifier to every sentence.
- **Strength once.** When every finding has the same level, say so once in the Answer. Otherwise give each finding its level where the finding is stated, and nowhere else.
- **Process facts are not claims.** Which checks passed, the deviations and who cleared them, how the plan was locked: these go in Method and Limits, citing the claims they bear on, not in the register.
- **Limits in one place.** Collect the register's limits, the conflicts, what was out of scope and what was not followed into Limits. A limit stated once is honest; the same limit repeated in every section hides the answer.
- **Every number from the register.** Copy numbers from the Numbers column; never retype one from memory. Then run `claims.mjs trace`.
- **Recommendations are proposals** for the reader, who decides.

Answer the strongest objection a reader will raise where it arises, once, with the reason: either the evidence that settles it or the limit it marks. Do not add objections no reader would raise.

`claims.mjs trace` lists wording a claim's level may not support: "improves" or "causes" on a claim below L4, improvement beside a negative number, "the latest version" or a "current" claim with no date, version or commit. Rewrite the sentence at the claim's level, or keep it when the level supports it.

## What The Gate Runs

`research.mjs gate` runs each check below that its rigor requires or its file makes possible. A file that is present is always checked, and its failure fails the gate; a claims register or outline still as `init` wrote it counts as absent. A passed check's notes (what it did not check, or a warning) are printed beneath it: read each one.

| Check | Runs | Required at |
| --- | --- | --- |
| Brief and source ledger: `artifact.mjs validate` | always | every rigor |
| Every source opened or run: no ledger row checked from an `abstract`, a `summary-only` or `memory` | at publication | publication |
| Search ledger: `validate` | when it has lines | — |
| Study plan: `validate`, then `study.mjs check` | when there is a plan; a register with a confirmatory claim and no plan fails, since a confirmatory claim is a study's | — |
| Claims register: `validate --sources`, with `--plan` and `--search` when they exist | when it is filled in | study, publication |
| Report and paper: `sources.mjs cite-check`; `claims.mjs trace`, with `--results` when there is a plan | for each one present; cite-check that finds no citation has not run (a paper citing only `[@S<n>]` is checked by draft-check) | cite-check at every rigor; trace when there is a register, and at study and publication |
| Paper: its outline's `validate`; `claims.mjs draft-check` | with a paper | — |
| Citation support: `claims.mjs support-check`, on packets that still match the report and paper; a packet for every claim either cites with a code citation or quote, except those `--unsupported-ok C<n>,...` keeps out by your choice, which it lists as not checked | at publication, or when answers exist | publication |
| PDF: `paper.mjs check-pdf`, against the venue's `--max-pages`, `--max-words` and `--require <section>`; at publication, with none given, it is not checked | when one is built | a paper at publication |

- `artifact.mjs validate` refuses a register whose sources are missing or refuted, or whose levels exceed their sources' checking; a claim of absence (something first, new or never done) that cites no `search:Q<n>`, and with `--search` a query the ledger lacks; with `--plan`, a confirmatory claim the locked plan does not hold as a confirmatory hypothesis, and an analysis variant the plan has listed that no row names as `variant V<n>`; and a claim above L1 resting on a judge record that does not pass.
- `cite-check` reads each cited file at the commit pinned in the ledger, using a local clone you name, and finds each quote in a saved copy of its source. Anything it could not check, it lists as not checked, never as passed; the gate fails a check with 0 failed and any not checked.
- `trace` lists every number and claim ID in the report that the register does not support. It reads the report by paragraph, list item, table row and heading, and a number passes only when the same one cites the claim it comes from. Every digit outside code counts, so write a design constant (a grid spacing, a seed) in words or put it in its claim's Numbers. It skips code spans and blocks, so a number the report states belongs outside backticks. With `--results`, it also finds each register number in the result file or log its Source names (a JSON file's numeric values only). That shows the number is there, not that the analysis computed it; it passes only with 0 problems and 0 rows not checked.
- `trace` also fails a percentage that does not follow from the counts beside it ("12 of 40 (35%)"), and lists, without failing, wording a claim's level may not support, as [Write The Report From The Register](#write-the-report-from-the-register) says. Read each listed line; a listed word that the claim's level supports stays.

## Check That Citations Support Claims

Goal: each key claim says what its cited lines or passage actually show, conditions included.

A citation can exist, be read, and still not show its claim: the claim drops a condition, widens the scope, or states a number the source does not. Writers miss this in their own work, because they read the source with the claim in mind. So a separate reader, who sees only the claim and its evidence, answers for each:

1. `claims.mjs support <report.md> [<paper.md>] --register <claims.md> --ledger <sources.md> --repo <name>=<clone> --copy S<n>=<saved copy> --out reviews/support-packets.jsonl` writes one packet per claim the report cites with a code citation or a quote: the claim with its numbers, scope and limit, and only its evidence (the cited code with the lines around it and the lines that open its enclosing blocks, so a condition that selects the path shows; or the passage around a quote). A citation counts for the claims cited in its own sentence, or in the sentence before when its own cites none, so put each claim's citation beside it. `--only C3,C7` limits it to the key claims; at publication the gate then names every other claim cited with a code citation or quote, for you to add or keep out with `--unsupported-ok`. Given the paper too, a claim's packet holds what either cites for it. A cited claim with no code citation or quote is listed as not checked: quote the lines it rests on.
2. Give the packets file to a reader in a separate context, by default a different model from the writer's, as Review Work's [Judge Contract](../../review-work/references/evals-and-judges.md#judge-contract) says. Give it nothing else: not the report, not your view of the claim. It writes one answer per packet to a verdicts file (`reviews/support-verdicts.jsonl`, where the gate reads it), in the format [artifacts](artifacts.md#support-packets-and-verdicts) defines.
3. `claims.mjs support-check <verdicts.jsonl> --packets <packets.jsonl>` finds each answer's quote in its packet and counts the answers, k of n supported, with a Wilson interval.
4. Settle each partial or unsupported answer: correct the claim (its wording, scope or level) or its citation, and build the packets again (the gate refuses packets the report, register and sources no longer give); or, when the evidence shows the reader is wrong, add `"adjudication": "rejected: \"<four or more words of the packet's evidence>\" <why they show it>"` to that answer; a rejection that quotes nothing settles nothing. Report the rate and what was corrected in Method.

At publication rigor, check every claim the answer or the contributions rest on; below it, check the claims a costly decision rests on, or none. The reader's verdicts are not validated against a gold set: they find claims to re-read, and a `supported` answer does not raise a claim's level. The reader sees only what is cited, so a condition in code the claim does not cite stays invisible: cite the line where a value takes the form the claim states (where a flag is finally set, not where it is first assigned).
