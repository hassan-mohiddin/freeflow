# Recovery And Representation

Read this reference only after the core skill identifies one of these observable conditions:

- a mutation returns `committed-unconfirmed`;
- `inspect` reports recovery evidence or a stale, invalid, or quarantined lock;
- the selected record is legacy, malformed, or an unsupported schema;
- the user explicitly selects one source for copy migration;
- the user explicitly authorizes `canonical-markdown` compression of one schema-v3 record.

Ordinary context-loss reconstruction remains in `SKILL.md`: run `view --view resume`, compare memory with current conversation and live evidence, reconcile contradicted state, and return to the active owner. Do not load this conditional reference merely because a session resumed.

## Preserve The Failure Unit

`record.md` is the sole canonical semantic state. Locks, recovery markers, snapshots, and manifests are local non-semantic evidence. They never become authority, a second task store, or proof that the task outcome is complete.

Before any exceptional action:

- keep the exact root, record or source path, observed status, and last confirmed SHA;
- read the current public help or generated command schema available for that operation;
- preserve the first unfavorable result instead of rerunning until it disappears;
- never delete or edit locks, markers, snapshots, manifests, or canonical records manually;
- never retry a non-idempotent operation from held input after uncertainty;
- keep source and recovery material inside the ignored local task boundary;
- stop when actual state cannot be classified without choosing among competing copies or meanings.

Public command results use structured JSON transport. Initialization and ordinary mutation results may include full candidate Markdown for confirmation; treat it as sensitive local state, not a sanitized export or second canonical store. Migration, compression, and error envelopes are bounded. Inspect status, exit code, error code, hashes, IDs, paths, and counts. Do not assume omitted semantic content was safe or successful.

## Read The Complete Command Contract

Before invoking an operation, run `schema --command <name>` and use its generated JSON input schema plus `x-cli` transport metadata. Do not infer flags from JSON property names or from an older command surface.

`init` requires the CLI options `--name <short-name>` and `--input <json|->`; `--root`, `--dry-run`, and `--help` are separate optional controls. Existing-record mutations require their declared record, exact-SHA, and input options. `view`, `schema`, validation, recovery, migration, compression, and lifecycle commands each expose different generated option sets.

## Inspect Before Recovery

Use `inspect` when representation or persistence state is uncertain. It may report:

- schema-v3 representation and canonicality;
- legacy, unsupported, or malformed source state;
- exact source byte or inventory facts used by migration;
- recovery-marker state;
- mutation-lock state.

Inspection is read-only. It does not clear recovery evidence, validate user intent, establish authority, or confirm a semantic mutation.

Use `validate` only for the representation it supports. A structurally valid record may still be stale, semantically wrong, unauthorized, or inconsistent with current conversation and live sources.

## Reconcile Uncertain Publication

`committed-unconfirmed` means atomic publication may have occurred, but confirmation, directory sync, recovery-marker publication, or lock release did not establish ordinary success.

1. Stop dependent mutation and discard every held SHA and candidate assumption.
2. Run `inspect` against the exact record path.
3. If recovery evidence is valid and current authority covers recovery, run `reconcile` through its public shape.
4. Let the script fresh-read and validate actual canonical bytes before it classifies the result.
5. Treat committed and not-committed classifications as persistence facts, not task judgments.
6. Keep conflicting, invalid, malformed, changed, or unclassifiable state blocked. Do not select a preferred version.
7. After successful reconciliation, fresh-run `validate` and `view --view resume` before relying on record meaning or attempting another mutation.

When recovery-marker publication fails after commit, the owned lock may remain as the only uncertainty boundary. Preserve it and stop. Do not release it manually or infer the committed bytes from the attempted candidate.

A recovery result confirms only the classified local filesystem state. Reconcile task meaning separately against the conversation, live evidence, repository instructions, and accepted source truth.

## Recover An Exact Stale Lock

A lock is not stale merely because no work appears active. Use only the script's inspected classification.

Use `unlock` only when:

- the script reports one stale lock rather than a live or malformed lock;
- the user or current authority explicitly covers stale-lock recovery;
- the input carries the exact inspected token, PID, creation time, and record path required by the public command.

The recovery boundary compares those selectors immediately before quarantine and cleanup. Changed, replaced, live, malformed, concurrently removed, or mismatched locks fail closed. If quarantine cleanup fails, recovery remains blocked until the script can classify and complete it safely.

Successful `unlock` means only that the exact stale lock was recovered. Fresh-run `inspect`, `validate`, and `view --view resume`; unlocking does not confirm record content or authorize the interrupted operation.

## Respect Workspace Safety

Canonical mutation and rewrite destinations must remain under the explicit root's `.freeflow/tasks/task-NNN-<name>/record.md` boundary.

The implementation rejects:

- traversal outside the root;
- symlinked mutable topology;
- tracked task records;
- task records that are not ignored by Git;
- malformed task-directory or record names;
- migration destinations that already exist;
- migration requests whose source and destination are the same.

Do not weaken these checks to recover a convenient path. Move only through an explicitly supported, separately authorized boundary.

## Migrate One Selected Source Copy

`migrate` is a conservative copy operation. It never rewrites the selected source in place and never authorizes migration of another record. The package carries a read-only schema-v2 compatibility parser under `scripts/compat/schema-v2/`; it exists only to read migration sources and is not a second canonical store. Do not replace it with an import from another Track Work installation.

### Prepare

1. Identify one exact source inside the explicit root and one distinct, absent schema-v3 destination under `.freeflow/tasks/**/record.md`.
2. Confirm the user selected this source. A Plan, inventory, fixture matrix, or successful migration elsewhere is not selection.
3. Read `schema --command migrate`.
4. Supply only the declared source path, destination path, exact source SHA-256, and authority source through JSON transport.
5. Run the public command with `--dry-run` first.

### Judge Coverage

The migrator inventories source bytes and semantic units. Each material source unit must have one explicit disposition and compatible candidate owner:

- represented directly;
- preserved verbatim;
- normalized without semantic change;
- deferred because safe representation is not established.

A candidate may apply only when every material nonblank source unit is fully mapped and the complete schema-v3 candidate validates and round-trips. Partial, deferred, unowned, ambiguous, malformed, unsupported, stale, or incompatible source content stops that record.

Do not summarize, consolidate, retitle, reorder, drop, reinterpret, or move semantic content merely to obtain complete coverage. Unknown material stays deferred and blocks application.

### Apply And Confirm

Dry-run and partial results create no destination, snapshot, or manifest. Applied migration:

- rechecks the exact source SHA;
- preserves an exact source snapshot;
- writes a non-semantic transformation manifest;
- publishes a new schema-v3 destination without changing the source;
- returns bounded representation, path, hash, artifact, and coverage facts.

Confirm the destination with `validate`, `inspect`, and the view required by its intended use. Compare important entities and relationships against source inventory rather than only checking that Markdown parses.

Migration evidence on disposable copies does not authorize live migration. Every live source requires separate user selection, exact SHA, dry run, sensitive-content review, and recovery plan. Stop that record independently if any condition fails.

Rollback and forward-confirmation helpers are implementation-owned safeguards, not public commands to reconstruct. Use only the public interface or a separately selected implementation-maintenance route.

## Normalize Canonical Markdown

`compress` is maintenance-only representation normalization. It is not semantic history compaction, summarization, retention policy, or ordinary record maintenance.

The only verified scope is `canonical-markdown`.

### Prepare

1. Confirm the record is schema-v3.
2. Confirm explicit authority for this exact record and maintenance rewrite.
3. Read `schema --command compress`.
4. Supply only the declared scope, exact source SHA-256, and authority source through JSON transport.
5. Run with `--dry-run` first.

### Preserve Meaning

The implementation parses the source, renders canonical Markdown, parses the candidate again, validates it, and requires exact semantic equality. Canonical output omits empty optional fields, null optional references, empty optional collections, and empty optional view sections while retaining required structure and meaningful `Current Slice: None` state. Existing verbose `[empty]` and `[none]` markers remain readable. It may normalize representation bytes such as CRLF to canonical LF. It may not change any semantic field, identity, relationship, order, lifecycle state, timestamp, or historical meaning.

A canonical no-op and dry run create no lock, snapshot, manifest, timestamp change, or consumed ID.

Reject:

- semantic history compaction;
- generated or rewritten summaries;
- undeclared scopes;
- candidates that change parse/render meaning;
- stale SHAs;
- unresolved recovery evidence;
- unsafe paths or locks.

### Apply And Recover

Before canonical publication, the implementation preserves exact source bytes and a truthful non-semantic manifest. Publication then reuses the ordinary exact-SHA, lock-identity, source-recheck, atomic rename, sync, confirmation, and recovery-marker safeguards.

A normal applied result exposes only bounded status, representation, path, source and candidate hashes, and artifact paths. Confirm the resulting record through `validate`, `inspect`, and the needed view.

Exact rollback and forward-confirmation helpers exist inside the implementation for tested maintenance recovery. They are not public CLI commands. Do not guess imports, invoke internal modules from the skill, or hand-edit source snapshots. If public compression returns uncertainty, use `inspect` and `reconcile` as above or return a separately controlled implementation-maintenance need to Workflow.

## Protect Sensitive Evidence

Working Records and rewrite artifacts are not sanitized exports.

- Do not store credentials, unrestricted personal data, raw production dumps, private payloads, or complete tool output.
- Keep records, snapshots, manifests, markers, inventories, and reports local and ignored.
- Public errors should expose safe codes and bounded metadata rather than raw semantic content or stack traces.
- Do not send task memory or recovery evidence over the network.
- Do not stage, commit, publish, promote, or synchronize task memory through Track Work.
- Before sharing a migration or recovery report, create a separately authorized sanitized artifact rather than copying canonical evidence.

## Return To Track Work

Return with:

- exact observed status and command;
- confirmed path and SHA when available;
- strongest valid view or bounded inspection;
- remaining recovery, lock, migration, or compression state;
- what the evidence proves and does not prove;
- the owner that can safely continue.

Route narrowly:

- confirmed record state: resume the owner that needed task memory;
- rejected, partial, or unsupported rewrite: keep the source unchanged and return the limit to Workflow or Discuss;
- unresolved publication or lock state: keep the affected Slice blocked and stop;
- completed copy migration or canonical normalization: preserve concise Evidence and return to the owning Slice without implying task completion or promotion;
- required live migration, internal rollback, promotion, commit, release, or publication: return to Workflow for its separately controlled boundary.
