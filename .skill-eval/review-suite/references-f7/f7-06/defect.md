# Known defect (for the judge only)

Location: skills/evaluate-skill/scripts/lib/publication.mjs:1

Class: logic

Defect: publishDiagnostic refuses to publish when the destination already exists. The seed removes that check. Renaming onto an existing empty directory then succeeds, so an earlier diagnostic placeholder is replaced and reported as published.

What the defective code does instead: A diagnostic is reported as published over an existing destination directory. The earlier record at that path is replaced without a failure.
