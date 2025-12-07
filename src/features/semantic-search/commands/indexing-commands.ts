import { Plugin } from 'obsidian';
import { UIService } from '../../../core/services/ui-service';
import { useInterBrainStore } from '../../../core/store/interbrain-store';

/**
 * Indexing and content processing commands
 */
export function registerIndexingCommands(plugin: Plugin, uiService: UIService): void {

  // Intelligent Reindex
  plugin.addCommand({
    id: 'intelligent-reindex',
    name: 'Intelligent Reindex - Update changed DreamNodes',
    callback: () => {
      // Use setTimeout to push async operation to next tick - closes palette immediately
      globalThis.setTimeout(async () => {
        const loadingNotice = uiService.showLoading('Analyzing changes for intelligent reindex...');
        try {
          const { indexingService } = await import('../services/indexing-service');
          const result = await indexingService.intelligentReindex();
          
          const message = `Reindex complete: ${result.added} added, ${result.updated} updated, ${result.errors} errors`;
          if (result.errors > 0) {
            uiService.showWarning(message);
          } else {
            uiService.showSuccess(message);
          }
          console.log('IndexingService: Intelligent reindex result:', result);
        } catch (error) {
          console.error('Intelligent reindex failed:', error);
          uiService.showError('Failed to perform intelligent reindex');
        } finally {
          loadingNotice.hide();
        }
      }, 0);
    }
  });

  // Index Selected Node
  plugin.addCommand({
    id: 'index-selected-node',
    name: 'Index Selected DreamNode',
    callback: () => {
      // Use setTimeout to push async operation to next tick - closes palette immediately
      globalThis.setTimeout(async () => {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          uiService.showError('Please select a DreamNode first');
          return;
        }
        
        const loadingNotice = uiService.showLoading(`Indexing: ${selectedNode.name}...`);
        try {
          const { indexingService } = await import('../services/indexing-service');
          const vectorData = await indexingService.indexNode(selectedNode);
          
          uiService.showSuccess(`Indexed "${selectedNode.name}" (${vectorData.metadata.wordCount} words)`);
          console.log('IndexingService: Indexed node:', vectorData);
        } catch (error) {
          console.error('Failed to index node:', error);
          uiService.showError(`Failed to index "${selectedNode.name}"`);
        } finally {
          loadingNotice.hide();
        }
      }, 0);
    }
  });

  // Index All Nodes (Full Reindex)
  plugin.addCommand({
    id: 'index-all-nodes',
    name: 'Index All DreamNodes (Full Reindex)',
    callback: () => {
      // Use setTimeout to push async operation to next tick - closes palette immediately
      globalThis.setTimeout(() => {
        performFullIndexing(plugin, uiService);
      }, 0);
    }
  });
}

/**
 * Helper function to perform full indexing with progress notifications
 */
async function performFullIndexing(plugin: Plugin, uiService: UIService): Promise<void> {
  const store = useInterBrainStore.getState();
  const nodeCount = store.realNodes.size;

  if (nodeCount === 0) {
    uiService.showWarning('No DreamNodes found to index');
    return;
  }
  
  const loadingNotice = uiService.showLoading('Starting full index of all DreamNodes...');
  let lastReportedProgress = 0;
  
  try {
    const { indexingService } = await import('../services/indexing-service');
    
    // Set up progress monitoring with UI notifications
    const progressInterval = globalThis.setInterval(() => {
      const progress = indexingService.getProgress();
      
      if (progress.status === 'indexing') {
        // Update loading notice
        if (progress.message) {
          loadingNotice.setMessage(progress.message);
        }
        
        // Show progress notifications at 20% intervals
        const percentComplete = Math.floor((progress.completed / progress.total) * 100);
        if (percentComplete > 0 && percentComplete % 20 === 0 && percentComplete > lastReportedProgress) {
          uiService.showSuccess(`Indexing progress: ${percentComplete}% (${progress.completed}/${progress.total})`);
          lastReportedProgress = percentComplete;
        }
      }
    }, 500);
    
    const result = await indexingService.indexAllNodes();
    
    globalThis.clearInterval(progressInterval);
    
    const message = `Full index complete: ${result.indexed} indexed, ${result.errors} errors`;
    if (result.errors > 0) {
      uiService.showWarning(message);
    } else {
      uiService.showSuccess(message);
    }
    console.log('IndexingService: Full index result:', result);
  } catch (error) {
    console.error('Full index failed:', error);
    uiService.showError('Failed to complete full index');
  } finally {
    loadingNotice.hide();
  }
}