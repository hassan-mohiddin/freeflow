# Implementation Scope Drift And Replanning Handoff

Date: 2026-07-11

## Purpose

Preserve what happened while bootstrapping Freeflow's v2 `write-skill` and `evaluate-skill`, why implementation kept expanding, what this may reveal about agent workflow design, and how to resume the broader Agent Skills comparison without repeating the same failure mode.

This handoff is memory, not authority. Reopen linked live files, inspect current git state, and confirm owner decisions before consequential work. Do not treat hypotheses below as accepted product decisions.

Owner update: use Pi fresh-context subagents, not cmux, for independent reviews. This handoff remains the durable failure context; no additional handoff is required before revising the owning spec and plan.

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

## Candidate Architecture Directions For `evaluate-skill`

These remain design options, not accepted decisions.

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

This is the current recommendation, not yet owner-approved.

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

This resembles the current uncommitted spec/plan direction and is not recommended for bootstrap.

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

## Current Artifact Implication

The current spec and plan were revised toward an attempt-toolkit interface and remain modified but uncommitted. Fresh reviews continued finding lifecycle edge cases because the interface requires callers and artifacts to coordinate low-level protocol.

Do not keep patching those artifacts yet. First decide which evaluator module/interface should own the outcome. If the comparison-run module is selected, rewrite the artifacts around that deep interface and simpler failure contract rather than preserving the current attempt-level CLI.

This is now the central owner decision before any evaluator code work.

## Unresolved Owner Decisions

Review and discuss before editing:

1. Which evaluator module/interface should own the outcome: comparison-run module, attempt toolkit, case-specific scripts, or another materially different design?
2. What is the atomic success and failure unit: attempt, variant, comparison bundle, or evaluation session?
3. Is rerunning a complete comparison after interruption acceptable for the low-volume bootstrap?
4. Should prototype runs remain documentary evidence only, rather than enter the new runtime's integrity and comparison path?
5. What is the minimum trustworthy bootstrap outcome after the interface choice?
6. Should `design-for-depth` be strengthened and evaluated before evaluator implementation resumes, or should its lessons first guide the evaluator artifacts?
7. Should the current modified spec/plan be discarded and rewritten around the chosen deep interface, or selectively revised?
8. What objective scope/complexity signals should force re-entry without becoming arbitrary numeric targets?
9. Which existing Freeflow skills should own design-pressure detection, interface exploration, artifact revision, and implementation re-entry?
10. How should fresh reviewer and design-alternative fanout be bounded so it catches route-changing evidence without becoming mandatory ceremony?

## Do Not Do Next

Until review and owner discussion:

- do not run more paid model evals;
- do not finish pending semantic grades automatically;
- do not patch host-free fingerprinting;
- do not keep patching or commit the current attempt-toolkit spec/plan before selecting the evaluator interface;
- do not add more modules, schemas, reports, or cases;
- do not write `bootstrap-acceptance.md` as if current architecture is already accepted;
- do not delete current code based only on concern about size;
- do not continue into Pi RPC, Codex, Claude, legacy migration, or other skill rewrites;
- do not modify `.freeflow/config.json`.

## Recommended Resume Sequence

1. Read this handoff and reopen live spec, plan, code, tests, and latest run evidence.
2. Reconfirm branch, worktree, active processes, spend evidence, and committed `.freeflow/config.json` state.
3. Keep paid evals and evaluator code changes paused.
4. Frame the evaluator problem around callers, atomic outcome, failure unit, hidden decisions, and observed constraints.
5. Use a bounded Pi fresh-context Design It Twice fanout to produce materially different interfaces.
6. Compare designs by depth, locality, caller knowledge, misuse risk, failure contract, maturity fit, and evidence cost.
7. Obtain owner selection of the evaluator interface and bootstrap failure contract.
8. Decide whether to update/evaluate `design-for-depth` before or after the evaluator artifact rewrite.
9. Rewrite or selectively revise the current uncommitted spec/plan around the chosen interface.
10. Run one fresh artifact review with calibrated blockers; adjudicate once.
11. Implement only approved bounded slices.
12. Run only evidence required by the revised acceptance contract.
13. Write acceptance report, run final read-only audit, adjudicate, and stop.
14. Resume the wider Agent Skills comparison using this incident as a workflow and design-pressure eval source.

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
- `skills/evaluate-skill/scripts/lib/wave.mjs`
- `skills/evaluate-skill/scripts/lib/run.mjs`
- `skills/evaluate-skill/scripts/lib/semantic.mjs`
- `skills/evaluate-skill/scripts/lib/grade.mjs`
- `.skill-eval/evaluate-skill/tests/fingerprint.test.mjs`
- `.skill-eval/evaluate-skill/tests/wave-resume.test.mjs`

Project context:

- `AGENTS.md`
- `CONTEXT.md`
- `docs/README.md`
- `docs/freeflow-current-state.md`
- `docs/freeflow-runtime-and-lifecycle.md`
- `plugin-docs/workflow.md`
- `plugin-docs/architecture.md`
- `evals/README.md`
- `docs/handoffs/workflow-and-skills/2026-06-21-agent-skills-comparison-handoff.md`

Generated evidence is under:

- `.skill-eval/write-skill/runs/`
- `.skill-eval/evaluate-skill/runs/`
- `.skill-eval/write-skill/reports/`
- `.skill-eval/evaluate-skill/reports/`

Generated runs are evidence, not source authority. Prefer frozen case definitions, raw artifacts, and current code over summary prose.

## Closing Principle

The lesson is not “agents should never adapt during implementation.” The lesson is:

> Adapt locally while evidence supports the plan. When evidence challenges the plan or milestone boundary, stop adapting locally and reconsider globally.

A trustworthy coding agent needs both forward momentum and a reliable way to recognize when forward momentum has become uncontrolled production.
