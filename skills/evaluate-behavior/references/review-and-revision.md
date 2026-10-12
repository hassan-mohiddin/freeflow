# Review And Revision

Read this after canonical evidence and deterministic grades exist, when evidence conflicts, meaning remains unresolved, the failed boundary must be classified, or revision and rerun scope must be chosen.

This reference is judgment: adapt it to the evidence in hand. Its rerun and no-edit requirements restate [Evaluate Behavior](../SKILL.md) Rules.

## Use The Strongest Evidence

Prefer, in order:

1. filesystem state, typed workspace manifests, diffs, and changed paths;
2. structured events, tool activity, usage, process results, logs, and saved reports;
3. final response;
4. full transcript when stronger surfaces cannot answer the question;
5. subject self-assessment.

Lower-priority evidence cannot repair a contradiction above it.

If a response claims success but a required file is absent, preserve both facts and judge from the stronger artifact evidence.

## Keep Deterministic Facts Separate

Built-in checks establish exact observable facts. Missing evidence remains unavailable. A failed check remains behavioral evidence and does not relabel a complete run as infrastructure failure.

The active agent or user may judge:

- reasoning quality;
- authority preservation;
- architectural fitness;
- recommendation quality;
- semantic completeness.

Keep semantic judgment, cited evidence, uncertainty, and limits outside canonical run and deterministic grade state. Judged evidence from `review` and `review --rubric` is already stored apart; read it with each judge's identity and calibration, and when it disagrees with deterministic facts, the facts stand and the disagreement is reported.

Do not turn semantic or judged evidence into evaluator-owned readiness or promotion status.

## Diagnose The Failed Boundary

Classify before revising:

- activation timing;
- description language unavailable before body read;
- first-read body comprehension;
- undeclared, undelivered, unread, or ambient-only dependency;
- normal guidance hidden behind the wrong resource boundary;
- nearby behavior that hijacks the task;
- retained-use or multi-turn failure;
- wording, placement, example, repetition, or stop-condition pressure;
- a component that never reached the model;
- a stage, simulated user or judge rather than the subject: an earlier pipeline stage, a user that left its card, or a judge that misread the run;
- fixture, environment, isolation, host, runner, grader-command, or deterministic-check failure.

Do not add broad prose before identifying which boundary failed.

## Return Revision To The Owner

When evidence supports changing the component:

1. name the exact failed boundary;
2. cite the canonical evidence;
3. identify one measured pressure point;
4. preserve unrelated instructions and fixed criteria;
5. return the revision target to the component's owner.

[Write Skill](../../write-skill/SKILL.md) owns revision of a skill or other instruction text, such as an instruction file. Extension code goes to its owner; a choice of model, setting or extension goes to the user.

Evaluate Behavior does not change the component or replace its baseline while evaluating it.

When evidence proves the group, fixture, or criterion is wrong, revise the evaluation instead. Preserve the old result and state that it no longer answers the revised question.

## Rerun The Complete Group

After a measured revision or resolved infrastructure cause:

- rerun the complete fixed group;
- run every arm;
- keep every result visible;
- do not hand-pick an earlier reference run as a fresh counterpart; `--reuse` stands one in only when its inputs match exactly, and lists it as reused;
- do not rerun only the preferred arm;
- do not use partial evidence as a comparable full result;
- do not rerun merely to erase failure.

For variance, use `--trials` to run independent complete invocations rather than repeated preferred arms.

## Report

Report:

- failed boundary and evidence;
- exact revision or evaluation correction;
- criteria that remained fixed;
- old and new result paths;
- deterministic transitions, and the decision's verdict when the suite declares one;
- remaining unsupported claims.

The user decides whether to revise further, adopt, or reject the change.
