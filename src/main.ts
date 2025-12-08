import { Plugin, TFolder, TAbstractFile, Menu } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { UIService } from './core/services/ui-service';
import { GitService } from './core/services/git-service';
import { VaultService } from './core/services/vault-service';
import { GitTemplateService } from './core/services/git-template-service';
import { PassphraseManager } from './core/services/passphrase-manager';
import { serviceManager } from './core/services/service-manager';
import { DreamspaceView, DREAMSPACE_VIEW_TYPE } from './core/components/DreamspaceView';
import { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from './features/dreamweaving/DreamSongFullScreenView';
import { LinkFileView, LINK_FILE_VIEW_TYPE } from './features/dreamweaving/LinkFileView';
import { LeafManagerService } from './core/services/leaf-manager-service';
import { useInterBrainStore } from './core/store/interbrain-store';
import { calculateFibonacciSpherePositions } from './features/constellation-layout';
import { DreamNode } from './features/dreamnode';
import { registerSemanticSearchCommands } from './features/semantic-search/commands';
import { registerNavigationCommands } from './core/commands/navigation-commands';
import { registerDeveloperCommands } from './core/commands/developer-commands';
import { registerEditModeCommands } from './features/edit-mode';
import { registerConversationalCopilotCommands } from './features/conversational-copilot/commands';
import { registerDreamweavingCommands, registerLinkFileCommands, enhanceFileSuggestions } from './features/dreamweaving';
import { registerRadicleCommands } from './features/social-resonance/commands';
import { registerGitHubCommands } from './features/github-publishing/commands';
import { registerCoherenceBeaconCommands } from './features/coherence-beacon/commands';
import { registerHousekeepingCommands } from './features/social-resonance/housekeeping-commands';
import { registerDreamerUpdateCommands } from './features/updates/dreamer-update-commands';
import { registerRelationshipCommands } from './features/liminal-web-layout';
import { registerUpdateCommands } from './features/updates/commands';
import {
	registerTranscriptionCommands,
	cleanupTranscriptionService,
	initializeRealtimeTranscriptionService
} from './features/realtime-transcription';
import { ConstellationCommands } from './features/constellation-layout/commands';
import { registerFaceTimeCommands } from './features/video-calling/commands';
import { FaceTimeService } from './features/video-calling/service';
import { CanvasParserService } from './features/dreamweaving/services/canvas-parser-service';
import { SubmoduleManagerService } from './features/dreamweaving/services/submodule-manager-service';
import { CanvasObserverService } from './features/dreamweaving/services/canvas-observer-service';
import { CoherenceBeaconService } from './features/coherence-beacon/service';
import { initializeTranscriptionService } from './features/conversational-copilot/services/transcription-service';
import { initializeConversationRecordingService } from './features/conversational-copilot/services/conversation-recording-service';
import { initializeConversationSummaryService } from './features/conversational-copilot/services/conversation-summary-service';
import { initializeEmailExportService } from './features/conversational-copilot/services/email-export-service';
import { initializePDFGeneratorService } from './features/conversational-copilot/services/pdf-generator-service';
import { initializeAudioRecordingService } from './features/songline/services/audio-recording-service';
import { initializePerspectiveService } from './features/songline/services/perspective-service';
import { initializeAudioTrimmingService } from './features/songline/services/audio-trimming-service';
import { initializeConversationsService } from './features/songline/services/conversations-service';
import { initializeAudioStreamingService } from './features/dreamweaving/services/audio-streaming-service';
import { initializeMediaLoadingService } from './features/dreamnode/services/media-loading-service';
import { initializeURIHandlerService } from './features/uri-handler';
import { initializeRadicleBatchInitService } from './features/social-resonance/batch-init-service';
import { initializeGitHubBatchShareService } from './features/github-publishing/batch-share-service';
import { initializeUpdateCheckerService } from './features/updates/update-checker-service';
import { InterBrainSettingTab, InterBrainSettings, DEFAULT_SETTINGS } from './features/settings';

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

    // Every launch: check for reload target UUID, otherwise auto-select InterBrain
    const reloadTargetUUID = (globalThis as any).__interbrainReloadTargetUUID;
    console.log(`[InterBrain] Checking for reload target UUID...`);
    console.log(`[InterBrain] globalThis.__interbrainReloadTargetUUID =`, reloadTargetUUID);
    if (reloadTargetUUID) {
      console.log(`[InterBrain] ✅ Reload target UUID detected: ${reloadTargetUUID}`);
      delete (globalThis as any).__interbrainReloadTargetUUID; // Clean up after use
    } else {
      console.log(`[InterBrain] ℹ️ No reload target UUID - will select default InterBrain node`);
    }
    this.autoSelectNode(reloadTargetUUID);
  }

  /**
   * Auto-select a node on plugin startup (or reload)
   * Uses the same reliable logic as first launch
   * @param targetUUID - Optional UUID to select. Defaults to InterBrain UUID if not provided.
   */
  private autoSelectNode(targetUUID?: string): void {
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => {
        const uuidToSelect = targetUUID || '550e8400-e29b-41d4-a716-446655440000';
        const store = useInterBrainStore.getState();
        const nodeData = store.realNodes.get(uuidToSelect);

        if (nodeData) {
          console.log(`[InterBrain] Auto-selecting node: ${nodeData.node.name} (${uuidToSelect})`);
          store.setSelectedNode(nodeData.node);
          store.setSpatialLayout('liminal-web'); // Switch to liminal-web to prevent constellation return
        } else {
          console.warn(`[InterBrain] Node not found for UUID: ${uuidToSelect}`);

          // Fallback: Try again after vault scan completes
          if (targetUUID) {
            console.log(`[InterBrain] Retrying node selection after brief delay...`);
            setTimeout(() => {
              const retryStore = useInterBrainStore.getState();
              const retryNodeData = retryStore.realNodes.get(uuidToSelect);

              if (retryNodeData) {
                console.log(`[InterBrain] Auto-selecting node (retry): ${retryNodeData.node.name} (${uuidToSelect})`);
                retryStore.setSelectedNode(retryNodeData.node);
                retryStore.setSpatialLayout('liminal-web');
              } else {
                console.warn(`[InterBrain] Node still not found after retry: ${uuidToSelect}`);
              }
            }, 500); // Additional 500ms delay for vault scan to complete
          }
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
    const pluginPath = `${vaultPath}/.obsidian/plugins/${this.manifest.id}`;
    const { exec } = require('child_process');

    exec(`cd "${pluginPath}/src/features/realtime-transcription/scripts" && bash setup.sh`,
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
      initializePDFGeneratorService();
      initializeEmailExportService(this.app, this);
      initializeAudioRecordingService(this);
      initializePerspectiveService(this);
      initializeAudioTrimmingService();
      initializeConversationsService(this);
      initializeAudioStreamingService(this);
      console.log('[Plugin] Background services initialized');
    }, 100); // Tiny delay to let vault scan finish first

    // Run DreamSong relationship scan after vault scan completes
    setTimeout(() => {
      console.log('[Plugin] Starting DreamSong relationship scan...');

      // Run the scan via constellation commands
      this.app.commands.executeCommandById('interbrain:scan-vault-dreamsong-relationships');
    }, 600); // Wait for vault scan to complete (after update checker)

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
    this.passphraseManager = new PassphraseManager(this.uiService, this);
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
      serviceManager.getRadicleService(),
      this
    );
    this.leafManagerService = new LeafManagerService(this.app);
    this.canvasObserverService = new CanvasObserverService(this.app);

    // Initialize constellation commands
    this.constellationCommands = new ConstellationCommands(this);

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

    // Register navigation commands (flip animations, fullscreen views, search toggle)
    registerNavigationCommands(this, this.uiService);

    // Register developer/debug commands (wireframe sphere, intersection point, flying controls, camera reset)
    registerDeveloperCommands(this, this.uiService);

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

    // Register housekeeping commands (system maintenance)
    registerHousekeepingCommands(this);

    // Register Dreamer update commands (check all projects from peer)
    registerDreamerUpdateCommands(this);

    // Register relationship commands (bidirectional sync)
    registerRelationshipCommands(this);

    // Register update commands (auto-fetch and update management)
    registerUpdateCommands(this, this.uiService);

    // Register constellation commands (DreamSong relationship analysis)
    this.constellationCommands.registerCommands(this);

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

    // Open InterBrain Settings command
    this.addCommand({
      id: 'open-interbrain-settings',
      name: 'Open InterBrain Settings',
      callback: () => {
        // @ts-ignore - Private API
        this.app.setting.open();
        // @ts-ignore - Private API
        this.app.setting.openTabById('interbrain');
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
            await this.gitService.stashChanges(selectedNode.repoPath);
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
            await this.gitService.popStash(selectedNode.repoPath);
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

    // Save DreamNode command - Robust workflow with canvas sync
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

          console.log(`💾 [Save Changes] Starting save workflow for: ${currentNode.name}`);
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          const fullRepoPath = path.join(this.vaultService.getVaultPath(), currentNode.repoPath);

          // STEP 1: Check if DreamSong.canvas exists
          const dreamSongPath = `${currentNode.repoPath}/DreamSong.canvas`;
          const dreamSongFile = this.app.vault.getAbstractFileByPath(dreamSongPath);
          const hasDreamSong = dreamSongFile !== null;

          if (hasDreamSong) {
            console.log(`💾 [Save Changes] Step 1: DreamSong.canvas detected - syncing submodules (LOCAL-ONLY mode)...`);
            loadingNotice.hide();
            const syncNotice = this.uiService.showLoading('Syncing canvas submodules...');

            try {
              // Run canvas sync workflow (imports submodules, updates paths, commits)
              // SKIP RADICLE for local-only saves (massive performance improvement)
              const syncResult = await this.submoduleManagerService.syncCanvasSubmodules(
                dreamSongPath,
                { skipRadicle: true } // LOCAL-ONLY: Skip Radicle initialization for fast saves
              );

              if (!syncResult.success) {
                throw new Error(`Canvas sync failed: ${syncResult.error}`);
              }

              console.log(`💾 [Save Changes] ✓ Canvas synced (${syncResult.submodulesImported.length} submodules, Radicle skipped)`);
              syncNotice.hide();
            } catch (syncError) {
              syncNotice.hide();
              console.error('💾 [Save Changes] Canvas sync error:', syncError);
              // Non-fatal - continue with regular commit
              this.uiService.showWarning('Canvas sync had issues - continuing with commit');
            }
          } else {
            console.log(`💾 [Save Changes] Step 1: No DreamSong.canvas - skipping canvas sync`);
          }

          // STEP 2: Stage all remaining changes (anything not already committed by canvas sync)
          console.log(`💾 [Save Changes] Step 2: Staging all changes...`);
          await execAsync('git add -A', { cwd: fullRepoPath });

          // STEP 3: Check if there are changes to commit
          console.log(`💾 [Save Changes] Step 3: Checking for uncommitted changes...`);
          const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: fullRepoPath });

          if (!statusOutput.trim()) {
            console.log(`💾 [Save Changes] ✓ No changes to commit - repository is clean`);
            this.uiService.showSuccess('No changes to commit - all changes already saved');

            // Exit creator mode even if no changes
            const { creatorMode } = store;
            if (creatorMode.isActive && creatorMode.nodeId === currentNode.id) {
              store.setCreatorMode(false);
            }

            loadingNotice.hide();
            return;
          }

          // STEP 4: Commit remaining changes (with AI-generated message or fallback)
          console.log(`💾 [Save Changes] Step 4: Committing remaining changes...`);
          const commitNotice = this.uiService.showLoading('Creating commit...');

          try {
            // Try AI-generated commit message first
            await this.gitService.commitWithAI(currentNode.repoPath);
            commitNotice.hide();
            console.log(`💾 [Save Changes] ✓ Changes committed with AI-generated message`);
          } catch (commitError) {
            console.warn(`💾 [Save Changes] AI commit failed, using fallback message:`, commitError);

            // Fallback: Use simple generic commit message if AI fails
            try {
              const fallbackMessage = `Save changes in ${currentNode.name}`;
              await execAsync(`git commit -m "${fallbackMessage}"`, { cwd: fullRepoPath });
              commitNotice.hide();
              console.log(`💾 [Save Changes] ✓ Changes committed with fallback message`);
            } catch (fallbackError) {
              commitNotice.hide();
              throw fallbackError;
            }
          }

          // STEP 5: Exit creator mode after successful save
          const { creatorMode } = store;
          if (creatorMode.isActive && creatorMode.nodeId === currentNode.id) {
            store.setCreatorMode(false);
            console.log(`💾 [Save Changes] ✓ Exited creator mode`);
          }

          // STEP 6: Success feedback
          const summary = hasDreamSong
            ? 'DreamSong synced and all changes committed'
            : 'All changes committed';
          this.uiService.showSuccess(summary);
          console.log(`💾 [Save Changes] ✓ Save workflow complete`);

        } catch (error) {
          console.error('💾 [Save Changes] Failed:', error);
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

        try {
          // Use git service to open terminal at the repository folder and run claude --continue
          await this.gitService.openInTerminal(currentNode.repoPath);
          this.uiService.showSuccess(`Opened terminal for ${currentNode.name} and running claude --continue`);
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

    // Copy share link for selected DreamNode (with optional recipient DID for delegation)
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
          // Prompt for optional recipient DID (empty = just copy link without delegation)
          const recipientDid = await this.uiService.promptForText(
            'Enter recipient DID (or leave empty)',
            'did:key:z6Mk... (optional)'
          );

          const { ShareLinkService } = await import('./features/github-publishing/share-link-service');
          const shareLinkService = new ShareLinkService(this.app, this);

          // Pass recipientDid if provided (will be undefined if empty string)
          const effectiveRecipientDid = recipientDid && recipientDid.trim() !== '' ? recipientDid.trim() : undefined;
          await shareLinkService.copyShareLink(currentNode, effectiveRecipientDid);
        } catch (error) {
          console.error('Failed to copy share link:', error);
          this.uiService.showError(`Failed to copy share link: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    });

    // Scan vault for DreamNodes
    this.addCommand({
      id: 'scan-vault',
      name: 'Scan Vault for DreamNodes',
      callback: async () => {
        const loadingNotice = this.uiService.showLoading('Scanning vault for DreamNodes...');
        try {
          const stats = await serviceManager.scanVault();
          if (stats) {
            this.uiService.showSuccess(
              `Scan complete: ${stats.added} added, ${stats.updated} updated, ${stats.removed} removed`
            );

            // Trigger two-phase media loading after vault scan
            try {
              const { getMediaLoadingService } = await import('./features/dreamnode/services/media-loading-service');
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

    // Refresh plugin with node reselection
    // Uses lightweight plugin disable/enable instead of full app reload
    this.addCommand({
      id: 'refresh-plugin',
      name: 'Refresh Plugin (with node reselection)',
      hotkeys: [{ modifiers: ['Mod'], key: 'r' }],
      callback: async () => {
        const store = useInterBrainStore.getState();
        const currentNode = store.selectedNode;

        // CRITICAL: Only set UUID if not already set by another flow (e.g., URI handler)
        // This prevents refresh command from overwriting explicit auto-selection targets
        const existingUUID = (globalThis as any).__interbrainReloadTargetUUID;
        if (existingUUID) {
          console.log(`[Refresh] ℹ️ UUID already set externally: ${existingUUID}`);
          console.log(`[Refresh] Preserving external auto-selection target (not using current node)`);
        } else {
          // Store current node UUID for reselection after reload
          let nodeUUID: string | undefined;
          if (currentNode) {
            nodeUUID = currentNode.id;
            console.log(`[Refresh] ✅ Current node selected: ${currentNode.name} (${nodeUUID})`);
            console.log(`[Refresh] Storing UUID for reselection...`);
          } else {
            console.log(`[Refresh] ℹ️ No node currently selected`);
          }

          // Store UUID in a global variable that persists across plugin reload
          (globalThis as any).__interbrainReloadTargetUUID = nodeUUID;
          console.log(`[Refresh] globalThis.__interbrainReloadTargetUUID set to:`, (globalThis as any).__interbrainReloadTargetUUID);
        }

        // Note: Bidirectional relationship sync is no longer needed with liminal-web.json architecture
        // Relationships are computed from Dreamer → Dream pointers during vault scan

        // Clean up dangling relationships before reload
        // This ensures deleted nodes are properly removed from relationship references
        console.log(`[Refresh] Cleaning dangling relationships...`);
        await (this.app as any).commands.executeCommandById('interbrain:clean-dangling-relationships');
        console.log(`[Refresh] Dangling relationship cleanup complete`);

        // Lightweight plugin reload using Obsidian's plugin manager
        // This is much faster than app:reload and preserves console logs
        console.log(`[Refresh] Triggering lightweight plugin reload...`);
        const plugins = (this.app as any).plugins;
        await plugins.disablePlugin('interbrain');
        await plugins.enablePlugin('interbrain');
        console.log(`[Refresh] Plugin reload complete`);
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

        // Show "Convert to DreamNode" for folders only
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('Convert to DreamNode')
              .setIcon('git-fork')
              .onClick(async () => {
                await this.convertToDreamNode(file);
              });
          });
        }
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

  /**
   * Convert a regular directory into a DreamNode (idempotent)
   * Fills in any missing pieces: .git repo, .udd file, hooks, README, LICENSE
   */
  private async convertToDreamNode(folder: TFolder): Promise<void> {
    const vaultPath = (this.app.vault.adapter as any).basePath;
    const folderPath = path.join(vaultPath, folder.path);
    const folderName = path.basename(folder.path);

    // Set up execAsync for git operations
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    console.log('[ConvertToDreamNode] Starting conversion for:', folderPath);

    try {
      // Check what's already present
      const hasGit = fs.existsSync(path.join(folderPath, '.git'));
      const hasUdd = fs.existsSync(path.join(folderPath, '.udd'));
      const hasReadme = fs.existsSync(path.join(folderPath, 'README.md'));
      const hasLicense = fs.existsSync(path.join(folderPath, 'LICENSE'));

      console.log('[ConvertToDreamNode] Current state:', { hasGit, hasUdd, hasReadme, hasLicense });

      // Generate or read UUID
      let uuid: string;
      let title: string = folderName;
      let type: 'dream' | 'dreamer' = 'dream';

      if (hasUdd) {
        // Read existing .udd file
        const uddContent = fs.readFileSync(path.join(folderPath, '.udd'), 'utf-8');
        const uddData = JSON.parse(uddContent);
        uuid = uddData.uuid;
        title = uddData.title || folderName;
        type = uddData.type || 'dream';
        console.log('[ConvertToDreamNode] Using existing UUID from .udd:', uuid);
      } else {
        // Generate new UUID
        const crypto = require('crypto');
        uuid = crypto.randomUUID();
        console.log('[ConvertToDreamNode] Generated new UUID:', uuid);
      }

      // Initialize git if not present
      if (!hasGit) {
        console.log('[ConvertToDreamNode] Initializing git with template...');
        const templatePath = path.join(vaultPath, '.obsidian', 'plugins', this.manifest.id, 'DreamNode-template');
        await execAsync(`git init --template="${templatePath}" "${folderPath}"`);

        // Make hooks executable
        const hooksDir = path.join(folderPath, '.git', 'hooks');
        if (fs.existsSync(hooksDir)) {
          await execAsync(`chmod +x "${path.join(hooksDir, 'pre-commit')}"`, { cwd: folderPath });
          await execAsync(`chmod +x "${path.join(hooksDir, 'post-commit')}"`, { cwd: folderPath });
          console.log('[ConvertToDreamNode] Made hooks executable');
        }
      }

      // Create/update .udd file
      if (!hasUdd) {
        console.log('[ConvertToDreamNode] Creating .udd file...');
        const uddContent = {
          uuid,
          title,
          type,
          dreamTalk: '',
          liminalWebRelationships: type === 'dreamer' ? ['550e8400-e29b-41d4-a716-446655440000'] : [],
          submodules: [],
          supermodules: []
        };
        fs.writeFileSync(path.join(folderPath, '.udd'), JSON.stringify(uddContent, null, 2));
      } else {
        // Validate existing .udd has all required fields
        const uddPath = path.join(folderPath, '.udd');
        const uddContent = JSON.parse(fs.readFileSync(uddPath, 'utf-8'));
        let updated = false;

        // Ensure all required fields exist
        if (!uddContent.liminalWebRelationships) {
          uddContent.liminalWebRelationships = type === 'dreamer' ? ['550e8400-e29b-41d4-a716-446655440000'] : [];
          updated = true;
        }
        if (!uddContent.submodules) {
          uddContent.submodules = [];
          updated = true;
        }
        if (!uddContent.supermodules) {
          uddContent.supermodules = [];
          updated = true;
        }
        if (!uddContent.dreamTalk) {
          uddContent.dreamTalk = '';
          updated = true;
        }

        if (updated) {
          fs.writeFileSync(uddPath, JSON.stringify(uddContent, null, 2));
          console.log('[ConvertToDreamNode] Updated .udd with missing fields');
        }
      }

      // Create README if not present
      if (!hasReadme) {
        console.log('[ConvertToDreamNode] Creating README.md...');
        const readmeContent = `# ${title}\n\nA DreamNode in the InterBrain network.\n`;
        fs.writeFileSync(path.join(folderPath, 'README.md'), readmeContent);
      }

      // Create LICENSE if not present
      if (!hasLicense) {
        console.log('[ConvertToDreamNode] Creating LICENSE...');
        const licenseContent = `GNU AFFERO GENERAL PUBLIC LICENSE
Version 3, 19 November 2007

This DreamNode is licensed under the GNU AGPL v3.
See https://www.gnu.org/licenses/agpl-3.0.html for full license text.
`;
        fs.writeFileSync(path.join(folderPath, 'LICENSE'), licenseContent);
      }

      // Commit changes if there are any uncommitted files
      const gitStatus = await execAsync('git status --porcelain', { cwd: folderPath });
      if (gitStatus.stdout.trim()) {
        console.log('[ConvertToDreamNode] Committing DreamNode initialization...');
        await execAsync('git add -A', { cwd: folderPath });
        try {
          await execAsync(`git commit -m "Convert to DreamNode: ${title}"`, { cwd: folderPath });
        } catch (commitError: any) {
          // Verify commit succeeded (hooks may output to stderr)
          try {
            await execAsync('git rev-parse HEAD', { cwd: folderPath });
            console.log('[ConvertToDreamNode] Commit verified successful');
          } catch {
            throw commitError;
          }
        }
      } else {
        console.log('[ConvertToDreamNode] No uncommitted changes, skipping commit');
      }

      // Initialize Radicle if not already initialized
      const hasRadicle = fs.existsSync(path.join(folderPath, '.rad'));
      if (!hasRadicle) {
        console.log('[ConvertToDreamNode] Initializing Radicle repository...');
        try {
          const settings = (this as any).settings;
          const passphrase = settings?.radiclePassphrase;
          const process = require('process');
          const env = { ...process.env };
          if (passphrase) {
            env.RAD_PASSPHRASE = passphrase;
          }

          const nodeTypeLabel = type === 'dreamer' ? 'DreamerNode' : 'DreamNode';
          const timestamp = new Date().toISOString();
          const description = `${nodeTypeLabel} ${timestamp}`;

          const { spawn } = require('child_process');
          const radCommand = 'rad'; // Assume rad is in PATH

          const radInitPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
            const child = spawn(radCommand, [
              'init',
              folderPath,
              '--private',
              '--name', folderName,
              '--default-branch', 'main',
              '--description', description,
              '--no-confirm',
              '--no-seed'
            ], {
              env,
              cwd: folderPath,
              stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data: any) => {
              stdout += data.toString();
            });

            child.stderr?.on('data', (data: any) => {
              stderr += data.toString();
            });

            child.on('close', (code: number) => {
              if (code === 0) {
                resolve({ stdout, stderr });
              } else {
                reject(new Error(`rad init exited with code ${code}`));
              }
            });

            child.on('error', reject);
            child.stdin?.end();
          });

          const radResult = await radInitPromise;

          // Extract and save RID
          const ridMatch = radResult.stdout.match(/rad:z[a-zA-Z0-9]+/);
          if (ridMatch) {
            const radicleId = ridMatch[0];
            const uddPath = path.join(folderPath, '.udd');
            const uddContent = JSON.parse(fs.readFileSync(uddPath, 'utf-8'));
            uddContent.radicleId = radicleId;
            fs.writeFileSync(uddPath, JSON.stringify(uddContent, null, 2));

            await execAsync('git add .udd', { cwd: folderPath });
            await execAsync('git commit -m "Add Radicle ID to DreamNode"', { cwd: folderPath });
            console.log('[ConvertToDreamNode] Added Radicle ID:', radicleId);
          }
        } catch (radError) {
          console.warn('[ConvertToDreamNode] Radicle init failed (continuing anyway):', radError);
        }
      }

      // Refresh the vault to pick up the new DreamNode
      console.log('[ConvertToDreamNode] Rescanning vault...');
      await serviceManager.scanVault();

      this.uiService.showInfo(`Successfully converted "${title}" to DreamNode`);
      console.log('[ConvertToDreamNode] Conversion complete!');

    } catch (error) {
      console.error('[ConvertToDreamNode] Conversion failed:', error);
      this.uiService.showError(`Failed to convert to DreamNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Helper method to get all available nodes (used by undo/redo)
  private async getAllAvailableNodes(): Promise<DreamNode[]> {
    try {
      const store = useInterBrainStore.getState();
      const realNodes = store.realNodes;
      const allNodes = Array.from(realNodes.values()).map(data => data.node);
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

    // Note: Passphrase is stored in settings, not cleared on unload
    // This preserves user's passphrase configuration across reloads

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