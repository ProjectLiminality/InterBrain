import { Plugin } from 'obsidian';
import { UIService } from '../../../services/ui-service';

/**
 * Ollama diagnostic and setup commands
 */
export function registerOllamaCommands(plugin: Plugin, uiService: UIService): void {
  
  // Ollama Status Check
  plugin.addCommand({
    id: 'ollama-check-status',
    name: 'Ollama: Check Status',
    callback: async () => {
      const loadingNotice = uiService.showLoading('Checking Ollama status...');
      try {
        const { ollamaEmbeddingService } = await import('../services/ollama-embedding-service');
        const { createOllamaHealthService } = await import('../services/ollama-health-service');
        
        const healthService = createOllamaHealthService(ollamaEmbeddingService);
        const statusMessage = await healthService.getStatusMessage();
        
        uiService.showSuccess(statusMessage);
      } catch {
        uiService.showError('Failed to check Ollama status');
      } finally {
        loadingNotice.hide();
      }
    }
  });

  // Ollama Diagnostics
  plugin.addCommand({
    id: 'ollama-run-diagnostics',
    name: 'Ollama: Run Diagnostics',
    callback: async () => {
      const loadingNotice = uiService.showLoading('Running Ollama diagnostics...');
      try {
        const { ollamaEmbeddingService } = await import('../services/ollama-embedding-service');
        const { createOllamaHealthService } = await import('../services/ollama-health-service');
        
        const healthService = createOllamaHealthService(ollamaEmbeddingService);
        const report = await healthService.generateSetupReport();
        
        // Create a new file with the report with timestamp to avoid conflicts
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
        const reportFile = await plugin.app.vault.create(`Ollama Diagnostics ${timestamp[0]} ${timestamp[1].split('.')[0]}.md`, report);
        await plugin.app.workspace.openLinkText(reportFile.path, '');
        
        uiService.showSuccess('Diagnostics complete - report opened');
      } catch (error) {
        console.error('Diagnostics failed:', error);
        uiService.showError('Failed to run diagnostics');
      } finally {
        loadingNotice.hide();
      }
    }
  });

  // Test Embedding Generation
  plugin.addCommand({
    id: 'ollama-test-embedding',
    name: 'Ollama: Test Embedding Generation',
    callback: async () => {
      const loadingNotice = uiService.showLoading('Testing embedding generation...');
      try {
        const { ollamaEmbeddingService } = await import('../services/ollama-embedding-service');
        const { createOllamaHealthService } = await import('../services/ollama-health-service');
        
        const healthService = createOllamaHealthService(ollamaEmbeddingService);
        await healthService.testEmbeddingGeneration();
        
        uiService.showSuccess('✅ Embedding generation test passed');
      } catch (error) {
        console.error('Embedding test failed:', error);
        uiService.showError(`❌ Embedding test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        loadingNotice.hide();
      }
    }
  });

  // Embedding Service Status
  plugin.addCommand({
    id: 'embedding-service-status',
    name: 'Check Embedding Service Status',
    callback: async () => {
      const loadingNotice = uiService.showLoading('Checking embedding service status...');
      try {
        const { indexingService } = await import('../services/indexing-service');
        const { semanticSearchService } = await import('../services/semantic-search-service');
        
        const embeddingStatus = await indexingService.getEmbeddingStatus();
        const searchStats = await semanticSearchService.getSearchStats();
        const isSemanticAvailable = await semanticSearchService.isSemanticSearchAvailable();
        
        const statusMessage = [
          `**Embedding Service**: ${embeddingStatus.message}`,
          `**Semantic Search**: ${isSemanticAvailable ? '✅ Available' : '🔴 Unavailable'}`,
          `**Indexed Nodes**: ${searchStats.indexedNodes}/${searchStats.totalNodes} (${(searchStats.indexingCoverage * 100).toFixed(1)}%)`,
          `**Embedding Dimensions**: ${searchStats.embeddingDimensions || 'Unknown'}`
        ].join('\\n');
        
        uiService.showSuccess(statusMessage);
      } catch (error) {
        console.error('Status check failed:', error);
        uiService.showError('Failed to check embedding service status');
      } finally {
        loadingNotice.hide();
      }
    }
  });
}