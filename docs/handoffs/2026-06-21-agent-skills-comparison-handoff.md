# Project Handoff

Date: 2026-06-21

## Purpose

Capture the research comparing Addy Osmani's `agent-skills` plugin with Freeflow, including what `agent-skills` has that Freeflow does not, which gaps look worth exploring, and which should likely remain outside Freeflow's scope.

This handoff is memory, not authority. Reopen linked live files and current upstream sources before consequential edits. Live repo evidence, accepted ADRs, current tests/evals, and explicit user decisions override this text.

## Stable Context

The user found `https://github.com/addyosmani/agent-skills.git`, noted Addy Osmani's credibility/following, and asked for deep analysis against Freeflow.

Research inspected a shallow clone of `agent-skills` at commit `a5f0b17` in `/tmp/agent-skills-analysis` during this chat. That temp clone may not persist. Future agents should re-clone or inspect upstream before relying on exact current contents.

High-level conclusion from this pass:

- `agent-skills` is a broad production-engineering playbook pack.
- Freeflow is a workflow-control and evidence/decision discipline layer.
- Freeflow should not pivot into a clone of `agent-skills`.
- Freeflow should consider borrowing selected command UX, reviewer/persona, source-driven, TDD, and anti-rationalization patterns where evals or product decisions justify them.

## Live Evidence

Freeflow evidence to reopen before changing Freeflow:

- `README.md`
- `CONTEXT.md`
- `docs/README.md`
- `docs/freeflow-current-state.md`
- `docs/freeflow-packaging-and-publishing-design.md`
- `docs/freeflow-runtime-and-lifecycle.md`
- `plugins/freeflow/docs/README.md`
- `plugins/freeflow/docs/workflow.md`
- `plugins/freeflow/docs/architecture.md`
- `plugins/freeflow/docs/skills.md`
- `plugins/freeflow/docs/release-evidence.md`
- `plugins/freeflow/docs/adr/0001-three-modes.md`
- `plugins/freeflow/docs/adr/0002-evals-before-hooks.md`
- `plugins/freeflow/docs/adr/0003-release-boundary.md`
- `plugins/freeflow/docs/adr/0004-discover-replaces-shallow-discovery-skills.md`
- `plugins/freeflow/command-surface.json`
- `plugins/freeflow/skills/*/SKILL.md`
- `plugins/freeflow/evals/README.md`
- `plugins/freeflow/evals/reports/acceptance/v0.1-acceptance-report.md`
- `plugins/freeflow/evals/reports/by-skill/discover-1-report.md`
- `plugins/freeflow/evals/reports/by-skill/interview-gate-2-report.md`
- `plugins/freeflow/evals/reports/by-command-surface/command-surface-matrix.md`
- `plugins/freeflow/evals/reports/runtime/always-on-runtime-1-report.md`
- `plugins/freeflow/evals/reports/runtime/workflow-context-hook-1-report.md`

`agent-skills` upstream sources inspected in this pass:

- `README.md`
- `plugin.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/skill-anatomy.md`
- `docs/agents.md`
- `docs/getting-started.md`
- `docs/antigravity-setup.md`
- `docs/gemini-cli-setup.md`
- `docs/cursor-setup.md`
- `references/orchestration-patterns.md`
- `references/security-checklist.md`
- `references/performance-checklist.md`
- `references/testing-patterns.md`
- `references/accessibility-checklist.md`
- `hooks/hooks.json`
- `hooks/session-start.sh`
- `hooks/SDD-CACHE.md`
- `hooks/SIMPLIFY-IGNORE.md`
- `scripts/validate-skills.js`
- `.github/workflows/test-plugin-install.yml`
- `.claude/commands/*.md`
- `.gemini/commands/*.toml`
- `commands/*.toml`
- `agents/*.md`
- `skills/*/SKILL.md`

Key observed repo facts from the inspected `agent-skills` clone:

- 24 skills: 23 lifecycle skills plus `using-agent-skills` meta-skill.
- 4 personas: `code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor`.
- 8 command entry points in Claude/Gemini/Antigravity forms: `/spec`, `/plan` or `/planning`, `/build`, `/test`, `/review`, `/code-simplify`, `/ship`, `/webperf`.
- Active plugin hook injects the `using-agent-skills` meta-skill on Claude `SessionStart`.
- Optional hook docs/scripts include `sdd-cache` and `simplify-ignore`.
- `node scripts/validate-skills.js` passed in the inspected clone.
- No adversarial baseline-vs-with-skill behavior eval suite was found in this pass; validation appears structural/install/hook-oriented.

Observed Freeflow comparison facts from this pass:

- Freeflow runtime has 18 active skills under `plugins/freeflow/skills/`.
- Freeflow skill bodies are much shorter on average than `agent-skills`.
- Freeflow has stronger explicit rules for user-owned decisions, source-truth conflicts, artifact destinations, verification claims, handoffs, and mode pressure.
- Freeflow has stronger behavior eval evidence, including v0.1 acceptance, always-on source-truth conflict evidence, command-surface coverage, workflow context hook checks, and discover/interview-gate eval reports.

## Decisions Made

Only these decisions are settled from this chat:

- Create a memory handoff under `docs/handoffs/` for durable project memory.
- Treat the comparison findings as research input, not adoption approval.
- Future adoption of any `agent-skills` concept remains a product/scope decision and should go through Freeflow's normal discover/spec/plan/eval route.

No decision has been made to add command aliases, new skills, reviewer personas, or native command handlers.

## Research Findings

### Overall comparison

`agent-skills` is stronger in breadth, command ergonomics, concrete engineering tactics, reviewer personas, and public multi-host setup docs.

Freeflow is stronger in workflow judgment, source-truth/user-owned-decision boundaries, artifact destination discipline, verification claim honesty, and eval-backed behavior iteration.

The best strategic framing is not “Freeflow versus agent-skills.” It is:

> Freeflow is the workflow judgment layer. Point-skill packs like `agent-skills`, Matt Pocock's skills, or Superpowers can provide domain tactics inside Freeflow's phases. Freeflow should own source truth, user-owned decisions, routing, verification claims, review/commit/handoff discipline, and evidence gates.

### Confidence score meaning

Scores below are subjective confidence that:

1. `agent-skills` has the item,
2. Freeflow materially lacks or only partially covers it,
3. the category recommendation is right.

They are not proof of value. Use evals or dogfooding before implementation claims.

## Worth Having Or Looking Into

| Item | Type | What `agent-skills` has that Freeflow lacks | Why worth considering | Confidence |
| --- | --- | --- | --- | ---: |
| User-friendly lifecycle aliases: `/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship` | Command UX | Simple public command names over precise internal names | Better ergonomics; can alias existing Freeflow skills without changing core behavior | 0.95 |
| Native command files for Claude/Gemini/Antigravity | Runtime/package UX | `.claude/commands`, `.gemini/commands`, `commands/*.toml` | Worth exploring after v0.1 because users understand commands faster than model-routed phrases | 0.82 |
| Specialist reviewer personas | Feature | `code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor` | Strong companion to `review-work`; can keep main Freeflow small while adding focused lenses | 0.92 |
| Parallel review fan-out | Concept | `/ship` runs code/security/test reviewers in parallel and merges reports | Useful for high-risk closeout; aligns with Freeflow review/verify discipline | 0.88 |
| Anti-rationalization tables | Skill-writing pattern | Skills name common agent excuses and rebuttals | Compatible with Freeflow's failure-prevention style | 0.90 |
| `interview-me` hypothesis + confidence loop | Partial overlap | Hypothesis, confidence score, one question with a guess, “predict next 3 questions” stop test | Freeflow has `interview-gate`, but this is stronger for early product discovery | 0.78 |
| Divergent/convergent idea refinement | Skill/concept | `idea-refine` explores alternatives, assumptions, MVP, not-doing | Freeflow `discover` covers discovery, but could borrow this for brainstorming inside discover | 0.72 |
| Fixed intent restate shape | Concept | Outcome / User / Why now / Success / Constraint / Out of scope | Useful for discovery checkpoints and specs | 0.83 |
| Spec sections: commands, project structure, code style, testing strategy, boundaries | Partial overlap | `spec-driven-development` requires these six areas | Do not force all specs into this shape, but useful for future-agent specs | 0.80 |
| Always / Ask first / Never boundaries | Concept | Spec boundary taxonomy | Compatible with Freeflow user-owned decision rules | 0.86 |
| Dependency graph before plan | Partial overlap | Planning skill maps dependencies explicitly | Freeflow plans mention slices, but less explicit graphing | 0.81 |
| Task sizing guidelines | Concept | XS/S/M/L/XL task size model and break-down rules | Useful for future-agent plans and delegation | 0.76 |
| Vertical slicing examples | Partial overlap | Full-stack slice examples | Freeflow has vertical slices but fewer concrete examples | 0.78 |
| Incremental implementation details | Partial overlap | One thing at a time, feature flags, safe defaults, rollback-friendly changes | Freeflow `execute-plan` has slice discipline; these are useful execution sub-rules | 0.80 |
| Full TDD playbook | Skill gap | Red/green/refactor, Prove-It, test pyramid, DAMP, mocking hierarchy | Freeflow mentions TDD but does not ship a full first-party TDD skill | 0.93 |
| Test design patterns reference | Reference gap | Arrange/Act/Assert, naming, React/API/E2E examples | Good optional `verify-work` / TDD reference candidate | 0.86 |
| Browser testing with DevTools MCP | Skill gap | DOM, console, network, screenshots, performance traces | Strong addition for `verify-work`, especially UI work | 0.88 |
| Source-driven development | Skill gap | Official-docs-first framework decisions, cite URLs, flag unverified patterns | Very relevant; prevents stale framework/API hallucinations | 0.89 |
| Context engineering | Skill gap | Context hierarchy, context packing, rules-file design, stale-context management | Freeflow has runtime context, but not a general context-curation skill | 0.74 |
| Doubt-driven development | Concept/possible skill | Claim → extract artifact/contract → adversarial fresh-context review → reconcile | Worth studying for strict-workflow decisions; avoid ceremony creep | 0.72 |
| Cross-model second opinion pattern | Concept | Offers Gemini/Codex/manual external review for high-stakes doubt cycles | Interesting for strict-workflow, but needs careful user authorization | 0.66 |
| API/interface design lens | Skill gap | Hyrum's Law, contract-first design, error semantics, boundary validation | Strong fit for public API and module-interface strict-workflow work | 0.86 |
| Frontend UI engineering lens | Skill gap | Component architecture, state, design systems, responsive design, accessibility | Useful optional domain reference; likely not core Freeflow | 0.76 |
| Accessibility checklist | Reference gap | WCAG keyboard/screen reader/forms/content checks | Useful for UI verification and review | 0.82 |
| Security hardening lens | Skill gap | Threat modeling, OWASP, auth, input validation, LLM security | Relevant as strict-workflow reference, not necessarily core workflow state | 0.88 |
| Performance optimization lens | Skill gap | Measure-first, Core Web Vitals, budgets, frontend/backend perf checks | Useful optional review/verify reference | 0.78 |
| Web performance metric-honesty rule | Concept | Static source scans must not fabricate LCP/INP/CLS | Excellent Freeflow-style verification rule | 0.86 |
| Code simplification skill | Skill gap | Preserve behavior, Chesterton's Fence, Rule of 500, simplify incrementally | Could pair with Freeflow architecture/deepening goals | 0.80 |
| Code review five-axis rubric | Partial overlap | Correctness, readability, architecture, security, performance | Freeflow `review-work` is process-strong; this adds concrete review lenses | 0.84 |
| Review severity taxonomy | Concept | Critical / Important / Suggestion, or Nit / Optional / FYI | Useful to reduce review churn | 0.79 |
| Dependency discipline | Concept | Existing stack, size, maintenance, vulnerabilities, license before adding dependencies | Good strict-workflow/public API/security adjunct | 0.82 |
| Git workflow beyond commit | Partial gap | Branching, worktrees, trunk-based guidance, save points | Freeflow has commit guard, not broader branch/worktree guidance | 0.74 |
| CI/CD automation skill | Skill gap | Quality gates, deployment strategies, CI failure feedback | Useful future `ship`/release reference | 0.70 |
| Deprecation/migration skill | Skill gap | Compulsory vs advisory deprecation, migration path, zombie code | Strong fit for strict-workflow migrations and public API changes | 0.82 |
| Documentation/API docs/changelog guidance | Partial gap | ADR templates, README, API docs, changelog standards | Freeflow has artifact discipline, but not broad docs guidance | 0.73 |
| Observability/instrumentation skill | Skill gap | Structured logs, RED metrics, tracing, alerting | Worth looking into for production-bound work | 0.74 |
| Shipping/launch skill | Skill gap | Pre-launch checklist, staged rollout, feature flags, rollback, monitoring | Freeflow has commit/handoff, not release/launch | 0.86 |
| Reference checklist model | Packaging pattern | Root references for security, performance, accessibility, testing | Good model for optional depth without bloating active skills | 0.84 |
| Skill anatomy validator | Tooling | CI checks skill frontmatter, sections, references | Freeflow has stronger behavior evals, but a lightweight structure lint could help | 0.70 |
| Plugin install CI | Tooling | `claude plugin validate`, install smoke in GitHub Actions | Matches Freeflow's deferred install-smoke work | 0.80 |
| Multi-host setup guides | Docs | Cursor, Gemini, Antigravity, Windsurf, OpenCode, Copilot | Freeflow docs are thinner outside Codex/Claude/Pi | 0.90 |
| HTTP-revalidated docs cache idea | Hook/tooling idea | Source docs cache using ETag/Last-Modified | Worth studying if source-driven docs work lands; not core enforcement | 0.56 |
| Treat error/browser/external output as untrusted | Concept | Explicit in debugging/browser/context skills | Freeflow has output-router exactness safety, but could use broader prompt-injection hygiene wording | 0.76 |

## Probably Do Not Need

| Item | What `agent-skills` has | Why Freeflow likely should not adopt it | Confidence |
| --- | --- | --- | ---: |
| Full broad engineering encyclopedia as core | 24 broad skills across all engineering domains | Freeflow's moat is workflow judgment, not becoming a giant best-practices pack | 0.93 |
| “If any skill might apply, invoke it first” | OpenCode `AGENTS.md` says even 1% chance means use skill | Conflicts with Freeflow's “question means answer” and low-ceremony philosophy | 0.96 |
| “Never implement directly if a skill applies” | Strong mandatory skill routing | Too rigid; Freeflow intentionally scales process to risk | 0.92 |
| “Follow skills exactly” | Skills are workflows, not suggestions | Freeflow needs judgment around source truth, user decisions, and host constraints | 0.88 |
| Mandatory `SPEC.md` destination | `/spec` saves `SPEC.md` in root | Freeflow artifact-destination discipline is better; destination should depend on repo convention | 0.94 |
| Mandatory `tasks/plan.md` and `tasks/todo.md` | `/plan` saves fixed paths | Creates conventions without owner confirmation | 0.94 |
| `/build auto` autonomous whole-plan execution | One approval, then implements all tasks with commits | High risk; conflicts with Freeflow's backward edge and review/decision gates | 0.88 |
| Mandatory per-task commits during build | `/build` commits every task | Useful sometimes, but Freeflow should route to `commit-work` after evidence, not auto-commit by default | 0.82 |
| Session-start injection of the full meta-skill | Hook injects `using-agent-skills` every session | Freeflow already loads compact workflow/interview context; giant meta injection increases context pressure | 0.86 |
| File-mutating `simplify-ignore` hook | Hook replaces protected code blocks with placeholders on `Read` and restores on stop | Too risky for Freeflow's context-loading-only runtime boundary | 0.95 |
| Exact `sdd-cache` hook as shipped | Blocks WebFetch and returns prompt-shaped cached output | Interesting idea, but exact implementation is too host/tool-specific for Freeflow core | 0.66 |
| 300–500 line active skill bodies | Many long skills with examples | Freeflow intentionally keeps active skills short and uses references only when earned | 0.91 |
| Copying all code examples into skills | Extensive TypeScript/Python/React examples inline | Good for playbooks, but would bloat Freeflow core | 0.88 |
| Google engineering culture branding as core identity | DORA, Google practices, SWE book references | Useful ideas, but Freeflow should keep its own source-truth/user-control identity | 0.86 |
| Universal trunk-based development recommendation | Git skill recommends trunk-based development | Branch strategy is team-owned; Freeflow should not prescribe this globally | 0.78 |
| Blanket “skip skill if user wants speed” wording | Several skills exclude when user explicitly wants speed | Freeflow can skip ceremony, but cannot skip user-owned decisions or truthful verification claims | 0.83 |
| Required positive praise in every review | Review personas always include “what's done well” | Fine for human tone, but not a Freeflow requirement; review can be terse and evidence-first | 0.68 |
| OpenCode-specific strict `AGENTS.md` behavior | Repo instructions force skill-driven execution | Too host-specific and too rigid for Freeflow runtime docs | 0.87 |
| `idea-refine.sh` wrapper script | Script outputs a prompt/template | Not needed; agent can follow a small discovery/idea-refine reference directly | 0.80 |
| Skill zip packaging convention | `AGENTS.md` mentions `{skill-name}.zip` packaging | Not relevant to Freeflow's current package/runtime shape | 0.82 |
| Broad Agent Teams tutorial inside core docs | Long orchestration docs for Claude Agent Teams | Useful as external reference, but too much for Freeflow public docs | 0.70 |
| Treating command layer as primary orchestrator | User/commands orchestrate lifecycle | Freeflow should keep workflow routing model-based and evidence-gated, not command-only | 0.74 |
| One generic `SPEC.md` for all projects | Spec as central source truth | Freeflow is better with narrow owning artifacts: spec, ADR, handoff, plan, domain doc, chat | 0.91 |

## Recommended Next Focus

If continuing this line of work, do not jump straight to implementation. Recommended route:

1. **Research/spec decision:** Decide whether Freeflow wants compatibility/ergonomic aliases, optional domain skills, reviewer personas, or all three. These are product-scope decisions.
2. **Start with aliases if approved:** They are likely high value and low conceptual risk if they route to existing Freeflow skills and preserve gates.
3. **Evaluate reviewer personas:** Add a small eval or dogfood run comparing current `review-work` versus reviewer-lens prompts on a review fixture.
4. **Evaluate source-driven/TDD references:** Add only if there is a concrete failure or high-value workflow gap. Avoid broad encyclopedia expansion.
5. **Update docs only after decisions:** If command aliases or personas become accepted, update public docs, command-surface metadata, and eval coverage together.

Highest-priority candidates from this research:

- User-friendly aliases: `/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship`.
- Specialist reviewer personas or reviewer prompt templates.
- Source-driven development guidance.
- Full TDD / Prove-It reference for `execute-plan`, `diagnose-failure`, and `verify-work`.
- Anti-rationalization tables for high-risk Freeflow skills.

## Stop Conditions

Stop and ask before editing if the next step would:

- Expand Freeflow from workflow layer into a broad engineering playbook.
- Add native commands or aliases that change public command surface expectations.
- Add first-party domain skills such as security/performance/frontend without user confirmation that this is in scope.
- Add hooks that enforce, block, or mutate files.
- Add fixed artifact destinations like `SPEC.md` or `tasks/plan.md` as defaults.
- Claim Freeflow is better than `agent-skills` without direct eval evidence.
- Copy substantial text from `agent-skills` instead of writing Freeflow-native wording.

## Superseded Or Deferred Work

No files were changed during the research turns before this handoff.

Deferred validation work if adoption proceeds:

- Re-clone `agent-skills` and verify current upstream state.
- Create baseline-vs-with-candidate evals for any proposed Freeflow skill/command change.
- Run Freeflow command-surface audit after command-surface edits.
- Run existing metadata/runtime checks after docs/runtime changes.
