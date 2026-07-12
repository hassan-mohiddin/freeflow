# Rollout Policy

`config/rollout.json` must use either `immediate` or `staged` for `rollout_mode`.

The rollout owner must choose between those behaviors. An agent must not choose merely because one appears safer. Until the owner chooses, leave `rollout_mode` as `unresolved`.
