/**
 * Update Management Commands
 *
 * User-facing commands for checking, previewing, and applying updates to DreamNodes.
 * This is the UI/UX layer - actual sync logic lives in social-resonance-filter.
 */

import { Plugin } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { GitSyncService, type CommitInfo } from '../social-resonance-filter/services/git-sync-service';
import {
  type SubmoduleUpdate,
  checkSubmoduleUpdatesFromNetwork
} from '../social-resonance-filter/utils/submodule-sync';
import { GitOperationsService } from '../dreamnode/utils/git-operations';
import { InterBrainUpdateModal } from './ui/interbrain-update-modal';
import { CherryPickPreviewModal, CherryPickPreviewConfig } from './ui/cherry-pick-preview-modal';
import { initializeCherryPickWorkflowService } from './services/cherry-pick-workflow-service';

const path = require('path');

// InterBrain's fixed UUID for routing decisions
const INTERBRAIN_UUID = '550e8400-e29b-41d4-a716-446655440000';

export function registerUpdateCommands(plugin: Plugin, uiService: UIService): void {
  const gitSyncService = new GitSyncService(plugin.app);
  const gitOpsService = new GitOperationsService(plugin.app);

  // Check for updates on selected DreamNode
  plugin.addCommand({
    id: 'check-for-updates',
    name: 'Check for Updates',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      const loadingNotice = uiService.showLoading(`Checking ${selectedNode.name} for updates...`);
      try {
        const result = await gitSyncService.fetchUpdates(selectedNode.repoPath);

        if (result.hasUpdates) {
          store.setNodeUpdateStatus(selectedNode.id, result);
          uiService.showSuccess(`Found ${result.commits.length} update(s) for ${selectedNode.name}`);
        } else {
          store.clearNodeUpdateStatus(selectedNode.id);
          uiService.showSuccess(`${selectedNode.name} is up to date`);
        }
      } catch (error) {
        console.error('Update check failed:', error);
        uiService.showError('Failed to check for updates');
      } finally {
        loadingNotice.hide();
      }
    }
  });

  // Preview updates for selected DreamNode
  plugin.addCommand({
    id: 'preview-updates',
    name: 'Preview Updates for Selected DreamNode',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      // Always fetch first to ensure we have latest update status (root + submodules)
      const fetchNotice = uiService.showLoading('Checking for updates...');
      let submoduleUpdates: SubmoduleUpdate[] = [];

      // Get vault path for submodule checking
      const adapter = (window as any).app.vault.adapter;
      const vaultPath = adapter.basePath || '';
      const parentPath = path.join(vaultPath, selectedNode.repoPath);

      try {
        // Fetch from all peer remotes so the modal can show whatever lives
        // there — both pending commits and ones the user has previously
        // accepted/rejected (filtered out by getPendingCommits but visible
        // in the modal's "already processed" tab).
        const fetchResult = await gitSyncService.fetchUpdates(selectedNode.repoPath);
        if (fetchResult.hasUpdates) {
          store.setNodeUpdateStatus(selectedNode.id, fetchResult);
        } else {
          store.clearNodeUpdateStatus(selectedNode.id);
        }

        // Best-effort submodule fetch — doesn't gate modal opening either.
        submoduleUpdates = await checkSubmoduleUpdatesFromNetwork(parentPath, vaultPath);
      } catch (error) {
        // Fetch failures are non-fatal: the modal still opens and shows
        // whatever was reachable. Surface the error inline rather than
        // aborting the whole flow.
        console.warn('[UpdatePreview] Fetch had issues (continuing):', error);
      }
      fetchNotice.hide();
      // Silence "unused variable" — kept for the existing telemetry trail
      // until the unified scanner replaces this command.
      void submoduleUpdates;

      // Cherry-pick workflow with commit selection. Always open the modal
      // — when there's nothing to do it still surfaces previously accepted
      // / rejected commits so the user can revisit them.
      initializeCherryPickWorkflowService(plugin.app);

      // Get peer remotes from the repo
      const { getCherryPickWorkflowService } = await import('./services/cherry-pick-workflow-service');
      const workflowService = getCherryPickWorkflowService();

      // Build peer list from git remotes — a peer is a GitHub remote owned
      // by someone who isn't me (#409 invariant 2; legacy github/rad
      // remotes are not peers).
      const fullPath = path.join(vaultPath, selectedNode.repoPath);
      let peers: Array<{ uuid: string; name: string; repoPath: string }> = [];

      try {
        const { listPeerRemotes } = await import('../social-resonance-filter/services/peer-remotes');
        const remotes = await listPeerRemotes(fullPath);

        peers = remotes.map((remote: string) => ({
          uuid: remote,
          name: remote,
          repoPath: selectedNode.repoPath // Use DreamNode path for memory storage
        }));
      } catch {
        // Fallback to upstream peer
        peers = [{
          uuid: 'upstream',
          name: 'Upstream',
          repoPath: selectedNode.repoPath
        }];
      }

      // Use getPendingCommits to filter out already accepted/rejected commits.
      // Even when this returns no pending groups we still open the modal —
      // it exposes the rejected commits tab so the user can undo a past
      // rejection if they change their mind.
      const peerGroups = await workflowService.getPendingCommits(
        selectedNode.repoPath,
        selectedNode.id,
        peers
      );

      const config: CherryPickPreviewConfig = {
        dreamNodePath: selectedNode.repoPath,
        dreamNodeUuid: selectedNode.id,
        dreamNodeName: selectedNode.name,
        peerGroups,
        onAccept: async (acceptedCommits, _peerRepoPath) => {
          uiService.showSuccess(`Accepted ${acceptedCommits.length} commit(s)`);
          // Trigger vault rescan
          const { serviceManager } = await import('../../core/services/service-manager');
          await serviceManager.scanVault();
        },
        onReject: async (rejectedCommits, _peerRepoPath) => {
          uiService.showInfo(`Rejected ${rejectedCommits.length} commit(s)`);
        },
        onCancel: () => {
          uiService.showInfo('Update cancelled');
        }
      };

      const modal = new CherryPickPreviewModal(plugin.app, config);
      modal.open();
    }
  });

  // Apply updates to selected DreamNode (direct apply without preview)
  plugin.addCommand({
    id: 'apply-updates',
    name: 'Apply Updates to Selected DreamNode',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      if (!selectedNode) {
        uiService.showError('Please select a DreamNode first');
        return;
      }

      const updateStatus = store.getNodeUpdateStatus(selectedNode.id);
      if (!updateStatus || !updateStatus.hasUpdates) {
        uiService.showInfo(`${selectedNode.name} is up to date`);
        return;
      }

      // Confirm with user
      const confirmed = await uiService.promptForText(
        `Apply ${updateStatus.commits.length} update${updateStatus.commits.length > 1 ? 's' : ''} to ${selectedNode.name}?`,
        `Type "update" to confirm`
      );

      if (confirmed !== 'update') {
        uiService.showInfo('Update cancelled');
        return;
      }

      const loadingNotice = uiService.showLoading(`Updating ${selectedNode.name}...`);
      try {
        // Pull updates
        await gitSyncService.pullUpdates(selectedNode.repoPath);

        // If it's the InterBrain node, run build and reload
        if (selectedNode.id === INTERBRAIN_UUID) {
          const buildNotice = uiService.showLoading('Building InterBrain...');
          try {
            await gitOpsService.buildDreamNode(selectedNode.repoPath);
            buildNotice.hide();

            // Auto-reload plugin
            const reloadNotice = uiService.showLoading('Reloading plugin...');
            const plugins = (plugin.app as any).plugins;
            await plugins.disablePlugin('interbrain');
            await plugins.enablePlugin('interbrain');
            reloadNotice.hide();

            uiService.showSuccess('InterBrain updated and reloaded!');
          } catch (buildError) {
            buildNotice.hide();
            throw buildError;
          }
        } else {
          uiService.showSuccess(`Successfully updated ${selectedNode.name}!`);
        }

        // Clear update status
        store.clearNodeUpdateStatus(selectedNode.id);
      } catch (error) {
        console.error('Failed to apply updates:', error);
        uiService.showError(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        loadingNotice.hide();
      }
    }
  });

  // Check for InterBrain updates (dedicated command for InterBrain node)
  plugin.addCommand({
    id: 'check-interbrain-updates',
    name: 'Check for InterBrain Updates',
    callback: async () => {
      const store = useInterBrainStore.getState();
      const selectedNode = store.selectedNode;

      // Verify it's the InterBrain node
      if (!selectedNode || selectedNode.id !== INTERBRAIN_UUID) {
        uiService.showError('This command is only for the InterBrain node');
        return;
      }

      const fetchNotice = uiService.showLoading('Checking for InterBrain updates...');

      try {
        // Check for updates from GitHub
        const fetchResult = await gitSyncService.fetchUpdates(selectedNode.repoPath);

        fetchNotice.hide();

        if (!fetchResult.hasUpdates) {
          uiService.showInfo('InterBrain is up to date');
          return;
        }

        store.setNodeUpdateStatus(selectedNode.id, fetchResult);

        // Open the InterBrain update modal
        const modal = new InterBrainUpdateModal(
          plugin.app,
          fetchResult,
          // onAccept: Pull, build, reload
          async () => {
            const applyNotice = uiService.showLoading('Updating InterBrain...');
            try {
              const commitHashes = fetchResult.commits.map((c: CommitInfo) => c.hash);
              await gitSyncService.pullUpdates(selectedNode.repoPath, commitHashes);
              applyNotice.hide();

              const buildNotice = uiService.showLoading('Building InterBrain...');
              await gitOpsService.buildDreamNode(selectedNode.repoPath);
              buildNotice.hide();

              const reloadNotice = uiService.showLoading('Reloading plugin...');
              const plugins = (plugin.app as any).plugins;
              await plugins.disablePlugin('interbrain');
              await plugins.enablePlugin('interbrain');
              reloadNotice.hide();

              uiService.showSuccess('InterBrain updated and reloaded!');
              store.clearNodeUpdateStatus(selectedNode.id);
            } catch (error) {
              console.error('[InterBrainUpdate] Failed:', error);
              uiService.showError(`Update failed: ${error instanceof Error ? error.message : 'Unknown'}`);
            }
          },
          // onReject
          () => {
            uiService.showInfo('Update cancelled');
          }
        );
        modal.open();

      } catch (error) {
        fetchNotice.hide();
        console.error('[InterBrainUpdate] Fetch failed:', error);
        uiService.showError('Failed to check for updates');
      }
    }
  });
}
