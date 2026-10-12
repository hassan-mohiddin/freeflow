# Requirements

Feasibility preflight decides, before any provider request or host capability is used, whether an evaluation case can run as declared. It reports exact blocking findings for problems it can find without a model run: evidence the subject cannot discover, required tools that are missing, literal requirements without a fixture source, undeclared equivalences, conflicting output assertions, budgets too small for the declared turns, packet limits, rubric text that leaks into the subject-visible prompt, fixture-oracle pressure that a case declares, and fixture evidence the subject cannot read.

1. Preflight compiles its findings before any provider request, model run or host capability access. A case with a blocking finding stops there.
2. Each finding has a stable identifier, a source span in the case, the evidence it was based on, and a blocking reason.
3. A case whose required evidence paths or fixture-sourced literal requirements name fixture files is blocked with `FEAS-EVIDENCE-READ` when the case is model-driven and the subject has no read tool.
4. A case may declare `fixture_oracle` as an object with a non-empty `checks` array and no other field. Each check names one `path` inside the fixture root and may have `contains` (literals the file must contain), `not_contains` (literals the file must not contain) and `sha256` (the lowercase SHA-256 digest the file must match). A check needs at least one of the three; unknown check fields are rejected.
5. The oracle is declarative: it reads each checked file as bytes, and it passes only when every check passes. Preflight reports `FEAS-FIXTURE-ORACLE` as blocking when the oracle does not pass.
6. A checked path that is missing, is a symbolic link, or is not a regular file fails its check without its content being read. A file larger than 1 MiB fails as too large. A path that escapes the fixture root is an error.
7. Fixture contents are untrusted input, because a case can come from a third-party skill. Preflight may observe fixture contents only through the declared checks, and it must not give fixture content any effect on the host beyond those observations.
