/**
 * AI Magic Commands
 *
 * Test commands for validating AI provider functionality.
 */

import { Notice, Plugin } from 'obsidian';
import { getInferenceService } from './services/inference-service';

/**
 * Register AI Magic commands
 */
export function registerAIMagicCommands(plugin: Plugin): void {
	// Test Claude Provider
	plugin.addCommand({
		id: 'ai-magic-test-claude',
		name: 'AI Magic: Test Claude Provider',
		callback: async () => {
			await testProvider('claude');
		}
	});

	// Test Ollama Provider
	plugin.addCommand({
		id: 'ai-magic-test-ollama',
		name: 'AI Magic: Test Ollama Provider',
		callback: async () => {
			await testProvider('ollama');
		}
	});

	// Test Auto-routing (uses preferred provider)
	plugin.addCommand({
		id: 'ai-magic-test-auto',
		name: 'AI Magic: Test Auto-routing',
		callback: async () => {
			await testAutoRouting();
		}
	});

	// Check all providers status
	plugin.addCommand({
		id: 'ai-magic-check-status',
		name: 'AI Magic: Check All Providers Status',
		callback: async () => {
			await checkAllProvidersStatus();
		}
	});
}

/**
 * Test a specific provider
 */
async function testProvider(providerName: 'claude' | 'ollama'): Promise<void> {
	const service = getInferenceService();
	const displayName = providerName === 'claude' ? 'Claude' : 'Ollama';

	new Notice(`Testing ${displayName}...`);

	try {
		const response = await service.generate(
			[
				{ role: 'system', content: 'You are a helpful assistant. Respond briefly.' },
				{ role: 'user', content: 'Say "Hello from AI Magic!" and nothing else.' }
			],
			'trivial',
			{ forceProvider: providerName, noFallback: true }
		);

		new Notice(`✅ ${displayName} working!\n\nResponse: "${response.content.trim()}"\n\nModel: ${response.model}`);
		console.log(`[AI Magic Test] ${displayName} response:`, response);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`❌ ${displayName} failed:\n${message}`);
		console.error(`[AI Magic Test] ${displayName} error:`, error);
	}
}

/**
 * Test auto-routing behavior
 */
async function testAutoRouting(): Promise<void> {
	const service = getInferenceService();
	const config = service.getConfig();

	const preferredProvider = config.preferLocal ? 'Ollama' : 'Claude';
	new Notice(`Testing auto-routing (prefers ${preferredProvider})...`);

	try {
		const response = await service.generate(
			[
				{ role: 'system', content: 'You are a helpful assistant. Respond briefly.' },
				{ role: 'user', content: 'What AI model are you? Answer in one short sentence.' }
			],
			'trivial'
		);

		const fallbackNote = response.usedFallback
			? `\n(Fallback from ${response.originalProvider})`
			: '';

		new Notice(`✅ Auto-routing worked!\n\nProvider: ${response.provider}\nModel: ${response.model}${fallbackNote}\n\nResponse: "${response.content.trim()}"`);
		console.log('[AI Magic Test] Auto-routing response:', response);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`❌ Auto-routing failed:\n${message}`);
		console.error('[AI Magic Test] Auto-routing error:', error);
	}
}

/**
 * Check status of all providers
 */
async function checkAllProvidersStatus(): Promise<void> {
	const service = getInferenceService();

	new Notice('Checking all providers...');

	try {
		const statuses = await service.getProvidersStatus();
		const config = service.getConfig();

		let statusReport = '🤖 AI Magic Status\n\n';

		for (const status of statuses) {
			const icon = status.status === 'ready' ? '✅' :
				status.status === 'unavailable' ? '🔴' :
					status.status === 'not_configured' ? '⚫' : '🟡';

			statusReport += `${icon} ${status.name}: ${status.message}\n`;
			if (status.details) {
				statusReport += `   ${status.details}\n`;
			}
			if (status.models && status.models.length > 0) {
				statusReport += `   Models: ${status.models.slice(0, 3).join(', ')}${status.models.length > 3 ? '...' : ''}\n`;
			}
			statusReport += '\n';
		}

		// Add config info
		statusReport += `Prefer Local: ${config.preferLocal ? 'Yes' : 'No'}\n`;
		statusReport += `Offline Mode: ${config.offlineMode ? 'Yes' : 'No'}\n`;

		new Notice(statusReport);
		console.log('[AI Magic Status]', { statuses, config });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`❌ Status check failed:\n${message}`);
		console.error('[AI Magic Status] Error:', error);
	}
}
