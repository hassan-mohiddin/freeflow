# Progressive Disclosure

Read this before adding or reorganizing references and scripts.

Make the first-read route understandable, then move only separately owned or conditional depth out of the active body.

## Dependency Direction

```text
description
-> SKILL.md
-> required or conditional reference or script
```

The description routes the first useful read. `SKILL.md` establishes the job, normal method, necessary terms, and stop conditions. A required resource must be linked before the body relies on it. A conditional resource may rely on language already established by the body.

Do not hide a definition, rule, or step needed to recognize the normal route in an unannounced reference. That is progressive reconstruction, not disclosure.

## Add A Required Reference When

- normal execution genuinely needs separately owned depth;
- the body can identify and require the read before using that depth;
- keeping the material inline would obscure the skill’s controlling rules;
- the dependency is delivered and validated with the skill package.

Required does not mean implicit. The body must say when to read the resource and must not act as if unread content were already known.

## Add A Conditional Reference When

- the material is needed only for a distinct branch of work;
- loading it every time would obscure higher-priority behavior;
- the active body can name an observable condition for reading it;
- the reference has one clear job and does not restate the full skill or Workflow.

Keep compact examples that teach the normal boundary in `SKILL.md`. Move a larger example set only when it serves a conditional branch and would obscure the normal route.

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
