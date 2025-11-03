#!/usr/bin/env node

/**
 * Mock Email Export Script
 *
 * Simulates a conversation ending and triggers email export with test data.
 * This allows quick iteration on email generation without running a full video call.
 *
 * Usage: node mock-email-export.js
 */

const mockInvocations = [
  {
    dreamUUID: '550e8400-e29b-41d4-a716-446655440000',
    nodeName: 'InterBrain',
    timestamp: new Date(),
    githubRepoUrl: 'github.com/ProjectLiminality/InterBrain'
  },
  {
    dreamUUID: 'test-uuid-1',
    nodeName: 'TestNode1',
    timestamp: new Date(),
    radicleId: 'rad:z4SmnVEi6cBjjSScqqG541pZkbFDP'
  },
  {
    dreamUUID: 'test-uuid-2',
    nodeName: 'TestNode2',
    timestamp: new Date(),
    radicleId: 'rad:zWyXQGs2bqjAbSgjAuNdkWq1bQjG'
  }
];

const senderDid = 'did:key:z6MksAEMTumQbRK1dvFqt7Xt5YHMRPsmhhS2jfhxzbsDUWX5';
const senderName = 'InterfaceGuy';

console.log('📧 Mock Email Export Data');
console.log('==========================');
console.log('');
console.log('Sender:', senderName);
console.log('DID:', senderDid);
console.log('');
console.log('Invoked Nodes:');
mockInvocations.forEach((inv, i) => {
  console.log(`${i + 1}. ${inv.nodeName}`);
  if (inv.radicleId) console.log(`   Radicle: ${inv.radicleId}`);
  if (inv.githubRepoUrl) console.log(`   GitHub: ${inv.githubRepoUrl}`);
});
console.log('');

// Generate the URIs
const vaultName = 'DreamVault';

// Individual clone links
console.log('Individual Clone Links:');
console.log('');

// InterBrain with collaboration handshake
const interbrainUri = `obsidian://interbrain-clone?repo=github.com/ProjectLiminality/InterBrain&senderDid=${encodeURIComponent(senderDid)}&senderName=${encodeURIComponent(senderName)}`;
console.log(`1. InterBrain:`);
console.log(`   ${interbrainUri}`);
console.log('');

// Radicle nodes with collaboration handshake
mockInvocations.forEach((inv, i) => {
  if (inv.radicleId) {
    const uri = `obsidian://interbrain-clone?id=${inv.radicleId}&senderDid=${encodeURIComponent(senderDid)}&senderName=${encodeURIComponent(senderName)}`;
    console.log(`${i + 2}. ${inv.nodeName}:`);
    console.log(`   ${uri}`);
    console.log('');
  }
});

// Batch clone link (all identifiers)
const allIds = mockInvocations.map(inv => inv.radicleId || inv.githubRepoUrl).filter(Boolean);
const batchUri = `obsidian://interbrain-clone-batch?ids=${encodeURIComponent(allIds.join(','))}&senderDid=${encodeURIComponent(senderDid)}&senderName=${encodeURIComponent(senderName)}`;
console.log('Batch Clone Link (all nodes):');
console.log(`   ${batchUri}`);
console.log('');

// Install script links
console.log('Install Script Links:');
console.log('');

// Conservative install (just InterBrain + Alice's identity)
const conservativeInstallUri = `obsidian://interbrain-clone?repo=github.com/ProjectLiminality/InterBrain&senderDid=${encodeURIComponent(senderDid)}&senderName=${encodeURIComponent(senderName)}`;
const conservativeInstall = `curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh | bash -s -- --uri "${conservativeInstallUri}"`;
console.log('Conservative Install (InterBrain + sender connection):');
console.log(conservativeInstall);
console.log('');

// Full install (all shared nodes)
const fullInstall = `curl -fsSL https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.sh | bash -s -- --uri "${batchUri}"`;
console.log('Full Install (all shared DreamNodes):');
console.log(fullInstall);
console.log('');

console.log('==========================');
console.log('✅ Mock data generated successfully');
console.log('');
console.log('To test email generation:');
console.log('1. Copy one of the install commands above');
console.log('2. The email service should include these in the footer');
console.log('3. Test by running a mock conversation end in Obsidian');
