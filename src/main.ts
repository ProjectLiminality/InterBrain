import { Plugin, TFolder, TAbstractFile, Menu, Notice } from 'obsidian';
import { UIService } from './core/services/ui-service';
import { GitOperationsService } from './features/dreamnode/utils/git-operations';
import { VaultService } from './core/services/vault-service';
import { PassphraseManager } from './features/social-resonance-filter/services/passphrase-manager';
import { serviceManager } from './core/services/service-manager';
import { DreamspaceView, DREAMSPACE_VIEW_TYPE } from './core/components/DreamspaceView';
import { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from './features/dreamweaving/components/DreamSongFullScreenView';
import { LinkFileView, LINK_FILE_VIEW_TYPE } from './features/dreamweaving/components/LinkFileView';
import { LeafManagerService } from './core/services/leaf-manager-service';
import { useInterBrainStore } from './core/store/interbrain-store';
import { CONSTELLATION_DEFAULTS } from './features/constellation-layout/constants';
import { calculateFibonacciSpherePositions } from './features/constellation-layout';
import {
  DreamNode,
  registerDreamNodeCommands,
  revealContainingDreamNode,
  convertFolderToDreamNode,
  openDreamSongForFile,
  openDreamTalkForFile
} from './features/dreamnode';
import { registerSemanticSearchCommands } from './features/semantic-search/commands';
import { registerCameraCommands } from './core/commands/camera-commands';
import { registerSearchCommands } from './features/search';
import { registerConstellationDebugCommands } from './features/constellation-layout';
import { registerEditModeCommands } from './features/dreamnode-editor';
import { registerConversationalCopilotCommands } from './features/conversational-copilot/commands';
import { registerDreamweavingCommands, registerLinkFileCommands, enhanceFileSuggestions } from './features/dreamweaving';
import { registerRadicleCommands } from './features/social-resonance-filter/commands';
import { registerGitHubCommands } from './features/github-publishing/commands';
import { registerCoherenceBeaconCommands } from './features/coherence-beacon/commands';
import { registerDreamerUpdateCommands } from './features/dreamnode-updater/dreamer-update-commands';
import { registerRelationshipCommands } from './features/liminal-web-layout';
import { registerUpdateCommands } from './features/dreamnode-updater/commands';
import { registerCollaborationTestCommands } from './features/dreamnode-updater/collaboration-test-commands';
import { initializeCollaborationMemoryService } from './features/dreamnode-updater/services/collaboration-memory-service';
import { initializeCherryPickWorkflowService } from './features/dreamnode-updater/services/cherry-pick-workflow-service';
import {
	registerTranscriptionCommands,
	cleanupTranscriptionService,
	initializeRealtimeTranscriptionService
} from './features/realtime-transcription';
import { registerFaceTimeCommands } from './features/video-calling/commands';
import { registerTutorialCommands } from './features/tutorial';
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
import { initializeURIHandlerService } from './features/uri-handler';
import { initializeRadicleBatchInitService } from './features/social-resonance-filter/services/batch-init-service';
import { initializeGitHubBatchShareService } from './features/github-publishing/services/batch-share-service';
import { InterBrainSettingTab, InterBrainSettings, DEFAULT_SETTINGS } from './features/settings';
import { closeIndexedDBConnection, setVaultId, gracefulShutdown, markHydrationComplete } from './core/store/indexeddb-storage';
import { serviceLifecycleManager, LifecyclePhase } from './core/services/service-lifecycle-manager';
import { vaultStateService } from './core/services/vault-state-service';
import { SettingsStatusService } from './features/settings/settings-status-service';
import {
  registerFeedbackCommands,
  errorCaptureService,
  showFeedbackModal,
} from './features/feedback';
import {
  registerAIMagicCommands,
  initializeInferenceService
} from './features/ai-magic';

export default class InterBrainPlugin extends Plugin {
  settings!: InterBrainSettings;

  // Service instances
  private uiService!: UIService;
  private gitOpsService!: GitOperationsService;
  private vaultService!: VaultService;
  private passphraseManager!: PassphraseManager;
  private faceTimeService!: FaceTimeService;
  private canvasParserService!: CanvasParserService;
  private submoduleManagerService!: SubmoduleManagerService;
  public coherenceBeaconService!: CoherenceBeaconService;
  private leafManagerService!: LeafManagerService;
  private canvasObserverService!: CanvasObserverService;

  async onload() {
    console.log('[Plugin] InterBrain loading with lifecycle manager...');
    const loadStartTime = Date.now();

    // Get vault path for all services
    const vaultPath = (this.app.vault.adapter as any).basePath;

    // =========================================================================
    // PHASE 1: BOOTSTRAP - Set context, load settings
    // =========================================================================
    serviceLifecycleManager.registerPhaseHandler(LifecyclePhase.BOOTSTRAP, async () => {
      // Set vault ID for IndexedDB namespacing FIRST
      setVaultId(vaultPath);
      vaultStateService.initialize(vaultPath);

      // Load settings
      await this.loadSettings();

      // Cache settings for services that need runtime access
      SettingsStatusService.setSettings({
        claudeApiKey: this.settings.claudeApiKey,
        radiclePassphrase: this.settings.radiclePassphrase,
      });

      // Initialize AI Magic inference service
      initializeInferenceService({
        defaultProvider: (this.settings.defaultAIProvider || 'claude') as any,
        offlineMode: this.settings.offlineMode ?? false,
        preferLocal: false,
        claude: this.settings.claudeApiKey ? { apiKey: this.settings.claudeApiKey } : undefined,
        openai: this.settings.openaiApiKey ? { apiKey: this.settings.openaiApiKey } : undefined,
        groq: this.settings.groqApiKey ? { apiKey: this.settings.groqApiKey } : undefined,
        xai: this.settings.xaiApiKey ? { apiKey: this.settings.xaiApiKey } : undefined
      });

      return { vaultPath };
    });

    // =========================================================================
    // PHASE 2: HYDRATE - Read IndexedDB, validate persisted data
    // =========================================================================
    serviceLifecycleManager.registerPhaseHandler(LifecyclePhase.HYDRATE, async () => {
      console.log('[Plugin] Triggering manual store hydration...');
      await useInterBrainStore.persist.rehydrate();

      // Mark hydration complete - this enables writes to IndexedDB
      // Must happen AFTER rehydrate to prevent empty state from overwriting persisted data
      markHydrationComplete();

      // Check if persisted data matches current vault
      const store = useInterBrainStore.getState();
      const nodeCount = store.dreamNodes.size;

      console.log(`[Plugin] Hydrated ${nodeCount} nodes from IndexedDB`);
      return { nodeCount };
    });

    // =========================================================================
    // PHASE 3: SCAN - Scan vault (only if needed based on vault state)
    // =========================================================================
    serviceLifecycleManager.registerPhaseHandler(LifecyclePhase.SCAN, async () => {
      // Initialize core services (creates GitDreamNodeService)
      this.initializeServices();

      // Check if vault has changed since last scan
      const changeResult = await vaultStateService.hasVaultChanged();

      if (!changeResult.hasChanges && changeResult.cachedState) {
        // Validate persisted node count matches
        const store = useInterBrainStore.getState();
        const persistedCount = store.dreamNodes.size;
        const cachedCount = changeResult.cachedState.nodeCount;

        if (persistedCount === cachedCount && persistedCount > 0) {
          console.log(`[Plugin] Vault unchanged, using ${persistedCount} cached nodes (skipping scan)`);
          return { scanned: false, nodeCount: persistedCount, reason: 'cached' };
        }
      }

      // Need to scan - either vault changed or no cached data
      console.log(`[Plugin] Scanning vault (reason: ${changeResult.reason})...`);
      const scanResult = await serviceManager.scanVault();

      if (scanResult) {
        // Save vault state for next startup
        const store = useInterBrainStore.getState();
        const nodeCount = store.dreamNodes.size;
        await vaultStateService.saveState(nodeCount);

        return {
          scanned: true,
          nodeCount,
          added: scanResult.added,
          updated: scanResult.updated,
          removed: scanResult.removed
        };
      }

      return { scanned: true, nodeCount: 0, error: 'scan returned null' };
    });

    // =========================================================================
    // PHASE 4: READY - UI can interact, services available
    // =========================================================================
    serviceLifecycleManager.registerPhaseHandler(LifecyclePhase.READY, async () => {
      // Initialize essential services for URI handling
      const radicleService = serviceManager.getRadicleService();
      const dreamNodeService = serviceManager.getActive();
      initializeURIHandlerService(this.app, this, radicleService, dreamNodeService as any);
      initializeRadicleBatchInitService(this, radicleService, dreamNodeService as any);
      initializeGitHubBatchShareService(this, dreamNodeService as any);

      // Initialize error capture for bug reporting
      this.initializeErrorCapture();

      return { ready: true };
    });

    // =========================================================================
    // PHASE 5: BACKGROUND - Heavy operations (deferred)
    // =========================================================================
    serviceLifecycleManager.registerPhaseHandler(LifecyclePhase.BACKGROUND, async () => {
      // These run after READY, non-blocking
      this.initializeBackgroundServices();
      return { backgroundStarted: true };
    });

    // =========================================================================
    // RUN LIFECYCLE
    // =========================================================================
    await serviceLifecycleManager.runLifecycle();

    const loadDuration = Date.now() - loadStartTime;
    console.log(`[Plugin] Lifecycle complete in ${loadDuration}ms`);

    // =========================================================================
    // POST-LIFECYCLE SETUP (sync, non-blocking)
    // =========================================================================

    // Add settings tab
    this.addSettingTab(new InterBrainSettingTab(this.app, this));

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
      delete (globalThis as any).__interbrainReloadTargetUUID;
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
        // Detect fresh Obsidian launch vs plugin reload
        // On fresh launch, DreamSpace view won't exist yet
        const existingDreamspaceLeaf = this.app.workspace.getLeavesOfType(DREAMSPACE_VIEW_TYPE);
        const isFreshLaunch = existingDreamspaceLeaf.length === 0;

        const uuidToSelect = targetUUID || '550e8400-e29b-41d4-a716-446655440000';
        const store = useInterBrainStore.getState();
        const nodeData = store.dreamNodes.get(uuidToSelect);

        if (nodeData) {
          console.log(`[InterBrain] Auto-selecting node: ${nodeData.node.name} (${uuidToSelect})`);
          store.setSelectedNode(nodeData.node);
          store.setSpatialLayout('liminal-web'); // Switch to liminal-web to prevent constellation return

          // Show portal overlay on fresh Obsidian launch (not plugin reload)
          // Check if this is a reload by looking for the reload flag
          const isPluginReload = (globalThis as any).__interbrainPluginReloaded === true;
          console.log(`[InterBrain] isFreshLaunch=${isFreshLaunch}, isPluginReload=${isPluginReload}`);

          if (!isPluginReload) {
            console.log('[InterBrain] Fresh app launch detected - portal disabled for testing');
            // DISABLED FOR TESTING: Tutorial portal
            // setTimeout(() => {
            //   console.log('[InterBrain] Calling showTutorialPortal()');
            //   store.showTutorialPortal();
            // }, 500);

            // Check for InterBrain updates on fresh launch
            setTimeout(() => {
              console.log('[InterBrain] Checking for InterBrain updates...');
              this.app.commands.executeCommandById('interbrain:check-interbrain-updates');
            }, 2000); // Delay to let UI settle first
          }

          // Set reload flag for next time (persists across plugin reloads but not app restarts)
          (globalThis as any).__interbrainPluginReloaded = true;
        } else {
          console.warn(`[InterBrain] Node not found for UUID: ${uuidToSelect}`);

          // Fallback: Try again after vault scan completes
          if (targetUUID) {
            console.log(`[InterBrain] Retrying node selection after brief delay...`);
            setTimeout(() => {
              const retryStore = useInterBrainStore.getState();
              const retryNodeData = retryStore.dreamNodes.get(uuidToSelect);

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
        const nodeData = store.dreamNodes.get(interbrainUUID);

        if (nodeData) {
          console.log('[InterBrain] Selecting InterBrain node');
          store.setSelectedNode(nodeData.node);
          store.setSpatialLayout('liminal-web');

          // DISABLED FOR TESTING: Tutorial portal
          // store.showTutorialPortal();
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

  /**
   * Initialize error capture for bug reporting
   * Captures console logs and error events, respecting user preferences
   *
   * Rate limiting is GLOBAL (not per-error) to prevent error loops from
   * spamming the user with modals. After sending a report, no modal will
   * appear for 30 seconds regardless of whether it's the same or different error.
   */
  private initializeErrorCapture(): void {
    errorCaptureService.initialize({
      onError: (error) => {
        const store = useInterBrainStore.getState();
        const preference = store.feedback.autoReportPreference;

        if (preference === 'never') {
          // Just log, don't prompt
          console.log('[ErrorCapture] Error captured but auto-report is disabled');
          return;
        }

        // Check modal throttle - prevents modal spam during error loops
        if (!store.canShowModal()) {
          // Show notice once per throttle period, then silent
          if (store.shouldShowModalThrottleNotice()) {
            const secondsRemaining = Math.ceil(
              (30000 - (Date.now() - (store.feedback.lastModalTimestamp || 0))) / 1000
            );
            new Notice(
              `Additional error captured. To prevent dialog spam, the report dialog will be available again in ${secondsRemaining}s. You can also report manually via Command Palette → "Report a Bug".`,
              5000
            );
            store.markModalThrottleNoticeShown();
          }
          return;
        }

        if (preference === 'always') {
          store.openFeedbackModal(error);
          store.recordModalShown();
          return;
        }

        // Default: 'ask' - show modal
        store.openFeedbackModal(error);
        store.recordModalShown();
        showFeedbackModal(this.app);
      },
    });

    // Register cleanup on plugin unload
    this.register(() => {
      errorCaptureService.cleanup();
    });

    // Reset session counts when plugin reloads
    useInterBrainStore.getState().resetSessionCounts();
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

      // Initialize collaboration services
      const vaultPath = (this.app.vault.adapter as any).basePath;
      initializeCollaborationMemoryService(vaultPath);
      initializeCherryPickWorkflowService(this.app);

      console.log('[Plugin] Background services initialized');
    }, 100); // Tiny delay to let vault scan finish first

    // Run DreamSong relationship scan after vault scan completes
    setTimeout(async () => {
      try {
        // Run the scan via dreamweaving commands
        this.app.commands.executeCommandById('interbrain:scan-dreamsong-relationships');
      } catch (error) {
        console.error('[Plugin] DreamSong relationship scan failed:', error);
      }
    }, 600); // Wait for vault scan to complete (after update checker)

  }

  private initializeServices(): void {
    this.uiService = new UIService(this.app);
    this.gitOpsService = new GitOperationsService(this.app);
    this.vaultService = new VaultService(this.app.vault, this.app);
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

    // Register DreamNode commands (flip animations, fullscreen views)
    registerDreamNodeCommands(this, this.uiService);

    // Register search commands (search toggle)
    registerSearchCommands(this, this.uiService);

    // Register camera commands (flying controls, camera reset)
    registerCameraCommands(this, this.uiService);

    // Register constellation debug commands (wireframe sphere, intersection point)
    registerConstellationDebugCommands(this, this.uiService);

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

    // Register Dreamer update commands (check all projects from peer)
    registerDreamerUpdateCommands(this);

    // Register relationship commands (bidirectional sync)
    registerRelationshipCommands(this);

    // Register update commands (auto-fetch and update management)
    registerUpdateCommands(this, this.uiService);

    // Register collaboration test commands (UI testing for cherry-pick workflow)
    registerCollaborationTestCommands(this, this.uiService);

    // Register link file commands (.link file support)
    registerLinkFileCommands(this, this.uiService);

    // Enhance file suggestions to include .link files
    enhanceFileSuggestions(this);

    // Initialize and register real-time transcription
    initializeRealtimeTranscriptionService(this);
    registerTranscriptionCommands(this);

    // Register feedback commands (bug reporting)
    registerFeedbackCommands(this);

    // Register AI Magic commands (provider testing)
    registerAIMagicCommands(this);

    // Register tutorial commands (onboarding system)
    registerTutorialCommands(this, this.uiService);
    
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
            await this.gitOpsService.stashChanges(selectedNode.repoPath);
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
            await this.gitOpsService.popStash(selectedNode.repoPath);
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
          const path = require('path');
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

          // STEP 4: Commit remaining changes
          console.log(`💾 [Save Changes] Step 4: Committing remaining changes...`);
          const commitNotice = this.uiService.showLoading('Creating commit...');

          try {
            const commitMessage = `Save changes in ${currentNode.name}`;
            await execAsync(`git commit -m "${commitMessage}"`, { cwd: fullRepoPath });
            commitNotice.hide();
            console.log(`💾 [Save Changes] ✓ Changes committed`);
          } catch (commitError) {
            commitNotice.hide();
            throw commitError;
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
          draft: newState.creationState.draft,
          position: spawnPosition
        });
        console.log('DreamNodeCreator should appear in DreamSpace');
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
          await this.gitOpsService.openInFinder(currentNode.repoPath);
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
          await this.gitOpsService.openInTerminal(currentNode.repoPath);
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

          const { ShareLinkService } = await import('./features/github-publishing/services/share-link-service');
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
          }
        } catch (error) {
          this.uiService.showError(error instanceof Error ? error.message : 'Vault scan failed');
        } finally {
          loadingNotice.hide();
        }
      }
    });

    // =========================================================================
    // REFRESH COMMANDS - Separated by concern for faster Cmd+R
    // =========================================================================

    // FAST: Refresh plugin (Cmd+R) - Just reload plugin, no heavy operations
    this.addCommand({
      id: 'refresh-plugin',
      name: 'Refresh Plugin (fast)',
      hotkeys: [{ modifiers: ['Mod'], key: 'r' }],
      callback: async () => {
        const refreshStart = Date.now();
        console.log(`[Refresh] Starting fast refresh...`);

        const store = useInterBrainStore.getState();
        const currentNode = store.selectedNode;

        // Store current node UUID for reselection after reload
        const existingUUID = (globalThis as any).__interbrainReloadTargetUUID;
        if (!existingUUID && currentNode) {
          (globalThis as any).__interbrainReloadTargetUUID = currentNode.id;
          console.log(`[Refresh] Will reselect: ${currentNode.name}`);
        }

        // Use graceful shutdown to wait for pending writes
        await gracefulShutdown(2000);

        // Lightweight plugin reload
        console.log(`[Refresh] Reloading plugin...`);
        const plugins = (this.app as any).plugins;
        await plugins.disablePlugin('interbrain');
        await plugins.enablePlugin('interbrain');

        console.log(`[Refresh] Complete in ${Date.now() - refreshStart}ms`);
      }
    });

    // FULL: Refresh with cleanup and indexing (manual)
    this.addCommand({
      id: 'refresh-full',
      name: 'Refresh Full (cleanup + indexing)',
      callback: async () => {
        const refreshStart = Date.now();
        console.log(`[Refresh Full] Starting full refresh...`);

        const store = useInterBrainStore.getState();
        const currentNode = store.selectedNode;

        // Store current node UUID for reselection
        if (currentNode) {
          (globalThis as any).__interbrainReloadTargetUUID = currentNode.id;
        }

        // Clean up dangling relationships
        console.log(`[Refresh Full] Cleaning dangling relationships...`);
        await (this.app as any).commands.executeCommandById('interbrain:clean-dangling-relationships');

        // Index any missing nodes
        console.log(`[Refresh Full] Ensuring all nodes are indexed...`);
        try {
          const { indexingService } = await import('./features/semantic-search/services/indexing-service');
          const indexResult = await indexingService.ensureAllIndexed();
          console.log(`[Refresh Full] Indexed ${indexResult.indexed} nodes (${indexResult.skipped} already indexed)`);
        } catch (error) {
          console.warn(`[Refresh Full] Indexing failed (non-critical):`, error);
        }

        // Use graceful shutdown
        await gracefulShutdown(3000);

        // Reload plugin
        console.log(`[Refresh Full] Reloading plugin...`);
        const plugins = (this.app as any).plugins;
        await plugins.disablePlugin('interbrain');
        await plugins.enablePlugin('interbrain');

        console.log(`[Refresh Full] Complete in ${Date.now() - refreshStart}ms`);
      }
    });

    // SYNC: Radicle sync (manual, opt-in)
    this.addCommand({
      id: 'sync-network',
      name: 'Sync with Radicle Network',
      callback: async () => {
        console.log(`[Sync] Triggering Radicle peer sync...`);
        await (this.app as any).commands.executeCommandById('interbrain:sync-radicle-peer-following');
        console.log(`[Sync] Radicle sync initiated`);
      }
    });

    // REINDEX: Force full reindex (manual, heavy)
    this.addCommand({
      id: 'force-reindex',
      name: 'Force Reindex All Nodes',
      callback: async () => {
        const loadingNotice = this.uiService.showLoading('Re-indexing all nodes...');
        try {
          const { indexingService } = await import('./features/semantic-search/services/indexing-service');
          const result = await indexingService.indexAllNodes();
          this.uiService.showSuccess(`Indexed ${result.indexed} nodes (${result.errors} errors)`);
        } catch (error) {
          this.uiService.showError(`Indexing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
          loadingNotice.hide();
        }
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
            // Restore the layout state via store-based navigation
            if (previousEntry.layout === 'constellation') {
              // Going to constellation - set layout and request navigation
              store.setSelectedNode(null);
              store.setSpatialLayout('constellation');
              store.requestNavigation({ type: 'constellation', interrupt: true });
            } else if (previousEntry.layout === 'liminal-web' && previousEntry.nodeId) {
              // Going to liminal-web - need to find and focus on the node
              const allNodes = await this.getAllAvailableNodes();
              const targetNode = allNodes.find(node => node.id === previousEntry.nodeId);

              if (targetNode) {
                // Update store, set layout, and request navigation
                store.setSelectedNode(targetNode);
                store.setSpatialLayout('liminal-web');
                store.requestNavigation({ type: 'focus', nodeId: targetNode.id, interrupt: true });
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
            // Restore the layout state via store-based navigation
            if (nextEntry.layout === 'constellation') {
              // Going to constellation - set layout and request navigation
              store.setSelectedNode(null);
              store.setSpatialLayout('constellation');
              store.requestNavigation({ type: 'constellation', interrupt: true });
            } else if (nextEntry.layout === 'liminal-web' && nextEntry.nodeId) {
              // Going to liminal-web - need to find and focus on the node
              const allNodes = await this.getAllAvailableNodes();
              const targetNode = allNodes.find(node => node.id === nextEntry.nodeId);

              if (targetNode) {
                // Update store, set layout, and request navigation
                store.setSelectedNode(targetNode);
                store.setSpatialLayout('liminal-web');
                store.requestNavigation({ type: 'focus', nodeId: targetNode.id, interrupt: true });
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
              await revealContainingDreamNode(this, this.uiService, file);
            });
        });

        // Open DreamSong for the containing DreamNode
        menu.addItem((item) => {
          item
            .setTitle('Open DreamSong')
            .setIcon('layout-dashboard')
            .onClick(async () => {
              await openDreamSongForFile(this, this.uiService, file);
            });
        });

        // Open DreamTalk for the containing DreamNode
        menu.addItem((item) => {
          item
            .setTitle('Open DreamTalk')
            .setIcon('play-circle')
            .onClick(async () => {
              await openDreamTalkForFile(this, this.uiService, file);
            });
        });

        // Show "Convert to DreamNode" for folders only
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('Convert to DreamNode')
              .setIcon('git-fork')
              .onClick(async () => {
                const passphrase = (this as any).settings?.radiclePassphrase;
                await convertFolderToDreamNode(this, this.uiService, file, passphrase);
              });
          });
        }
      })
    );
  }

  // Helper method to get all available nodes (used by undo/redo)
  private async getAllAvailableNodes(): Promise<DreamNode[]> {
    try {
      const store = useInterBrainStore.getState();
      const dreamNodesMap = store.dreamNodes;
      const allNodes = Array.from(dreamNodesMap.values()).map(data => data.node);
      return allNodes;
    } catch (error) {
      console.error('Failed to get available nodes:', error);
      return [];
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Sync constellation settings to Zustand store
    // This ensures persisted values are reflected in runtime state
    useInterBrainStore.getState().setConstellationConfig({
      maxNodes: this.settings.constellationMaxNodes ?? CONSTELLATION_DEFAULTS.MAX_NODES,
      prioritizeClusters: this.settings.constellationPrioritizeClusters ?? CONSTELLATION_DEFAULTS.PRIORITIZE_CLUSTERS
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onunload() {
    console.log('[Plugin] InterBrain unloading...');

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

    // GRACEFUL SHUTDOWN: Wait for pending IndexedDB writes before closing
    // This prevents the "open timeout" error caused by interrupted transactions
    console.log('[Plugin] Waiting for pending IndexedDB writes...');
    await gracefulShutdown(3000); // 3 second timeout

    // Shutdown lifecycle manager
    await serviceLifecycleManager.shutdown();

    // Close IndexedDB connection to allow clean re-initialization on reload
    closeIndexedDBConnection();

    // Reset lifecycle manager for next load
    serviceLifecycleManager.reset();

    console.log('[Plugin] InterBrain unload complete');
  }
}