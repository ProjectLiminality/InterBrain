/**
 * Peer Sync Service
 *
 * Handles peer discovery and synchronization operations:
 * - Discover which peers are seeding DreamNodes (Radicle → Liminal Web)
 * - Sync Radicle follow/delegate relationships with Liminal Web
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

import type { RadicleService } from './radicle-service';
import {
  scanVaultForDreamNodes,
  updateLiminalWebRelationships,
  type UDDData
} from '../utils/vault-scanner';

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
   * Discover which peers are seeding DreamNodes
   * Updates liminal-web.json when new peer relationships are found
   */
  async discoverPeerAcceptances(vaultPath: string): Promise<PeerDiscoveryResult> {
    const { uddDataMap, didToUuidMap } = await scanVaultForDreamNodes(vaultPath, false);

    let totalDreamNodes = 0;
    let newRelationshipsFound = 0;
    let errors = 0;

    // For each Dream node with Radicle ID, check who's seeding it
    for (const [uuid, data] of uddDataMap) {
      if (data.type === 'dreamer') continue;
      if (!data.radicleId) continue;

      totalDreamNodes++;

      try {
        const seederDIDs = await this.radicleService.getSeeders(data.dirPath);

        for (const seederDID of seederDIDs) {
          const dreamerUuid = didToUuidMap.get(seederDID);
          if (!dreamerUuid) continue;

          const dreamerData = uddDataMap.get(dreamerUuid);
          if (!dreamerData) continue;

          // Update liminal-web.json if relationship is new
          const wasAdded = await updateLiminalWebRelationships(
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

    const { uddDataMap } = await scanVaultForDreamNodes(vaultPath, true);

    // Find all Dreamer nodes with DIDs
    const dreamersWithDids: Array<{ uuid: string; did: string; data: UDDData }> = [];
    for (const [uuid, data] of uddDataMap) {
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
        const relatedData = uddDataMap.get(relatedUuid);
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

            // Set seeding scope
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
        const repoData = Array.from(uddDataMap.values()).find(d => d.dirPath === repoPath);
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
