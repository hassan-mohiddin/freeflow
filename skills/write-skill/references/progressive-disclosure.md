# Progressive Disclosure

Read this before adding or reorganizing references and scripts.

Make the first-read route understandable, then move only separately owned or conditional depth out of the active body.

## Dependency Direction

```text
description
-> SKILL.md
-> required or conditional reference or script
```

The description routes the first useful skill read. `SKILL.md` establishes the job, normal method, necessary terms, and stop conditions, then explicitly directs any reference read. References do not activate independently, and an introduction inside an unread reference cannot activate itself.

Do not hide a definition, rule, or step needed to recognize the normal route in an unannounced reference. That is progressive reconstruction, not disclosure.

## State The Read Point

Use one of three explicit read points:

- **Entry-required:** read before following the skill's normal route.
- **Activity-required:** read before performing a named activity on the normal route.
- **Conditional:** read only when an observable branch occurs.

Entry-required and activity-required resources are required references. Conditional resources are conditional references. The word “when” does not determine the class: “When designing a test, read Test Design” is activity-required because test design is normal TDD work.

Do not call a required read recommended or optional. If skipping it preserves correct normal execution, it is not required. Avoid “read when unclear” when the reference teaches how to recognize or make the underlying decision; either make the read activity-required or keep enough recognition guidance in `SKILL.md`.

The body instruction and reference introduction must describe the same read point. An introduction may explain purpose, but must not narrow or widen the condition established by `SKILL.md`.

## Add A Required Reference When

- normal execution genuinely needs separately owned depth;
- the body can identify and require the read before using that depth;
- keeping the material inline would obscure the skill’s controlling rules;
- the dependency is delivered and validated with the skill package.

Required does not mean implicit or merely recommended. The body must command the read at entry or before the named normal activity and must not act as if unread content were already known.

## Add A Conditional Reference When

- the material is needed only for a distinct branch of work;
- loading it every time would obscure higher-priority behavior;
- the active body can name an observable condition for reading it;
- the reference has one clear job and does not restate the full skill or Workflow.

The condition must be observable before the read. Keep compact examples that teach the normal boundary in `SKILL.md`. Move a larger example set only when it serves a conditional branch and would obscure the normal route.

## Add A Script When

- the skill owns a deterministic feature or repeated operation;
- retyping it is error-prone, unsafe, or materially wasteful;
- its interface and failure behavior can be tested.

A script does not require an earlier failure. Do not script ordinary shell commands merely to look complete.

## Link At The Decision Point

A resource link should tell the agent when it becomes useful:

> Read the integration-evidence reference when the claim depends on host dispatch or an installed artifact.

Avoid vague resource lists such as “See references for more information.”

## Resource Test

For every extra file, answer:

1. What normal dependency or conditional branch requires it?
2. When can the agent recognize that read or run condition?
3. What prior language does the resource assume, and where is it established?
4. Why cannot the active body or a direct command do the job clearly?
5. How will the resource be validated and kept consistent?

If those answers are weak, remove the resource.
