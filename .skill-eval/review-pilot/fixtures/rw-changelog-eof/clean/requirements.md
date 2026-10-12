# Requirements

The changelog check treats every released section of CHANGELOG.md as immutable. A released section is each `## <version>` heading other than `## Unreleased`. The check compares released sections between the base branch and the current branch and fails the pull request if any of them changed. The comparison runs over the whole document, so the end of the file needs care: one newline at the very end of CHANGELOG.md is not released text and must not fail the check by itself. Every other difference in released text must still fail, including line-ending differences between sections.

1. A pull request that changes the text of a released section fails with "Released changelog sections are immutable and must not change in a pull request."
2. Adding or removing only the final newline at the end of CHANGELOG.md does not fail the check, whether the base file or the current file ends with that newline.
3. A line-ending change inside a released section, or at the boundary between two released sections (for example CRLF where the base has LF), fails the check.
4. Adding a new release section above older released sections passes when the older sections keep their text.
5. The `## Unreleased` section is not compared by this rule.
