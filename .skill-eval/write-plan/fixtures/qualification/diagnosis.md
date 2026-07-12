# Accepted Diagnosis

The settings service publishes a canonical JSON file before validating the candidate payload. A malformed replacement is rejected to the caller but has already replaced the last accepted state.

Settled behavior:

- validate before canonical publication;
- malformed fresh submissions leave canonical state absent;
- malformed replacements preserve the exact prior accepted bytes;
- rejected diagnostics remain noncanonical;
- add one focused store-level regression first, then update the store seam;
- run the focused regression and existing store suite.

Directional later concern:

A separately deployed monthly client may still depend on the legacy report path. Its migration, observation window, and removal authority are not settled and are not part of the immediate fix.
