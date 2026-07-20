# Write Skill And Evaluate Skill Script Review Handoff

## Purpose

Continue the Write Skill and Evaluate Skill redesign from the completed Markdown work into the script implementation and tests.

This handoff is point-in-time continuation memory, not authority. Reinspect the live worktree, current files, accepted Plans and Specs, tests, generated artifacts, and current user direction before editing. Live evidence wins when it conflicts with this file.

This handoff was written under an explicit constraint to read only `skills/handoff/SKILL.md` before creating it. The Plan and Spec documents were therefore not reopened. Their exact TODOs must be reconciled from the named live sources before implementation; do not treat this handoff as an exhaustive substitute for those documents.

## Current Route

The active route is script diagnosis and implementation planning for:

- `skills/write-skill/scripts/`
- `skills/evaluate-skill/scripts/`
- their focused tests under `.skill-eval/write-skill/tests/` and `.skill-eval/evaluate-skill/tests/`

No independent reviewer was dispatched for the script inspection. The active agent performed a read-only self-review using the updated Code Practices, Simplify Code, Diagnose Failure, Design for Depth, Verify Work, and Review Work boundaries.

No script files were changed during that review.

## Accepted Skill-Writing Philosophy

The user approved these principles:

- Write for an agent reading the skill for the first time.
- Descriptions should state the broad core job in plain language.
- Do not turn descriptions into exhaustive trigger taxonomies or compressed bodies.
- Prefer broad recall when loading is safe and the body can exit cleanly.
- A description must not depend on vocabulary taught only after activation.
- Keep the normal method executable from `SKILL.md` alone.
- Use references only for recognizable conditional depth.
- Use scripts only for repeated deterministic work that is risky or wasteful to retype.
- Discussion and author reasoning establish the target behavior; they are not skill text by default.
- Do not copy conversation history, author debate, iteration notes, or rejected drafts into skills.
- Translate authoring context into direct instructions, required definitions, boundaries, stop conditions, and compact examples.
- Say what to do, what not to do, and when to stop, exit, or route.
- Include why only when it helps generalization or prevents a harmful literal reading.
- Negative instructions are high-salience. Use them only for plausible or observed failures, and pair them with the required positive action, exit, or route.
- Do not introduce rejected mechanisms or hypothetical behavior merely to forbid them.
- Inline behavioral examples teach; behavioral evals test whether the skill changes behavior under pressure.
- Use one canonical owner for shared policy. Repeat only the smallest reminder needed at a local failure boundary.
- Static validation proves structure, not behavior.
- Baseline and candidate variants must receive the same natural prompt, fixture, tools, host, model, and thinking settings.
- Expected answers, author discussion, assertions, rubrics, reports, and other variants stay outside the subject prompt unless naturally part of the user task.
- Behavioral readiness requires evidence for the exact activation, first-read, dependency, retained-use, artifact, and host claims being made.

## Completed And Approved Markdown Work

The user reviewed and approved the current bodies and references for:

- `skills/write-skill/SKILL.md`
- `skills/write-skill/references/activation-boundaries.md`
- `skills/write-skill/references/agent-first-instructions.md`
- `skills/write-skill/references/development-loop.md`
- `skills/write-skill/references/progressive-disclosure.md`
- `skills/evaluate-skill/SKILL.md`
- `skills/evaluate-skill/references/eval-patterns.md`
- `skills/evaluate-skill/references/evaluation-architecture.md`
- `skills/evaluate-skill/references/grading-and-revision.md`
- `skills/evaluate-skill/references/grading-priority.md`
- `skills/evaluate-skill/references/portable-execution.md`
- `skills/evaluate-skill/references/token-efficient-execution.md`

The current approved descriptions are:

```yaml
write-skill: Use when creating or revising an agent skill.
evaluate-skill: Use when evaluating, comparing, or making readiness claims about agent-skill behavior.
```

Write Skill now explicitly covers:

- first-use description design;
- broad versus over-specified activation examples;
- discussion-to-instruction translation;
- positive and negative instruction calibration;
- optional why;
- compact behavioral examples;
- strategic repetition;
- progressive disclosure;
- routing behavioral evaluation and readiness to Evaluate Skill.

Evaluate Skill now explicitly covers:

- behavioral change under natural pressure;
- `variant` and `subject` definitions;
- inline examples as teaching rather than evidence;
- author-context and rubric isolation;
- activation, first-read, nearby, composition, retained-use, artifact, and cross-host evidence;
- objective grading before semantic grading;
- whole-case reruns;
- readiness limits and owner promotion.

## Script Inventory Reviewed

### Write Skill

- `skills/write-skill/scripts/skill-author.mjs`
- `skills/write-skill/scripts/lib/skill-author-core.mjs`

### Evaluate Skill

All files under `skills/evaluate-skill/scripts/` were structurally inspected. High-risk and high-complexity bodies were read directly, including:

- CLI entry and argument parsing;
- workspace and case validation;
- planning and feasibility;
- materialization, hashing, integrity, and publication;
- Pi one-shot and RPC adapters;
- Codex diagnostic adapter;
- process and RPC lifecycle;
- objective and semantic grading;
- evidence compaction;
- path policy and root guard;
- composition runtime;
- coordinator and outcome ledger.

## Fresh Test Evidence

### Skill Author

Command:

```text
node --test .skill-eval/write-skill/tests/skill-author.test.mjs
```

Result:

```text
4 passed
0 failed
```

This suite does not currently test valid package dependencies, recursive reference links, YAML-safe initialization with punctuation, or reliable readiness-status inspection.

### Skill Evaluator

Command:

```text
node --test $(find .skill-eval/evaluate-skill/tests -name '*.test.mjs' | sort)
```

Result:

```text
161 passed
6 failed
```

Failure groups:

1. Two composition-runtime failures because the evaluator still supplies the removed Runtime Kernel contract to the current runtime helper.
2. Three composition plan/materialization failures because tests still depend on deleted `skills/execute-plan` paths.
3. One frozen baseline identity mismatch because the Write Skill candidate content changed.

The baseline identity mismatch is expected evidence invalidation, not permission to rewrite the frozen baseline. Update or supersede it only through the accepted evaluation and promotion route.

## Write Skill Script Problems

### 1. Valid Cross-Skill Links Are Rejected

Owner:

- `skills/write-skill/scripts/lib/skill-author-core.mjs`
- `validateSkill()`

Current behavior:

- Every relative Markdown link that resolves outside the current skill directory is reported as `linked resource escapes skill root`.

Why it is wrong:

- Current Freeflow skills intentionally link to sibling skills and package runtime resources.
- Examples include Workflow, Evaluate Skill, Execute Work references, and the Interaction Contract.
- The tool advertised by Write Skill therefore reports valid current skills as invalid.

Do not fix this by simply removing the escape check.

Required behavior:

- Determine or accept an allowed package root.
- Keep the current skill directory as the local resource root.
- Permit readable declared dependencies inside the allowed package root.
- Reject missing paths, paths outside the package root, absolute-path escapes, and symlink escapes.
- Report local `linked_resources` separately from package `linked_dependencies`.
- Follow local Markdown links recursively so broken links inside references are validated.
- Do not recursively validate another skill package as though it were locally owned; verify that the declared package dependency exists and remains inside the allowed root.

Required tests:

- local reference succeeds;
- sibling skill dependency succeeds and is classified as a dependency;
- package runtime dependency succeeds;
- missing local resource fails;
- missing package dependency fails;
- escape outside package root fails;
- symlink escape fails;
- a broken link inside a linked local reference fails;
- cyclic local Markdown references terminate safely.

### 2. `initSkill()` Can Generate Invalid YAML

Owner:

- `skills/write-skill/scripts/lib/skill-author-core.mjs`
- `initSkill()`

Current behavior:

- User-provided descriptions are interpolated unquoted into YAML.
- A description containing `:` can make the generated file immediately fail validation.

Required behavior:

- Serialize the description as a YAML-safe quoted scalar.
- Reject or safely encode newlines and quotes.
- Add a regression test with colon-containing and quoted descriptions.

### 3. Generated Description And Template Lag The Approved Philosophy

Current generated fallback:

```text
Use when an agent needs the <Title> behavior.
```

Problem:

- It is internal, vague, and not an observable broad trigger.
- The initializer cannot responsibly infer the final activation description.

Choose deliberately between:

- requiring `--description`; or
- creating a clearly Draft placeholder that tells the author to replace it with the broad observable trigger.

Current generated rule:

```text
Add references or scripts only after a measured failure proves they are needed.
```

Problem:

- A distinct conditional branch can justify a reference without an already measured failure.
- Repeated deterministic work can justify a script.

Align the generated template with the approved Write Skill body.

### 4. Inspector Status Signal Is Not Reliable

Owner:

- `inspectSkill()`

Current behavior:

- Any occurrence of `Draft`, `Unverified`, or `Production-Ready` anywhere in the body satisfies the status signal.

Why it is wrong:

- A skill can merely discuss these labels and be treated as status-labeled.
- A real status declaration should be parsed from an explicit supported location, or this signal should be removed.

Required behavior:

- Do not infer current status from arbitrary body prose.
- If status remains supported, define and parse one explicit declaration format.
- Keep the signal advisory and never imply behavioral readiness.

### 5. Weak-Verb Inspection Can Misread Examples

Current behavior:

- Simple substring matching can flag quoted bad examples or code rather than normative instructions.

This is advisory, not blocking. Improve only if a small syntax-aware or section-aware implementation reduces noise without creating a parser subsystem.

### 6. Frontmatter Parsing Is Narrow

`parseSkill()` is a hand-written parser for the repo's compact `name` and `description` shape. Do not expand it into a partial general YAML implementation accidentally.

Choose one of:

- explicitly support only the documented compact shape and fail clearly on unsupported multiline/object forms; or
- use a proven YAML parser if the package contract genuinely requires broader YAML.

Do not add a dependency merely for hypothetical syntax.

## Evaluate Skill Script Problems

### 1. Composition Runtime Uses The Removed Runtime Kernel Model

Affected files include:

- `skills/evaluate-skill/scripts/pi-composition-runtime.mjs`
- `skills/evaluate-skill/scripts/lib/capabilities.mjs`
- `skills/evaluate-skill/scripts/lib/workspace.mjs`
- `skills/evaluate-skill/scripts/lib/plan.mjs`
- `skills/evaluate-skill/scripts/lib/materialize.mjs`
- `skills/evaluate-skill/scripts/lib/evaluate.mjs`
- focused composition tests and fixtures.

Obsolete identifiers include:

- `freeflow-kernel-workflow-v1`
- `FREEFLOW_EVAL_RUNTIME_KERNEL`
- `runtimeKernel`
- `kernel_sha256`
- `kernel_identity`
- `skills/decision-gate/references/runtime-kernel.md`

Current failure:

```text
Cannot read properties of undefined (reading 'effective')
```

Cause:

- The production runtime helper now expects Interaction Contract capability state and `freeflowContext.interactionContract`.
- The evaluator still supplies only the old kernel shape.

Required new behavior:

- Compose the exact declared Interaction Contract and Workflow resources.
- Supply current capability state, including Interaction Contract state.
- Preserve exact resource identities and runtime-delivery evidence.
- Continue suppressing duplicate Workflow bootstrap delivery while restoring after context compaction.
- Rename evidence fields and environment variables to interaction-contract language.
- Update tests to assert the current production envelope.

Compatibility decision required before implementation:

- Should historical accepted bundles using `freeflow-kernel-workflow-v1` remain readable and verifiable?
- If yes, keep a legacy reader/verification path while new plans emit a new interaction-contract profile.
- Do not silently reinterpret old kernel hashes as Interaction Contract hashes.

### 2. Composition Capability Probe Can Overclaim

`probePiRpc()` starts the composition extension and inspects the RPC handshake and skill commands, but it does not execute a turn that proves runtime resource delivery.

It can therefore report explicit runtime/composition capability even when the declared Runtime Kernel path is missing. Current tests exposed this mismatch later during execution.

Required behavior:

- Separate protocol capability from proven composition-runtime delivery.
- Either run a bounded no-model delivery probe that crosses the relevant lifecycle boundary, or report delivery proof as unavailable until an actual composition case runs.
- Do not convert extension loadability into runtime-delivery evidence.

### 3. Objective JSON Assertions Can Falsely Pass

Owner:

- `skills/evaluate-skill/scripts/lib/grade.mjs`
- `json_field`
- `json_field_in`

Current behavior:

```js
let actual = null;
try {
  actual = getField(JSON.parse(text), assertion.field);
} catch {}
```

Problems:

- `JSON.parse(null)` returns `null`.
- Missing files, malformed JSON, parse failure, and a genuine `null` field are collapsed.
- An assertion expecting `null` can pass without valid JSON evidence.

Required behavior:

- Track file availability, parse success, field presence, and actual value separately.
- Missing or malformed JSON must fail the objective assertion with explicit evidence.
- A genuine field value of `null` may pass only after successful parsing and field lookup.

Required tests:

- missing file with expected `null` fails;
- malformed JSON with expected `null` fails;
- absent field fails distinctly;
- present `null` field passes when expected;
- `json_field_in` follows the same rules.

### 4. Codex Native-Activation Support Is Overclaimed

Current behavior:

- `supportedEvidenceClasses()` advertises `native-activation` for Codex.
- `parseCodexJsonl()` always returns `skill_read: false`.

Required route:

- Implement trustworthy evidence that the exact declared skill snapshot was read; or
- mark Codex native activation unsupported/reduced-fidelity.

Explicit invocation in a prompt is not automatically proof of native activation.

### 5. Case Schema Is Incomplete

Owner:

- `skills/evaluate-skill/scripts/lib/workspace.mjs`
- `validateCase()`

Missing or weak checks include:

- `forbidden_changed_path.glob` type and bounds;
- string members in changed-path arrays;
- `json_field.field` and `json_field_in.field`;
- pattern arrays for file/text assertions;
- assertion-specific required properties generally.

Consequences:

- Invalid cases can pass workspace loading and fail later in planning or grading.
- Dynamic glob construction receives insufficiently validated input.

Required behavior:

- Validate each assertion shape completely before capability access or model execution.
- Prefer a data-driven assertion schema or small per-assertion validators over further growth of one monolithic branch chain.
- Keep error messages tied to exact case paths.

### 6. Accepted Variant Kind Has No Execution Path

`VARIANT_KINDS` accepts `none`, but planning/materialization supports only `working-tree` and `git`.

Required route:

- Remove `none` if it is obsolete; or
- implement and test its exact no-skill semantics.

Do not retain an accepted schema state that fails only during planning.

### 7. Pi RPC Turn Evidence Mutates Its Inferred Shape

Owner:

- `skills/evaluate-skill/scripts/lib/pi-adapter.mjs`
- `runPiRpcSubject()`

Current pattern:

```js
const turnEvidence = { ..., skill_reads };
turnEvidence.skill_read = ...;
```

This produces the current TypeScript hint.

Required behavior:

- Compute `skillReads` and `skillRead` first.
- Construct the complete immutable evidence shape once.

This is a small code-quality correction, not a redesign.

### 8. Git Status Parsing Is Not Exact For Unusual Paths

`captureGitEvidence()` and `captureGitEvidenceNonMutating()` parse line-oriented `git status --short` output with slicing and newline splitting.

Paths containing quoting-sensitive characters or newlines can be misread, and untracked diff capture can receive the quoted display form rather than the actual path.

Because artifact evidence is correctness-bearing, prefer NUL-delimited porcelain output and a deterministic parser. Add tests for spaces, renames, quoting, and unusual valid filenames if those paths are accepted subject output.

### 9. Capability And Evidence Claims Must Stay Separate

Keep these distinctions explicit in code and output:

- host command exists;
- protocol handshake works;
- multiple skills are registered;
- exact skill snapshot was read;
- runtime resource was delivered;
- behavior followed the skill;
- retained use occurred on a later turn.

Do not let one boolean stand in for several evidence boundaries.

## Evaluate Test And Fixture Problems

### Product-Coupled Unit Tests

Several materialization and planning tests depend directly on deleted product paths such as `skills/execute-plan`.

Preferred split:

- Unit tests create temporary synthetic skills and runtime resources.
- Integration tests deliberately use the current declared Freeflow stack.
- Historical compatibility fixtures stay immutable and explicitly versioned.

Do not make evaluator mechanics depend accidentally on volatile production skill names.

### Frozen Baseline Identity

The Write Skill candidate hash changed because the candidate content changed.

Do not update the expected hash merely to make the test pass. The correct route is:

1. finish and approve the skill source;
2. run or plan the accepted behavioral evaluation;
3. publish the new accepted evidence if supported;
4. update or supersede the compatibility fixture deliberately.

## Diagnostics Adjudication

Fresh diagnostics reported many advisories. Do not treat them as automatic edits.

### Not Established As Defects

- `integrity.mjs` intentionally throws when integrity verification fails; this is fail-closed behavior.
- `feasibility.mjs` parses JSON strings it created itself when comparing normalized expectations.
- The local `.reverse()` call mutates a private temporary array only.
- Small duplicated CLI parsing across Write Skill and Evaluate Skill does not justify a shared cross-package utility.
- Unused-export findings often reflect test imports or executable entrypoints.
- Nested ternaries and small duplicate blocks are readability candidates, not correctness failures by themselves.

### Established Or Worth Correcting

- Pi RPC `skill_read` inferred-shape hint.
- JSON objective-grading ambiguity.
- Runtime Kernel composition mismatch.
- Cross-link validator false failures.
- Schema states accepted without implementation.

## Complexity And Simplification Candidates

The evaluator is approximately 5,400 lines across 29 script files. Its modular boundaries are generally purposeful, but several functions carry too many responsibilities:

- `executeVariant()` in `lib/evaluate.mjs`;
- `buildEvaluationPlan()` in `lib/plan.mjs`;
- `validateCase()` in `lib/workspace.mjs`;
- `gradeObjectiveRun()` in `lib/grade.mjs`;
- `runPiRpcSubject()` in `lib/pi-adapter.mjs`.

Do not refactor these merely for line count.

After correctness and migration are supported, consider bounded extraction around real ownership:

- composition runtime preparation and validation;
- subject execution;
- evidence persistence;
- assertion-specific schema validation;
- assertion-specific objective grading.

A useful result reduces concepts and coordination. Do not centralize the same choreography behind more terminology.

## Plan And Spec TODO Reconciliation

The exact Plan and Spec files were not reopened while creating this handoff, by explicit user instruction.

Known live pointers from prior work include:

- `docs/plans/skills/2026-07-13-freeflow-evaluator-v3-plan.md`
- `docs/designs/workflow/freeflow-workflow-depth-model.md`
- `docs/freeflow-runtime-and-lifecycle.md`
- `docs/freeflow-current-state.md`
- `docs/freeflow-packaging-and-publishing-design.md`
- the latest relevant handoff under `docs/handoffs/workflow-and-skills/`

Before implementation:

1. Read the current owning Plan and Spec/design documents completely.
2. Extract every still-open TODO, requirement, compatibility promise, evidence boundary, and acceptance condition concerning Write Skill or Evaluate Skill.
3. Compare each item with live code and this review.
4. Mark each as already satisfied, stale/superseded, still required, blocked by a decision, or deferred.
5. Preserve historical compatibility requirements explicitly; do not infer them from old tests alone.
6. Update the Working Record if one exists.
7. Select one bounded implementation slice at a time.

Do not claim this handoff contains every Plan/Spec TODO. That claim would be unsupported without reopening those sources.

## Recommended Implementation Order

### Slice 1 — Skill Author Correctness

Scope:

- package-aware recursive link validation;
- safe YAML description generation;
- generated template alignment;
- reliable status advisory;
- focused tests.

Stop when current Freeflow skills validate without suppressing real package escapes and focused tests pass.

### Slice 2 — Composition Compatibility Decision

Resolve:

- new Interaction Contract runtime profile;
- historical kernel-profile read compatibility;
- evidence-field and environment-variable naming;
- exact current runtime resources.

Do not implement the migration until the compatibility choice is explicit.

### Slice 3 — Composition Runtime Migration

Scope only the current profile and approved compatibility behavior across scripts and focused tests.

Stop when composition planning, materialization, runtime delivery, compaction restoration, and evidence validation pass against the current runtime contract.

### Slice 4 — Objective Grading And Case Schema

Scope:

- JSON evidence-state correctness;
- assertion-specific schema validation;
- unsupported `none` variant decision;
- focused regression tests.

### Slice 5 — Evidence Fidelity Corrections

Scope:

- Codex native-activation claim;
- Pi RPC evidence shape;
- exact Git path parsing;
- capability versus delivery evidence separation.

### Slice 6 — Test And Baseline Reconciliation

Scope:

- synthetic evaluator unit fixtures;
- current-stack integration cases;
- historical compatibility fixtures;
- deliberate baseline promotion or supersession.

Behavioral model runs remain owner-approved work with plan-only inspection first.

### Slice 7 — Bounded Simplification

Only after the suite is green and behavior is supported, consider extracting the largest orchestration functions by ownership. Do not mix simplification with runtime migration or grading fixes.

## Verification Expectations

For each slice:

- run focused LSP diagnostics before broader tests;
- run the smallest directly affected tests;
- run `git diff --check`;
- inspect the complete affected diff;
- preserve contradictory or stale-baseline evidence;
- perform one active-agent self-review;
- apply at most one bounded correction batch;
- re-run focused evidence;
- freeze the supported slice.

Before claiming the whole script package healthy:

- Skill Author focused tests pass;
- Evaluate Skill full deterministic test suite passes or every remaining failure is explicitly classified and deferred by authority;
- composition uses the exact current runtime contract;
- package dependencies validate without allowing path escapes;
- objective grading cannot turn missing or malformed evidence into a pass;
- claimed activation and retained-use evidence matches what the adapters can directly observe;
- frozen baselines are updated only through deliberate promotion or supersession.

## Deferred Work And Boundaries

Unless separately approved, do not absorb:

- public documentation migration;
- command-surface migration;
- package/generated-output synchronization;
- release, publication, integration, push, launch, or deployment;
- broad runtime migration outside the evaluator composition boundary;
- broad cleanup or modernization;
- behavioral model execution beyond approved plan-only or owner-approved limits.

The user explicitly requested script work, but the compatibility choice and each implementation slice still need to be confirmed against live state and owning documents.

## Exact Resume Steps

1. Read this handoff as memory, not authority.
2. Inspect `git status --short` and the current diffs for Write Skill and Evaluate Skill only.
3. Reopen the named Plan, Spec/design, current-state, and runtime documents required by repo instructions.
4. Reconcile their open TODOs against the live scripts and this review.
5. Confirm whether historical `freeflow-kernel-workflow-v1` bundles require compatibility.
6. Begin with Skill Author correctness unless live evidence changes the order.
7. Present that one package update, tests, limitations, and self-review result.
8. Stop for user approval before the composition-runtime slice.

## Transfer Status

- Transfer shape: repo-memory handoff.
- Destination: `docs/handoffs/workflow-and-skills/write-and-evaluate-skill-script-review-handoff.md`.
- Script state: inspected, not edited.
- Script tests: Write Skill green; Evaluate Skill has six classified failures.
- Independent review: not selected yet.
- Behavioral model evals: not run.
- Next recommended route: reconcile owning Plan/Spec TODOs, decide composition compatibility, then implement one bounded script slice at a time.
