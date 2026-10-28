# Evals And Judges

Two parts, each read from its own route. Eval Definition Review is judgment; Review Work's Rules still bind. The Judge Contract is a contract: every item in it is binding for each judge use.

## Eval Definition Review

### Establish The Claim It Will Measure

Goal: review the definition against the comparison it is meant to support.

Identify the behavior and boundary under test, the arms and the one component meant to differ between them, the model and settings, the subject's prompt and visible files, every expectation and review question, and the evidence behind each seeded or real defect. Run the evaluator's loader first; a definition that does not load needs no model review.

### Check That It Can Measure What It Claims

Goal: a correct subject passes, a wrong one fails, and the result means what its name says. Research Work's [study](../../research-work/references/study.md) explains most of these checks, and its [study](../../research-work/references/study.md) the decision rule and matched arms; a study plan's measure is reviewed against the same list.

- **A correct answer can pass:** for each expectation, write or imagine the answer a sound subject would give and check that it passes. Text checks fail correct answers when they require one exact phrase, such as a function name, where a correct answer may quote the line or describe it instead.
- **A wrong answer cannot pass:** an expectation that holds for an empty, generic, or opposite answer measures nothing. Nor can a shortcut: editing the tests, hard-coding the expected output, or text addressed to a judge.
- **The outcome, not the path:** checks grade what the subject produced; a required order of tool calls fails valid approaches. A tool-call check is right only when the call itself is the behavior.
- **Both sides are tested:** cases where the behavior should occur sit beside cases where it should not, and a coding task's graders cover the new behavior and the existing behavior it must not break.
- **Names match checks:** each expectation's name and comparison say what it actually tests.
- **Defects are real and present:** each seeded defect is shown by a check that fails with it and passes without it, or by a direct contradiction of a stated requirement. The case author is not the model being measured.
- **Clean is clean:** a clean variant taken from history may hold a defect found later. Check it against its own requirements before trusting a clean-variant fail; a variant with a known defect is real, not clean, and is scored as such.
- **No leaks:** nothing the subject can see, including group IDs, paths, file names, and fixture comments, hints at the defect or the expected answer. Rubric references and grader files lie outside the fixture and the subject's declared context.
- **Arms differ only as declared:** sources, models, settings, tools, and context match except for the component under test, and each is pinned.
- **The decision comes first:** when the result will claim one arm is better, the decision rule (measure, arms, direction, size) is declared before any run.
- **The task is solvable:** a coding task's reference solution passes its graders (`check-tasks`), so a failure measures the subject, not the task.
- **Participants see only what they declare:** each pipeline stage's inputs and a simulated user's card hold what that participant should know and nothing that hints at the answer.
- **A shell is confined:** a subject gets a shell only behind a declared isolation that the evaluator verifies, never the host's own.
- **Judges see enough:** a grader or advisory reviewer receives the full output it judges and the material the question is about; answers given over truncated or missing evidence are not results.

### Classify What You Find

A check that a correct answer fails, a defect not shown present, a clean variant with a known defect, a leak, an unsolvable task, or a comparison claim with no decision rule declared is Blocking for spending on runs, because the result would be wrong whatever the subject does. Gaps in coverage beyond the claim are Improvements unless the claim depends on them.

### Independent Review

Brief it with the prompt in [Artifact Review](artifact.md#independent-review), taking the lenses from the checks above. Its job: it loads, a correct answer can pass every expectation and a wrong one cannot, each expectation checks what its name and text claim, every seeded or real defect is shown present, every clean variant is free of known defects, and nothing the subject can see reveals the answer. Also provide the evaluator's definition format, its loader's result, and the evidence that each seeded or real defect is present.

### Where Revisions Go

Revise the definition before running it. After a run, a fault found in a definition is recorded with the results it affected, and those results are read with it; do not quietly rescore them.

## Judge Contract

When an item cannot be met, say which, and treat the verdict as weaker evidence rather than presenting it as if the item held.

Research Work's citation-support reader, which answers the packets `claims.mjs support` builds ([reporting](../../research-work/references/reporting.md#check-that-citations-support-claims)), is a judge under this contract: record it as any other, and without a passing record its answers are advisory, weighed when the author settles each one.

### Record And Do For Every Judge

1. **Identity:** the model ID, provider, model family, thinking or effort setting, prompt hash, date, and anything loaded into the judge that can change what it is sent, such as an extension that rewrites the system prompt.
2. **Independence:** the judge did not produce what it judges. By default it is a different model from the producer; another family is optional; the same model is the fallback when no other is available. Record the relation as `different family`, `different model`, `same model: <why no other was available>`, or, in this record only, `unknown` when the producer's model is not known; a judge validation record takes only the first three. Repeated calls to the same model are one vote, not several.
3. **Inputs:** record what the judge saw and what was withheld. It sees the complete output it judges and the material its question is about; a verdict over truncated or missing evidence is not a verdict on that question. Withhold arm names, the producer's reasoning, and deterministic grades unless the question needs them, and make sure none reaches the judge through paths or file names.
4. **Verdict with evidence:** each verdict cites the evidence it rests on. Give no benefit of the doubt; "unclear" is a valid answer and is reported as such.
5. **Order:** when comparing outputs, record the order shown, and swap it to check that position did not decide the verdict.
6. **Combining rule:** when more than one verdict exists, name the rule (unanimous, majority, or any) before seeing them. Stricter rules cost detection; looser rules mostly add false alarms.
7. **Calibration:** a judge configuration is calibrated when it has a passing judge validation record, in Research Work's [format](../../research-work/references/study.md#judge-validation-record), whose checks its [study](../../research-work/references/study.md#judges) explains: agreement with cases whose answers are known, both orders for a judge that compares outputs, length control, decoys, and repeatability. A judge that disagrees with itself on a rerun is not calibrated. Record the record's path, or that there is none. An uncalibrated judge's verdict is advisory: evidence that adjudication weighs, never a verdict acted on alone, so an uncalibrated reviewer's Blocking is adjudicated, not obeyed. Advisory review needs no record.

A judge's verdict is evidence for adjudication or for a measured comparison. It is never canonical grading, acceptance, or authority to change the work.

### Rubric Judges

A rubric judge answers fixed questions about one output at a time, such as Evaluate Behavior's `review --rubric`. The items above apply, and:

- Judge each output alone, blind to its arm or producer, so no order effect arises and item 5 needs no swap.
- The combining rule (item 6) is declared in the evaluation definition before any run, not chosen when verdicts arrive.
- Calibration status (item 7) belongs to the judge configuration: its model, thinking setting, anything loaded into it, and the rubric. Record it per configuration; a change in any of them makes a new, uncalibrated judge.
