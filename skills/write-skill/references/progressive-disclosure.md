# Progressive Disclosure

Read this before adding or reorganizing references, assets, or scripts.

Progressive disclosure should change when content enters context, preserve one canonical owner, or isolate a real lifecycle boundary. Splitting files without one of those benefits adds dependency cost without reducing context.

## Preserve Dependency Direction

```text
description
-> SKILL.md
-> required or conditional resource
```

`SKILL.md` establishes:

- the job;
- normal route;
- necessary terms;
- stop and return conditions;
- observable resource read points.

A reference cannot activate itself. Do not hide the rule needed to recognize a reference inside that reference.

That is progressive reconstruction, not disclosure.

## Classify The Read Point

### Entry-required

Read before the skill can follow or reject its normal route.

Entry-required references are exceptional. Use one only when separation provides independent value, such as:

- canonical reuse across packages;
- separate ownership or lifecycle;
- generated schemas or contracts;
- compatibility or host constraints;
- independently versioned external policy.

If every useful activation reads the resource and it has no separate ownership or lifecycle value, inline it even when `SKILL.md` becomes substantially longer.

### Activity-required

Read before performing one named normal activity.

The skill may first:

- exit;
- defer;
- choose another route;
- determine that the activity does not apply.

Activity-required references provide real loading value even when the activity is common.

### Conditional

Read only when an observable branch occurs.

The body must teach the agent enough to recognize the branch before loading the reference.

Do not use “when unclear” if the reference contains the method for recognizing the underlying condition.

## Keep The Normal Route Contiguous

Start with one `SKILL.md`.

Keep inline:

- the first-read job;
- normal route;
- controlling definitions;
- rules needed to select resources;
- stop and return behavior.

Move depth only when keeping it inline would obscure the normal route and the read point is executable.

Do not split a file to satisfy a line count.

## Add A Reference When

- one named normal activity needs separately owned depth;
- one observable conditional branch needs depth;
- one canonical resource is shared without duplication;
- one resource has a real independent lifecycle;
- the body can name and require the read before use.

The body instruction and reference introduction must state the same read condition.

Required means necessary. Do not call a required reference recommended or optional.

If skipping the reference preserves correct execution, either make its concrete optional value explicit or remove it.

## Add A Script When

- the skill owns a deterministic repeated operation;
- model-generated execution would be error-prone, unsafe, or materially wasteful;
- the interface and failure behavior can be tested;
- the script’s output has a clear evidence boundary.

Do not script ordinary commands merely to make the package appear complete.

## Link At The Decision Point

Link every agent-facing reference, asset, package dependency, and executable entrypoint from `SKILL.md` at the first useful choice.

Avoid vague resource lists such as:

> See references for more information.

Prefer:

> Read Test Design before designing or materially changing the behavior check.

## Apply The Resource Test

For every extra file, ask:

1. What activity, conditional branch, shared ownership, or lifecycle requires it?
2. When can the agent recognize the read or run condition?
3. What prior language does it assume?
4. Where is that language guaranteed?
5. What context or ownership value does separation provide?
6. Why is inline content worse?
7. How will links, containment, and behavior be verified?

If separation changes neither loading nor ownership, inline the content or remove it.
