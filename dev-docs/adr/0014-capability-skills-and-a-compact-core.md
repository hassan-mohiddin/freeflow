# ADR 0014: Capability Skills And A Compact Core

## Status

Accepted; the decisions it records were accepted by Hassan on 2026-10-22. Supersedes the Workflow parts of [ADR 0011: Single Adaptive Workflow](0011-single-adaptive-workflow.md); ADR 0011's other decisions (no process modes, `enabled` as the only core switch, the Interaction Contract as its own fragment, the unsupported mode keys) remain in force.

Source: `working-record:task-004-freeflow-v0-9-0-restructure-capability-skills-and-a-compact-core/record.md#work-agreement` (Goal, Work agreement, decisions D-001 to D-006, Hassan's direction of 2026-10-22); `commit:c9ed791f` (Workflow removed), `commit:469af7f2` (last skill merge).

## Context

Freeflow 0.8 had one adaptive Workflow skill that chose the narrowest owning skill, and twenty-five skills in all, many of them advice-only. Freeflow's own runs showed that skill bodies were rarely opened (the Workflow and Action Selection bodies almost never), while the always-loaded prompts did reach the agent, and that information placed at the decision point moved results where more guidance changed only mechanics. Guidance in a body the agent does not open does not reach the work.

## Decision

1. **No Workflow skill.** Its cycle (agree before building, build and verify, review and hand over), what authorizes work, and where to stop live in the always-loaded core prompt (`runtime/prompts/core.md`, "How Freeflow Works"), which also carries the agreement template. The Action Selection skill is removed; its one rule that reached the work, keeping output small, is in the Working Method on every host.
2. **Routing through descriptions.** Each skill's description says when it applies and, where two skills could fit, which one takes over. No skill orchestrates the others.
3. **Capability-level skills as trunks.** A skill is one capability: its `SKILL.md` covers the common case with a routing table first; references hold narrow, large situations and are read only when their situation arises; scripts put the facts a decision needs in front of the agent (what a change touches, a self-review report, the decision list, delivery state, record recovery). Skills that did one job split by type are merged: eleven skills replace twenty-five (Deliver Work, Execute Work, Discuss Work, Track Work and Write Docs absorb the rest).
4. **No aliases.** A removed or merged skill or command gets no compatibility alias; each removal is a Breaking Change.
5. **Push at the tool call on Pi.** Where a host can observe the moment, a few lines of a skill reach the agent at the tool call that needs them (Tool Execution's guidance notices), so the guidance does not depend on the agent opening the skill.

## Alternatives

- **Keep Workflow and strengthen its cue.** Rejected: the body would still be opened rarely, and the cue already competed with every skill description.
- **Fold every method into the always-loaded prompt.** Rejected: always-loaded text is paid on every request; only guidance shown to change behavior goes there.
- **Keep aliases for one release.** Rejected (Hassan, 2026-10-22: no legacy compatibility); the command-surface audit already rejects aliases (ADR 0010).

## Consequences

- The always-loaded text gains the cycle and the agreement template and loses fourteen descriptions: on Codex and Claude Code, the three prompts and the skill descriptions go from 3,211 to 3,006 words (`wc -w`).
- Links, scripts and commands that name a removed skill break; the changelog lists every removed name and where its job went.
- New methods are added as references or scripts under an existing capability skill, not as new skills, unless they are a new capability.
- Whether the restructure changes task results is measured by the before/after evaluations, not established by this decision.

## Revisit Or Supersession

Revisit if evaluations show that agents open the skill bodies they need without the cycle in core, or that a merged skill's trunk is no longer enough for its common case.
