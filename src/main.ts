import { Plugin, TFolder, TAbstractFile, Menu } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { UIService } from './services/ui-service';
import { GitService } from './services/git-service';
import { VaultService } from './services/vault-service';
import { GitTemplateService } from './services/git-template-service';
import { PassphraseManager } from './services/passphrase-manager';
import { serviceManager } from './services/service-manager';
import { DreamspaceView, DREAMSPACE_VIEW_TYPE } from './dreamspace/DreamspaceView';
import { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from './dreamspace/DreamSongFullScreenView';
import { LinkFileView, LINK_FILE_VIEW_TYPE } from './views/LinkFileView';
import { LeafManagerService } from './services/leaf-manager-service';
import { useInterBrainStore } from './store/interbrain-store';
import { DEFAULT_FIBONACCI_CONFIG, calculateFibonacciSpherePositions } from './dreamspace/FibonacciSphereLayout';
import { DreamNode } from './types/dreamnode';
import { buildRelationshipGraph, logNodeRelationships, getRelationshipStats } from './utils/relationship-graph';
import { getMockDataForConfig } from './mock/dreamnode-mock-data';
import { calculateRingLayoutPositions, getRingLayoutStats, DEFAULT_RING_CONFIG } from './dreamspace/layouts/RingLayout';
import { registerSemanticSearchCommands } from './features/semantic-search/commands';
import { registerSearchInterfaceCommands } from './commands/search-interface-commands';
import { registerEditModeCommands } from './commands/edit-mode-commands';
import { registerConversationalCopilotCommands } from './features/conversational-copilot/commands';
import { registerDreamweavingCommands } from './commands/dreamweaving-commands';
import { registerRadicleCommands } from './commands/radicle-commands';
import { registerGitHubCommands } from './commands/github-commands';
import { registerCoherenceBeaconCommands } from './commands/coherence-beacon-commands';
import { registerFullScreenCommands } from './commands/fullscreen-commands';
import { registerMigrationCommands } from './commands/migration-commands';
import { registerRelationshipCommands } from './commands/relationship-commands';
import { registerUpdateCommands } from './commands/update-commands';
import {
	registerTranscriptionCommands,
	cleanupTranscriptionService,
	initializeRealtimeTranscriptionService
} from './features/realtime-transcription';
import { ConstellationCommands } from './commands/constellation-commands';
import { RadialButtonCommands } from './commands/radial-button-commands';
import { registerLinkFileCommands, enhanceFileSuggestions } from './commands/link-file-commands';
import { registerFaceTimeCommands } from './commands/facetime-commands';
import { FaceTimeService } from './services/facetime-service';
import { CanvasParserService } from './services/canvas-parser-service';
import { SubmoduleManagerService } from './services/submodule-manager-service';
import { CanvasObserverService } from './services/canvas-observer-service';
import { CoherenceBeaconService } from './services/coherence-beacon-service';
import { initializeTranscriptionService } from './features/conversational-copilot/services/transcription-service';
import { initializeConversationRecordingService } from './features/conversational-copilot/services/conversation-recording-service';
import { initializeConversationSummaryService } from './features/conversational-copilot/services/conversation-summary-service';
import { initializeEmailExportService } from './features/conversational-copilot/services/email-export-service';
import { initializeAudioRecordingService } from './features/conversational-copilot/services/audio-recording-service';
import { initializePerspectiveService } from './features/conversational-copilot/services/perspective-service';
import { initializeConversationsService } from './features/conversational-copilot/services/conversations-service';
import { initializeAudioStreamingService } from './features/dreamweaving/services/audio-streaming-service';
import { initializeMediaLoadingService } from './services/media-loading-service';
import { initializeURIHandlerService } from './services/uri-handler-service';
import { initializeRadicleBatchInitService } from './services/radicle-batch-init-service';
import { initializeGitHubBatchShareService } from './services/github-batch-share-service';
import { initializeUpdateCheckerService } from './services/update-checker-service';
import { InterBrainSettingTab, InterBrainSettings, DEFAULT_SETTINGS } from './settings/InterBrainSettings';

export default class InterBrainPlugin extends Plugin {
  settings!: InterBrainSettings;

  // Service instances
  private uiService!: UIService;
  private gitService!: GitService;
  private vaultService!: VaultService;
  private gitTemplateService!: GitTemplateService;
  private passphraseManager!: PassphraseManager;
  private faceTimeService!: FaceTimeService;
  private canvasParserService!: CanvasParserService;
  private submoduleManagerService!: SubmoduleManagerService;
  public coherenceBeaconService!: CoherenceBeaconService;
  private leafManagerService!: LeafManagerService;
  private constellationCommands!: ConstellationCommands;
  private radialButtonCommands!: RadialButtonCommands;
  private canvasObserverService!: CanvasObserverService;

  async onload() {
    // Load settings
    await this.loadSettings();

    // Add settings tab
    this.addSettingTab(new InterBrainSettingTab(this.app, this));

    // Initialize core services first (triggers vault scan)
    this.initializeServices();

    // Initialize media loading service immediately (needed for two-phase loading)
    initializeMediaLoadingService();

    // Initialize essential services needed for URI handling
    const radicleService = serviceManager.getRadicleService();
    const dreamNodeService = serviceManager.getActive();
    initializeURIHandlerService(this.app, this, radicleService, dreamNodeService as any);
    initializeRadicleBatchInitService(this, radicleService, dreamNodeService as any);
    initializeGitHubBatchShareService(this, dreamNodeService as any);

    // Defer heavy copilot/songline services until after critical path
    // These will initialize in background after plugin loads
    this.initializeBackgroundServices();

    // Auto-generate mock relationships if not present (ensures deterministic behavior)
    const store = useInterBrainStore.getState();
    if (!store.mockRelationshipData) {
      console.log('Generating initial mock relationships for deterministic behavior...');
      store.generateMockRelationships();
    }
    
    // Register view types
    this.registerView(DREAMSPACE_VIEW_TYPE, (leaf) => new DreamspaceView(leaf));
    this.registerView(DREAMSONG_FULLSCREEN_VIEW_TYPE, (leaf) => new DreamSongFullScreenView(leaf));
    this.registerView(LINK_FILE_VIEW_TYPE, (leaf) => new LinkFileView(leaf));

    // Register .link file extension with custom view
    this.registerExtensions(['link'], LINK_FILE_VIEW_TYPE);

    // Register commands
    this.registerCommands();

    // Register file explorer context menu handler
    this.registerFileExplorerContextMenu();

    // Start canvas observer for .link file preview
    this.canvasObserverService.start();

    // Add ribbon icon with rotation
    const ribbonIconEl = this.addRibbonIcon('brain-circuit', 'Open DreamSpace', () => {
      this.app.commands.executeCommandById('interbrain:open-dreamspace');
    });
    // Rotate icon 90° clockwise so it's upright
    ribbonIconEl.style.transform = 'rotate(90deg)';

    // First launch experience: auto-open DreamSpace with InterBrain selected
    if (!this.settings.hasLaunchedBefore) {
      this.handleFirstLaunch();
    }

    // Every launch: auto-select InterBrain (reuses first launch logic)
    this.autoSelectInterBrain();
  }

  /**
   * Auto-select InterBrain node on every plugin startup
   * Uses the same reliable logic as first launch
   */
  private autoSelectInterBrain(): void {
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => {
        const interbrainUUID = '550e8400-e29b-41d4-a716-446655440000';
        const store = useInterBrainStore.getState();
        const nodeData = store.realNodes.get(interbrainUUID);

        if (nodeData) {
          console.log('[InterBrain] Auto-selecting InterBrain node');
          store.setSelectedNode(nodeData.node);
        } else {
          console.warn('[InterBrain] InterBrain node not found for auto-selection');
        }
      }, 1000); // Same 1 second delay as first launch
    });
  }

  /**
   * First launch experience: open DreamSpace and select InterBrain node
   */
  private async handleFirstLaunch(): Promise<void> {
    // Wait for workspace to be ready
    this.app.workspace.onLayoutReady(async () => {
      // Small delay to ensure everything is initialized
      setTimeout(async () => {
        console.log('[InterBrain] First launch detected - opening DreamSpace');

        // Open DreamSpace
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
          type: DREAMSPACE_VIEW_TYPE,
          active: true
        });
        this.app.workspace.revealLeaf(leaf);

        // Wait for DreamSpace to initialize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Find and select the InterBrain node by UUID
        const interbrainUUID = '550e8400-e29b-41d4-a716-446655440000';
        const store = useInterBrainStore.getState();
        const nodeData = store.realNodes.get(interbrainUUID);

        if (nodeData) {
          console.log('[InterBrain] Selecting InterBrain node');
          store.setSelectedNode(nodeData.node);
          store.setSpatialLayout('liminal-web');
          this.uiService.showInfo('Welcome to InterBrain! Drag images here to create Dreamer nodes.');
        } else {
          console.warn('[InterBrain] InterBrain node not found for auto-selection');
        }

        // Run transcription auto-setup if enabled
        if (this.settings.transcriptionEnabled && !this.settings.transcriptionSetupComplete) {
          console.log('[InterBrain] Starting transcription auto-setup...');
          this.uiService.showInfo('Setting up transcription in background...');
          this.runTranscriptionAutoSetup();
        }

        // Mark first launch as complete
        this.settings.hasLaunchedBefore = true;
        await this.saveSettings();
      }, 1000); // 1 second delay for full initialization
    });
  }

  /**
   * Run transcription auto-setup in background on first launch
   */
  private async runTranscriptionAutoSetup(): Promise<void> {
    const vaultPath = (this.app.vault.adapter as any).basePath;
    const { exec } = require('child_process');

    exec(`cd "${vaultPath}/InterBrain/src/features/realtime-transcription/scripts" && bash setup.sh`,
      async (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          console.error('[InterBrain] Transcription setup error:', error);
          console.error('stderr:', stderr);
          this.uiService.showWarning('Transcription setup failed. You can retry from settings.');
        } else {
          console.log('[InterBrain] ✅ Transcription setup complete!');
          console.log('Setup output:', stdout);
          this.settings.transcriptionSetupComplete = true;
          await this.saveSettings();
          this.uiService.showInfo('Transcription setup complete! Ready to use.');
        }
      }
    );
  }

  private initializeBackgroundServices(): void {
    // Defer heavy copilot/songline services to background
    // These aren't needed until user actually opens those features
    setTimeout(() => {
      console.log('[Plugin] Initializing background services...');
      initializeTranscriptionService(this.app);
      initializeConversationRecordingService(this.app);
      initializeConversationSummaryService(this.app);
      initializeEmailExportService(this.app);
      initializeAudioRecordingService(this);
      initializePerspectiveService(this);
      initializeConversationsService(this);
      initializeAudioStreamingService(this);
      console.log('[Plugin] Background services initialized');
    }, 100); // Tiny delay to let vault scan finish first

    // Start auto-fetch for updates after vault scan completes
    setTimeout(() => {
      console.log('[Plugin] Starting auto-fetch for DreamNode updates...');
      const updateChecker = initializeUpdateCheckerService(this.app);

      // Run auto-fetch in background (non-blocking)
      updateChecker.checkAllDreamNodesForUpdates().then(() => {
        console.log('[Plugin] Auto-fetch complete');
      }).catch((error) => {
        console.error('[Plugin] Auto-fetch failed:', error);
      });
    }, 500); // Wait for vault scan to complete
  }

  private initializeServices(): void {
    this.uiService = new UIService(this.app);
    this.gitService = new GitService(this.app);
    this.vaultService = new VaultService(this.app.vault, this.app);
    this.gitTemplateService = new GitTemplateService(this.app.vault);
    this.passphraseManager = new PassphraseManager(this.uiService);
    this.faceTimeService = new FaceTimeService();

    // Initialize dreamweaving services
    this.canvasParserService = new CanvasParserService(this.vaultService);
    this.submoduleManagerService = new SubmoduleManagerService(
      this.app,
      this.vaultService,
      this.canvasParserService,
      serviceManager.getRadicleService()
    );
    this.coherenceBeaconService = new CoherenceBeaconService(
      this.app,
      this.vaultService,
      serviceManager.getRadicleService()
    );
    this.leafManagerService = new LeafManagerService(this.app);
    this.canvasObserverService = new CanvasObserverService(this.app);

    // Initialize constellation commands
    this.constellationCommands = new ConstellationCommands(this);

    // Initialize radial button commands
    this.radialButtonCommands = new RadialButtonCommands(this);

    // Make services accessible to ServiceManager BEFORE initialization
    // Note: Using 'any' here is legitimate - we're extending the plugin with dynamic properties
    (this as any).vaultService = this.vaultService;
    (this as any).canvasParserService = this.canvasParserService;
    (this as any).leafManagerService = this.leafManagerService;
    (this as any).submoduleManagerService = this.submoduleManagerService;

    // Initialize service manager with plugin instance and services
    serviceManager.initialize(this);
  }

  private registerCommands(): void {
    // Register semantic search commands
    registerSemanticSearchCommands(this, this.uiService);

    // Register search interface commands (search-as-dreamnode UI)
    registerSearchInterfaceCommands(this, this.uiService);

    // Register edit mode commands (unified editing with relationship management)
    registerEditModeCommands(this, this.uiService);

    // Register conversational copilot commands (real-time transcription and semantic search)
    registerConversationalCopilotCommands(this, this.uiService);

    // Register FaceTime commands (video calling integration)
    registerFaceTimeCommands(this, this.uiService, this.vaultService, this.faceTimeService);

    // Register dreamweaving commands (canvas submodule management)
    registerDreamweavingCommands(
      this,
      this.uiService,
      this.vaultService,
      this.canvasParserService,
      this.submoduleManagerService
    );

    // Register Radicle commands (peer-to-peer networking)
    registerRadicleCommands(this, this.uiService, this.passphraseManager);

    // Register GitHub commands (fallback sharing and broadcasting)
    registerGitHubCommands(this, this.uiService);

    // Register Coherence Beacon commands (network discovery)
    registerCoherenceBeaconCommands(this);

    // Register migration commands (PascalCase naming migration)
    registerMigrationCommands(this);

    // Register relationship commands (bidirectional sync)
    registerRelationshipCommands(this);

    // Register update commands (auto-fetch and update management)
    registerUpdateCommands(this, this.uiService);

    // Register full-screen commands
    registerFullScreenCommands(this, this.uiService);

    // Register constellation commands (DreamSong relationship analysis)
    this.constellationCommands.registerCommands(this);

    // Register radial button debug commands
    this.radialButtonCommands.registerCommands(this);

    // Register link file commands (.link file support)
    registerLinkFileCommands(this, this.uiService);

    // Enhance file suggestions to include .link files
    enhanceFileSuggestions(this);

    // Initialize and register real-time transcription
    initializeRealtimeTranscriptionService(this);
    registerTranscriptionCommands(this);
    
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

    // Toggle Creator Mode command
    this.addCommand({
      id: 'toggle-creator-mode',
      name: 'Toggle Creator Mode',
      callback: async () => {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          this.uiService.showError('Please select a DreamNode first');
          return;
        }
        
        const { creatorMode } = store;
        const isCurrentlyActive = creatorMode.isActive && creatorMode.nodeId === selectedNode.id;
        
        if (isCurrentlyActive) {
          // Exit creator mode
          const loadingNotice = this.uiService.showLoading('Exiting creator mode...');
          try {
            // Stash any uncommitted changes when exiting creator mode
            if (serviceManager.getMode() === 'real') {
              await this.gitService.stashChanges(selectedNode.repoPath);
            }
            store.setCreatorMode(false);
            this.uiService.showSuccess('Exited creator mode - changes stashed');
          } catch (error) {
            console.error('Failed to stash changes:', error);
            // Still exit creator mode even if stash fails
            store.setCreatorMode(false);
            this.uiService.showError('Exited creator mode but failed to stash changes');
          } finally {
            loadingNotice.hide();
          }
        } else {
          // Enter creator mode
          const loadingNotice = this.uiService.showLoading('Entering creator mode...');
          try {
            // Pop any existing stash when entering creator mode
            if (serviceManager.getMode() === 'real') {
              await this.gitService.popStash(selectedNode.repoPath);
            }
            store.setCreatorMode(true, selectedNode.id);
            this.uiService.showSuccess(`Creator mode active for: ${selectedNode.name}`);
          } catch (error) {
            console.error('Failed to pop stash:', error);
            // Still enter creator mode even if pop fails
            store.setCreatorMode(true, selectedNode.id);
            this.uiService.showError('Entered creator mode but failed to restore stash');
          } finally {
            loadingNotice.hide();
          }
        }
      }
    });

    // Save DreamNode command
    this.addCommand({
      id: 'save-dreamnode',
      name: 'Save DreamNode (commit changes)',
      callback: async () => {
        const loadingNotice = this.uiService.showLoading('Saving DreamNode...');
        try {
          const store = useInterBrainStore.getState();
          const currentNode = store.selectedNode;
          if (!currentNode) {
            throw new Error('No DreamNode selected');
          }
          // TODO: Implement save through service layer when auto-stash workflow is ready
          await this.gitService.commitWithAI(currentNode.repoPath);
          
          // Exit creator mode after successful save
          const { creatorMode } = store;
          if (creatorMode.isActive && creatorMode.nodeId === currentNode.id) {
            store.setCreatorMode(false);
          }
          
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
      hotkeys: [{ modifiers: ['Ctrl'], key: 'n' }],
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
        
        // Calculate spawn position (used in both paths)
        const spawnPosition: [number, number, number] = [0, 0, -25];
        
        // Check current layout to determine transition path
        if (store.spatialLayout === 'liminal-web') {
          // From liminal-web: First return to constellation, then trigger creation command  
          console.log(`🛠️ [Create-Toggle] Phase 1: liminal-web → constellation`);
          store.setSelectedNode(null);
          store.setSpatialLayout('constellation');
          
          // Wait for constellation transition to complete, then trigger creation
          globalThis.setTimeout(() => {
            console.log(`🛠️ [Create-Toggle] Phase 2: triggering creation mode`);
            const freshStore = useInterBrainStore.getState();
            freshStore.startCreationWithData(spawnPosition);
          }, 1100); // Animation duration (1000ms) + buffer (100ms)
        } else {
          // Normal creation from constellation or other states
          store.startCreationWithData(spawnPosition);
        }
        
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
        // TODO: Implement multi-node selection in store
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        if (!selectedNode) {
          this.uiService.showError('Select at least 2 DreamNodes to weave');
          return;
        }
        console.log('Would weave node:', selectedNode.name);
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

    // Open DreamNode in Finder command
    this.addCommand({
      id: 'open-dreamnode-in-finder',
      name: 'Open DreamNode in Finder',
      hotkeys: [{ modifiers: ['Ctrl'], key: 'o' }],
      callback: async () => {
        const store = useInterBrainStore.getState();
        const currentNode = store.selectedNode;
        if (!currentNode) {
          this.uiService.showError('No DreamNode selected');
          return;
        }

        // Only available in real mode (mock nodes don't have file paths)
        if (serviceManager.getMode() !== 'real') {
          this.uiService.showError('Open in Finder only available in real mode');
          return;
        }

        try {
          // Use git service to open the repository folder in Finder
          await this.gitService.openInFinder(currentNode.repoPath);
          this.uiService.showSuccess(`Opened ${currentNode.name} in Finder`);
        } catch (error) {
          console.error('Failed to open in Finder:', error);
          this.uiService.showError('Failed to open DreamNode in Finder');
        }
      }
    });

    // Open DreamNode in Terminal and run claude command
    this.addCommand({
      id: 'open-dreamnode-in-terminal',
      name: 'Open DreamNode in Terminal (run claude)',
      hotkeys: [{ modifiers: ['Ctrl'], key: 'c' }],
      callback: async () => {
        const store = useInterBrainStore.getState();
        const currentNode = store.selectedNode;
        if (!currentNode) {
          this.uiService.showError('No DreamNode selected');
          return;
        }

        // Only available in real mode (mock nodes don't have file paths)
        if (serviceManager.getMode() !== 'real') {
          this.uiService.showError('Open in Terminal only available in real mode');
          return;
        }

        try {
          // Use git service to open terminal at the repository folder and run claude
          await this.gitService.openInTerminal(currentNode.repoPath);
          this.uiService.showSuccess(`Opened terminal for ${currentNode.name} and running claude`);
        } catch (error) {
          console.error('Failed to open in Terminal:', error);
          this.uiService.showError('Failed to open DreamNode in Terminal');
        }
      }
    });

    // Delete DreamNode command
    this.addCommand({
      id: 'delete-dreamnode',
      name: 'Delete DreamNode',
      callback: async () => {
        const store = useInterBrainStore.getState();
        const currentNode = store.selectedNode;
        if (!currentNode) {
          this.uiService.showError('No DreamNode selected');
          return;
        }

        // Safety confirmation using Obsidian Modal
        const confirmed = await this.uiService.promptForText(
          `⚠️ DELETE "${currentNode.name}" ⚠️`,
          `Type "${currentNode.name}" to confirm permanent deletion`
        );
        
        const isConfirmed = confirmed === currentNode.name;
        
        if (!isConfirmed) {
          this.uiService.showInfo('Delete operation cancelled');
          return;
        }

        const loadingNotice = this.uiService.showLoading(`Deleting ${currentNode.name}...`);
        try {
          // Get the active service for deletion
          const dreamNodeService = serviceManager.getActive();
          
          // Delete the DreamNode through the service layer
          await dreamNodeService.delete(currentNode.id);
          
          // Clear the selection since the node no longer exists
          store.setSelectedNode(null);
          
          // Return to constellation view
          store.setSpatialLayout('constellation');
          
          this.uiService.showSuccess(`Successfully deleted "${currentNode.name}"`);
          console.log(`DreamNode deleted: ${currentNode.name} (${currentNode.id})`);
          
        } catch (error) {
          console.error('Failed to delete DreamNode:', error);
          this.uiService.showError(`Failed to delete "${currentNode.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
          loadingNotice.hide();
        }
      }
    });

    // Share DreamNode command
    this.addCommand({
      id: 'share-dreamnode',
      name: 'Share DreamNode via Coherence Beacon',
      callback: async () => {
        const store = useInterBrainStore.getState();
        const currentNode = store.selectedNode;
        if (!currentNode) {
          this.uiService.showError('No DreamNode selected');
          return;
        }
        console.log('Would share node:', currentNode.name);
        this.uiService.showPlaceholder('Coherence Beacon coming soon!');
      }
    });

    // Copy share link for selected DreamNode
    this.addCommand({
      id: 'copy-share-link',
      name: 'Copy Share Link for Selected DreamNode',
      callback: async () => {
        const store = useInterBrainStore.getState();
        const currentNode = store.selectedNode;
        if (!currentNode) {
          this.uiService.showError('No DreamNode selected');
          return;
        }

        try {
          const { ShareLinkService } = await import('./services/share-link-service');
          const shareLinkService = new ShareLinkService(this.app);
          await shareLinkService.copyShareLink(currentNode);
        } catch (error) {
          console.error('Failed to copy share link:', error);
          this.uiService.showError(`Failed to copy share link: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
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

            // Trigger two-phase media loading after vault scan
            try {
              const { getMediaLoadingService } = await import('./services/media-loading-service');
              const mediaLoadingService = getMediaLoadingService();
              mediaLoadingService.loadAllNodesByDistance();
            } catch (error) {
              console.warn('[Main] Failed to start media loading:', error);
            }
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

    // Generate mock relationships command
    this.addCommand({
      id: 'generate-mock-relationships',
      name: 'Generate Mock Relationships (Bidirectional)',
      callback: () => {
        const store = useInterBrainStore.getState();
        store.generateMockRelationships();
        
        const relationships = store.mockRelationshipData;
        if (relationships) {
          const nodeCount = relationships.size;
          const connectionCount = Array.from(relationships.values()).reduce((sum, conns) => sum + conns.length, 0);
          this.uiService.showSuccess(`Generated relationships for ${nodeCount} nodes with ${connectionCount} total connections`);
        }
      }
    });
    
    // Clear mock relationships command
    this.addCommand({
      id: 'clear-mock-relationships',
      name: 'Clear Mock Relationships',
      callback: () => {
        const store = useInterBrainStore.getState();
        store.clearMockRelationships();
        this.uiService.showSuccess('Mock relationships cleared - using default generation');
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
        const store = useInterBrainStore.getState();
        store.setSelectedNode(mockNode);
        this.uiService.showSuccess(`Selected: ${mockNode.name}`);
        console.log('Mock node selected - Zustand state should be updated');
      }
    });

    // Test command: Clear selection
    this.addCommand({
      id: 'clear-dreamnode-selection',
      name: '[TEST] Clear DreamNode Selection',
      callback: () => {
        const store = useInterBrainStore.getState();
        store.setSelectedNode(null);
        this.uiService.showSuccess('Selection cleared');
        console.log('Selection cleared - Zustand state should be null');
      }
    });

    // Command to redistribute DreamNodes using Fibonacci sphere algorithm
    this.addCommand({
      id: 'redistribute-dreamnodes',
      name: 'Redistribute DreamNodes',
      callback: async () => {
        const store = useInterBrainStore.getState();
        const service = serviceManager.getActive();
        
        try {
          // Get all existing DreamNodes
          const dreamNodes = await service.list();
          
          if (dreamNodes.length === 0) {
            this.uiService.showInfo('No DreamNodes to redistribute');
            return;
          }
          
          // Calculate Fibonacci sphere positions for the current node count
          const positions = calculateFibonacciSpherePositions({
            radius: store.fibonacciConfig.radius,
            nodeCount: dreamNodes.length,
            center: store.fibonacciConfig.center
          });
          
          // Update each node with its new position
          for (let i = 0; i < dreamNodes.length; i++) {
            const node = dreamNodes[i];
            const newPosition = positions[i].position;
            
            // Update the node's position using the service
            await service.update(node.id, {
              position: newPosition
            });
            
            console.log(`Updated position for "${node.name}": [${newPosition.join(', ')}]`);
          }
          
          // The store will automatically reflect the updates via service.update()
          // No need to manually refresh
          
          this.uiService.showSuccess(`Redistributed ${dreamNodes.length} DreamNodes using Fibonacci sphere algorithm`);
          console.log(`Redistributed ${dreamNodes.length} nodes with radius ${store.fibonacciConfig.radius}`);
          
        } catch (error) {
          console.error('Failed to redistribute DreamNodes:', error);
          this.uiService.showError('Failed to redistribute DreamNodes');
        }
      }
    });

    // Layout command: Switch to constellation view
    this.addCommand({
      id: 'layout-constellation',
      name: 'Switch to Constellation View',
      callback: () => {
        const store = useInterBrainStore.getState();
        store.setSpatialLayout('constellation');
        this.uiService.showSuccess('Switched to constellation view');
        console.log('Layout switched to constellation');
      }
    });

    // Layout command: Switch to search view
    this.addCommand({
      id: 'layout-search',
      name: 'Switch to Search View',
      callback: () => {
        const store = useInterBrainStore.getState();
        store.setSpatialLayout('search');
        this.uiService.showSuccess('Switched to search view');
        console.log('Layout switched to search');
      }
    });

    // Layout command: Switch to focused view
    this.addCommand({
      id: 'layout-focused',
      name: 'Switch to Focused View',
      callback: () => {
        const store = useInterBrainStore.getState();
        const currentNode = store.selectedNode;
        if (!currentNode) {
          this.uiService.showError('No DreamNode selected - select a node first');
          return;
        }
        store.setSpatialLayout('liminal-web');
        this.uiService.showSuccess(`Focused on: ${currentNode.name}`);
        console.log('Layout switched to focused on:', currentNode.name);
      }
    });

    // Camera command: Reset camera position
    this.addCommand({
      id: 'camera-reset',
      name: 'Reset Camera Position',
      callback: () => {
        const store = useInterBrainStore.getState();
        // Reset to origin for proper Dynamic View Scaling geometry
        store.setCameraPosition([0, 0, 0]);
        store.setCameraTarget([0, 0, 0]);
        store.setCameraTransition(false);
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

    // Refresh Git Status command
    this.addCommand({
      id: 'refresh-git-status',
      name: 'Refresh Git Status Indicators',
      callback: async () => {
        console.log('Refresh git status command executed');
        const loadingNotice = this.uiService.showLoading('Refreshing git status...');
        
        try {
          const service = serviceManager.getActive();
          
          if (service.refreshGitStatus) {
            const result = await service.refreshGitStatus();
            
            if (serviceManager.getMode() === 'mock') {
              // In mock mode, also trigger UI update
              if (typeof globalThis.CustomEvent !== 'undefined') {
                globalThis.dispatchEvent(new globalThis.CustomEvent('mock-nodes-changed', {
                  detail: { source: 'git-status-refresh' }
                }));
              }
            }
            
            this.uiService.showSuccess(`Git status refreshed: ${result.updated} updated, ${result.errors} errors`);
            console.log('Git status refresh result:', result);
          } else {
            this.uiService.showError('Git status refresh not available in current mode');
          }
        } catch (error) {
          this.uiService.showError(error instanceof Error ? error.message : 'Git status refresh failed');
          console.error('Git status refresh error:', error);
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

    // Step 3.5: Simple move-to-center command to test dual-mode positioning
    this.addCommand({
      id: 'move-selected-node-to-center',
      name: 'Move Selected Node to Center',
      callback: () => {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          this.uiService.showError('Please select a DreamNode first');
          return;
        }
        
        // Check if DreamSpace is open
        const dreamspaceLeaf = this.app.workspace.getLeavesOfType(DREAMSPACE_VIEW_TYPE)[0];
        if (!dreamspaceLeaf || !(dreamspaceLeaf.view instanceof DreamspaceView)) {
          this.uiService.showError('DreamSpace view not found - please open DreamSpace first');
          return;
        }
        
        // Call global canvas function (simple approach for now)
        const canvasAPI = (globalThis as unknown as { __interbrainCanvas?: { moveSelectedNodeToCenter(): boolean } }).__interbrainCanvas;
        if (canvasAPI && canvasAPI.moveSelectedNodeToCenter) {
          const success = canvasAPI.moveSelectedNodeToCenter();
          if (success) {
            this.uiService.showSuccess(`Moving ${selectedNode.name} to center`);
          } else {
            this.uiService.showError('Failed to move node - ref not found');
          }
        } else {
          this.uiService.showError('Canvas API not available - DreamSpace may not be fully loaded');
        }
      }
    });

    // Step 4: Test focused layout via SpatialOrchestrator
    this.addCommand({
      id: 'test-focused-layout-orchestrator',
      name: 'Test: Focus on Selected Node (Orchestrator)',
      callback: () => {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          this.uiService.showError('Please select a DreamNode first');
          return;
        }
        
        // Check if DreamSpace is open
        const dreamspaceLeaf = this.app.workspace.getLeavesOfType(DREAMSPACE_VIEW_TYPE)[0];
        if (!dreamspaceLeaf || !(dreamspaceLeaf.view instanceof DreamspaceView)) {
          this.uiService.showError('DreamSpace view not found - please open DreamSpace first');
          return;
        }
        
        // Call global canvas function to trigger focused layout
        const canvasAPI = (globalThis as unknown as { __interbrainCanvas?: { focusOnNode(nodeId: string): boolean } }).__interbrainCanvas;
        if (canvasAPI && canvasAPI.focusOnNode) {
          const success = canvasAPI.focusOnNode(selectedNode.id);
          if (success) {
            this.uiService.showSuccess(`Focusing on ${selectedNode.name} with liminal web layout`);
          } else {
            this.uiService.showError('Failed to focus - orchestrator not ready');
          }
        } else {
          this.uiService.showError('Canvas API not available - DreamSpace may not be fully loaded');
        }
      }
    });

    // Test command for relationship queries
    this.addCommand({
      id: 'test-relationship-queries',
      name: 'Test: Query Node Relationships',
      callback: async () => {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          this.uiService.showError('Please select a DreamNode first');
          return;
        }
        
        try {
          // Get all nodes using same method as DreamspaceCanvas
          const store = useInterBrainStore.getState();
          const dataMode = store.dataMode;
          const mockDataConfig = store.mockDataConfig;
          
          let allNodes: DreamNode[] = [];
          if (dataMode === 'mock') {
            // Get static mock data with persistent relationships
            const mockRelationshipData = store.mockRelationshipData;
            const staticNodes = getMockDataForConfig(mockDataConfig, mockRelationshipData || undefined);
            const service = serviceManager.getActive();
            const dynamicNodes = await service.list();
            allNodes = [...staticNodes, ...dynamicNodes];
          } else {
            // Real mode - get from store
            const realNodes = store.realNodes;
            allNodes = Array.from(realNodes.values()).map(data => data.node);
          }
          
          // console.log('DEBUG: Total nodes found:', allNodes.length); // Debug removed for production
          // console.log('DEBUG: Data mode:', dataMode, 'Mock config:', mockDataConfig); // Debug removed for production
          // console.log('DEBUG: First few nodes:', allNodes.slice(0, 3).map(n => ({ // Debug removed for production
          //   id: n.id,
          //   type: n.type,
          //   connections: n.liminalWebConnections.length,
          //   connectionIds: n.liminalWebConnections.slice(0, 2)
          // })));
          
          // Build relationship graph
          const graph = buildRelationshipGraph(allNodes);
          
          // Log stats
          const stats = getRelationshipStats(graph);
          console.log('=== Relationship Graph Stats ===');
          console.log(`Total nodes: ${stats.totalNodes}`);
          console.log(`Dreams: ${stats.dreamNodes}, Dreamers: ${stats.dreamerNodes}`);
          console.log(`Average connections: ${stats.averageConnections.toFixed(1)}`);
          console.log(`Max connections: ${stats.maxConnections}`);
          console.log(`Nodes with no connections: ${stats.nodesWithNoConnections}`);
          
          // Log relationships for selected node
          logNodeRelationships(graph, selectedNode.id);
          
          this.uiService.showSuccess(`Logged relationships for ${selectedNode.name} to console`);
        } catch (error) {
          console.error('Relationship query error:', error);
          this.uiService.showError('Failed to query relationships');
        }
      }
    });

    // Test command for focused layout position calculation
    this.addCommand({
      id: 'test-focused-layout-positions',
      name: 'Test: Calculate Focused Layout Positions',
      callback: async () => {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          this.uiService.showError('Please select a DreamNode first');
          return;
        }
        
        try {
          // Get all nodes using same method as DreamspaceCanvas
          const dataMode = store.dataMode;
          const mockDataConfig = store.mockDataConfig;
          
          let allNodes: DreamNode[] = [];
          if (dataMode === 'mock') {
            const mockRelationshipData = store.mockRelationshipData;
            const staticNodes = getMockDataForConfig(mockDataConfig, mockRelationshipData || undefined);
            const service = serviceManager.getActive();
            const dynamicNodes = await service.list();
            allNodes = [...staticNodes, ...dynamicNodes];
          } else {
            const realNodes = store.realNodes;
            allNodes = Array.from(realNodes.values()).map(data => data.node);
          }
          
          // Build relationship graph
          const graph = buildRelationshipGraph(allNodes);
          
          // Calculate ring layout positions
          const positions = calculateRingLayoutPositions(selectedNode.id, graph, DEFAULT_RING_CONFIG);
          const stats = getRingLayoutStats(positions);
          
          console.log(`\n=== Ring Layout for ${selectedNode.name} (${selectedNode.type}) ===`);
          // console.log('DEBUG: Selected node ID:', selectedNode.id); // Debug removed for production
          // console.log('DEBUG: Center node ID from calculation:', positions.centerNode?.nodeId || 'None'); // Debug removed for production
          console.log('Layout Stats:', stats);
          
          if (positions.centerNode) {
            console.log('\nCenter Position:', positions.centerNode.position);
          }
          
          console.log(`\nRing 1 (${positions.ring1Nodes.length} nodes):`);
          positions.ring1Nodes.forEach((node, i) => {
            const nodeData = graph.nodes.get(node.nodeId);
            console.log(`  ${i + 1}. ${nodeData?.name} (${nodeData?.type}) at ${node.position.map(p => p.toFixed(1)).join(', ')}`);
          });
          
          console.log(`\nRing 2 (${positions.ring2Nodes.length} nodes):`);
          positions.ring2Nodes.forEach((node, i) => {
            const nodeData = graph.nodes.get(node.nodeId);
            console.log(`  ${i + 1}. ${nodeData?.name} (${nodeData?.type}) at ${node.position.map(p => p.toFixed(1)).join(', ')}`);
          });
          
          console.log(`\nRing 3 (${positions.ring3Nodes.length} nodes):`);
          positions.ring3Nodes.forEach((node, i) => {
            const nodeData = graph.nodes.get(node.nodeId);
            console.log(`  ${i + 1}. ${nodeData?.name} (${nodeData?.type}) at ${node.position.map(p => p.toFixed(1)).join(', ')}`);
          });
          
          console.log(`\nSphere nodes (remain on sphere): ${positions.sphereNodes.length}`);
          
          this.uiService.showSuccess(`Calculated focused layout for ${selectedNode.name} - check console`);
        } catch (error) {
          console.error('Position calculation error:', error);
          this.uiService.showError(error instanceof Error ? error.message : 'Failed to calculate positions');
        }
      }
    });

    // Test Ring Layout with Dense Relationships
    this.addCommand({
      id: 'test-ring-layout-dense',
      name: 'Test: Ring Layout with Dense Relationships (50 nodes)',
      callback: async () => {
        const store = useInterBrainStore.getState();
        
        // Switch to mock mode with dense data
        store.setDataMode('mock');
        store.setMockDataConfig('fibonacci-50');
        
        // Wait a bit for state to update
        await new Promise(resolve => globalThis.setTimeout(resolve, 100));
        
        // Auto-select first dreamer node for testing
        const mockNodes = getMockDataForConfig('fibonacci-50');
        const firstDreamer = mockNodes.find(node => node.type === 'dreamer');
        
        if (firstDreamer) {
          store.setSelectedNode(firstDreamer);
          this.uiService.showSuccess(`Set up dense relationship test (50 nodes) - selected ${firstDreamer.name}. Use 'Focus on Selected Node' to see ring layout.`);
          console.log(`\n=== Ring Layout Test: Dense Relationships ===`);
          console.log(`Selected node: ${firstDreamer.name} (${firstDreamer.id})`);
          console.log(`Total nodes: 50 with enhanced relationships (10-30 per node)`);
          console.log(`Use 'Focus on Selected Node' command to trigger ring layout visualization`);
        } else {
          this.uiService.showError('No dreamer nodes found in mock data');
        }
      }
    });

    // Test Ring Layout with Medium Relationships  
    this.addCommand({
      id: 'test-ring-layout-medium',
      name: 'Test: Ring Layout with Medium Relationships (12 nodes)',
      callback: async () => {
        const store = useInterBrainStore.getState();
        
        // Switch to mock mode with medium data
        store.setDataMode('mock');
        store.setMockDataConfig('fibonacci-12');
        
        // Wait a bit for state to update
        await new Promise(resolve => globalThis.setTimeout(resolve, 100));
        
        // Auto-select first dreamer node for testing
        const mockNodes = getMockDataForConfig('fibonacci-12');
        const firstDreamer = mockNodes.find(node => node.type === 'dreamer');
        
        if (firstDreamer) {
          store.setSelectedNode(firstDreamer);
          this.uiService.showSuccess(`Set up medium relationship test (12 nodes) - selected ${firstDreamer.name}. Use 'Focus on Selected Node' to see ring layout.`);
          console.log(`\n=== Ring Layout Test: Medium Relationships ===`);
          console.log(`Selected node: ${firstDreamer.name} (${firstDreamer.id})`);
          console.log(`Total nodes: 12 with enhanced relationships (5-15 per node)`);
          console.log(`Use 'Focus on Selected Node' command to trigger ring layout visualization`);
        } else {
          this.uiService.showError('No dreamer nodes found in mock data');
        }
      }
    });

    // Test Ring Layout with Sparse Relationships
    this.addCommand({
      id: 'test-ring-layout-sparse',
      name: 'Test: Ring Layout with Sparse Relationships (100 nodes)',
      callback: async () => {
        const store = useInterBrainStore.getState();
        
        // Switch to mock mode with sparse data (many nodes, but still 10-30 relationships each)
        store.setDataMode('mock');
        store.setMockDataConfig('fibonacci-100');
        
        // Wait a bit for state to update
        await new Promise(resolve => globalThis.setTimeout(resolve, 100));
        
        // Auto-select first dreamer node for testing
        const mockNodes = getMockDataForConfig('fibonacci-100');
        const firstDreamer = mockNodes.find(node => node.type === 'dreamer');
        
        if (firstDreamer) {
          store.setSelectedNode(firstDreamer);
          this.uiService.showSuccess(`Set up sparse relationship test (100 nodes) - selected ${firstDreamer.name}. Use 'Focus on Selected Node' to see ring layout.`);
          console.log(`\n=== Ring Layout Test: Sparse Relationships ===`);
          console.log(`Selected node: ${firstDreamer.name} (${firstDreamer.id})`);
          console.log(`Total nodes: 100 with enhanced relationships (10-30 per node)`);
          console.log(`Use 'Focus on Selected Node' command to trigger ring layout visualization`);
        } else {
          this.uiService.showError('No dreamer nodes found in mock data');
        }
      }
    });

    // Undo Layout Change command
    this.addCommand({
      id: 'undo-layout-change',
      name: 'Undo Layout Change',
      hotkeys: [{ modifiers: ['Mod'], key: 'z' }],
      callback: async () => {
        const store = useInterBrainStore.getState();
        const { history, currentIndex } = store.navigationHistory;
        
        // Check if undo is possible (can undo to index 0, which is the initial constellation state)
        if (currentIndex < 1) {
          this.uiService.showError('No more layout changes to undo');
          return;
        }
        
        // Get the entry to restore
        const previousEntry = history[currentIndex - 1];
        if (!previousEntry) {
          this.uiService.showError('Invalid history entry');
          return;
        }
        
        try {
          // Update history index first
          const success = store.performUndo();
          if (!success) {
            this.uiService.showError('Failed to undo - no history available');
            return;
          }
          
          // Set flag to prevent new history entries during restoration
          store.setRestoringFromHistory(true);
          
          try {
            // Restore the layout state via SpatialOrchestrator (proper way)
            if (previousEntry.layout === 'constellation') {
              // Going to constellation - use SpatialOrchestrator (with interruption support)
              const canvasAPI = (globalThis as unknown as { __interbrainCanvas?: { interruptAndReturnToConstellation(): boolean } }).__interbrainCanvas;
              if (canvasAPI && canvasAPI.interruptAndReturnToConstellation) {
                const success = canvasAPI.interruptAndReturnToConstellation();
                if (success) {
                  store.setSelectedNode(null); // Update store to match
                } else {
                  this.uiService.showError('Failed to return to constellation - SpatialOrchestrator not ready');
                  return;
                }
              } else {
                this.uiService.showError('Canvas API not available - DreamSpace may not be open');
                return;
              }
            } else if (previousEntry.layout === 'liminal-web' && previousEntry.nodeId) {
              // Going to liminal-web - need to find and focus on the node
              const allNodes = await this.getAllAvailableNodes();
              const targetNode = allNodes.find(node => node.id === previousEntry.nodeId);
              
              if (targetNode) {
                // First update store (required for SpatialOrchestrator to work)
                store.setSelectedNode(targetNode);
                
                // Then trigger visual transition via SpatialOrchestrator (with interruption support)
                const canvasAPI = (globalThis as unknown as { __interbrainCanvas?: { [key: string]: (...args: unknown[]) => boolean } }).__interbrainCanvas;
                if (canvasAPI && canvasAPI.interruptAndFocusOnNode) {
                  const success = canvasAPI.interruptAndFocusOnNode(targetNode.id);
                  if (!success) {
                    this.uiService.showError('Failed to focus on node - SpatialOrchestrator not ready');
                    return;
                  }
                } else {
                  this.uiService.showError('Canvas API not available - DreamSpace may not be open');
                  return;
                }
              } else {
                // Handle deleted node case - skip to next valid entry
                console.warn(`Node ${previousEntry.nodeId} no longer exists, skipping undo step`);
                this.uiService.showError('Target node no longer exists - skipped to previous state');
              }
            }
            
            // Restore visual state (flip state and scroll position) after layout restoration
            store.restoreVisualState(previousEntry);
          } finally {
            // Always clear the flag
            store.setRestoringFromHistory(false);
          }
          
        } catch (error) {
          console.error('Undo failed:', error);
          this.uiService.showError('Failed to undo layout change');
        }
      }
    });

    // Redo Layout Change command  
    this.addCommand({
      id: 'redo-layout-change',
      name: 'Redo Layout Change',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'z' }],
      callback: async () => {
        const store = useInterBrainStore.getState();
        const { history, currentIndex } = store.navigationHistory;
        
        // Check if redo is possible
        if (currentIndex >= history.length - 1) {
          this.uiService.showError('No more layout changes to redo');
          return;
        }
        
        // Get the entry to restore
        const nextEntry = history[currentIndex + 1];
        if (!nextEntry) {
          this.uiService.showError('Invalid history entry');
          return;
        }
        
        try {
          // Update history index first
          const success = store.performRedo();
          if (!success) {
            this.uiService.showError('Failed to redo - no history available');
            return;
          }
          
          // Set flag to prevent new history entries during restoration
          store.setRestoringFromHistory(true);
          
          try {
            // Restore the layout state via SpatialOrchestrator (proper way)
            if (nextEntry.layout === 'constellation') {
              // Going to constellation - use SpatialOrchestrator (with interruption support)
              const canvasAPI = (globalThis as unknown as { __interbrainCanvas?: { [key: string]: (...args: unknown[]) => boolean } }).__interbrainCanvas;
              if (canvasAPI && canvasAPI.interruptAndReturnToConstellation) {
                const success = canvasAPI.interruptAndReturnToConstellation();
                if (success) {
                  store.setSelectedNode(null); // Update store to match
                } else {
                  this.uiService.showError('Failed to return to constellation - SpatialOrchestrator not ready');
                  return;
                }
              } else {
                this.uiService.showError('Canvas API not available - DreamSpace may not be open');
                return;
              }
            } else if (nextEntry.layout === 'liminal-web' && nextEntry.nodeId) {
              // Going to liminal-web - need to find and focus on the node
              const allNodes = await this.getAllAvailableNodes();
              const targetNode = allNodes.find(node => node.id === nextEntry.nodeId);
              
              if (targetNode) {
                // First update store (required for SpatialOrchestrator to work)
                store.setSelectedNode(targetNode);
                
                // Then trigger visual transition via SpatialOrchestrator (with interruption support)
                const canvasAPI = (globalThis as unknown as { __interbrainCanvas?: { [key: string]: (...args: unknown[]) => boolean } }).__interbrainCanvas;
                if (canvasAPI && canvasAPI.interruptAndFocusOnNode) {
                  const success = canvasAPI.interruptAndFocusOnNode(targetNode.id);
                  if (!success) {
                    this.uiService.showError('Failed to focus on node - SpatialOrchestrator not ready');
                    return;
                  }
                } else {
                  this.uiService.showError('Canvas API not available - DreamSpace may not be open');
                  return;
                }
              } else {
                // Handle deleted node case
                console.warn(`Node ${nextEntry.nodeId} no longer exists, skipping redo step`);
                this.uiService.showError('Target node no longer exists - skipped to next state');
              }
            }
            
            // Restore visual state (flip state and scroll position) after layout restoration
            store.restoreVisualState(nextEntry);
          } finally {
            // Always clear the flag
            store.setRestoringFromHistory(false);
          }
          
        } catch (error) {
          console.error('Redo failed:', error);
          this.uiService.showError('Failed to redo layout change');
        }
      }
    });

    // Note: Semantic search commands now registered via registerSemanticSearchCommands()
  }

  /**
   * Register file explorer context menu for selecting DreamNodes
   * Works for any file or folder - intelligently finds the containing DreamNode
   */
  private registerFileExplorerContextMenu(): void {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
        // Show for all files and folders
        menu.addItem((item) => {
          item
            .setTitle('Reveal in DreamSpace')
            .setIcon('target')
            .onClick(async () => {
              await this.revealContainingDreamNode(file);
            });
        });
      })
    );
  }

  /**
   * Intelligently find and reveal the containing DreamNode for any file or folder
   */
  private async revealContainingDreamNode(file: TAbstractFile): Promise<void> {
    const vaultPath = (this.app.vault.adapter as any).basePath;

    console.log('[RevealDreamNode] Starting search for:', file.path);

    // Find the containing DreamNode by searching for .udd file
    const dreamNodePath = await this.findContainingDreamNode(file, vaultPath);

    console.log('[RevealDreamNode] Found DreamNode path:', dreamNodePath);

    if (!dreamNodePath) {
      this.uiService.showInfo('No DreamNode found for this item');
      return;
    }

    // Read the UUID from the .udd file
    const uddPath = path.join(dreamNodePath, '.udd');
    let uuid: string;

    try {
      const uddContent = fs.readFileSync(uddPath, 'utf-8');
      const uddData = JSON.parse(uddContent);
      uuid = uddData.uuid;
      console.log('[RevealDreamNode] Read UUID from .udd:', uuid);
    } catch (error) {
      console.error('[RevealDreamNode] Failed to read UUID from .udd:', error);
      this.uiService.showError('Failed to read DreamNode UUID');
      return;
    }

    if (!uuid) {
      console.error('[RevealDreamNode] No UUID found in .udd file');
      this.uiService.showError('Invalid DreamNode: missing UUID');
      return;
    }

    // Find the DreamNode by UUID (which is the node ID)
    const store = useInterBrainStore.getState();
    const nodeData = store.realNodes.get(uuid);

    if (!nodeData) {
      console.error('[RevealDreamNode] No matching node found for UUID:', uuid);
      console.log('[RevealDreamNode] Available UUIDs:', Array.from(store.realNodes.keys()));
      this.uiService.showWarning(`DreamNode not loaded: ${path.basename(dreamNodePath)}`);
      return;
    }

    const targetNode = nodeData.node;
    console.log('[RevealDreamNode] Found target node:', targetNode.name);

    // Open DreamSpace if not already open
    const dreamspaceLeaf = this.app.workspace.getLeavesOfType(DREAMSPACE_VIEW_TYPE)[0];
    if (!dreamspaceLeaf) {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: DREAMSPACE_VIEW_TYPE,
        active: true
      });
      this.app.workspace.revealLeaf(leaf);
      // Wait a bit for DreamSpace to initialize
      await new Promise(resolve => setTimeout(resolve, 300));
    } else {
      // Focus existing DreamSpace
      this.app.workspace.revealLeaf(dreamspaceLeaf);
    }

    // Select the node
    store.setSelectedNode(targetNode);

    // Switch to liminal-web layout to show the selected node
    if (store.spatialLayout !== 'liminal-web') {
      store.setSpatialLayout('liminal-web');
    }

    this.uiService.showInfo(`Revealed: ${targetNode.name}`);
  }

  /**
   * Find the containing DreamNode by searching upward for .udd file
   * Returns the absolute path to the DreamNode folder, or null if not found
   */
  private async findContainingDreamNode(file: TAbstractFile, vaultPath: string): Promise<string | null> {
    // Start from the file's directory (or the folder itself if it's a folder)
    let currentPath: string;

    if (file instanceof TFolder) {
      // For folders: first check if this folder has .udd directly inside
      currentPath = path.join(vaultPath, file.path);
      const uddInFolder = path.join(currentPath, '.udd');
      console.log('[FindDreamNode] Checking folder for .udd:', uddInFolder);
      if (fs.existsSync(uddInFolder)) {
        console.log('[FindDreamNode] Found .udd in folder!');
        return currentPath;
      }
      // If not, check parent (same level as this folder)
      currentPath = path.dirname(currentPath);
      console.log('[FindDreamNode] Not found in folder, moving to parent:', currentPath);
    } else {
      // For files: start from parent directory
      currentPath = path.join(vaultPath, path.dirname(file.path));
      console.log('[FindDreamNode] File detected, starting from parent:', currentPath);
    }

    // Walk up the tree looking for .udd file
    let iterations = 0;
    while (currentPath.startsWith(vaultPath)) {
      iterations++;
      const uddPath = path.join(currentPath, '.udd');
      console.log(`[FindDreamNode] Iteration ${iterations}: Checking ${uddPath}`);

      if (fs.existsSync(uddPath)) {
        console.log('[FindDreamNode] Found .udd file!');
        return currentPath;
      }

      // Move up one directory
      const parentPath = path.dirname(currentPath);

      // Stop if we've reached the vault root or can't go higher
      if (parentPath === currentPath || parentPath === vaultPath) {
        console.log('[FindDreamNode] Reached vault root, stopping');
        break;
      }

      currentPath = parentPath;
    }

    console.log('[FindDreamNode] No .udd file found after', iterations, 'iterations');
    return null;
  }

  // Helper method to get all available nodes (used by undo/redo)
  private async getAllAvailableNodes(): Promise<DreamNode[]> {
    try {
      const store = useInterBrainStore.getState();
      const dataMode = store.dataMode;
      const mockDataConfig = store.mockDataConfig;
      
      let allNodes: DreamNode[] = [];
      if (dataMode === 'mock') {
        // Get static mock data with persistent relationships
        const mockRelationshipData = store.mockRelationshipData;
        const staticNodes = getMockDataForConfig(mockDataConfig, mockRelationshipData || undefined);
        const service = serviceManager.getActive();
        const dynamicNodes = await service.list();
        allNodes = [...staticNodes, ...dynamicNodes];
      } else {
        // Real mode - get from store
        const realNodes = store.realNodes;
        allNodes = Array.from(realNodes.values()).map(data => data.node);
      }
      
      return allNodes;
    } catch (error) {
      console.error('Failed to get available nodes:', error);
      return [];
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    console.log('InterBrain plugin unloaded');

    // Clear passphrase from memory for security
    if (this.passphraseManager) {
      this.passphraseManager.clearPassphrase();
    }

    // Stop canvas observer
    if (this.canvasObserverService) {
      this.canvasObserverService.stop();
    }

    // Clean up leaf manager service
    if (this.leafManagerService) {
      this.leafManagerService.destroy();
    }

    // Clean up transcription service
    cleanupTranscriptionService();
  }
}