# Review, Evaluation and Verification

> **Covers:** `skills/review-work/`, `skills/evaluate-behavior/`, `skills/verify-work/SKILL.md`, `skills/verify-work/scripts/`, `.skill-eval/scripts/gate.mjs`, `.skill-eval/gate.json`, `.skill-eval/gate/`, `scripts/validation/check-eval-definitions.mjs`
> **Tests:** `.skill-eval/evaluate-behavior/tests/`, `.skill-eval/verify-work/tests/`
> **Verified at:** `8470576f` (2026-10-19)

For contributors changing how Freeflow reviews work, evaluates agent behavior, or verifies claims: what each part does, how they depend on each other, why they are shaped this way, and which of their behaviors are deliberate. It also covers the evaluator's code, the evidence it stores, and the contributor gate that measures Freeflow's own changes.

## Purpose

An agent that writes code also claims things about it: that it works, that a review found nothing, that a change to its own guidance made it better. Freeflow keeps those claims honest with three parts, each answering a different question:

- **Verification** (Verify Work): does this claim hold now, at the boundary where it must hold? It runs checks and says what their results establish.
- **Review** (Review Work): is this work, artifact, report or eval definition correct and complete enough for its use? It judges sufficiency from evidence; it does not create evidence.
- **Evaluation** (Evaluate Behavior and its evaluator): does a declared change to an agent's setup change how the agent behaves? It runs agents under controlled conditions and preserves what they did.

They share one idea: evidence is classed by what observed it, and no class is promoted into another. A passing test is not a review; a reviewer's verdict is not a measurement; a measured difference on one suite is not readiness.

Deliberately out of scope:

- Review Work does not fix, revise, or accept; findings return to the producing activity's owner.
- Evaluate Behavior does not change what it evaluates, claim readiness, or choose adoption; the user decides.
- Model-based evaluation is never part of `npm run check` or CI.
- No part enforces anything at runtime. They are skills: guidance the agent follows, plus the evaluator script it runs.

## Vocabulary

| Term | Meaning | In code or text |
| --- | --- | --- |
| Self-review, independent review, adjudication | The three review roles: the producer checks its own result; a separately selected reviewer in a separate context judges a state it did not produce; the receiver decides what a returned report establishes | Review Work, "Choose The Review Role" |
| Review kinds | Work, artifact, report or record, eval definition; security risk is a lens any kind can add | `skills/review-work/references/{work,artifact,report-and-record,eval-definition,security-risk-lens}.md` |
| Judge | Any model whose verdict on another agent's output is used as evidence: an independent reviewer, the evaluator's pairwise reviewer, a rubric judge | `skills/review-work/references/judge-contract.md` |
| Configuration | Everything that can shape behavior: host and version, host extensions and settings, model and thinking, skills, context files, Freeflow, runtime, shell or container environment, participants | configuration keys in `lib/definitions.mjs` |
| Group | One behavioral question: one task run in named arms | `kind: "group"`, `schema_version: 2` |
| Arm | One configuration of the group's task; names match `^[a-z][a-z0-9-]{0,31}$` | `group.arms`, `lib/arms.mjs` |
| Reference | The arm the others are compared with; `baseline` by default | `group.reference`, `referenceArm()` |
| Component | The configuration paths that may differ between arms; any other difference is refused | `group.component` |
| Subject | The agent performing the task in one arm | `<arm>/run.json` |
| Suite | An ordered set of independent groups, optionally with a decision rule | `kind: "suite"` |
| Trial | One complete invocation of the selected groups; an aggregate holds several | `<invocation-id>/`, `aggregate.json` |
| Deterministic grade | Mechanical facts derived from saved evidence after the run | `deterministic-grade.json`, `gradeDeterministic()` |
| Judged evidence | Rubric judges' answers about one run, stored apart from run and grade | `<arm>/judged-grade.json`, `JUDGED_GRADE` |
| Advisory review | A pairwise model review of all arms side by side, unlabeled | `semantic-grade.json`, `reviewResult()` |
| Decision | A rule declared before the run that turns a suite's results into `beats`, `worse` or `no-difference-shown` | `suite.decision`, `lib/decision.mjs` |
| Claim class | The strongest claim the evidence reached: can do, rate on suite, beats; readiness is never claimed | aggregate `claim`, `decisionClaim()` |
| pass^k | A check passed in every one of k trials | aggregate per-check counts |
| Gate | The contributor command that runs the regression suites a change touches, base against head | `npm run eval:gate`, `.skill-eval/scripts/gate.mjs` |

## How It Works

### The three parts and how they connect

```text
Verify Work ── observes: runs checks, says what results establish
     │  results are evidence for
     ▼
Review Work ── judges sufficiency; owns the judge contract
     │  judge contract governs every model verdict used as evidence
     ▼
Evaluate Behavior ── measures behavior under declared configurations
     │  measured revision target returns to the component's owner
     ▼
Write Skill (skills and other instruction text) / the owner of the component
```

- Review Work's reviewers use Verify Work's check-result and claim-result semantics when they run a covered check; a reviewer that can recover evidence itself, by running an authorized check or reading the code, judges from what it observed.
- The evaluator's judges, both the pairwise reviewer and rubric judges, follow Review Work's judge contract. Changing the contract is a Review Work change that affects the evaluator (ADR 0013).
- Review Work's eval-definition kind reviews cases, suites, fixtures, graders and rubrics before their runs are paid for.
- Evaluate Behavior measures changes to any component, including Review Work's own wording: the review suite under `.skill-eval/review-suite/` runs Review Work as the subject and scores its reports with rubric judges.
- Write Skill owns skills and other instruction text an agent acts on (instruction files, prompts, tool descriptions, briefs). Its "Evaluate In One Loop" calls Evaluate Behavior to run the arms of a change; Evaluate Behavior returns one measured revision target and never edits the text itself.
- The evaluator's command graders are verification inside an evaluation: hidden tests run against the subject's final workspace.

### Review

Review Work is one skill for every kind of review (ADR 0013). Its core holds the Rules, the three roles, classification, the review budget and adjudication; each kind has a reference with its method and lenses.

1. **Before a model reviews**, the deterministic checks that apply run first, and their results go to the reviewer as evidence.
2. **Classify before calling something a defect**, in order: is the behavior settled (else a Question); is the claim supported (else Needs evidence); must it be fixed for this boundary (Blocking or Non-blocking Issue); otherwise omit it or name an Improvement.
3. **Independent review** is never automatic. It is selected through Workflow to protect a concrete boundary. The reviewer reports once and stops: Blocking, Inconclusive, Non-blocking or Pass. It edits nothing and adjudicates nothing.
4. **Adjudication** by the receiver disposes each finding as Accepted, Rejected or Open, from the actual state rather than the reviewer's verdict.
5. **Budget:** Review 1 broad; Review 2 focused, only when corrections or new evidence need it; Review 3 exceptional and final. Never Review 4. Never repeat a review merely to obtain Pass.

The judge contract (`judge-contract.md`) is binding for every judge use: record identity (model, provider, family, thinking, prompt hash, date, anything loaded that changes what it is sent); independence and the family relation to the producer; what the judge saw and what was withheld; a verdict with evidence, where "unclear" is valid; order and a swap when comparing; the combining rule named before verdicts; calibration status. Rubric judges judge one output alone and blind, so no swap is needed; their combining rule is declared in the definition; calibration belongs to the judge configuration.

### Evaluation: one run, step by step

The evaluator is `skills/evaluate-behavior/scripts/skill-eval.mjs`. `run <suite-or-group>` does this:

1. **Load and validate** (`loadDefinition`). Schema 2 only. Arms are resolved into one effective configuration each (`resolveArms`); a difference outside `component` is refused (`undeclared-difference`), and host name, host version and runtime other than `runtime.environment.literal` may never differ (`unsupported-difference`). `--source <arm>=<commit>` replaces every Git ref an arm declares, for this run only (`applySourceOverrides`).
2. **Check identity** (`lib/identity.mjs`). Every working-tree input must match `HEAD`; otherwise the run is refused unless `--dry-run`. A declared `host.version` must equal the installed host's (`pi --version` or `claude --version`).
3. **Check tasks** (`enforceReferenceChecks`). A group with a `reference_solution` has it applied to a fixture copy and its graders run, before any model call. An unsolvable or already-solved task is refused unless `--skip-reference-check`.
4. **Plan.** Print groups, arms, trials, subjects and reusable runs; ask "Start? [y/N]" on a terminal unless `--yes`. Refresh every selected login once (`refreshSelectedLogins`).
5. **Prepare each subject** (`prepareSubject`, then the host adapter's `prepareIsolation` and `prepareLaunch`). Its own `HOME`, temp, `XDG_*` and Pi agent directory under `<arm>/isolation/`; only the declared provider's login copied in, mode 0600, and deleted after exit. Host extensions resolved by exact version; source-built extensions and Freeflow built once per distinct commit. Pi starts with `--no-extensions`, `--no-skills`, `--no-context-files` and the rest, plus the evaluator's guard extension. Claude Code starts headless (`claude -p`, stream-json in and out) with only the declared tools (`--tools`), no setting sources, MCP servers or slash commands, `dontAsk` permissions, and the guard as a PreToolUse hook; its login comes only from the evaluator's environment (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` and the like), never from a copied file.
6. **Confine** (`guard-rules.mjs`, through `pi-guard.mjs` on Pi and the `claude-guard.mjs` hook on Claude Code). Only declared tools; `read`, `ls`, `find` and `grep` resolve inside the declared roots; `write` and `edit` stay in the workspace; declared context files are verified by SHA-256. The default `isolated` prompt mode replaces the host's system prompt with one listing the declared tools, skills and context; `host` keeps the host prompt. `bash` exists only behind a declared, probed shell or a container; in a container environment, `bash` and declared commands both run in the subject's container, which mounts the workspace at `workdir` and every other readable root (skills, context, runtime resources, Freeflow's package) read-only at its host path, so a skill's scripts run from bash by the path the subject was given. Before any container starts, `missingContainerPrerequisites` (`lib/container.mjs`) also reads a marker back through the image from the folder the workspaces live under, so an engine that does not share that folder (Colima shares only the home folder by default) is refused by name instead of grading an empty mount.
7. **Run** the subject: on Pi, RPC for body groups (`rpc.mjs`) and one-shot JSON mode for description groups; on Claude Code, one stream-json session (`hosts/claude-code/session.mjs`), whose requests pass through a local relay that records what Claude Code sent (`host-context.json`). Conversations and pipelines run several participants (`lib/participants.mjs`). Up to `--jobs` subjects at once; budget is reserved before each start and charged after (`lib/budget.mjs`).
8. **Check validity, persist, then grade.** A run the host reported complete that shows no model at work (no assistant message, zero tokens, or no answer and nothing written) becomes `invalid` with its reasons (`lib/validity.mjs`), so graders never start on it. `run.json`, the transcript, events and the workspace are written first. Post-run hooks record metrics (`lib/metrics.mjs`), run command graders on a copy of the workspace (`lib/grade-command.mjs`), and scan the transcript (`lib/scan.mjs`, with `lib/scan-shell.mjs` reading bash commands): reads outside the workspace, declared resources and the arm's own directory (its `isolation/` excepted), network attempts with an external target, instruction files reached outside the workspace, and hidden-test or reference-solution text in the output become `postRun.scan.flags`, over a pipeline's earlier stages too. Deterministic grades and comparisons are written after (`gradeDeterministic`, `gradeComparisons`); a malformed expectation becomes `grade-error`, never a changed run.
9. **Aggregate** trials (`runTrials`, `aggregateGroups`): a run with a transcript flag no person has cleared (`clearances.json` beside it, written by `skill-eval clear`) is held, counted as `unavailable` and listed under `held`, and adds nothing to sections or the decision; then per-check counts with pass^k, metrics per arm with paired differences, judged answers, and the decision's verdict. With a decision's `trials` schedule, undecided cases get more trials, up to `max`.
10. **Judge**, as a separate command (`review`), after the evidence exists. `review --rubric` writes judged evidence and rebuilds the aggregate (`rebuildAggregate`).

### Group shapes and modes

The same core runs every mode; a mode is a group shape (`skills/evaluate-behavior/references/eval-modes.md`):

- **Compare arms:** two or more arms, one reference, a declared component. The default.
- **Noise check:** `component: []` and identical arms; their gap is the floor a real difference must clear.
- **Measure:** one arm, no component, no comparison; yields a rate on the suite. A decision and a pairwise review refuse it.
- **Conversation:** `participants.protocol: "conversation"`; a simulated user answers only from its card, until a stop phrase or `max_turns` (1 to 50).
- **Pipeline:** `participants.protocol: "pipeline"`; ordered stages, each a separate subject that sees only what its `sees` lists (`fresh` stages see nothing earlier). An earlier stage's `response` and `files` arrive as fenced text in the stage's context, to read; `<stage>.workspace` instead starts the stage in a copy of that stage's final workspace, binary files kept, so it can run what the earlier stage wrote (`startingWorkspace` in `lib/participants.mjs`). A stage starts from the fixture or one earlier workspace, never both. The `graded` stage (last by default) is the arm's run; others are stored as `<arm>.<stage>/`. Arms may differ in `participants` when `component` names it, so one review can be compared with two reviews and an adjudicator.
- **Coding task:** the fixture is a repository copied as plain files; `check-tasks` lists what that copy lacks (Git history, ignored files the fixture holds or the task names, tools and network the task refers to) and reports it without refusing; `command` expectations run hidden tests on a copy of the final workspace with grader `files` from outside the fixture; `reference_solution` proves solvability; declared `commands` give the subject `run_command`.
- **Judged evaluation:** a `rubric` of dimensions (`yes/no/unknown` or `0-2`, with an optional judge-only `reference`), `judges`, and `combine` (`majority`, `unanimous`, `any`, `mean`).

### Decisions and claims

A decision names a measure (`comparison`, `metric`, `judged` or `score`), two arms (reference first), a direction, and optionally `alpha` (0.05), `min_cases` (10) and a `trials` schedule (`initial`, `step`, `max`). The unit is the case: each arm's values are averaged over its trials, each case counts as better, worse or equal, and an exact two-sided sign test runs over the decided cases (`signTest`). `beats` needs at least `min_cases` decided cases, p below `alpha`, and the split in the declared direction; `worse` is the mirror; anything else is `no-difference-shown`. A case whose difference is under one trial's worth is undecided and, with a schedule, gets more trials. The aggregate's claim records the verdict, split, p and the rule's hash (`ruleSha256`). Without a decision the strongest claim is `rate-on-suite`; "beats" is reported as not supported.

### Judging

- **Pairwise review** (`review --model` or `--configuration`) shows every arm's run side by side under random labels, with paths neutralized, and asks the group's `review_questions`; answers are `yes`, `no` or `unclear`. `--swap` reruns with reversed labels; `--swap-sample <fraction>` does so on a random sample of groups. Stored in `semantic-grade.json`. It is advisory, never calibrated, and not a measure.
- **Rubric judging** (`review --rubric`) has each declared judge answer every dimension for one run alone, blind to its arm, with evidence; answers are combined by the declared rule, and agreement between judges is reported (Cohen's kappa for two, Krippendorff's alpha for more; `lib/agreement.mjs`). Stored per arm in `judged-grade.json`.
- **Fencing:** each judge prompt wraps run material between `BEGIN RUN MATERIAL <token>` and `END RUN MATERIAL <token>` with a fresh random token (`fenceMaterial`). Text inside that tries to direct the judge is quoted back as `steering` and does not change answers.
- **Host setup:** a judge without its own `configuration` inherits the reference arm's host extensions and settings, so it uses the same login and prompt-shaping extension as the subjects. The pairwise reviewer inherits the same way unless `--configuration` is given.
- **Calibration:** `review --calibrate <labels.json>` pairs judge answers with hand labels and records kappa and observed agreement per judge configuration (model, thinking, extensions, settings, rubric hash, prompt version). Re-judging keeps calibration only while that identity is unchanged; until calibrated, answers carry `calibration not checked`.

### The two layers

- **User layer:** `skills/evaluate-behavior/`, `skills/review-work/`, `skills/verify-work/`. Shipped to users, general, with Node and Pi as the only requirements. Nothing in the skill text names Freeflow or this repository.
- **Contributor layer:** `.skill-eval/` (suites, the review suite, the gate and its suites, examples, the evaluator's tests) and `scripts/validation/`. It uses the user layer to measure Freeflow's own changes. One evaluator field is contributor sugar inside the user layer: `configuration.freeflow`, which builds Freeflow from a commit with `scripts/freeflow-snapshot.mjs` in the definition root.

### The contributor gate

`npm run eval:gate -- --base <ref>` (`.skill-eval/scripts/gate.mjs`, guide in `.skill-eval/scripts/gate.md`):

1. Lists paths changed since the base (`git diff --name-only <base>...HEAD`) and matches them against `.skill-eval/gate.json` entries' `paths` globs; each entry names one suite.
2. Prints the plan; `--dry-run-plan` stops there.
3. Runs each matched suite through the evaluator with `--reuse`, `--pilot 3`, the entry's trials, and `--source` mapping the entry's arms to the base commit and HEAD, so the definitions are never edited. Judged suites get an aggregate `review --rubric`.
4. Reports each suite with its aggregate ID and cost: PASS (the decision is `beats` or `no-difference-shown`, or without one, no other arm passed or was judged yes less often than the reference), REGRESSED (`worse`, or some arm passed or was judged yes less often), UNDECIDED (the claim reached no class, a comparison has unavailable outcomes, or the budget ran out first), INFRASTRUCTURE (a refusal, a stopped pilot, or failed, invalid or cancelled runs), or MEASURED (a suite of one-arm groups). Exit 1 if any regressed, else 2 on a refusal or infrastructure failure, else 0.

The gate suites under `.skill-eval/gate/` are written by `.skill-eval/gate/tools/write-gate-suites.mjs` from tuning cases only: `review-work` (6 groups, 12 subjects, 6 judge calls), `write-skill` (7 groups, including three that check Write Skill is chosen for an `AGENTS.md` edit and a tool description and not for a spec), `evaluate-behavior` (2 groups). Their default model is `anthropic/claude-haiku-5-5` at thinking `medium`.

### Verification

Verify Work determines what fresh direct evidence establishes about a specific claim at the boundary where it must hold, with references for browser runtime, integration, performance evidence, test design and project recipes. It is unchanged by the evaluator work. The evaluator shares its observing mechanisms (command graders run tests on a workspace; deterministic checks read final state), but Verify Work does not run the evaluator. Map Features (`skills/map-features/`) is the skill that builds and rechecks a project's live-verification recipe; Verify Work only uses it.

When a claim needs the project's running software, Verify Work's Project Recipe reference (`skills/verify-work/references/project-recipe.md`) has the agent look for the project's saved steps: a feature map in its developer docs, found by the `Covers` header of each feature file, plus the shared guide and helper. It uses them, triages a failing step as drift, a gap or a product bug, and never edits the steps to make a failing product pass; corrected steps are saved through Write Docs in the same change, or proposed when the agreement does not cover docs. Write Docs owns the feature file and guide shapes. Map Features sets a recipe up, after an interview of the repository, and rechecks it feature by feature, driving every step it writes before moving `Verified at`; a failing step is drift, a harness gap or a product bug, and paid calls run only with the user's yes. Freeflow's own map is [Features](../features/README.md), driven with [Verify live](../guides/verify-live.md).

Verify Work's one script, `skills/verify-work/scripts/test-changes.mjs`, lists every test file, fixture, snapshot and shared test setup file that existed at a base and changed, moved or was deleted by a head (the working tree by default), with the changed hunks. Test Design's one Rule has the agent give each listed change a reason (the property is preserved, or the user agreed the behavior change) or return it to the user before reporting the work done; Verify Work's body links the script from the Test Design entry.

## Decisions

- **One review skill with kinds, and it owns the judge contract.** Review Artifact was merged into Review Work; new review kinds are references, not skills. A judge is a reviewer, so the contract lives with review, and the evaluator is one consumer. Rejected: separate skills per kind (every rule change made twice and drifted); the contract in the evaluator (other judges would restate it). Source: ADR 0013.
- **No reviewer panels, votes, or mandatory different-family reviewer.** The review research found that combining verdicts mostly trades false alarms for detection, identical-model repeats add nothing, and a different family changes what is flagged without a measured gain. Repeated calls to one configuration count as one vote. Source: ADR 0013.
- **Skill names keep verb-object form: `review-work`, `evaluate-behavior`, `verify-work`.** Bare verbs collide with host commands (`/review`); role nouns (reviewer, evaluator) collide with Freeflow terms and read as personas. `evaluate-skill` became `evaluate-behavior` because its subject is any declared configuration, not only skills.
- **Schema 2: the configuration is the subject.** Definitions declare a task plus a configuration with per-arm overlays and a declared component, instead of skill-shaped fields. Optional v1 fields would have made v1 a v2 in disguise.
- **One host-neutral core, one adapter per host.** A host is the agent program that runs the subject's model and tools; a provider serves the model. Everything that depends on the host program (its arguments, events, sessions, isolation and login, extensions, model calls and the shell probes' launch) is in its adapter under `lib/hosts/`, behind one interface (`lib/hosts/index.mjs`); the core (`lib/subject.mjs` and the rest) never names a host. A group's host is its configuration's `host.name`, shared by every arm. Rejected: one adapter per provider (Pi already serves many providers, and one host's flags and events are the same whichever provider serves it).
- **Claude Code runs with its loaders off, and what it adds anyway is recorded.** Claude Code cannot be told to send only the evaluator's prompt: it adds an identity line and an environment note to every request. Its skill, settings, instruction-file, MCP and plugin loaders are off, declared skills reach it as on Pi (a listing in the system prompt, and Pi's exact skill-command text for a body run's target), and a local relay records each request (and the method and path of any other call Claude Code makes to the API host), so a run shows exactly what the model received. Bash runs only in a container environment, since no isolation extension exists for Claude Code; Pi extensions, declared commands and Freeflow are refused at load. Rejected: running subjects as Agent-tool subagents, which inherit the parent's instruction files.
- **Everything that can change behavior is declared.** Host extensions (such as a subscription's auth extension, which reshapes the system prompt) and host settings are configuration, not command-line flags, and may differ between arms. The evaluator's own Pi defaults (`retry.enabled=false`, `compaction.enabled=false`) are merged under declared settings in one place (`effectivePiSettings`), for subjects, simulated users, judges and reviewers alike. Logins refresh centrally through the installed Pi rather than being refused near expiry.
- **Canonical evidence comes from commits.** Working-tree inputs that differ from `HEAD` refuse a canonical run; a dry run is allowed but never enters a claim or the reuse index. This makes every result recoverable from a commit.
- **Judged evidence is its own class.** Judge answers never change run or deterministic grade files; they are stored apart with identity and calibration, and count toward a claim only through a decision declared before the run. Rejected: judges kept purely advisory (rubric scores could not be measures), and judges writing into grades (one class silently promoted into another).
- **The sign test first, with the case as the unit.** Trials of one case are repeated draws of one question, so they are averaged rather than counted as independent. The sign test is conservative and assumption-light; other methods (such as a paired bootstrap) can be added later.
- **Validity by tokens, not by cost or tool use.** A failed login graded "ok" across a whole BtW batch; the gate makes a hollow run `invalid` instead. Cost is zero for real work on an unpriced model, so tokens are the signal; requiring tool use would make every one-answer run invalid, including a description run whose target did not activate, which is the behavior such a run measures. Rejected: the literal spec rule of "more than one turn or real tool use".
- **A flag holds a run until a person clears it; the scan never fails one.** Its patterns are heuristics with false positives (a fixture can name `AGENTS.md`; a legitimate fix can match a reference line), so a flag is evidence to read, held out of claims rather than graded. They are tuned on stored runs so honest work stays unflagged: a network flag needs an external target in a command (loopback, a service name with no dot, a URL in a payload or in tool output are not attempts), an install counts only when the run's network was `none` and it names a registry package, the arm's own directory and the temp directory's scratch files are not outside, and an answer copy needs a block of distinctive lines (imports, short lines and scattered idioms are what any code shares). Rejected: flagging on any URL or network word, which held most honest runs that start a local server. A clearance is a separate file with the person's reason, so canonical run evidence never changes, and clearing rebuilds the aggregates that list the run. A pilot stops on an uncleared flag, as it does on an invalid run. Rejected: dropping flagged runs (the evidence would vanish), and letting the agent clear them (the Rule says only the user decides).
- **Deterministic first.** A judge answers only what checks cannot. Command graders, reference solutions and the ten expectation kinds carry as much as they can before any model judges.
- **No required dependencies; optional ones only when declared.** The user layer runs on Node and Pi. A confined shell needs a declared isolation extension (such as the Gondolin example) and a container needs the `docker` CLI; each is checked only for a group that declares it. When something is missing, the evaluator refuses with what is missing and how to install it, and the skill tells the agent to ask the user before installing. Images are pinned by digest and never pulled.
- **One network policy for all code the subject wrote.** `configuration.network` covers bash, declared commands and command graders alike (`lib/seal.mjs`). `"none"` is refused at load unless every such path is confined (bash by a probed shell or container, commands and graders by the arm's container), and each run records `sealing`. Without a declaration the arm gets what its paths allow, so existing definitions whose declared commands run `node --test` on the host keep loading; the plan names unsealed arms. A declared command on the host gets no `PI_CODING_AGENT_DIR` or login variable. Rejected: a named host allowlist for now (Docker needs a user-defined network and an egress proxy, which nothing here verifies); refusing unsealed host commands by default (would break the Work Agreement suites until they declare `"host"` or move to an image).
- **A shell is allowed only as verified confinement.** Six probes run through the arm's own host (Pi, or Claude Code) before any subject: a workspace write that must succeed, and a write outside, a read of the home's parent, a read of a marker in the host's login directory (the adapter's `loginDirectory`, Pi's agent directory), a network call and an environment leak that must all fail. A run's `sealing.login` is `out of reach` with bash only when the login probe held. Rejected: trusting an isolation's claims without probing.
- **One-arm measure groups.** Recording a baseline, scoring a benchmark and regression checks need a rate without a comparison; a one-arm group is its own reference and can never support a comparison claim.
- **Judges inherit the subjects' host setup unless they declare their own.** A judge launched without the subscription's auth extension was refused by the provider as unbilled extra usage; inheritance makes the default correct, and a declared `configuration` lets a judge differ on purpose.
- **Reuse by content, not by name.** `--reuse` counts an indexed complete run as a trial only when a hash over the task, group inputs, the arm's effective configuration and inputs, model, host version and the evaluator's own code matches. Rejected: reusing by result ID or commit alone, which cannot tell that a grader or the evaluator changed.
- **The gate is local, not CI.** It calls real models, needs the contributor's credentials, and costs money; `npm run check` stays deterministic. The gate measures each change base against head on a cheap model with reuse, so later autonomy work can call it.
- **`test-changes.mjs` lists and never judges.** It answers which existing checks changed, which an agent can miss in its own work (a shared fixture edited to make broken tests pass, reported as "Fixed"); whether a change is justified stays with the agent and the user. It matches paths, not content, with case-sensitive defaults for common layouts in JavaScript, TypeScript, Python, Go, Ruby, Java, Kotlin, C#, Swift, C and C++, PHP, Elixir and Dart, and `--pattern`, `--only` and `--exclude` for the rest. Tests inside source files (Rust's `#[cfg(test)]`, doctests) have no path of their own and are not listed; reading content to find them would turn a listing into a judgment. Git runs with fixed flags (`--no-color`, `--no-ext-diff`, `--no-textconv`, `--no-relative`, `-M`, fixed prefixes) so the user's diff configuration cannot change the listing. Rejected: failing on any test change, which refactors and agreed behavior changes would trip and agents would learn to argue past; detecting setup hooks from the changed lines, a partial signal that would read as "no setup changed".
- **Prefer measuring before adopting guidance.** Review Work's evidence sentence was adopted after it raised clean-change acceptance from 77% to 91% with detection unchanged; a second candidate sentence was dropped because it lost guard bypasses (`.skill-eval/review-suite/results/`).

## Intended Behavior That Looks Wrong

- **`--dry-run` still runs subjects and calls models.** A dry run only allows uncommitted inputs and keeps the result out of claims and the reuse index. To check that definitions load without spending, use `npm run check:eval-definitions`; to check a coding task, use `check-tasks`. Making dry runs skip subjects would remove the only way to try an uncommitted candidate.
- **An unknown expectation kind passes loading.** Fields are whitelisted for the ten known kinds; an unknown kind fails at grading as `unsupported expectation kind`, recorded as a grade error. Grading errors are evidence about the definition and never rewrite the run.
- **The gate suites declare no decision.** A sign test needs at least six decided cases in one direction to reach p < 0.05, and the gate's review suite has three judged cases. The gate reads per-comparison and per-dimension counts instead: any arm passing less often than the reference is REGRESSED.
- **A `fail-to-pass` transition is not "better".** Transitions are factual comparisons from the reference; only a declared decision says which arm is better.
- **Reuse misses after any evaluator change.** The reuse key includes a hash of the whole `scripts/` directory, so subjects rerun when the evaluator changes even if nothing else did. Reusing across evaluator versions could pair runs graded or isolated differently.
- **`--trials` must equal a decision's `trials.initial`, and `--variant` is refused for a decision suite.** A decision compares two arms over a schedule declared before the run; overriding either would make the rule something chosen at run time.
- **A pairwise review is never calibrated.** It compares arms side by side for reading, not measuring; calibration applies to rubric judges.
- **The isolated prompt replaces the host's system prompt.** It removes ambient instructions so only declared context reaches the subject. When the component is something the host prompt carries, such as Freeflow, the group declares `runtime.prompt: "host"`.
- **A judge's answers count as one vote however many times it runs.** Repeated calls to one configuration are not independent judges.
- **`test-changes.mjs` exits 0 when it lists changes, and never lists a new test file.** It reports and does not gate (see Decisions). A file that did not exist at the base is a new test, not a changed one; whether it asserts agreed behavior is Test Design's judgment. Against the working tree, a moved file that is not staged shows as deleted, because Git pairs renames only between tracked files.

## Surface

### Commands

```text
skill-eval.mjs run <suite-or-group> [--group] [--variant] [--trials] [--max-cost] [--jobs] [--cpu-jobs] [--reuse] [--pilot] [--results] [--yes] [--dry-run] [--skip-reference-check] [--source <arm>=<commit>]
skill-eval.mjs check-tasks <suite-or-group> [--group]
skill-eval.mjs view <result-or-aggregate> [--group] [--variant] [--html <file>] [--results]
skill-eval.mjs review <result-or-aggregate> (--model | --configuration) [--thinking] [--swap | --swap-sample <f>] [--limit name=chars] [--group] [--results]
skill-eval.mjs review <result-or-aggregate> --rubric [--model] [--configuration]
skill-eval.mjs review <result-or-aggregate> --calibrate <labels.json>
skill-eval.mjs clear <result> [--group] [--variant] (--flag <id>... | --all) --reason <text> [--results]
```

| Flag | Default | Effect |
| --- | --- | --- |
| `--trials <n>` | 1, or `decision.trials.initial` | Independent complete invocations, aggregated |
| `--max-cost <total>` | none | Stops starting subjects once the host's list-price cost estimate reaches the total; not a subscription limit |
| `--jobs <n>` | 1 | Subjects at once |
| `--cpu-jobs <n>` | 2 | Local CPU work at once: command graders, builds, probes |
| `--results <dir>` | `<root>/.skill-eval/runs` | Where results are written and found |
| `--reuse` | off | Count matching indexed runs as trials; every canonical run is indexed either way |
| `--pilot <n>` | off | Run the first n groups once; stop before the batch on a failed, invalid or cancelled arm, a grade error, or a comparison no arm passed; otherwise the pilot is the first trial |
| `--source <arm>=<sha>` | none | Repeatable; replaces every Git ref the arm declares for this run |
| `--skip-reference-check` | off | Run despite a failing reference check; recorded in `reference-check.json` |
| `--limit name=chars` | `response` 8000, `argument` 300, `file` 20000, `materials` 60000 | What a judge sees; cut material is recorded as truncated |

Exit codes: 0 complete; 1 for an incomplete run, an unknown flag or missing reason for `clear`, a declined plan, a stopped pilot, a review or judge error, a failing `check-tasks`, or an argument error; 2 for an unknown command.

Verify Work's script:

```text
test-changes.mjs --base <ref> [--head <ref>] [--root <repository>] [--pattern <glob>]... [--only] [--exclude <glob>]... [--json]
```

It exits 0 whenever it lists, even nothing, and 2 on a usage or Git error.

### Contributor scripts

- `npm run eval:gate -- --base <ref> [--dry-run-plan] [--jobs <n>] [--max-cost <total>]`.
- `npm run check:eval-definitions`: loads every suite and group under `.skill-eval/` with the evaluator's `loadDefinition`, and checks that each declared fixture is a directory inside the repository (resolved from its root, as runs resolve it), inside `npm run check`.
- `npm run test:skill-eval`: the evaluator's tests, inside `npm test`.

### Definition keys

The binding shape is `skills/evaluate-behavior/references/evaluation-definition-schema.md`. In summary:

- **Suite:** `id`, `groups`, optional `decision` (`measure`, `arms`, `direction`, `method: "sign-test"`, `alpha`, `min_cases`, `trials`).
- **Group:** `id`, `type` (`description` or `body`), `input` (`prompt` or `turns`, plus optional `resume_before` on Pi body groups with a persistent session: before each named turn the RPC session is closed and resumed from its own file through `switch_session`), `fixture`, `tools`, `configuration`, `arms`, `expectations`, `review_questions`; optional `component`, `commands`, `revision: "description-only"`, `reference`, `rubric`, `judges`, `combine`, `reference_solution`, `participants`.
- **Configuration** (group, arm overlay, or a file via `extends`): `host` (`version`, `extensions`, `settings`), `model`, `subject` (skills, target, source, context), `freeflow`, `runtime`, `shell`, `environment`, `network`, `participants`.
- **Expectation kinds:** `skill-read`, `resource-read`, `path`, `changed-paths`, `file-text`, `json`, `response-text`, `context-text`, `tool-call`, `command`.

## State

```text
<results>/
  index.jsonl                         reuse index: key, result, group, arm, indexedAt
  <invocation-id>/                    YYYYMMDDHHMMSS-<8 hex>
    invocation.json                   selection, jobs, reuse, sources, startedAt
    summary.json                      state, dryRun, inputs.commit, groups, hostVersion, cost (this result's own spend), budget (the run's ceiling and runTotal so far)
    groups/<group>/
      definition.json                 the resolved group
      reference-check.json            when reference_solution is declared
      deterministic-grade.json        checks, comparisons, grade errors
      group.json                      states, reused runs, artifacts
      semantic-grade.json             pairwise advisory review
      review/, review-swap/           the reviewer's prompt, events and output
      judging/<token>/judge-N/        rubric judges' scratch directories
      resources/                      snapshots of fixture, skills, context, runtime, Freeflow, extensions
      confinement/<arm>/confinement.json
      commands/<expectation>/         command-grader workspace copies
      <arm>/run.json                  the subject's record, metrics, sealing, post-run commands, participants
      <arm>/transcript.json, final.md, events.jsonl, stderr.log, context-observations.jsonl
      <arm>/workspace/                the subject's final workspace
      <arm>/judged-grade.json         judged evidence
      <arm>/clearances.json           a person's clearances of transcript flags, with reasons
      <arm>/isolation/                HOME, agent dir, tmp; copied logins removed after exit
      <arm>.<stage>/                  pipeline stages other than the graded one
  <aggregate-id>/aggregate.json       per-check counts, pass^k, metrics, judged, decision, claim, held runs, each trial's cost, budget; trials are sibling directories
```

- Everything is on disk; nothing lives only in memory between commands. `rebuildAggregate` rereads every trial's `summary.json` and grades and rewrites `aggregate.json` (sections, decision and claim), keeping its ID, trials, schedule and budget. It runs after rubric judging and calibration of an aggregate.
- Calibration is stored in each judged grade's `judges[].calibration`: state, agreement, kappa per dimension, the labels file's path and SHA-256 (the labels are not copied), and when it was checked.
- Every canonical invocation writes `index.jsonl`, with or without `--reuse`, for its complete, graded, non-reused runs; dry runs never do. Only `--reuse` reads it.

## Invariants

- Run evidence is written before any grade, and no grade or judge ever modifies `run.json`, the transcript or the workspace. Guarded by `grade-command.test.mjs` (graders run on a copy) and `judge.test.mjs`.
- Judged evidence appears only in `judged-grade.json` and pairwise answers only in `semantic-grade.json`; neither is in `deterministic-grade.json`. Guarded by `judge.test.mjs`.
- Rubric questions, rubric references, grader files and review questions never reach the subject. Guarded by `judge.test.mjs` (the rubric never reaches the subject) and `grade-command.test.mjs` (grader files come from the definition directory, not the fixture).
- Arms differ only in their declared component. Guarded by `arms.test.mjs` and `definitions.test.mjs`.
- A canonical run has no uncommitted inputs, and a declared host version matches the installed Pi. Guarded by `identity.test.mjs`.
- Each subject has its own home, temp and agent directories, and only its provider's login, removed after exit. Guarded by `isolation.test.mjs`.
- A subject's tools stay inside declared roots, and `bash` exists only behind a probed shell or a container. Guarded by `pi-guard.test.mjs`, `shell.test.mjs`, `container.test.mjs`.
- A link in a subject's workspace is recorded with its target and never followed, in the run, a pipeline handoff and a grader's copy; a declared resource or fixture may hold only relative links inside it, copied as they are (`fingerprintDirectory`'s `links` option). Guarded by `grade-command.test.mjs` and `participants.test.mjs`.
- Every reader of a file the subject wrote (the judge's and reviewer's evidence, the HTML view, the transcript scan) opens it through `lib/subject-file.mjs`: never through a link, only a regular file whose real path is inside the workspace, and at most a bounded number of bytes; a skipped file is named with why. Guarded by `review.test.mjs`, `view-html.test.mjs` and `scan.test.mjs` (a link to a secret, to `/dev/zero` and to a FIFO).
- In a container environment, the subject's `bash` and declared commands run in its container and graders in a fresh one from the same image. Guarded by `container.test.mjs` and `command-tool.test.mjs`.
- A declared `network: "none"` holds on every path that runs subject-written code, or the group is refused at load; every run records `sealing`. Guarded by `container.test.mjs` and `grade-command.test.mjs`.
- Every model the evaluator launches (subject, simulated user, judge, reviewer) gets the evaluator's Pi defaults under its declared settings. Guarded by `isolation.test.mjs` and `review.test.mjs`.
- "beats" is reported only from a declared decision. Guarded by `decision.test.mjs` and `trials.test.mjs`.
- A missing metric is `null`, never 0, and a run that is not complete adds no metric to a summary or decision. Guarded by `metrics.test.mjs` and `decision.test.mjs`.
- A complete run that shows no model at work is `invalid`, never graded as a fail. Guarded by `validity.test.mjs` and `trials.test.mjs`.
- A run with a transcript flag no person has cleared counts toward no claim or decision, and clearing never changes the run's files. Guarded by `held.test.mjs` (checks, comparison arms, pairs and transitions, metrics, scores, judged answers and every decision measure), `scan.test.mjs`, `trials.test.mjs` and `participants.test.mjs`.
- No more than `--jobs` subjects run at once, and parallel subjects cannot overshoot `--max-cost` by more than the running set. Guarded by `concurrency.test.mjs`.
- The evaluator never pulls an image and never installs anything. No test can prove an absence; `container.test.mjs` and `shell.test.mjs` check that missing prerequisites refuse.
- No test calls a real model: tests use `helpers/fake-pi.mjs` and `helpers/fake-docker.mjs`.

## Failure Behavior

| Failure | Result |
| --- | --- |
| Undeclared difference between arms, unknown key, schema 1 | Refused at load; nothing runs |
| Uncommitted inputs | Refused, naming the paths, unless `--dry-run` |
| Host version or extension version mismatch | Refused before anything starts |
| Login under 30 minutes and refresh fails | Refused: log in again in Pi |
| Reference solution fails, or the task is already solved | Refused unless `--skip-reference-check`; `check-tasks` exits 1 |
| Shell prerequisite missing (such as QEMU for Gondolin) | The arm is invalid; the message names what is missing and says to ask the user before installing |
| A confinement probe holds when it should fail | The arm is invalid: "is not confined" with the probes |
| Docker missing, daemon down, image absent | The group is invalid before any subject; an absent image gets a `docker pull` suggestion, never a pull |
| Subject protocol error, extension error, changed immutable resource | `infrastructure-failed` run |
| Host exits cleanly but no assistant message, zero tokens, or no answer and nothing written | `invalid` run with `error.reasons`; graders do not start; a pilot stops |
| No progress for 30 minutes | `no-progress-watchdog` ends the subject |
| Budget reached | Remaining subjects are `cancelled` before execution; overshoot is recorded |
| Malformed expectation or grader failure | `grade-error` evidence; the run stays as it was |
| Transcript flag not cleared | The run is graded but held: `unavailable` in the aggregate, out of the decision; a pilot stops |
| Judge exits early, returns non-JSON, or misses a dimension | `judge-error` for that grade; other grades unaffected |
| Pilot finds a problem | The batch does not start; no aggregate is written |
| Unreadable trial during `rebuildAggregate` | Refused rather than counted as passing |

## Cost

- Subject runs are the cost. Reduce them in this order: answer from saved evidence; `check-tasks` (no model); `--pilot`; `--reuse` from the first batch so unchanged baselines are reused; a decision's adaptive `trials` schedule; fewer judge calls (deterministic checks first, `--swap-sample`, the smallest view a question needs).
- `--jobs` saves time, not spend. `--cpu-jobs` keeps local work (graders, builds, probes) within what the machine carries.
- `--max-cost` bounds the host's list-price estimate. On a subscription the binding limit is the plan's usage, which the evaluator cannot see; the plan line's subject count is the figure to check before a large batch.
- Each run records `cacheHitRate` and token counts per subject, so prompt-cache behavior is visible per arm.
- Measured on 2026-10-12: one gate smoke run on Haiku 5.5 with the auth extension ran 6 Review Work subjects base against head and 6 rubric judges; review subjects cost about $0.40 each at list price.

## Code Map

| Path | Owns |
| --- | --- |
| `skills/evaluate-behavior/SKILL.md` | The method: Rules, questions, claims, components, modes, reporting |
| `skills/evaluate-behavior/references/` | `evaluation-definition-schema.md` (binding schema), `eval-modes.md`, `evaluation-design.md`, `execution-and-evidence.md`, `measurement.md`, `defect-suites.md`, `review-and-revision.md` |
| `skills/evaluate-behavior/scripts/skill-eval.mjs` | CLI: options, `planRun`, `run`, `checkTasks`, `review`, `judge`, `calibrate`, `clear` |
| `skills/evaluate-behavior/scripts/guard-rules.mjs` | The confinement rules every host's guard decides with |
| `skills/evaluate-behavior/scripts/pi-guard.mjs`, `pi-command-tool.mjs`, `pi-observer.mjs`, `pi-login-refresh.mjs` | Subject-side Pi extensions: confinement and prompt, `run_command`, context observation, central login refresh |
| `skills/evaluate-behavior/scripts/claude-guard.mjs` | Claude Code's PreToolUse hook: the same confinement for Claude Code's tool names |
| `skills/evaluate-behavior/scripts/lib/` | The evaluator's modules, in the rows below |
| `lib/definitions.mjs`, `arms.mjs`, `source-override.mjs` | Loading and validation, arms and reference, `--source` |
| `lib/runner.mjs`, `trials.mjs`, `hooks.mjs`, `queue.mjs`, `budget.mjs`, `reuse.mjs` | Execution, trials and aggregation (`rebuildAggregate`), hook registries, concurrency, budget, reuse index |
| `lib/scan.mjs`, `scan-shell.mjs`, `clear.mjs` | The transcript scan and its flags, and its reading of bash commands (simple commands, variables, network targets); `skill-eval clear` and the clearances file |
| `lib/subject-file.mjs` | Reading a file the subject wrote: no links, regular files inside the workspace, bounded |
| `lib/subject.mjs`, `model-call.mjs`, `process.mjs` | One subject's host-neutral run (materialized environment, launch through the host adapter, the run record); a model call routed to its host; base environment and process watchdogs |
| `lib/hosts/index.mjs`, `hosts/names.mjs` | The host interface and its registry; the host names a definition may use |
| `lib/hosts/pi/` | The Pi adapter: arguments and one-shot JSON runs (`process.mjs`), RPC sessions (`rpc.mjs`), extension resolution, settings and login refresh (`host.mjs`), per-subject isolation (`isolation.mjs`), model calls (`model-call.mjs`), the shell probes' launch (`confinement.mjs`) |
| `lib/hosts/claude-code/` | The Claude Code adapter: what a definition may ask of it (`constraints.mjs`), arguments, settings and system prompt (`launch.mjs`), declared skills (`skills.mjs`), environment-only login (`isolation.mjs`), stream-json sessions (`session.mjs`), the recording relay (`recorder.mjs`), model calls (`model-call.mjs`), the shell probes' launch against a local Messages stub (`confinement.mjs`) |
| `lib/participants.mjs` | Conversations and pipelines |
| `lib/sandbox.mjs`, `identity.mjs`, `evidence.mjs` | Snapshots and fingerprints, commit identity and host version, evidence writing |
| `lib/freeflow.mjs`, `build-source.mjs` | Freeflow and other extensions built from a commit or path |
| `lib/shell.mjs`, `container.mjs`, `seal.mjs` | Confined shell and its probes; container environments; the network policy over bash, commands and graders |
| `lib/reference.mjs`, `task-copy.mjs` | Reference solutions and `check-tasks`; what a task's copy lacks against its original setting |
| `lib/grade*.mjs` | Deterministic graders, command graders (TAP, JUnit), comparisons |
| `lib/review.mjs`, `judge.mjs`, `agreement.mjs` | Pairwise review, rubric judging, combining, fencing, calibration, agreement |
| `lib/decision.mjs`, `metrics.mjs`, `validity.mjs` | Decision rule and sign test; run metrics; the validity gate |
| `lib/view.mjs`, `view-html.mjs` | Text views and the self-contained HTML page |
| `skills/review-work/SKILL.md`, `references/` | Review Rules, roles, classification, budget; per-kind methods, reviewer contract, adjudication, judge contract, security lens |
| `skills/verify-work/SKILL.md`, `references/` | Claim verification and its evidence references |
| `skills/verify-work/scripts/test-changes.mjs` | Lists changed, moved and deleted existing tests, fixtures, snapshots and test setup between a base and a head |
| `.skill-eval/scripts/gate.mjs`, `gate.md`, `.skill-eval/gate.json`, `.skill-eval/gate/` | The contributor gate, its configuration and suites |
| `.skill-eval/review-suite/` | The review suite: 25 cases, 50 groups (clean, seeded and real defects, a held-out third), the F3 and F7 suites, generators in `tools/`, results in `results/` |
| `.skill-eval/skill-family/` | Write Skill and Evaluate Behavior guidance cases (14 groups), including W3 description cases for instruction text other than skills |
| `.skill-eval/examples/gondolin-extension/` | An MIT-licensed example isolation extension for the confined shell, copied from Pi's examples with a minimal guest environment and egress denied |
| `scripts/validation/check-eval-definitions.mjs` | Loads every `.skill-eval` definition and checks its fixtures exist, inside `npm run check` |

## Tests

`.skill-eval/evaluate-behavior/tests/` has 33 test files, run by `npm run test:skill-eval` with a fake Pi (`helpers/fake-pi.mjs`) and a fake Docker (`helpers/fake-docker.mjs`):

- **Definitions and arms:** `definitions`, `arms`, `measure`, `source-override`, `entrypoint`, `check-eval-definitions`.
- **Execution and isolation:** `run`, `isolation`, `identity`, `pi-guard`, `rpc`, `command-tool`, `concurrency`, `participants`, `freeflow`, `build-source`, `claude-code`.
- **Environments:** `shell` (probes, refusals, the Gondolin example; the real micro-VM case is skipped without QEMU), `container`.
- **Grading and tasks:** `grading`, `grade-command`, `reference`.
- **Measurement:** `trials`, `decision`, `metrics`, `validity`, `scan`.
- **Judging:** `review`, `judge`, `agreement`.
- **Views and gate:** `view`, `view-html` (snapshot, escaping, no scripts or network), `gate`.

These prove the evaluator's mechanics with stand-in models. They do not prove behavior with real models, which only runs prove.

`.skill-eval/verify-work/tests/test-changes.test.mjs`, run by `npm run test:verify-work`, builds throwaway Git repositories and checks what `test-changes.mjs` lists and leaves out per kind, including a shared fixture edited to make a broken function's tests pass, head refs, patterns, paths with spaces, and errors. They prove what the script lists, not how agents use it.

## Limits

- A group runs on one host, so a question comparing Pi with Claude Code is two groups, not two arms.
- On Claude Code: bash only in a container, no `run_command`, Pi extensions or Freeflow, and retries at Claude Code's own default; its identity line and environment note cannot be removed, only recorded, and the note reports a Git repository above the workspace (Claude Code finds it itself, ignoring `GIT_CEILING_DIRECTORIES`).
- The Gondolin shell is tested only with fakes and skipped cases; it has not run on a real VM. Containers have: on 2026-10-19 the V0 to V3 groups, V2 and the pstack trial ran container subjects and graders on the real Colima engine (Docker 29.2.1, digest-pinned images), and a no-model check with the V0 image showed the probes holding, a skill's script running by its path, the network and the login path unreachable, and a grader in a fresh container.
- A task copy never has Git history, and a definition cannot ask for it: putting `.git` in the workspace would put Git's internals into the workspace fingerprints and changed paths. Ignored files in a fixture are copied but make a run non-canonical. `check-tasks` reports both.
- Network policy is `none` or `host`; a named allowlist of hosts is not supported. On `host`, declared commands and graders can read the user's files, including the provider login on disk.
- A pipeline stage cannot have its own configuration: every stage uses the arm's.
- Each rubric judge answers all dimensions in one call, so answers to one dimension can influence another.
- The only decision method is the sign test; there are no confidence intervals on rates.
- A pinned Pi binary and mocks with record and replay do not exist.
- The gate suites are small (2 to 7 groups, one trial) and catch clear regressions only. A gate arm whose base commit predates a skill's path is invalid: `skills/evaluate-behavior` does not exist on `main` before the rename.
- The coverage matrix (`.skill-eval/coverage-matrix.json`) lists every skill as `unverified`; it records design coverage and source hashes, not behavioral evidence.
- Review Work's detection of a requirement enforced on one path and broken on another is weak on Haiku, and the review suite's known-issue comparison rests on five changes.
- There is no skill that verifies a feature by driving the running application.

## Changes

- 2026-10-19: A sixth shell probe reads a marker in the host's login directory (Pi's agent directory); `sealing.login` says `out of reach` with bash only when it held, instead of inferring it from the home-parent probe.
- 2026-10-19: The transcript scan flags network attempts only with an external target in a command, package installs only on a sealed run naming a registry package, no reads inside the arm's own directory (except `isolation/`) or of temp scratch files, credential locations under a home, and answer copies only as a block of distinctive lines; on 2,027 stored complete runs, flagged runs fell from 362 to 203, each remaining one a read outside the run (199 of them old review-suite runs reaching for the live repository, all blocked).
- 2026-10-19: Readers of a subject's files (judge and reviewer evidence, the HTML view, the scan) no longer follow a link the subject made or open a FIFO or device; they read regular files inside the workspace, to a bound, through `lib/subject-file.mjs`.
- 2026-10-19: `check-tasks` lists what each task's copy lacks against its original setting (`lib/task-copy.mjs`): Git history, ignored files the fixture holds or the task names, and tools and network the task refers to.
- 2026-10-19: Transcript scan (`lib/scan.mjs`) flags outside reads, network attempts, instruction files and answer copies; a flagged run is held out of counts and decisions until `skill-eval clear` records a person's reason; a pipeline's earlier stages are scanned and gated for validity too.
- 2026-10-19: `configuration.network` (`"none"` or `"host"`) declares one policy for bash, declared commands and command graders; `"none"` is refused where commands or graders would run on the host; runs record `sealing`, the plan names unsealed arms, and declared commands lose `PI_CODING_AGENT_DIR` and login variables.
- 2026-10-19: Validity gate: a complete run with no assistant message, zero tokens, or no answer and nothing written is `invalid` before grading, and only complete runs' metrics count.
- 2026-10-19: A subject's container mounts its declared skills and other readable resources read-only at their host paths, so `node <skill>/scripts/x.mjs` runs from bash.
- 2026-10-19: A link the subject makes is recorded with its target instead of failing the run as infrastructure ("resource symlink escapes its declared root"), and fixtures, resources and stage handoffs copy links as they are instead of Node's rewriting a relative link into an absolute one.
- 2026-10-19: Every canonical run is indexed for reuse, not only `--reuse` runs, so a run made without the flag (a pilot on its own) counts later.
- 2026-10-19: Each result's `summary.json` records its own `cost`, and its `budget` names the run's shared total `runTotal`; a trial's `budget.spent` had read like that trial's own cost.
- 2026-10-19: A pipeline stage can start from an earlier stage's workspace (`<stage>.workspace`), and the container preflight refuses a workspace folder the engine does not share.
- 2026-10-19: Map Features sets up and rechecks a project's feature map, guide and helper; Verify Work's Project Recipe reference proposes it when no recipe exists.
- 2026-10-19: Verify Work gains the Project Recipe reference, which finds, uses and triages a project's feature map.
- 2026-10-19: Verify Work gains `test-changes.mjs` and Test Design's Rule for changed tests, fixtures and setup, plus agreed-behavior assertions, weak-test signs, regression checks on the pre-fix code, performance limits, saved browser evidence, and one-line guidance on safety claims, baselines and keeping check scripts.
- 2026-10-13: Claude Code added as a second host (`lib/hosts/claude-code/`); the guard's rules moved to `guard-rules.mjs`, shared by Pi's extension and Claude Code's hook.
- 2026-10-13: the Pi-specific code moved behind a host adapter (`lib/hosts/pi/`), with no change in behavior; `lib/pi.mjs` became the host-neutral `lib/subject.mjs`.
- 2026-10-12 to 2026-10-13 (branch `feat/evaluate-behavior`): the evaluator generalised for any eval: named arms with a reference, decisions with adaptive trials, run metrics, rubric judges with agreement and calibration, command graders and reference solutions, components built from source, conversations and pipelines, the confined shell and containers, concurrency, budget, reuse, pilots, `--source`, the HTML view, one-arm measure groups, judge host-setup inheritance, and the contributor gate.
- 2026-10-12: `evaluate-skill` renamed `evaluate-behavior` (breaking).
- 2026-10-12: Review Work judges from evidence the reviewer can recover itself; the review suite (25 cases) built and used for F5 and F2.
- 2026-10-12: Review Artifact merged into Review Work; the judge contract added (ADR 0013).
- 2026-10-12: schema 2, per-subject isolation, declared host extensions and settings, canonical runs from commits.
