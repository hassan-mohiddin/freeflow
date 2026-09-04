# Release Process

Freeflow releases one npm package and one public plugin source tree:

```text
@hassangameryt/freeflow
```

The repository root is the source tree. The npm tarball is the installable runtime artifact. GitHub-only documentation, task memory, evaluation definitions, and deprecated historical material remain outside the runtime package.

The package has one portable skills source under `skills/`. Host-specific metadata and delivery adapters are versioned with that package: Agent Plugins 1.0 uses `plugin.json` and `com.github.copilot/`, Gemini uses `gemini-extension.json` and its hook manifest, Cursor uses `.cursor-plugin/`, OpenCode v2 uses the repository-only `opencode.json` `skills` array, Hermes uses its portable Agent Plugins adapter, and Codex/Claude retain their existing manifests. These are compatibility surfaces over the same source tree, not separate packages; `opencode.json` remains outside the npm runtime allowlist.

## Changelog contract

`CHANGELOG.md` is the root package changelog and the release-history source for Freeflow while the repository has one package. The current `## Unreleased` section must use these categories in this order, omitting empty categories:

1. `Breaking Changes`
2. `Added`
3. `Changed`
4. `Fixed`
5. `Removed`

Every entry is a bullet under exactly one category. Unknown, duplicate, empty, out-of-order, or uncategorized content fails `npm run check:changelog`. Pull-request validation also rejects changes to released sections. Release preparation may reorder valid categorized entries into canonical order, but it never guesses a category or rewrites released history.

Agents classify consumer-visible work before editing the changelog, add one concise bullet in the final implementation slice, and run the changelog check. Internal-only work declares that no entry is needed through the pull-request declaration. GitHub Release notes are extracted from the committed versioned section, so the repository changelog remains the single release-note source.

Do not create component changelogs for skills, capabilities, prompts, hooks, or Pi extension modules unless that component becomes an independently consumed and released package. A future package boundary requires its own manifest, README, changelog, tests, artifact, and release lifecycle; its changes must still be represented in the root release notes.

## Release preparation

Release preparation is an authorized local preparation step, not publication:

1. Start from a coherent, freshly verified source checkpoint.
2. Confirm the consumer-visible changes and Unreleased notes.
3. Run the deterministic repository check:

   ```bash
   npm run check
   ```

4. Run release metadata validation:

   ```bash
   npm run check:release-metadata
   npm run test:docs
   npm run test:changelog
   npm run test:release-workflow
   ```

5. Inspect the exact package boundary:

   ```bash
   npm pack --dry-run --ignore-scripts
   ```

6. Use the supported preparation command, preferably with a dry run first:

   ```bash
   npm run release:prepare -- 0.6.0 --dry-run
   npm run release:prepare -- 0.6.0
   ```

The preparation script requires a clean worktree, updates version metadata and the changelog, and does not commit, tag, push, publish, or create a GitHub Release.

Release preparation updates every version-bearing manifest, including `package.json`, `plugin.json`, `gemini-extension.json`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `package-lock.json`. The current post-v0.7.0 implementation keeps `CHANGELOG.md` under `## Unreleased`; its next versioned evidence record is created only when a release target is selected.

## Human-controlled boundaries

A release is not complete because local preparation or a build passes. The human-controlled sequence is:

```text
verified source
-> release preparation and normalized release notes
-> versioned release evidence
-> human-approved commit/tag boundary
-> CI checks exact tag, notes, generated output, tests, and tarball
-> npm publication with provenance
-> registry checksum/provenance verification
-> GitHub Release creation and consumer verification
```

The release workflow extracts notes before npm publication, publishes the exact tarball produced by `npm pack`, verifies the registry checksum and provenance, and creates the GitHub Release only after those checks pass. Recovery may skip publication only when the existing registry artifact matches the candidate checksum and provenance. npm Trusted Publishing and the protected `npm` environment remain external prerequisites.

Do not reuse a published npm version or force-move a release tag. Do not publish from a dirty or different source state. If publication acknowledgement is ambiguous, inspect remote state before retrying.

## Release evidence

For each candidate or release, preserve versioned evidence under [`release-evidence/`](release-evidence/). A version record must state what was checked and what remains unavailable. Keep behavioral evaluation, remote host installation, host trust UI, registry propagation, signatures, marketplace review, and consumer installation claims separate from local deterministic checks. Host-specific smoke checks should cover Codex, Claude, Gemini, Cursor, Copilot/VS Code, Kiro, OpenCode, Hermes, and Pi when those clients are available; their absence leaves the corresponding claim deferred.

## PiFlow development snapshots

A committed Freeflow development snapshot is an integration input for Pi/PiFlow development, not a release or a source-precedence mechanism:

```bash
npm run snapshot:refresh
```

PiFlow owns host launch, import, isolated state, updates, and upstream synchronization. Freeflow owns policy and snapshot production. Production installations use ordinary npm or Git package sources.

## Related documentation

- [Release evidence index](release-evidence/README.md)
- [Architecture](architecture.md)
- [PiFlow integration](integrations/piflow.md)
- [Root changelog](../CHANGELOG.md)
