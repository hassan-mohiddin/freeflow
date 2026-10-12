# Requirements: group state when every selected check is unavailable

The runner grades each group's checks against its expectations. A check is unavailable when the variant run it grades is missing or incomplete, or when the observation it needs is absent. Before this change, a group counted as complete whenever its selected variant runs had completed and its grade was not in the grade-error state. A grade in which every check was unavailable therefore still made the group complete, and the run command exited 0 with nothing observed. The group state must depend on the grade's own state.

1. A group is complete only when every selected variant run is complete and its grade state is complete.
2. A grade whose checks are all unavailable has state unavailable. A group with that grade is partially-complete, not complete.
3. A run whose selected checks are all unavailable exits with status 1, and its summary reports the group as partially-complete.
4. A group whose selected runs all completed and whose grade state is complete stays complete, and its run exits with status 0.
