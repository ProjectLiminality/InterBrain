import { App, TFile, Notice } from 'obsidian';
import { DreamNode } from '../../../types/dreamnode';
import { semanticSearchService } from '../../semantic-search/services/semantic-search-service';
import { useInterBrainStore } from '../../../store/interbrain-store';

/**
 * Transcription Service
 *
 * Manages markdown-based transcription files for copilot mode.
 * Creates temporary files, monitors changes, and triggers semantic search with FIFO buffer logic.
 */
export class TranscriptionService {
  private app: App;
  private transcriptionFile: TFile | null = null;
  private fileChangeListener: ((file: TFile) => void) | null = null;
  private searchTimeout: number | null = null;
  private lastContent: string = '';
  private bufferSize: number = 50; // FIFO buffer size in characters

  constructor(app: App) {
    this.app = app;
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

    try {
      // Create temporary transcription file
      const fileName = `copilot-transcription-${conversationPartner.id}.md`;
      let filePath = `.obsidian/plugins/interbrain/${fileName}`;

      // Ensure plugin directory exists
      const pluginDir = '.obsidian/plugins/interbrain';
      try {
        if (!await this.app.vault.adapter.exists(pluginDir)) {
          await this.app.vault.adapter.mkdir(pluginDir);
          console.log(`📁 [TranscriptionService] Created plugin directory: ${pluginDir}`);
        }
      } catch (error) {
        console.warn(`⚠️ [TranscriptionService] Failed to create directory ${pluginDir}:`, error);
        // Fallback to root directory if plugin directory fails
        filePath = fileName;
        console.log(`📁 [TranscriptionService] Using fallback path: ${filePath}`);
      }

      // Create initial content
      const initialContent = `# Conversation with ${conversationPartner.name}

*Start dictating here. The last ${this.bufferSize} characters will be used for semantic search.*

---

`;

      // Check if file already exists and handle gracefully
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile && existingFile instanceof TFile) {
        // File exists, delete it first to start fresh
        console.log(`📄 [TranscriptionService] File already exists, deleting: ${filePath}`);
        await this.app.vault.delete(existingFile);
      }

      // Create the file
      this.transcriptionFile = await this.app.vault.create(filePath, initialContent);

      // Open in split view (right pane)
      const leaf = this.app.workspace.getLeaf('split', 'vertical');
      await leaf.openFile(this.transcriptionFile);

      // Focus on the file for immediate dictation
      this.app.workspace.setActiveLeaf(leaf);

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
        console.log(`⏸️ [TranscriptionService] Buffer too short, skipping search`);
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