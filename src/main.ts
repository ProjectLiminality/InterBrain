import { Plugin } from 'obsidian';
import { UIService } from './services/ui-service';
import { GitService } from './services/git-service';
import { DreamNodeService } from './services/dreamnode-service';
import { VaultService } from './services/vault-service';

export default class InterBrainPlugin extends Plugin {
  // Service instances
  private uiService!: UIService;
  private gitService!: GitService;
  private dreamNodeService!: DreamNodeService;
  private vaultService!: VaultService;

  async onload() {
    console.log('InterBrain plugin loaded!');
    
    // Initialize services
    this.initializeServices();
    
    // Register commands
    this.registerCommands();
    
    // Add ribbon icon
    this.addRibbonIcon('brain-circuit', 'Open DreamSpace', () => {
      this.app.commands.executeCommandById('interbrain:open-dreamspace');
    });
  }

  private initializeServices(): void {
    this.uiService = new UIService();
    this.gitService = new GitService();
    this.dreamNodeService = new DreamNodeService();
    this.vaultService = new VaultService(this.app.vault);
  }

  private registerCommands(): void {
    // Open DreamSpace command
    this.addCommand({
      id: 'open-dreamspace',
      name: 'Open DreamSpace',
      callback: () => {
        console.log('Open DreamSpace command executed');
        this.uiService.showPlaceholder('DreamSpace view coming soon!');
      }
    });

    // Save DreamNode command
    this.addCommand({
      id: 'save-dreamnode',
      name: 'Save DreamNode (commit changes)',
      callback: async () => {
        const loadingNotice = this.uiService.showLoading('Saving DreamNode...');
        try {
          const currentNode = this.dreamNodeService.getCurrentNode();
          if (!currentNode) {
            throw new Error('No DreamNode selected');
          }
          await this.gitService.commitWithAI(currentNode.path);
          this.uiService.showSuccess('DreamNode saved successfully');
        } catch (error: any) {
          this.uiService.showError(error.message);
        } finally {
          loadingNotice.hide();
        }
      }
    });

    // Create DreamNode command
    this.addCommand({
      id: 'create-dreamnode',
      name: 'Create new DreamNode',
      callback: async () => {
        console.log('Create DreamNode command executed');
        this.uiService.showPlaceholder('DreamNode creation UI coming soon!');
      }
    });

    // Weave Dreams command
    this.addCommand({
      id: 'weave-dreams',
      name: 'Weave Dreams into higher-order node',
      callback: async () => {
        const selectedNodes = this.dreamNodeService.getSelectedNodes();
        if (selectedNodes.length < 2) {
          this.uiService.showError('Select at least 2 DreamNodes to weave');
          return;
        }
        console.log('Would weave nodes:', selectedNodes.map(n => n.name));
        this.uiService.showPlaceholder('Dream weaving coming soon!');
      }
    });

    // Toggle DreamNode selection
    this.addCommand({
      id: 'toggle-dreamnode-selection',
      name: 'Toggle DreamNode selection',
      callback: () => {
        console.log('Toggle selection command executed');
        this.uiService.showPlaceholder('Selection UI coming soon!');
      }
    });

    // Share DreamNode command
    this.addCommand({
      id: 'share-dreamnode',
      name: 'Share DreamNode via Coherence Beacon',
      callback: async () => {
        const currentNode = this.dreamNodeService.getCurrentNode();
        if (!currentNode) {
          this.uiService.showError('No DreamNode selected');
          return;
        }
        console.log('Would share node:', currentNode.name);
        this.uiService.showPlaceholder('Coherence Beacon coming soon!');
      }
    });
  }

  onunload() {
    console.log('InterBrain plugin unloaded');
  }
}