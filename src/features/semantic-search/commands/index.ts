import { Plugin } from 'obsidian';
import { UIService } from '../../../services/ui-service';

import { registerOllamaCommands } from './ollama-commands';
import { registerIndexingCommands } from './indexing-commands';
import { registerSearchCommands } from './search-commands';
import { registerTestSearchCommands } from './test-search-commands';

/**
 * Register all semantic search related commands
 * This function should be called from main.ts during plugin initialization
 */
export function registerSemanticSearchCommands(plugin: Plugin, uiService: UIService): void {
  // Register all command groups
  registerOllamaCommands(plugin, uiService);
  registerIndexingCommands(plugin, uiService);
  registerSearchCommands(plugin, uiService);
  registerTestSearchCommands(plugin, uiService);
}

// Also export individual registration functions for flexibility
export {
  registerOllamaCommands,
  registerIndexingCommands,
  registerSearchCommands,
  registerTestSearchCommands
};