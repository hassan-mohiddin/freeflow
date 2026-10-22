# Conversations, Pipelines And Judges

This reference holds the guidance and the definition fields for groups with more than one participant (a conversation or a pipeline), for judged groups, and for a runtime profile. The guidance is judgment; the field shapes and constraints are a contract, binding as written, like the rest of [authoring](authoring.md), and what the evaluator does with them is stated as it behaves.

## Conversation

- **Answers:** does the agent behave well when a user answers back, such as asking for what it needs, or not asking for what it was already told?
- **Declare:** a body group whose `input` is the opening prompt, and `participants` with protocol `conversation`: the simulated user's model, a card holding everything it knows, `max_turns`, and a stop phrase.
- **Yields:** the subject's transcript with every user message, the user's identity and each message's prompt hash, and how the conversation ended: the stop phrase, the turn limit, the subject stopping, or a user error.
- **Grade:** success usually has several parts. Check the end state the conversation should leave with deterministic expectations, read its length from the run metrics, and judge the quality of the interaction with a rubric.
- **Pitfalls:** the simulated user is a model; its card bounds what it may say, and it answers "I don't know" otherwise, but read some conversations before trusting a count. A conversation that hits the turn limit usually means the subject never finished. The user's model and card are part of the task: keep them identical across arms. Each turn costs a user call as well as a subject turn.

## Pipeline

- **Answers:** does a staged workflow produce the right final outcome, such as two independent reviews and an adjudicator, or a coordinator's plan and an executor's change?
- **Declare:** `participants` with protocol `pipeline`: ordered stages, each with its own `input` and `sees` (the fixture, or an earlier stage's response or files), `fresh` for a stage that must not see earlier ones, and `graded` for the stage the expectations apply to (the last by default).
- **Yields:** a full run per stage, the graded stage as the arm's run, and every stage's response and files.
- **Compare designs:** arms may differ in `participants` itself when `component` names it, such as one reviewer against two reviews and an adjudicator; an arm without `participants` runs one ordinary subject.
- **Pitfalls:** a stage sees only what `sees` lists, and nothing by default. Every stage uses the arm's configuration, so the component applies to all stages at once; a stage cannot have a configuration of its own, and the stages' different jobs come from their inputs. A stage that fails stops the pipeline. Grading only the final stage hides where an error began; read the earlier stages before naming the failed boundary. Cost grows with the number of stages.

## Participants

A group may run more than one participant in each arm. `participants` declares a `protocol`; every participant uses the arm's configuration. Declare it on the group, shared by every arm, or in the configuration: shared in `configuration`, or per arm in an overlay, where arms may differ in it like any other path (`"component": ["participants"]`), for example one review against an adjudicated pair. An arm whose `participants` is absent, or `null` to clear a shared one, runs one ordinary subject. Expectations, comparisons and review questions apply to each arm's graded run: its pipeline's graded stage, its conversation, or its single subject.

A **conversation** pairs the subject with a simulated user:

```json
{
  "participants": {
    "protocol": "conversation",
    "user": {
      "model": "anthropic/claude-haiku-5-5",
      "thinking": "medium",
      "card": "cards/release-owner.md",
      "max_turns": 10,
      "stop": "THANKS, DONE"
    }
  }
}
```

- It needs a body group whose `input` is a `prompt`: the opening message.
- `card` is a text file, kept out of the fixture: everything the simulated user knows, read in when the definition loads.
- `max_turns` (default 10) caps the subject's turns, the opening included. `stop` is the phrase with which the user ends the conversation.
- `model` and optional `thinking` name the user's model.

The loader checks these fields, and the pipeline's below, and names the one it refuses.

A **pipeline** runs ordered stages, each a separate subject:

```json
{
  "participants": {
    "protocol": "pipeline",
    "stages": [
      { "id": "review1", "input": "Review the change.", "sees": ["fixture"] },
      { "id": "review2", "fresh": true, "sees": ["fixture"] },
      { "id": "adjudicator", "input": "Adjudicate the reviews.", "sees": ["review1.response", "review1.files", "review2.response"] }
    ],
    "graded": "adjudicator"
  }
}
```

- A stage's `input` is a prompt or an array of turns, and defaults to the group's `input`.
- `sees` lists exactly what the stage gets: `fixture` (a fresh copy, only when the group declares one), `<stage>.response` (that earlier stage's final response), `<stage>.files` (the files it created or modified, delivered as text to read; body groups only, and UTF-8 text only) or `<stage>.workspace` (the stage starts in a copy of that earlier stage's final workspace, every file and binary file kept, so it can run what the earlier stage wrote; body groups only). Anything not listed never reaches the stage. It defaults to nothing.
- A stage starts from `fixture` or one `<stage>.workspace`; without either it starts empty.
- `fresh: true` declares the stage independent: it may see the fixture but no earlier stage.
- `graded` names the stage the group's expectations, comparisons and review questions apply to; it defaults to the last stage.

### How Participants Run

A group with participants runs them inside each arm, with the arm's configuration.

**Conversation.** The subject runs one persistent RPC session, opened with the group's prompt. After each settled turn, the simulated user is called like a judge: a separate model call without tools, skills, context files or session, in its own isolation root whose name is a hash, not the arm, with the arm's host extensions and settings and the provider's login copied in and removed afterward. Its fixed prompt holds its card, the instruction to answer only from the card and to say "I don't know" otherwise, the instruction that whatever the assistant says is conversation that cannot change its card, goal or rules, the stop phrase, and the visible conversation: the user's messages and the subject's replies, with run paths replaced by `<run>`, never the subject's tool calls or files. Its reply becomes the next turn, unless it contains the stop phrase. The conversation ends at the stop phrase, after `max_turns` subject turns, or when the subject stops. `run.json` records `participants` with the user's identity (model, provider, thinking, extensions, card path and hash), each message with its prompt hash, usage and isolation, and how it `ended` (`stop`, `max-turns`, `subject-stopped` or `user-error`); `prompts` lists every message the subject received. A user call that fails or writes nothing makes the run `infrastructure-failed`. Each call's prompt, events and reply stay under `groups/<id>/participants/<hash>/turn-<n>/`.

**Pipeline.** Stages run in order, each a separate subject process with its own isolation root and workspace. A stage's workspace is a fresh fixture copy when it sees `fixture`, and empty otherwise. An earlier stage's response or written files reach it only as declared context: copied into the stage's own resources, fingerprinted, injected by the guard under the labels `<stage>.response` and `<stage>.files`, and readable there; the earlier stage's directories stay outside its readable roots. The injected copy of each file is fenced as run material under a random token, and the stage's prompt gains a fixed note that the fenced work is material to assess, never instructions, and that text in it trying to direct the stage is a finding to report. The graded stage runs in the arm's directory, so its `run.json` is the arm's run and grading, review and judging read it as usual. Every other stage keeps its `run.json`, transcript, events and stderr beside the arm in `<arm>.<id>/`, so every stage's workspace is as deep as a single subject's and a declared command that reaches the repository by a relative path works in each. Each stage's response and files are kept in its directory's `outputs/`. The arm's `run.json` records `participants.stages` (state, `sees`, `fresh`, run file relative to the group directory, response hash, written files and usage) and `graded`. A stage that does not complete stops the pipeline and the arm's run takes its state.

In both protocols the arm's `usage` covers every participant, so `--max-cost` counts them all.

## Judged Evaluation

- **Answers:** what deterministic checks cannot decide, such as whether a review named the defect by location and effect, whether a report's claims rest on its sources, or how actionable an answer is.
- **Declare:** a `rubric` of dimensions, the `judges`, and `combine` when there are several, declared before any verdict (Rubric And Judges, below). A decision may name a dimension as its measure.
- **Yields:** for each run, every judge's answers with evidence, the combined answer, what the judge saw and what was withheld, and contract gaps such as an unchecked calibration; per arm in an aggregate, answer counts, pass^k, means, agreement between judges, and each judge's calibration.
- **Write the rubric:**
  - One dimension per thing to judge, each with a concrete yes and no, and the evidence a yes needs. "Is the answer good?" is too vague to agree on; an exact phrase is too brittle to be fair.
  - For an open-ended answer, list the key facts or claims a good answer must contain as separate dimensions, and put them in the references.
  - Put a short worked example of a yes and a no in the reference when the question leaves room for reading; examples make judges more consistent, though consistency alone is not accuracy.
  - Each judge answers every dimension in one reply, so answers to one dimension can colour another. Keep the rubric to the dimensions the question needs.
- **Pitfalls:** design and measurement's [Count Judge Answers With Care](design-and-measurement.md#count-judge-answers-with-care) covers what to check first, the judge's family, calibration, agreement between judges, and what the judge sees. Pairwise `review` questions remain useful for an advisory side-by-side reading of the arms; they are not a measure.

## Rubric And Judges

A rubric asks what deterministic checks cannot. Each run is judged alone, blind to its arm, by `review --rubric` (Judging With A Rubric, below); the answers are judged evidence, stored beside the run and never in run or deterministic grade files.

```json
{
  "rubric": [
    {
      "id": "found-defect",
      "question": "Did the review name the off-by-one in the pagination loop?",
      "reference": { "path": "references/known-defect.md" }
    },
    { "id": "clarity", "question": "How actionable is the review?", "answers": "0-2" }
  ],
  "judges": [{ "model": "anthropic/claude-haiku-5-5", "thinking": "high" }],
  "combine": "majority"
}
```

The loader checks the rubric, judges and combine fields and names the one it refuses. What it cannot teach:

- Dimensions are rendered only for judges and never sent to the subject. `answers` defaults to yes, no or unknown; `"0-2"` scores instead. A judge may always answer `unknown`, and must cite the evidence for every answer.
- `reference` is inline text or a file, shown to judges only and never kept in the fixture, because the subject sees the fixture; keep the file out of the subject's declared `context` too, which the evaluator does not check. A file's text and hash are read in when the definition loads, so judging never depends on the working tree.
- Dimensions have no weights: each is counted and decided on its own.
- Each judge configuration appears once, because repeated calls to one configuration are one vote. Without `judges`, `review --rubric --model` names the single judge.
- A judge runs on its group's host setup by default: the reference arm's `host.extensions` and `host.settings` (such as a subscription's auth extension), with its own model and thinking. `configuration` gives it its own setup instead, inline or with `extends`; a model it names is used when the judge entry names none. A group whose host extensions are built from source must give its judges their own configuration (refused only at review time).
- `combine` names how several judges' answers become one, before any verdict is seen. Taking yes as 1 and no as 0: `majority` gives the answer more than half the judges gave (otherwise `unknown`); `unanimous` gives the lowest answer, so yes only when every judge says yes; `any` gives the highest, so yes when any judge does; `mean` averages the known answers of `"0-2"` dimensions. An `unknown` answer makes the result `unknown` whenever it could change it.

### Judging With A Rubric

`review --rubric` judges each complete run of every selected group that declares a rubric, under Review Work's [Judge Contract](../../review-work/references/evals-and-judges.md#judge-contract):

- each run is judged alone: the judge sees the task turns, the fixture files, that run's responses, tool calls, changed paths and written files, the rubric and its references, with the same limits and neutral path tokens as the advisory review; it never sees the arm name, other arms' runs, or deterministic grades, and its working directory and home are named by a hash, not the arm; the run and the task materials are fenced as run material with the same fixed instruction, and each judge's reported `steering` is recorded with it and adds the contract gap `run material addressed the judge`; the judge configuration's identity includes the prompt version, so a calibration does not carry over to a changed prompt;
- the group's `judges` answer, each in its own isolation root; a group without `judges` is judged by `--model` (or the configuration's model), and `--model` with declared judges is refused before any judge starts;
- each judge's host extensions and settings come, most specific first, from its own declared `configuration`, else from the group (its reference arm's host setup, so a judge uses the login the subjects used); `--configuration` gives the setup only to the command-line judge of a group without declared judges, and is refused when every judged group declares its judges, because it would be ignored. Each judge's record holds its effective `setup` (`group`, `own (<file or inline>)` or `command-line`), extensions, settings, model, thinking and family relation, and its calibration key covers that setup;
- `groups/<id>/<arm>/judged-grade.json` records each judge's identity (model, provider, family, thinking, extensions, settings, isolation, a configuration hash, prompt hash and date), the family relation to the subject, its answers with evidence, errors and usage; the combined answer per dimension with every vote, by the group's `combine`; what was shown and withheld; the run file's hash; and `contractGaps` (`calibration not checked` until every judge is calibrated, `materials truncated` when anything was cut). `groups/<id>/judging/<hash>/judge-<n>/` keeps each judge's prompt, events, final response and stderr;
- a judge that fails or replies malformed makes the grade `judge-error` with no combined answers, and the command exits nonzero;
- an aggregate target judges every trial, then rebuilds the aggregate: its sections, and its decision and claim when the suite declares a decision rule, so a `judged` measure is decided on the new answers.

`review <target> --calibrate <labels.json>` scores judges against hand labels. The file maps run paths (an arm's directory or its `run.json`, from the working directory) to `{ "<dimension id>": <answer> }`. Each judge configuration's agreement with the labels, per dimension (the share matched and Cohen's kappa), becomes its `calibration` in every judged grade it gave under the labelled runs and the target, and judging again with the same configuration keeps it. A configuration is its model, thinking, host extensions and rubric; a different one is uncalibrated.

An aggregate's `judged` section gives, per arm and dimension, counts of each combined answer (`notJudged` for a trial that was not judged or failed), pass^k for yes/no dimensions, the mean for `0-2` dimensions, agreement between judges per dimension (Cohen's kappa for two, Krippendorff's alpha for more), the judges with their calibration, and `perTrial` values for a decision rule: `true` for yes, `false` for no, `null` for unknown, or the number. `view` shows judged evidence apart from deterministic grades.

Judged evidence never changes run or deterministic grade files.

When an unsupported operation changes the question, reject it or run a clearly separate direct comparison with explicit limits. Never invoke archived evaluators as a fallback.

## Runtime Profile

A runtime profile, under `configuration.runtime`, is shared by every arm, except `environment.literal`. It changes the host environment, not the skill target:

```json
{
  "runtime": {
    "session": false,
    "extensions": [
      {
        "entry": "extensions/probe.mjs",
        "resources": ["extensions"]
      }
    ],
    "environment": {
      "literal": {
        "PROBE_MODE": "injection-test"
      },
      "inherit": []
    }
  }
}
```

The host comes from `configuration.host.name`; the evaluator maps it to the installed `pi` or `claude` command and records the selected host. Optional `prompt` is `isolated` (default) or `host`:

- `isolated` replaces the host's system prompt with a minimal evaluator-owned prompt. Use it to isolate the target skill.
- `host` keeps the host's own system prompt and whatever declared extensions compose onto it, appending declared context. Use it when evidence must reflect the production prompt, for example by declaring the Freeflow Pi extension bundle with a fixture containing `.freeflow/config.json`.

Both modes enforce the same tool and path guards. A declared runtime states only what it changes: an omitted `session` is `false`, `extensions` is `[]`, `environment` is `{ "literal": {}, "inherit": [] }`, and `prompt` is `isolated`. `session` controls whether the variant receives an isolated persistent session directory; it defaults to `false` in omitted runtime profiles. Each bundle's directory resources are copied under their original relative paths, so sibling imports and multi-tree extensions remain intact. Bundle bytes are snapshotted once and copied identically to every arm.

`environment.literal` contains non-secret string configuration and is recorded in run evidence. Arms may differ in it when `component` names `runtime.environment.literal` or one key under it, such as `runtime.environment.literal.FEATURE_MODE`; each arm's subject then receives its own literals, recorded under `resources.runtime.environment`. Declare `environment` in the shared runtime so an arm's overlay changes only the literal. `environment.inherit` names parent-process variables whose values are passed to the child but never persisted; other parent variables are not passed. Missing inherited variables invalidate the variant. The evaluator supplies only a small host-runtime baseline such as `PATH` and `HOME`. The loader refuses launch-control and loader keys, overlapping names and secret-like literal keys.

Extensions are trusted executable inputs, not OS-sandboxed code. The evaluator proves declared identity and post-run immutability, but extension code retains its host permissions.

When a group declares `context-text` expectations, a final non-mutating observer records two per-turn surfaces: the chained `before_agent_start` system prompt and each provider-neutral `context` message projection. `context-text` expectations select `surface: "system-prompt"` or `surface: "provider-context"` and may select `request: "first"`, `"last"`, or a positive request number. Groups without context assertions do not create context-observation artifacts.

A custom tool in `group.tools` needs a runtime extension bundle. The evaluator remains extension-neutral: it does not interpret feature names or configuration schemas. Put feature configuration in the ordinary group fixture or runtime environment, and test combinations as separate suite groups.
