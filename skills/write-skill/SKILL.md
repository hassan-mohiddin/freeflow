---
name: write-skill
description: Use when creating or revising an agent skill.
---

# Write Skill

Write the smallest agent-first skill that changes one named behavior.

## Establish The Job

Before writing, identify:

- the behavior the skill must change;
- the failure it must prevent;
- the earliest natural situation where the guidance becomes useful;
- the context guaranteed before the skill loads;
- a nearby case the skill must not hijack.

If public behavior, dependencies, safety, or compatibility remain unsettled, stop and resolve that boundary before encoding it.

## Write The Description

Describe the broad job using cues visible before the body is read.

- Optimize for the first useful read.
- Do not rely on terms taught only inside the skill.
- Prefer safe broad recall over a brittle trigger catalog.
- Treat “Use when…” as useful advice, not required grammar.
- Do not compress the body into frontmatter.

## Write The Body

Make the normal path executable from `SKILL.md` alone.

1. State the job immediately.
2. Define necessary terms before using them.
3. Put rules where the agent first makes the affected choice.
4. Say what to do, what not to do, and when to stop or route.
5. Include rationale only when it improves judgment in unseen cases.
6. Use an example only when prose leaves a likely misclassification.
7. Keep author history, evaluation status, readiness, and changelog prose outside the executing skill.

Do not copy the owning workflow into a method skill. Link to it when composition matters.

## Add Resources Deliberately

Start with one `SKILL.md`.

- Add a reference for conditional depth needed only in some cases.
- Add a script for repeated deterministic work or a feature the skill owns.
- State the observable condition for reading or running each resource.
- Keep every resource inside the skill package unless a declared package dependency is required.
- A required reference belongs on the normal path. A conditional reference must not hide normal-path instructions.

There is no universal body template, section inventory, wording rule, or requirement that a script follow an earlier failure.

## Check The Package

Check structure and resources before evaluating behavior. Inspect facts rather than treating wording, length, or file count as quality.

The canonical [skill-author entrypoint](scripts/skill-author.mjs) owns the deterministic command surface:

```text
node <write-skill-directory>/scripts/skill-author.mjs init <directory> --name <name> --description <text>
node <write-skill-directory>/scripts/skill-author.mjs validate <directory> [--package-root <directory>]
node <write-skill-directory>/scripts/skill-author.mjs inspect <directory> [--package-root <directory>]
```

Commands emit JSON.

- Package boundary: nearest ancestor containing `package.json`, then the skill directory's parent. Use `--package-root` to set it explicitly.
- Frontmatter: flat plain-string or JSON-compatible double-quoted scalars. Quote punctuation-heavy values and values YAML could interpret as numbers, booleans, or null.

Never import or invoke deprecated tooling.

Structural checks do not prove activation or behavior. Use [Evaluate Skill](../evaluate-skill/SKILL.md) for behavioral evidence.

## Stop

Stop when the requested skill is minimal, executable on first read, honest about its dependencies, and free of author-facing status. Do not add resources or procedure merely to make the package look complete.
