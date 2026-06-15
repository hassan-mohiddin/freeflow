#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
plugin_root="$repo_root/plugins/freeflow"
contract="$plugin_root/skills/setup-freeflow/references/activation-contract.md"
setup_skill="$plugin_root/skills/setup-freeflow/SKILL.md"
host_setup="$plugin_root/skills/setup-freeflow/references/host-setup.md"
runtime_doc="$repo_root/docs/freeflow-runtime-and-lifecycle.md"
registry="$plugin_root/evals/registries/fixture-evals.json"

failures=0

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

extract_marked_block() {
  local name="$1"
  awk \
    -v start="<!-- freeflow-activation-contract:${name}:start -->" \
    -v end="<!-- freeflow-activation-contract:${name}:end -->" '
      $0 == start { inside = 1; in_fence = 0; next }
      $0 == end { exit }
      inside && $0 == "```md" { in_fence = 1; next }
      inside && $0 == "```" { in_fence = 0; next }
      inside && in_fence { print }
    ' "$contract"
}

contains_exact() {
  local file="$1"
  local needle="$2"
  NEEDLE="$needle" perl -e '
    my $file = shift;
    open my $fh, "<", $file or die "$file: $!";
    local $/;
    my $body = <$fh>;
    exit(index($body, $ENV{NEEDLE}) >= 0 ? 0 : 1);
  ' "$file"
}

count_exact() {
  local file="$1"
  local needle="$2"
  NEEDLE="$needle" perl -e '
    my $file = shift;
    open my $fh, "<", $file or die "$file: $!";
    local $/;
    my $body = <$fh>;
    $count = 0;
    $offset = 0;
    while (($pos = index($body, $ENV{NEEDLE}, $offset)) >= 0) {
      $count += 1;
      $offset = $pos + length($ENV{NEEDLE});
    }
    print "$count\n";
  ' "$file"
}

codex_core="$(extract_marked_block codex-core)"
claude_import="$(extract_marked_block claude-import)"

[ -n "$codex_core" ] || fail "Codex core block marker is empty."
[ -n "$claude_import" ] || fail "Claude import block marker is empty."

for file in "$setup_skill" "$host_setup" "$runtime_doc"; do
  contains_exact "$file" "activation-contract.md" || fail "$file does not reference activation-contract.md"
done

contains_exact "$setup_skill" "../workflow/SKILL.md" || fail "$setup_skill must load the workflow skill after successful setup verification."
contains_exact "$setup_skill" "../workflow/references/workflow-map.md" || fail "$setup_skill must load the workflow map after successful setup verification."
contains_exact "$setup_skill" "../interview-gate/SKILL.md" || fail "$setup_skill must load the interview-gate skill after successful setup verification."
contains_exact "$host_setup" "After successful setup verification" || fail "$host_setup must document same-session runtime loading."
contains_exact "$host_setup" "interview-gate skill" || fail "$host_setup must document same-session interview-gate loading."
contains_exact "$runtime_doc" "plugins/freeflow/skills/interview-gate/SKILL.md" || fail "$runtime_doc must document runtime interview-gate loading."

for file in "$setup_skill" "$host_setup" "$runtime_doc"; do
  if contains_exact "$file" "$codex_core"; then
    fail "$file embeds the Codex core block instead of referencing the contract"
  fi
done

while IFS= read -r fixture_file; do
  count="$(count_exact "$fixture_file" "$codex_core")"
  if [ "$count" != "1" ]; then
    fail "$fixture_file should contain the canonical Codex core block exactly once; got $count"
  fi
done < <(find "$plugin_root/evals/fixtures" -path '*/tiny-post-setup-*' -name AGENTS.md -type f | sort)

jq empty "$registry"

jq -e '
  [.evals[] | select(.id == "STP-009")] | length == 1
' "$registry" >/dev/null || fail "STP-009 must exist exactly once."

jq -e '
  .evals[]
  | select(.id == "STP-009")
  | any(.assertions[]; test("canonical activation contract"))
' "$registry" >/dev/null || fail "STP-009 must assert the canonical activation contract."

jq -e '
  [.evals[] | select(.id == "STP-010")] | length == 1
' "$registry" >/dev/null || fail "STP-010 must exist exactly once."

jq -e '
  .evals[]
  | select(.id == "STP-010")
  | any(.assertions[]; test("workflow and interview-gate context is loaded"))
' "$registry" >/dev/null || fail "STP-010 must assert same-session workflow and interview-gate loading."

if [ "$failures" -gt 0 ]; then
  exit 1
fi

printf 'Activation contract check passed: canonical blocks, docs references, post-setup fixtures, and STP-009/STP-010 assertions are aligned.\n'
