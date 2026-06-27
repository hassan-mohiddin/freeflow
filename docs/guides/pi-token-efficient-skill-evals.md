# Token-Efficient Skill Evals in Pi

## Purpose

Use this guide when evaluating agent skills in Pi with the least practical model usage while preserving behavioral accuracy.

The goal is not to make evals tiny at any cost. The goal is to remove irrelevant context, keep the behavioral pressure intact, and compare baseline versus with-skill runs fairly.

## Core Principle

```text
Reduce eval cost by shrinking inputs, not by weakening pass criteria.
```

A useful skill eval still needs:

- the same model, prompt, fixture, cwd, tools, thinking level, and resource settings on both sides
- one intended variable: skill absent versus skill present
- saved final response and evidence
- deterministic grading whenever possible

If removing context changes the behavior being tested, the eval is no longer accurate. Use a higher-fidelity tier instead.

## Why Pi Can Be Cheaper

Pi is a small harness, and it exposes the knobs needed to strip overhead from eval runs:

- `--no-session` avoids saved conversation history.
- `--mode json -p` runs headless and captures machine-readable events.
- `--no-context-files`, `--no-skills`, `--no-extensions`, `--no-prompt-templates`, and `--no-themes` remove unrelated startup resources.
- `--tools` or `--no-tools` restricts tool definitions and tool-use opportunities.
- Tiny fixture directories avoid loading real repo context.
- Mechanical grading can happen outside the model.

This can use less than native subagents or parent-agent delegation because there is no parent orchestration turn, no copied conversation history, and no hidden subagent workflow prompt beyond what you explicitly load.

It is not a guaranteed discount. If the same model receives the same system prompt, history, skill text, files, and tool output, token usage will be similar.

## Three Eval Questions

Do not collapse these into one result.

### 1. Automatic Activation Eval

Question:

```text
Will Pi expose this skill normally, and will the model decide to load it from a realistic prompt?
```

Use native `--skill` loading, keep `read` enabled, and do not tell the model to use the skill. If the model does not read the skill, that is real evidence: the description, trigger, or prompt may be weak.

This is the default for realistic baseline-versus-with-skill evidence.

### 2. Explicit Invocation Eval

Question:

```text
Does the skill work when the user explicitly invokes it?
```

Use Pi's skill command path, for example:

```text
/skill:evaluate-skill <eval prompt>
```

This is realistic for power users who call skills directly, but it does not prove automatic activation.

### 3. Wording Diagnostic

Question:

```text
If the skill instructions are active, does this wording produce the desired behavior?
```

Directly inject the skill body into the prompt or system prompt.

This is the cheapest diagnostic, but it is not final evidence for real-world skill behavior because it bypasses activation and progressive disclosure. Use it only after activation is already proven or explicitly out of scope.

## Eval Tiers

### Tier 0: No-Model Checks

Use first when possible.

Examples:

- skill frontmatter is valid
- description exists and is specific
- required reference files exist
- no broad forbidden wording appears
- expected fixture files or prompt files exist

This does not prove behavior, but it catches cheap failures before spending tokens.

### Tier 1: Automatic Activation, Minimal Context

Use for realistic skill activation and conversation behavior that does not require repo files.

Baseline:

```bash
pi --mode json -p \
  --no-session \
  --no-context-files \
  --no-skills \
  --no-extensions \
  --no-prompt-templates \
  --no-themes \
  --tools read \
  --model "$MODEL" \
  "$PROMPT" > baseline.jsonl
```

With skill:

```bash
pi --mode json -p \
  --no-session \
  --no-context-files \
  --no-skills \
  --skill "$SKILL_PATH" \
  --no-extensions \
  --no-prompt-templates \
  --no-themes \
  --tools read \
  --model "$MODEL" \
  "$PROMPT" > with-skill.jsonl
```

Keep the prompt natural. Do not add `use the skill` when testing automatic activation.

### Tier 2: Explicit Skill Invocation

Use when the supported user path is direct skill invocation, or when automatic activation already passed and you want a cheaper regression check for the skill body.

```bash
pi --mode json -p \
  --no-session \
  --no-context-files \
  --no-skills \
  --skill "$SKILL_PATH" \
  --no-extensions \
  --no-prompt-templates \
  --no-themes \
  --tools read \
  --model "$MODEL" \
  "/skill:$SKILL_NAME $PROMPT" > with-skill-explicit.jsonl
```

Label these results as explicit-invocation evidence. They should not replace automatic activation evidence.

### Tier 3: Wording Diagnostic, No Tools

Use only to isolate whether the skill wording itself is strong enough once active.

Baseline:

```bash
pi --mode json -p \
  --no-session \
  --no-context-files \
  --no-skills \
  --no-extensions \
  --no-prompt-templates \
  --no-themes \
  --no-tools \
  --model "$MODEL" \
  "$PROMPT" > baseline-wording.jsonl
```

With injected skill body:

```bash
pi --mode json -p \
  --no-session \
  --no-context-files \
  --no-skills \
  --no-extensions \
  --no-prompt-templates \
  --no-themes \
  --no-tools \
  --append-system-prompt "$(cat "$SKILL_PATH")" \
  --model "$MODEL" \
  "$PROMPT" > with-skill-wording.jsonl
```

This is not an activation eval. Do not use it as final acceptance evidence for a skill that must work through Pi's normal skill loading.

### Tier 4: Fixture Eval With Minimal Tools

Use when behavior depends on repo evidence, file edits, command output, or source-of-truth conflicts.

Run inside a tiny copied fixture directory, not the full repo. Use the same minimal tool set on baseline and with-skill runs.

Baseline:

```bash
pi --mode json -p \
  --no-session \
  --no-context-files \
  --no-skills \
  --no-extensions \
  --no-prompt-templates \
  --no-themes \
  --tools read,grep,find,bash,edit,write \
  --model "$MODEL" \
  "Work only inside $RUN_DIR.

$PROMPT" > baseline.jsonl
```

With skill:

```bash
pi --mode json -p \
  --no-session \
  --no-context-files \
  --no-skills \
  --skill "$SKILL_PATH" \
  --no-extensions \
  --no-prompt-templates \
  --no-themes \
  --tools read,grep,find,bash,edit,write \
  --model "$MODEL" \
  "Work only inside $RUN_DIR.

$PROMPT" > with-skill.jsonl
```

Do not add an instruction to use the skill when the eval is testing automatic activation. If the fixture prompt does not naturally trigger the skill, fix the skill description or the eval prompt.

After each run, grade with filesystem evidence:

```bash
diff -ru "$FIXTURE_DIR" "$RUN_DIR" > run.diff || true
git -C "$RUN_DIR" status --short > run.git-status.txt 2>/dev/null || true
```

For Freeflow fixture evals, prefer existing deterministic graders when they apply:

```bash
evals/scripts/grade-fixture-eval.sh <eval-id> --output <run-output.md>
```

### Tier 5: Full-Fidelity Runtime Eval

Use only when the behavior depends on real runtime context:

- `AGENTS.md` or `CLAUDE.md`
- project-local Pi settings
- installed extensions
- bundled Freeflow runtime context hooks
- other skills or prompt templates
- realistic command surface behavior

This costs more. Use it as an acceptance check after cheaper tiers have narrowed the failure.

## Usage Capture

Pi JSON mode records assistant usage in message events. Extract it with:

```bash
jq 'select(.type == "message_end" and .message.role == "assistant") | .message.usage' with-skill.jsonl
```

For a quick total:

```bash
jq -s '
  [ .[]
    | select(.type == "message_end" and .message.role == "assistant")
    | .message.usage
  ]
  | reduce .[] as $u (
      {input:0, output:0, cacheRead:0, cacheWrite:0, cost:0};
      .input += ($u.input // 0)
      | .output += ($u.output // 0)
      | .cacheRead += ($u.cacheRead // 0)
      | .cacheWrite += ($u.cacheWrite // 0)
      | .cost += ($u.cost.total // 0)
    )
' with-skill.jsonl
```

Compare usage only after checking that both runs used the same model and settings.

## Accuracy Rules

Do not save tokens by removing the thing under test.

Good reductions:

- remove unrelated context files
- use a small fixture instead of the full repo
- disable unused tools, while keeping the same tool set across compared runs
- use one adversarial prompt instead of many clean prompts
- grade diffs and files outside the model
- inspect final response and diff, not full transcripts, unless debugging

Bad reductions:

- replacing automatic activation with direct injection and calling it realistic evidence
- telling the with-skill agent to use the skill when activation is under test
- removing the source conflict the skill must notice
- disabling `read` when native Pi skill loading is under test
- using different tools or thinking levels between baseline and with-skill
- summarizing the prompt so much that the baseline no longer fails
- judging only the final answer when the diff contradicts it

## Fair Baseline Pattern

Baseline and with-skill should differ only in the skill variable.

For automatic activation:

- baseline uses `--no-skills`
- with-skill uses `--no-skills --skill "$SKILL_PATH"`
- both use the same prompt and tool set
- the with-skill prompt does not say `use the skill`

If skill files are present in the fixture or repo and the baseline could discover them, add a baseline guard:

```text
Do not read or use the target skill file.
```

Do not add the symmetric with-skill guard `Use the target skill` unless the eval is explicitly an invocation or wording diagnostic.

For installed Freeflow baselines, also disable runtime context injection when the eval requires a true no-Freeflow control. Existing fixture wrappers use:

```bash
FREEFLOW_DISABLE_RUNTIME_CONTEXT=1
```

## When To Escalate

Start cheap. Escalate only when the cheaper run cannot answer the eval question.

Escalate when:

- the model never reads the skill and activation is the behavior under test
- both baseline and with-skill pass, but the prompt may be too clean
- both fail, and the skill may need repo context to work
- the behavior depends on host memory or installed runtime hooks
- you are about to claim release/acceptance evidence

Do not escalate just because a transcript is short. Escalate because the evidence is inconclusive.

## Practical Recipe

1. Write the smallest prompt or fixture that should make baseline fail and with-skill pass.
2. Decide the eval question: automatic activation, explicit invocation, wording diagnostic, or full runtime behavior.
3. Dry-run setup without calling the model.
4. Run baseline with stripped Pi settings.
5. Run with-skill with the same settings plus the skill.
6. Save JSONL, final response, diff, exit status, and usage.
7. Grade deterministic evidence first.
8. Only inspect full transcripts when the result is surprising.
9. If the eval is decisive, revise the skill from the specific failure.
10. Re-run the failed side first.
11. Run one full-fidelity acceptance check before trusting broad behavior.

## Bottom Line

Pi's lowest-cost realistic skill eval is usually:

```text
pi --mode json -p --no-session + no unrelated resources + native --skill + minimal tools + tiny fixture + deterministic grading
```

Use direct skill-body injection only for wording diagnostics. It is cheap, but it bypasses activation and should not be treated as realistic with-skill evidence.
