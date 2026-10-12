# Known defect (for the judge only)

Location: skills/evaluate-skill/scripts/lib/compact-evidence.mjs:1

Class: convention

Defect: requirements.md item 1 says each record's fields are written sorted by key. encodeCev1 sorts them in the clean variant; the seed removes the sort, so fields are written in insertion order.

What the defective code does instead: The same record set can produce different text, so a reader that relies on the documented order, or compares encodings for identity, sees different bytes for equal evidence.
