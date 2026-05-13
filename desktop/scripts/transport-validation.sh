#!/usr/bin/env bash
# transport-validation.sh — exercise the rc.21 GitHub transport end-to-end
# without touching any UI. Plays out the Square + Circle → Cylinder
# scenario between two local "peers" backed by two distinct GitHub
# accounts (alice = ProjectLiminality, bob = LiminalConsulting).
#
# Every GitHub repo this script creates is namespaced under the IBTEST_PREFIX
# (default "ibtest-") so it cannot collide with real DreamNode repos.
# The script `gh repo delete`s only namespaced repos.
#
# Pre-reqs:
#   - InterBrain daemon running with the rc.21 build (binaries in
#     /Applications/InterBrain.app/Contents/MacOS/).
#   - `gh auth status` shows both accounts logged in.
#   - `jq` installed.
#
# Re-running is safe: the script wipes prior test vaults + namespaced
# GitHub repos on each run.

set -euo pipefail

ALICE_GH="ProjectLiminality"
BOB_GH="LiminalConsulting"
ALICE_VAULT="$HOME/AliceVault"
BOB_VAULT="$HOME/BobVault"
HELPER_DIR="/Applications/InterBrain.app/Contents/MacOS"
IBTEST_PREFIX="${IBTEST_PREFIX:-ibtest-$(date +%Y%m%d-%H%M%S)-}"

# Repo names on GitHub (namespaced); local vault dir names stay clean.
SQUARE_REPO="${IBTEST_PREFIX}square"
CIRCLE_REPO="${IBTEST_PREFIX}circle"
CYLINDER_REPO="${IBTEST_PREFIX}cylinder"

# Make the helper discoverable for any `git fetch` / submodule init this
# script runs (same trick the plugin does via helper-path-sync.ts).
export PATH="$HELPER_DIR:$PATH"

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

require() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }
require gh
require git
require jq

gh_switch() {
  local user="$1"
  gh auth switch --user "$user" >/dev/null 2>&1 || die "gh auth switch $user failed"
}

# Generate a UUID without needing uuidgen-vs-python branching.
gen_uuid() {
  python3 -c 'import uuid; print(uuid.uuid4())'
}

# Write a minimal .udd JSON for a DreamNode.
write_udd() {
  local repo="$1" uuid="$2" title="$3"
  cat > "$repo/.udd" <<EOF
{
  "uuid": "$uuid",
  "title": "$title",
  "type": "dream",
  "dreamTalk": "",
  "submodules": [],
  "supermodules": [],
  "liminalWebRelationships": []
}
EOF
}

# Initialize a brand-new DreamNode repo with .udd + README + first commit.
init_dreamnode() {
  local repo="$1" title="$2"
  local uuid; uuid=$(gen_uuid)
  rm -rf "$repo"
  mkdir -p "$repo"
  git -C "$repo" init -q -b main
  git -C "$repo" config user.email "test@interbrain.local"
  git -C "$repo" config user.name  "Transport Test"
  write_udd "$repo" "$uuid" "$title"
  echo "$title" > "$repo/README.md"
  git -C "$repo" add .
  git -C "$repo" commit -q -m "initial: $title"
  echo "$uuid"
}

# `gh repo create $user/$name --public --source=. --remote=origin --push`
# (Mirrors SovereigntyService.createOutbox)
create_outbox() {
  local repo="$1" user="$2" name="$3"
  gh_switch "$user"
  gh repo create "$user/$name" --public --source="$repo" --remote=origin --push >/dev/null
  ok "$user/$name outbox created + initial push"
}

udd_uuid() { jq -r .uuid "$1/.udd"; }

# Talk to the daemon's IPC over WebSocket. Pure stdlib websockets (no
# extra deps beyond Python 3.11+).
ipc_call() {
  local op="$1"
  local payload="${2-}"
  [[ -z "$payload" ]] && payload='{}'
  local port_file="$HOME/Library/Application Support/org.projectliminality.interbrain/ipc-port"
  [[ -f "$port_file" ]] || die "daemon not running (no ipc-port file)"
  local port; port=$(cat "$port_file")
  python3 - "$port" "$op" "$payload" <<'PY'
import asyncio, json, sys, websockets

port, op, payload_json = sys.argv[1], sys.argv[2], sys.argv[3]
payload = json.loads(payload_json) if payload_json else {}

async def go():
    async with websockets.connect(f"ws://127.0.0.1:{port}") as ws:
        await ws.send(json.dumps({"kind": "request", "id": "x", "op": op, "payload": payload}))
        # The daemon may push events alongside responses; skip past them.
        while True:
            frame = await ws.recv()
            try:
                msg = json.loads(frame)
            except json.JSONDecodeError:
                continue
            if msg.get("kind") == "response" and msg.get("id") == "x":
                if not msg.get("ok"):
                    sys.stderr.write(json.dumps(msg) + "\n")
                    sys.exit(2)
                print(json.dumps(msg.get("payload", {})))
                return

asyncio.run(go())
PY
}

# --- Begin scenario ---------------------------------------------------

say "Reset: wipe prior test vaults"
rm -rf "$ALICE_VAULT" "$BOB_VAULT"
mkdir -p "$ALICE_VAULT" "$BOB_VAULT"
ok "fresh vaults at $ALICE_VAULT, $BOB_VAULT"
ok "using repo namespace: ${IBTEST_PREFIX}*"
ok "(repos won't be auto-deleted — gh token lacks delete_repo scope)"

say "Register test vaults with daemon (so UUID index can resolve interbrain://)"
ipc_call add-vault "$(jq -nc --arg p "$ALICE_VAULT" '{path:$p}')" >/dev/null
ipc_call add-vault "$(jq -nc --arg p "$BOB_VAULT"   '{path:$p}')" >/dev/null
ok "registered: $ALICE_VAULT, $BOB_VAULT"

say "Step 1: Alice creates Square DreamNode locally"
SQUARE_UUID=$(init_dreamnode "$ALICE_VAULT/Square" "Square")
ipc_call refresh-uuid-index >/dev/null
ok "Square uuid=$SQUARE_UUID"

say "Step 2: Alice Share Changes (create outbox + push)"
create_outbox "$ALICE_VAULT/Square" "$ALICE_GH" "$SQUARE_REPO"

say "Step 3: Alice generates invite link (for the record)"
SQUARE_INVITE="obsidian://interbrain-clone?ids=github.com/$ALICE_GH/$SQUARE_REPO&senderName=$ALICE_GH"
ok "invite: $SQUARE_INVITE"

say "Step 4: Bob accepts invite — clone + rename-origin-to-peer + own outbox"
gh_switch "$BOB_GH"
git clone -q "https://github.com/$ALICE_GH/$SQUARE_REPO" "$BOB_VAULT/Square"
git -C "$BOB_VAULT/Square" config user.email "test@interbrain.local"
git -C "$BOB_VAULT/Square" config user.name  "Transport Test (Bob)"
git -C "$BOB_VAULT/Square" remote rename origin "$ALICE_GH"
gh repo create "$BOB_GH/$SQUARE_REPO" --public --source="$BOB_VAULT/Square" --remote=origin --push >/dev/null
git -C "$BOB_VAULT/Square" remote get-url origin | grep -q "$BOB_GH/$SQUARE_REPO" \
  || die "Bob's Square origin should point at $BOB_GH/$SQUARE_REPO"
git -C "$BOB_VAULT/Square" remote get-url "$ALICE_GH" | grep -q "$ALICE_GH/$SQUARE_REPO" \
  || die "Bob's Square should have a '$ALICE_GH' peer remote"
ok "Bob's Square: origin=$BOB_GH/$SQUARE_REPO, peer=$ALICE_GH/$SQUARE_REPO"

BOB_SQUARE_UUID=$(udd_uuid "$BOB_VAULT/Square")
[[ "$BOB_SQUARE_UUID" == "$SQUARE_UUID" ]] || die "UUID mismatch: Alice=$SQUARE_UUID Bob=$BOB_SQUARE_UUID"
ok "Square UUID preserved across clone"

say "Step 5: Repeat for Circle"
CIRCLE_UUID=$(init_dreamnode "$ALICE_VAULT/Circle" "Circle")
ipc_call refresh-uuid-index >/dev/null
create_outbox "$ALICE_VAULT/Circle" "$ALICE_GH" "$CIRCLE_REPO"
gh_switch "$BOB_GH"
git clone -q "https://github.com/$ALICE_GH/$CIRCLE_REPO" "$BOB_VAULT/Circle"
git -C "$BOB_VAULT/Circle" config user.email "test@interbrain.local"
git -C "$BOB_VAULT/Circle" config user.name  "Transport Test (Bob)"
git -C "$BOB_VAULT/Circle" remote rename origin "$ALICE_GH"
gh repo create "$BOB_GH/$CIRCLE_REPO" --public --source="$BOB_VAULT/Circle" --remote=origin --push >/dev/null
ipc_call refresh-uuid-index >/dev/null
ok "Circle propagated to Bob (uuid-index refreshed: Bob has both Square + Circle)"

say "Step 6: Alice creates Cylinder with Square + Circle as interbrain:// submodules"
CYLINDER_UUID=$(init_dreamnode "$ALICE_VAULT/Cylinder" "Cylinder")
cd "$ALICE_VAULT/Cylinder"
git submodule add -q "$ALICE_VAULT/Square" Square
git submodule add -q "$ALICE_VAULT/Circle" Circle
git config -f .gitmodules submodule.Square.url "interbrain://$SQUARE_UUID"
git config -f .gitmodules submodule.Circle.url "interbrain://$CIRCLE_UUID"
git add .gitmodules Square Circle
git commit -q -m "weave: Square + Circle"
cd - >/dev/null
ok "Cylinder .gitmodules uses interbrain://<uuid> URLs"

say "Step 7: Alice Share Changes on Cylinder"
create_outbox "$ALICE_VAULT/Cylinder" "$ALICE_GH" "$CYLINDER_REPO"

say "Step 8: Alice generates Cylinder invite (record)"
CYL_INVITE="obsidian://interbrain-clone?ids=github.com/$ALICE_GH/$CYLINDER_REPO&senderName=$ALICE_GH"
ok "invite: $CYL_INVITE"

say "Step 9: Bob accepts — clone Cylinder + recursive submodule init via helper"
gh_switch "$BOB_GH"
git clone -q "https://github.com/$ALICE_GH/$CYLINDER_REPO" "$BOB_VAULT/Cylinder"
git -C "$BOB_VAULT/Cylinder" config user.email "test@interbrain.local"
git -C "$BOB_VAULT/Cylinder" config user.name  "Transport Test (Bob)"
# Load-bearing test: helper must resolve interbrain://<uuid> via the daemon's
# UUID index to Bob's local Square/Circle copies.
git -C "$BOB_VAULT/Cylinder" submodule update --init --recursive 2>&1 | sed 's/^/    /'
[[ -f "$BOB_VAULT/Cylinder/Square/README.md" ]] || die "Bob's Cylinder/Square not initialized"
[[ -f "$BOB_VAULT/Cylinder/Circle/README.md" ]] || die "Bob's Cylinder/Circle not initialized"
ok "submodules resolved + populated"

git -C "$BOB_VAULT/Cylinder" remote rename origin "$ALICE_GH"
gh repo create "$BOB_GH/$CYLINDER_REPO" --public --source="$BOB_VAULT/Cylinder" --remote=origin --push >/dev/null
ok "Bob's Cylinder: origin=$BOB_GH/$CYLINDER_REPO, peer=$ALICE_GH/$CYLINDER_REPO"

say "Step 10: Bob edits Cylinder + Share Changes"
echo "bob's contribution" >> "$BOB_VAULT/Cylinder/README.md"
git -C "$BOB_VAULT/Cylinder" add README.md
git -C "$BOB_VAULT/Cylinder" commit -q -m "bob: append note"
git -C "$BOB_VAULT/Cylinder" push -q origin main
ok "Bob pushed to $BOB_GH/$CYLINDER_REPO"

say "Step 11: Alice adds Bob's outbox as peer remote + fetch"
git -C "$ALICE_VAULT/Cylinder" remote add "$BOB_GH" "https://github.com/$BOB_GH/$CYLINDER_REPO"
gh_switch "$ALICE_GH"
git -C "$ALICE_VAULT/Cylinder" fetch -q "$BOB_GH"
AHEAD=$(git -C "$ALICE_VAULT/Cylinder" rev-list --count "HEAD..$BOB_GH/main")
[[ "$AHEAD" == "1" ]] || die "expected 1 commit from Bob, got $AHEAD"
ok "Alice sees $AHEAD new commit from $BOB_GH"

say "Step 12: Alice cherry-picks Bob's commit"
BOB_COMMIT=$(git -C "$ALICE_VAULT/Cylinder" rev-parse "$BOB_GH/main")
git -C "$ALICE_VAULT/Cylinder" cherry-pick "$BOB_COMMIT" >/dev/null
grep -q "bob's contribution" "$ALICE_VAULT/Cylinder/README.md" || die "cherry-pick didn't apply"
ok "Bob's contribution merged into Alice's main"

say "Step 13: Alice pushes the merged state to her outbox"
git -C "$ALICE_VAULT/Cylinder" push -q origin main
ok "Alice's outbox now contains Bob's contribution"

say "All steps passed — rc.21 GitHub transport validated end-to-end"
