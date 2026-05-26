# Write Spec Eval Report - Iteration 4

Date: 2026-05-26

## Scope

Added and tested artifact-standard behavior for `write-spec`.

New evals:

- `WSP-004` durable spec includes compact header.
- `WSP-005` conversation-mode question does not create an artifact or header.
- `WSP-006` strict-workflow billing/public API spec asks when owner and core decisions are unknown.
- `WSP-007` material revision to existing spec adds a changelog.
- `WSP-008` new unchanged spec does not add a changelog.

## Eval Artifacts

Added prompts:

- `evals/prompts/wsp-004.txt`
- `evals/prompts/wsp-005.txt`
- `evals/prompts/wsp-006.txt`
- `evals/prompts/wsp-007.txt`
- `evals/prompts/wsp-008.txt`

Added fixture file:

- `evals/fixtures/tiny-saas-app/docs/specs/settings-title.md`

Updated registry:

- `evals/registries/fixture-evals.json`

## Skill Change

Added:

- `skills/write-spec/references/artifact-standards.md`

Updated `skills/write-spec/SKILL.md` to:

- Point durable specs and future-agent-facing artifacts to `references/artifact-standards.md`.
- Stop in strict-workflow before writing security, billing, privacy, public API, migration, data-loss, or architecture specs when owner or core decisions are unknown.
- Forbid `TBD` and placeholders as a way to hide owner-owned decisions.
- Require a concise `## Change Log` when materially revising an existing durable spec.
- Keep changelogs off first creation.

## Results

| Eval | Pre-change / first run | Final with skill | Read |
| --- | ---: | ---: | --- |
| WSP-004 durable header | Fail | Pass | Pre-change created the spec without artifact identity. Final run created a headed spec with no changelog. |
| WSP-005 conversation answer | Not run | Pass | Answered in chat and produced an empty diff. |
| WSP-006 strict billing/public API owner | Fail | Pass | First run wrote `Owner: TBD` and created the spec. Final run created no file and named the missing owner/core API decisions. |
| WSP-007 material revision changelog | Fail | Pass | First run revised the spec but omitted changelog. Final run added `## Change Log`. |
| WSP-008 new unchanged spec | Not run | Pass | Created a headed spec and did not add a changelog. |

## Scoring

### WSP-004

| Assertion | Final |
| --- | ---: |
| Creates `docs/specs/team-invitations.md` | 2 |
| Uses shared decision context without re-interviewing | 2 |
| Includes `Doc ID`, `Date`, `Owner`, `Type`, `Status`, and `Source` | 2 |
| Sets Type/Status appropriately | 2 |
| Does not add `## Change Log` on first creation | 2 |

Result: 10/10

### WSP-005

| Assertion | Final |
| --- | ---: |
| Answers directly in final response | 2 |
| Does not create or edit files | 2 |
| Does not create spec/plan/handoff/artifact | 2 |
| Does not include artifact header in chat | 2 |
| Does not apply workflow pressure in conversation mode | 2 |

Result: 10/10

### WSP-006

| Assertion | Final |
| --- | ---: |
| Does not create `docs/specs/billing-webhook-api.md` | 2 |
| Recognizes billing/public API strict-workflow risk | 2 |
| States owner is missing | 2 |
| Asks for owner and unresolved API decisions | 2 |
| Does not use `TBD` placeholders to hide decisions | 2 |

Result: 10/10

### WSP-007

| Assertion | Final |
| --- | ---: |
| Updates `docs/specs/settings-title.md` | 2 |
| Preserves Settings title requirement | 2 |
| Adds Profile title requirement | 2 |
| Adds acceptance coverage for both titles | 2 |
| Adds concise `## Change Log` | 2 |

Result: 10/10

### WSP-008

| Assertion | Final |
| --- | ---: |
| Creates `docs/specs/session-timeout-copy.md` | 2 |
| Uses shared decision context without re-interviewing | 2 |
| Includes compact durable artifact header | 2 |
| Does not add `## Change Log` | 2 |
| Keeps scope to session timeout copy | 2 |

Result: 10/10

## Evidence

Pre-change / first-run failures:

- `evals/runs/write-spec-4/wsp-004-current-with-skill-output.md`
- `evals/runs/write-spec-4/wsp-004-current-with-skill-output.diff`
- `evals/runs/write-spec-4/wsp-006-with-skill-output.md`
- `evals/runs/write-spec-4/wsp-006-with-skill-output.diff`
- `evals/runs/write-spec-4/wsp-007-with-skill-output.md`
- `evals/runs/write-spec-4/wsp-007-with-skill-output.diff`

Final with-skill outputs:

- `evals/runs/write-spec-4/wsp-004-with-skill-output.md`
- `evals/runs/write-spec-4/wsp-004-with-skill-output.diff`
- `evals/runs/write-spec-4/wsp-004-created-spec.md`
- `evals/runs/write-spec-4/wsp-005-with-skill-output.md`
- `evals/runs/write-spec-4/wsp-005-with-skill-output.diff`
- `evals/runs/write-spec-4/wsp-006-with-skill-fixed-output.md`
- `evals/runs/write-spec-4/wsp-006-with-skill-fixed-output.diff`
- `evals/runs/write-spec-4/wsp-007-with-skill-fixed-output.md`
- `evals/runs/write-spec-4/wsp-007-with-skill-fixed-output.diff`
- `evals/runs/write-spec-4/wsp-007-updated-spec.md`
- `evals/runs/write-spec-4/wsp-008-with-skill-output.md`
- `evals/runs/write-spec-4/wsp-008-with-skill-output.diff`
- `evals/runs/write-spec-4/wsp-008-created-spec.md`

## Read

The new reference earned its place: `WSP-004` and `WSP-008` both caused the agent to read `artifact-standards.md` and add compact headers.

Two rules needed to be promoted into `SKILL.md` because agents missed them when they were only in the reference:

- Strict-workflow high-risk specs with unknown owner/core decisions must stop instead of writing placeholders.
- Material revisions to existing durable specs need a concise changelog.

`WSP-005` and `WSP-008` are not lift-over-baseline proofs. They protect proportionality: no header pressure for conversation-mode answers, and no changelog on first creation.

## Recommendation

Keep the artifact standards reference and the two promoted hard rules.

Next useful batch can proceed after this lands:

- Artifact review can reference `write-spec/references/artifact-standards.md`.
- Decision destinations can cite the same standard for durable decision artifacts.
- Planning/review work should not copy the standard wholesale; cite it only where durable artifact identity matters.
