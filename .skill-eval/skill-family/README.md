# Skill family evaluation

Measures the guidance changes that landed between `3415a8a2` (baseline) and `b78e8fd9`, the current commit of `feat/evaluate-behavior` (candidate), in two skills:

- **Write Skill** (`skills/write-skill`, groups `w1-*` and `w2-*`): the same path in both arms, so only `subject.source` differs.
- **Evaluate Behavior** (`skills/evaluate-behavior`, groups `v1-*`): the skill was `skills/evaluate-skill` at the baseline and is `skills/evaluate-behavior` at the candidate, so `subject.source` and `subject.skills` both differ.

Every group is a body group with explicit skill delivery (the subject is handed the skill on turn one), the model `anthropic/claude-haiku-5-5` at thinking `medium`, the host extension `@gotgenes/pi-anthropic-auth` 3.4.2 from `configuration.json`, and the tools `read`, `write`, `ls` and `find`. Deterministic checks are `changed-paths` (the subject writes only its output file) plus `file-text` checks on that file. Review questions cover what the checks cannot decide.

These cases were written by an agent other than the author of the guidance under test. Its intent, as stated in the task, was to measure the change, not to confirm it. Expect the checks to be proxies: a `contains` check on a word such as `placement` or `near` can miss a correct answer phrased differently, so read the transcripts before trusting a count.

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

- `w1-a` (choose changes): five candidate changes from evidence. Measures whether the guidance makes the agent drop a one-off, a duplicate and a candidate the skill already states, and route a structural failure to a check rather than prose, while keeping the two durable ones. Checks: `changes.md` is the only file written, and it addresses C1 to C5.
- `w1-b` (revise for a refusing tool): the skill has a Rule guarding a mistake that the fixture tool now refuses. Measures whether the agent removes the guard, which the candidate's removal guidance targets. Checks: only `skill/SKILL.md` changes, the `hand-edit` and `by hand` guard phrases are gone, and the `make test` step remains.
- `w1-c` (plan from one failure): a single observed failure, a skill that stopped before its check. Measures whether the plan names a near-miss case, both baseline and revised arms, and a rerun. Held out. Checks: only `plan.md` is written, and it names the baseline and a near miss.
- `w1-d` (keep a placement fix): a durable failure the skill already states, where the guidance sits in a reference read only for refunds. The default ("already covered, drop it") is wrong here; the right change is a placement fix. Measures whether the candidate keeps that change. Checks: `changes.md` is the only file written, and it addresses P1 to P3. Review questions decide whether P1 is kept with a placement fix.
- `w2-a` (classify sentences): six sentences, three Rules and three judgments, classified by Write Skill's test. Measures whether the candidate applies the Rule/judgment split correctly and keeps the readable form. Checks: one exact line per sentence.
- `w2-b` (activation path): a fixture skill loaded by catalog description or direct invocation, with `AGENTS.md` always loaded and a reference loaded only on one branch. Measures whether the agent names every activation route and the guaranteed context. Held out. Checks: only `activation.md` is written, and it names `AGENTS.md`, `/invoice-check` and the description route.
- `w2-c` (justified guard): one repeated sentence guards a route the other copy does not reach, and one is repeated for emphasis. Measures whether the agent separates a justified local guard from unneeded repetition. Checks: line 1 is `A: justified`, line 2 is `B: not justified`.

**Evaluate Behavior**

- `v1-a` (single-run counts): counts from one run per variant (4/5 against 3/5). Measures whether the report avoids a "better" claim and recommends trials or a declared rule. Checks: `report.md` is the only file written, cites both counts, and contains neither "is better" nor "beats", and contains "trial".
- `v1-b` (judge order swap): ten judged cases, one of which changes with the order. Measures whether the report gives both readings of that case, says what was checked by hand, and avoids a conclusion from one disagreement. Checks: `report.md` contains "hand", "strict" and "lenient".
- `v1-c` (model question design): a non-skill question, whether to move a summarizer to a larger model. Held out. Measures whether the design makes the model the component, the model in use the baseline, checks delivery or behavior, and avoids skill-only activation checks. Checks: `design.md` is the only file written, contains "baseline" and "behav", and does not contain "activat".

## Running

Do not use `--dry-run` to check loading. In the authoring session, `run .skill-eval/skill-family/suite.json --dry-run --yes` printed the plan (10 groups, 20 arms, 1 trial) but still launched subject processes (`pi`) and wrote grades for all ten groups. That run was stopped and marked cancelled; its output under `.skill-eval/runs/20261012160152-5f5b6668/` is not evidence. Load-checking is covered by `npm run check:eval-definitions`. Start a real run only when the user asks for one.
