# Requirements

Feasibility preflight decides, before any provider request or host capability is used, whether an evaluation case can run as declared. It reports exact blocking findings for problems it can find without a model run: evidence the subject cannot discover, required tools that are missing, literal requirements without a fixture source, undeclared equivalences, conflicting output assertions, budgets too small for the declared turns, packet limits, rubric text that leaks into the subject-visible prompt, and fixture-oracle pressure that a case declares.

1. Preflight compiles its findings before any provider request, model run or host capability access. A case with a blocking finding stops there.
2. Each finding has a stable identifier (for example `FEAS-FIXTURE-ORACLE`), a source span in the case, the evidence it was based on, and a blocking reason.
3. A case may declare `fixture_oracle` with `argv` (the executable `node` followed by a script path inside the fixture root), `expected_exit` (an integer) and optional `stdout_contains` literals. The workspace validator rejects unknown fields, any other executable, and a script path that does not stay inside the fixture root.
4. During preflight the declared oracle must reproduce the declared pressure: its exit code equals `expected_exit`, it does not time out, and its stdout contains every `stdout_contains` literal. Otherwise preflight reports `FEAS-FIXTURE-ORACLE` as blocking.
5. The oracle runs in a sandbox: no shell, a restricted environment with no inherited credentials, a bounded run time, and bounded output. It reports its exit code, signal, timeout state, stdout and stderr to the compiler.
6. Fixture contents are untrusted input, because a case can come from a third-party skill. Preflight may observe fixture contents only through what the case declares, and it must not give fixture content any effect on the host beyond those observations.
