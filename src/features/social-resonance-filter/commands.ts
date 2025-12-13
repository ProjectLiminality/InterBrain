/**
 * Radicle Commands
 *
 * User-facing commands for peer-to-peer DreamNode sharing.
 * Commands are thin handlers - business logic lives in services.
 */

import { Plugin, Notice } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { serviceManager } from '../../core/services/service-manager';
import { PassphraseManager } from './services/passphrase-manager';
import { getPeerSyncService } from './services/peer-sync-service';
import { UDDService } from '../dreamnode/services/udd-service';
import type { DreamNode } from '../dreamnode';

const path = require('path');
const fs = require('fs').promises;

/**
 * Get vault path from plugin
 */
function getVaultPath(plugin: Plugin): string {
  const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
  if (typeof adapter.path === 'string') return adapter.path;
  if (typeof adapter.basePath === 'string') return adapter.basePath;
  return '';
}

/**
 * Register all Radicle commands
 */
export function registerRadicleCommands(
  plugin: Plugin,
  uiService: UIService,
  passphraseManager: PassphraseManager
): void {

  // Initialize DreamNode with Radicle
  plugin.addCommand({
    id: 'initialize-dreamnode-radicle',
    name: 'Initialize DreamNode with Radicle',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      const vaultPath = getVaultPath(plugin);
      const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);
      const radicleService = serviceManager.getRadicleService();

      // Check Radicle availability
      if (!await radicleService.isAvailable()) {
        uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
        return;
      }

      try {
        // Check if already initialized
        const udd = await UDDService.readUDD(fullRepoPath);
        if (udd.radicleId) {
          uiService.showSuccess(`${selectedNode.name} already ready for peer-to-peer sharing!`);
          return;
        }

        // Check if repo has Radicle ID but UDD doesn't
        const radicleIdFromRepo = await radicleService.getRadicleId(fullRepoPath);
        if (radicleIdFromRepo) {
          udd.radicleId = radicleIdFromRepo;
          await UDDService.writeUDD(fullRepoPath, udd);
          uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
          return;
        }

        // Initialize with Radicle
        const passphrase = await passphraseManager.getPassphrase();
        if (passphrase === null) return;

        const notice = new Notice('Initializing Radicle for DreamNode...', 0);

        try {
          await radicleService.init(
            fullRepoPath,
            selectedNode.repoPath,
            `DreamNode: ${selectedNode.name}`,
            passphrase || undefined
          );

          const radicleId = await radicleService.getRadicleId(fullRepoPath, passphrase || undefined);
          if (radicleId) {
            udd.radicleId = radicleId;
            await UDDService.writeUDD(fullRepoPath, udd);
          }

          notice.hide();
          uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
        } catch (error: any) {
          notice.hide();

          // Handle "already exists in storage" case
          if (error.message?.startsWith('RADICLE_STORAGE_EXISTS:')) {
            const radicleId = error.message.replace('RADICLE_STORAGE_EXISTS:', '');
            udd.radicleId = radicleId;
            await UDDService.writeUDD(fullRepoPath, udd);
            uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
            return;
          }

          // Handle "already initialized" case
          if (error.message?.includes('already initialized') || error.message?.includes('reinitialize')) {
            const radicleId = await radicleService.getRadicleId(fullRepoPath, passphrase || undefined);
            if (radicleId) {
              udd.radicleId = radicleId;
              await UDDService.writeUDD(fullRepoPath, udd);
            }
            uiService.showSuccess(`${selectedNode.name} ready for peer-to-peer sharing!`);
            return;
          }

          uiService.showError(`Failed to initialize: ${error.message || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('[RadicleCommands] Initialize failed:', error);
        uiService.showError('Failed to initialize DreamNode with Radicle');
      }
    }
  });

  // Share DreamNode
  plugin.addCommand({
    id: 'share-dreamnode',
    name: 'Share DreamNode',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      const vaultPath = getVaultPath(plugin);
      const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);
      const radicleService = serviceManager.getRadicleService();

      if (!await radicleService.isAvailable()) {
        uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
        return;
      }

      // Check for changes
      if (!await radicleService.hasChangesToShare(fullRepoPath)) {
        uiService.showInfo('Nothing new to share');
        return;
      }

      const passphrase = await passphraseManager.getPassphrase();
      if (passphrase === null) return;

      const notice = new Notice('Sharing to Radicle network...', 0);

      try {
        await radicleService.share(fullRepoPath, passphrase || undefined);

        // Update UDD with Radicle ID
        const radicleId = await radicleService.getRadicleId(fullRepoPath, passphrase || undefined);
        if (radicleId) {
          const udd = await UDDService.readUDD(fullRepoPath);
          udd.radicleId = radicleId;
          await UDDService.writeUDD(fullRepoPath, udd);
        }

        notice.hide();
        uiService.showSuccess(`${selectedNode.name} shared successfully!`);
      } catch (error: any) {
        notice.hide();
        console.error('[RadicleCommands] Share failed:', error);
        uiService.showError(`Failed to share: ${error.message || 'Unknown error'}`);
      }
    }
  });

  // Clone DreamNode from Radicle Network
  plugin.addCommand({
    id: 'clone-from-radicle',
    name: 'Clone DreamNode from Radicle Network',
    callback: async () => {
      const radicleService = serviceManager.getRadicleService();

      if (!await radicleService.isAvailable()) {
        uiService.showError('Radicle CLI not available. Please install Radicle: https://radicle.xyz');
        return;
      }

      // Prompt for Radicle ID
      const radicleId = await uiService.promptForText(
        'Enter Radicle ID to clone',
        'rad:z42hL2jL4XNk6K8oHQaSWfMgCL7ji'
      );

      if (!radicleId?.trim()) return;

      const vaultPath = getVaultPath(plugin);
      if (!vaultPath) {
        uiService.showError('Could not determine vault path');
        return;
      }

      const passphrase = await passphraseManager.getPassphrase();
      if (passphrase === null) return;

      const notice = new Notice('Cloning from Radicle network...', 0);

      try {
        const { repoName } = await radicleService.clone(radicleId.trim(), vaultPath, passphrase || undefined);
        notice.hide();
        uiService.showSuccess(`${repoName} cloned successfully!`);

        // Load and add to store
        const repoPath = path.join(vaultPath, repoName);

        try {
          const udd = await UDDService.readUDD(repoPath);

          // Ensure Radicle ID is in UDD
          if (!udd.radicleId) {
            udd.radicleId = radicleId.trim();
            await UDDService.writeUDD(repoPath, udd);
          }

          // Load dreamTalk media if present
          let dreamTalkMedia: DreamNode['dreamTalkMedia'] = [];
          if (udd.dreamTalk) {
            const mediaPath = path.join(repoPath, udd.dreamTalk);
            try {
              const stats = await fs.stat(mediaPath);
              const buffer = await fs.readFile(mediaPath);
              const base64 = buffer.toString('base64');
              const ext = udd.dreamTalk.toLowerCase();
              const mimeType = ext.endsWith('.png') ? 'image/png' :
                             ext.endsWith('.jpg') || ext.endsWith('.jpeg') ? 'image/jpeg' :
                             ext.endsWith('.gif') ? 'image/gif' :
                             ext.endsWith('.mp4') ? 'video/mp4' :
                             ext.endsWith('.webm') ? 'video/webm' :
                             ext.endsWith('.mp3') ? 'audio/mpeg' :
                             ext.endsWith('.wav') ? 'audio/wav' :
                             'application/octet-stream';

              dreamTalkMedia = [{
                path: udd.dreamTalk,
                absolutePath: mediaPath,
                type: mimeType,
                data: `data:${mimeType};base64,${base64}`,
                size: stats.size
              }];
            } catch {
              // Media loading failed, continue without it
            }
          }

          // Create DreamNode and add to store
          const clonedNode: DreamNode = {
            id: udd.uuid,
            name: udd.title || repoName,
            type: udd.type || 'dream',
            repoPath: repoName,
            dreamTalkMedia,
            dreamSongContent: [],
            liminalWebConnections: [],
            position: [0, 0, -5000],
            hasUnsavedChanges: false,
            email: udd.email,
            phone: udd.phone,
            radicleId: udd.radicleId
          };

          const store = useInterBrainStore.getState();
          const currentNodes = new Map(store.dreamNodes);
          currentNodes.set(clonedNode.id, { node: clonedNode, lastSynced: Date.now() });
          store.setDreamNodes(currentNodes);

          uiService.showInfo(`"${clonedNode.name}" is now visible in DreamSpace`);
        } catch (error) {
          console.error('[RadicleCommands] Failed to load cloned node:', error);
          uiService.showError('Cloned successfully but failed to load. Try "Scan DreamVault for Notes"');
        }
      } catch (error: any) {
        notice.hide();
        console.error('[RadicleCommands] Clone failed:', error);
        uiService.showError(`Failed to clone: ${error.message || 'Unknown error'}`);
      }
    }
  });

  // Discover Peer Acceptances
  plugin.addCommand({
    id: 'discover-peer-acceptances',
    name: 'Discover Peer Acceptances from Radicle Network',
    callback: async () => {
      const radicleService = serviceManager.getRadicleService();

      if (!await radicleService.isAvailable()) {
        new Notice('Radicle CLI not installed or not in PATH');
        return;
      }

      new Notice('Discovering peer acceptances...');

      try {
        const vaultPath = getVaultPath(plugin);
        const peerSyncService = getPeerSyncService(radicleService);
        const result = await peerSyncService.discoverPeerAcceptances(vaultPath);
        new Notice(result.summary);
      } catch (error) {
        console.error('[RadicleCommands] Peer discovery failed:', error);
        new Notice(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  });

  // Sync Radicle Peer Following
  plugin.addCommand({
    id: 'sync-radicle-peer-following',
    name: 'Sync Radicle Peer Following',
    callback: async () => {
      const radicleService = serviceManager.getRadicleService();

      if (!await radicleService.isAvailable()) {
        new Notice('Radicle CLI not installed or not in PATH');
        return;
      }

      const passphrase = await passphraseManager.getPassphrase();
      if (passphrase === null) return;

      new Notice('Starting Radicle peer following sync...');

      try {
        const vaultPath = getVaultPath(plugin);
        const peerSyncService = getPeerSyncService(radicleService);
        const result = await peerSyncService.syncPeerFollowing(vaultPath, passphrase || undefined);
        new Notice(result.summary);
      } catch (error) {
        console.error('[RadicleCommands] Peer sync failed:', error);
        new Notice(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  });

  // Push current DreamNode to network (Intelligent: Radicle → GitHub → Other)
  plugin.addCommand({
    id: 'push-to-network',
    name: 'Push Current DreamNode to Network',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        new Notice('No DreamNode selected');
        return;
      }

      new Notice(`Detecting available remote for ${selectedNode.name}...`);

      try {
        const { GitSyncService } = await import('./services/git-sync-service');
        const gitSyncService = new GitSyncService(plugin.app);

        // Get Radicle passphrase from settings for automatic node start
        const passphrase = await passphraseManager.getPassphrase();
        if (passphrase === null) return;

        const result = await gitSyncService.pushToAvailableRemote(selectedNode.repoPath, passphrase || undefined);

        // Show success with remote type
        const remoteTypeLabel =
          result.type === 'dual' ? 'Radicle + GitHub' :
          result.type === 'radicle' ? 'Radicle' :
          result.type === 'github' ? 'GitHub' :
          'remote';
        new Notice(`Pushed ${selectedNode.name} to ${remoteTypeLabel}!`);
      } catch (error) {
        console.error('[RadicleCommands] Push failed:', error);
        new Notice(`Failed to push: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  });
}
