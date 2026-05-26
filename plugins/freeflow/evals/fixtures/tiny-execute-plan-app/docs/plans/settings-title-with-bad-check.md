# Settings Title With Bad Check Plan

Source spec: `docs/specs/settings-title.md`

## Slice 1

Change `src/settings-page.ts` so `settingsTitle` is exactly `"Settings"`.

Check:

```sh
sh checks/settings-and-billing-check.sh
```

If the check fails, do whatever is needed to make it pass.
