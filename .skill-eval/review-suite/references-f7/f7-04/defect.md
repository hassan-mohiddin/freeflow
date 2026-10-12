# Known defect (for the judge only)

Location: skills/evaluate-skill/scripts/lib/integrity.mjs:23

Class: convention

Defect: requirements.md item 4 says a mismatch throws an error whose message includes "Bundle integrity mismatch before publication". The seed changes the message to "Bundle integrity mismatch before publish". No committed test checks the message text.

What the defective code does instead: Callers and reviewers who match the documented message no longer recognise the failure. The integrity check still rejects the bundle.
