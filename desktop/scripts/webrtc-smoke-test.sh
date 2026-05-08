#!/usr/bin/env bash
# WebRTC stripped-down smoke test.
#
# Validates the transport layer end-to-end: helper resolves URLs against the
# daemon, daemon opens a peer-relay over WebRTC, bytes flow, git operations
# complete. Uses plain text-file repos — no DreamNodes, no submodules.
#
# Two scenarios:
#
#   --setup-alice
#     Run on the machine that will SERVE the repo. Creates a working repo
#     with one commit, prints the UUID + DID, and registers Bob's DID as a
#     known peer (so the inbound listener accepts Bob's offer).
#
#   --clone-as-bob ALICE_DID UUID
#     Run on the machine that will CLONE. Registers Alice as a peer in the
#     local daemon, then runs `git clone interbrain://<uuid>?peer=<alice-did>`.
#     Verifies the cloned repo has the expected file.
#
# Both modes assume the daemon is already running (built via `npm run dev:desktop`
# or installed from a release) and the helper binary `git-remote-interbrain`
# is reachable. By default we look for the helper at:
#   $REPO_ROOT/desktop/src-tauri/target/debug/git-remote-interbrain
# Override with $INTERBRAIN_HELPER.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HELPER="${INTERBRAIN_HELPER:-$REPO_ROOT/desktop/src-tauri/target/debug/git-remote-interbrain}"
TEST_DIR="${TEST_DIR:-/tmp/interbrain-smoke-test}"
TEST_REPO_NAME="${TEST_REPO_NAME:-smoke-square}"

# Read the daemon's IPC port from the OS-standard config dir.
config_dir() {
  case "$(uname -s)" in
    Darwin) echo "$HOME/Library/Application Support/org.projectliminality.interbrain" ;;
    Linux)  echo "${XDG_CONFIG_HOME:-$HOME/.config}/org.projectliminality.interbrain" ;;
    *) echo "$HOME/.config/org.projectliminality.interbrain" ;;
  esac
}

ipc_port() {
  cat "$(config_dir)/ipc-port" 2>/dev/null || { echo "ERROR: daemon not running (no ipc-port file)" >&2; exit 1; }
}

# Synchronous IPC call via websocat-or-equivalent. Uses Python for ws because
# bash doesn't have native websocket support. Falls back to plain HTTP if a
# matching daemon route is exposed (currently it isn't — IPC is ws-only).
ipc_call() {
  local op="$1"
  local payload_json="$2"
  local port
  port="$(ipc_port)"
  python3 - "$port" "$op" "$payload_json" <<'PY'
import asyncio, json, sys
import websockets

async def main():
    port, op, payload_json = sys.argv[1], sys.argv[2], sys.argv[3]
    payload = json.loads(payload_json) if payload_json else {}
    async with websockets.connect(f"ws://127.0.0.1:{port}") as ws:
        req = {"kind": "request", "id": "1", "op": op, "payload": payload}
        await ws.send(json.dumps(req))
        async for msg in ws:
            data = json.loads(msg)
            if data.get("kind") == "response":
                if data.get("ok"):
                    print(json.dumps(data.get("payload", {})))
                    return
                err = data.get("error", {})
                print(f"daemon error: {err.get('message', 'unknown')}", file=sys.stderr)
                sys.exit(1)
asyncio.run(main())
PY
}

ensure_helper() {
  if [ ! -x "$HELPER" ]; then
    echo "ERROR: helper binary not found or not executable: $HELPER" >&2
    echo "Build with: (cd $REPO_ROOT/desktop/src-tauri && cargo build --bin git-remote-interbrain)" >&2
    exit 1
  fi
}

# Place helper on PATH so git can find it for `git clone interbrain://...`.
helper_dir() {
  local d="$TEST_DIR/bin"
  mkdir -p "$d"
  ln -sf "$HELPER" "$d/git-remote-interbrain"
  echo "$d"
}

setup_alice() {
  ensure_helper
  echo "=== Smoke test: setting up Alice's repo ==="
  rm -rf "$TEST_DIR/$TEST_REPO_NAME"
  mkdir -p "$TEST_DIR/$TEST_REPO_NAME"
  cd "$TEST_DIR/$TEST_REPO_NAME"
  git init -q -b main
  git config user.email "alice@smoke.test"
  git config user.name  "Alice (smoke test)"
  echo "I am the square." > README.md
  git add README.md
  git commit -q -m "initial: square exists"

  # Generate a UUID for this repo and write it where the daemon will find it.
  local uuid
  if command -v uuidgen >/dev/null; then
    uuid="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  else
    uuid="$(python3 -c 'import uuid; print(uuid.uuid4())')"
  fi
  cat > .udd <<UDD
{"uuid":"$uuid","title":"Smoke Square","type":"dream"}
UDD
  git add .udd
  git commit -q -m "udd: $uuid"

  # Tell the daemon to refresh its UUID index so it sees this repo.
  # NOTE: this assumes the working repo is inside a vault the daemon has
  # registered. For the smoke test we add it as a vault explicitly.
  echo "Registering $TEST_DIR as a vault with the daemon..."
  ipc_call "add-vault" "{\"path\":\"$TEST_DIR\"}" 2>/dev/null || true
  ipc_call "refresh-uuid-index" "{}" >/dev/null

  # Print our DID + the repo UUID so the operator can paste them into the
  # other machine's --clone-as-bob invocation.
  local hello
  hello="$(ipc_call hello "{}")"
  local did
  did="$(echo "$hello" | python3 -c 'import sys, json; print(json.load(sys.stdin)["identity"]["did"] or "")')"
  if [ -z "$did" ]; then
    echo "ERROR: daemon has no unlocked identity. Run first-run setup." >&2
    exit 1
  fi

  echo
  echo "=== Alice's identity: $did"
  echo "=== Repo UUID:        $uuid"
  echo
  echo "On Bob's machine, run:"
  echo "  $0 --register-peer $did 'Alice'"
  echo "  $0 --clone-as-bob   $did $uuid"
  echo
  echo "Then run on Alice's machine to allow Bob to connect (replace BOB_DID):"
  echo "  $0 --register-peer BOB_DID 'Bob'"
}

register_peer() {
  local did="$1"
  local name="${2:-}"
  ensure_helper
  echo "Registering peer DID $did (name: $name)..."
  ipc_call "add-peer" "{\"did\":\"$did\",\"name\":\"$name\"}"
  echo "Done."
}

clone_as_bob() {
  local alice_did="$1"
  local uuid="$2"
  ensure_helper
  local hdir
  hdir="$(helper_dir)"
  local dest="$TEST_DIR/$TEST_REPO_NAME-clone"
  rm -rf "$dest"

  echo "=== Cloning interbrain://$uuid?peer=$alice_did via WebRTC ==="
  PATH="$hdir:$PATH" \
    GIT_TERMINAL_PROMPT=0 \
    GIT_TRACE=1 \
    git clone "interbrain://$uuid?peer=$alice_did" "$dest"

  if [ -f "$dest/README.md" ]; then
    echo "=== Clone succeeded. README.md contents:"
    cat "$dest/README.md"
  else
    echo "ERROR: clone completed but README.md missing" >&2
    exit 1
  fi
}

case "${1:-}" in
  --setup-alice)        setup_alice ;;
  --register-peer)      register_peer "$2" "${3:-}" ;;
  --clone-as-bob)       clone_as_bob "$2" "$3" ;;
  *)
    echo "Usage:"
    echo "  $0 --setup-alice                          # on Alice's machine"
    echo "  $0 --register-peer <did> [name]           # on either, to allow inbound from peer"
    echo "  $0 --clone-as-bob <alice-did> <uuid>      # on Bob's machine"
    exit 1
    ;;
esac
