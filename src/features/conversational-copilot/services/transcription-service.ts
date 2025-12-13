import { App, TFile, Notice } from 'obsidian';
import { DreamNode } from '../../dreamnode';
import { semanticSearchService } from '../../semantic-search/services/semantic-search-service';
import { useInterBrainStore } from '../../../core/store/interbrain-store';
import { VaultService } from '../../../core/services/vault-service';

/**
 * Transcription Service
 *
 * Manages markdown-based transcription files for copilot mode.
 * Creates transcript files, monitors changes via Obsidian vault events,
 * and triggers semantic search with FIFO buffer logic.
 *
 * Note: Actual audio transcription is handled by the realtime-transcription
 * feature (Python whisper_streaming). This service focuses on:
 * - Creating/managing the transcript markdown file
 * - Monitoring file changes for semantic search
 * - FIFO buffer logic for search queries
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

  constructor(app: App) {
    this.app = app;
    this.vaultService = new VaultService(app.vault, app);
  }

  /**
   * Create transcription file for copilot mode
   * The file is created in the conversation partner's DreamNode folder
   */
  async startTranscription(conversationPartner: DreamNode): Promise<void> {
    // Clean up any existing transcription first
    if (this.transcriptionFile) {
      await this.stopTranscription();
    }

    // Reset throttling for new session
    this.isSearchCooldownActive = false;
    if (this.searchTimeout) {
      globalThis.clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    try {
      // Generate date-based filename with time to avoid conflicts
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().slice(0, 5).replace(':', '-'); // HH-mm

      // Store transcripts in conversations/ directory alongside audio
      const fileName = `transcript-${dateStr}-${timeStr}.md`;
      const filePath = `${conversationPartner.repoPath}/conversations/${fileName}`;

      // Create initial content with conversation context
      const sessionTime = now.toLocaleString();
      const initialContent = `# Conversation with ${conversationPartner.name}

**Date**: ${sessionTime}
**Session**: ${fileName.replace('.md', '')}

*Start dictating here. The last ${this.bufferSize} characters will be used for semantic search.*

---

`;

      // Delete if exists (unlikely with timestamp)
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile && existingFile instanceof TFile) {
        await this.app.vault.delete(existingFile);
      }

      await this.vaultService.writeFile(filePath, initialContent);

      // Give Obsidian time to recognize the new file (retry with progressive delays)
      const maxRetries = 5;
      const baseDelay = 100;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));

        this.transcriptionFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;

        if (this.transcriptionFile) {
          break;
        }
      }

      if (!this.transcriptionFile) {
        throw new Error(`File was created but Obsidian cannot access it after ${maxRetries} attempts.`);
      }

      // Set up file monitoring for semantic search
      this.setupFileMonitoring();

      new Notice(`Transcription started. Speak into your microphone.`);

    } catch (error) {
      console.error('Failed to create transcription file:', error);
      new Notice('Failed to start transcription', 3000);
      throw error;
    }
  }

  /**
   * Stop transcription and clean up listeners
   * Note: Transcript file is preserved (not deleted)
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

      // Clear file reference (file is preserved in DreamNode folder)
      this.transcriptionFile = null;
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
  }

  /**
   * Handle file content changes with FIFO buffer and throttled search
   */
  private async handleFileChange(): Promise<void> {
    if (!this.transcriptionFile) return;

    try {
      // Read current file content
      const currentContent = await this.app.vault.read(this.transcriptionFile);

      // Extract text content (skip markdown headers and separators)
      const contentLines = currentContent.split('\n');
      const textContent = contentLines
        .slice(contentLines.findIndex(line => line === '---') + 1)
        .join('\n')
        .trim();

      // Check if content actually changed
      if (textContent === this.lastContent) {
        return;
      }

      // Filter out timestamps and invocation markers for semantic search
      const filteredContent = textContent
        .split('\n')
        .map(line => {
          // Remove timestamp prefix [YYYY-MM-DD HH:MM:SS]
          const withoutTimestamp = line.replace(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s*/, '');
          // Skip invocation lines entirely
          if (withoutTimestamp.startsWith('🔮 Invoked:')) {
            return '';
          }
          return withoutTimestamp;
        })
        .filter(line => line.trim().length > 0)
        .join(' ');

      // Apply FIFO buffer logic - take last N characters
      const bufferContent = filteredContent.length > this.bufferSize
        ? filteredContent.slice(-this.bufferSize)
        : filteredContent;

      // Update last content
      this.lastContent = textContent;

      // Only trigger search if we have meaningful content
      if (bufferContent.trim().length < 3) {
        const store = useInterBrainStore.getState();
        store.setSearchResults([]);
        return;
      }

      // THROTTLE LOGIC: Search immediately if not in cooldown, ignore if in cooldown
      if (this.isSearchCooldownActive) {
        return;
      }

      // Search immediately (throttle behavior)
      this.triggerSemanticSearch(bufferContent);

      // Start 5-second cooldown period
      this.isSearchCooldownActive = true;
      if (this.searchTimeout) {
        globalThis.clearTimeout(this.searchTimeout);
      }
      this.searchTimeout = window.setTimeout(() => {
        this.isSearchCooldownActive = false;
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
      // Check if semantic search is available
      const isAvailable = await semanticSearchService.isSemanticSearchAvailable();

      if (!isAvailable) {
        console.warn('Semantic search not available, search aborted');
        return;
      }

      // Search for opposite-type nodes relative to the conversation partner
      const searchResults = await semanticSearchService.searchOppositeTypeNodes(
        searchText,
        conversationPartner,
        {
          maxResults: 35,
          includeSnippets: false
        }
      );

      // Update search results in store
      const nodeResults = searchResults.map(result => result.node);
      store.setSearchResults(nodeResults);

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
    this.bufferSize = Math.max(10, Math.min(500, size));
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
