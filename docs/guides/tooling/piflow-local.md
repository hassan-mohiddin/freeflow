# PiFlow tooling moved

Freeflow no longer provides a PiFlow launcher, state synchronizer, import marker, or PiFlow
self-update path. Those responsibilities belong to the PiFlow host repository.

Use the PiFlow-owned checkout or release tooling instead:

```bash
cd /path/to/piflow
./bin/piflow --version
./bin/piflow import --from ~/.pi/agent
npm run piflow:dev -- --version
```

The PiFlow-owned launcher keeps released state under `~/.piflow/agent` and local-development
state under `~/.piflow-dev/agent`. Its explicit import operation writes a versioned
`piflow-import-receipt.json`, preserves target sessions and run history, and excludes credentials
unless explicitly requested.

Do not use the former Freeflow `piflow sync-from-pi`, `FREEFLOW_RUNTIME`, or
`.piflow-snapshot.json` paths. Historical references may remain in task evidence and research;
they are not maintained runtime instructions.

Freeflow still owns Cognitive Routing policy and the exact-commit development package snapshot.

For clean-install verification, use a fresh PiFlow checkout or release with temporary state and package-cache roots. Do not delete official Pi state, credentials, sessions, or Freeflow snapshot rollback evidence as a substitute; host-state cleanup is a separately authorized migration.
