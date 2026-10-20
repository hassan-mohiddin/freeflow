#!/bin/sh
# Grades a hand-made answer for one case without a model: copies the case's fixture, overlays each answer folder on
# it in order, adds the hidden grader at .grader/, and runs it the way the command expectation does: in the pinned
# image with no network and the workspace at /testbed. Run it from the repository root:
#
#   .skill-eval/execute-work-small-fix/scripts/grade.sh <slug|settings|access> [<answer folder>...]
#
# With no answer folder it grades the unchanged fixture. The reference answer is reference/<case>; each folder in
# wrong/ is one wrong answer laid over the fixture. GRADE_ON_HOST=1 runs the grader with the host's own node instead
# of the image, for a machine without Docker. The workspace copy goes under ~/.cache/skill-eval-tmp, because Colima
# shares only the home folder.
set -eu
case_name=$1
shift
root=.skill-eval/execute-work-small-fix
group=$(node -e 'const m={slug:"small-fix",settings:"config-fix",access:"permission-fix"}; console.log(m[process.argv[1]] ?? "")' "$case_name")
[ -n "$group" ] || { echo "unknown case: $case_name" >&2; exit 2; }
mkdir -p "$HOME/.cache/skill-eval-tmp"
workspace=$(mktemp -d "$HOME/.cache/skill-eval-tmp/small-fix-grade-XXXXXX")
trap 'rm -rf "$workspace"' EXIT
cp -R "$root/fixtures/$case_name/." "$workspace/"
for answer in "$@"; do cp -R "$answer/." "$workspace/"; done
mkdir "$workspace/.grader"
cp "$root/graders/$case_name.test.mjs" "$workspace/.grader/"
if [ "${GRADE_ON_HOST:-}" = 1 ]; then
  (cd "$workspace" && node --test --test-reporter=tap ".grader/$case_name.test.mjs") | grep -E '^(not )?ok |^# (pass|fail)' || true
else
  image=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).configuration.environment.image)' "$root/configuration.json")
  docker run --rm --network none -v "$workspace:/testbed" -w /testbed "$image" \
    node --test --test-reporter=tap ".grader/$case_name.test.mjs" | grep -E '^(not )?ok |^# (pass|fail)' || true
fi
