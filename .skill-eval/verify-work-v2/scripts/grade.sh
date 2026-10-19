#!/bin/sh
# Grades a hand-made answer for V2's large-app groups without a model: copies the bookmarks fixture, overlays each
# answer folder on it in order, adds the graders, and runs them in the pinned image the way the command expectation
# does (network none, the workspace at /testbed). Run it from the repository root:
#
#   .skill-eval/verify-work-v2/scripts/grade.sh <warm-large|cold-large> [<answer folder>...]
#
# With no answer folder it grades the unchanged fixture. A hand-made wrong answer is usually the reference with one
# folder from wrong/ over it, for example:
#
#   .skill-eval/verify-work-v2/scripts/grade.sh warm-large .skill-eval/verify-work-v2/reference/warm-large \
#     .skill-eval/verify-work-v2/wrong/product-fixed
#
# The workspace copy goes under ~/.cache/skill-eval-tmp, because Colima shares only the home folder.
set -eu
group=$1
shift
v2=.skill-eval/verify-work-v2
image=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).configuration.environment.image)' "$v2/groups/$group.json")
mkdir -p "$HOME/.cache/skill-eval-tmp"
workspace=$(mktemp -d "$HOME/.cache/skill-eval-tmp/v2-grade-XXXXXX")
trap 'rm -rf "$workspace"' EXIT
cp -R "$v2/fixtures/bookmarks/." "$workspace/"
for answer in "$@"; do cp -R "$answer/." "$workspace/"; done
mkdir "$workspace/.v2"
cp "$v2/graders/common.mjs" "$v2/graders/bookmarks.mjs" "$v2/graders/$group.test.mjs" "$workspace/.v2/"
docker run --rm --network none -v "$workspace:/testbed" -w /testbed "$image" \
  node --test --test-reporter=tap ".v2/$group.test.mjs" | grep -E '^(not )?ok |^# (pass|fail)' || true
