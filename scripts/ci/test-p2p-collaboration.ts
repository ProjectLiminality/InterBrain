#!/usr/bin/env npx ts-node
/**
 * P2P Collaboration E2E Test Script
 *
 * Tests InterBrain's P2P collaboration flow using patterns from the actual services:
 * - URI generation (ShareLinkService.generateShareLink)
 * - Clone flow (URIHandlerService.cloneFromRadicle)
 * - DID backpropagation (URIHandlerService.generateUpdateContactLink)
 *
 * This script mimics the actual UX flow:
 * 1. Alice creates DreamNode with Radicle ID (like rad init)
 * 2. Alice generates share URI (like ShareLinkService)
 * 3. Bob receives URI, parses it, clones (like URIHandlerService.cloneFromRadicle)
 * 4. Bob generates update contact URI (DID backpropagation)
 *
 * Usage:
 *   ROLE=alice|bob npx ts-node scripts/ci/test-p2p-collaboration.ts
 *
 * Environment variables:
 *   ROLE: "alice" or "bob"
 *   RAD_PASSPHRASE: Passphrase for Radicle operations
 *   ALICE_TAILSCALE_IP: (Bob only) Alice's Tailscale IP
 *   ALICE_DID: (Bob only) Alice's Radicle DID
 *   ALICE_RID: (Bob only) Alice's repo Radicle ID
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec, spawn, SpawnOptions } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// URI Generation - Mirrors URIHandlerService static methods
// ============================================================================

/**
 * Generate share link URI
 * Mirrors URIHandlerService.generateSingleNodeLink()
 */
function generateShareLink(
  radicleId: string,
  senderDid?: string,
  senderName?: string,
  senderEmail?: string
): string {
  // Keep Radicle ID as-is (don't encode colons)
  let uri = `obsidian://interbrain-clone?ids=${radicleId}`;

  if (senderDid) {
    uri += `&senderDid=${encodeURIComponent(senderDid)}`;
  }
  if (senderName) {
    uri += `&senderName=${encodeURIComponent(senderName)}`;
  }
  if (senderEmail) {
    uri += `&senderEmail=${encodeURIComponent(senderEmail)}`;
  }

  return uri;
}

/**
 * Generate update contact URI for DID backpropagation
 * Mirrors URIHandlerService.generateUpdateContactLink()
 */
function generateUpdateContactLink(
  did: string,
  dreamerUuid: string,
  name?: string,
  email?: string
): string {
  let uri = `obsidian://interbrain-update-contact?did=${encodeURIComponent(did)}&uuid=${encodeURIComponent(dreamerUuid)}`;

  if (name) {
    uri += `&name=${encodeURIComponent(name)}`;
  }
  if (email) {
    uri += `&email=${encodeURIComponent(email)}`;
  }

  return uri;
}

/**
 * Parse share link URI
 * Extract radicleId, senderDid, senderName from URI
 */
function parseShareLink(uri: string): {
  radicleId: string;
  senderDid?: string;
  senderName?: string;
  senderEmail?: string;
} {
  const url = new URL(uri);
  const ids = url.searchParams.get('ids') || url.searchParams.get('id') || '';
  const senderDid = url.searchParams.get('senderDid') || undefined;
  const senderName = url.searchParams.get('senderName') || undefined;
  const senderEmail = url.searchParams.get('senderEmail') || undefined;

  return {
    radicleId: ids.split(',')[0], // Take first ID
    senderDid: senderDid ? decodeURIComponent(senderDid) : undefined,
    senderName: senderName ? decodeURIComponent(senderName) : undefined,
    senderEmail: senderEmail ? decodeURIComponent(senderEmail) : undefined,
  };
}

// ============================================================================
// Radicle Operations - Mirrors RadicleService
// ============================================================================

const RAD_CMD = `${os.homedir()}/.radicle/bin/rad`;

/**
 * rad init - Mirrors RadicleServiceImpl.init()
 * Uses spawn with stdin pipe for non-TTY execution
 */
async function radInit(
  repoPath: string,
  name: string,
  passphrase: string,
  isPrivate: boolean = true
): Promise<string | null> {
  const spawnArgs = [
    'init',
    repoPath,
    isPrivate ? '--private' : '--public',
    '--default-branch', 'main',
    '--no-confirm',
    '--name', name,
  ];

  console.log(`Running: rad ${spawnArgs.join(' ')}`);

  const env = {
    ...process.env,
    RAD_PASSPHRASE: passphrase,
    PATH: `${os.homedir()}/.radicle/bin:${process.env.PATH}`,
  };

  return new Promise((resolve, reject) => {
    const child = spawn(RAD_CMD, spawnArgs, {
      env,
      cwd: repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      console.log(`rad init exited with code ${code}`);
      if (stdout) console.log(`stdout: ${stdout}`);
      if (stderr) console.log(`stderr: ${stderr}`);

      if (code === 0) {
        const ridMatch = stdout.match(/rad:z[a-zA-Z0-9]+/);
        resolve(ridMatch ? ridMatch[0] : null);
      } else {
        // Check for already initialized
        if (stderr.includes('already initialized') || stdout.includes('already initialized')) {
          console.log('Repository already initialized');
          resolve(null);
        } else {
          reject(new Error(`rad init failed: ${stderr || stdout}`));
        }
      }
    });

    child.on('error', reject);
    child.stdin?.end();
  });
}

/**
 * rad clone - Mirrors RadicleServiceImpl.clone()
 */
async function radClone(
  radicleId: string,
  destinationPath: string,
  passphrase: string,
  peerNid?: string
): Promise<{ repoName: string; alreadyExisted: boolean }> {
  const env = {
    ...process.env,
    RAD_PASSPHRASE: passphrase,
    PATH: `${os.homedir()}/.radicle/bin:${process.env.PATH}`,
  };

  // Build clone command - mirrors RadicleService
  let cloneCmd = `"${RAD_CMD}" clone ${radicleId} --scope followed`;
  if (peerNid) {
    // Strip did:key: prefix if present
    const rawNid = peerNid.replace(/^did:key:/, '');
    cloneCmd += ` --seed ${rawNid}`;
    console.log(`Running: ${cloneCmd} (direct P2P from peer)`);
  } else {
    console.log(`Running: ${cloneCmd} (from routing table)`);
  }

  try {
    const { stdout, stderr } = await execAsync(cloneCmd, {
      cwd: destinationPath,
      env,
    });

    console.log('Clone output:', stdout);
    if (stderr) console.log('Clone stderr:', stderr);

    // Parse repo name from output: "Creating checkout in ./RepoName"
    const match = stdout.match(/Creating checkout in \.\/([^./\s]+)/);
    if (match && match[1]) {
      return { repoName: match[1], alreadyExisted: false };
    }

    throw new Error('Could not parse repo name from clone output');
  } catch (error: any) {
    const errorOutput = error.stdout || error.stderr || error.message || '';

    // Check if already exists
    const existsMatch = errorOutput.match(/directory path "([^"]+)" already exists/);
    if (existsMatch && existsMatch[1]) {
      return { repoName: existsMatch[1], alreadyExisted: true };
    }

    throw new Error(`Clone failed: ${errorOutput}`);
  }
}

/**
 * rad share - Mirrors RadicleServiceImpl.share()
 * Publishes repository to network
 */
async function radShare(repoPath: string, passphrase: string): Promise<void> {
  const env = {
    ...process.env,
    RAD_PASSPHRASE: passphrase,
    PATH: `${os.homedir()}/.radicle/bin:${process.env.PATH}`,
  };

  // Step 1: Push to rad remote
  console.log('Step 1: git push rad main');
  await execAsync('git push rad main', { cwd: repoPath, env });

  // Step 2: Publish to network
  console.log('Step 2: rad publish');
  try {
    await execAsync(`"${RAD_CMD}" publish`, { cwd: repoPath, env });
  } catch (error: any) {
    // Already published is OK
    if (!error.message?.includes('already public')) {
      throw error;
    }
  }

  // Step 3: Sync inventory
  console.log('Step 3: rad sync --inventory');
  await execAsync(`"${RAD_CMD}" sync --inventory`, { cwd: repoPath, env });

  console.log('Repository shared to network');
}

/**
 * Get Radicle identity
 */
async function getRadicleIdentity(passphrase: string): Promise<{ did: string; alias: string }> {
  const env = {
    ...process.env,
    RAD_PASSPHRASE: passphrase,
    PATH: `${os.homedir()}/.radicle/bin:${process.env.PATH}`,
  };

  const { stdout: didOutput } = await execAsync(`"${RAD_CMD}" self --did`, { env });
  const { stdout: aliasOutput } = await execAsync(`"${RAD_CMD}" self --alias`, { env });

  return {
    did: didOutput.trim(),
    alias: aliasOutput.trim(),
  };
}

/**
 * Follow a peer
 */
async function followPeer(peerDid: string, passphrase: string): Promise<void> {
  const env = {
    ...process.env,
    RAD_PASSPHRASE: passphrase,
    PATH: `${os.homedir()}/.radicle/bin:${process.env.PATH}`,
  };

  try {
    await execAsync(`"${RAD_CMD}" follow ${peerDid}`, { env });
    console.log(`Now following ${peerDid}`);
  } catch (error: any) {
    // Already following is OK
    if (!error.message?.includes('already following')) {
      throw error;
    }
    console.log(`Already following ${peerDid}`);
  }
}

/**
 * Connect to a peer node
 */
async function connectToPeer(peerDid: string, peerIp: string, passphrase: string): Promise<void> {
  const env = {
    ...process.env,
    RAD_PASSPHRASE: passphrase,
    PATH: `${os.homedir()}/.radicle/bin:${process.env.PATH}`,
  };

  // Strip did:key: prefix for connection
  const rawNid = peerDid.replace(/^did:key:/, '');
  const nodeAddress = `${rawNid}@${peerIp}:8776`;

  console.log(`Connecting to peer: ${nodeAddress}`);
  await execAsync(`"${RAD_CMD}" node connect ${nodeAddress}`, { env });
  console.log('Connected to peer');
}

// ============================================================================
// DreamNode Operations - Mirrors DreamNodeConversionService
// ============================================================================

interface UDD {
  uuid: string;
  title: string;
  type: 'dream' | 'dreamer';
  radicleId?: string;
  dreamTalk?: string;
}

/**
 * Create a DreamNode with .udd file
 * Mirrors the conversion service pattern
 */
async function createDreamNode(
  basePath: string,
  name: string,
  passphrase: string
): Promise<{ path: string; uuid: string; rid: string | null }> {
  const nodePath = path.join(basePath, name);

  // Create directory
  fs.mkdirSync(nodePath, { recursive: true });

  // Initialize git with main branch
  await execAsync('git init --initial-branch=main', { cwd: nodePath });
  await execAsync('git config user.email "ci@test.interbrain"', { cwd: nodePath });
  await execAsync('git config user.name "CI Test"', { cwd: nodePath });

  // Generate UUID
  const uuid = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Create .udd file (mirrors UDDService.createUDD)
  const udd: UDD = {
    uuid,
    title: name,
    type: 'dream',
    dreamTalk: '',
  };
  fs.writeFileSync(path.join(nodePath, '.udd'), JSON.stringify(udd, null, 2));

  // Create README
  fs.writeFileSync(path.join(nodePath, 'README.md'), `# ${name}\n\nP2P Collaboration Test DreamNode\n`);

  // Initial commit
  await execAsync('git add -A', { cwd: nodePath });
  await execAsync('git commit -m "Initial commit"', { cwd: nodePath });

  // Initialize with Radicle (rad init)
  // Use --public for CI testing (makes it discoverable)
  const rid = await radInit(nodePath, name, passphrase, false);

  if (rid) {
    // Update .udd with Radicle ID
    udd.radicleId = rid;
    fs.writeFileSync(path.join(nodePath, '.udd'), JSON.stringify(udd, null, 2));

    // Commit .udd update
    await execAsync('git add .udd', { cwd: nodePath });
    await execAsync('git commit -m "Add Radicle ID to .udd"', { cwd: nodePath });
  }

  return { path: nodePath, uuid, rid };
}

// ============================================================================
// Alice's Role
// ============================================================================

async function runAlice(): Promise<void> {
  console.log('='.repeat(60));
  console.log('ALICE: Setting up DreamNode for sharing');
  console.log('='.repeat(60));

  const passphrase = process.env.RAD_PASSPHRASE;
  if (!passphrase) {
    throw new Error('RAD_PASSPHRASE required');
  }

  const tailscaleIp = process.env.TAILSCALE_IP;
  if (!tailscaleIp) {
    throw new Error('TAILSCALE_IP required');
  }

  // Create test directory
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interbrain-alice-'));
  console.log(`Test directory: ${testDir}`);

  try {
    // Step 1: Get Alice's identity
    console.log('\n1. Getting Alice\'s Radicle identity...');
    const identity = await getRadicleIdentity(passphrase);
    console.log(`   DID: ${identity.did}`);
    console.log(`   Alias: ${identity.alias}`);

    // Step 2: Create DreamNode
    console.log('\n2. Creating DreamNode...');
    const node = await createDreamNode(testDir, 'AliceTestNode', passphrase);
    console.log(`   Path: ${node.path}`);
    console.log(`   UUID: ${node.uuid}`);
    console.log(`   RID: ${node.rid}`);

    if (!node.rid) {
      throw new Error('Failed to initialize Radicle ID');
    }

    // Step 3: Share to network
    console.log('\n3. Sharing to network...');
    await radShare(node.path, passphrase);

    // Step 4: Generate share link (mirrors ShareLinkService)
    console.log('\n4. Generating share link...');
    const shareUri = generateShareLink(
      node.rid,
      identity.did,
      identity.alias || 'Alice',
      'alice@test.interbrain'
    );
    console.log(`   URI: ${shareUri}`);

    // Step 5: Output for Bob
    console.log('\n' + '='.repeat(60));
    console.log('ALICE READY - Output for Bob:');
    console.log('='.repeat(60));
    console.log(`ALICE_TAILSCALE_IP=${tailscaleIp}`);
    console.log(`ALICE_DID=${identity.did}`);
    console.log(`ALICE_RID=${node.rid}`);
    console.log(`ALICE_UUID=${node.uuid}`);
    console.log(`SHARE_URI=${shareUri}`);
    console.log('='.repeat(60));

    // Write to artifact file for CI
    const artifactDir = '/tmp/alice-info';
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, 'tailscale-ip'), tailscaleIp);
    fs.writeFileSync(path.join(artifactDir, 'did'), identity.did);
    fs.writeFileSync(path.join(artifactDir, 'rid'), node.rid);
    fs.writeFileSync(path.join(artifactDir, 'uuid'), node.uuid);
    fs.writeFileSync(path.join(artifactDir, 'share-uri'), shareUri);
    fs.writeFileSync(path.join(artifactDir, 'alias'), identity.alias || 'Alice');
    console.log(`\nArtifact files written to ${artifactDir}`);

    // Keep node running for Bob
    console.log('\n5. Keeping node running for Bob to clone...');
    console.log('   Waiting up to 5 minutes for Bob...');

    // Monitor for Bob's activity
    for (let i = 1; i <= 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 30000));
      console.log(`   [${i}/10] Still waiting...`);

      // Check node status
      const env = {
        ...process.env,
        RAD_PASSPHRASE: passphrase,
        PATH: `${os.homedir()}/.radicle/bin:${process.env.PATH}`,
      };
      try {
        const { stdout } = await execAsync(`"${RAD_CMD}" node status`, { env });
        console.log(`   Node status: ${stdout.trim().split('\n')[0]}`);
      } catch {
        console.log('   Node status: unknown');
      }
    }

    console.log('\n✅ Alice completed successfully');

  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      console.warn('Warning: Could not clean up test directory');
    }
  }
}

// ============================================================================
// Bob's Role
// ============================================================================

async function runBob(): Promise<void> {
  console.log('='.repeat(60));
  console.log('BOB: Cloning from Alice and setting up collaboration');
  console.log('='.repeat(60));

  const passphrase = process.env.RAD_PASSPHRASE;
  if (!passphrase) {
    throw new Error('RAD_PASSPHRASE required');
  }

  // Read Alice's info from environment (set by workflow from artifact)
  const aliceIp = process.env.ALICE_TAILSCALE_IP;
  const aliceDid = process.env.ALICE_DID;
  const aliceRid = process.env.ALICE_RID;
  const aliceUuid = process.env.ALICE_UUID;
  const shareUri = process.env.SHARE_URI;

  if (!aliceIp || !aliceDid || !aliceRid) {
    throw new Error('Missing Alice info: ALICE_TAILSCALE_IP, ALICE_DID, ALICE_RID required');
  }

  console.log('\nAlice\'s info:');
  console.log(`  Tailscale IP: ${aliceIp}`);
  console.log(`  DID: ${aliceDid}`);
  console.log(`  RID: ${aliceRid}`);
  if (shareUri) console.log(`  Share URI: ${shareUri}`);

  // Create test directory
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interbrain-bob-'));
  console.log(`\nTest directory: ${testDir}`);

  try {
    // Step 1: Get Bob's identity
    console.log('\n1. Getting Bob\'s Radicle identity...');
    const identity = await getRadicleIdentity(passphrase);
    console.log(`   DID: ${identity.did}`);
    console.log(`   Alias: ${identity.alias}`);

    // Step 2: Connect to Alice's node
    console.log('\n2. Connecting to Alice\'s node...');
    await connectToPeer(aliceDid, aliceIp, passphrase);

    // Step 3: Follow Alice (mirrors handleClone collaboration handshake)
    console.log('\n3. Following Alice...');
    await followPeer(aliceDid, passphrase);

    // Step 4: Clone from Alice (mirrors URIHandlerService.cloneFromRadicle)
    console.log('\n4. Cloning DreamNode from Alice...');
    // Parse share URI if available
    let radicleIdToClone = aliceRid;
    let senderDid = aliceDid;
    if (shareUri) {
      const parsed = parseShareLink(shareUri);
      radicleIdToClone = parsed.radicleId;
      senderDid = parsed.senderDid || aliceDid;
      console.log(`   Parsed from URI - RID: ${radicleIdToClone}, Sender DID: ${senderDid}`);
    }

    const cloneResult = await radClone(radicleIdToClone, testDir, passphrase, senderDid);
    console.log(`   Cloned: ${cloneResult.repoName}`);
    console.log(`   Already existed: ${cloneResult.alreadyExisted}`);

    // Step 5: Verify clone
    console.log('\n5. Verifying clone...');
    const clonedPath = path.join(testDir, cloneResult.repoName);
    const uddPath = path.join(clonedPath, '.udd');

    if (fs.existsSync(uddPath)) {
      const udd = JSON.parse(fs.readFileSync(uddPath, 'utf-8'));
      console.log(`   ✅ .udd file found`);
      console.log(`   UUID: ${udd.uuid}`);
      console.log(`   Title: ${udd.title}`);
      console.log(`   Radicle ID: ${udd.radicleId || 'not set'}`);
    } else {
      throw new Error('.udd file not found in cloned repo');
    }

    // Step 6: Generate update contact URI (DID backpropagation)
    console.log('\n6. Generating DID backpropagation URI...');
    if (aliceUuid) {
      const updateUri = generateUpdateContactLink(
        identity.did,
        aliceUuid,
        identity.alias || 'Bob',
        'bob@test.interbrain'
      );
      console.log(`   Update URI: ${updateUri}`);

      // In real UX, Bob would send this to Alice via email/chat
      // Alice would click it to update her Dreamer node for Bob
    } else {
      console.log('   Skipped - Alice UUID not provided');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ BOB COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('\nCollaboration flow verified:');
    console.log('  1. Alice created DreamNode with Radicle');
    console.log('  2. Alice generated share link (ShareLinkService pattern)');
    console.log('  3. Bob connected to Alice\'s node via Tailscale');
    console.log('  4. Bob cloned using share URI (URIHandlerService pattern)');
    console.log('  5. Bob verified .udd file in cloned repo');
    console.log('  6. Bob generated DID backpropagation URI');
    console.log('='.repeat(60));

  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      console.warn('Warning: Could not clean up test directory');
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const role = process.env.ROLE?.toLowerCase();

  if (role === 'alice') {
    await runAlice();
  } else if (role === 'bob') {
    await runBob();
  } else {
    console.error('ERROR: ROLE environment variable must be "alice" or "bob"');
    console.error('Usage: ROLE=alice npx ts-node scripts/ci/test-p2p-collaboration.ts');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
