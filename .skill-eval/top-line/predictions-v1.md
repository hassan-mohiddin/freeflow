# Predictions for top-line suite v1

Written 2026-11-04, before any run of the suite (SPEC-011 4.4), from the map's starting predictions (its Evals section): no success difference on one-Slice tasks and a slightly higher cost for Freeflow; on long tasks, higher success and a lower cost. Committed with the suite; the study plan (`plan/study-plan.md`) is locked after this file, and neither changes after a run except by an amendment that says what the run showed.

Arms: `plain` (Claude Code headless, Haiku 5.5 at xhigh, no plugin) against `freeflow` (the same, with Freeflow at ff2b4d9b and a fresh store). 20 tasks, 3 trials per arm.

| Measure | Fixes (6) | Features (10) | Long tasks (4) | Suite (20), the decision's verdict |
| --- | --- | --- | --- | --- |
| Success, pass^3 (McNemar, C1) | no difference | Freeflow ahead on at most 2 tasks | Freeflow ahead on 1 or 2 tasks | no difference shown: too few discordant tasks to reach p < 0.05 |
| Held-back tests passed, the score (C4) | no difference | Freeflow slightly higher | Freeflow higher | Freeflow higher by under 0.1, the interval crossing zero |
| List-price cost (C2) | Freeflow higher by 10% to 40% | about even | Freeflow lower | no difference shown, Freeflow higher on more tasks than not |
| Wall time (C3) | Freeflow longer | about even | Freeflow shorter | no difference shown |
| Interruptions (C5) | no difference | Freeflow slightly more (it proposes and asks before building) | about even | no difference shown |
| Freeflow's overhead, its share of input tokens | 20% to 40% | 10% to 25% | 5% to 15% | most of it the guidance, then its own tool results |

Absolute success will be low on both arms: many held-back tests assert Freeflow's exact wording, which neither arm can know from the request, so the score (the share of tests passed) is expected to say more than pass^3. A task both arms always pass, or always fail, over two versions of the suite is marked for retirement in the next one.

What would change the plan: a pilot whose plain arm passes every pilot task (saturation, recorded as an amendment), a Freeflow arm whose event log is missing (the plugin did not load: fix before the batch), or a pilot cost per run far from the estimate in the README.
