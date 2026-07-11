# Implementation Scope Drift And Replanning Handoff

Date: 2026-07-11
Updated: 2026-07-11 — outcome-level evaluator architecture selected; artifact-review reliability incident added

## Purpose

Preserve what happened while bootstrapping Freeflow's v2 `write-skill` and `evaluate-skill`, why implementation kept expanding, what this may reveal about agent workflow design, and how to resume the broader Agent Skills comparison without repeating the same failure mode.

This handoff is memory, not authority. Reopen linked live files, inspect current git state, and confirm owner decisions before consequential work. Do not treat hypotheses below as accepted product decisions.

Owner update: use Pi fresh-context subagents, not cmux, for independent reviews. This handoff remains the durable failure context; no additional handoff is required before revising the owning spec and plan.

Later owner update: evaluator architecture is now agreed at the outcome level. One `evaluate` call owns one case, performs deterministic preflight internally, stops before provider work when invalid or unresolved, otherwise executes all case-declared variants serially and publishes one trusted result bundle. Evaluator batching is deferred; output-router or shell composition may invoke independent commands later.

The subsequent artifact-review incident exposed a second system-level problem: a strong generator is not enough when the reviewer is uncalibrated. Review-system findings and current route are recorded below.

## Executive Summary

The original work began as part of a broader comparison between Addy Osmani's Agent Skills and Freeflow. Before revising more Freeflow skills, the project chose to build a self-contained `write-skill` and `evaluate-skill` foundation so later skill changes could be measured rather than judged subjectively.

That foundation became much larger than expected. The approved bootstrap spec and plan included a direct Pi adapter, isolated fixtures, frozen skill snapshots, root enforcement, normalized evidence, deterministic and semantic grading, control caching, bounded concurrency, resumable waves, request/spend caps, hard limits, adaptive repeats, and acceptance reporting. Most implementation growth therefore came from the approved artifacts rather than unplanned coding alone. However, partial implementation revealed that the bootstrap boundary itself may have been too ambitious.

The implementation agent then stayed in a local patch loop:

1. implement the next planned mechanism;
2. find a new edge case;
3. add or tighten code and tests;
4. invalidate or weaken earlier evidence;
5. rerun cases;
6. discover another issue;
7. continue rather than reconsider the plan.

The owner interrupted this pattern several times. Without those interruptions, the agent likely would have continued adding fixes, tests, reports, and eval runs without first deciding whether the architecture still deserved completion.

Central hypothesis:

> Agents need a fixed owner-approved outcome, but not a permanently fixed implementation path. When partial implementation reveals repeated architectural surprises, evidence invalidation, or material scope growth, the correct action is to freeze execution, return to discovery, reconsider the spec and plan, review the revised artifacts, and only then resume.

Freeflow already contains a backward-edge principle, but this incident suggests its trigger is too qualitative. The workflow needs stronger implementation-invalidating tripwires so an agent does not interpret every discovered issue as permission to expand the system.

## Original Context

The broader project goal was to compare Agent Skills with Freeflow skill by skill, neutrally and adversarially. Early comparison found that:

- Agent Skills offers broad engineering playbooks and direct task-to-skill discovery.
- Freeflow focuses more on workflow control, source truth, user-owned decisions, artifacts, verification honesty, and backward transitions.
- Agent Skills can become rigid or ceremonial when multiple mandatory skill workflows stack.
- Freeflow can remain too judgment-dependent if it does not define concrete stop and re-entry conditions.

See:

- `docs/handoffs/workflow-and-skills/2026-06-21-agent-skills-comparison-handoff.md`
- `docs/adr/0004-reference-skill-stack.md`
- `CONTEXT.md`
- `skills/workflow/SKILL.md`
- `skills/workflow/references/workflow-map.md`

Before continuing the full comparison, the project chose to strengthen skill authoring and evaluation. The intended sequence was:

1. define a self-contained authoring/evaluation contract;
2. implement a trustworthy Pi-first bootstrap;
3. prove it with deterministic and behavioral evidence;
4. stop at bootstrap acceptance;
5. resume the wider skill comparison.

Owning artifacts:

- `docs/specs/skills/skill-authoring-and-evaluation-v2.md`
- `docs/plans/skills/2026-07-10-skill-authoring-and-evaluation-v2-bootstrap-plan.md`

## What Was Implemented

The bootstrap implementation added or revised:

- self-contained `skills/write-skill/` instructions and references;
- self-contained `skills/evaluate-skill/` instructions and references;
- Node 22+ standard-library-only authoring and evaluation scripts;
- `.skill-eval/<skill>/` source and generated-state layout;
- eval case schemas and run/wave evidence schemas;
- Pi one-shot JSON execution;
- explicit root enforcement;
- isolated fixture workspaces;
- frozen skill snapshots;
- objective artifact grading;
- optional fresh semantic grading;
- normalized run bundles;
- control caching;
- bounded direct-process scheduling;
- request, spend, timeout, output, and turn limits;
- resumable wave state;
- adaptive repeat handling;
- bootstrap pressure cases for both skills.

Relevant commits, oldest first:

- `21f33e1` — plan/spec review
- `463f7cb` — initial v2 tooling, skills, and evals
- `3c86616` — resumable budget waves
- `c31a2eb` — Pi JSON calibration fixes
- `6a9da05` — stronger eval-reuse pressure
- `9e8a157` — draft-status vocabulary
- `b7ca8dd` — evidence requirement for extra resources
- `b9265dc` — honest readiness gate
- `e7e8b50` — direct-case fingerprint scope fix
- `84a44f6` — interrupted-job explicit retry fix

At the last deterministic verification, 34 tests passed:

- 3 `write-skill` tests;
- 31 `evaluate-skill` tests.

No code changed after that verification. Behavioral eval runs continued afterward.

## Where Scope And Complexity Grew

### 1. Bootstrap Included Scale Features

The first trustworthy loop was designed together with mechanisms normally associated with a mature harness:

- cache identity;
- resumable waves;
- concurrency;
- spend accounting;
- adaptive repeats;
- candidate-only reruns;
- multi-artifact normalization;
- semantic grading isolation.

Each mechanism is defensible independently. Their combination created many state interactions before the smallest loop had passed acceptance.

Hypothesis: bootstrap should perhaps have proven only one direct Pi case with isolation, frozen inputs, objective evidence, and optional semantic grading. Caching, adaptive repeats, and resumable wave scheduling may have belonged in later slices after real repeated use justified them.

This is not decided. Review must determine which pieces are essential rather than assuming all scale features should be removed.

### 2. Self-Evaluation Coupled Tooling Changes To Evidence

`evaluate-skill` evaluates itself while its scripts are also part of the candidate skill package. Internal harness fixes change the package snapshot hash. Under the strict fingerprint contract, those changes can invalidate behavioral evidence even when model-facing `SKILL.md` and references did not change.

This creates a loop:

1. run candidate evidence;
2. discover runner issue;
3. fix runner script;
4. candidate package hash changes;
5. prior candidate evidence no longer exactly matches;
6. rerun evidence;
7. new execution reveals another issue.

Open design question: should behavioral cases fingerprint the full skill package, only resources reachable in that case, or an explicit subject manifest? Full-package hashing is conservative but causes churn. Narrower hashing saves runs but risks unsound reuse if scripts can affect behavior.

### 3. Fingerprint Scope Was Too Broad

Direct-case fingerprints included the entire suite object. Adding unrelated `ESK2-008` changed fingerprints for `ESK2-001`, even though its case, fixture, variant, model, tools, and policy were unchanged.

Fix `e7e8b50` replaced the whole-suite input with:

- suite schema and skill identity;
- selected profile;
- active profile policy;
- selected case content.

A test now proves that unrelated suite membership and inactive profile-policy changes do not alter a directly selected case fingerprint.

This was a real correctness issue, not cosmetic refactoring. It also exposed a process failure: after discovering that evidence identity was wrong, execution should have paused for a broader fingerprint-design review instead of immediately treating the local fix as sufficient.

### 4. Interrupted Waves Could Retry Silently

An interrupted `ESK2-001` wave remained on disk with one job marked `running`, no run directory, and unknown unrecorded usage. The loader changed stale `running` jobs back to `pending`. A normal resume could therefore spend money again without an explicit retry decision.

Fix `84a44f6` now maps interrupted active jobs to `needs-attention`, records the interruption, and requires `--retry-needs-attention` before another attempt.

The stale wave was persisted as `needs_attention` without launching another model call.

This was another real safety issue. It also showed that interruption semantics had not been fully designed before paid runs began.

### 5. Structural Cases Still Show Possible Over-Fingerprinting

A host-free structural case receives no model call, yet current fingerprint construction can still include provider, model, and thinking values when supplied. Those settings do not affect a host-free subject.

This issue was noticed after behavioral reruns began. It has not been fixed because another script change would again alter the `evaluate-skill` package snapshot and potentially restart the evidence cycle.

Treat this as an audit finding, not an instruction to patch immediately.

### 6. Eval Criteria Needed Correction During Execution

Several cases initially encoded incidental outputs rather than behavior:

- one case required an exact filename;
- one case required exact `draft` wording;
- semantic protocol initially allowed grader output with unexpected assertion IDs;
- readiness wording allowed an unevaluated skill to claim production readiness;
- extra resources could be created without evidence that they were needed.

These were corrected. The corrections improved eval validity, but repeated criteria changes meant some saved runs became eval-design evidence rather than acceptance evidence.

This illustrates another re-entry trigger: repeated case redesign means the evaluation contract is still being discovered. Execution should stop until case semantics stabilize.

## Concrete Signs The Agent Should Have Stopped Earlier

The following signals accumulated:

- remaining work increased after completed slices;
- the same state/fingerprint seam produced multiple surprises;
- internal fixes invalidated earlier evidence;
- acceptance work repeatedly changed implementation;
- paid evidence had to be regenerated;
- the owner had to interrupt continuation multiple times;
- the agent could no longer state a short, stable path to completion;
- tests increasingly proved machinery added during bootstrap rather than only the original user outcome;
- the difference between “implementation complete” and “acceptance complete” became unclear;
- sunk-cost pressure encouraged finishing the architecture rather than reconsidering it.

Any combination of two or three of these should likely force workflow re-entry.

## Current State At Handoff

Worktree:

`/Users/mohammedhassanmohiddin/Documents/Antigravity/Freeflow-skill-system-specs`

Branch:

`skill-system-specs`

Tracked working-tree state at handoff creation:

- only `.freeflow/config.json` is modified;
- that modification pre-existed this work and must remain untouched;
- its diff hash remains:

```text
5c6ef14bced8db98478743291f62bab58d9a1b1441bdab225f67dbf8ce5274d7
```

This new handoff is untracked until deliberately staged or committed.

No model eval process was intentionally left running at handoff creation.

Observed model spend from saved artifacts is approximately:

```text
$2.798831
```

This total includes saved subject, semantic-grader, and manual usage artifacts. It excludes one interrupted old `ESK2-001` attempt whose usage was never persisted, so true spend is higher by an unknown amount.

### Current acceptance evidence status

`write-skill`:

- current candidate package hash matches the latest native activation and near-miss runs;
- old and candidate pressure runs exist;
- semantic grades exist for important `WSK2-001` and `WSK2-002` runs;
- evidence still needs reconciliation against the corrected fingerprint definition;
- final acceptance claim has not been written.

`evaluate-skill`:

- current-snapshot reruns now exist for `ESK2-001` through `ESK2-008`;
- `ESK2-004` native activation passed objectively;
- `ESK2-005` near-miss passed objectively;
- `ESK2-006` structural old failed and candidate passed;
- `ESK2-001`, `ESK2-002`, `ESK2-003`, `ESK2-007`, and candidate `ESK2-008` still need semantic grading if the current architecture remains the accepted target;
- first current `ESK2-008` old attempt hit the hard turn cap after producing decisive failing artifacts;
- explicit retry at the same cap completed with the expected old-skill failure;
- that wave records unresolved variance because the first attempt was infrastructure-limited and the second completed;
- one older interrupted `ESK2-001` wave remains preserved as `needs_attention` evidence and should not be resumed casually.

Missing closeout artifacts:

- `.skill-eval/evaluate-skill/reports/bootstrap-acceptance.md`
- final fresh-context read-only acceptance audit
- parent adjudication of that audit

Do not resume semantic grading merely because these items remain. First decide whether the current architecture and bootstrap boundary should survive review.

## Working Hypotheses

These are hypotheses for review, not accepted conclusions.

### Hypothesis 1: The Bootstrap Boundary Was Too Ambitious

The spec tried to establish both minimum trust and mature operational behavior in one milestone. This increased implementation surface and made acceptance expensive.

Possible correction: split “minimum trustworthy Pi loop” from “efficient repeated evaluation infrastructure.”

### Hypothesis 2: The Workflow Lacked An Implementation Invalidation Gate

Freeflow says to re-enter clarification when new ambiguity changes the next action. That principle did not trigger strongly enough when implementation evidence challenged the plan itself.

Possible correction: add explicit scope, complexity, and plan-health tripwires to workflow execution.

### Hypothesis 3: Agents Optimize Locally Unless Forced To Reassess Globally

Once executing a plan, the agent treated each issue as a local defect to fix. It did not repeatedly ask whether the overall design remained the smallest valid path.

Possible correction: at slice boundaries, require a brief plan-health check based on objective signals, not general reflection.

### Hypothesis 4: Tests Can Legitimize Accidental Complexity

A growing passing test suite can make an architecture appear justified even when tests mostly cover machinery introduced by the architecture itself.

Possible correction: classify tests by owning requirement. A test without a clear accepted requirement is evidence of possible scope growth, not automatically progress.

### Hypothesis 5: Late Review Is Insufficient

The plan called for a final independent audit. By the time final review approached, substantial cost and architecture already existed.

Possible correction: use fresh-context scope/minimality review when implementation crosses a trigger, not only before implementation and at final acceptance.

### Hypothesis 6: “Fixed Goal” And “Fixed Plan” Were Conflated

Agents need a stable endpoint. They do not need to execute an invalidated plan unchanged. Continuing because the plan was approved can be as harmful as improvising without a plan.

Possible correction: preserve owner-approved outcome and non-goals while allowing evidence-driven replanning through an explicit owner checkpoint.

## Proposed Agent Control Model

### Fixed elements

Before implementation, define:

- owner-approved outcome;
- measurable acceptance criteria;
- explicit non-goals;
- write set;
- complexity or scope budget;
- evidence budget;
- deferred list;
- stop conditions.

### Revisable elements

Allow evidence to revise:

- architecture;
- slice order;
- implementation mechanism;
- test strategy;
- module boundaries;
- which optional capabilities belong in the milestone.

### Suggested mandatory re-entry triggers

Freeze implementation when any trigger occurs:

1. a new requirement changes architecture or public behavior;
2. a second unexpected defect appears around the same seam;
3. a planned slice requires an unplanned subsystem;
4. new files/modules exceed the agreed budget;
5. estimated remaining work grows after completed slices;
6. a fix invalidates previously accepted evidence;
7. eval criteria change more than once during execution;
8. the agent cannot state the remaining finish path in a few concrete steps;
9. a deferred capability is pulled into the active milestone;
10. tests begin covering mechanisms without clear owning requirements;
11. repeated review or verification failures point upstream;
12. paid execution must be repeated because architecture changed.

Exact numeric thresholds need evals and dogfooding. Do not hardcode arbitrary counts without evidence. However, absence of any threshold leaves agents free to rationalize continuation.

### Re-entry protocol

When a trigger fires:

1. stop code changes and paid runs;
2. preserve current diff, evidence, spend, and failing observations;
3. state which assumption or plan section became invalid;
4. classify findings as blocker, simplification, defer, reject, or owner decision;
5. return to discovery/design discussion;
6. ask only decisions that materially change the next path;
7. revise spec and plan after owner direction;
8. review revised artifacts in fresh contexts;
9. adjudicate findings once;
10. resume from a newly frozen bounded slice;
11. stop at the revised acceptance boundary.

Reviewer findings remain evidence, not commands. Do not enter another autonomous review-fix-review loop.

## Proposed Review Before More Implementation

Use Pi fresh-context subagents for independent reasoning. Keep orchestration authority in the parent session; reviewers remain read-only advisers.

Run four read-only reviews. No reviewer edits files.

### 1. Scope reviewer

Questions:

- What was the smallest owner-approved outcome?
- Which current capabilities are required by that outcome?
- Which requirements entered through artifact ambition rather than observed need?
- Where did bootstrap cross into mature-harness scope?

### 2. Minimality reviewer

Questions:

- Which modules, schemas, references, fixtures, and tests could be removed or deferred?
- Which abstractions have only one use?
- Which tests protect accepted behavior versus incidental machinery?
- Could a materially smaller implementation preserve trust?

### 3. Architecture reviewer

Questions:

- Are state ownership, fingerprinting, caching, isolation, grading, and execution boundaries coherent?
- Does self-evaluation create circular trust or evidence invalidation?
- Are host-free and model-driven cases separated correctly?
- Are interruption and resume semantics safe?
- Which coupling points predict future churn?

### 4. Evaluation reviewer

Questions:

- What is the minimum evidence required to trust the bootstrap?
- Which saved runs remain valid?
- Which reruns are genuinely necessary?
- Does the harness prove its own correctness circularly?
- Which claims must remain Unverified?

### Reviewer output contract

Each reviewer should return:

- Blocking findings;
- Non-blocking findings;
- Questions for owner;
- Evidence gaps;
- Keep/simplify/delete/defer recommendations;
- exact file/section citations;
- a proposed smallest credible bootstrap boundary.

Parent synthesis should separate consensus from disagreement. Do not edit artifacts until the owner chooses a direction.

## Candidate Reduced Bootstrap Shape

This is a discussion seed, not a decision.

A smaller bootstrap might include only:

- compact self-contained `write-skill` and `evaluate-skill` instructions;
- one Node CLI entry point per skill;
- `.skill-eval/<skill>/` source layout;
- direct Pi one-shot execution;
- isolated fixture copy;
- frozen skill snapshot;
- strict root guard;
- final response, events, diff, status, and usage capture;
- deterministic grading;
- optional fresh semantic grading;
- one control and one candidate comparison;
- explicit Draft/Unverified/Production-Ready claims.

Possible later milestones:

- control caching;
- resumable waves;
- concurrency;
- adaptive repeats;
- request/spend scheduling;
- candidate-only reuse;
- Codex and Claude adapters;
- Pi RPC and multi-turn execution;
- richer report generation.

Review may conclude some listed later features are essential for minimum trust. Do not remove them based only on file count.

## Possible Freeflow Skill Changes Later

Do not implement these before continuing the wider comparison and designing evals.

### `workflow`

Strengthen backward-edge language for implementation scope drift:

- approved plan is not permission to expand indefinitely;
- repeated surprises can invalidate the plan;
- scope/complexity growth can require discovery re-entry even without user ambiguity.

### `execute-plan`

Add plan-health tripwires at slice boundaries:

- remaining-work trend;
- unplanned files/subsystems;
- repeated seam failures;
- evidence invalidation;
- deferred-scope entry;
- inability to state bounded completion path.

This skill should probably own detection because drift becomes visible during execution.

### `discover`

Support re-entry from implementation with a narrow shape:

- what changed;
- which assumption failed;
- current evidence;
- available simplification/defer/replan options;
- owner decision checkpoint.

Do not turn re-entry into a full restart when only one decision is open.

### `write-plan`

Plans may need:

- complexity budget;
- evidence/spend budget;
- explicit invalidation triggers;
- deferred capabilities;
- slice-level stop conditions;
- requirement ownership for tests.

### `review-artifact`

Add a minimality/scope lens:

- does the plan solve the stated outcome or build a generalized platform?
- are bootstrap and mature-system requirements separated?
- can acceptance be reached without implementing every future capability?

### `review-work` and `verify-work`

Require review and verification to check the owner-approved outcome, not merely internal consistency of accumulated code and tests.

### Skill eval needed

Create an adversarial fixture where:

- an agent starts from an approved plan;
- partial implementation reveals repeated edge cases;
- fixing them requires new modules and invalidates earlier evidence;
- the user says “keep going” or remains silent;
- baseline continues patching;
- desired behavior freezes work, reports the threshold breach, and routes back to discovery or owner decision.

This incident should become evidence for future Freeflow behavior, not just a cautionary story.

## Relationship To Agent Skills Comparison

This incident adds an important comparison dimension.

Agent Skills can provide detailed implementation workflows, but detailed workflows do not automatically prevent scope expansion. “Follow the skill exactly” may make the problem worse when the selected workflow or spec is itself too broad.

Freeflow's backward-edge model is directionally better, but this session shows that broad principles such as “re-enter clarification when ambiguity changes the next action” may not reliably stop a model already optimizing inside an approved plan.

Future comparison should therefore ask:

- Does a skill detect when its own plan became invalid?
- Does it distinguish a finding from permission to implement?
- Does it stop after repeated architectural surprises?
- Does it preserve owner control over milestone expansion?
- Does it measure whether remaining work shrinks?
- Does it prevent tests and artifacts from legitimizing accidental complexity?
- Does it re-enter discussion without discarding useful implementation evidence?

The desired Freeflow advantage is not more process. It is better judgment about when process should stop, move backward, simplify, or ask.

## Comparative Execution-Skill Findings

A follow-up comparison inspected the execution guidance and directly referenced material from:

- Freeflow `execute-plan`, its execution map, and `design-for-depth` references;
- Agent Skills `incremental-implementation`, `git-workflow-and-versioning`, and the shared Definition of Done;
- Obra/Superpowers `executing-plans`, `subagent-driven-development`, implementer/task-reviewer prompts, requesting code review, worktree setup, plan writing, and branch closeout;
- Matt Pocock's `implement`, `tdd`, test/mocking references, and two-axis `code-review`.

The inspected local Matt clone was at commit `391a2701dd948f94f56a39f7533f8eea9a859c87`. The inspected Superpowers clone was at commit `d884ae04edebef577e82ff7c4e143debd0bbec99`. Re-clone or verify upstream before relying on exact current wording.

### Freeflow's strongest properties

Freeflow has the strongest control model for execution under changing evidence:

- the plan is instructions, not authority;
- live source truth can invalidate a plan;
- every non-trivial slice names verification, review, commit/handoff, and stop checkpoints;
- a failed verifier cannot be silently rewritten to make implementation pass;
- a non-passing review is a phase exit, not an edit script;
- review findings must be classified and adjudicated before edits;
- the turn receiving a non-passing review cannot also apply its fixes;
- three review passes cap the same broad scope;
- repeated edge-case patches trigger a design-pressure diagnosis;
- scope expansion routes backward to discovery, spec, or plan;
- missing failure contracts block consequential implementation;
- verified slices can checkpoint through commits or handoffs before continuation.

These rules directly address this incident. In particular, repeated eval-criteria changes, evidence invalidation, and state/fingerprint edge cases should have routed backward rather than becoming a continuous patch sequence.

### Freeflow's remaining weaknesses

Freeflow does not yet prove that these checkpoints will fire reliably:

- review checkpoints are conditional on plan/risk/slice judgment;
- a slice contract can still declare no review;
- no objective threshold tracks scope growth, module growth, remaining-work growth, or repeated evidence invalidation;
- no cumulative architecture review is automatically required after several locally valid slices;
- commit checkpoints improve rollback and provenance but do not themselves detect unnecessary architecture;
- an approved but over-ambitious spec can keep local execution nominally “in scope.”

Freeflow Skills were disabled during this implementation. The incident therefore does not show that active `execute-plan` failed an eval. It shows that work done without those controls reproduced the failure they were designed to prevent, while also exposing gaps that active wording may still have.

### Superpowers' strongest properties

Superpowers has the strongest operational enforcement of fresh task review:

- fresh implementer per task;
- fresh reviewer after every task;
- separate spec-compliance and code-quality verdicts;
- task commits before review;
- exact task briefs, report files, and diff packages;
- durable progress ledger;
- final whole-branch review;
- explicit escalation when plan-mandated behavior itself appears defective.

This makes review checkpoints concrete rather than advisory. It would likely reduce controller overconfidence and catch extra or misunderstood implementation earlier.

### Superpowers' risks

Superpowers can still ratify an overbuilt plan:

- continuous execution explicitly avoids human checkpoints between tasks;
- task reviewers are narrow and discouraged from broad codebase inspection without a named risk;
- spec compliance can reward complexity already mandated by the spec;
- Critical/Important findings enter an automatic fix and re-review loop;
- no equivalent three-pass cap stops repeated review cycles;
- clean task commits can preserve well-versioned slop rather than prevent it.

Fresh review is necessary evidence, not automatic architectural judgment. A task reviewer needs an explicit scope/minimality lens and occasionally a cumulative view of the whole milestone.

### Agent Skills' strongest properties

Agent Skills gives the clearest simple anti-overbuilding heuristics:

- ask for the simplest working implementation;
- do not build abstractions for hypothetical requirements;
- treat one-use utility files and abstractions before a third use as red flags;
- test and verify each vertical increment;
- commit each verified slice;
- keep changes independently revertible;
- record unrelated concerns without fixing them.

These rules are easy to apply and would reduce large uncommitted speculative changes.

### Agent Skills' weaknesses

Agent Skills lacks the stronger control boundaries needed here:

- no fresh reviewer checkpoint in `incremental-implementation`;
- no explicit plan-invalidating backward edge;
- no source-truth conflict protocol at execution depth;
- no distinction between a finding and permission to fix it;
- no review-loop cap or adjudication turn;
- mandatory incremental commits can create clean history without challenging the architecture.

It is strong incremental hygiene, not a complete execution-control system.

### Matt Pocock's strongest properties

Matt's execution guidance is strongest in brevity and low ceremony:

- implement from an agreed spec or tickets;
- use TDD at pre-agreed seams;
- run focused checks regularly and the full suite once;
- perform a final two-axis review against repo standards and the spec;
- commit the result.

His TDD skill requires the user to agree test seams before tests are written. That can prevent tests from inventing architecture. His final code review runs independent Standards and Spec reviewers and explicitly checks speculative generality, middleman modules, shotgun surgery, and scope creep.

### Matt Pocock's weaknesses

As execution orchestration, the active `implement` skill is intentionally thin:

- review occurs after implementation rather than between slices;
- no intermediate review or commit routing is defined;
- no backward route when the spec becomes suspect;
- no review-loop control;
- no execution-state or handoff discipline.

This is excellent as a method skill inside a stronger workflow, but weak as a standalone lifecycle controller.

### Provisional verdict

No single pack is strongest on every axis:

- Freeflow is strongest in plan invalidation, source truth, owner control, review adjudication, failure contracts, bounded review loops, and backward routing.
- Superpowers is strongest in making fresh task reviews and task-level context isolation operationally concrete.
- Agent Skills is strongest in direct simplicity checks and easy incremental mechanics.
- Matt is strongest in concise execution guidance, pre-agreed test seams, and low-ceremony parallel final review.

For the specific failure encountered here, Freeflow has the strongest design foundation. Superpowers currently has stronger enforcement that fresh reviews actually occur. Therefore “Freeflow is strongest overall” remains a hypothesis until adversarial behavior evidence proves it stops a pressured agent during implementation.

### Review checkpoints and commit checkpoints

Two distinctions matter:

1. **Review checkpoint:** catches overconfidence only when the reviewer compares the implementation with the real outcome, scope, and accumulated architecture. A task-local reviewer enforcing an overbuilt spec can strengthen the wrong direction.
2. **Commit checkpoint:** provides rollback, provenance, causal history, and a bounded diff. It does not decide whether the committed work was necessary.

The strongest execution shape likely combines:

- Freeflow ownership of source truth, plan invalidation, owner decisions, review adjudication, and backward routes;
- selective Superpowers-style fresh task reviewers and diff packages at meaningful boundaries;
- Agent Skills-style simplicity and speculative-abstraction red flags;
- Matt-style pre-agreed test seams and concise independent final review.

This synthesis should remain selective. Importing every review after every tiny slice would create ceremony and cost. The goal is to schedule fresh review where it can change the route, especially after architecture-bearing slices, repeated surprises, evidence invalidation, or material scope growth.

### Behavior proof needed

A decisive comparison requires an adversarial eval with:

- an approved plan that initially appears valid;
- partial implementation that exposes repeated architecture edge cases;
- new modules or mechanisms that remain plausibly “in scope”;
- earlier evidence invalidated by local fixes;
- pressure to continue without owner interruption;
- a baseline that keeps patching;
- candidate behavior that freezes execution, requests cumulative fresh review, reports why the plan may be invalid, and routes to owner-backed discovery/spec/plan revision.

Success is not merely asking a question. The agent must preserve the verified checkpoint, avoid more edits or paid runs, distinguish local defect from plan invalidation, and present bounded options for keep, simplify, delete, or defer.

## Architecture-Skill Comparison And Design-For-Depth Lessons

After the reduced bootstrap artifacts repeatedly failed fresh architecture review, the owner paused artifact editing and asked whether the proposed architecture itself was correct. This was the right backward transition. The review stream was no longer exposing isolated omissions; it was showing that the chosen interface kept creating caller choreography and new public states.

The current design attempt made callers understand and coordinate:

- manifest paths and hashes;
- variant order;
- subject-resource lists;
- runner and grader identities;
- attempt and orphan paths;
- retry linkage;
- grade modes;
- comparison paths;
- integrity publication;
- crash continuation.

That growing knowledge surface is evidence of a shallow interface even when every individual rule is defensible.

### Sources inspected

The follow-up read these skills and all their direct references:

- Freeflow `design-for-depth`, `software-design-philosophy`, and `design-pressure-signals`;
- Agent Skills `api-and-interface-design` and `code-simplification`;
- Obra/Superpowers `brainstorming`, its spec-review prompt, and visual-companion guidance;
- Matt Pocock `improve-codebase-architecture`, `DEEPENING`, `INTERFACE-DESIGN`, `LANGUAGE`, and the deprecated `design-an-interface` skill.

These sources are references, not authority. Several contain useful design behavior alongside rules that would add ceremony or over-generalization if copied wholesale.

### Why this is the heart of design

The central design question is not file count or artifact length. It is:

> What must callers know, and which decisions should the module hide?

A large implementation can be deep if callers ask for an outcome through a small stable interface. A small implementation can be shallow if callers must coordinate ordering, states, retries, paths, cleanup, error recovery, and storage details.

This incident first looked like scope drift, then like missing failure contracts, then like incomplete CLI details. At the deeper level, all three were symptoms of the same problem: the seam was placed too low. The evaluator was exposing execution primitives rather than owning the evaluation outcome.

### Freeflow `design-for-depth`: current strengths

Freeflow remains the strongest foundation among the inspected skills for consequential design work because it already provides:

- design pressure as a reason to change route;
- failure contracts before happy-path implementation;
- depth, locality, leverage, seams, and adapters;
- classification into local fix, plan defect, spec gap, owner decision, bounded refactor, or defer;
- source-truth and user-owned decision protection;
- explicit resistance to speculative seams and architecture ceremony;
- deletion, interface-surface, variation, locality, decision-hiding, failure-contract, and obscurity tests;
- recognition that repeated edge-case patches may indicate missing ownership rather than isolated bugs.

These controls are stronger than a generic “design clean interfaces” checklist. They connect design evidence to workflow routing.

### Freeflow `design-for-depth`: measured gap

The active skill explains how to detect and classify design pressure, but not strongly enough what to do after pressure becomes structural.

It allowed this pattern:

1. classify a missing failure contract;
2. add more contract detail to the current interface;
3. receive another edge-case finding;
4. add another state or flag;
5. continue specifying the same interface instead of designing another one.

The missing behavior is:

> When each fix increases caller knowledge, stop specifying the current interface and generate materially different module shapes.

The skill also needs stronger distinction between:

- public interface and internal protocol;
- trust/safety requirements and efficiency/scale features;
- atomic outcome and recovery optimization;
- deletion as diagnosis and deletion as authorized change;
- tests that prove accepted behavior and tests that merely legitimize introduced machinery.

### Matt Pocock architecture guidance

Matt's architecture skill contributes the clearest deep-module discipline:

- interface means every fact a caller must know, not only type signatures;
- depth is leverage at the interface;
- locality is concentrated change, bugs, knowledge, and verification;
- the interface is the test surface;
- deep modules may contain internal seams that are not exposed publicly;
- one adapter is a hypothetical seam, while two real adapters justify variation;
- the deletion test helps determine whether a module hides useful complexity;
- “Design It Twice” requires multiple materially different interfaces before selecting one.

Matt's interface-design reference also gives a useful comparison method: generate designs optimized for minimal interface, flexibility, common-case ergonomics, or real adapter variation, then compare depth, locality, and leverage.

Do not import blindly:

- mandatory three-agent fanout for every design question would add ceremony;
- automatic `CONTEXT.md` or ADR edits during discussion can violate artifact/user authority;
- failure contracts and owner-decision routing are weaker than Freeflow's;
- interface exploration should trigger from real structural pressure, not every local reversible choice.

Best import: Design It Twice, caller-knowledge accounting, and public/internal seam discipline.

### Agent Skills API/interface guidance

Agent Skills contributes several strong contract rules:

- contract first;
- make correct use easy and misuse hard;
- validate at external boundaries;
- keep error semantics predictable;
- Hyrum's Law: every observable behavior can become depended upon;
- public flags, paths, ordering, timing, errors, and undocumented quirks all carry compatibility cost.

This is directly relevant to the evaluator CLI. Every exposed manifest path, orphan state, retry flag, grade mode, and filename risks becoming a lasting contract.

Do not import blindly:

- REST and GraphQL checklists do not generalize to every internal developer tool;
- always adding pagination or versioning can conflict with YAGNI;
- additive compatibility can preserve a bad internal interface;
- contract-first guidance alone does not detect when the contract is at the wrong seam.

Best import: observable contract cost, consistent failure semantics, and boundary validation.

### Agent Skills code-simplification guidance

The simplification skill contributes:

- Chesterton's Fence: understand why code exists before deleting it;
- preserve behavior and error semantics;
- simplify within current scope;
- clarity matters more than line count;
- separate refactoring from feature work;
- speculative abstractions are not justified by hypothetical future value.

This sharpens Freeflow's deletion test:

> Deletion test diagnoses depth. It is not permission to delete. Inspect source truth, callers, tests, history, and the reason the module exists first.

Do not import blindly:

- behavior-preserving simplification can preserve the wrong architecture when tests encode accidental machinery;
- it operates after implementation and does not replace interface exploration;
- “tests unchanged” is not enough when tests themselves ratify unowned complexity.

Best import: Chesterton's Fence and scoped, behavior-preserving cleanup after architecture is settled.

### Obra/Superpowers brainstorming guidance

Superpowers contributes the clearest explicit design-selection loop:

- inspect project context;
- identify oversized scope early;
- ask focused questions;
- propose two or three approaches with tradeoffs;
- present design in sections;
- obtain user approval before implementation;
- self-review for placeholders, contradictions, ambiguity, scope, and YAGNI.

This would have prevented the first plausible architecture from becoming the only architecture.

Do not import blindly:

- mandatory design artifacts for every task create ceremony;
- hard gates for tiny reversible changes conflict with Freeflow's risk-scaled pressure;
- repeated section-by-section approvals can be expensive;
- automatic design-doc creation should not override user artifact intent.

Best import: alternatives before commitment and owner approval for consequential interface choices.

## Proposed `design-for-depth` Improvement

Do not create a new skill. This behavior belongs to the existing design lens.

### Add a structural-pressure design loop

When pressure changes the route:

1. **Name the module and atomic outcome.** What complete outcome should the caller request?
2. **Define the failure unit.** What is all-or-nothing, what may remain diagnostic, what is safe to restart, and what must never happen?
3. **Inventory caller knowledge.** List commands, flags, ordering, states, paths, retries, cleanup, configuration, errors, cost, and recovery facts.
4. **Separate ownership.** Which facts are caller-owned decisions, and which are internal protocol?
5. **Design it twice.** Produce two or three materially different interfaces, not minor variations of the same storage model.
6. **Compare designs.** Judge depth, locality, correct-use ergonomics, misuse risk, failure behavior, maturity fit, and evidence cost.
7. **Route deliberately.** Continue, revise plan, revise spec/discover, ask owner, bounded refactor, or defer.

Do not patch the existing interface before alternatives exist when caller knowledge is still growing.

### Add a caller-knowledge test

For a proposed module, list everything a caller must know to use it correctly.

Ask:

- Does the caller own this decision?
- Could the module own it instead?
- Is the fact stable enough to expose publicly?
- Would changing it force caller, test, and documentation edits?
- Did another review pass add more caller knowledge?

A growing list is stronger evidence of shallowness than line or file count.

### Add a public-versus-internal rule

Proposed principle:

> Public interfaces expose caller-owned outcomes and decisions. Keep storage layout, integrity publication, retry mechanics, cleanup, internal state, and provider mechanics inside the module unless the caller must control them.

Internal modules may remain detailed and independently testable. They do not all need public seams.

### Strengthen failure-contract design

Before designing retries or resume, choose the atomic unit:

- attempt;
- variant;
- comparison;
- evaluation session;
- acceptance result.

Then define:

- terminal states;
- observers;
- state/evidence written;
- safe restart unit;
- whether partial reuse is a requirement or an optimization;
- fail-open, fail-closed, degrade, escalate, retry, or stop behavior;
- forbidden outcomes;
- recovery proof.

Retry, resume, cache, and partial reuse are separate capabilities. They are not automatic consequences of durability.

### Add a maturity-stage classifier

Classify each proposed capability:

- **Trust requirement:** needed to know evidence is valid.
- **Safety requirement:** needed to prevent damage, leakage, or runaway work.
- **Efficiency feature:** saves time, model requests, or money.
- **Scale feature:** needed for concurrency or volume.
- **Portability feature:** needed for more hosts/environments.

Bootstrap implements trust and minimum safety. Efficiency, scale, and portability require observed pressure and a later owner-approved milestone.

### Add a contract-surface test

Apply Hyrum's Law before exposing a flag, path, state, filename, ordering rule, or error:

- Does caller own it?
- Can implementation change it later?
- Does exposure make correct use easier?
- Does it only leak internal protocol?
- Could one outcome-level operation hide it?

Public flexibility has permanent coordination cost.

### Add requirement ownership for architecture tests

Every architecture-bearing test should name the requirement or measured failure it protects.

If deleting a feature also deletes its tests while acceptance remains unchanged, those tests do not justify the feature. Tests should target the intended interface and failure contract, not internal choreography.

### Proposed skill/reference shape

Keep active `SKILL.md` concise. Add only the behavior that changes routing:

```text
When design pressure becomes structural:
1. Name atomic outcome and failure unit.
2. List what callers must know.
3. Separate caller-owned decisions from internal protocol.
4. Design it twice with materially different interfaces.
5. Compare depth, locality, misuse risk, failure behavior, and maturity fit.
6. Route to local fix, plan revision, spec/discovery, owner decision, bounded refactor, or defer.

Do not add retry, resume, cache, concurrency, adapters, or extension points until observed pressure requires them.
```

Update existing references with:

- Hyrum's Law and contract-surface cost;
- public versus internal interfaces;
- atomic outcome/failure unit;
- maturity-stage classification;
- caller choreography and contract-surface explosion signals;
- requirement-owned architecture tests.

One new conditional reference is justified by this measured failure:

```text
skills/design-for-depth/references/interface-design-loop.md
```

It should contain the design-twice process, comparison criteria, and owner gate. No new skill is justified.

## Historical Architecture Directions For `evaluate-skill`

These were the alternatives considered before the owner selected the outcome-level evaluator architecture. They remain useful design history, not current options or implementation authority.

The accepted direction deepened Option 1 further: instead of public `plan`, `run`, `grade`, and `report` choreography, one public `evaluate` operation owns deterministic preflight, execution, grading, comparison, integrity, and publication. Optional `--plan-only` supports preview without making planning a required separate lifecycle.

### Option 1: Comparison-run module

Public shape:

```bash
skill-eval plan --skill <name> --case <id> --output <manifest>
skill-eval run --manifest <manifest>
skill-eval grade --bundle <bundle> ...
skill-eval report --bundle <bundle> ...
```

The module owns variant order, subject resources, fixture copies, identity hashes, isolation, evidence capture, objective grading, integrity, and publication.

Failure contract:

- a complete comparison bundle is the atomic success unit;
- crash or hard failure leaves an incomplete diagnostic bundle;
- incomplete bundle is never acceptance evidence;
- bootstrap does not continue or partially reuse it;
- owner-approved rerun executes the complete comparison again;
- mature cache/resume may optimize later if observed cost justifies it.

Benefits:

- deep outcome-level interface;
- no stranded candidate state;
- no public orphan/retry protocol;
- no caller-managed attempt choreography;
- failure behavior is easy to explain and test.

Tradeoff: a crash after control can require rerunning control. For a low-volume bootstrap, explicit repeated cost may be safer than lifecycle machinery.

This was the provisional recommendation. The owner later approved its outcome-level principle and simplified the public shape further to one `evaluate` operation.

### Option 2: Attempt toolkit

Public shape exposes manifest, variant, attempt, retry, grade, comparison, and integrity primitives.

Benefits:

- flexible;
- can preserve completed control work;
- useful foundation for a mature scheduler.

Costs:

- shallow interface;
- caller choreography;
- public storage protocol;
- every recovery edge adds states and flags;
- recreates mature harness concerns inside bootstrap.

This resembled the earlier uncommitted spec/plan direction. It was rejected for bootstrap and no longer describes the current artifacts.

### Option 3: Case-specific direct scripts

Each important case owns a small direct Pi script rather than one generic evaluator.

Benefits:

- smallest individual implementation;
- no generalized lifecycle;
- easy local reasoning.

Costs:

- duplicated isolation and evidence logic;
- weaker locality across cases;
- drift between scripts;
- poor foundation for later Freeflow skill development.

This is likely too narrow for the intended dogfooding foundation.

## Design-For-Depth Evals Needed

### Patch-stream eval

An approved plan repeatedly exposes lifecycle edge cases. Baseline keeps adding states and flags. Desired behavior identifies growing caller knowledge, freezes edits, and generates different interfaces.

### Caller-choreography eval

A CLI requires callers to coordinate manifests, paths, retries, grades, and integrity. Desired behavior identifies a shallow interface and proposes an outcome-level module.

### Bootstrap-versus-scale eval

The task asks for one trustworthy result, while implementation starts adding cache, resume, concurrency, and adaptive repeats. Desired behavior classifies them as efficiency/scale and defers them.

### Failure-unit eval

A happy path exists and a retry edge appears. Desired behavior chooses atomic outcome and safe restart unit before specifying retry semantics.

### Near-miss eval

A small local reversible function change should not trigger interface fanout, architecture artifacts, or reviewer ceremony.

Useful evidence compares baseline versus with-skill behavior and should make baseline patch forward while the candidate stops, designs alternatives, preserves owner control, and avoids file edits until direction is approved.

## Outcome-Level Evaluator Decision

The owner selected the deep outcome-level evaluator architecture.

Public shape:

```bash
skill-eval doctor
skill-eval init
skill-eval evaluate --skill <name> --case <id> ...
```

Normal evaluation flow:

```text
one evaluate call
-> deterministic no-provider preflight
-> stop when invalid, unsupported, changed, over limit, or unapproved
-> otherwise execute one complete case
-> run case-declared variants serially
-> grade objective evidence
-> use fresh semantic judgment only when fixed assertions require it
-> atomically publish one trusted result bundle
```

Optional `--plan-only` supports preview. It is not a required caller-managed lifecycle.

Confirmed boundaries:

- one case per invocation;
- a case may be single-subject or reference-versus-candidate;
- complete case result is atomic success unit;
- infrastructure failure publishes diagnostics only;
- restart reruns whole case;
- no cache, resume, partial reuse, concurrency, adaptive repeats, public attempts, public grading, or public report assembly;
- no batching inside evaluator;
- output router or shell composition may combine independent commands later;
- Pi is the concrete only host;
- prototype runs remain documentary evidence only.

The spec and plan were rewritten around this architecture and remain modified but uncommitted. No evaluator code or paid model eval followed the rewrite.

## Artifact Review Reliability Incident

The rewritten artifacts were sent through fresh Pi reviewer fanout. The first review was useful. The confirmation review then reproduced the exact review-loop failure Freeflow's `review-artifact` and `review-work` skills were designed to prevent.

### First review pass

Two reviewers agreed the deep architecture was coherent, bounded, Pi-first, and implementable. They found three real public/trust gaps:

1. Single-variant activation cases could not produce the only advertised comparative verdict.
2. The artifact conflated Pi processes, turns, and observed provider requests in the owner-approved budget contract.
3. Terminal JSON, exit status, and error-channel behavior were not defined enough for an automation-facing CLI.

Parent adjudication: accepted all three.

Initial owner decisions and artifact revisions:

- distinguish one-subject single cases from `reference`/`candidate` comparisons;
- make budget units explicit instead of conflating Pi process, turn, and observed provider request;
- return machine-readable operational outcomes.

The first implementation of those decisions overreached: it added an `unsupported` top-level verdict, an unproven global provider-request hard cap, and an exhaustive envelope/exit taxonomy. The later parent review-delta audit kept the underlying findings and simplified their solutions.

The original findings affected observable behavior, trust, or owner-approved resource limits. They were legitimate; their first fixes were not automatically optimal.

### Confirmation review

A second fresh parallel review was intended to confirm those fixes. One reviewer exceeded its turn budget after broad inspection. The other returned `NON-PASS` with four new alleged blockers:

- exact case JSON keys, types, assertion encoding, and suite lookup were not exhaustively specified;
- timeout/output limit scope was ambiguous across serial Pi processes;
- every machine `code` and phase pairing was not enumerated;
- evaluator root discovery was not explicitly specified.

A related feasibility question also remained: whether the Pi guard can reliably reject the request that would exceed the global provider cap before dispatch.

### Why confirmation quality degraded

The problem was not fresh context by itself. It was reviewer contract and orchestration.

The builtin Pi reviewer:

- did not inherit Freeflow skills;
- used a generic plan/solution/code-review role;
- defaulted to reading root `plan.md` and `progress.md`, which do not exist here;
- received a binary `PASS|NON-PASS` request instead of Freeflow's finding taxonomy;
- was asked whether the artifacts formed a “total public contract without implementation invention.”

That last phrase was the largest prompt defect. Every implementation requires local reversible choices. Freeflow's actual standard is narrower: block only issues that would cause wrong work, blocked work, hidden owner decisions, or stale authority.

The second prompt also broadened after the situation had narrowed. It asked for general implementation readiness, CLI grammar, and error-channel completeness instead of confirming only the three previously accepted findings and any residual trust risk. This invited new issue generation rather than convergence.

Binary pass/fail then converted every possible omission into artifact failure. It erased the distinction between:

- a blocking owner/public contract gap;
- a non-blocking implementation detail;
- a question;
- a claim needing evidence;
- reviewer noise.

## Parent Adjudication Of Review Findings

Reviewer output is evidence, not authority.

Current adjudication:

| Finding | Classification | Reason |
| --- | --- | --- |
| Single/comparison verdict was not total | Accepted | Implementer would invent observable result semantics. |
| Provider request/process/turn budget was conflated | Accepted, solution simplified | The ambiguity was real, but the first fix overreached by promising a global provider-request hard cap. Pi exposes enforceable turn aborts and observed provider-request events. The revised contract uses per-process hard turn/timeout/output limits, disables automatic retries, and reports provider requests honestly. |
| Terminal status/exit/error envelope was absent | Accepted, solution simplified | Concise machine-readable outcomes are useful, but exhaustive phases, machine codes, mandatory null fields, and six numeric exit classes were review-induced contract inflation. |
| Exact case-source JSON representation must be frozen in the spec | Rejected / contract inflation | Version-controlled case encoding is a local implementation contract constrained by live cases, tests, and `init`; it is not another public lifecycle. |
| Every machine code must be enumerated before implementation | Rejected / noise | A concise status/result/diagnostic shape is enough for bootstrap; exact code taxonomy can remain local until a real consumer needs it. |
| Root discovery needs another owner architecture decision | Rejected / local choice | Preserve current cwd/`--root` convention; no settled product behavior changes. |
| Timeout/output scope is ambiguous | Resolved | Live runner behavior and owner approval establish per-Pi-process timeout and output limits. Preflight reports maximum process count and worst-case approved turns. |
| Pi can reject before an over-cap provider request is dispatched | Resolved by narrowing claim | `before_provider_request` can inspect/replace payload but is not documented as a cancellation hook. The bootstrap no longer promises a global provider-request hard cap; it enforces turns before provider calls and observes requests. |

The architecture did not acquire four new blockers. The review process lost calibration, and the parent audit removed the resulting contract inflation.

## Generator, Reviewer, Adjudicator, Verifier

The owner compared the system to a generative adversarial network: artifact quality depends on both generator and reviewer quality. This is useful, but the operational model needs four roles:

```text
generator -> reviewer -> adjudicator -> verifier
```

- **Generator** creates the smallest artifact that can guide work.
- **Reviewer** tries to falsify consequential claims against the artifact and source contract.
- **Adjudicator** classifies findings and preserves owner authority.
- **Verifier** grounds final claims in tests, live source truth, reproducible behavior, or explicit human judgment.

The reviewer is not an oracle. A two-role generator/reviewer loop can collapse in either direction.

False-negative collapse:

```text
shallow or contradictory artifact
-> reviewer rubber-stamps it
-> implementation inherits hidden decisions
```

False-positive collapse:

```text
reviewer treats every omission as blocker
-> generator adds more contract detail
-> larger contract exposes more possible omissions
-> reviewer finds more blockers
-> artifact grows without becoming more useful
```

The second pattern is a specification arms race. The generator optimizes for reviewer approval instead of outcome clarity. The reviewer rewards exhaustive surface area, which can make interfaces shallower and implementation harder.

If generator and reviewer share the same model, prompt framing, or assumptions, errors may also be correlated. Cross-model review can diversify blind spots but does not replace source truth, adjudication, or executable evidence.

## Review Reference-Stack Findings

### Freeflow

Freeflow already has the strongest review control model:

- findings are evidence, not commands;
- parent owns adjudication;
- findings are classified as accepted, rejected, question, or needs evidence;
- non-blocking findings and questions do not fail work by default;
- a non-pass is a phase exit, not an autonomous patch loop;
- the receiving turn reports adjudication and route before edits;
- second and later prompts include prior findings, owner clarifications, adjudication, changed sections, and narrowed remaining risk;
- aim to finish by two passes;
- three passes is a hard cap for the same artifact/scope;
- review can pass and must not invent findings.

This exact class of failure was previously documented and evaluated:

- `docs/issues/output-router/2026-06-16-artifact-review-loop-adjudication.md`
- `evals/reports/by-skill/review-artifact-2-report.md`
- `evals/reports/by-skill/review-artifact-4-report.md`
- `evals/reports/by-skill/review-artifact-5-report.md`
- `evals/reports/by-skill/review-work-5-report.md`
- `evals/reports/by-skill/review-work-6-report.md`

`RAR-002` protects the clean pass path. `RAR-004` and `REV-005` protect parent adjudication and the three-pass cap. `RAR-005` and `REV-006` protect the rule that non-pass ends the phase before edits.

Freeflow Skills were disabled during this architecture work, so the generic Pi reviewer did not apply those skills automatically. The lesson is not to ignore the disabled control plane. It is that reviewer dispatch must still use a calibrated reviewer contract when independent review is explicitly requested.

### Obra/Superpowers

Superpowers contributes:

- pass requirements and exact work, not session history;
- review early enough that corrections remain cheap;
- receive external feedback skeptically;
- verify against the actual codebase;
- push back with technical evidence when reviewer is wrong;
- approve a spec unless serious gaps would cause a flawed plan;
- do not treat wording, style, or uneven detail as blockers.

Its spec reviewer is better calibrated than the generic confirmation prompt used here. Its main gap is weaker explicit review-loop termination.

### Agent Skills

`code-review-and-quality` contributes broad correctness, readability, architecture, security, performance, and verification lenses. Its approval standard is improvement, not perfection; reviewer preference is not a blocker and a human makes the final call.

`doubt-driven-development` contributes the clearest adversarial-review reconciliation:

1. contract misread;
2. valid and actionable;
3. valid trade-off;
4. noise caused by missing context.

It explicitly says fresh reviewer output is data, not verdict, and caps doubt cycles at three.

### Matt Pocock

The inspected Matt collection has no equivalent dedicated artifact-review skill. Its related guidance still supports calibrated review:

- build a deterministic feedback loop before hypothesizing;
- reproduce the claimed failure, not a nearby one;
- present architecture candidates and let the owner choose what to explore;
- use domain language and live ADRs;
- record durable rejection reasons so later architecture passes do not repeatedly suggest the same rejected change;
- prefer a few high-leverage findings over exhaustive ceremony.

Matt's approach treats critique as decision support, not authority to expand scope.

## Controlled Cmux Reviewer Calibration

The owner replaced generic Pi subagent review for this phase with a directly controlled reviewer process in a focus-neutral cmux helper pane.

Execution controls:

- caller workspace identified explicitly;
- one right-side helper pane created without focus change;
- raw `pi --mode json --no-session` process;
- `openai-codex/gpt-5.6-sol`, `xhigh` thinking;
- no project approval, context files, extensions, skills, prompt templates, or themes;
- read-only `read,grep,find,ls` tools;
- exact calibrated artifact-review system prompt;
- raw events, stderr, final JSON, and usage stored under a temporary directory outside the repo;
- no repository edits.

Initial three fixtures:

| Fixture | Expected | Reviewer | Adjudication |
| --- | --- | --- | --- |
| Existing “clean” grace-period spec | Pass | Blocking | Reviewer found a real ambiguity: seven-day grace and third-failure downgrade had no timing relationship. Existing clean-pass ground truth was too weak. |
| Immediate-downgrade source conflict | Blocking | Blocking | Correctly cited billing policy and tests; no implementation-detail inflation. |
| Explicitly delegated local implementation details | Pass | Pass | Correctly left helper names, module placement, private signatures, and internal error enum to implementation. |

The existing clean fixture was clarified in temporary calibration evidence so the third and final retry occurs at day-seven grace expiry and downgrade requires both elapsed time and three failures. One owner-approved confirmation call returned a clean pass.

Recorded reviewer calibration usage:

```text
4 calls
$0.098105 recorded cost
```

The reviewer therefore demonstrated clean-pass, source-conflict, and local-detail discrimination under the controlled prompt. This did not make it authoritative. It made it suitable for one narrow artifact confirmation followed by parent adjudication.

The final narrow confirmation reviewed only the parent-audited changes and settled decisions. It returned one blocking finding: the plan's unqualified statement that “unsupported evidence cannot become pass” contradicted the spec and required `ESK2-007` behavior, where a case may pass by proving that the subject honestly reports a capability as unsupported.

Parent adjudication accepted that finding. The plan was corrected to distinguish unsupported evaluator evidence from a behavioral assertion about honest unsupported-capability reporting. No further review was requested.

Final confirmation usage:

```text
1 call
$0.373372 recorded cost
```

Total controlled reviewer usage for calibration plus confirmation:

```text
5 calls
$0.471477 recorded cost
```

The calibration also exposed an eval lesson: a surprising reviewer result can reveal broken expected ground truth rather than a broken reviewer. Fixture, reviewer, and adjudicator must all remain challengeable.

## Reviewer Quality Contract

A useful artifact reviewer should receive:

- the artifact;
- artifact type;
- source truth and explicit owner decisions;
- current review pass number;
- prior findings and parent adjudication;
- changed sections;
- one narrowed remaining risk on later passes;
- a burden of proof for blocking findings.

A blocking finding should name:

```text
location
violated accepted requirement or source truth
concrete wrong-work/trust consequence
why the issue cannot remain a local reversible implementation decision
smallest safe route
```

Reviewer output should separate:

```text
Pass
Blocking
Non-blocking
Question
Needs evidence
```

The reviewer may recommend. It may not silently settle owner decisions or convert its own preferred implementation detail into source truth.

The parent then classifies every material finding:

```text
Accepted
Rejected
Question
Needs evidence
```

Only accepted blockers stop the phase. A reviewer `NON-PASS` string alone is not a gate result.

For confirmation reviews:

- do not rerun a broad first-pass prompt;
- do not re-raise rejected findings without contradictory live evidence;
- inspect only accepted fixes and named residual risk;
- allow a clean pass;
- stop after the review budget instead of chasing unanimous approval.

## Reviewer Evals Needed

Review quality needs precision and recall, not issue count.

Recommended adversarial fixtures:

### Clean artifact

Artifact is sufficient and consistent. Desired result: pass without invented findings or owner questions.

### Real blocker

Artifact contradicts live policy, tests, or a settled public contract. Desired result: blocking with exact evidence and no edit.

### Local implementation omission

Artifact leaves a reversible encoding, helper shape, filename, or internal taxonomy unspecified. Desired result: no blocker.

### Owner decision

Artifact genuinely leaves product, public behavior, security, compatibility, spend, or architecture unresolved. Desired result: question, not invented resolution.

### Stale reviewer assumption

Reviewer context includes an older design that the owner superseded. Desired result: reject stale framing unless live source truth contradicts the new decision.

### Narrow confirmation

Prior blockers were adjudicated and fixed. Desired result: inspect only changed sections and residual risk; do not generate a new broad checklist.

### Third-pass cap

Substantive findings remain after three passes. Desired result: stop, classify, and diagnose generator, reviewer, source contract, scope, or evidence rather than request another broad review.

### Reviewer disagreement

Two reviewers disagree. Desired result: parent compares evidence and accepted contract; reviewer count or confidence language does not decide truth.

Useful measures:

```text
blocker precision
known-blocker recall
false-block rate on clean artifacts
owner-decision leakage
stale-finding recurrence
review rounds to convergence
accepted-blocker rate by reviewer
```

A reviewer that flags every possible omission may have high recall and unusable precision. A reviewer that always passes may have high precision on clean artifacts and unusable recall. Both are broken.

## Implementation Review Cap And Backward Diagnosis

The outcome-level spec/plan and review-reliability handoff were committed in `2d4cb62`. Updated portable `review-artifact` and `review-work` contracts were committed in `719b268`.

The first Slice 1 implementation then changed 46 files, adding roughly 942 lines and deleting 1,691. Deterministic verification reached 45 passing tests with no paid subject or semantic run, but the full cutover remained uncommitted.

Manual implementation review used the committed `review-work` contract rendered into isolated, read-only Pi JSON prompts. Three bounded passes ran from a focus-neutral cmux pane.

### Pass 1

Accepted blockers:

- plan approval did not bind evaluator/semantic implementation identity;
- `result.json` lacked required provenance;
- failure/spend accounting lost settled usage and mishandled soft-ceiling boundaries;
- model-facing grading guidance retained per-side repeat/partial reuse;
- parent additionally found Git subject resources were not all validated in preflight.

### Pass 2

The reviewer confirmed four fixes and retained one accepted blocker:

- post-process artifact-write and cleanup failures could still lose settled subject/semantic usage or replace the primary failure.

### Pass 3

The settled-execution outcome fix and fault tests passed, but the terminal review found one accepted blocker:

- final diagnostic publication suppressed write/rename failure, could let directory creation replace the primary failure, and could advertise a nonexistent diagnostic path.

Pass 3 reached the hard cap. No fourth review is allowed for the same work and scope.

Implementation-review usage:

```text
3 calls
$2.953681 recorded cost
```

Raw review evidence:

```text
/tmp/freeflow-work-review-slice1/result/
/tmp/freeflow-work-review-slice1/result-pass2/
/tmp/freeflow-work-review-slice1/result-pass3/
```

All accepted findings were source-backed against the committed failure contract. This was not the earlier artifact-review contract-inflation failure.

### Root diagnosis

The public one-command design remains valid. The failure is internal plan slicing and module depth.

The old Slice 1 combined CLI, preflight, process execution, accounting, grading, result composition, result publication, diagnostic publication, legacy deletion, and model-facing docs in one cutover. The old Slice 2 then separately promised crash boundaries, atomic publication, and diagnostic/result separation. Publication correctness was therefore both required before Slice 1 could pass and deferred until Slice 2.

Implementation mirrored that contradiction:

- one coordinator owned process state, filesystem evidence, budgets, grading, cleanup, and publication;
- exceptions transported settled execution state;
- diagnostics were assembled and published inside a terminal catch block;
- tests followed discovered examples rather than a complete fault matrix;
- review happened after a 46-file cutover instead of after the risky internal boundaries.

Repeated usage/cleanup/publication findings are one design-pressure cluster, not independent random bugs. The missing deep boundaries are:

```text
SettledExecution
AppendOnlyEvaluationLedger
OperationOutcome
PublicationOutcome
```

The plan is revised to prove those boundaries before coordinator and CLI cutover.

## Current Artifact Implication

- The spec remains implementation authority for public behavior.
- The plan is revised and uncommitted around risk-first internal slices.
- The current evaluator working tree is diagnostic evidence, not an accepted implementation baseline.
- Do not revert to the attempt-toolkit public design.
- Do not continue patching the current coordinator or request another review.
- No paid subject or semantic eval may run.

## Unresolved Owner Decision

Choose the implementation re-entry route before code resumes:

1. **Recommended rebuild:** preserve an exact patch, restore evaluator/case paths to committed `719b268`, then rebuild through outcome-ledger, process-outcome, publication, coordinator, and CLI slices.
2. **In-place salvage:** preserve the working tree and extract those same boundaries before committing any coordinator or CLI cutover.

The rebuild route gives cleaner commits and proves the corrected plan. It requires an explicit destructive reset after the patch is preserved. The salvage route avoids reset but carries more hidden coupling from the failed slice.

Later review-system automation remains separately deferred. It does not block this re-entry decision.

## Do Not Do Next

- do not run a fourth implementation review or another broad artifact review;
- do not patch only the terminal diagnostic catch block;
- do not commit the current monolithic cutover as complete;
- do not reset or discard the working tree before owner chooses the re-entry route;
- do not treat reviewer count, confidence, or labels as authority without parent evidence;
- do not add batching, cache, resume, concurrency, adapters, or output-router coupling;
- do not run paid subject/semantic evals or finish pending semantic grades;
- do not write `bootstrap-acceptance.md` as if implementation exists;
- do not modify `.freeflow/config.json`.

## Recommended Resume Sequence

1. Read this handoff, the committed spec, revised live plan, and current evaluator diff.
2. Reconfirm branch, worktree, active processes, and `.freeflow/config.json` state.
3. Keep implementation edits, model review, and paid evals paused.
4. Run deterministic consistency checks on the revised plan and this handoff.
5. Commit the backward diagnosis and risk-first plan separately from evaluator code.
6. Ask the owner to choose rebuild or in-place salvage.
7. If rebuild is chosen, save and hash the full patch/status before any reset.
8. Implement and commit the deep internal contracts in risk order before public cutover.
9. Use deterministic fault injection and parent audit; do not run a fourth review for the capped scope.
10. Resume paid dogfooding only after deterministic acceptance of the final cutover.

## Live Evidence To Reopen

Core artifacts:

- `docs/specs/skills/skill-authoring-and-evaluation-v2.md`
- `docs/plans/skills/2026-07-10-skill-authoring-and-evaluation-v2-bootstrap-plan.md`
- `skills/write-skill/SKILL.md`
- `skills/evaluate-skill/SKILL.md`
- `skills/write-skill/references/`
- `skills/evaluate-skill/references/`
- `skills/write-skill/scripts/`
- `skills/evaluate-skill/scripts/`
- `.skill-eval/write-skill/`
- `.skill-eval/evaluate-skill/`

Current implementation pressure points:

- `skills/evaluate-skill/scripts/lib/plan.mjs`
- `skills/evaluate-skill/scripts/lib/evaluate.mjs`
- `skills/evaluate-skill/scripts/lib/semantic.mjs`
- `skills/evaluate-skill/scripts/lib/materialize.mjs`
- `skills/evaluate-skill/scripts/lib/grade.mjs`
- `skills/evaluate-skill/scripts/skill-eval.mjs`
- `.skill-eval/evaluate-skill/tests/plan.test.mjs`
- `.skill-eval/evaluate-skill/tests/evaluate.test.mjs`
- `.skill-eval/evaluate-skill/tests/semantic.test.mjs`

Review-system evidence:

- `skills/review-artifact/SKILL.md`
- `skills/review-artifact/references/reviewer-prompt.md`
- `skills/review-work/SKILL.md`
- `skills/review-work/references/reviewer-prompt.md`
- `skills/verify-work/SKILL.md`
- `docs/issues/output-router/2026-06-16-artifact-review-loop-adjudication.md`
- `evals/reports/by-skill/review-artifact-2-report.md`
- `evals/reports/by-skill/review-artifact-4-report.md`
- `evals/reports/by-skill/review-artifact-5-report.md`
- `evals/reports/by-skill/review-work-5-report.md`
- `evals/reports/by-skill/review-work-6-report.md`

Project context:

- `AGENTS.md`
- `CONTEXT.md`
- `docs/README.md`
- `docs/freeflow-current-state.md`
- `docs/freeflow-runtime-and-lifecycle.md`
- `plugin-docs/workflow.md`
- `plugin-docs/architecture.md`
- `evals/README.md`
- `docs/handoffs/workflow-and-skills/2026-06-21-agent-skills-comparison-handoff.md`},{

Generated evidence is under:

- `.skill-eval/write-skill/runs/`
- `.skill-eval/evaluate-skill/runs/`
- `.skill-eval/write-skill/reports/`
- `.skill-eval/evaluate-skill/reports/`

Generated runs are evidence, not source authority. Prefer frozen case definitions, raw artifacts, and current code over summary prose.

## Closing Principles

The implementation lesson is not “agents should never adapt.” It is:

> Adapt locally while evidence supports the plan. When evidence challenges the plan or milestone boundary, stop adapting locally and reconsider globally.

The review lesson is not “reviewers should find more issues.” It is:

> Review against accepted outcomes and live evidence. Treat findings as hypotheses, adjudicate them, and stop when critique becomes contract inflation rather than risk reduction.

A trustworthy coding system needs a capable generator, a calibrated reviewer, an accountable adjudicator, and independent verification. Forward momentum without review becomes uncontrolled production. Review without adjudication becomes uncontrolled specification.
