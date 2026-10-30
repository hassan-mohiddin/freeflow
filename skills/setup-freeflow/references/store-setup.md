# Store Setup

This reference sets up the Freeflow store that keeps task memory for [Track Work](../../track-work/SKILL.md): local only or local + cloud, a cloud session's settings, moving existing records into the store, and the check that ends it. The script is `node <track-work-directory>/scripts/working-record.mjs`.

## Rules

- Make the store, add its remote, and move records into it only when the user asks or says yes to your question.
- The store's remote is the user's own private repository. Never point the store at, or push it to, any other.
- Moving records into the store copies them: never delete or change the originals, and never take Pi's Task Memory's folder for the store.

## Ask Once

Ask one question, through the harness's question tool where it has one, with local only first as the default:

- **Local only:** the store on this device; nothing leaves the machine.
- **Local + cloud:** the same store, kept in step with the user's own private repository, so every device and every cloud session has it. A cloud session needs this, since its container is thrown away.
- **No store:** then there is no task. Say that the work goes on without memory beyond this compaction cycle.

The store lives at `FREEFLOW_HOME`, `~/.freeflow` when it is unset. If that folder holds Pi's Task Memory (`registry.json`), `store init` refuses it: propose another folder, such as `~/.freeflow-store`, and tell the user to set `FREEFLOW_HOME` to it for every session that uses the store.

## Local Only

`store init`. Commits are authored as the user, with no trailers: pass `--git-name` and `--git-email` when Git has no identity. Later, `store remote --url <url>` moves the whole store into an empty private repository and makes it local + cloud.

## Local + Cloud

What the user does, in words you can relay:

> Create an empty private repository on your own GitHub account, for example `freeflow-store`, and send me its URL. Nothing else goes in it: Freeflow lays it out and keeps it in sync.

What you do: `store init --remote <url>`. An empty repository is laid out as the store and its first commit pushed; a repository that is already a store is joined as it is; an empty clone of the repository already at `FREEFLOW_HOME` is used as it is. A repository that holds anything else is refused: ask the user for an empty one.

On each other device, the same `store init --remote <url>` joins it.

## Cloud Sessions

A cloud session's store is a repository attached to the session; Freeflow clones nothing itself, since a setup script cannot clone a private repository the session did not select. A session starts with one repository, the code it works on, so the store is attached during the session when the work needs task memory; a session that works on the store alone can start with it. What the user sets once in the cloud environment's settings, in words you can relay:

> In the environment's settings: set `FREEFLOW_HOME` to `/home/user/` and your store repository's name, where it is cloned when attached; and load Freeflow's plugin with a setup-script line that clones a Freeflow release, `git clone --depth 1 --branch <release tag> https://github.com/hassan-mohiddin/freeflow.git /opt/freeflow`, and `CLAUDE_CODE_PLUGIN_DIRS` set to `/opt/freeflow`. To move to another release, change the tag in that line. Pushing the store needs the Claude GitHub App on its repository.

When a session starts without the store, Freeflow says so at session start. Where the harness can attach a repository to a running session (on Claude Code on the web, `add_repo`), attach the store and clone it to `FREEFLOW_HOME` on the user's word, and Freeflow takes it up when that turn ends. Ask for read access first: the session's Git proxy may push for it, and asking for push access can be refused; ask for push access only when `store sync` reports it cannot push. Where the harness cannot attach one, the user starts a new session with the store as its repository.

## Move Existing Records In

Look for records kept before the store, and list them for the user before moving any:

- in a repository's Git-ignored `.freeflow/tasks/`: each `task-NNN-*/record.md`, Schema 4 or 5 as its header says;
- Pi's Task Memory: `registry.json` and its projects' records in `~/.freeflow`, or in the folder `FREEFLOW_HOME` named for Pi.

Each moves into a project of the store, made first with `project new` on the user's word, as that project's next task:

| The record | Command |
| --- | --- |
| Schema 4, in a repository or Pi's Task Memory | `migrate --record <record.md> --cue <cue> [--cues <file>] --project <name> --home <store>`: copies the folder, converts it to Schema 5 and pushes it. Ask the user for the task's cue, and for each closed Slice's cue or leave it marked missing. |
| Schema 5, in a repository | `migrate --record <record.md> --project <name> --home <store>`: copies it as it is and pushes it. |

The original stays where it was: a repository's copy until the user removes it, and Pi's until Freeflow's Pi layer moves to the store, since Pi still reads its own. Say which originals are left and that edits made there from now on do not reach the store.

## Check And Report

Run `session status` and read its `missing` list: each item says what keeps the session from a working store and whether the user or you fix it. Setup is done when the list is empty. Then report from `store status` where the store is, whether it is local only or local + cloud, and which records were moved in and which originals are left.
