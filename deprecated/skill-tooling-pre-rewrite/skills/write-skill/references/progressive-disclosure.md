# Progressive Disclosure

Make the first-read path complete, then move only conditional depth out of the active body.

## Dependency Direction

```text
description
-> SKILL.md
-> conditional reference or script
```

The description routes the first useful read. `SKILL.md` establishes the job, normal method, necessary terms, and stop conditions. References may rely on language already established by the body.

Do not hide a definition, rule, or step needed to understand the normal path in a reference. That is progressive reconstruction, not disclosure.

## Add A Reference When

- the material is needed only for a distinct branch of work;
- loading it every time would obscure higher-priority behavior;
- the active body can name an observable condition for reading it;
- the reference has one clear job and does not restate the full skill or Workflow.

Keep compact examples that teach the normal boundary in `SKILL.md`. Move a larger example set only when it serves a conditional branch and would obscure the normal path.

## Add A Script When

- the work is deterministic and repeated;
- retyping it is error-prone, unsafe, or materially wasteful;
- tests can prove its behavior.

Do not script ordinary shell commands merely to look complete.

## Link At The Decision Point

A resource link should tell the agent when it becomes useful:

> Read the integration-evidence reference when the claim depends on host dispatch or an installed artifact.

Avoid vague resource lists such as “See references for more information.”

## Resource Test

For every extra file, answer:

1. Which measured failure or conditional branch requires it?
2. When can the agent recognize that branch?
3. What prior language does the resource assume, and where is it established?
4. Why cannot the active body or a direct command do the job?
5. How will the resource be validated and kept consistent?

If those answers are weak, remove the resource.
