#!/bin/sh
# Builds the discounts project's Git history at image build time: a first commit that works in whole cents and
# rounds half a cent up (history/v1 over the fixture), then the fixture itself. Its last commit added BULK20, moved
# rounding into a helper that floors fractional currency amounts, and added BULK20 rows to the shared orders.json, two
# of which expect that floored output instead of the README's nearest cent. The repository lives at
# /opt/discounts.git, outside the workspace; the image's GIT_DIR and GIT_WORK_TREE point Git at it with the workspace
# mounted at /testbed. Fixed identity and dates keep the commit IDs the same on every build.
set -eu
build=/opt/build
export GIT_DIR=/opt/discounts.git GIT_WORK_TREE="$build/worktree"
export GIT_AUTHOR_NAME="Sam Rivera" GIT_AUTHOR_EMAIL="sam@example.com"
export GIT_COMMITTER_NAME="Sam Rivera" GIT_COMMITTER_EMAIL="sam@example.com"

git init --quiet --initial-branch=main
git config core.fileMode false
git config user.name "Sam Rivera"
git config user.email "sam@example.com"

mkdir "$GIT_WORK_TREE"
cp -R "$build/head/." "$GIT_WORK_TREE/"
cp -R "$build/v1/." "$GIT_WORK_TREE/"
git add --all
GIT_AUTHOR_DATE="2026-09-02T10:00:00+00:00" GIT_COMMITTER_DATE="2026-09-02T10:00:00+00:00" \
  git commit --quiet --message "Add discount codes and receipt lines"

find "$GIT_WORK_TREE" -mindepth 1 -delete
cp -R "$build/head/." "$GIT_WORK_TREE/"
git add --all
GIT_AUTHOR_DATE="2026-10-15T16:30:00+00:00" GIT_COMMITTER_DATE="2026-10-15T16:30:00+00:00" \
  git commit --quiet --message "Add BULK20 and move cent rounding into one helper"

test -z "$(git status --porcelain)"
git log --format="%H %s"
