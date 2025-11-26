/**
 * DreamNode Migration Commands
 *
 * Command palette commands for migrating DreamNode naming to PascalCase.
 *
 * Available commands:
 * - "Migrate Selected DreamNode to PascalCase": Migrate single selected node
 * - "Migrate All DreamNodes to PascalCase": Batch migrate all nodes in vault
 */

import { Plugin, Notice, Modal } from 'obsidian';
import { DreamNodeMigrationService } from '../services/dreamnode-migration-service';
import { useInterBrainStore } from '../store/interbrain-store';

/**
 * Confirmation modal for migration operations
 */
class MigrationConfirmModal extends Modal {
  private confirmed = false;
  private resolvePromise: (value: boolean) => void = () => {};

  constructor(
    plugin: Plugin,
    private title: string,
    private message: string,
    private isDestructive = false
  ) {
    super(plugin.app);
  }

  async getConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen() {
    const { contentEl, titleEl } = this;

    titleEl.setText(this.title);

    contentEl.createEl('p', {
      text: this.message,
      attr: { style: this.isDestructive ? 'color: #ff6b6b; margin-bottom: 16px;' : 'margin-bottom: 16px;' }
    });

    contentEl.createEl('p', {
      text: 'This will:',
      attr: { style: 'font-weight: 500; margin-bottom: 8px;' }
    });

    const list = contentEl.createEl('ul', { attr: { style: 'margin-bottom: 16px;' } });
    list.createEl('li', { text: 'Rename folder on file system' });
    list.createEl('li', { text: 'Update git submodule paths (if applicable)' });
    list.createEl('li', { text: 'Update parent .gitmodules files (if applicable)' });
    list.createEl('li', { text: 'Rename GitHub repository (if published)' });
    list.createEl('li', { text: 'Update git remote URLs' });

    contentEl.createEl('p', {
      text: '⚠️ Make sure you have no uncommitted changes before proceeding.',
      attr: { style: 'font-size: 12px; opacity: 0.8; margin-bottom: 16px;' }
    });

    const buttonContainer = contentEl.createEl('div', {
      attr: { style: 'display: flex; justify-content: flex-end; gap: 8px;' }
    });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'mod-cta' });
    cancelBtn.addEventListener('click', () => {
      this.confirmed = false;
      this.close();
    });

    const confirmBtn = buttonContainer.createEl('button', {
      text: 'Migrate',
      attr: { style: this.isDestructive ? 'background-color: #ff6b6b;' : '' }
    });
    confirmBtn.addEventListener('click', () => {
      this.confirmed = true;
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.resolvePromise(this.confirmed);
  }
}

/**
 * Results modal showing migration outcome
 */
class MigrationResultsModal extends Modal {
  constructor(
    plugin: Plugin,
    private changes: string[],
    private errors: string[],
    private oldPath: string,
    private newPath: string
  ) {
    super(plugin.app);
  }

  onOpen() {
    const { contentEl, titleEl } = this;

    titleEl.setText(this.errors.length > 0 ? 'Migration Completed with Warnings' : 'Migration Successful');

    if (this.errors.length === 0) {
      contentEl.createEl('p', {
        text: '✅ DreamNode migrated successfully!',
        attr: { style: 'color: #4caf50; font-weight: 500; margin-bottom: 16px;' }
      });
    } else {
      contentEl.createEl('p', {
        text: `⚠️ Migration completed with ${this.errors.length} warning(s)`,
        attr: { style: 'color: #ff9800; font-weight: 500; margin-bottom: 16px;' }
      });
    }

    // Show path change
    contentEl.createEl('h3', { text: 'Path Change', attr: { style: 'margin-top: 16px; margin-bottom: 8px;' } });
    contentEl.createEl('p', {
      text: `Old: ${this.oldPath}`,
      attr: { style: 'font-family: monospace; font-size: 12px; margin: 4px 0;' }
    });
    contentEl.createEl('p', {
      text: `New: ${this.newPath}`,
      attr: { style: 'font-family: monospace; font-size: 12px; margin: 4px 0;' }
    });

    // Show changes
    if (this.changes.length > 0) {
      contentEl.createEl('h3', { text: 'Changes Applied', attr: { style: 'margin-top: 16px; margin-bottom: 8px;' } });
      const changesList = contentEl.createEl('ul', { attr: { style: 'font-size: 12px;' } });
      this.changes.forEach(change => {
        changesList.createEl('li', { text: change });
      });
    }

    // Show errors
    if (this.errors.length > 0) {
      contentEl.createEl('h3', {
        text: 'Warnings',
        attr: { style: 'color: #ff9800; margin-top: 16px; margin-bottom: 8px;' }
      });
      const errorsList = contentEl.createEl('ul', { attr: { style: 'font-size: 12px; color: #ff9800;' } });
      this.errors.forEach(error => {
        errorsList.createEl('li', { text: error });
      });
    }

    // Close button
    const closeBtn = contentEl.createEl('button', {
      text: 'Close',
      cls: 'mod-cta',
      attr: { style: 'margin-top: 16px;' }
    });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Register migration commands with Obsidian
 */
export function registerMigrationCommands(plugin: Plugin) {
  const migrationService = new DreamNodeMigrationService(plugin);

  // Command: Migrate Selected DreamNode
  plugin.addCommand({
    id: 'migrate-selected-dreamnode',
    name: 'Migrate Selected DreamNode to PascalCase',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;

        if (!selectedNode) {
          new Notice('Please select a DreamNode first');
          return;
        }

        console.log(`MigrationCommands: Starting migration for ${selectedNode.name}`);

        // Show confirmation modal
        const confirmed = await new MigrationConfirmModal(
          plugin,
          'Migrate DreamNode to PascalCase',
          `Migrate "${selectedNode.name}" to PascalCase naming?`,
          false
        ).getConfirmation();

        if (!confirmed) {
          console.log('MigrationCommands: User cancelled migration');
          return;
        }

        // Show progress notice
        const notice = new Notice('Migrating DreamNode...', 0);

        try {
          // Perform migration
          const result = await migrationService.migrateSingleNode(selectedNode.id);

          notice.hide();

          // Show results modal
          new MigrationResultsModal(
            plugin,
            result.changes,
            result.errors,
            result.oldPath,
            result.newPath
          ).open();

          if (result.success) {
            console.log('MigrationCommands: Migration successful:', result);
          } else {
            console.error('MigrationCommands: Migration failed:', result);
          }

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('MigrationCommands: Migration error:', error);
          new Notice(`Migration failed: ${errorMessage}`, 5000);
        }

      } catch (error) {
        console.error('MigrationCommands: Unexpected error:', error);
        new Notice('An unexpected error occurred');
      }
    }
  });

  // Command: Audit and Fix Canvas Paths
  plugin.addCommand({
    id: 'audit-canvas-paths',
    name: 'Audit and Fix Canvas Paths',
    callback: async () => {
      try {
        console.log('MigrationCommands: Starting canvas path audit...');

        // Show progress notice
        const notice = new Notice('Auditing canvas file paths...', 0);

        try {
          // Perform audit
          const summary = await migrationService.auditAllCanvasPaths();

          notice.hide();

          // Show summary
          if (summary.errors.length === 0) {
            if (summary.fixed === 0) {
              new Notice(
                `✅ All canvas paths are correct! Scanned ${summary.total} canvas files.`,
                5000
              );
            } else {
              new Notice(
                `✅ Fixed ${summary.pathsUpdated} paths in ${summary.fixed} canvas files! (Scanned ${summary.total} total)`,
                5000
              );
            }
          } else {
            new Notice(
              `⚠️ Fixed ${summary.pathsUpdated} paths, but ${summary.errors.length} errors occurred. Check console for details.`,
              8000
            );
          }

          // Log detailed results
          console.log('MigrationCommands: Canvas audit complete:', summary);
          if (summary.errors.length > 0) {
            console.error('Canvas audit errors:', summary.errors);
          }

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('MigrationCommands: Canvas audit error:', error);
          new Notice(`Canvas audit failed: ${errorMessage}`, 5000);
        }

      } catch (error) {
        console.error('MigrationCommands: Unexpected error:', error);
        new Notice('An unexpected error occurred');
      }
    }
  });

  // Command: Migrate to liminal-web.json
  plugin.addCommand({
    id: 'migrate-to-liminal-web-json',
    name: 'Migrate Relationships to liminal-web.json',
    callback: async () => {
      try {
        console.log('MigrationCommands: Starting liminal-web.json migration...');

        // Show progress notice
        const notice = new Notice('Migrating relationships to liminal-web.json...', 0);

        try {
          // Perform migration
          const summary = await migrationService.migrateToLiminalWebJson();

          notice.hide();

          // Build summary message
          const parts: string[] = [];
          if (summary.filesCreated > 0) {
            parts.push(`created ${summary.filesCreated} files`);
          }
          if (summary.filesUpdated > 0) {
            parts.push(`updated ${summary.filesUpdated} files`);
          }
          if (summary.interbrainRelationshipsAdded > 0) {
            parts.push(`added ${summary.interbrainRelationshipsAdded} InterBrain relationships`);
          }

          // Show summary
          if (summary.errors.length === 0) {
            if (parts.length === 0) {
              new Notice(
                `✅ All ${summary.dreamerNodesProcessed} Dreamer nodes already migrated!`,
                5000
              );
            } else {
              new Notice(
                `✅ Processed ${summary.dreamerNodesProcessed} Dreamer nodes: ${parts.join(', ')}.`,
                5000
              );
            }
          } else {
            new Notice(
              `⚠️ Migration completed with ${summary.errors.length} errors. Check console for details.`,
              8000
            );
          }

          // Log detailed results
          console.log('MigrationCommands: liminal-web.json migration complete:', summary);
          if (summary.errors.length > 0) {
            console.error('Migration errors:', summary.errors);
          }

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('MigrationCommands: Migration error:', error);
          new Notice(`Migration failed: ${errorMessage}`, 5000);
        }

      } catch (error) {
        console.error('MigrationCommands: Unexpected error:', error);
        new Notice('An unexpected error occurred');
      }
    }
  });

  // Command: Migrate All DreamNodes
  plugin.addCommand({
    id: 'migrate-all-dreamnodes',
    name: 'Migrate All DreamNodes to PascalCase',
    callback: async () => {
      try {
        const store = useInterBrainStore.getState();
        const nodeCount = store.realNodes.size;

        if (nodeCount === 0) {
          new Notice('No DreamNodes found in vault');
          return;
        }

        console.log(`MigrationCommands: Starting batch migration for ${nodeCount} nodes`);

        // Show confirmation modal
        const confirmed = await new MigrationConfirmModal(
          plugin,
          'Migrate All DreamNodes',
          `Migrate all ${nodeCount} DreamNodes to PascalCase naming?`,
          true
        ).getConfirmation();

        if (!confirmed) {
          console.log('MigrationCommands: User cancelled batch migration');
          return;
        }

        // Show progress notice
        const notice = new Notice(`Migrating ${nodeCount} DreamNodes...`, 0);

        try {
          // Perform batch migration
          const summary = await migrationService.migrateAllNodes();

          notice.hide();

          // Show summary
          if (summary.failed === 0) {
            new Notice(
              `✅ Successfully migrated all ${summary.succeeded} DreamNodes!`,
              5000
            );
          } else {
            new Notice(
              `⚠️ Migrated ${summary.succeeded} DreamNodes, ${summary.failed} failed. Check console for details.`,
              8000
            );
          }

          // Log detailed results
          console.log('MigrationCommands: Batch migration complete:', summary);
          summary.results.forEach((result, index) => {
            if (result.errors.length > 0) {
              console.error(`Migration ${index + 1} errors:`, result.errors);
            }
          });

        } catch (error) {
          notice.hide();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('MigrationCommands: Batch migration error:', error);
          new Notice(`Batch migration failed: ${errorMessage}`, 5000);
        }

      } catch (error) {
        console.error('MigrationCommands: Unexpected error:', error);
        new Notice('An unexpected error occurred');
      }
    }
  });
}
