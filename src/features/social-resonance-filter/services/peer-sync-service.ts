/**
 * Peer Sync Service
 *
 * Handles peer discovery and synchronization operations:
 * - Discover which peers are seeding DreamNodes (Radicle → Liminal Web)
 * - Sync Radicle follow/delegate relationships with Liminal Web
 *
 * Uses dreamnode/utils/vault-scanner for DreamNode discovery,
 * then builds peer-specific mappings (DID→UUID) on top.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const execAsync = promisify(exec);

import type { RadicleService } from './radicle-service';
import {
  discoverDreamNodes,
  readLiminalWeb,
  type DiscoveredNode
} from '../../dreamnode/utils/vault-scanner';

/**
 * Extended node data with peer-specific fields
 */
interface PeerNodeData {
  uuid: string;
  type: 'dream' | 'dreamer';
  did?: string;
  radicleId?: string;
  relationships: string[];
  dirPath: string;
  dirName: string;
}

/**
 * Result of peer discovery operation
 */
export interface PeerDiscoveryResult {
  totalDreamNodes: number;
  newRelationshipsFound: number;
  errors: number;
  summary: string;
}

/**
 * Result of peer sync operation
 */
export interface PeerSyncResult {
  totalRelationships: number;
  newFollows: number;
  newDelegates: number;
  scopeUpdates: number;
  remotesAdded: number;
  remotesUpdated: number;
  remotesRemoved: number;
  alreadyConfigured: number;
  errors: number;
  summary: string;
}

/**
 * Service for peer-related network operations
 */
export class PeerSyncService {
  private radicleService: RadicleService;
  private radPath: string = 'rad';

  constructor(radicleService: RadicleService) {
    this.radicleService = radicleService;
  }

  /**
   * Find the rad command path
   */
  private async findRadPath(): Promise<string> {
    try {
      const { stdout } = await execAsync('which rad');
      return stdout.trim() || 'rad';
    } catch {
      const commonPaths = [
        '/usr/local/bin/rad',
        '/opt/homebrew/bin/rad',
        `${(globalThis as any).process?.env?.HOME}/.radicle/bin/rad`
      ];

      for (const testPath of commonPaths) {
        try {
          await execAsync(`test -f ${testPath}`);
          return testPath;
        } catch {
          continue;
        }
      }
    }
    return 'rad';
  }

  /**
   * Query existing follows for a specific repo
   */
  private async getExistingFollowsForRepo(repoPath: string): Promise<Set<string>> {
    const follows = new Set<string>();
    try {
      const { stdout } = await execAsync(`"${this.radPath}" follow`, { cwd: repoPath });
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/did:key:[\w]+/);
        if (match) {
          follows.add(match[0]);
        }
      }
    } catch {
      // Repo might not be initialized with Radicle
    }
    return follows;
  }

  /**
   * Build peer-specific data maps from discovered nodes
   * Adds DID→UUID mapping and loads relationships for dreamers
   */
  private async buildPeerMaps(
    vaultPath: string,
    includeRelationships: boolean
  ): Promise<{
    nodeDataMap: Map<string, PeerNodeData>;
    didToUuidMap: Map<string, string>;
  }> {
    const { discovered } = await discoverDreamNodes(vaultPath);

    const nodeDataMap = new Map<string, PeerNodeData>();
    const didToUuidMap = new Map<string, string>();

    // Process discovered nodes in parallel
    await Promise.all(
      discovered.map(async (node: DiscoveredNode) => {
        const nodeType = (node.udd.type || 'dream') as 'dream' | 'dreamer';

        // Load relationships for dreamers if requested
        let relationships: string[] = [];
        if (includeRelationships && nodeType === 'dreamer') {
          relationships = await readLiminalWeb(node.dirPath);
        }

        const peerData: PeerNodeData = {
          uuid: node.udd.uuid,
          type: nodeType,
          did: node.udd.did,
          radicleId: node.udd.radicleId,
          relationships,
          dirPath: node.dirPath,
          dirName: node.dirName
        };

        nodeDataMap.set(node.udd.uuid, peerData);

        // Build reverse DID→UUID mapping for dreamers
        if (nodeType === 'dreamer' && node.udd.did) {
          didToUuidMap.set(node.udd.did, node.udd.uuid);
        }
      })
    );

    return { nodeDataMap, didToUuidMap };
  }

  /**
   * Update liminal-web.json relationships for a dreamer
   */
  private async updateLiminalWebRelationships(
    dreamerDirPath: string,
    newRelationshipUuid: string
  ): Promise<boolean> {
    const liminalWebPath = path.join(dreamerDirPath, 'liminal-web.json');

    try {
      let liminalWeb: { relationships: string[] } = { relationships: [] };

      try {
        const content = await fs.readFile(liminalWebPath, 'utf-8');
        liminalWeb = JSON.parse(content);
        liminalWeb.relationships = liminalWeb.relationships || [];
      } catch {
        // File doesn't exist, use empty
      }

      if (liminalWeb.relationships.includes(newRelationshipUuid)) {
        return false; // Already exists
      }

      liminalWeb.relationships.push(newRelationshipUuid);
      await fs.writeFile(liminalWebPath, JSON.stringify(liminalWeb, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Discover which peers are seeding DreamNodes
   * Updates liminal-web.json when new peer relationships are found
   */
  async discoverPeerAcceptances(vaultPath: string): Promise<PeerDiscoveryResult> {
    const { nodeDataMap, didToUuidMap } = await this.buildPeerMaps(vaultPath, false);

    let totalDreamNodes = 0;
    let newRelationshipsFound = 0;
    let errors = 0;

    // For each Dream node with Radicle ID, check who's seeding it
    for (const [uuid, data] of nodeDataMap) {
      if (data.type === 'dreamer') continue;
      if (!data.radicleId) continue;

      totalDreamNodes++;

      try {
        const seederDIDs = await this.radicleService.getSeeders(data.dirPath);

        for (const seederDID of seederDIDs) {
          const dreamerUuid = didToUuidMap.get(seederDID);
          if (!dreamerUuid) continue;

          const dreamerData = nodeDataMap.get(dreamerUuid);
          if (!dreamerData) continue;

          // Update liminal-web.json if relationship is new
          const wasAdded = await this.updateLiminalWebRelationships(
            dreamerData.dirPath,
            uuid
          );

          if (wasAdded) {
            newRelationshipsFound++;
          }
        }
      } catch {
        errors++;
      }
    }

    // Build summary
    let summary: string;
    if (totalDreamNodes === 0) {
      summary = 'No Radicle-enabled DreamNodes found to check';
    } else if (newRelationshipsFound === 0 && errors === 0) {
      summary = `✓ Checked ${totalDreamNodes} DreamNodes - all relationships already known`;
    } else {
      const parts: string[] = [];
      if (newRelationshipsFound > 0) {
        parts.push(`🎯 ${newRelationshipsFound} new relationship${newRelationshipsFound > 1 ? 's' : ''} discovered!`);
      }
      if (errors > 0) {
        parts.push(`⚠️ ${errors} error${errors > 1 ? 's' : ''}`);
      }
      summary = parts.join(' ');
    }

    return { totalDreamNodes, newRelationshipsFound, errors, summary };
  }

  /**
   * Sync Radicle peer following with Liminal Web relationships
   * Ensures follow, delegate, scope, and remotes are properly configured
   */
  async syncPeerFollowing(vaultPath: string, passphrase?: string): Promise<PeerSyncResult> {
    this.radPath = await this.findRadPath();

    const { nodeDataMap } = await this.buildPeerMaps(vaultPath, true);

    // Find all Dreamer nodes with DIDs
    const dreamersWithDids: Array<{ uuid: string; did: string; data: PeerNodeData }> = [];
    for (const [uuid, data] of nodeDataMap) {
      if (data.type === 'dreamer' && data.did?.startsWith('did:key:')) {
        dreamersWithDids.push({ uuid, did: data.did, data });
      }
    }

    // Counters
    let totalRelationships = 0;
    let alreadyFollowing = 0;
    let alreadyDelegates = 0;
    let alreadyScopes = 0;
    let newFollows = 0;
    let newDelegates = 0;
    let scopeUpdates = 0;
    let remotesAdded = 0;
    let remotesUpdated = 0;
    let remotesRemoved = 0;
    let remotesUnchanged = 0;
    let errors = 0;

    // Map: DreamNode dirPath -> Map<DreamerName, DreamerDID>
    const desiredRemotesPerRepo = new Map<string, Map<string, string>>();

    // Process all relationships
    const operations = [];

    for (const { did, data: dreamerData } of dreamersWithDids) {
      for (const relatedUuid of dreamerData.relationships) {
        const relatedData = nodeDataMap.get(relatedUuid);
        if (!relatedData) continue;

        operations.push((async () => {
          try {
            const radicleId = await this.radicleService.getRadicleId(relatedData.dirPath, passphrase);
            if (!radicleId) return;

            totalRelationships++;

            // Track desired remotes
            if (!desiredRemotesPerRepo.has(relatedData.dirPath)) {
              desiredRemotesPerRepo.set(relatedData.dirPath, new Map());
            }
            desiredRemotesPerRepo.get(relatedData.dirPath)!.set(dreamerData.dirName, did);

            // Ensure repo is public
            try {
              await this.radicleService.share(relatedData.dirPath, passphrase);
            } catch (publishError: any) {
              const msg = publishError.message || '';
              if (!msg.includes('already public') && !msg.includes('No identity updates')) {
                errors++;
                return;
              }
            }

            // Ensure peer is followed
            const repoFollows = await this.getExistingFollowsForRepo(relatedData.dirPath);
            if (repoFollows.has(did)) {
              alreadyFollowing++;
            } else {
              try {
                await this.radicleService.followPeer(did, passphrase, relatedData.dirPath);
                newFollows++;
              } catch {
                errors++;
                return;
              }
            }

            // Add peer as delegate
            try {
              const wasAdded = await this.radicleService.addDelegate(relatedData.dirPath, did, passphrase);
              if (wasAdded) {
                newDelegates++;
              } else {
                alreadyDelegates++;
              }
            } catch {
              errors++;
            }

            // Set seeding scope to 'all' for private beta simplification
            // Trust model: link-based (only share links with trusted people)
            // FUTURE: Use 'followed' when backpropagation UX is refined
            try {
              const wasSet = await this.radicleService.setSeedingScope(relatedData.dirPath, radicleId, 'all');
              if (wasSet) {
                scopeUpdates++;
              } else {
                alreadyScopes++;
              }
            } catch {
              errors++;
            }
          } catch {
            // Skip silently
          }
        })());
      }
    }

    await Promise.all(operations);

    // Reconcile git remotes
    const reconcileOps = Array.from(desiredRemotesPerRepo.entries()).map(([repoPath, desiredPeers]) =>
      (async () => {
        const repoData = Array.from(nodeDataMap.values()).find(d => d.dirPath === repoPath);
        if (!repoData) return;

        try {
          const radicleId = await this.radicleService.getRadicleId(repoPath, passphrase);
          if (!radicleId) return;

          const result = await this.radicleService.reconcileRemotes(repoPath, radicleId, desiredPeers);
          remotesAdded += result.added;
          remotesUpdated += result.updated;
          remotesRemoved += result.removed;
          remotesUnchanged += result.unchanged;
        } catch {
          errors++;
        }
      })()
    );

    await Promise.all(reconcileOps);

    // BACKGROUND SEEDING: Seed ALL Dream nodes related to ANY Dreamer
    // This ensures nodes are available even when Dreamer has no DID (e.g., historical figures)
    // Seeding is idempotent - safe to run on already-public repos
    const allDreamers = Array.from(nodeDataMap.values()).filter(d => d.type === 'dreamer');
    const dreamerRelatedUuids = new Set<string>();

    for (const dreamer of allDreamers) {
      for (const relatedUuid of dreamer.relationships) {
        const relatedData = nodeDataMap.get(relatedUuid);
        // Only seed Dream nodes (not other Dreamers)
        if (relatedData && relatedData.type === 'dream') {
          dreamerRelatedUuids.add(relatedUuid);
        }
      }
    }

    // Fire-and-forget seeding for all dreamer-related Dream nodes (PARALLEL)
    // Each seedInBackground is already fire-and-forget, so we just need to get Radicle IDs in parallel
    const seedingPromises = Array.from(dreamerRelatedUuids).map(async (uuid) => {
      const data = nodeDataMap.get(uuid);
      if (!data) return false;

      try {
        const radicleId = await this.radicleService.getRadicleId(data.dirPath, passphrase);
        if (radicleId) {
          this.radicleService.seedInBackground(data.dirPath, radicleId);
          return true;
        }
      } catch {
        // Non-critical: continue with other nodes
      }
      return false;
    });

    const seedingResults = await Promise.all(seedingPromises);
    const seedingTriggered = seedingResults.filter(Boolean).length;

    if (seedingTriggered > 0) {
      console.log(`🌐 [PeerSync] Triggered background seeding for ${seedingTriggered} Dream node(s) related to Dreamers`);
    }

    // Build summary
    let summary: string;
    if (totalRelationships === 0) {
      summary = 'No Radicle relationships found';
    } else {
      const updates: string[] = [];
      if (newFollows > 0) updates.push(`${newFollows} follow${newFollows !== 1 ? 's' : ''}`);
      if (newDelegates > 0) updates.push(`${newDelegates} delegate${newDelegates !== 1 ? 's' : ''}`);
      if (remotesAdded > 0) updates.push(`${remotesAdded} remote${remotesAdded !== 1 ? 's' : ''} added`);
      if (remotesUpdated > 0) updates.push(`${remotesUpdated} remote${remotesUpdated !== 1 ? 's' : ''} updated`);
      if (remotesRemoved > 0) updates.push(`${remotesRemoved} remote${remotesRemoved !== 1 ? 's' : ''} removed`);
      if (scopeUpdates > 0) updates.push(`${scopeUpdates} scope update${scopeUpdates !== 1 ? 's' : ''}`);

      const alreadyConfigured = alreadyFollowing + alreadyDelegates + remotesUnchanged + alreadyScopes;

      if (updates.length === 0 && errors === 0) {
        summary = `✓ All ${totalRelationships} peer relationship${totalRelationships > 1 ? 's' : ''} already configured!`;
      } else {
        summary = `Configured: ${updates.join(', ')}` +
                 (alreadyConfigured > 0 ? ` (${alreadyConfigured} already established)` : '') +
                 (errors > 0 ? ` ⚠️ ${errors} error${errors !== 1 ? 's' : ''}` : '');
      }
    }

    return {
      totalRelationships,
      newFollows,
      newDelegates,
      scopeUpdates,
      remotesAdded,
      remotesUpdated,
      remotesRemoved,
      alreadyConfigured: alreadyFollowing + alreadyDelegates + remotesUnchanged + alreadyScopes,
      errors,
      summary
    };
  }
}

// Singleton instance
let peerSyncService: PeerSyncService | null = null;

export function getPeerSyncService(radicleService: RadicleService): PeerSyncService {
  if (!peerSyncService) {
    peerSyncService = new PeerSyncService(radicleService);
  }
  return peerSyncService;
}
