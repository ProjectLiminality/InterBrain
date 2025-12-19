import { Plugin, Notice, Modal, TFile } from 'obsidian';
import { UIService } from '../../core/services/ui-service';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import { githubService } from './services/github-service';
import { serviceManager } from '../../core/services/service-manager';

/**
 * Show confirmation modal before sharing to GitHub
 */
async function confirmRecursiveShare(
  plugin: Plugin,
  nodeName: string,
  submoduleCount: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(plugin.app);
    modal.titleEl.setText('Confirm GitHub Share');

    const content = modal.contentEl;

    if (submoduleCount === 0) {
      content.createEl('p', {
        text: `Share "${nodeName}" as a public GitHub repository?`
      });
    } else {
      content.createEl('p', {
        text: `Sharing "${nodeName}" will publish:`
      });

      const list = content.createEl('ul');
      list.createEl('li', { text: `1 DreamNode: ${nodeName}` });
      list.createEl('li', {
        text: `${submoduleCount} related DreamNode${submoduleCount > 1 ? 's' : ''} (submodules)`
      });

      content.createEl('p', {
        text: 'All will be published as public GitHub repositories.',
        attr: { style: 'margin-top: 16px; font-weight: 500;' }
      });
    }

    const buttonContainer = content.createEl('div', {
      attr: { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;' }
    });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });

    const confirmBtn = buttonContainer.createEl('button', {
      text: 'Share to GitHub',
      cls: 'mod-cta'
    });

    confirmBtn.addEventListener('click', () => {
      modal.close();
      resolve(true);
    });

    modal.open();
  });
}

/**
 * Show confirmation modal before unpublishing from GitHub
 */
async function confirmRecursiveUnpublish(
  plugin: Plugin,
  nodeName: string,
  submoduleCount: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(plugin.app);
    modal.titleEl.setText('Confirm GitHub Unpublish');

    const content = modal.contentEl;

    content.createEl('p', {
      text: '⚠️ This will permanently delete repositories from GitHub.',
      attr: { style: 'color: #ff6b6b; font-weight: 500; margin-bottom: 12px;' }
    });

    if (submoduleCount === 0) {
      content.createEl('p', {
        text: `Unpublish "${nodeName}" from GitHub?`
      });
    } else {
      content.createEl('p', {
        text: `Unpublishing "${nodeName}" will delete:`
      });

      const list = content.createEl('ul');
      list.createEl('li', { text: `1 DreamNode: ${nodeName}` });
      list.createEl('li', {
        text: `${submoduleCount} related DreamNode${submoduleCount > 1 ? 's' : ''} (submodules)`
      });
    }

    content.createEl('p', {
      text: 'This will delete the GitHub repositories and clean local metadata.',
      attr: { style: 'margin-top: 16px; font-size: 12px; opacity: 0.8;' }
    });

    const buttonContainer = content.createEl('div', {
      attr: { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;' }
    });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'mod-cta' });
    cancelBtn.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });

    const confirmBtn = buttonContainer.createEl('button', {
      text: 'Delete from GitHub',
      attr: { style: 'background-color: #ff6b6b;' }
    });

    confirmBtn.addEventListener('click', () => {
      modal.close();
      resolve(true);
    });

    modal.open();
  });
}

/**
 * GitHub commands for public broadcasting via GitHub Pages
 * Philosophy: "Radicle for collaboration, GitHub Pages for publishing"
 */
export function registerGitHubCommands(
  plugin: Plugin,
  uiService: UIService
): void {
  const path = require('path');
  const vaultService = serviceManager.getVaultService();

  // Set plugin directory for GitHubService (needed for viewer bundle path)
  const vaultPath = vaultService?.getVaultPath() || '';
  if (vaultPath) {
    const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', plugin.manifest.id);
    githubService.setPluginDir(pluginDir);
  } else {
    console.warn('[GitHubCommands] Could not determine vault path for plugin directory');
  }

  // Publish DreamNode to GitHub - Creates public repo + GitHub Pages
  plugin.addCommand({
    id: 'publish-dreamnode-github',
    name: 'Publish DreamNode to GitHub',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }

        // Resolve full repo path using VaultService
        const fullRepoPath = vaultService?.getFullPath(selectedNode.repoPath) || selectedNode.repoPath;

        // Check if GitHub CLI is available
        const availabilityCheck = await githubService.isAvailable();

        if (!availabilityCheck.available) {
          uiService.showError(availabilityCheck.error || 'GitHub CLI not available');
          return;
        }

        // Step 1: Sync canvas submodules BEFORE showing confirmation (if DreamSong.canvas exists)
        const canvasPath = `${selectedNode.repoPath}/DreamSong.canvas`;
        const canvasFile = plugin.app.vault.getAbstractFileByPath(canvasPath);

        if (canvasFile instanceof TFile) {
          try {
            const submoduleManager = serviceManager.getSubmoduleManagerService();

            if (submoduleManager) {
              await submoduleManager.syncCanvasSubmodules(canvasPath);
            }
          } catch (syncError) {
            console.error('[GitHubCommands] Submodule sync error:', syncError);
            // Continue with share even if sync fails
          }
        }

        // Step 2: Discover submodules and show confirmation (now with updated submodules)
        const submodules = await githubService.getSubmodules(fullRepoPath);

        const confirmed = await confirmRecursiveShare(
          plugin,
          selectedNode.name,
          submodules.length
        );

        if (!confirmed) {
          return;
        }

        // Show progress indicator
        const notice = new Notice('Sharing DreamNode to GitHub...', 0);

        try {
          // Step 3: Complete share workflow
          const result = await githubService.shareDreamNode(fullRepoPath, selectedNode.id);

          // Update .udd file with GitHub URLs
          const fs = require('fs').promises;
          const uddPath = path.join(fullRepoPath, '.udd');

          try {
            const uddContent = await fs.readFile(uddPath, 'utf-8');
            const udd = JSON.parse(uddContent);

            udd.githubRepoUrl = result.repoUrl;
            if (result.pagesUrl) {
              udd.githubPagesUrl = result.pagesUrl;
            }

            await fs.writeFile(uddPath, JSON.stringify(udd, null, 2));

            // Commit .udd update using child_process directly
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            try {
              await execAsync('git add .udd && git commit -m "Update .udd with GitHub URLs" && git push github main', {
                cwd: fullRepoPath
              });
            } catch (gitError) {
              console.error('[GitHubCommands] Failed to push .udd update:', gitError);
              // Non-critical - repo already created
            }
          } catch (error) {
            console.error('[GitHubCommands] Failed to update .udd file:', error);
          }

          // Update in-memory store to reflect GitHub URLs immediately
          const store = useInterBrainStore.getState();

          // Update selectedNode if it matches the published node
          if (store.selectedNode?.id === selectedNode.id) {
            const updatedNode = {
              ...store.selectedNode,
              githubRepoUrl: result.repoUrl,
              githubPagesUrl: result.pagesUrl || store.selectedNode.githubPagesUrl
            };
            store.setSelectedNode(updatedNode);
          }

          // Update dreamNodes store
          const dreamNodeData = store.dreamNodes.get(selectedNode.id);
          if (dreamNodeData) {
            const updatedNodeData = {
              ...dreamNodeData,
              node: {
                ...dreamNodeData.node,
                githubRepoUrl: result.repoUrl,
                githubPagesUrl: result.pagesUrl || dreamNodeData.node.githubPagesUrl
              }
            };
            store.updateDreamNode(selectedNode.id, updatedNodeData);
          }

          // Copy Obsidian URI to clipboard
          await navigator.clipboard.writeText(result.obsidianUri);

          // Success notification
          notice.hide();
          const successMessage = result.pagesUrl
            ? `DreamNode shared!\n\nRepository: ${result.repoUrl}\nWebsite: ${result.pagesUrl}\n\nObsidian URI copied to clipboard.`
            : `DreamNode shared!\n\nRepository: ${result.repoUrl}\n\nObsidian URI copied to clipboard.`;

          new Notice(successMessage, 10000);

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[GitHubCommands] Share workflow failed:', error);
          uiService.showError(`Failed to share DreamNode: ${errorMessage}`);
        }

      } catch (error) {
        console.error('[GitHubCommands] Unexpected error:', error);
        uiService.showError('An unexpected error occurred');
      }
    }
  });

  // Unpublish DreamNode from GitHub - Deletes repo and cleans metadata
  plugin.addCommand({
    id: 'unpublish-dreamnode-github',
    name: 'Unpublish DreamNode from GitHub Pages',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }

        // Resolve full repo path using VaultService
        const fullRepoPath = vaultService?.getFullPath(selectedNode.repoPath) || selectedNode.repoPath;

        // Check if GitHub CLI is available
        const availabilityCheck = await githubService.isAvailable();

        if (!availabilityCheck.available) {
          uiService.showError(availabilityCheck.error || 'GitHub CLI not available');
          return;
        }

        // Check if DreamNode is published
        const fs = require('fs').promises;
        const uddPath = path.join(fullRepoPath, '.udd');

        let isPublished = false;
        let publishedSubmoduleCount = 0;

        try {
          const uddContent = await fs.readFile(uddPath, 'utf-8');
          const udd = JSON.parse(uddContent);
          isPublished = !!udd.githubRepoUrl;

          // Count published submodules
          const submodules = await githubService.getSubmodules(fullRepoPath);
          for (const submodule of submodules) {
            try {
              const subUddPath = path.join(submodule.path, '.udd');
              const subUddContent = await fs.readFile(subUddPath, 'utf-8');
              const subUdd = JSON.parse(subUddContent);
              if (subUdd.githubRepoUrl) {
                publishedSubmoduleCount++;
              }
            } catch {
              // Submodule doesn't have .udd or isn't published
            }
          }
        } catch (error) {
          console.error('[GitHubCommands] Failed to read .udd file:', error);
        }

        if (!isPublished) {
          uiService.showError('This DreamNode is not published to GitHub');
          return;
        }

        // Show confirmation modal
        const confirmed = await confirmRecursiveUnpublish(
          plugin,
          selectedNode.name,
          publishedSubmoduleCount
        );

        if (!confirmed) {
          return;
        }

        // Show progress indicator
        const notice = new Notice('Unpublishing DreamNode from GitHub...', 0);

        try {
          // Complete unpublish workflow
          const currentVaultPath = vaultService?.getVaultPath() || '';
          await githubService.unpublishDreamNode(fullRepoPath, selectedNode.id, currentVaultPath);

          // Update in-memory store to clear GitHub URLs immediately
          const store = useInterBrainStore.getState();

          // Update selectedNode if it matches the unpublished node
          if (store.selectedNode?.id === selectedNode.id) {
            const updatedNode = {
              ...store.selectedNode,
              githubRepoUrl: undefined,
              githubPagesUrl: undefined
            };
            store.setSelectedNode(updatedNode);
          }

          // Update dreamNodes store
          const dreamNodeData = store.dreamNodes.get(selectedNode.id);
          if (dreamNodeData) {
            const updatedNodeData = {
              ...dreamNodeData,
              node: {
                ...dreamNodeData.node,
                githubRepoUrl: undefined,
                githubPagesUrl: undefined
              }
            };
            store.updateDreamNode(selectedNode.id, updatedNodeData);
          }

          // Success notification
          notice.hide();
          new Notice(`DreamNode unpublished from GitHub successfully!`, 5000);

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[GitHubCommands] Unpublish workflow failed:', error);
          uiService.showError(`Failed to unpublish DreamNode: ${errorMessage}`);
        }

      } catch (error) {
        console.error('[GitHubCommands] Unexpected error:', error);
        uiService.showError('An unexpected error occurred');
      }
    }
  });

  // Update GitHub Pages - Rebuilds static site without touching repo
  plugin.addCommand({
    id: 'update-github-pages',
    name: 'Update GitHub Pages',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }

        // Resolve full repo path using VaultService
        const fullRepoPath = vaultService?.getFullPath(selectedNode.repoPath) || selectedNode.repoPath;

        // Check if DreamNode is published
        const fs = require('fs').promises;
        const uddPath = path.join(fullRepoPath, '.udd');

        let udd;
        try {
          const uddContent = await fs.readFile(uddPath, 'utf-8');
          udd = JSON.parse(uddContent);
        } catch {
          uiService.showError('Could not read DreamNode metadata');
          return;
        }

        if (!udd.githubRepoUrl) {
          uiService.showError('This DreamNode is not published to GitHub. Use "Publish to GitHub" first.');
          return;
        }

        // Check if GitHub CLI is available
        const availabilityCheck = await githubService.isAvailable();

        if (!availabilityCheck.available) {
          uiService.showError(availabilityCheck.error || 'GitHub CLI not available');
          return;
        }

        // Show progress indicator
        const notice = new Notice('Updating GitHub Pages...', 0);

        try {
          // Rebuild the static site and deploy to gh-pages
          await githubService.rebuildGitHubPages(fullRepoPath);

          notice.hide();
          new Notice(`GitHub Pages updated successfully!\n\n${udd.githubPagesUrl || 'Site rebuilding...'}`, 5000);

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[GitHubCommands] Update Pages failed:', error);
          uiService.showError(`Failed to update GitHub Pages: ${errorMessage}`);
        }

      } catch (error) {
        console.error('[GitHubCommands] Unexpected error:', error);
        uiService.showError('An unexpected error occurred');
      }
    }
  });

  // Clone DreamNode from GitHub - Supports Obsidian URI protocol
  plugin.addCommand({
    id: 'clone-dreamnode-github',
    name: 'Clone DreamNode from GitHub',
    callback: async () => {
      try {
        // Prompt for GitHub URL
        const githubUrl = await new Promise<string>((resolve) => {
          const modal = new (require('obsidian').Modal)(plugin.app);
          modal.titleEl.setText('Clone DreamNode from GitHub');

          const inputEl = modal.contentEl.createEl('input', {
            attr: {
              type: 'text',
              placeholder: 'github.com/user/dreamnode-uuid',
              style: 'width: 100%; padding: 8px; margin: 16px 0;'
            }
          });

          const buttonContainer = modal.contentEl.createEl('div', {
            attr: { style: 'display: flex; justify-content: flex-end; gap: 8px;' }
          });

          const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
          cancelBtn.addEventListener('click', () => {
            modal.close();
            resolve('');
          });

          const cloneBtn = buttonContainer.createEl('button', {
            text: 'Clone',
            cls: 'mod-cta'
          });

          cloneBtn.addEventListener('click', () => {
            const url = inputEl.value.trim();
            modal.close();

            // Handle both full URLs and short format
            if (url.startsWith('http')) {
              resolve(url);
            } else if (url.includes('github.com')) {
              resolve(`https://${url}`);
            } else {
              resolve(`https://github.com/${url}`);
            }
          });

          modal.open();
        });

        if (!githubUrl) {
          return; // User cancelled
        }

        // Extract repo name for destination
        const match = githubUrl.match(/github\.com\/[^/]+\/([^/\s]+)/);
        if (!match) {
          uiService.showError('Invalid GitHub URL');
          return;
        }

        const repoName = match[1].replace(/\.git$/, '');
        const destinationPath = vaultService?.getFullPath(repoName) || repoName;

        // Show progress
        const notice = new Notice('Cloning DreamNode from GitHub...', 0);

        try {
          await githubService.clone(githubUrl, destinationPath);

          notice.hide();
          new Notice(`DreamNode cloned successfully!`, 5000);

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[GitHubCommands] Clone failed:', error);
          uiService.showError(`Failed to clone: ${errorMessage}`);
        }

      } catch (error) {
        console.error('[GitHubCommands] Unexpected error:', error);
        uiService.showError('An unexpected error occurred');
      }
    }
  });
}
