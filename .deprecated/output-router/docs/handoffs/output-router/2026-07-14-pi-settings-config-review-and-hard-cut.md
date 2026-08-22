# Pi Settings And Config Review Handoff

Date: 2026-07-14

## Purpose

Preserve the discussion about Freeflow's Pi settings UI, configuration contract, legacy compatibility, and identified defects so another context can continue without repeating the review or assuming implementation was approved.

This handoff is memory, not authority. Reopen the live files and verify every claim before editing. The owner explicitly does not want review assertions treated as facts without concrete code evidence.

## Accepted Direction

The owner established:

- Freeflow has no external users; the owner is currently the only user.
- Config/settings do not need backward-compatible migration.
- When a config shape is superseded, the old shape should be removed or rejected clearly rather than accepted and translated.
- The active product should use one current canonical config shape.
- Discussion does not authorize implementation. Do not edit until the owner explicitly asks.
- Explain one issue at a time, concisely. Do not expand the issue list or dump a full audit into chat.

For settings persistence, the agreed behavior is:

1. temporarily block another edit;
2. build and validate the proposed config;
3. write the file;
4. only after success, update the displayed value and set `changed = true`;
5. on failure, keep the old value, show the error, and do not reload;
6. unblock editing.

A visible `Saving…` state is unnecessary for the expected millisecond-scale local write.

## Canonical Config Direction

Current config/settings work should converge on nested fields only:

```json
{
  "enabled": true,
  "defaultMode": "workflow",
  "skills": {
    "enabled": true
  },
  "outputRouter": {
    "enabled": true,
    "thresholds": {
      "largeOutputBytes": 64000,
      "largeOutputLines": 1000
    },
    "vault": {
      "root": "~/.cache/freeflow-router/vault",
      "retention": {
        "strategy": "ttl",
        "ttlDays": 7
      }
    },
    "hints": {
      "generatedPathGlobs": [],
      "noisyCommandPatterns": []
    },
    "observedRouting": {},
    "scriptTransform": {}
  },
  "delegationHarness": {
    "enabled": true
  }
}
```

Optional/default fields should still be omitted when not requested. The example shows ownership and nesting, not a requirement to dump defaults.

## Active Legacy Config Behavior Found

These are live compatibility paths found in the files inspected:

1. Pi and the shared hook accept top-level `observedRouting` and `scriptTransform`.
2. Router normalization accepts old flat fields:
   - `outputRouter.largeOutputBytes`
   - `outputRouter.largeOutputLines`
   - `outputRouter.vaultRoot`
   - `outputRouter.vaultRetentionDays`
   - `outputRouter.generatedPaths`
   - `outputRouter.noisyCommandHints`
3. `pi-extension/src/settings-ui.ts` contains `migrateLegacyRouterConfig()` and calls it during ordinary setting changes.
4. Settings rows read old field locations as fallbacks.
5. `freeflow_status` exposes `action="migration"` and migration recommendations.
6. The script-transform installer reads top-level `scriptTransform`, moves it under `outputRouter`, and deletes the old field.
7. Current public Output Router docs still show old flat/top-level examples.
8. Active tests preserve old config parsing and migration behavior.

The runtime can currently read both shapes. That compatibility appears to have been added from a default backward-compatibility assumption despite the owner previously stating there were no users.

## How Legacy Tests Should Change

If the hard cut is later authorized:

- Rewrite compatibility tests as rejection tests.
- Update current fixtures to canonical nested config.
- Keep at most one intentionally invalid old-config fixture to prove rejection.
- Delete migration-action tests when the migration feature is removed.
- Rebuild generated `dist/` output so removed compatibility code is not shipped.
- Update current docs/examples to show only the canonical shape.
- Add an audit that rejects old paths in active source, tests, fixtures, and current docs.
- Do not rewrite historical eval reports merely because they record old behavior; history cleanup is a separate owner decision.

## Settings And Config Findings To Reverify

### Confirmed code behavior

1. **Unrelated config rewriting**
   Ordinary setting writes call legacy migration and broad default pruning. A one-field edit can therefore rewrite unrelated config. Whether broad canonicalization is desirable was resolved by the owner: no migration is wanted.

2. **False save success after write failure**
   The UI updates local state and marks `changed` before persistence. Write errors are caught without propagating failure, so close handlers may still announce success and reload.

3. **Invalid script language can broaden configuration**
   Unsupported language text is filtered. An all-invalid result becomes an empty list; empty lists delete the key; deleting the key restores default languages `javascript`, `python`, and `jq`.

4. **UI accepts numeric values runtime later rejects**
   The editor checks only positive integers, while script limits have product maximums. Raw config and displayed state can disagree with effective normalized state.

5. **Manual retention exposes ineffective TTL editing**
   When vault retention strategy is `manual`, the UI still displays and edits TTL days even though runtime ignores TTL for manual retention.

6. **Delegation environment override is not represented by the writable row**
   Effective delegation is config OR `FREEFLOW_DELEGATION_HARNESS_ENABLED=1`, but the settings row reflects config only. A disable action can claim success while the environment keeps delegation active.

7. **Nested typo acceptance**
   A value such as `skills.enable: false` is accepted because only `skills.enabled` is checked. Skills then default to enabled.

8. **Text editing limitations**
   The custom editor supports append, trailing backspace, Enter, and Escape. It lacks normal cursor editing, replacement, multi-character paste, and IME support.

9. **Terminal width handling is not ANSI-aware**
   Custom truncation uses JavaScript string length/slicing instead of terminal-visible width utilities; styled or Unicode text can truncate incorrectly.

### Policy or UX questions, not established runtime bugs

1. **Observed-routing persistence choice**
    Runtime validly supports persistence `none`, but the setup contract says each enabled producer requires a user-chosen persistence mode. Decide whether default `none` is accepted policy or explicit selection is required.

2. **MCP JSON validation is shallow**
    The UI validates only that the value is an object; deeper invalid values are written and normalized later. This is a feedback-quality choice unless strict pre-write validation is accepted.

3. **Output Router has 22 peer rows**
    Search and scrolling work. Further subgroups are a UX preference, not a proven defect.

4. **Conversation-mode selector wording is brief**
    It omits the read-only mutation boundary present in runtime guidance. This is wording preference unless user testing shows confusion.

5. **Public docs and canonical config disagree**
    Legacy examples still work because compatibility exists, but they conflict with the current canonical setup contract.

6. **Large settings module**
    `settings-ui.ts` owns schema-like definitions, parsing, migration, persistence, rendering, input, and commands. File size alone is not a defect; extract boundaries only when authorized work benefits.

7. **Direct non-atomic config write**
    `writeFile` replacement has crash/concurrent-writer risk. This is hardening, not evidence of an observed failure. Atomic temp-file rename and serialization are possible later.

## Proposed Implementation Route — Not Yet Authorized

If the owner explicitly approves implementation:

1. Freeze and test the canonical config schema.
2. Make old config keys fail clearly; do not translate them.
3. Remove legacy readers, settings fallbacks, migration code/action, installer fallback, and compatibility tests.
4. Implement serialized persist-first settings changes using the agreed behavior.
5. Validate the complete proposed config before writing.
6. Fix script languages, numeric caps, manual retention, nested typos, and effective environment-state display.
7. Replace handmade text editing with Pi's supported editor/input components and ANSI-aware width utilities.
8. Update current docs and rebuild `dist/`.
9. Run focused and full verification.

Do not combine historical-report cleanup, unrelated vault-record compatibility, batch-operation history, or other non-config legacy removal into this scope without another owner decision.

## Files To Reopen

- `pi-extension/src/settings-ui.ts`
- `pi-extension/src/runtime-context.ts`
- `pi-extension/src/status.ts`
- `pi-extension/src/index.ts`
- `router/src/config/config.ts`
- `router/src/setup/script-transform-adapters.ts`
- `hooks/freeflow-runtime-context.mjs`
- `pi-extension/tests/pi-extension.test.js`
- `router/tests/config/config.test.js`
- `router/tests/setup/script-transform-adapters.test.js`
- `skills/setup-freeflow/references/activation-contract.md`
- `skills/setup-freeflow/references/output-router-setup.md`
- `plugin-docs/output-router.md`
- current installed Pi `docs/tui.md` and `docs/extensions.md`

## Evidence Already Collected

Before this handoff, with no source edits from this discussion:

- Pi extension tests passed: 109/109.
- Router tests passed: 330/330.
- `freeflow_status doctor` reported the then-current config as valid with no warnings or migration recommendations.

These test results prove the current implementation matches its current tests. They do not prove that the legacy policy or settings semantics are the desired product behavior.

## Worktree State

Immediately before creating this handoff, `git status --short` was clean. This handoff itself is the only expected new worktree change. No config or implementation files were edited during the discussion.

## Resume Rules

- Reinspect live state; do not trust this handoff over current code.
- Discuss one issue at a time when the owner asks.
- Keep answers concise and plain.
- Do not infer implementation authority from agreement about product direction.
- Stop before expanding beyond config/settings legacy removal and the accepted settings fixes.
