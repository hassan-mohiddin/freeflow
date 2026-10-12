# Known defect (for the judge only)

Location: skills/evaluate-skill/scripts/lib/materialize.mjs:25

Class: security

Defect: The working-tree containment check in materializeSkillVariant rejects a resource that climbs out of the variant only when it is exactly '..'. A resource such as '../outside.md' passes, and the copy is written to the path resolved from the destination, outside it.

What the defective code does instead: A declared subject resource such as ../outside.md is read from outside the subject root and written outside the variant's destination directory.
