# Measurement

Read this before a run whose result must support a rate or a comparison, when sizing cases and trials, or before reporting counts as a finding.

This reference is judgment: adapt it to the decision the result must support. Its binding statement on claims restates [Evaluate Behavior](../SKILL.md) Rules. The figures in it come from measured review-suite runs and are examples, not thresholds.

## Claim Classes

Name the strongest claim the result must support before building cases, and report the strongest one it reached, never a stronger one.

| Claim | Minimum evidence | Not enough |
| --- | --- | --- |
| **Can do X** | One complete run that shows X, with its transcript | — |
| **Does X at a rate on this suite** | Pass, fail and unavailable counts per check, case and trial, with the case and trial counts stated; pass^k at the stated k for behavior relied on every time | One run; pass@k alone for behavior relied on every time |
| **A beats B** | Paired runs of both arms on the same cases, and a decision rule and size fixed before the run | Fewer cases than declared; transitions such as fail-to-pass; unpaired runs; a rule chosen after seeing results |
| **Ready** | Held-out cases, real services, pinned models, and evidence at the claim's own boundary | Any of the above alone. Evaluate Behavior never claims it |

"The candidate identified the defect in 69 of 90 reviews, the baseline in 42" is a count. "The candidate is better" needs the rule.

## Fix The Decision Rule First

Before the run, write down:

- the measure, such as defects identified per review;
- the unit, which is the case: trials of one case are repeated draws of one question;
- the comparison and its method, with the method's assumptions;
- what counts as better, worse, or unresolved.

One method that respects the case as the unit: for each case, compare the arms over its trials and count the cases where the candidate did better, worse, or the same; read the split with a two-sided sign test, and report it beside the pooled counts. For example, 19 better, 5 worse and 6 equal gives p ≈ 0.007.

## Size Cases And Trials To The Decision

- **Few trials show little.** Three passes in three trials is consistent with a true pass rate near 0.3: the exact two-sided 95% lower bound is about 0.29.
- **pass^k and pass@k diverge.** At 75% per trial, all three of three trials succeed about 42% of the time, and at least one about 98%. Report pass^k for behavior a user relies on each time; pass@k fits only when a retry or a checker stands between the subject and the user.
- **Cases set what a comparison can detect.** A 20-point difference at 80% power needs roughly 62 to 93 cases per arm, depending on the base rate. A pilot of 20 or 30 cases detects only large effects; say so in its report.
- **Spend trials where a miss costs most.** Cases whose miss is the costlier error can run more trials than the rest, for example nine for known-issue cases and three for clean ones.
- **Fix the trial count before the run.** A three-trial look once suggested a drop in detection (80 against 74 of 90) that six trials did not confirm. Adding trials until a result looks right is selection.

## Expect Run-To-Run Noise

The same baseline commit accepted 31 of 45 correct changes in one run and 38 of 45 in the next. A difference smaller than that swing, between two single runs, is not a result.

- Run both arms in the same batch, so they share conditions.
- Pool every baseline run of the same commit, and compare a later candidate with all of them, not the most favorable.
- When a claim is close, run an A/A comparison, with the same commit in both arms; the gap it shows is the floor a real difference must clear.

## Hold Cases Out

- Fix the split before any case is built or run, by a stable rule such as every third case in hash order.
- Tune wording against the tuning cases only. Report held-out cases separately, and never tune against them.
- Never report the score of a set you selected on as the result: choosing the best of several candidates by their held-out score makes that score optimistic.
- Cases written by the author of the guidance under test, or by the model under test, are not independent of it.

## Control Mechanical Checks That Approximate Meaning

A deterministic check that stands in for a meaning, such as a regex or "the review names the right file and line", needs a control: run it where the right answer is no. In one review suite, a check that a review named the seeded line "found" the seed in 30% to 46% of reviews of the clean version, because seeds sit where reviewers comment anyway. A check that fires on its controls cannot measure detection. Use it as a filter, or ask a judge.

## Count Judge Answers With Care

A judge's answers are measurements. Follow Review Work's [Judge Contract](../../review-work/references/judge-contract.md), and in practice:

- Make each question answerable from the materials: name what to look for, such as the defect's location, expression and effect. Show a reply example with one entry per question; a one-entry example produced one-entry replies.
- Run `--swap`. When the two orders disagree, report a strict reading (yes in both orders) and a lenient one (yes in one order and no in neither) rather than picking one.
- Before counting answers, hand-check a sample of decisive ones against the evidence, and report how many were right and the judge's family relative to the subject's.
- Keep the judge's view large enough for its question, and state what `--limit` cut.

## Count The Cost

Count subjects before running: groups × arms × trials, plus one judge run per reviewed group, two with `--swap`. The plan line prints the subject count. Host-reported cost is a list-price estimate: runs billed to a subscription spend the user's plan limit instead, which `--max-cost` does not see. Run the smallest batch that can answer the question first, and state the count before a large one.
