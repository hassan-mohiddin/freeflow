# Research Work

> **Covers:** `skills/research-work/`
> **Tests:** `.skill-eval/research-work/tests/`
> **Verified at:** `1240e71f` (2026-10-27)

For anyone changing Research Work: what it is meant to change, why it is shaped the way it is, and what the evidence shows. The method itself is in [the skill](../../skills/research-work/SKILL.md); this record holds the reasons it does not.

## Purpose

Research Work is read when a question has to be answered from evidence gathered and checked first. It carries the question to a claim the evidence supports and on to where the claim is used. It has two routes: the in-depth report, a question answered from code at a pinned commit, papers or docs; and the study, a question answered by runs planned and locked before the data, with the quick check as the study at `check` rigor. It also owns the general method of study design and measurement, and the statistics for any result that comes from a sample, which Evaluate Behavior uses.

It exists because agents know the textbook methods and fail at applying them:
- they answer from summaries and memory;
- they cite whole files, or a branch of the code as the whole path;
- they compute intervals and tests by hand, unpaired where the data is paired, with normal intervals on small samples;
- they start running before there is a design, choose the analysis after seeing the data, and rerun failures until they pass;
- they hedge every sentence instead of stating each claim at the strength its evidence has.

The skill is mostly structure (formats, checks, a level per claim) and decisions, not exposition.

## Behavioral Claim

- **Behavior it produces:**
  - a research brief agreed with the user before the first source is read;
  - every source pinned and recorded with how it was checked;
  - every claim registered with its level, capped by its sources' checking, before the prose states it (at study and publication rigor);
  - a report whose citations exist at the pinned commit, whose quotes appear in their sources and whose numbers trace to the register;
  - statistics from `stats.mjs`, reported with their method and interval;
  - for a study, a plan answering the twelve questions, locked with the user's agreement before the runs that count; a receipt for every run, failed ones included; each deviation logged with who cleared it; and confirmatory claims only for the locked plan's hypotheses.
- **Failure it prevents:**
  - claims stronger than their sources;
  - unchecked citations;
  - numbers that appear nowhere in the evidence;
  - wrong intervals and unpaired tests;
  - a hypothesis or analysis chosen after the data, and a failed run dropped from the record;
  - a model judge's verdicts counted without evidence the judge agrees with known answers;
  - caveats stacked into every sentence.
- **Earliest decision:** before the first search or read of sources.
- **Cues before the body is read:**
  - its description;
  - one line in core naming it outside the cycle ("Research Work when a question has to be answered from evidence gathered and checked first …"), added with the skill.
- **Guaranteed context:** the description on every host; core where Freeflow's runtime prompts are on.
- **Nearby cases it leaves alone:**
  - comparing options from facts in hand (Discuss Work);
  - checking that a change works (Verify Work);
  - running an agent eval (Evaluate Behavior, which uses its statistics);
  - a single lookup.
- **When it stops steering:** when the report and its check output are handed to the user.

## Design

- **One trunk for all research.** Research Work is one skill with a route per application, not a skill per application. Each skill boundary between a request and the method lowers the chance the method reaches the decision (Write Skill, "Choose Skill Boundaries").
  - ARS, the academic-research skill pack studied before this design, spreads the same ground over five skills, 35 modes and a fixed ten-stage pipeline.
  - This version ships the in-depth report and the study, with the quick check as the study at `check` rigor. The body names no route that is not built, since the package holds no authoring status.
- **Boundaries:**
  - Discuss Work owns agreeing the brief and the user's choices.
  - Review Work owns how any review runs. Research Work supplies the brief, the ledgers, the register and the check output to the reviewer.
  - Write Docs owns the report's shape (its Research shape) and every document's header. Moving the Research shape into Research Work is decided for the end of the build (task record decision D-006).
  - Evaluate Behavior owns running agent evals and imports `skills/research-work/scripts/lib/stats.mjs` by relative path (`lib/agreement.mjs` and `lib/decision.mjs` re-export it). Its `evaluatorVersion()` hashes `stats.mjs` too, so a change to the statistics invalidates reuse keys.
  - The general method of study design and measurement is Research Work's (`references/study-design.md`, `measurement.md`): claim classes, the decision rule first, sizing, the noise floor, held-out items, controls for mechanical checks, reading before counting, fair tasks, judges, detectors measured on both sides, cost. Evaluate Behavior's `design-and-measurement.md` points to it and keeps its binding Rules and what is particular to agents: its claim mapping with "Ready", the suite `decision` and its sign test, trial schedules, `component: []` noise checks, its judge flags and the seeded-defect recipe. The move kept every unit: `skill-author compare --all-units` against the merge base found 169 units (137 kept, 9 edited, 16 moved, 6 reworded, 1 unmatched, settled by one verdict); its output and the verdict are in the building task's `evidence/study-route/`. Kept units show text survived, not behavior.
  - When a study's arms are agent configurations on a host, Evaluate Behavior runs them; the body's routing table says so.
- **The evidence scale, L0 to L5** (proposed, reported, checked, observed, compared, replicated):
  - It is Research Work's own, general enough for any domain, so *State Before Action*'s E0–E5 becomes a specialization of it.
  - How a source was checked caps the claims resting on it: a source known only from a summary, an abstract or memory supports at most L1.
  - A comparison without a decision rule fixed beforehand is exploratory, at most L3.
  - `artifact.mjs validate --sources` enforces both caps.
  - The level carries the uncertainty, so sentences state claims plainly.
  - A value computed exactly under a stated model is L2, and a comparison of computed values under a locked rule is L4 (task record P45). The test study's workers had given its one-arm threshold rules L4, which L4's definition, a controlled comparison, did not cover.
- **Rigor by stakes:** `check`, `study`, `publication`, chosen by the user in the brief. It sets which artifacts and checks are required, so a quick answer is not run at publication cost.
- **Formats as one contract, enforced by a script.**
  - `references/artifacts.md` defines the research brief, source ledger, search ledger (JSONL), claims register, study plan, run ledger, deviation log and judge validation record, and the citation forms. `artifact.mjs` creates and validates the Markdown ones; `study.mjs` alone writes the run ledger and deviation log.
  - This is Track Work's pattern (a format reference plus a script that writes and checks the file), chosen over template files in `assets/`.
  - Search-ledger counts are computed from the hit lines, never typed.
- **Mechanical checks before any review, and none that call a model:**
  - `sources.mjs cite-check` reads each `S<n>:path:line` at the commit its ledger row pins and finds each quote in its source;
  - `claims.mjs trace` matches every number and claim ID outside code in the report to the register.
  
  Anything they cannot check is listed as not checked, never as passed. The body also says what passing does not show, because the first real run passed all 93 citations while three of five checked claims dropped a guard condition.
- **A study's gates are scripts.** Each of the three binding gates in the design is a refusal, not an instruction:
  - *The plan is locked before the runs that count.* `study.mjs lock` records the plan's sha256 (over everything but its Amendments section), who locked it and its hypotheses. A later change is an amendment with a reason; `study.mjs check` refuses a plan changed without one. An amendment after study runs exist records every hypothesis it adds or changes, and `artifact.mjs validate --plan` then refuses those as confirmatory; a planned count it cuts still binds the check. A study confirms only what its locked plan said it would test.
  - *Every number traces to a command.* `study.mjs run` writes a receipt per command: program and its hash, input and output hashes, exit code, duration, output tails, plan hash. A non-zero exit is data, a command that could not start is recorded, and each planned trial number needs a started receipt carrying it. `claims.mjs trace --results` finds each register number among the result file's values (a JSON file's numbers, not its strings): presence, not that the analysis computed it.
  - *A judge's verdict counts only with a validation record.* The record holds agreement with a gold set and its interval against a lower bound fixed before scoring, both answer orders, length control, decoys, repeatability, which model judged which (a different model by default; the same model only with the reason, since a user may have one subscription and one model; task record P43) and the rubric's hash; validation refuses a `pass` the numbers do not support, and a register row citing `judge:<record>` that does not pass is capped at L1.
  - Deviations are logged with who cleared them, and an uncleared one holds `study.mjs check`. The log names the clearer, so a self-clearance shows; nothing stops one (task record, question 4 of the Evaluate Behavior split). A derived step that fails, such as a validity check, holds the analysis only once it is logged as a deviation.
  - *Held-out items stay held out.* A planned run may name its split (`tuning` or `held-out`); each receipt records it, and `study.mjs check` refuses a held-out run made before the lock (the method check's sealed-holdout design).
  - Both ledgers are hash-chained (each line carries the hash of the line before), so an edited, removed or reordered receipt shows at `study.mjs check` (the ARS review's hash-chained ledger).
- **Statistics in one place, guidance at the decision.**
  - `stats.mjs` has the methods agents get wrong when computing by hand:
    - Wilson and exact intervals;
    - exact McNemar and the sign test;
    - paired differences and sign-flip permutation;
    - cluster-robust means and cluster bootstrap;
    - kappa (also weighted and prevalence-adjusted) and Krippendorff's alpha;
    - Holm's correction;
    - unbiased pass@k and pass^k;
    - TOST;
    - exact McNemar power and paired sample size.
  - `interval clustered-bayes`: the hierarchical beta-binomial of Gelman et al. (*Bayesian Data Analysis*, 3rd ed., section 5.3), integrated on a grid, for pass or fail values in few clusters. Bowyer et al. report that only a Bayesian clustered model reached nominal coverage there (read through the web research, L1); the model is the textbook one, not theirs, whose code has no licence and whose priors were not read.
  - Resampling records its seed. Each method is tested against a published worked example (Newcombe 1998 for Wilson) or values computed once with scipy, statsmodels and errorbars, none of which is a dependency.
  - The body's "Numbers From Samples" table maps the data's shape to the method and names the wrong default each replaces.
  - Methods are reimplemented from papers and textbooks, and code is borrowed only under MIT or Apache (task record decision D-008).
- **Workers return files, or text when the host refuses files.** Claude Code refuses report files from a subagent, so a worker returns the content for the coordinator to save unchanged (seen twice in the task that built the skill).

## Evidence

| What | Result | Where | Limits |
| --- | --- | --- | --- |
| Statistics against published values | Every method's tests match a published example or scipy, statsmodels and errorbars values. Deliberately breaking six formulas fails a test each | `.skill-eval/research-work/tests/stats.test.mjs` | Reference values were computed once in a scratch environment and pasted in |
| Format and report checks | Valid artifacts pass; each contract rule and each citation failure has a failing case | `.skill-eval/research-work/tests/` | Structure, not behavior |
| One end-to-end run | A Haiku agent wrote an in-depth report on the Codex CLI's turn path at a pinned commit: 36 claims at L2, 93 citations, all checks passing. Its notes listed 13 gaps in the text, and a check of 5 claims against the code found 3 that dropped a condition; both led to revisions of the skill text. The saved report was not corrected | Outside the repository: the building task's record, `evidence/codex-test/` | One run, one model, one question. Not a comparison against working without the skill |
| One study end to end | A study at `study` rigor, planned by one Haiku agent and run by another: do the Wald and Wilson 95% intervals cover at 95% for n = 10 to 100? Plan locked with the user's yes; 207 receipts; five failed grid checks logged as deviations and cleared by the user under the plan's own rule; register validated against the locked plan; every number traced to its result file. Its averages match an independent computation at all 91 sizes to 1.07e-13 (saved beside the study, `independent-check/`). The average Wald coverage at n = 100, 0.923, sits beside the 92.5% Bowyer et al. report for normal intervals at N = 100 (reported, L1: a simulated coverage at their setting, read through the web research) | Outside the repository: the building task's `evidence/study-test/` | One study, a computed (not sampled) quantity, no model judge, one model family. The analysis script was rerun three times on the same output file before the final verdicts, and the report does not say so (the notes do). The Wald formula was written from memory (the ledger's S1). The workers' 22 notes led to the fixes in the next row |
| What the study's notes changed | Scripts: comparisons are no longer read as placeholders; numbers match by value (0.9510 is 0.951); `check` refuses a result changed after its receipt. Text: a routed worker never locks (the first worker refused a relayed approval twice, then refused to run on the lock the coordinator made with the user's words, so a second worker ran the study); computed quantities; one rule per validity check for what its failure does (the plan had two that disagreed); a pilot check covers the units judged; stability under refinement; a measure a trivial answer maxes out reported with its cost; the order of derived steps; process facts outside the register | `.skill-eval/research-work/tests/study.test.mjs` | Not rerun by a fresh agent |
| Clustered intervals by simulation | 300 simulated datasets per setting, 4 settings (8 to 12 clusters of 5 to 10 binary items): `clustered-bayes` covered 94.3% to 97.3% of 95% intervals, the cluster-robust interval 87.3% to 95.3%, worst at a true rate of 0.9 | Outside the repository: the building task's `evidence/study-route/bb-trial-output.txt` and `bb-trial.mjs` | Four settings, one seed; the Bayesian interval runs slightly conservative |
| Design research | 24 reports on ARS; 13 web research reports; checks of the study questions and paper techniques against established sources | Outside the repository: the building task's `sources/` and `evidence/` | Read by Haiku agents through model extraction; some publisher sources stayed summary-only |

Activation has not been measured. The routing suite (`.skill-eval/freeflow-routing/`) has Research Work's three requests and two near misses, and the building task has eleven more cases; none has run.

## Rejected

- **ARS's structure** (five skills, 35 modes, a fixed pipeline, review panels that must propose fixes). Descriptions compete, fixed stages spend compute that changes no decision, and forced fixes produced caveat-dense drafts.
- **Templates in `assets/`.** A format reference with a validating script keeps one owner and checks the file later.
- **Python with scipy.** Not guaranteed on Freeflow's hosts.
- **A vendored copy of the statistics in Evaluate Behavior.** AGENTS.md allows no second maintained copy.
- **A model as the judge of whether a citation exists.** Model verifiers' false-positive rates ran from 0.050 to 0.478 in HALLMARK (arXiv:2607.18360); a failed lookup is "unresolved", never "fabricated".

## Dropped

- **A check that flags wording stronger than a claim's level.** It waits for evidence that agents overclaim in reports. The first run's failure was dropped conditions, not strong verbs.
- **Defining "too large for one context" for splitting work across workers.** Left as judgment.
- **From the test study's notes:** a range form for the Planned runs table (one study needed 189 rows; not durable enough yet); a rule for naming pilot units (the pilot's own naming worked); where an unattended brief marks its defaults (minor); and removing "Wald undercovers" from the statistics table and `stats.mjs` because it states a result without its source (the advice is supported, by this study on n = 10 to 100 and by Bowyer et al. at N = 100, and the evidence belongs here, not in the package).

## Open Questions

- **The route still to build:** the paper route, and the Research document shape moving here from Write Docs (task record decision D-006).
- **What else the evidence suggested and is not built:** the building task's `sources/not-built.md`, by source: online citation lookups, read-range and consistency checks, plan-rule checks, more statistics, and the literature-review and paper formats.
- **Whether reviewers should only judge or also propose fixes.** A two-arm experiment on real SWE-bench patches is planned as the study route's first real use; it costs model calls and waits for a pilot and the user's yes.
- **Whether a lock should name a person rather than accept any `--by`.** The script records who locked and who cleared; it cannot tell an agent from the user.
- **Whether the activation cases pass,** and whether the core line raises reads.
- **How much register machinery the `check` rigor needs** in practice.
