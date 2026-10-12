# Skill family evaluation

Measures the guidance changes that landed between `3415a8a2` (baseline) and `b78e8fd9`, the current commit of `feat/evaluate-behavior` (candidate), in two skills:

- **Write Skill** (`skills/write-skill`, groups `w1-*` and `w2-*`): the same path in both arms, so only `subject.source` differs.
- **Evaluate Behavior** (`skills/evaluate-behavior`, groups `v1-*`): the skill was `skills/evaluate-skill` at the baseline and is `skills/evaluate-behavior` at the candidate, so `subject.source` and `subject.skills` both differ.

Every group is a body group with explicit skill delivery (the subject is handed the skill on turn one), the model `anthropic/claude-haiku-5-5` at thinking `medium`, the host extension `@gotgenes/pi-anthropic-auth` 3.4.2 from `configuration.json`, and the tools `read`, `write`, `ls` and `find`. Deterministic checks are `changed-paths` (the subject writes only its output file) plus `file-text` checks. Review questions cover what the checks cannot decide.

These cases were written by an agent other than the author of the guidance under test. Its intent, as stated in the task, was to measure the change, not to confirm it.

## Check rules

A deterministic check is kept only when a correct answer cannot fail it. So the file checks in this suite are of three kinds:

- **Existence and scope:** `path` exists, and `changed-paths` equals the one output file. These hold for any correct answer that writes the file it was asked to write.
- **Anchored decisions:** a line-numbered `contains` check on a line that starts with the candidate ID and its decision (for example `C1: drop`). Used only where the prompt fixes the line format.
- **Exact fixture text:** a `not-contains` check on the exact guarded Rule sentence in `w1-b`, which only a revision that kept the Rule can contain.

Keyword checks, negated phrases (`is better`, `beats`, `activat`), and case-sensitive words (`baseline`, `behav`, `hand`, `strict`, `lenient`) were removed. Each one failed correct answers in the pilot outputs (see the revision notes below). Whether an answer gives both judge readings, names the baseline, or avoids a better-claim is decided by the review questions.

Consequence: groups `v1-a`, `v1-b`, `v1-c`, `w1-b`, `w1-c` and `w2-b` carry few deterministic checks, so their evidence is mostly the advisory review. The schema allows this, and the report should say so.

## Split

Held out: every third group in file-name order (positions 3, 6 and 9 of `suite.json`). Tuning groups may be used to revise wording. Held-out groups are reported separately and never used to choose or tune wording.

| Position | Group | Split |
| --- | --- | --- |
| 1 | `v1-a` single-run counts | tuning |
| 2 | `v1-b` judge order swap | tuning |
| 3 | `v1-c` model question design | **held out** |
| 4 | `w1-a` choose changes | tuning |
| 5 | `w1-b` revise for a refusing tool | tuning |
| 6 | `w1-c` plan from one failure | **held out** |
| 7 | `w1-d` keep a placement fix | tuning |
| 8 | `w2-a` classify sentences | tuning |
| 9 | `w2-b` activation path | **held out** |
| 10 | `w2-c` justified guard | tuning |

## Groups

Pass condition: every deterministic check holds for the variant, and the review questions show no failure of the claim below. Each group compares baseline and candidate under the same checks, so a difference in pass status is a factual transition, not a verdict.

**Write Skill**

- `w1-a` (choose changes): five candidates from evidence. Each line states keep or drop with a reason. Claim: the guidance makes the agent drop the one-off (C1), the structural (C2) and the duplicate (C3), and keep the two durable ones (C4, C5). Checks: `changes.md` is the only file written; line 1 `C1: drop`, line 2 `C2: drop`, line 3 `C3: drop`, line 4 `C4: keep`, line 5 `C5: keep`.
- `w1-b` (revise for a refusing tool): the skill has a Rule guarding a mistake that the fixture tool now refuses. Claim: the revision removes the guard. Checks: only `skill/SKILL.md` changes, and the exact guard sentence is gone.
- `w1-c` (plan from one failure): one observed failure, a skill that stopped before its check. Claim: the plan names a near-miss case, both arms, and a rerun. Held out. Checks: only `plan.md` is written. The claim is decided by review.
- `w1-d` (keep a placement fix): a durable failure the skill already states, where the guidance sits in a reference read only for refunds. The default ("already covered, drop it") is wrong here. Claim: P1 is kept with a placement fix; P2 (one-off) and P3 (duplicate) are dropped. Checks: `changes.md` is the only file written; line 1 `P1: keep`, line 2 `P2: drop`, line 3 `P3: drop`.
- `w2-a` (classify sentences): six sentences, three Rules and three judgments. Checks: one exact line per sentence.
- `w2-b` (activation path): a fixture skill loaded by catalog description or direct invocation, with `AGENTS.md` always loaded and a reference loaded only on one branch. Claim: the agent names every route and the guaranteed context. Held out. Checks: only `activation.md` is written, and it names `AGENTS.md`. The route claim is decided by review.
- `w2-c` (justified guard): one repeated sentence guards a route the other copy does not reach; the other is repeated for emphasis. Checks: line 1 `A: justified`, line 2 `B: not justified`.

**Evaluate Behavior**

- `v1-a` (single-run counts): counts from one run per variant (3/5 and 4/5). Claim: the report does not call the candidate better, states the counts, and recommends trials or a declared rule. Checks: only `report.md` is written, and it exists. The claim is decided by review.
- `v1-b` (judge order swap): ten judged cases, one of which changes with the order. Claim: the report gives both readings of that case, says what was checked by hand, and avoids a conclusion from one disagreement. Checks: only `report.md` is written, and it exists. The claim is decided by review.
- `v1-c` (model question design): a non-skill question, whether to move a summarizer to a larger model. Held out. Claim: the design makes the model the component, the model in use the baseline, checks delivery or behavior, and has no skill-only activation check. Checks: only `design.md` is written, and it exists. The claim is decided by review.

## Running

Do not use `--dry-run` to check loading. In the authoring session, `run .skill-eval/skill-family/suite.json --dry-run --yes` printed the plan (10 groups, 20 arms, 1 trial) but still launched subject processes (`pi`) and wrote grades for all ten groups. That run was stopped and marked cancelled; its output under `.skill-eval/runs/20261012160152-5f5b6668/` is not evidence. Load-checking is covered by `npm run check:eval-definitions`. Start a real run only when the user asks for one.

## Revision notes (after the pilot)

The pilot's outputs for `v1-a`, `v1-b`, `v1-c` and `w1-a` were checked by hand against the revised checks:

- `v1-a` `no-is-better-claim`: failed in both arms, because both reports say "the candidate is better" inside a negated sentence. Check removed.
- `v1-b` `reports-hand-check`: failed for the baseline only. The baseline compares answers with `cases.md` but does not use the word "hand". Check removed, as a keyword that a correct report can avoid.
- `v1-b` `reports-strict-reading`: failed in both arms. Both reports give one reading of case 6. This is a substantive gap in the reports, not a keyword problem. The requirement now sits in the review question.
- `v1-b` `reports-lenient-reading`: passed for the baseline only, on "lenient" used in an unrelated sense. Check removed.
- `v1-c` `baseline-names-baseline`: failed for the baseline only. The check is case-sensitive, and the baseline writes "Baseline". Check removed.
- `v1-c` `baseline-checks-behavior`: failed for the baseline only. The check is case-sensitive ("Behavioral"), and the baseline does check the summaries' behavior. Check removed.
- `v1-c` `candidate-no-activation-check`: failed for the candidate. It writes "not description activation", a negated mention. Check removed.
- `w1-a`: passed every check in both arms, because "C1" appears in every table. Replaced with line-anchored decisions. Caveat: the pilot wrote tables, not one line per candidate. Under the new format both arms' tables would fail the line checks on form alone. The decisions the pilot reached are listed in the report. The new format has not been run.
