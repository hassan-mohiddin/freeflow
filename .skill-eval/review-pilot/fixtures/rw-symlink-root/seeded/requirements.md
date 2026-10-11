# Requirements

Track Work keeps each task record under `.freeflow/tasks` in a Git repository. It refuses any record path that Git would not ignore or that Git already tracks. A repository can be reached through a symlinked directory, as macOS does for its temporary directories. Git then reports the canonical top level, meaning the path with every symlink resolved, while the path the user supplies can still contain the symlink. Before this change, `canonicalPath()` resolved symlinks only when the path or its parent already existed. A record path under a `.freeflow/tasks` that does not exist yet kept its symlinked form, so the ignore check saw a path leading out of the repository and refused every command.

This change makes Track Work work in such a repository.

1. `canonicalPath()` returns the path with every symlink resolved, including for a path that does not exist yet. It resolves the nearest existing ancestor and appends the rest of the path in its original order.
2. The Git safety check compares the record path and Git's top level in the same canonical form, so a record path reached through a symlinked directory is recognized as inside the repository.
3. In a repository reached through a symlinked directory, `init` creates the task without refusing its path as unignored or tracked.
4. In the same repository, a lifecycle command with a relative `--record` path (`decision add`) succeeds, and `validate` on that record succeeds.
5. A regression test in `.skill-eval/track-work/tests/working-record.test.mjs` covers this case. It runs `init`, `decision add` with a relative `--record`, and `validate` through a symlinked directory.
6. A repository reached without a symlink behaves as before, and the existing tests in that file still pass.
