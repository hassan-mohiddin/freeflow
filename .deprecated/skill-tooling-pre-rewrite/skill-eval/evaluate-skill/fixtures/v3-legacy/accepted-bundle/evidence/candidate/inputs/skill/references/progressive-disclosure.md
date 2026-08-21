# Progressive Disclosure

Keep high-frequency decisions in `SKILL.md`. Move conditional depth only when it improves execution.

## Add A Reference When

- the material is needed only for a distinct branch of work;
- loading it every time would obscure higher-priority rules;
- the active file can link it with a clear read condition.

## Add A Script When

- the work is deterministic and repeated;
- retyping it is error-prone, unsafe, or materially wasteful;
- tests can prove its behavior.

Do not script ordinary shell commands merely to look complete.

## Resource Test

For every extra file, answer:

1. Which measured failure requires it?
2. When will the agent load or run it?
3. Why cannot the active file or a direct command do the job?
4. How will it be validated and kept current?

If those answers are weak, remove the resource.
