#!/usr/bin/env bash
set -euo pipefail

git init --separate-git-dir=git-meta -q
git config user.email "freeflow-eval@example.com"
git config user.name "Freeflow Eval"
printf "git-meta/\n" >> git-meta/info/exclude
printf "git-meta/\n" > .ignore
rm .freeflow-eval-setup.sh
git add .
git commit -qm "Initial fixture"

perl -0pi -e 's/Setings/Settings/g' docs/release-notes.md
perl -0pi -e 's/export const gracePeriodDays = 7;/export const gracePeriodDays = 0;/' src/billing.ts
git add docs/release-notes.md src/billing.ts
