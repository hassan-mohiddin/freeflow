# Freeflow Composition Evaluation Extension

> **Doc ID:** SPEC-SKILLS-2026-07-12-COMPOSITION-EVAL
> **Date:** 2026-07-12
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Approved
> **Source:** `docs/specs/skills/skill-authoring-and-evaluation-v2.md`; accepted evaluator implementation and evidence; Output Router and Delegation review-loop incident handoffs; owner-approved post-overhaul evaluation direction

## Problem

The accepted evaluator can isolate one skill and run one-shot or fixed scripted Pi sessions. It cannot prove how Freeflow's compact runtime kernel, Workflow bootstrap, and several independently activated skills behave together.

This blocks trustworthy evaluation of the two preserved review-loop incidents and the wider post-overhaul skill system. A manually concatenated skill or ambient installed package would change the question and weaken attribution.

The evaluator must add composition without reopening the rejected platform architecture of caller-managed attempts, cache, resume, batching, concurrency, adaptive prompts, or partial reuse.

## Outcome

Extend the existing `evaluate` operation so one case can compare two explicitly declared Freeflow compositions that:

- share one ordered immutable base stack;
- differ in exactly one target skill snapshot;
- optionally receive the canonical compact kernel and one active Workflow bootstrap marker through an isolated evaluator-owned runtime adapter;
- receive only declared skills, runtime resources, tools, turns, fixture state, and host settings;
- record exact source, materialized, delivery, activation, turn, workspace, and integrity evidence;
- preserve one-case atomicity, serial variants, whole-case reruns, and one fresh process per variant.

Existing one-skill cases remain valid and behaviorally unchanged.

## Scope

### In scope

- Pi composition execution only;
- one-shot composition;
- fixed scripted composition with two, three, or four predeclared user turns;
- an optional ordered shared base stack of independently declared skills;
- exactly one target skill whose reference and candidate snapshots are the existing two variants;
- optional canonical Freeflow runtime delivery:
  - compact kernel appended to system context for every enabled turn;
  - Workflow bootstrap suppressed while its marker remains in active session context and re-delivered when compaction or branch changes remove that active marker;
- repeated explicit Pi `--skill` delivery for declared skills;
- exact per-component and per-resource identities;
- per-skill delivery and read/activation evidence where the host exposes it;
- deterministic fault coverage and configuration-bound qualification evidence;
- sanitized incident fixtures and post-overhaul skill qualification after the extension is accepted.

### Out of scope

- adaptive, generated, or model-selected user follow-ups;
- more than four scripted user turns in the accepted extension boundary;
- ambient package, skill, extension, context-file, or config discovery;
- loading the global Freeflow cache during a subject run;
- evaluator batching, retries, cache, resume, partial reuse, concurrency, or aggregate scheduling;
- uncapped turns, timeout, retained output, raw transport, or process execution;
- Codex, Claude, cross-host, session recovery, or model-independent readiness;
- changing Freeflow product behavior or any evaluated skill during evaluator-extension qualification;
- treating successful composition as readiness evidence for every included skill.

Exploratory adaptive sessions may discover future cases outside this evaluator. Their outputs remain diagnostic until converted into fixed repeatable cases.

## Case Contract

Composition is an optional additive case shape. Cases without it retain the existing schema and execution path.

A composition comparison declares:

- an ordered shared `base_stack` of one or more named skill components;
- one `target_name` owned by the existing ordered reference and candidate variants;
- an optional canonical runtime profile;
- one natural prompt or two-to-four fixed natural turns;
- existing fixture, tools, evidence classes, limits, and assertions.

Conceptual shape:

```json
{
  "composition": {
    "base_stack": [
      {
        "name": "execute-plan",
        "kind": "working-tree",
        "path": "skills/execute-plan",
        "resources": ["SKILL.md", "references/execution-map.md"]
      }
    ],
    "target_name": "design-for-depth",
    "runtime": {
      "profile": "freeflow-kernel-workflow-v1",
      "source": {
        "kind": "working-tree",
        "path": ".",
        "kernel": "skills/decision-gate/references/runtime-kernel.md",
        "workflow": "skills/workflow/SKILL.md"
      }
    }
  },
  "variants": [
    {
      "id": "reference",
      "role": "reference",
      "kind": "git",
      "revision": "<sha>",
      "path": "skills/design-for-depth",
      "resources": ["SKILL.md"]
    },
    {
      "id": "candidate",
      "role": "candidate",
      "kind": "working-tree",
      "path": "skills/design-for-depth",
      "resources": ["SKILL.md"]
    }
  ]
}
```

The exact field spelling may change during implementation if deterministic tests expose a deeper internal representation. The invariants below are source truth.

## Composition Invariants

1. Comparison cases still contain exactly two variants in order: reference, then candidate.
2. The shared base stack and runtime are identical for both variants.
3. Only the target descriptor may differ between variants.
4. Base and target names are non-empty and unique.
5. Every subject resource is explicitly declared, safe, readable, non-symlinked, and contained within its source root.
6. Base order is stable and fingerprinted.
7. The same skill name cannot occupy multiple base or target slots.
8. Runtime resources are shared inputs, never variant overrides.
9. Composition runs use no ambient skill, extension, context, prompt-template, theme, package, or config discovery.
10. Every variant starts from a fresh fixture, fresh materialized stack, fresh isolated HOME/config root, and fresh Pi process.
11. Composition execution remains serial and whole-case atomic.
12. A completed reference is never reused after candidate or infrastructure failure.

## Runtime Delivery

The `freeflow-kernel-workflow-v1` profile uses an explicit evaluator-owned extension, not the installed Freeflow package or `.freeflow/config.json` discovery.

It must reproduce the production Pi delivery envelope for a deterministic composition profile: Freeflow configured and enabled, Skills effective, default/effective mode `workflow`, no session override, and Output Router plus Delegation Harness disabled.

- Build the model-facing runtime text through the production-equivalent runtime-context function from the exact declared kernel and deterministic profile.
- Append it as `${event.systemPrompt}\n\n${runtimeContext}`; never replace the existing system prompt.
- Deliver Workflow as one hidden custom message with exact fields:
  - `customType: "freeflow-workflow-bootstrap"`;
  - `content: "# Freeflow Workflow Bootstrap\n\n" + workflow.trim()`;
  - `display: false`;
  - `details: { skill: "workflow", source: "first-turn-bootstrap" }`.
- Suppress duplicate Workflow delivery when active session context already contains a `custom_message` entry with that `customType`, using active-branch context when available and persisted entries only as fallback.
- Re-deliver the same Workflow envelope when active-branch context exists but no longer contains the marker after compaction or branch change; a stale persisted marker must not suppress the active-context reload.
- Preserve these envelope, suppression, and re-bootstrap semantics across later scripted turns and compaction-aware test doubles.
- Keep automatic compaction disabled during subject runs. Accepted subject evidence therefore requires initial Workflow delivery followed by active-marker suppression; re-bootstrap after marker loss is proved by deterministic compaction-aware tests rather than by silently compacting a qualification session.
- Record declared, materialized, and delivered hashes for the runtime implementation, kernel, Workflow, and resulting envelope.
- Fail closed if runtime source changes after plan approval or during execution.

The evaluator may share or extract pure production helpers, or implement an isolated adapter whose deterministic tests compare the complete envelope with production helpers. It must not maintain an unverified body-only approximation while claiming production-equivalent delivery.

Selected skills are delivered separately through ordered explicit Pi skill paths. Runtime delivery does not prove that the model read or followed every selected skill.

## Identity And Evidence

The plan fingerprint must bind:

- case source and fixture identity;
- ordered base stack membership;
- target reference and candidate descriptors;
- source kind, path, revision, and every declared resource hash;
- runtime profile, extension implementation, kernel, and Workflow hashes;
- exact prompts or ordered turns;
- tools, host/version, model/thinking, limits, and evidence requirements;
- evaluator and semantic-grader implementation identities.

For each declared skill and runtime component, evidence distinguishes:

- **declared:** present in the approved case;
- **materialized:** copied exactly and made read-only;
- **delivered:** passed through the declared host/runtime seam;
- **read or activated:** observed through host events or tool evidence when available;
- **followed:** inferred only from graded behavior, never from delivery alone.

Invocation arguments prove delivery, not model activation. Missing host support for required activation evidence blocks the claim rather than being renamed as activation.

The result bundle retains legacy singular subject identity fields for existing cases and adds ordered composition identities for composition cases.

## Fixed Turn Contract

Composition supports:

- one-shot Pi JSON execution; or
- two, three, or four predeclared Pi RPC user turns.

All variants receive identical prompts in identical order. Later prompts are hidden until their declared turn.

Each turn records:

- prompt identity;
- settled transcript evidence;
- per-turn workspace state and changed paths;
- provider/tool usage delta;
- declared-skill read evidence;
- runtime and subject-resource integrity.

One semantic grader per variant may inspect one shared ordered turn scope. Different semantic assertions cannot request inconsistent transcript scopes.

No adaptive branch, generated reviewer prompt, resume, steer, follow-up command, or caller-managed session is introduced.

## Limits

Model-driven runs retain explicit positive limits:

- timeout per complete subject or grader process;
- retained canonical output per process;
- raw transport safeguard;
- provider turns per process;
- optional observed spend ceiling.

For fixed scripts, `max-turns-per-process` must be at least the declared user-turn count and should include justified tool-work allowance. The plan preview reports scripted turns, process count, worst-case approved provider turns, output/timeout limits, and spend limitations.

Limit exhaustion produces incomplete diagnostic evidence, not a behavioral failure. After diagnosis, every variant reruns from fresh state under a newly approved fingerprint. Limits are not raised merely to hide wandering or inefficient behavior.

## Failure Contract

### Preflight blocking failures

No provider request may start when:

- composition shape is malformed;
- variants are not exactly ordered reference and candidate;
- shared stack/runtime differs across variants;
- more than one target slot differs;
- a name, path, resource, revision, or runtime source is missing, duplicate, escaping, unreadable, or symlinked;
- required host, runtime, fixed-turn, isolation, or activation capability is unavailable;
- a declared hash or approved plan fingerprint changed;
- a requested turn count exceeds the accepted composition boundary;
- limits cannot cover the declared user turns.

### Runtime infrastructure failures

Publish diagnostics only, stop later variants, and publish no accepted result when:

- declared or materialized resources mutate;
- runtime kernel or Workflow is missing, duplicated, replaced, or delivered through an undeclared seam;
- undeclared context, skill, or extension appears;
- required delivery/activation evidence is missing or ambiguous;
- RPC ordering, process, timeout, output, transport, isolation, cleanup, or publication fails.

### Behavioral outcomes

A complete run whose assertions fail is valid behavioral evidence. Do not relabel a trustworthy subject failure as infrastructure failure.

## Compatibility

- Existing case files, suites, CLI commands, one-shot adapter, one-skill RPC adapter, result statuses, publication layout, and whole-case rerun contract remain supported.
- Composition is opt-in and Pi-only.
- The public lifecycle remains `doctor`, `init`, and `evaluate`.
- Existing one-skill execution internally adapts to a one-component stack without changing its fingerprint semantics unless the owning versioned contract explicitly requires it.
- No legacy fixture runner becomes authority for composition readiness.

## Acceptance

### Deterministic acceptance

Before model work:

- existing case suites parse unchanged;
- malformed composition and identity cases fail before provider access;
- changing any active composition or runtime byte changes the plan fingerprint;
- unrelated inactive files do not change it;
- multi-skill materialization is isolated, read-only, and collision-safe;
- ordered repeated skill delivery preserves ambient-discovery disablement;
- kernel appends every turn; subject runs show initial Workflow delivery then active-marker suppression with compaction disabled; deterministic compaction-aware tests prove Workflow re-bootstrap when active context removes the marker;
- three- and four-turn fake sessions preserve state, per-turn evidence, and limits;
- mutation, missing activation, turn exhaustion, and publication faults produce diagnostics only;
- existing evaluator, author, and structural tests pass.

### Behavioral qualification

After deterministic acceptance and exact owner approval of previews:

1. run one synthetic composition case proving kernel + Workflow + at least two selected skills with one target difference;
2. run one four-turn fixed composition case proving ordered state, a repeated same-seam pressure turn, and a backward route;
3. rerun the complete accepted `write-skill` and `evaluate-skill` promotion suites on the changed evaluator source;
4. integrity-check every accepted bundle;
5. obtain independent implementation and evidence reviews;
6. update readiness metadata only to the exact supported Pi/model/runtime/turn boundary.

A passing composition case does not promote included workflow skills. Their own cases and composition contribution remain separate claims.

## Readiness And Source Changes

The current evaluator Production-Ready claim is exact-source and configuration-bound. The first behavior-changing evaluator edit makes the new evaluator source Unverified until the acceptance above passes.

`write-skill` readiness may remain tied to its unchanged exact skill source and accepted evidence, but new evaluator runs do not inherit old evaluator readiness. `evaluate-skill` readiness metadata and reports must disclose the transition and exact new source identity.

No provider-backed execution is authorized by this specification. Every paid run requires a zero-provider preview and explicit approval of its exact fingerprint and limits.

## Incident Fixture Boundary

The Output Router and Delegation worktrees are forensic sources, not subject workspaces.

Fixture extraction must:

- use an explicit allowlist and exact source/blob hashes;
- exclude handoffs, reviews, expected outcomes, agent logs, `.git`, caches, credentials, absolute paths, and unrelated dirty files;
- keep evaluator-only provenance and assertions outside subject-visible fixture content;
- verify the original exploit or pressure mechanically before subject runs;
- prefer small synthetic attribution cases before realistic replay fixtures;
- never mutate or clean either incident worktree.

## Stop Conditions

Stop and revise this contract or its plan when:

- composition requires another public lifecycle command;
- correct identity depends on undeclared or ambient state;
- more than one target must change to make a comparison meaningful;
- the runtime adapter starts reproducing full product config/setup behavior;
- a second defect appears at the same identity, delivery, activation, or publication seam;
- qualification requires adaptive prompts, cache, resume, batching, concurrency, partial reuse, or uncapped execution;
- case criteria change after subject output exists;
- the next bounded finish path cannot be stated clearly.
