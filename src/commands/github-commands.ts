import { Plugin, Notice, Modal, TFile } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { githubService } from '../features/github-sharing/GitHubService';
import { serviceManager } from '../services/service-manager';

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
 * GitHub commands for fallback sharing and public broadcasting
 * Philosophy: "GitHub for sharing, Radicle for collaboration"
 */
export function registerGitHubCommands(
  plugin: Plugin,
  uiService: UIService
): void {
  // Set plugin directory for GitHubService (needed for viewer bundle path)
  const path = require('path');
  const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
  let vaultPath = '';
  if (typeof adapter.path === 'string') {
    vaultPath = adapter.path;
  } else if (typeof adapter.basePath === 'string') {
    vaultPath = adapter.basePath;
  }

  if (vaultPath) {
    const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', plugin.manifest.id);
    githubService.setPluginDir(pluginDir);
  } else {
    console.warn('GitHubCommands: Could not determine vault path for plugin directory');
  }

  // Share DreamNode via GitHub - Creates public repo + GitHub Pages
  plugin.addCommand({
    id: 'share-dreamnode-github',
    name: 'Share DreamNode via GitHub',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          console.log('GitHubCommands: No DreamNode selected for GitHub sharing');
          uiService.showError('Please select a DreamNode first');
          return;
        }

        // Get vault path and resolve full repo path
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        const path = require('path');
        const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);

        console.log(`GitHubCommands: Sharing DreamNode: ${selectedNode.name} at ${fullRepoPath}`);

        // Check if GitHub CLI is available
        const availabilityCheck = await githubService.isAvailable();
        console.log(`GitHubCommands: GitHub CLI availability: ${availabilityCheck.available}`);

        if (!availabilityCheck.available) {
          uiService.showError(availabilityCheck.error || 'GitHub CLI not available');
          return;
        }

        // Step 1: Sync canvas submodules BEFORE showing confirmation (if DreamSong.canvas exists)
        const canvasPath = `${selectedNode.repoPath}/DreamSong.canvas`;
        const canvasFile = plugin.app.vault.getAbstractFileByPath(canvasPath);

        if (canvasFile instanceof TFile) {
          console.log(`GitHubCommands: Syncing canvas submodules before confirmation...`);
          const notice = new Notice('Syncing canvas submodules...', 0);

          try {
            const canvasParser = serviceManager.getCanvasParserService();
            const submoduleManager = serviceManager.getSubmoduleManagerService();

            if (!canvasParser || !submoduleManager) {
              console.warn('GitHubCommands: Canvas parser or submodule manager not available, skipping sync');
            } else {
              const syncResult = await submoduleManager.syncCanvasSubmodules(canvasPath);

              if (syncResult.success) {
                const newImports = syncResult.submodulesImported.filter(r => r.success && !r.alreadyExisted);
                if (newImports.length > 0) {
                  console.log(`GitHubCommands: Synced ${newImports.length} new submodule(s)`);
                } else {
                  console.log(`GitHubCommands: All submodules already synced`);
                }
              } else {
                console.warn(`GitHubCommands: Submodule sync failed: ${syncResult.error}`);
                // Continue with share even if sync fails
              }
            }
          } catch (syncError) {
            console.error('GitHubCommands: Submodule sync error:', syncError);
            // Continue with share even if sync fails
          }

          notice.hide();
        } else {
          console.log(`GitHubCommands: No DreamSong.canvas found, skipping submodule sync`);
        }

        // Step 2: Discover submodules and show confirmation (now with updated submodules)
        const submodules = await githubService.getSubmodules(fullRepoPath);
        console.log(`GitHubCommands: Discovered ${submodules.length} submodule(s)`);

        const confirmed = await confirmRecursiveShare(
          plugin,
          selectedNode.name,
          submodules.length
        );

        if (!confirmed) {
          console.log('GitHubCommands: User cancelled share operation');
          return;
        }

        // Show progress indicator
        const notice = new Notice('Sharing DreamNode to GitHub...', 0);
        console.log(`GitHubCommands: Starting GitHub share workflow for ${selectedNode.name}...`);

        try {
          // Step 3: Complete share workflow
          const result = await githubService.shareDreamNode(fullRepoPath, selectedNode.id);

          console.log(`GitHubCommands: Successfully shared to GitHub:`, result);

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
            console.log(`GitHubCommands: Updated .udd file with GitHub URLs`);

            // Commit .udd update using child_process directly
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            try {
              await execAsync('git add .udd && git commit -m "Update .udd with GitHub URLs" && git push github main', {
                cwd: fullRepoPath
              });
              console.log(`GitHubCommands: Pushed .udd update to GitHub`);
            } catch (gitError) {
              console.error('GitHubCommands: Failed to push .udd update:', gitError);
              // Non-critical - repo already created
            }
          } catch (error) {
            console.error('GitHubCommands: Failed to update .udd file:', error);
          }

          // TODO: Build and deploy static DreamSong site
          // This requires a different approach - cannot run Vite inside Obsidian
          // For now, we'll skip this and implement it in a future iteration
          console.log(`GitHubCommands: Static site building deferred - requires separate build process`);

          // Copy Obsidian URI to clipboard
          await navigator.clipboard.writeText(result.obsidianUri);

          // Success notification
          notice.hide();
          const successMessage = result.pagesUrl
            ? `DreamNode shared!\n\nRepository: ${result.repoUrl}\nWebsite: ${result.pagesUrl}\n\nObsidian URI copied to clipboard.`
            : `DreamNode shared!\n\nRepository: ${result.repoUrl}\n\nObsidian URI copied to clipboard.`;

          new Notice(successMessage, 10000);
          console.log(`GitHubCommands: Share workflow complete`);

          // Reload DreamNode to update UI with GitHub URLs
          console.log(`GitHubCommands: Share complete, node should update with GitHub URLs`);

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`GitHubCommands: Share workflow failed:`, error);
          uiService.showError(`Failed to share DreamNode: ${errorMessage}`);
        }

      } catch (error) {
        console.error('GitHubCommands: Unexpected error:', error);
        uiService.showError('An unexpected error occurred');
      }
    }
  });

  // Unpublish DreamNode from GitHub - Deletes repo and cleans metadata
  plugin.addCommand({
    id: 'unpublish-dreamnode-github',
    name: 'Unpublish DreamNode from GitHub',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          console.log('GitHubCommands: No DreamNode selected for unpublishing');
          uiService.showError('Please select a DreamNode first');
          return;
        }

        // Get vault path and resolve full repo path
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        const path = require('path');
        const fullRepoPath = path.join(vaultPath, selectedNode.repoPath);

        console.log(`GitHubCommands: Unpublishing DreamNode: ${selectedNode.name} at ${fullRepoPath}`);

        // Check if GitHub CLI is available
        const availabilityCheck = await githubService.isAvailable();
        console.log(`GitHubCommands: GitHub CLI availability: ${availabilityCheck.available}`);

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
          console.error('GitHubCommands: Failed to read .udd file:', error);
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
          console.log('GitHubCommands: User cancelled unpublish operation');
          return;
        }

        // Show progress indicator
        const notice = new Notice('Unpublishing DreamNode from GitHub...', 0);
        console.log(`GitHubCommands: Starting GitHub unpublish workflow for ${selectedNode.name}...`);

        try {
          // Complete unpublish workflow
          await githubService.unpublishDreamNode(fullRepoPath, selectedNode.id, vaultPath);

          console.log(`GitHubCommands: Successfully unpublished from GitHub`);

          // Success notification
          notice.hide();
          new Notice(`DreamNode unpublished from GitHub successfully!`, 5000);
          console.log(`GitHubCommands: Unpublish workflow complete`);

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`GitHubCommands: Unpublish workflow failed:`, error);
          uiService.showError(`Failed to unpublish DreamNode: ${errorMessage}`);
        }

      } catch (error) {
        console.error('GitHubCommands: Unexpected error:', error);
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

        // Get vault path
        const adapter = plugin.app.vault.adapter as { path?: string; basePath?: string };
        let vaultPath = '';
        if (typeof adapter.path === 'string') {
          vaultPath = adapter.path;
        } else if (typeof adapter.basePath === 'string') {
          vaultPath = adapter.basePath;
        }

        // Extract repo name for destination
        const match = githubUrl.match(/github\.com\/[^/]+\/([^/\s]+)/);
        if (!match) {
          uiService.showError('Invalid GitHub URL');
          return;
        }

        const repoName = match[1].replace(/\.git$/, '');
        const path = require('path');
        const destinationPath = path.join(vaultPath, repoName);

        // Show progress
        const notice = new Notice('Cloning DreamNode from GitHub...', 0);
        console.log(`GitHubCommands: Cloning from ${githubUrl} to ${destinationPath}`);

        try {
          await githubService.clone(githubUrl, destinationPath);

          notice.hide();
          new Notice(`DreamNode cloned successfully!`, 5000);
          console.log(`GitHubCommands: Clone complete`);

          // Reload DreamNodes to show new clone
          // Note: reloadDreamNodes method may need to be implemented
          console.log(`GitHubCommands: Clone complete, DreamNode should appear after vault scan`);

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`GitHubCommands: Clone failed:`, error);
          uiService.showError(`Failed to clone: ${errorMessage}`);
        }

      } catch (error) {
        console.error('GitHubCommands: Unexpected error:', error);
        uiService.showError('An unexpected error occurred');
      }
    }
  });
}
