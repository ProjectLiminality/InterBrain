import { App, TFile, Notice } from 'obsidian';
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
  private bufferSize: number = 50; // FIFO buffer size in characters

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

      // Give Obsidian a moment to recognize the new file
      await new Promise(resolve => setTimeout(resolve, 50));

      this.transcriptionFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;

      if (!this.transcriptionFile) {
        // Try refreshing the vault cache and check again
        console.warn(`⚠️ [TranscriptionService] File not found in vault cache, attempting refresh...`);

        // Force Obsidian to refresh its file cache
        const adapter = this.app.vault.adapter;
        if ('exists' in adapter && typeof adapter.exists === 'function') {
          const fileExists = await adapter.exists(filePath);
          console.log(`📁 [TranscriptionService] File exists on filesystem: ${fileExists}`);

          if (fileExists) {
            // Try to get the file again after a short delay
            await new Promise(resolve => setTimeout(resolve, 100));
            this.transcriptionFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;
          }
        }

        if (!this.transcriptionFile) {
          console.error(`❌ [TranscriptionService] File created but not accessible via Obsidian API: ${filePath}`);
          throw new Error(`File was created but Obsidian cannot access it. This may be a timing issue. Please try again.`);
        }
      }

      console.log(`📝 [TranscriptionService] Successfully created and verified transcription file: ${filePath}`);

      // Open in split view (right pane) and position cursor for immediate dictation
      const leaf = this.app.workspace.getLeaf('split', 'vertical');
      await leaf.openFile(this.transcriptionFile);

      // Focus the leaf and position cursor at end of file
      this.app.workspace.setActiveLeaf(leaf);

      // Wait a moment for the file to fully load, then position cursor
      setTimeout(() => {
        const view = leaf.view;
        if (view && 'editor' in view && view.editor) {
          const editor = view.editor;
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

      // Set up file monitoring
      this.setupFileMonitoring();

      console.log(`📝 [TranscriptionService] Created transcription file: ${filePath}`);
      new Notice(`Transcription started. Dictate in the opened file.`);

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
        this.app.vault.off('modify', this.fileChangeListener);
        this.fileChangeListener = null;
      }

      // Clear any pending search
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }

      // Close and delete transcription file
      if (this.transcriptionFile) {
        const filePath = this.transcriptionFile.path;

        try {
          // Find and close the leaf with this file
          const leaves = this.app.workspace.getLeavesOfType('markdown');
          for (const leaf of leaves) {
            if (leaf.view.file?.path === filePath) {
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
    this.app.vault.on('modify', this.fileChangeListener);
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

      // Clear existing search timeout
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }

      // Only trigger search if we have meaningful content
      if (bufferContent.trim().length < 3) {
        console.log(`⏸️ [TranscriptionService] Buffer too short, clearing search results`);
        // Clear search results when content is insufficient (matches edit mode behavior)
        const store = useInterBrainStore.getState();
        store.setSearchResults([]);
        return;
      }

      // Set new timeout for debounced search (5 seconds)
      this.searchTimeout = window.setTimeout(() => {
        this.triggerSemanticSearch(bufferContent);
      }, 5000);

      console.log(`⏱️ [TranscriptionService] Search scheduled in 5 seconds for: "${bufferContent.slice(-20)}..."`);

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

      // Clear existing search results before new search (prevents overlay)
      store.setSearchResults([]);
      console.log(`🧹 [TranscriptionService] Cleared previous search results`);

      // Check if semantic search is available
      const isAvailable = await semanticSearchService.isSemanticSearchAvailable();
      if (!isAvailable) {
        console.warn('Semantic search not available');
        return;
      }

      // Search for opposite-type nodes relative to the conversation partner
      const searchResults = await semanticSearchService.searchOppositeTypeNodes(
        searchText,
        conversationPartner,
        {
          maxResults: 35, // Leave room for center node in honeycomb layout
          includeSnippets: false // We don't need snippets for copilot mode
        }
      );

      // Update search results in store (this will trigger layout updates)
      store.setSearchResults(searchResults.map(result => result.node));

      console.log(`✅ [TranscriptionService] Found ${searchResults.length} search results`);

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