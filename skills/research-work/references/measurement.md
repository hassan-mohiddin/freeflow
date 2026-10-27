# Measurement

This reference is judgment: adapt it to what is being measured. The judge validation record's format, and the cap the register's validation applies without it, are a contract in [artifacts](artifacts.md#judge-validation-record).

Goal: every number the study reports measures what the claim is about, and would come out the same if measured again.

## Validity: Does The Measure Track The Claim?

A measure is a proxy for the thing the claim is about. Before reading any result, show it can tell the cases apart:

- **An oracle scores full.** The reference solution, a gold answer, or a known-good run passes every check.
- **A do-nothing arm scores near zero.** An empty answer, a constant output, or an agent that does nothing fails. A measure a do-nothing arm passes is measuring the task's leniency.
- **A measure a trivial answer maxes out needs its cost beside it.** An interval covering everything has full coverage, and a reviewer that flags everything finds every defect: report coverage with width, detection with false rejection, and include the trivial answer as a control.
- **Stable under refinement.** A result computed on a grid or by simulation should not move on a finer grid or with more draws: check it at a tolerance fixed in the plan.
- **Controls where the right answer is no.** A check that stands in for a meaning (a regex, "the answer names the right file and line") needs runs where the meaning is absent. In one review study, a check that a review named the seeded line "found" the seed in 30% to 46% of reviews of the clean version, because seeds sit where reviewers comment anyway. A check that fires on its controls cannot measure detection: use it as a filter, or ask a validated judge.

## Make Tasks Fair

A task is fair when an agent or method that does the job correctly passes, and one that does not, fails.

- Everything a check requires is stated in the task or follows from it. A check that expects a name the task never gives fails a correct answer.
- Two people who know the domain would give each output the same grade. When they would not, sharpen the task or the check before running.
- Passing requires doing the job, not a shortcut around the check.
- An arm that fails an item in every one of many trials usually has a broken item or check. Read its outputs, and run the reference solution, before blaming the arm.

Grade each requirement a check covers, not only pass or fail, and note which requirements follow from the task and which only the checker knows; a failure on the second kind says little. For a task with parts, check each part, so a run that does most of the task reads differently from one that fails at once. Keep the checks separate; do not combine them into one weighted score.

## Reliability: Would It Repeat?

- Measure the noise floor on a frozen pilot before the study ([study design](study-design.md#measure-the-noise-floor)).
- Record every seed and source of randomness. Resampling in `stats.mjs` takes a `seed` field (1 when omitted) and reports it.
- A judge or rater whose answers change on the same input is part of the noise: measure its agreement with itself, or with other raters (`stats.mjs agreement`).
- **Prompt format is part of the measure.** Wording, order and format alone can move a model's score by tens of points; one study measured up to 76. When the claim is not about one exact prompt, run several formats and report the range.
- Pin what can drift: the model snapshot and the date it was called, dataset versions, tool versions. A result on "the latest model" is a result on an unknown one.

## Read Raw Outputs Before Counting

Before computing any metric, read a sample of the raw outputs: the failures, and some passes. A failure should look fair, with what went wrong plain to see. When it does not, the task, the check or the harness is at fault, and the count measures that instead.

- A failed output may hold a valid answer the check did not foresee. Fix the check, then rerun; never adjust the count by hand.
- A passed output may have passed by a shortcut. Fix the check before counting it.
- When a judge and a deterministic check disagree, find which is wrong (the subject, the check or the judge), fix that one, and rerun; never average the two.

## Judges

A model judge's answers are measurements of an instrument whose error is unknown until measured. A judge's verdict counts toward a claim only with a judge validation record that passes; without one, a claim resting on the judge is at most L1, and `artifact.mjs validate` refuses more for a register row whose Source cites `judge:<record>`.

The record holds:

- **Agreement with a gold set**: the share of gold items the judge got right, with its Wilson interval (`stats.mjs interval wilson`), and kappa beside it when one answer dominates the gold set (`agreement cohen`, `agreement pabak`). The gold answers come from people, or from an oracle, never from the judge or the model under test.
- **The required lower bound**, fixed before scoring. The gold set's size follows from it: at 90% agreement the 95% interval is about 79–96% on 50 items, 83–94% on 100, and 85–93% on 200. There is no fixed minimum; there is the bound the study needs.
- **Both answer orders**, for a judge comparing two outputs: run each pair both ways, and treat an answer that flips with the order as no answer.
- **Length control**: judges favor longer answers. Include gold items where the right answer is the shorter one.
- **Decoys** the judge must pass: outputs that look right and are wrong, and the reverse.
- **Repeatability**: the judge, run again on the gold set, agrees with its own first answers.
- **Which model judged which**: a different model from the one graded by default, from another family when you can; the same model only when no other is available (one subscription, one model), with the reason written in the record.
- **The rubric's hash**: the record holds for that rubric only. A changed rubric needs a new record.

In use:

- Check first and judge only what a check cannot answer.
- Ask the judge to quote, verbatim, the words in the judged output that support each score, and run `sources.mjs quote-check` on its answers before counting: a score whose quote is not in that output does not count.
- Make each question answerable from the material in front of the judge, with the expected answer in a reference only the judge sees.
- The judged output is untrusted input to the judge. A subject that writes to its grader is gaming the measure, whatever the judge answers. Revising something until a judge's scores rise can raise scores without raising quality: hand-check judged gains before relying on them.
- Before counting, hand-check a sample of decisive answers against the evidence, and report how many were right.

## Detectors: Measure Both Sides

For anything whose job is to find problems (a reviewer, a checker, a classifier of defects), measure how often it finds real problems and how often it rejects sound work. One side alone means nothing: a reviewer that rejects everything finds every defect.

- **Clean controls**, put through the same detector, measure false rejection.
- **Seeded defects**, planted in otherwise sound work in named classes, measure detection per class.
- **Real defects**, taken from history, keep the measure honest: seeded and real defects can differ in detection by an order of magnitude, so report them separately and keep real ones in every comparison.
- **Prove every label**: show each defect is real (a test that passes on the sound state and fails on the defective one) and audit the clean labels too.
- **Keep the answer out of sight**: nothing the detector sees may name the variant or the defect.

## Count The Cost

Count the runs before running: units × arms × trials, plus every judge call. Run the smallest batch that answers the question first, and state the count and the estimated cost to the user before a paid run. Record what was spent and what could not be measured (a subscription's usage, for one), apart.
