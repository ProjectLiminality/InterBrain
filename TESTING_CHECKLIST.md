# InterBrain Collaboration Testing Checklist

**For Tomorrow's Test Session** - Critical fixes and manual steps for successful Radicle collaboration

## ✅ Fixes Implemented

### 1. UUID Dependency Fixed
- ✅ Added `uuid` to package.json dependencies
- **Impact**: Build will now succeed on fresh installations

### 2. Automatic Peer Following
- ✅ Added `followPeer()` and `getRepositoryDelegate()` methods to RadicleService
- ✅ Automatic `rad follow` after every clone operation
- **Impact**: Updates will now propagate automatically between peers

### 3. Enhanced URI Protocol
- ✅ Added `senderDid` and `senderName` parameters to link generation methods
- **Status**: Partial - URI generation updated, handler needs completion
- **Manual Workaround**: See section below

---

## 🔧 Manual Steps for Tomorrow's Test

### Pre-Test Setup (Both Machines)

#### 1. Build Latest Code
```bash
cd /path/to/InterBrain
git pull origin main
npm install  # Will now include uuid
npm run build
```

#### 2. Radicle Identity Setup
```bash
# If not already done:
rad auth

# Verify identity:
rad self --did
rad self --alias

# Start Radicle node:
rad node start

# Verify node is running:
rad node status
```

### Critical Manual Workaround: Peer Following

**THE PROBLEM**: Radicle requires bidirectional following for updates to propagate.

**AUTOMATIC FIX** (now implemented):
- When you click a Radicle link and clone a DreamNode, InterBrain will automatically:
  1. Get the repository owner's DID
  2. Run `rad follow <OWNER_DID>`
  3. You'll see this in the console: "✅ Collaboration handshake complete"

**MANUAL VERIFICATION** (if automatic following fails):
```bash
# On David's machine - get your DID:
rad self --did
# Example output: did:key:z6MkxyzABC...

# Share this DID with your friend via WhatsApp/Signal

# On Friend's machine - after cloning via InterBrain link:
cd /path/to/vault/ClonedDreamNode
rad follow did:key:z6MkxyzABC...  # Use David's actual DID
```

**BIDIRECTIONAL FOLLOWING** (if you want David to receive friend's updates):
```bash
# Friend's machine - get their DID:
rad self --did

# Friend shares DID with David

# David's machine:
rad follow did:key:z6Mkfriend...  # Use friend's actual DID
```

### Testing the Collaboration Flow

#### Step 1: David Shares DreamNode
```bash
# David's machine - from any DreamNode directory:
cd /path/to/vault/MyDreamNode

# Initialize for Radicle (if not already done):
rad init --public

# Push to network:
rad sync

# Get Radicle ID:
rad .
# Output: rad:z32KcCXgBC7ijWnQA6cHU5Frm9QwW

# Generate link (manual for now):
obsidian://interbrain-clone?id=rad:z32KcCXgBC7ijWnQA6cHU5Frm9QwW&senderDid=did:key:z6MkDavidDID&senderName=David

# Send this link to friend via WhatsApp/Signal
```

#### Step 2: Friend Clones DreamNode
```bash
# Friend clicks the link in their browser
# InterBrain will:
# 1. Clone the DreamNode from Radicle network
# 2. Automatically follow David's DID
# 3. Focus the node in DreamSpace

# Verify in Obsidian console:
# Should see: "✅ Collaboration handshake complete - following did:key:z6MkDavidDID"
```

#### Step 3: David Makes Updates
```bash
# David's machine - make changes to the DreamNode:
cd /path/to/vault/MyDreamNode
# ... edit files ...
git add .
git commit -m "Updated content for friend"
rad sync  # Push to Radicle network
```

#### Step 4: Friend Receives Updates
```bash
# Friend's machine - check for updates:
cd /path/to/vault/MyDreamNode

# Fetch updates:
rad sync --fetch

# Check if there are new commits:
git log HEAD..refs/remotes/rad/main

# If there are updates, merge them:
git merge refs/remotes/rad/main
```

**AUTOMATIC UPDATE CHECK** (via Coherence Beacon):
- Open the DreamNode in InterBrain
- Coherence Beacon will automatically check for updates
- If updates found, you'll see a notification

---

## 🐛 Known Issues & Workarounds

### Issue 1: "rad node start" fails
**Error**: `Command failed: rad node start`

**Fix**:
```bash
# Stop any running node:
rad node stop

# Start fresh:
rad node start

# If still fails, check if process is hanging:
ps aux | grep radicle
kill -9 <PID>  # If needed

# Restart:
rad node start
```

### Issue 2: Clone succeeds but no updates
**Symptom**: Friend clones DreamNode successfully, but doesn't receive David's updates

**Diagnosis**:
```bash
# On friend's machine:
rad node peers  # Check if connected to any peers

# Check if following David:
rad follow list  # Should show David's DID
```

**Fix**:
```bash
# Manually follow David:
rad follow did:key:z6MkDavidDID
```

### Issue 3: "Already initialized" error
**Error**: When running `rad init` on a repo that's already in Radicle storage

**Fix**:
```bash
# Check if repo exists in storage:
rad .  # Will show Radicle ID if already init

# If it exists, just sync instead:
rad sync
```

---

## 📋 Testing Scenarios

### Scenario 1: Fresh Collaboration (Recommended Start)
1. David creates a new DreamNode
2. David initializes for Radicle (`rad init`)
3. David pushes to network (`rad sync`)
4. David shares link with friend
5. Friend clicks link → automatic clone + follow
6. David makes update → rad sync
7. Friend checks Coherence Beacon → sees update notification

**Expected Outcome**: ✅ Updates propagate automatically

### Scenario 2: Existing DreamNode Sharing
1. David has existing DreamNode (already in Radicle)
2. David gets Radicle ID: `rad .`
3. David creates link with his DID
4. Friend clicks link
5. Automatic clone + peer following

**Expected Outcome**: ✅ Friend has full copy + will receive future updates

### Scenario 3: Batch Collaboration
1. David shares multiple DreamNodes during video call
2. For each node: get Radicle ID
3. Create batch link with all IDs + David's DID
4. Friend clicks one link → clones all nodes
5. All nodes automatically followed

**Expected Outcome**: ✅ All nodes cloned, peer relationship established once

---

## 🔍 Debugging Commands

### Check Radicle Status
```bash
# Verify Radicle installation:
rad --version

# Check identity:
rad self

# Check node status:
rad node status

# View node logs:
rad node logs

# List followed peers:
rad follow list

# List connected peers:
rad node peers
```

### Check Git/Radicle State
```bash
cd /path/to/DreamNode

# Check if Radicle-initialized:
rad .

# Check for remote updates:
git log HEAD..refs/remotes/rad/main

# View all remote refs:
git for-each-ref refs/remotes/

# Check current branch:
git branch -vv
```

### Obsidian Console Debugging
1. Open Obsidian Developer Tools (Cmd+Option+I)
2. Go to Console tab
3. Filter for "RadicleService" or "URIHandler"
4. Look for:
   - ✅ "Collaboration handshake complete"
   - ✅ "Following peer"
   - ❌ "Could not follow peer" (needs manual fix)

---

## 📝 Notes for David

### Before Tomorrow's Call:
1. ✅ Pull latest code and rebuild
2. ✅ Test Radicle node starts successfully
3. ✅ Have your DID ready: `rad self --did`
4. ✅ Pick 1-2 test DreamNodes to share
5. ✅ Initialize them for Radicle if needed

### During the Call:
1. Help friend install prerequisites (Homebrew, Node, Radicle)
2. Help friend run `rad auth` and `rad node start`
3. Get friend's DID for bidirectional following
4. Generate link with your DID included
5. Watch Obsidian console together for success messages
6. Test update propagation in both directions

### After the Call:
1. Document what worked / what didn't
2. Note any errors or confusing UX
3. Update GitHub issue #338 with findings
4. Plan remaining implementation for full handshake

---

## 🚀 Success Criteria for Tomorrow

✅ **Minimum Success**:
- Friend can clone DreamNode via link
- Automatic peer following works
- Manual update fetch works (`rad sync --fetch` + `git merge`)

🎯 **Ideal Success**:
- Friend can clone DreamNode via link
- Automatic peer following works
- Coherence Beacon detects updates automatically
- Bidirectional collaboration works

🌟 **Stretch Goal**:
- Dreamer node auto-creation (not yet implemented)
- Batch links work with multiple DreamNodes
- Zero manual commands needed

---

## Next Development Steps (Post-Test)

Based on what we learned today, these implementations remain:

1. **Complete Email Export Integration**:
   - Pass `senderDid` and `senderName` to link generation
   - Update email templates to include collaboration context

2. **Implement Dreamer Node Auto-Creation** (#338):
   - When clicking link with `senderDid` + `senderName` params
   - Create Dreamer-type DreamNode for sender
   - Attach cloned DreamNode to sender's Dreamer node
   - Auto-follow sender's DID

3. **Bidirectional Following Handshake**:
   - After friend clones and creates Radicle identity
   - Send friend's DID back to sender (out-of-band for now)
   - Sender follows friend's DID
   - Full collaboration established

4. **Installation Wizard** (next session):
   - Guided setup for all prerequisites
   - One-click install script
   - Verification step at end

---

## 📞 Quick Reference Links

- **Radicle Installation**: https://radicle.xyz
- **InterBrain Repo**: https://github.com/ProjectLiminality/InterBrain
- **Issue #338**: https://github.com/ProjectLiminality/InterBrain/issues/338

