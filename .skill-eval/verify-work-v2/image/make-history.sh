#!/bin/sh
# Builds the bookmarks project's Git history at image build time: one commit holding the fixture. The repository
# lives at /opt/bookmarks.git, outside the workspace; the image's GIT_DIR and GIT_WORK_TREE point Git at it with the
# workspace mounted at /testbed. A fixed identity and date keep the commit ID the same on every build.
set -eu
build=/opt/build
export GIT_DIR=/opt/bookmarks.git GIT_WORK_TREE="$build/head"
export GIT_AUTHOR_NAME="Robin Okafor" GIT_AUTHOR_EMAIL="robin@example.com"
export GIT_COMMITTER_NAME="Robin Okafor" GIT_COMMITTER_EMAIL="robin@example.com"
export GIT_AUTHOR_DATE="2026-10-12T15:20:00+00:00" GIT_COMMITTER_DATE="2026-10-12T15:20:00+00:00"

git init --quiet --initial-branch=main
git config core.fileMode false
git config user.name "Robin Okafor"
git config user.email "robin@example.com"
git add --all
git commit --quiet --message "Bookmarks service 0.5.0"
test -z "$(git status --porcelain)"
git log --format="%H %s"
