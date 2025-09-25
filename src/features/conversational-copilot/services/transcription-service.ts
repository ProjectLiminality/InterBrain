import { App, TFile, Notice, WorkspaceItem, WorkspaceSplit } from 'obsidian';
import { DreamNode } from '../../../types/dreamnode';
import { semanticSearchService } from '../../semantic-search/services/semantic-search-service';
import { useInterBrainStore } from '../../../store/interbrain-store';
import { VaultService } from '../../../services/vault-service';

/**
 * Transcription Service
 *
 * Manages markdown-based transcription files for copilot mode.
 * Creates temporary files, monitors changes, and triggers semantic search with FIFO buffer logic.
 */
export class TranscriptionService {
  private app: App;
  private vaultService: VaultService;
  private transcriptionFile: TFile | null = null;
  private fileChangeListener: ((file: TFile) => void) | null = null;
  private searchTimeout: number | null = null;
  private lastContent: string = '';
  private bufferSize: number = 500; // FIFO buffer size in characters
  private isSearchCooldownActive: boolean = false; // Throttling cooldown state
  private hasSearchedOnce: boolean = false; // Track first search for layout fix
  private refocusInterval: number | null = null; // Auto-refocus timer

  constructor(app: App) {
    this.app = app;
    this.vaultService = new VaultService(app.vault, app);
  }

  /**
   * Create and open transcription file for copilot mode
   */
  async startTranscription(conversationPartner: DreamNode): Promise<void> {
    // Clean up any existing transcription first
    if (this.transcriptionFile) {
      console.log(`🧹 [TranscriptionService] Cleaning up existing transcription before starting new one`);
      await this.stopTranscription();
    }

    // Clear any existing search results when starting new conversation session
    const store = useInterBrainStore.getState();
    store.setSearchResults([]);
    console.log(`🧹 [TranscriptionService] Cleared search results for new conversation session`);

    // Reset throttling and layout tracking for new session
    this.isSearchCooldownActive = false;
    this.hasSearchedOnce = false;
    if (this.searchTimeout) {
      globalThis.clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
    console.log(`🔄 [TranscriptionService] Reset search throttling state for new session`);

    try {
      // Generate date-based filename with time to avoid conflicts
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().slice(0, 5).replace(':', '-'); // HH-mm

      // Always include time to allow multiple transcripts per day
      const fileName = `transcript-${dateStr}-${timeStr}.md`;
      const filePath = `${conversationPartner.repoPath}/${fileName}`;

      console.log(`📝 [TranscriptionService] Creating transcription file: ${filePath}`);

      // Create initial content with conversation context
      const sessionTime = now.toLocaleString();
      const initialContent = `# Conversation with ${conversationPartner.name}

**Date**: ${sessionTime}
**Session**: ${fileName.replace('.md', '')}

*Start dictating here. The last ${this.bufferSize} characters will be used for semantic search.*

---

`;

      // VaultService.writeFile will automatically create directories as needed
      console.log(`📁 [TranscriptionService] Target directory: ${conversationPartner.repoPath}`);

      // Create new file using VaultService (filename includes time so conflicts are unlikely)
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile && existingFile instanceof TFile) {
        // Very unlikely with timestamp, but if it exists, delete and recreate
        console.log(`📄 [TranscriptionService] File exists (unusual), deleting: ${filePath}`);
        await this.app.vault.delete(existingFile);
      }

      await this.vaultService.writeFile(filePath, initialContent);

      // Give Obsidian time to recognize the new file (retry with progressive delays)
      const maxRetries = 5;
      const baseDelay = 100; // Start with 100ms

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Wait with progressive delay: 100ms, 200ms, 400ms, 800ms, 1600ms
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Try to get the file from vault
        this.transcriptionFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;

        if (this.transcriptionFile) {
          console.log(`✅ [TranscriptionService] File found in vault on attempt ${attempt} (after ${delay}ms)`);
          break;
        }

        console.log(`⏳ [TranscriptionService] Attempt ${attempt}/${maxRetries}: File not yet in vault, waiting ${delay}ms...`);

        // On last attempt, check if file exists on filesystem
        if (attempt === maxRetries) {
          const adapter = this.app.vault.adapter;
          if ('exists' in adapter && typeof adapter.exists === 'function') {
            const fileExists = await adapter.exists(filePath);
            console.log(`📁 [TranscriptionService] File exists on filesystem: ${fileExists}`);
          }
        }
      }

      if (!this.transcriptionFile) {
        console.error(`❌ [TranscriptionService] File created but not accessible after ${maxRetries} attempts: ${filePath}`);
        throw new Error(`File was created but Obsidian cannot access it after ${maxRetries} attempts. This may be a vault synchronization issue.`);
      }

      console.log(`📝 [TranscriptionService] Successfully created and verified transcription file: ${filePath}`);

      // Open in horizontal split at bottom with minimal height
      const leaf = this.app.workspace.getLeaf('split', 'horizontal');
      await leaf.openFile(this.transcriptionFile);

      // Focus the leaf and position cursor at end of file
      this.app.workspace.setActiveLeaf(leaf);

      // Wait a moment for the file to fully load, then position cursor
      setTimeout(() => {
        const view = leaf.view as any;
        if (view && 'editor' in view && view.editor) {
          const editor = view.editor as any;
          // Position cursor at the very end of the file content
          const lastLine = editor.lastLine();
          const lastLineLength = editor.getLine(lastLine).length;
          editor.setCursor(lastLine, lastLineLength);

          // Focus the editor for immediate dictation
          editor.focus();

          console.log(`🎯 [TranscriptionService] Cursor positioned at end of file for dictation`);
        } else {
          console.warn(`⚠️ [TranscriptionService] Could not access editor for cursor positioning`);
        }
      }, 100); // Small delay to ensure file is fully loaded

      // Resize the bottom pane to minimal height - try multiple approaches with different timing
      setTimeout(() => {
        this.resizeBottomPaneProper(leaf);
      }, 200); // Initial attempt

      // Try again after longer delay in case layout needs more time
      setTimeout(() => {
        this.resizeBottomPaneFallback(leaf);
      }, 500); // Fallback approach

      // Set up file monitoring
      this.setupFileMonitoring();

      // Start auto-refocus to maintain cursor position for dictation
      this.startAutoRefocus();

      console.log(`📝 [TranscriptionService] Created transcription file: ${filePath}`);
      new Notice(`Transcription started in bottom pane. Dictate in the opened file.`);

    } catch (error) {
      console.error('Failed to create transcription file:', error);
      new Notice('Failed to start transcription', 3000);
      throw error;
    }
  }

  /**
   * Stop transcription and clean up
   */
  async stopTranscription(): Promise<void> {
    try {
      // Remove file monitoring
      if (this.fileChangeListener && this.transcriptionFile) {
        (this.app.vault as any).off('modify', this.fileChangeListener);
        this.fileChangeListener = null;
      }

      // Clear any pending search
      if (this.searchTimeout) {
        globalThis.clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }

      // Stop auto-refocus
      this.stopAutoRefocus();

      // Close and delete transcription file
      if (this.transcriptionFile) {
        const filePath = this.transcriptionFile.path;

        try {
          // Find and close the leaf with this file
          const leaves = this.app.workspace.getLeavesOfType('markdown');
          for (const leaf of leaves) {
            if ((leaf.view as any).file?.path === filePath) {
              await leaf.detach();
              break;
            }
          }
        } catch (error) {
          console.warn(`⚠️ [TranscriptionService] Failed to close leaf for ${filePath}:`, error);
        }

        try {
          // Delete the file if it still exists
          const fileStillExists = this.app.vault.getAbstractFileByPath(filePath);
          if (fileStillExists) {
            await this.app.vault.delete(this.transcriptionFile);
            console.log(`🗑️ [TranscriptionService] Deleted transcription file: ${filePath}`);
          } else {
            console.log(`📄 [TranscriptionService] File already deleted: ${filePath}`);
          }
        } catch (error) {
          console.warn(`⚠️ [TranscriptionService] Failed to delete ${filePath}:`, error);
        }

        this.transcriptionFile = null;
      }

      // Reset state
      this.lastContent = '';

      new Notice('Transcription stopped and file cleaned up');

    } catch (error) {
      console.error('Failed to stop transcription:', error);
      new Notice('Failed to clean up transcription', 3000);
    }
  }

  /**
   * Set up file monitoring for changes
   */
  private setupFileMonitoring(): void {
    if (!this.transcriptionFile) return;

    this.fileChangeListener = (file: TFile) => {
      if (file.path === this.transcriptionFile?.path) {
        this.handleFileChange();
      }
    };

    // Listen for file modifications
    (this.app.vault as any).on('modify', this.fileChangeListener);
    console.log(`👂 [TranscriptionService] File monitoring started for: ${this.transcriptionFile.path}`);
  }

  /**
   * Handle file content changes with FIFO buffer and debounced search
   */
  private async handleFileChange(): Promise<void> {
    if (!this.transcriptionFile) return;

    try {
      // Read current file content
      const currentContent = await this.app.vault.read(this.transcriptionFile);

      // Extract text content (skip markdown headers and separators)
      const contentLines = currentContent.split('\n');
      const textContent = contentLines
        .slice(contentLines.findIndex(line => line === '---') + 1) // Skip everything before the separator
        .join('\n')
        .trim();

      // Check if content actually changed
      if (textContent === this.lastContent) {
        return; // No change, skip processing
      }

      console.log(`📄 [TranscriptionService] Content changed, length: ${textContent.length}`);

      // Apply FIFO buffer logic - take last N characters
      const bufferContent = textContent.length > this.bufferSize
        ? textContent.slice(-this.bufferSize)
        : textContent;

      console.log(`🔤 [TranscriptionService] Buffer content (${bufferContent.length} chars): "${bufferContent}"`);

      // Update last content
      this.lastContent = textContent;

      // Only trigger search if we have meaningful content
      if (bufferContent.trim().length < 3) {
        console.log(`⏸️ [TranscriptionService] Buffer too short, clearing search results`);
        // Clear search results when content is insufficient (matches edit mode behavior)
        const store = useInterBrainStore.getState();
        store.setSearchResults([]);
        return;
      }

      // THROTTLE LOGIC: Search immediately if not in cooldown, ignore if in cooldown
      if (this.isSearchCooldownActive) {
        console.log(`⏸️ [TranscriptionService] Search cooldown active, ignoring change (${bufferContent.length} chars)`);
        return;
      }

      // Search immediately (throttle behavior)
      console.log(`🔍 [TranscriptionService] Searching immediately (throttle): "${bufferContent.slice(-20)}..."`);
      this.triggerSemanticSearch(bufferContent);

      // Start 5-second cooldown period
      this.isSearchCooldownActive = true;
      if (this.searchTimeout) {
        globalThis.clearTimeout(this.searchTimeout);
      }
      this.searchTimeout = window.setTimeout(() => {
        this.isSearchCooldownActive = false;
        console.log(`✅ [TranscriptionService] Search cooldown ended, ready for next search`);
      }, 5000);

    } catch (error) {
      console.error('Failed to process file change:', error);
    }
  }

  /**
   * Trigger semantic search with buffer content
   */
  private async triggerSemanticSearch(searchText: string): Promise<void> {
    const store = useInterBrainStore.getState();
    const conversationPartner = store.copilotMode.conversationPartner;

    if (!conversationPartner) {
      console.warn('No conversation partner available for search');
      return;
    }

    try {
      console.log(`🔍 [TranscriptionService] Running semantic search for: "${searchText}"`);
      console.log(`📏 [TranscriptionService] Query length: ${searchText.length} characters`);
      console.log(`👤 [TranscriptionService] Conversation partner: ${conversationPartner.name} (${conversationPartner.type})`);

      // Clear existing search results before new search (prevents overlay)
      store.setSearchResults([]);
      console.log(`🧹 [TranscriptionService] Cleared previous search results`);

      // Check if semantic search is available
      const isAvailable = await semanticSearchService.isSemanticSearchAvailable();
      console.log(`🤖 [TranscriptionService] Semantic search available: ${isAvailable}`);

      if (!isAvailable) {
        console.warn('⚠️ [TranscriptionService] Semantic search not available, search aborted');
        return;
      }

      // Search for opposite-type nodes relative to the conversation partner
      console.log(`🎯 [TranscriptionService] Calling searchOppositeTypeNodes with maxResults: 35`);
      const searchResults = await semanticSearchService.searchOppositeTypeNodes(
        searchText,
        conversationPartner,
        {
          maxResults: 35, // Leave room for center node in honeycomb layout
          includeSnippets: false // We don't need snippets for copilot mode
        }
      );

      console.log(`📊 [TranscriptionService] Raw search results count: ${searchResults.length}`);
      if (searchResults.length > 0) {
        const resultIds = searchResults.slice(0, 5).map(r => r.node.id.slice(0, 8)).join(', ');
        const resultNames = searchResults.slice(0, 5).map(r => r.node.name).join(', ');
        console.log(`📝 [TranscriptionService] First 5 result IDs: ${resultIds}`);
        console.log(`📝 [TranscriptionService] First 5 result names: ${resultNames}`);
      }

      // Update search results in store (this will trigger layout updates)
      const nodeResults = searchResults.map(result => result.node);
      store.setSearchResults(nodeResults);

      console.log(`✅ [TranscriptionService] Updated store with ${nodeResults.length} search results`);

      // Fix first search layout issue - force React effect to trigger
      if (!this.hasSearchedOnce) {
        this.hasSearchedOnce = true;
        console.log(`🎯 [TranscriptionService] First search completed, ensuring React effect triggers`);

        // Small delay to ensure React processes the initial render, then force effect trigger
        setTimeout(() => {
          // Re-set the same results to force React effect to run
          store.setSearchResults([...nodeResults]);
          console.log(`🚀 [TranscriptionService] Forced React effect with ${nodeResults.length} results`);
        }, 50);
      }

    } catch (error) {
      console.error('Semantic search failed:', error);
      new Notice('Search failed', 2000);
    }
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.bufferSize;
  }

  /**
   * Set buffer size for FIFO logic
   */
  setBufferSize(size: number): void {
    this.bufferSize = Math.max(10, Math.min(500, size)); // Clamp between 10 and 500
    console.log(`📏 [TranscriptionService] Buffer size set to: ${this.bufferSize}`);
  }

  /**
   * Start auto-refocus to maintain cursor position for dictation
   */
  private startAutoRefocus(): void {
    if (this.refocusInterval) {
      clearInterval(this.refocusInterval);
    }

    // Every 500ms, ensure cursor stays at end of transcription file
    this.refocusInterval = window.setInterval(() => {
      if (this.transcriptionFile) {
        this.repositionCursor();
      }
    }, 500);

    console.log(`🎯 [TranscriptionService] Auto-refocus started (500ms intervals)`);
  }

  /**
   * Stop auto-refocus
   */
  private stopAutoRefocus(): void {
    if (this.refocusInterval) {
      clearInterval(this.refocusInterval);
      this.refocusInterval = null;
      console.log(`🎯 [TranscriptionService] Auto-refocus stopped`);
    }
  }

  /**
   * Reposition cursor at end of transcription file without stealing focus
   */
  private repositionCursor(): void {
    if (!this.transcriptionFile) return;

    // Find transcription leaf across all windows (including pop-out windows)
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const leafFile = (leaf.view as any).file;
      if (leafFile?.path === this.transcriptionFile.path) {
        const editor = (leaf.view as any).editor;
        if (editor) {
          const lastLine = editor.lastLine();
          const lastLineLength = editor.getLine(lastLine).length;
          editor.setCursor(lastLine, lastLineLength);
          // Don't call focus() - this would steal focus aggressively
          // Just maintain cursor position for seamless dictation
        }
        break;
      }
    }
  }

  /**
   * Resize bottom pane to minimal height using proper Obsidian API
   */
  private resizeBottomPaneProper(leaf: WorkspaceLeaf): void {
    try {
      console.log(`🔍 [TranscriptionService] Starting resize debug - leaf:`, leaf);
      console.log(`🔍 [TranscriptionService] Leaf parent:`, leaf.parent);
      console.log(`🔍 [TranscriptionService] Leaf parent type:`, leaf.parent?.type);
      console.log(`🔍 [TranscriptionService] Leaf parent constructor:`, leaf.parent?.constructor?.name);

      // Find the split that contains this leaf
      const split = leaf.parent as WorkspaceSplit;

      if (!split) {
        console.error(`❌ [TranscriptionService] No parent found for leaf`);
        return;
      }

      console.log(`🔍 [TranscriptionService] Split object:`, split);
      console.log(`🔍 [TranscriptionService] Split children count:`, split.children?.length);
      console.log(`🔍 [TranscriptionService] Split children:`, split.children);

      if (!split.children || split.children.length !== 2) {
        console.warn(`⚠️ [TranscriptionService] Expected 2 children, got ${split.children?.length}`);
        console.log(`🔍 [TranscriptionService] Full children array:`, split.children);
        return;
      }

      // Get the top and bottom children
      const topChild = split.children[0] as WorkspaceItem;
      const bottomChild = split.children[1] as WorkspaceItem;

      console.log(`🔍 [TranscriptionService] Top child:`, topChild);
      console.log(`🔍 [TranscriptionService] Top child type:`, topChild?.type);
      console.log(`🔍 [TranscriptionService] Top child dimension:`, topChild?.dimension);
      console.log(`🔍 [TranscriptionService] Top child has setDimension:`, typeof topChild?.setDimension);

      console.log(`🔍 [TranscriptionService] Bottom child:`, bottomChild);
      console.log(`🔍 [TranscriptionService] Bottom child type:`, bottomChild?.type);
      console.log(`🔍 [TranscriptionService] Bottom child dimension:`, bottomChild?.dimension);
      console.log(`🔍 [TranscriptionService] Bottom child has setDimension:`, typeof bottomChild?.setDimension);

      // Check if our leaf is the bottom child (transcript)
      const isBottomLeaf = bottomChild.children &&
        bottomChild.children.some(child => child === leaf);

      console.log(`🔍 [TranscriptionService] Is bottom leaf:`, isBottomLeaf);
      console.log(`🔍 [TranscriptionService] Bottom child children:`, bottomChild.children);

      // Try both approaches and see what works
      if (typeof topChild?.setDimension === 'function' && typeof bottomChild?.setDimension === 'function') {
        console.log(`✅ [TranscriptionService] Both children have setDimension method, proceeding...`);

        if (isBottomLeaf) {
          console.log(`📏 [TranscriptionService] Setting 80/20 ratio (transcript on bottom)`);
          topChild.setDimension(80);
          bottomChild.setDimension(20);
        } else {
          console.log(`📏 [TranscriptionService] Setting 20/80 ratio (transcript on top)`);
          topChild.setDimension(20);
          bottomChild.setDimension(80);
        }

        console.log(`🔍 [TranscriptionService] After setDimension - top:`, topChild.dimension, `bottom:`, bottomChild.dimension);

        // Trigger workspace resize to apply changes
        console.log(`🔄 [TranscriptionService] Calling requestResize...`);
        this.app.workspace.requestResize();

        console.log(`✅ [TranscriptionService] Resize operation completed`);

        // Check dimensions after a brief delay
        setTimeout(() => {
          console.log(`🔍 [TranscriptionService] Post-resize check - top:`, topChild.dimension, `bottom:`, bottomChild.dimension);
        }, 100);

      } else {
        console.error(`❌ [TranscriptionService] setDimension method not available on children`);
        console.log(`🔍 [TranscriptionService] Available methods on topChild:`, Object.getOwnPropertyNames(topChild).filter(p => typeof topChild[p] === 'function'));
        console.log(`🔍 [TranscriptionService] Available methods on bottomChild:`, Object.getOwnPropertyNames(bottomChild).filter(p => typeof bottomChild[p] === 'function'));
      }

    } catch (error) {
      console.error('❌ [TranscriptionService] Failed to resize bottom pane properly:', error);
      console.error('❌ [TranscriptionService] Error details:', error);
      console.error('❌ [TranscriptionService] Stack trace:', error.stack);
    }
  }

  /**
   * Fallback resize method using DOM manipulation if setDimension doesn't work
   */
  private resizeBottomPaneFallback(leaf: WorkspaceLeaf): void {
    try {
      console.log(`🔄 [TranscriptionService] Attempting fallback resize method`);

      const leafEl = leaf.containerEl;
      if (!leafEl) {
        console.warn(`⚠️ [TranscriptionService] Could not find leaf container element for fallback`);
        return;
      }

      // Find the workspace split parent
      const splitParent = leafEl.closest('.workspace-split.mod-horizontal');
      if (!splitParent) {
        console.warn(`⚠️ [TranscriptionService] Could not find horizontal split parent for fallback`);
        return;
      }

      console.log(`🔍 [TranscriptionService] Found split parent:`, splitParent);

      // Find all workspace-tabs containers (the actual panes) in this split
      const allTabContainers = splitParent.querySelectorAll('.workspace-tabs');
      console.log(`🔍 [TranscriptionService] Found ${allTabContainers.length} tab containers in split`);

      if (allTabContainers.length === 2) {
        // Identify which workspace-tabs contains the transcript leaf
        let transcriptTabContainer: HTMLElement | null = null;
        let dreamspaceTabContainer: HTMLElement | null = null;

        for (const tabContainer of allTabContainers) {
          if (tabContainer.contains(leafEl)) {
            transcriptTabContainer = tabContainer as HTMLElement;
            console.log(`🎯 [TranscriptionService] Found transcript tab container:`, tabContainer);
          } else {
            dreamspaceTabContainer = tabContainer as HTMLElement;
            console.log(`🎯 [TranscriptionService] Found dreamspace tab container:`, tabContainer);
          }
        }

        if (transcriptTabContainer && dreamspaceTabContainer) {
          console.log(`🔄 [TranscriptionService] Setting flex properties on tab containers (panes)`);

          // Apply flex sizing to the pane containers (workspace-tabs)
          transcriptTabContainer.style.flex = '0 0 120px'; // Fixed height for transcript pane
          transcriptTabContainer.style.minHeight = '120px';
          transcriptTabContainer.style.maxHeight = '120px';

          dreamspaceTabContainer.style.flex = '1 1 auto'; // Take remaining space for dreamspace

          // Ensure the parent split has proper flex layout
          const splitEl = splitParent as HTMLElement;
          splitEl.style.display = 'flex';
          splitEl.style.flexDirection = 'column';

          console.log(`✅ [TranscriptionService] Fallback resize applied to workspace-tabs containers`);
        } else {
          console.warn(`⚠️ [TranscriptionService] Could not identify transcript and dreamspace tab containers`);
        }
      } else {
        console.warn(`⚠️ [TranscriptionService] Expected 2 tab containers, found ${allTabContainers.length}`);
      }

    } catch (error) {
      console.error('❌ [TranscriptionService] Fallback resize failed:', error);
    }
  }
}

// Singleton instance - initialized in main.ts with proper app reference
let _transcriptionService: TranscriptionService | null = null;

export function initializeTranscriptionService(app: App): void {
  _transcriptionService = new TranscriptionService(app);
}

export function getTranscriptionService(): TranscriptionService {
  if (!_transcriptionService) {
    throw new Error('TranscriptionService not initialized. Call initializeTranscriptionService() first.');
  }
  return _transcriptionService;
}