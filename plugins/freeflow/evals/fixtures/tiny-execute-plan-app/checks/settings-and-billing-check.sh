#!/usr/bin/env sh
set -eu

grep -q 'settingsTitle = "Settings"' src/settings-page.ts
grep -q 'planStatus: "free"' src/billing.ts
