#!/usr/bin/env bash
# verify-live.sh: drive Freeflow the way a user does, in an isolated, disposable run.
# Each run gets its own tmux server, Pi agent and session dirs, FREEFLOW_HOME, HOME and fixture repository, so runs
# never share state with each other or with the user's ~/.pi and ~/.freeflow. Guide: dev-docs/guides/verify-live.md.
# Portable to macOS (bash 3.2) and Linux: no mapfile, no associative arrays, no /proc requirement.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
ROOT="$REPO/.tmp/verify-live"
RUNS_ROOT="$ROOT/runs"
EVID_ROOT="$ROOT/evidence"
PI_BIN="$REPO/node_modules/.bin/pi"
EXT="$REPO/pi-extension/freeflow/index.js"
COLS=160
ROWS=50

die() {
  echo "verify-live: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
verify-live.sh launch [--no-config | --config <json>] [--allow-model-call]
    Start a fresh isolated Pi session with this checkout's Freeflow extension; prints FFV_RUN.
    Without --allow-model-call Pi gets an empty environment and HOME (no provider credentials).
    FFV_PI_ARGS="--model <provider/id>" adds Pi flags, e.g. to pin a cheap model.
verify-live.sh doctor                          read-only health check of the run
verify-live.sh cmd "<slash command>" [--allow-model-call]
                                               type a slash command, submit it, wait for idle
verify-live.sh keys <tmux key>...              send raw keys (Down Up Enter Tab Escape Space, or letters)
verify-live.sh screen                          print the visible pane (no evidence written)
verify-live.sh snap <name>                     save the full pane text to evidence as NN-<name>.txt
verify-live.sh observe <name> -- <command...>  run a command in the fixture with the run's environment;
                                               save command, output and exit code as NN-<name>.txt
verify-live.sh tty <name> [--wait <text>] [--keys "<keys>"] -- <command...>
                                               run a command in a terminal (for prompts that need one):
                                               wait for <text>, send <keys>, wait for exit, save as NN-<name>.txt
verify-live.sh cleanup                         stop this run's tmux server, delete its scratch, keep evidence
verify-live.sh list                            list live runs and evidence folders
Select the run with FFV_RUN=<id>. When FFV_RUN is unset and exactly one run exists, that run is used.
Commands run by observe and tty see FFV_REPO (this repository) and FREEFLOW_HOME (the run's).
EOF
}

resolve_run() {
  if [[ -z "${FFV_RUN:-}" ]]; then
    local count=0 entry
    if [[ -d "$RUNS_ROOT" ]]; then
      for entry in "$RUNS_ROOT"/*; do
        [[ -d "$entry" ]] || continue
        count=$((count + 1))
        FFV_RUN="$(basename "$entry")"
      done
    fi
    [[ $count -eq 1 ]] || die "set FFV_RUN (found $count runs under $RUNS_ROOT)"
  fi
  set_run_paths
  [[ -d "$RUN_DIR" ]] || die "no run dir $RUN_DIR (launch first, or the run was cleaned up)"
}

set_run_paths() {
  RUN_DIR="$RUNS_ROOT/$FFV_RUN"
  EVID="$EVID_ROOT/$FFV_RUN"
  SOCK="ffv-$FFV_RUN"
  FIXTURE="$RUN_DIR/fixture"
}

T() { tmux -L "$SOCK" "$@"; }

log() {
  mkdir -p "$EVID"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$EVID/actions.log"
}

count_lines() { wc -l | tr -d ' '; }

run_value() { sed -n "s/^$1=//p" "$RUN_DIR/run.env"; }

pane() { T capture-pane -p -t "${1:-pi}" 2>/dev/null | sed 's/[[:space:]]*$//'; }

# The editor is the text between the first and second full-width rule lines at the bottom of the TUI.
# Rules are matched by stripping "─" rather than with a regex repeat, which breaks on multibyte chars in a C locale.
editor_text() { pane | awk '{ l = $0; gsub(/─/, "", l) } $0 != "" && l == "" { n++; next } n == 1' | tr -d '\n' | sed 's/^ *//'; }

footer() { pane | grep -E '^freeflow: ' | tail -1 || true; }

wait_until() { # wait_until <seconds> <command...>
  local secs="$1" i=0
  shift
  while [[ $i -lt $((secs * 4)) ]]; do
    if "$@"; then return 0; fi
    sleep 0.25
    i=$((i + 1))
  done
  return 1
}

is_idle() { [[ -z "$(editor_text)" ]] && [[ -n "$(footer)" ]]; }

# A full-screen list (the settings screen) replaces the editor; its key hint ends with "Esc close".
screen_open() { pane | grep -q 'Esc close'; }

idle_or_screen() { is_idle || screen_open; }

next_seq() {
  mkdir -p "$EVID"
  printf '%02d' "$(($(ls -1 "$EVID" | grep -cE '^[0-9]{2}-' || true) + 1))"
}

# The environment Pi, observe and tty commands get. Without model calls allowed it is built from nothing, so no
# provider key, cloud profile or login in the caller's environment or HOME can reach a model.
run_env() {
  local model_calls
  model_calls="$(run_value model_calls)"
  printf '%s\0' "FREEFLOW_HOME=$RUN_DIR/home" "FFV_REPO=$REPO" \
    "PI_CODING_AGENT_DIR=$RUN_DIR/agent" "PI_CODING_AGENT_SESSION_DIR=$RUN_DIR/sessions" \
    "PI_OFFLINE=1" "PI_SKIP_VERSION_CHECK=1" "PI_TELEMETRY=0"
  if [[ "$model_calls" == "blocked" ]]; then
    printf '%s\0' "PATH=$PATH" "HOME=$RUN_DIR/userhome" "TMPDIR=$RUN_DIR/tmp" "LANG=${LANG:-en_US.UTF-8}" \
      "TERM=$(T show -gv default-terminal 2>/dev/null || echo xterm-256color)"
    [[ -z "${LC_ALL:-}" ]] || printf '%s\0' "LC_ALL=$LC_ALL"
  fi
}

# Prints a command line that runs "$@" under run_env, quoted for the shell tmux starts panes with.
env_command() {
  local line="exec env" item
  [[ "$(run_value model_calls)" == "blocked" ]] && line="$line -i"
  while IFS= read -r -d '' item; do line="$line $(printf '%q' "$item")"; done < <(run_env)
  for item in "$@"; do line="$line $(printf '%q' "$item")"; done
  printf '%s' "$line"
}

cmd_launch() {
  local config='{}' noconf=0 model_calls=blocked
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-config) noconf=1 ;;
      --config)
        [[ $# -ge 2 ]] || die "--config needs a JSON value"
        config="$2"
        shift
        ;;
      --allow-model-call) model_calls=allowed ;;
      *) die "unknown launch option $1" ;;
    esac
    shift
  done
  [[ -x "$PI_BIN" ]] || die "Pi not found at $PI_BIN; run npm ci in $REPO"
  [[ -f "$REPO/pi-extension/dist/index.js" ]] || die "extension not built; run npm run build in $REPO"
  command -v tmux >/dev/null || die "tmux is required"
  FFV_RUN="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  set_run_paths
  mkdir -p "$RUN_DIR/agent" "$RUN_DIR/sessions" "$RUN_DIR/home" "$RUN_DIR/userhome" "$RUN_DIR/tmp" "$FIXTURE" "$EVID"
  (
    cd "$FIXTURE"
    git init -q
    printf '# verify-live fixture\n' >README.md
    printf '.freeflow/*/\n.freeflow/local.json\n' >.gitignore
    if [[ $noconf -eq 0 ]]; then mkdir -p .freeflow && printf '%s\n' "$config" >.freeflow/config.json; fi
    git add -A && git -c user.email=verify@localhost -c user.name=verify commit -qm "fixture"
  )
  # run.env exists before the pane starts, because env_command reads the model-call setting from it.
  {
    echo "run=$FFV_RUN"
    echo "socket=$SOCK"
    echo "model_calls=$model_calls"
    echo "repo_head=$(git -C "$REPO" rev-parse HEAD)"
    echo "repo_dirty_paths=$(git -C "$REPO" status --porcelain -- pi-extension skills runtime capabilities | count_lines)"
    echo "pi_version=$("$PI_BIN" --version 2>/dev/null || echo unknown)"
    echo "fixture=$FIXTURE"
    echo "freeflow_home=$RUN_DIR/home"
    echo "launched_with_config=$([[ $noconf -eq 1 ]] && echo none || echo "$config")"
    echo "extra_pi_args=${FFV_PI_ARGS:-}"
  } >"$RUN_DIR/run.env"
  local pi_args=(--no-context-files --no-extensions -e "$EXT" --approve)
  # FFV_PI_ARGS is split on spaces on purpose: it carries flags such as "--model provider/id".
  # shellcheck disable=SC2206
  [[ -z "${FFV_PI_ARGS:-}" ]] || pi_args+=(${FFV_PI_ARGS})
  T new-session -d -s pi -x "$COLS" -y "$ROWS" -c "$FIXTURE"
  T set-option -g remain-on-exit on >/dev/null
  T respawn-pane -k -t pi -c "$FIXTURE" "$(env_command "$PI_BIN" "${pi_args[@]}")"
  {
    echo "tmux_server_pid=$(T display -p '#{pid}')"
    echo "tmux_socket_path=$(T display -p '#{socket_path}')"
    echo "pi_pid=$(T display -p -t pi '#{pane_pid}')"
  } >>"$RUN_DIR/run.env"
  cp "$RUN_DIR/run.env" "$EVID/run.env"
  log "launch $(grep -v '^run=' "$RUN_DIR/run.env" | tr '\n' ' ')"
  if ! wait_until 40 is_idle; then
    pane >"$EVID/launch-timeout.txt"
    die "Pi did not reach an idle editor with a freeflow footer in 40s; pane saved to $EVID/launch-timeout.txt (run cleanup)"
  fi
  sleep 1 # let startup notices settle
  echo "FFV_RUN=$FFV_RUN"
  echo "ready: $(footer)"
  echo "model calls: $model_calls"
  echo "fixture: $FIXTURE"
  echo "evidence: $EVID"
}

# Whether the live Pi process got VAR=value. Linux: its /proc environ. Elsewhere (macOS hides the environment of a
# process that rewrote its title, as Pi does): the pane's start command, which Pi was exec'd from under the same pid.
has_env() {
  if [[ -r "/proc/$1/environ" ]]; then
    tr '\0' '\n' <"/proc/$1/environ" | grep -qxF "$2"
  else
    T display -p -t pi '#{pane_start_command}' | grep -qF -- " $(printf '%q' "$2")"
  fi
}

env_source() { if [[ -r "/proc/$1/environ" ]]; then echo "/proc/$1/environ"; else echo "pane start command"; fi; }

process_title() {
  if [[ -r "/proc/$1/cmdline" ]]; then
    tr '\0' ' ' <"/proc/$1/cmdline" | awk '{print $1}'
  else
    ps -o comm= -p "$1" 2>/dev/null | awk '{print $1}'
  fi
}

cmd_doctor() {
  local fail=0 line pid dead v
  ok() { echo "ok   $*"; }
  bad() {
    echo "FAIL $*"
    fail=1
  }
  if [[ -f "$RUN_DIR/run.env" ]]; then ok "run dir $RUN_DIR"; else bad "run.env missing in $RUN_DIR"; fi
  if ! T has-session -t pi 2>/dev/null; then
    bad "tmux session missing on socket $SOCK"
    echo "doctor: FAIL"
    return 1
  fi
  ok "tmux socket $SOCK has session pi"
  pid="$(T display -p -t pi '#{pane_pid}')"
  dead="$(T display -p -t pi '#{pane_dead}')"
  if [[ "$dead" == "0" ]]; then ok "pane process alive (pid $pid)"; else bad "Pi exited (pane_dead=$dead, status $(T display -p -t pi '#{pane_dead_status}'))"; fi
  if [[ "$dead" == "0" ]]; then
    if [[ "$(run_value pi_pid)" == "$pid" ]]; then ok "pid $pid is the one this run started"; else bad "pane pid $pid is not the recorded pi_pid"; fi
    # Pi sets its process title to "pi"; the extension itself is proven by the footer below, not by argv.
    if [[ "$(process_title "$pid")" == "pi" ]]; then ok "process title is pi"; else bad "pid $pid is not a Pi process (title: $(process_title "$pid"))"; fi
    for v in "PI_CODING_AGENT_DIR=$RUN_DIR/agent" "FREEFLOW_HOME=$RUN_DIR/home" "PI_CODING_AGENT_SESSION_DIR=$RUN_DIR/sessions"; do
      if has_env "$pid" "$v"; then ok "isolated ($(env_source "$pid")): $v"; else bad "env not isolated: expected $v"; fi
    done
    if [[ "$(run_value model_calls)" == "blocked" ]]; then
      if has_env "$pid" "HOME=$RUN_DIR/userhome" && T display -p -t pi '#{pane_start_command}' | grep -qF 'exec env -i '; then ok "model calls blocked: empty environment, HOME=$RUN_DIR/userhome"; else bad "model calls should be blocked but HOME is not the run's"; fi
    else
      ok "model calls allowed (launched with --allow-model-call)"
    fi
  fi
  if [[ "$(T display -p -t pi '#{pane_current_path}')" == "$FIXTURE" ]]; then ok "cwd is the fixture"; else bad "cwd is not $FIXTURE"; fi
  line="$(footer)"
  if [[ -n "$line" ]]; then ok "footer: $line"; else bad "no freeflow footer line (extension not loaded?)"; fi
  if [[ -z "$(editor_text)" ]]; then ok "editor idle"; else bad "editor holds text: $(editor_text)"; fi
  line="$(git -C "$REPO" rev-parse HEAD)"
  if [[ "$(run_value repo_head)" == "$line" ]]; then ok "repo HEAD unchanged since launch ($line)"; else bad "repo HEAD moved since launch; relaunch"; fi
  # Checkout mtimes are arbitrary, so judge dist freshness from Git: uncommitted src edits with an untouched dist mean a stale build.
  local src_dirty dist_dirty
  src_dirty="$(git -C "$REPO" status --porcelain -- pi-extension/src | count_lines)"
  dist_dirty="$(git -C "$REPO" status --porcelain -- pi-extension/dist | count_lines)"
  if [[ "$src_dirty" -gt 0 && "$dist_dirty" -eq 0 ]]; then
    bad "pi-extension/src has $src_dirty uncommitted change(s) but dist is unchanged: run npm run build, then relaunch"
  else
    ok "dist matches src state (src changes: $src_dirty, dist changes: $dist_dirty)"
  fi
  if [[ $fail -eq 0 ]]; then
    echo "doctor: PASS"
  else
    echo "doctor: FAIL"
    return 1
  fi
}

# Commands known to run locally with no model call. Anything else (free text, workflow commands, /freeflow compact,
# routing controls, Pi's own commands) may start a turn, so it needs --allow-model-call. Fail closed: add a command
# here only after confirming in source that it never starts a turn.
local_command() {
  case "$1" in
    "/freeflow status" | "/freeflow settings" | "/freeflow settings "* | "/freeflow project "* | "/freeflow task "* | "/reload") return 0 ;;
    *) return 1 ;;
  esac
}

cmd_cmd() {
  local text="${1:-}" allow=0
  [[ "${2:-}" == "--allow-model-call" ]] && allow=1
  [[ "$text" == /* ]] || die "refusing non-command input: free text is a model call"
  if ! local_command "$text" && [[ $allow -eq 0 ]]; then
    die "'$text' is not a known local command and may call a model; add --allow-model-call only with a pinned cheap model and the user's yes"
  fi
  if [[ $allow -eq 1 && "$(run_value model_calls)" == "blocked" ]]; then
    die "this run was launched without --allow-model-call, so Pi has no credentials; relaunch with it to make a model call"
  fi
  is_idle || die "Pi is not idle (editor: '$(editor_text)'); run doctor"
  log "cmd $text"
  T send-keys -t pi -l "$text"
  sleep 0.4
  T send-keys -t pi Enter
  sleep 0.8
  # If an autocomplete menu was open, the first Enter only accepted the completion and the command is still in the
  # editor. Never press Enter again once a settings screen is open: it would change that screen's selected row.
  if ! screen_open && [[ "$(editor_text)" == /* ]]; then
    T send-keys -t pi Enter
    sleep 0.8
  fi
  wait_until 20 idle_or_screen || echo "warning: neither idle nor a settings screen after 20s; run screen" >&2
  sleep 0.5
  pane | grep -v '^$' | tail -25
}

cmd_keys() {
  [[ $# -gt 0 ]] || die "keys needs at least one tmux key name"
  log "keys $*"
  local k
  for k in "$@"; do
    T send-keys -t pi "$k"
    sleep 0.3
  done
  sleep 0.7
  pane | grep -v '^$' | tail -25
}

cmd_snap() {
  local name="${1:?snap needs a name}" f
  f="$EVID/$(next_seq)-$name.txt"
  T capture-pane -p -J -S - -t pi | sed 's/[[:space:]]*$//' >"$f"
  log "snap $(basename "$f")"
  echo "$f"
}

cmd_observe() {
  local name="${1:?observe needs a name}" f rc=0 item
  shift
  [[ "${1:-}" == "--" ]] && shift
  [[ $# -gt 0 ]] || die "observe needs a command after --"
  f="$EVID/$(next_seq)-$name.txt"
  {
    echo "\$ (cd $FIXTURE && $(quoted "$@"))"
    echo "--- stdout+stderr"
  } >"$f"
  local envs=()
  while IFS= read -r -d '' item; do envs+=("$item"); done < <(run_env)
  if [[ "$(run_value model_calls)" == "blocked" ]]; then
    (cd "$FIXTURE" && env -i "${envs[@]}" "$@") >>"$f" 2>&1 || rc=$?
  else
    (cd "$FIXTURE" && env "${envs[@]}" "$@") >>"$f" 2>&1 || rc=$?
  fi
  echo "--- exit $rc" >>"$f"
  log "observe $(basename "$f") exit=$rc"
  cat "$f"
  echo "saved: $f"
}

cmd_tty() {
  local name="${1:?tty needs a name}" wait_text="" keys="" f rc k
  shift
  while [[ $# -gt 0 && "$1" != "--" ]]; do
    case "$1" in
      --wait)
        wait_text="$2"
        shift
        ;;
      --keys)
        keys="$2"
        shift
        ;;
      *) die "unknown tty option $1" ;;
    esac
    shift
  done
  [[ "${1:-}" == "--" ]] && shift
  [[ $# -gt 0 ]] || die "tty needs a command after --"
  f="$EVID/$(next_seq)-$name.txt"
  T kill-window -t pi:tty 2>/dev/null || true
  # "pi:" names the session: its window is also named pi, and a bare "pi" would target that window's index.
  T new-window -d -t pi: -n tty -c "$FIXTURE" "$(env_command "$@")"
  log "tty $name: $*"
  if [[ -n "$wait_text" ]]; then
    wait_until 30 tty_shows "$wait_text" || echo "warning: '$wait_text' did not appear in 30s" >&2
  fi
  if [[ -n "$keys" ]]; then
    log "tty keys $keys"
    # $keys is a space-separated list of tmux key names.
    # shellcheck disable=SC2086
    for k in $keys; do
      T send-keys -t pi:tty "$k"
      sleep 0.3
    done
  fi
  wait_until 60 tty_exited || echo "warning: the command had not exited after 60s; its pane is saved as it was" >&2
  rc="$(T display -p -t pi:tty '#{pane_dead_status}')"
  {
    echo "\$ (cd $FIXTURE && $(quoted "$@"))   # in a terminal"
    [[ -z "$wait_text" ]] || echo "# waited for: $wait_text"
    [[ -z "$keys" ]] || echo "# sent keys: $keys"
    echo "--- terminal"
    T capture-pane -p -J -S - -t pi:tty | sed 's/[[:space:]]*$//' | grep -v '^Pane is dead (' | drop_trailing_blank
    echo "--- exit ${rc:-still running}"
  } >"$f"
  T kill-window -t pi:tty 2>/dev/null || true
  log "tty $(basename "$f") exit=${rc:-running}"
  cat "$f"
  echo "saved: $f"
}

drop_trailing_blank() { awk '{ lines[NR] = $0 } NF { last = NR } END { for (i = 1; i <= last; i++) print lines[i] }'; }

tty_shows() { pane pi:tty | grep -qF "$1"; }

tty_exited() { [[ "$(T display -p -t pi:tty '#{pane_dead}' 2>/dev/null)" == "1" ]]; }

cmd_cleanup() {
  local pid sock_path
  pid="$(run_value pi_pid 2>/dev/null || true)"
  sock_path="$(run_value tmux_socket_path 2>/dev/null || true)"
  if T has-session 2>/dev/null; then
    T capture-pane -p -J -S - -t pi 2>/dev/null | sed 's/[[:space:]]*$//' >"$EVID/final-pane.txt" || true
    T kill-server
  fi
  # kill-server sends SIGHUP; Pi takes a moment to exit. Escalate only against the pid this run recorded.
  if [[ -n "$pid" ]]; then
    if ! wait_until 10 pid_gone "$pid"; then
      kill -TERM "$pid" 2>/dev/null || true
      wait_until 5 pid_gone "$pid" || die "pi pid $pid (started by this run) is still alive; inspect it before retrying"
    fi
  fi
  # kill-server leaves the socket file behind; remove only this run's socket.
  [[ -z "$sock_path" || ! -S "$sock_path" ]] || rm -f "$sock_path"
  rm -rf "$RUN_DIR"
  rmdir "$RUNS_ROOT" 2>/dev/null || true
  log "cleanup: tmux server $SOCK gone, scratch $RUN_DIR removed"
  echo "cleaned up run $FFV_RUN; evidence kept at $EVID:"
  ls -1 "$EVID"
}

quoted() {
  local out="" item
  for item in "$@"; do out="$out $(printf '%q' "$item")"; done
  printf '%s' "${out# }"
}

pid_gone() { ! kill -0 "$1" 2>/dev/null; }

cmd_list() {
  echo "runs (live scratch):"
  ls -1 "$RUNS_ROOT" 2>/dev/null || true
  echo "evidence:"
  ls -1 "$EVID_ROOT" 2>/dev/null || true
}

sub="${1:-help}"
shift || true
case "$sub" in
  launch) cmd_launch "$@" ;;
  doctor)
    resolve_run
    cmd_doctor
    ;;
  cmd)
    resolve_run
    cmd_cmd "$@"
    ;;
  keys)
    resolve_run
    cmd_keys "$@"
    ;;
  screen)
    resolve_run
    pane
    ;;
  snap)
    resolve_run
    cmd_snap "$@"
    ;;
  observe)
    resolve_run
    cmd_observe "$@"
    ;;
  tty)
    resolve_run
    cmd_tty "$@"
    ;;
  cleanup)
    resolve_run
    cmd_cleanup
    ;;
  list) cmd_list ;;
  help | -h | --help) usage ;;
  *)
    usage
    exit 2
    ;;
esac
