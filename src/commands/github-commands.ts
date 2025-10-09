import { Plugin, Notice, Modal } from 'obsidian';
import { UIService } from '../services/ui-service';
import { useInterBrainStore } from '../store/interbrain-store';
import { githubService } from '../features/github-sharing/GitHubService';

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
 * GitHub commands for fallback sharing and public broadcasting
 * Philosophy: "GitHub for sharing, Radicle for collaboration"
 */
export function registerGitHubCommands(
  plugin: Plugin,
  uiService: UIService
): void {

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

        // Discover submodules and show confirmation
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
          // Complete share workflow
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
