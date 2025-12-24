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
  checkSubmoduleUpdatesFromNetwork,
  updateSubmodulesFromStandalone
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
        // Check root repo for updates
        const fetchResult = await gitSyncService.fetchUpdates(selectedNode.repoPath);
        if (fetchResult.hasUpdates) {
          store.setNodeUpdateStatus(selectedNode.id, fetchResult);
        } else {
          store.clearNodeUpdateStatus(selectedNode.id);
        }

        // Check submodules for updates from their standalone repos
        submoduleUpdates = await checkSubmoduleUpdatesFromNetwork(parentPath, vaultPath);

      } catch (error) {
        console.error('[UpdatePreview] Fetch failed:', error);
        fetchNotice.hide();
        uiService.showError('Failed to check for updates');
        return;
      }
      fetchNotice.hide();

      const updateStatus = store.getNodeUpdateStatus(selectedNode.id);

      // Check if EITHER root has updates OR submodules have updates
      const hasRootUpdates = updateStatus && updateStatus.hasUpdates;
      const hasSubmoduleUpdates = submoduleUpdates && submoduleUpdates.length > 0;

      if (!hasRootUpdates && !hasSubmoduleUpdates) {
        uiService.showInfo(`${selectedNode.name} is up to date`);
        return;
      }

      // If only submodules have updates (no root updates), show simple dialog
      if (!hasRootUpdates && hasSubmoduleUpdates) {
        const submoduleList = submoduleUpdates.map(s => `  - ${s.name}: ${s.commitsAhead} commit(s)`).join('\n');
        const confirmed = await uiService.showConfirmDialog(
          'Submodule Updates Available',
          `${selectedNode.name} has no direct updates, but these submodules have updates:\n\n${submoduleList}\n\nUpdate submodules now?`,
          'Update Submodules',
          'Cancel'
        );

        if (confirmed) {
          const updateNotice = uiService.showLoading('Updating submodules...');
          try {
            const result = await updateSubmodulesFromStandalone(parentPath, vaultPath, submoduleUpdates);
            updateNotice.hide();

            if (result.success) {
              uiService.showSuccess(`Updated ${result.updated.length} submodule(s)`);
              // Trigger vault rescan to update UI
              const { serviceManager } = await import('../../core/services/service-manager');
              await serviceManager.scanVault();
            } else {
              uiService.showError(`Updated ${result.updated.length}, failed: ${result.failed.join(', ')}`);
            }
          } catch (error) {
            updateNotice.hide();
            console.error('[UpdatePreview] Submodule update failed:', error);
            uiService.showError('Failed to update submodules');
          }
        }
        return;
      }

      // DreamNode: Cherry-pick workflow with commit selection
      initializeCherryPickWorkflowService(plugin.app);

      // For now, treat all commits as coming from a single "upstream" peer
      // In a full P2P scenario, we'd have multiple peer groups
      const peerGroups = [{
        peerUuid: 'upstream',
        peerName: 'Upstream',
        peerRepoPath: selectedNode.repoPath,
        commits: updateStatus!.commits.map((c: CommitInfo) => ({
          ...c,
          originalHash: c.hash,
          offeredBy: ['upstream'],
          offeredByNames: ['Upstream'],
          cherryPickRef: c.hash
        }))
      }];

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
