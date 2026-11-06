#!/usr/bin/env bash
# Smoke tests for pi-claude-bridge provider.
# Requires: pi CLI, Claude Code (for Agent SDK subprocess).

source "$(dirname "$0")/lib/bash-setup.sh"

echo "=== smoke-test.sh ==="

setup_test_env "smoke-test"

TIMEOUT=60
PASS=0
FAIL=0

TEST_CWD_PREFIX="$LOGDIR/smoke-cwd."
TEST_CWD=$(mktemp -d "$TEST_CWD_PREFIX"XXXXXX)
mkdir -p "$TEST_CWD/.pi"
printf '{}\n' > "$TEST_CWD/.pi/claude-bridge.json"
cd "$TEST_CWD"
cleanup() {
  if [[ "${TEST_CWD:-}" == "$TEST_CWD_PREFIX"* && ${#TEST_CWD} -gt ${#TEST_CWD_PREFIX} && -d "$TEST_CWD" ]]; then
    rm -rf -- "$TEST_CWD"
  fi
  kill_descendants
}
trap cleanup EXIT

run() {
  local name="$1"; shift
  local slug=$(echo "$name" | tr ' :,' '-' | tr -cd '[:alnum:]-')
  local logfile="$LOGDIR/$slug.log"
  printf "%-50s " "$name"
  if output=$(timeout "$TIMEOUT" "$@" 2>&1); then
    echo "$output" > "$logfile"
    if [ -n "$output" ]; then
      echo "PASS"
      ((++PASS))
    else
      echo "FAIL (empty output)"
      echo "  Log: $logfile"
      ((++FAIL))
    fi
  else
    local rc=$?
    echo "${output:-}" > "$logfile" 2>/dev/null || true
    echo "FAIL (exit $rc)"
    echo "  Log: $logfile"
    ((++FAIL))
  fi
  kill_descendants
}

# --- Tests ---

run "provider: print mode responds" \
  pi --no-session -ne -e "$DIR" \
  --model "claude-bridge/claude-sonnet-4-6" \
  -p "Reply with just the word 'yes'"

# findInitialModel takes its CLI branch on `cliProvider && cliModel`, so --provider
# on its own is a no-op: pi falls through to the global settings default and the
# test passes or fails on whichever model that happens to be. Assert the model that
# actually answered, not merely that something did.
run "provider: --provider + --model resolve to the bridge" \
  bash -c "pi --no-session -ne -e '$DIR' --provider claude-bridge --model claude-haiku-4-5 --mode json \
    -p \"Reply with just the word 'yes'\" 2>/dev/null \
    | jq -r 'select(.message.role==\"assistant\") | .message.provider + \"/\" + .message.model' \
    | sort -u | grep -x 'claude-bridge/claude-haiku-4-5'"

run "provider: model list includes provider" \
  bash -c "pi --no-session -ne -e '$DIR' --list-models 2>&1 | grep claude-bridge"

# The bridge sends Claude Code's own preset system prompt, so the user's prompt
# customisation has to be forwarded explicitly or it silently does nothing.
run "system prompt: --append-system-prompt reaches Claude" \
  bash -c "pi --no-session -ne -e '$DIR' --model 'claude-bridge/claude-haiku-4-5' \
    --append-system-prompt 'You must end every response with the exact word BANANA.' \
    -p 'What is 2+2? Answer in one short sentence.' 2>&1 | grep -q BANANA && echo ok"

run "system prompt: --system-prompt reaches Claude" \
  bash -c "pi --no-session -ne -e '$DIR' --model 'claude-bridge/claude-haiku-4-5' \
    --system-prompt 'You are a pirate. You must end every response with the exact word ARRR.' \
    -p 'What is 2+2? Answer in one short sentence.' 2>&1 | grep -q ARRR && echo ok"

# --- Summary ---

echo ""
echo "Passed: $PASS  Failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
