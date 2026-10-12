# Requirement: released changelog sections stay immutable

The changelog declaration check in `scripts/validation/check-changelog.mjs` rejects a pull request that edits a released section of `CHANGELOG.md`. A released section is every `## ` heading other than `## Unreleased`. The check compares each released section with the copy on the base branch. A difference in a missing final newline at the end of the file is not an edit. A difference in line endings is an edit. The base file must reach the comparison with its trailing bytes intact.

1. A pull request that changes the wording of any released changelog section must fail with the error "Released changelog sections are immutable and must not change in a pull request."
2. A pull request that changes only the line endings of a released section (LF to CRLF) must fail with the same error.
3. A released section that differs from the base copy only by a missing newline at the end of the file must not fail the check.
4. A pull request that adds a new release section above older released sections, while the older sections stay byte-identical, must pass the released-section check.
5. The base file read from git must not have its trailing bytes trimmed before the comparison.
6. The existing declaration rules still hold: a consumer-visible declaration must change `CHANGELOG.md` and update the `## Unreleased` section, and an internal declaration passes without a changelog change.
7. `node --test scripts/validation/check-changelog.test.mjs` passes.
