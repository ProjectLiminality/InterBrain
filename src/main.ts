import { Plugin } from 'obsidian';
import { UIService } from './services/ui-service';
import { GitService } from './services/git-service';
import { DreamNodeService } from './services/dreamnode-service';
import { VaultService } from './services/vault-service';
import { DreamspaceView, DREAMSPACE_VIEW_TYPE } from './dreamspace/DreamspaceView';
import { useInterBrainStore } from './store/interbrain-store';
import { DEFAULT_FIBONACCI_CONFIG } from './dreamspace/FibonacciSphereLayout';

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
    
    // Register view types
    this.registerView(DREAMSPACE_VIEW_TYPE, (leaf) => new DreamspaceView(leaf));
    
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
      callback: async () => {
        console.log('Open DreamSpace command executed');
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
          type: DREAMSPACE_VIEW_TYPE,
          active: true
        });
        this.app.workspace.revealLeaf(leaf);
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
        } catch (error) {
          this.uiService.showError(error instanceof Error ? error.message : 'Unknown error occurred');
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

    // Test command: Select mock DreamNode
    this.addCommand({
      id: 'select-mock-dreamnode',
      name: '[TEST] Select Mock DreamNode',
      callback: () => {
        const mockNode = {
          id: 'test-123',
          name: 'Test DreamNode',
          type: 'dream' as const,
          path: '/test/path',
          hasUnsavedChanges: false
        };
        this.dreamNodeService.setCurrentNode(mockNode);
        this.uiService.showSuccess(`Selected: ${mockNode.name}`);
        console.log('Mock node selected - Zustand state should be updated');
      }
    });

    // Test command: Clear selection
    this.addCommand({
      id: 'clear-dreamnode-selection',
      name: '[TEST] Clear DreamNode Selection',
      callback: () => {
        this.dreamNodeService.setCurrentNode(null);
        this.uiService.showSuccess('Selection cleared');
        console.log('Selection cleared - Zustand state should be null');
      }
    });

    // Layout command: Switch to constellation view
    this.addCommand({
      id: 'layout-constellation',
      name: 'Switch to Constellation View',
      callback: () => {
        this.dreamNodeService.setLayout('constellation');
        this.uiService.showSuccess('Switched to constellation view');
        console.log('Layout switched to constellation');
      }
    });

    // Layout command: Switch to search view
    this.addCommand({
      id: 'layout-search',
      name: 'Switch to Search View',
      callback: () => {
        this.dreamNodeService.setLayout('search');
        this.uiService.showSuccess('Switched to search view');
        console.log('Layout switched to search');
      }
    });

    // Layout command: Switch to focused view
    this.addCommand({
      id: 'layout-focused',
      name: 'Switch to Focused View',
      callback: () => {
        const currentNode = this.dreamNodeService.getCurrentNode();
        if (!currentNode) {
          this.uiService.showError('No DreamNode selected - select a node first');
          return;
        }
        this.dreamNodeService.setLayout('focused');
        this.uiService.showSuccess(`Focused on: ${currentNode.name}`);
        console.log('Layout switched to focused on:', currentNode.name);
      }
    });

    // Camera command: Reset camera position
    this.addCommand({
      id: 'camera-reset',
      name: 'Reset Camera Position',
      callback: () => {
        this.dreamNodeService.resetCamera();
        this.uiService.showSuccess('Camera position reset');
        console.log('Camera reset to default position');
      }
    });

    // Fibonacci sphere layout commands
    this.addCommand({
      id: 'fibonacci-expand-sphere',
      name: 'Expand Fibonacci Sphere',
      callback: () => {
        const store = useInterBrainStore.getState();
        const currentRadius = store.fibonacciConfig.radius;
        const newRadius = Math.min(currentRadius * 1.5, 5000); // Max radius of 5000
        store.setFibonacciConfig({ radius: newRadius });
        this.uiService.showSuccess(`Sphere expanded to radius ${Math.round(newRadius)}`);
        console.log('Fibonacci sphere radius increased to:', newRadius);
      }
    });

    this.addCommand({
      id: 'fibonacci-contract-sphere',
      name: 'Contract Fibonacci Sphere',
      callback: () => {
        const store = useInterBrainStore.getState();
        const currentRadius = store.fibonacciConfig.radius;
        const newRadius = Math.max(currentRadius / 1.5, 200); // Min radius of 200
        store.setFibonacciConfig({ radius: newRadius });
        this.uiService.showSuccess(`Sphere contracted to radius ${Math.round(newRadius)}`);
        console.log('Fibonacci sphere radius decreased to:', newRadius);
      }
    });

    this.addCommand({
      id: 'fibonacci-reset-config',
      name: 'Reset Fibonacci Sphere to Default',
      callback: () => {
        const store = useInterBrainStore.getState();
        store.resetFibonacciConfig();
        this.uiService.showSuccess('Fibonacci sphere reset to default configuration');
        console.log('Fibonacci sphere configuration reset to default:', DEFAULT_FIBONACCI_CONFIG);
      }
    });

    this.addCommand({
      id: 'fibonacci-increase-nodes',
      name: 'Increase Node Count',
      callback: () => {
        const store = useInterBrainStore.getState();
        const currentCount = store.fibonacciConfig.nodeCount;
        const newCount = Math.min(currentCount + 6, 100); // Max 100 nodes
        store.setFibonacciConfig({ nodeCount: newCount });
        this.uiService.showSuccess(`Node count increased to ${newCount}`);
        console.log('Fibonacci sphere node count increased to:', newCount);
      }
    });

    this.addCommand({
      id: 'fibonacci-decrease-nodes',
      name: 'Decrease Node Count',
      callback: () => {
        const store = useInterBrainStore.getState();
        const currentCount = store.fibonacciConfig.nodeCount;
        const newCount = Math.max(currentCount - 6, 6); // Min 6 nodes
        store.setFibonacciConfig({ nodeCount: newCount });
        this.uiService.showSuccess(`Node count decreased to ${newCount}`);
        console.log('Fibonacci sphere node count decreased to:', newCount);
      }
    });
  }

  onunload() {
    console.log('InterBrain plugin unloaded');
  }
}