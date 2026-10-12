# Defect Suites

Read this before measuring a reviewer, checker or anything else whose job is to find problems: when building its cases, scoring it, or reporting how often it finds defects or rejects sound work.

This reference is judgment: adapt it to the detector under test. Read [Measurement](measurement.md) for sizing, noise and judges; this page covers what is particular to detectors.

A detector is measured on two sides: how often it finds real problems, and how often it rejects sound work. One side alone means nothing; a reviewer that rejects everything finds every defect.

## Build Both Sides

- **Clean controls:** sound changes, put through the same detector, to measure false rejection.
- **Seeded defects:** planted in otherwise sound changes, in named classes such as a logic error a test catches, a convention broken against stated requirements, and a security flaw. Report each class separately.
- **Real defects:** taken from history, from the commit that introduced a defect a later commit fixed, without refactor-only hunks. Seeded and real defects can differ in detection by an order of magnitude, so report them separately and keep real ones in every comparison.

## Prove Every Label

- Show each defect is real before use: a test or probe that passes on the sound state and fails on the defective one, or for a convention, the quoted requirement and the line that breaks it. Reproduce the proof on a fresh export, not in the builder's tree.
- A real variant matches its introducing commit byte for byte.
- Audit the clean labels too. Trace each stated requirement to what its commit shows, narrow any that claim more, and check that the fixture holds the code each requirement depends on. A "clean" change with a genuine issue leaves the false-rejection measure and becomes a known-issue case; one audit moved 5 of 20.

## Keep The Answer Out Of Sight

- Nothing the detector sees may name the variant, the class or the defect: use neutral IDs and paths. A declared context path containing the variant name is enough to leak it.
- Cases are built by someone other than the author of the guidance under test. Seeds are never written by the model under test.

## Give The Detector What Its Job Needs

- Give it the tools a careful person would use for the job, such as listing files and running the change's tests. A reviewer that cannot list files reviews the diff alone; one that cannot run the tests asks for evidence it could have produced.
- Make the harness reliable before measuring. Tests that fail under load, cut output and a misleading build status each produced rejections that belonged to the harness, not the detector.
- A change of tools or harness changes the measure. Results from before and after do not compare directly; say so.

## Score Detection And Rejection

- Fix the outcomes before the run, for example: a clean change is rejected when the review ends Inconclusive or Blocking.
- Count a defect as found only when the detector identified it, by location and effect. Rejecting the change for another reason is not detection.
- Report, for each side and class: the counts, pass^k (found in every trial), the per-case split between arms, and held-out cases apart from tuning cases.
- Read the rejections of clean changes and sort their causes, such as harness fault, ignoring evidence the detector produced itself, demanding a test for behavior the code plainly shows, and genuine open questions. The causes point at the revision; the count alone does not.
- Weigh both sides before adopting a change. One wording raised acceptance of correct changes from 77% to 91% while detection held at 82% to 85%, and was adopted; a second sentence that also raised acceptance missed guard bypasses in otherwise sound changes, and was dropped.
- Combining several detectors' verdicts trades one side for the other: an "any" rule mostly adds false rejections, a unanimous rule loses detections. Name the rule before seeing the verdicts.
