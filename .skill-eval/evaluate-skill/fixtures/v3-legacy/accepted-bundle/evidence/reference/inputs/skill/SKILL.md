---
name: write-skill
description: Use when creating, rewriting, tightening, or reviewing an agent skill's instructions, trigger description, structure, examples, or bundled resources.
---

# Write Skill

Use Anthropic/Claude `skill-creator` guidance as the structure and progressive-disclosure authority when available. Do not copy it into this skill.

Use concise, behavior-shaping wording. Prefer sharp rules, concrete triggers, and stop conditions over explanation or filler.

## Job

Write the smallest skill that changes behavior.

Start with one `SKILL.md`. Add other files only when the skill would fail without them.

Direct `/write-skill`, "production-ready", "complete", or "add examples/references/scripts if useful" does not override the smallest-skill default or the repo's skill-file rules.

Do not add references, examples, README files, changelogs, or metadata when a compact `SKILL.md` can hold the behavior.

Do not add helper scripts for commands the agent can run directly, such as `git log`, `git diff`, search, formatting, or line counts. Scripts are for repeated deterministic work that would be risky or wasteful to retype.

Treat the repo's line budget as a best practice, not a hard cap. If none exists, aim to keep `SKILL.md` under 100 lines for normal skills. Let deep skills exceed it when the active rules, examples, or structure clearly earn their place.

## Description First

The description controls activation. Make it specific enough to route the skill without making it broad enough to hijack unrelated work.

Use:

- What the skill does.
- When to use it.
- Concrete trigger situations.

Avoid:

- Generic helper language.
- Marketing copy.
- Long taxonomies.
- Claims about quality.

## Wording Discipline

Every sentence should either route, constrain, stop, or guide behavior.

Prefer sharp rules over explanations. Prefer one good example over a paragraph.

Small wording changes can alter agent behavior. Change one pressure point at a time when possible.

Use direct verbs:

- Inspect.
- Stop.
- Ask.
- Do not edit.
- Verify.
- Report.

Avoid vague verbs:

- Consider.
- Ensure.
- Leverage.
- Try to.
- Be mindful.

## Placement Discipline

Order rules by behavioral priority, not topic neatness.

Put hard stop conditions before normal workflow details.

Put source-of-truth, user-owned decision, safety, and verification rules above convenience rules.

Do not hide the real constraint in a later caveat.

## Revision Rule

Do not add prose because the skill "could be clearer." Add or move wording because an eval, user failure, or concrete pressure case showed a behavior gap.

When improving a skill after a failure:

1. Name the failed behavior.
2. Find the sentence that should have prevented it.
3. Tighten wording or placement.
4. Keep unrelated sections still.
5. Re-run the smallest relevant eval.
