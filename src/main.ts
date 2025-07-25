import { Plugin } from 'obsidian';
import { UIService } from './services/ui-service';
import { GitService } from './services/git-service';
import { DreamNodeService } from './services/dreamnode-service';
import { VaultService } from './services/vault-service';
import { GitTemplateService } from './services/git-template-service';
import { serviceManager } from './services/service-manager';
import { DreamspaceView, DREAMSPACE_VIEW_TYPE } from './dreamspace/DreamspaceView';
import { useInterBrainStore } from './store/interbrain-store';
import { DEFAULT_FIBONACCI_CONFIG } from './dreamspace/FibonacciSphereLayout';
import { DreamNode } from './types/dreamnode';

export default class InterBrainPlugin extends Plugin {
  // Service instances
  private uiService!: UIService;
  private gitService!: GitService;
  private dreamNodeService!: DreamNodeService;
  private vaultService!: VaultService;
  private gitTemplateService!: GitTemplateService;

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
    this.gitTemplateService = new GitTemplateService(this.app.vault);
    
    // Initialize service manager with plugin instance
    serviceManager.initialize(this);
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
          await this.gitService.commitWithAI(currentNode.repoPath);
          this.uiService.showSuccess('DreamNode saved successfully');
        } catch (error) {
          this.uiService.showError(error instanceof Error ? error.message : 'Unknown error occurred');
        } finally {
          loadingNotice.hide();
        }
      }
    });

    // Create DreamNode command (no hotkey for now - use command palette)
    this.addCommand({
      id: 'create-dreamnode',
      name: 'Create new DreamNode',
      // hotkeys: [{ modifiers: ['Alt'], key: 'n' }], // Commented out - Obsidian hotkey issues
      callback: async () => {
        console.log('Create DreamNode command executed (via command palette)');
        
        // Check if DreamSpace is open
        const dreamspaceLeaf = this.app.workspace.getLeavesOfType(DREAMSPACE_VIEW_TYPE)[0];
        if (!dreamspaceLeaf) {
          // Open DreamSpace first if not already open
          this.uiService.showError('Please open DreamSpace first');
          await this.app.commands.executeCommandById('interbrain:open-dreamspace');
          return;
        }
        
        // Trigger creation mode in the store
        const store = useInterBrainStore.getState();
        
        // Calculate spawn position (same distance as focused nodes) - negative Z to be in front of camera  
        const spawnPosition: [number, number, number] = [0, 0, -25];
        
        // Start creation mode (using the same method for consistency)
        store.startCreationWithData(spawnPosition);
        
        // Debug logging to verify state
        const newState = useInterBrainStore.getState();
        console.log('Creation mode activated - state:', {
          isCreating: newState.creationState.isCreating,
          protoNode: newState.creationState.protoNode,
          position: spawnPosition
        });
        console.log('Proto-node should appear in DreamSpace');
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

    // Debug: Toggle wireframe sphere
    this.addCommand({
      id: 'toggle-debug-wireframe-sphere',
      name: 'Toggle Debug Wireframe Sphere',
      callback: () => {
        const store = useInterBrainStore.getState();
        const newState = !store.debugWireframeSphere;
        store.setDebugWireframeSphere(newState);
        this.uiService.showSuccess(`Debug wireframe sphere ${newState ? 'enabled' : 'disabled'}`);
      }
    });

    // Debug: Toggle intersection point
    this.addCommand({
      id: 'toggle-debug-intersection-point',
      name: 'Toggle Debug Intersection Point',
      callback: () => {
        const store = useInterBrainStore.getState();
        const newState = !store.debugIntersectionPoint;
        store.setDebugIntersectionPoint(newState);
        this.uiService.showSuccess(`Debug intersection point ${newState ? 'enabled' : 'disabled'}`);
      }
    });

    // Debug: Toggle flying camera controls
    this.addCommand({
      id: 'toggle-debug-flying-controls',
      name: 'Toggle Debug Flying Camera Controls',
      callback: () => {
        const store = useInterBrainStore.getState();
        const newState = !store.debugFlyingControls;
        store.setDebugFlyingControls(newState);
        this.uiService.showSuccess(`Debug flying controls ${newState ? 'enabled' : 'disabled'}`);
      }
    });

    // Toggle between mock and real data mode
    this.addCommand({
      id: 'toggle-data-mode',
      name: 'Toggle Data Mode (Mock ↔ Real)',
      callback: async () => {
        const currentMode = serviceManager.getMode();
        const newMode = currentMode === 'mock' ? 'real' : 'mock';
        
        const loadingNotice = this.uiService.showLoading(`Switching to ${newMode} mode...`);
        try {
          await serviceManager.setMode(newMode);
          this.uiService.showSuccess(`Switched to ${newMode} mode`);
          
          // Trigger UI refresh
          const dreamspaceLeaf = this.app.workspace.getLeavesOfType(DREAMSPACE_VIEW_TYPE)[0];
          if (dreamspaceLeaf && dreamspaceLeaf.view instanceof DreamspaceView) {
            // The view will automatically re-render based on store changes
            console.log(`Data mode switched to ${newMode} - UI should update`);
          }
        } catch (error) {
          this.uiService.showError(error instanceof Error ? error.message : 'Failed to switch mode');
        } finally {
          loadingNotice.hide();
        }
      }
    });

    // Scan vault for DreamNodes (real mode only)
    this.addCommand({
      id: 'scan-vault',
      name: 'Scan Vault for DreamNodes',
      callback: async () => {
        if (serviceManager.getMode() !== 'real') {
          this.uiService.showError('Vault scan only available in real mode');
          return;
        }
        
        const loadingNotice = this.uiService.showLoading('Scanning vault for DreamNodes...');
        try {
          const stats = await serviceManager.scanVault();
          if (stats) {
            this.uiService.showSuccess(
              `Scan complete: ${stats.added} added, ${stats.updated} updated, ${stats.removed} removed`
            );
          }
        } catch (error) {
          this.uiService.showError(error instanceof Error ? error.message : 'Vault scan failed');
        } finally {
          loadingNotice.hide();
        }
      }
    });

    // Reset data store
    this.addCommand({
      id: 'reset-data-store',
      name: 'Reset Data Store',
      callback: () => {
        const mode = serviceManager.getMode();
        const confirmMsg = mode === 'mock' 
          ? 'Reset all mock data?' 
          : 'Clear real data store? (Vault files will remain unchanged)';
        
        if (globalThis.confirm(confirmMsg)) {
          serviceManager.resetData();
          this.uiService.showSuccess(`${mode} data store reset`);
        }
      }
    });

    // Mock data: Cycle through single node, fibonacci-12, fibonacci-50, and fibonacci-100
    this.addCommand({
      id: 'toggle-mock-data',
      name: 'Toggle Mock Data (Single → 12 → 50 → 100)',
      callback: () => {
        const store = useInterBrainStore.getState();
        const currentConfig = store.mockDataConfig;
        let newConfig: 'single-node' | 'fibonacci-12' | 'fibonacci-50' | 'fibonacci-100';
        let displayName: string;
        
        switch (currentConfig) {
          case 'single-node':
            newConfig = 'fibonacci-12';
            displayName = 'Fibonacci 12 Nodes';
            break;
          case 'fibonacci-12':
            newConfig = 'fibonacci-50';
            displayName = 'Fibonacci 50 Nodes';
            break;
          case 'fibonacci-50':
            newConfig = 'fibonacci-100';
            displayName = 'Fibonacci 100 Nodes';
            break;
          case 'fibonacci-100':
          default:
            newConfig = 'single-node';
            displayName = 'Single Node';
            break;
        }
        
        store.setMockDataConfig(newConfig);
        this.uiService.showSuccess(`Mock data: ${displayName}`);
      }
    });

    // Test command: Select mock DreamNode
    this.addCommand({
      id: 'select-mock-dreamnode',
      name: '[TEST] Select Mock DreamNode',
      callback: () => {
        const mockNode: DreamNode = {
          id: 'test-123',
          name: 'Test DreamNode',
          type: 'dream' as const,
          position: [0, 0, 0],
          dreamTalkMedia: [],
          dreamSongContent: [],
          liminalWebConnections: [],
          repoPath: '/test/path',
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

    // Git Template System Commands
    this.addCommand({
      id: 'create-dreamnode-from-template',
      name: 'Create DreamNode from Git Template',
      callback: async () => {
        console.log('Create DreamNode from template command executed');
        this.uiService.showPlaceholder('Git template creation coming soon! Use mock creation for now.');
        
        // TODO: Implement template-based creation workflow
        // 1. Prompt user for title and type
        // 2. Select location in vault for new DreamNode
        // 3. Generate UUID
        // 4. Call gitTemplateService.initializeFromTemplate()
        // 5. Integrate with existing DreamSpace UI
      }
    });

    this.addCommand({
      id: 'validate-dreamnode-template',
      name: 'Validate DreamNode Template',
      callback: async () => {
        console.log('Validate template command executed');
        const loadingNotice = this.uiService.showLoading('Validating DreamNode template...');
        
        try {
          const validation = this.gitTemplateService.validateTemplate();
          if (validation.valid) {
            this.uiService.showSuccess('Template is valid and ready for use');
            console.log('Template validation successful');
          } else {
            this.uiService.showError(`Template validation failed: ${validation.errors.join(', ')}`);
            console.error('Template validation errors:', validation.errors);
          }
        } catch (error) {
          this.uiService.showError(error instanceof Error ? error.message : 'Unknown validation error');
          console.error('Template validation error:', error);
        } finally {
          loadingNotice.hide();
        }
      }
    });

    this.addCommand({
      id: 'check-dreamnode-coherence',
      name: 'Check DreamNode Template Coherence',
      callback: async () => {
        console.log('Check template coherence command executed');
        const loadingNotice = this.uiService.showLoading('Scanning vault for DreamNodes...');
        
        try {
          const results = await this.gitTemplateService.scanVaultCoherence();
          
          if (results.total === 0) {
            this.uiService.showSuccess('No DreamNodes found in vault');
          } else if (results.incoherent.length === 0) {
            this.uiService.showSuccess(`All ${results.total} DreamNodes are coherent with template`);
          } else {
            this.uiService.showError(`Found ${results.incoherent.length} incoherent DreamNodes out of ${results.total} total`);
            console.log('Incoherent DreamNodes:', results.incoherent);
          }
        } catch (error) {
          this.uiService.showError(error instanceof Error ? error.message : 'Coherence check failed');
          console.error('Coherence check error:', error);
        } finally {
          loadingNotice.hide();
        }
      }
    });

    this.addCommand({
      id: 'update-dreamnode-coherence',
      name: 'Update DreamNode Template Coherence',
      callback: async () => {
        console.log('Update template coherence command executed');
        const loadingNotice = this.uiService.showLoading('Updating DreamNode coherence...');
        
        try {
          // First scan for incoherent nodes
          const scanResults = await this.gitTemplateService.scanVaultCoherence();
          
          if (scanResults.incoherent.length === 0) {
            this.uiService.showSuccess('All DreamNodes are already coherent');
            return;
          }
          
          // Note: Actual coherence update would require shell commands
          // For now, just report what would be updated
          this.uiService.showError(
            `Found ${scanResults.incoherent.length} incoherent DreamNodes. ` +
            'Manual update required (git hooks cannot be updated via Obsidian API)'
          );
          
          // Log details for manual fixing
          for (const node of scanResults.incoherent) {
            console.log(`Incoherent DreamNode: ${node.path}`);
            console.log(`  Issues: ${node.issues.join(', ')}`);
          }
          
        } catch (error) {
          this.uiService.showError(error instanceof Error ? error.message : 'Coherence update failed');
          console.error('Coherence update error:', error);
        } finally {
          loadingNotice.hide();
        }
      }
    });
  }

  onunload() {
    console.log('InterBrain plugin unloaded');
  }
}