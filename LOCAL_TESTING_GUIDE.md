# Local Testing Guide: Collaboration Handshake

## What We Built Today

We've implemented the complete collaboration handshake system for DreamNode sharing via Radicle links. Here's what happens when you click a share link:

### Single Link Flow
```
obsidian://interbrain-clone?id=rad:z123...&senderDid=did:key:z6Mk...&senderName=Alice
```

**What happens automatically:**
1. ✅ Clone DreamNode from Radicle network
2. ✅ Automatically run `rad follow <SENDER_DID>` (enables update propagation)
3. ✅ Create Dreamer node for "Alice" (if doesn't exist)
4. ✅ Save Alice's DID to Dreamer node's `.udd` file
5. ✅ Link cloned DreamNode to Alice's Dreamer node
6. ✅ Focus on cloned DreamNode in liminal-web layout
7. ✅ Alice appears as related node

### Batch Link Flow
```
obsidian://interbrain-clone-batch?ids=rad:z123,rad:z456&senderDid=did:key:z6Mk...&senderName=Alice
```

**What happens automatically:**
1. ✅ Clone all DreamNodes from Radicle network
2. ✅ Automatically follow Alice's DID once
3. ✅ Create Dreamer node for "Alice" (if doesn't exist)
4. ✅ Link ALL cloned DreamNodes to Alice's Dreamer node
5. 🔄 **TODO**: Focus on Alice's Dreamer node (showing all shared nodes around her)

### Duplicate Detection
- ✅ If Alice's Dreamer node already exists (detected by DID), reuse it
- ✅ If DreamNode already cloned, skip and just focus it
- ✅ Multiple links from same person → one Dreamer node

---

## How to Test Locally

### Setup (One Time)

1. **Build the latest code:**
   ```bash
   cd /Users/davidrug/DreamGarden/InterBrain
   git pull origin main
   npm install
   npm run build
   ```

2. **Reload InterBrain in Obsidian:**
   - Use Plugin Reloader hotkey, OR
   - Toggle InterBrain off/on in Settings

3. **Verify Radicle is running:**
   ```bash
   rad node status
   # Should show "Running"

   # If not:
   rad node start
   ```

4. **Add Radicle key to ssh-agent (CRITICAL for non-interactive operations):**
   ```bash
   # Add your Radicle key to ssh-agent
   ssh-add ~/.radicle/keys/radicle
   # You'll be prompted for passphrase ONCE

   # Verify it's loaded:
   ssh-add -l
   # Should show your Radicle key
   ```

   **Why this is needed**: InterBrain runs `rad init` and other commands non-interactively (from within Obsidian). Without ssh-agent, these commands fail with "please set `RAD_PASSPHRASE`" error.

5. **Get your Radicle identity:**
   ```bash
   rad self --did
   # Example: did:key:z6MkxyzABC123...

   rad self --alias
   # Example: David
   ```

### Test Scenario 1: Generate Share Link

1. **Select a DreamNode** in InterBrain
2. **Run Command**: `Copy Share Link for Selected DreamNode`
   - Opens command palette (Cmd+P)
   - Type "Copy Share Link"
   - Press Enter

3. **Check clipboard:**
   - Paste into a text editor
   - Should see: `obsidian://interbrain-clone?id=rad:z123...&senderDid=did:key:z6Mk...&senderName=YourName`

4. **What happened behind the scenes:**
   - Checked if node has Radicle ID
   - If not, ran `rad init` automatically
   - Generated link with your DID and name included

### Test Scenario 2: Single Link Handshake

1. **Create a test link manually:**
   ```
   obsidian://interbrain-clone?id=rad:z32KcCXgBC7ijWnQA6cHU5Frm9QwW&senderDid=did:key:z6MktestABC&senderName=TestFriend
   ```

2. **Click the link in your browser**

3. **Watch Obsidian console** (Cmd+Option+I → Console):
   ```
   🔗 [URIHandler] Single clone request
   🤝 [URIHandler] Starting collaboration handshake for TestFriend
   👤 [URIHandler] Creating new Dreamer node for TestFriend
   ✅ [URIHandler] Saved DID to Dreamer node
   🔗 [URIHandler] Linked "YourDreamNode" to "TestFriend"
   ✅ [URIHandler] Collaboration handshake complete
   ```

4. **Verify in DreamSpace:**
   - Cloned DreamNode should be selected
   - In liminal-web layout, "TestFriend" Dreamer node should appear as related
   - Select TestFriend node → should show connection to cloned node

5. **Verify in file system:**
   ```bash
   cd /path/to/vault/TestFriend
   cat .udd | grep radicleId
   # Should show: "radicleId": "did:key:z6MktestABC"
   ```

### Test Scenario 3: Duplicate Detection

1. **Click the SAME link again**

2. **Expected behavior:**
   - "DreamNode already cloned" message
   - Just focuses existing node
   - Does NOT create duplicate Dreamer node
   - TestFriend Dreamer node still has same DID

3. **Verify:**
   ```bash
   # Should be only ONE TestFriend directory:
   ls /path/to/vault | grep TestFriend
   ```

### Test Scenario 4: Multiple Nodes from Same Person

1. **Share TWO different DreamNodes** (using Copy Share Link command)

2. **Send both links** to your test account (or paste in browser)

3. **Click first link, then second link**

4. **Expected behavior:**
   - First click: Creates TestFriend Dreamer node
   - Second click: Reuses SAME TestFriend Dreamer node
   - Both DreamNodes linked to TestFriend

5. **Verify in DreamSpace:**
   - Select TestFriend → both cloned nodes appear as related

### Test Scenario 5: Batch Link

1. **Create a batch link manually:**
   ```
   obsidian://interbrain-clone-batch?ids=rad:z123,rad:z456&senderDid=did:key:z6MktestABC&senderName=TestFriend
   ```

2. **Click the batch link**

3. **Expected behavior:**
   - Progress notification shows "Cloning 2 DreamNodes..."
   - Both nodes clone sequentially
   - TestFriend Dreamer node created once
   - Both nodes linked to TestFriend
   - 🔄 **Currently**: Last cloned node gets focus
   - ✨ **Goal**: TestFriend Dreamer node gets focus (TODO)

---

## Testing Checklist

- [ ] "Copy Share Link" command works
- [ ] Generated link includes your DID and name
- [ ] Clicking link clones node successfully
- [ ] Dreamer node created automatically
- [ ] DID saved to Dreamer node's .udd file
- [ ] Cloned node linked to Dreamer node
- [ ] Duplicate click doesn't recreate Dreamer node
- [ ] Multiple nodes from same person use same Dreamer node
- [ ] Batch link clones all nodes
- [ ] Batch link creates one Dreamer node for all
- [ ] Automatic peer following works (check console for "✅ Collaboration handshake complete")

---

## Debugging Tips

### If Dreamer node not created:

Check console for errors:
```
❌ [URIHandler] Collaboration handshake failed
```

Common causes:
- Node creation failed (permissions?)
- .udd file couldn't be updated
- DreamNodeService not initialized

### If link doesn't include DID:

Check console:
```
⚠️ [ShareLink] Could not get Radicle identity
```

Fixes:
```bash
# Verify Radicle identity exists:
rad self --did

# If not:
rad auth
```

### If nodes not linking:

Check console:
```
❌ [URIHandler] Failed to link nodes
```

Common causes:
- DreamSongRelationshipService error
- Git operations failed
- Node not found after clone

---

## What's Next

### Remaining Implementation:
1. **Batch focus behavior**: Focus on Dreamer node instead of last cloned node
2. **Better notifications**: Show Dreamer node name in success message
3. **Email export testing**: Test with actual email workflow

### Future Enhancements (Post-Test):
1. **Bidirectional handshake**: Receiver sends their DID back to sender
2. **Batch optimizations**: Parallel cloning instead of sequential
3. **Progress indicators**: Real-time progress for batch operations
4. **Conflict resolution**: Handle name collisions gracefully

---

## Success Criteria

✅ **Minimum Success:**
- Can generate share link with command
- Link includes DID and name
- Clicking link clones node
- Dreamer node created
- Nodes linked properly

🎯 **Full Success:**
- All above, PLUS:
- Duplicate detection works
- Batch links work
- Focus behavior correct
- No console errors

🌟 **Excellence:**
- All above, PLUS:
- Smooth UX, no lag
- Proper error handling
- Works on remote machine (tomorrow's test)

---

## Quick Reference Commands

```bash
# Build and reload
npm run build

# Check Radicle status
rad node status
rad self --did
rad self --alias

# View vault DreamNodes
ls /path/to/vault

# Check .udd file
cat /path/to/vault/NodeName/.udd | jq '.'

# Check relationships
cat /path/to/vault/NodeName/.udd | jq '.liminalWebRelationships'

# Follow a peer manually (if automatic fails)
rad follow did:key:z6Mk...
```

