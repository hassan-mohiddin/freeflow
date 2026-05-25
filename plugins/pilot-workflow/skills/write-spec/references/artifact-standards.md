# Artifact Standards

Use this only for durable artifacts: specs, PRDs, decision artifacts, requirements docs, living docs, policies, or docs future agents or teammates will rely on.

Do not apply this to chat answers, quick questions, tiny reversible work, or conversation mode unless the user explicitly asks for a file.

## Header

For durable specs, start with a compact header:

```md
> **Doc ID:** SPEC-001-team-invitations
> **Date:** 2026-05-26
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** User-provided decision session
```

Rules:

- `Doc ID`: stable, readable, and unique enough for the repo. Prefer `SPEC-###-slug` when no convention exists.
- `Date`: creation date.
- `Owner`: use the named product/technical owner when known. In normal workflow, use `User` if the requester is the only known owner. In strict-workflow, ask when owner is unknown.
- `Type`: `Spec`, `PRD`, `Decision`, or the artifact type requested.
- `Status`: usually `Draft` for new specs unless the user or repo says otherwise.
- `Source`: name the evidence used, not a transcript. Examples: `Shared grilling context`, `docs/research/team-invitations.md`, `User-provided decision session`.

Optional team fields:

```md
> **Approver:** Platform Lead
> **Reviewers:** Security, Billing
> **Last Updated:** 2026-05-27
```

Add optional fields only when the user, repo, team setting, or strict-workflow risk makes them useful.

## Mode Pressure

- Conversation mode: no artifact or header pressure. Answer questions directly.
- Workflow mode: use the header for durable specs and future-agent-facing artifacts.
- Strict-workflow mode: require explicit owner and status for security, billing, privacy, public API, migration, data-loss, and architecture work. Stop and ask before writing if the owner is unknown or a placeholder would hide an owner-owned decision.

## Statuses

Use small status sets:

| Artifact | Statuses |
| --- | --- |
| Spec / PRD / Design Brief | `Draft`, `Approved`, `Implemented`, `Rejected` |
| Plan | `Draft`, `Ready`, `Executed`, `Abandoned` |
| Decision / ADR | `Proposed`, `Accepted`, `Rejected`, `Superseded` |
| Bug / Diagnosis | `Investigating`, `Fixed`, `Verified`, `Rejected` |
| Runbook / Living Doc / Policy | `Current`, `Outdated`, `Deprecated` |

Do not invent a large workflow taxonomy.

## Change Log

Do not add a changelog on first creation.

Add `## Change Log` after a material revision, status transition, or implementation divergence.

Use changelogs for living docs, runbooks, policies, and long-lived architecture docs.

Never use a changelog as a transcript. Record meaningful document evolution only.
