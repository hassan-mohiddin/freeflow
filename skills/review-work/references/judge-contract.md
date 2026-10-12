# Judge Contract

Read this before selecting a model to judge another agent's output, or before using such a verdict as evidence: an independent reviewer, an eval's advisory reviewer, or a grading judge.

This reference is a contract: every item below is binding for each judge use. When one cannot be met, say which, and treat the verdict as weaker evidence rather than presenting it as if the item held.

## Record And Do For Every Judge

1. **Identity:** the model ID, provider, model family, thinking or effort setting, prompt hash, date, and anything loaded into the judge that can change what it is sent, such as an extension that rewrites the system prompt.
2. **Independence:** the judge did not produce what it judges. Record its family relative to the producer's as same, different, or unknown. Repeated calls to the same model are one vote, not several.
3. **Inputs:** record what the judge saw and what was withheld. It sees the complete output it judges and the material its question is about; a verdict over truncated or missing evidence is not a verdict on that question. Withhold arm names, the producer's reasoning, and deterministic grades unless the question needs them, and make sure none reaches the judge through paths or file names.
4. **Verdict with evidence:** each verdict cites the evidence it rests on. Give no benefit of the doubt; "unclear" is a valid answer and is reported as such.
5. **Order:** when comparing outputs, record the order shown, and swap it to check that position did not decide the verdict.
6. **Combining rule:** when more than one verdict exists, name the rule (unanimous, majority, or any) before seeing them. Stricter rules cost detection; looser rules mostly add false alarms.
7. **Calibration:** record whether this judge configuration has been checked against cases with known answers, and the result. An uncalibrated judge's verdict is advisory.

A judge's verdict is evidence for adjudication or for a measured comparison. It is never canonical grading, acceptance, or authority to change the work.

## Rubric Judges

A rubric judge answers fixed questions about one output at a time, such as Evaluate Behavior's `review --rubric`. The items above apply, and:

- Judge each output alone, blind to its arm or producer, so no order effect arises and item 5 needs no swap.
- The combining rule (item 6) is declared in the evaluation definition before any run, not chosen when verdicts arrive.
- Calibration status (item 7) belongs to the judge configuration: its model, thinking setting, anything loaded into it, and the rubric. Record it per configuration; a change in any of them makes a new, uncalibrated judge.
