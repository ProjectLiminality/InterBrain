import { App, TFile } from 'obsidian';
import { DreamNode } from '../../../types/dreamnode';
import { InvocationEvent } from './conversation-recording-service';
import { createLLMProvider, LLMMessage } from './llm-provider';

/**
 * Conversation Summary Service
 *
 * Generates AI-powered summaries of conversations using transcript and invocation data
 */
export class ConversationSummaryService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Generate conversation summary from transcript and invocations
	 */
	async generateSummary(
		transcriptFile: TFile,
		invocations: InvocationEvent[],
		conversationPartner: DreamNode,
		apiKey: string
	): Promise<string> {
		try {
			// Read transcript content
			const transcriptContent = await this.app.vault.read(transcriptFile);

			// Extract actual conversation text (skip metadata header)
			const contentLines = transcriptContent.split('\n');
			const separatorIndex = contentLines.findIndex(line => line === '---');
			const conversationText = contentLines
				.slice(separatorIndex + 1)
				.join('\n')
				.trim();

			// Build system prompt
			const systemPrompt = this.buildSystemPrompt(conversationPartner, invocations);

			// Build user message
			const userMessage = this.buildUserMessage(conversationText, invocations);

			// Create LLM provider
			const llmProvider = createLLMProvider('claude', apiKey);

			// Generate summary
			const messages: LLMMessage[] = [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			];

			const response = await llmProvider.generateCompletion(messages, {
				maxTokens: 2000,
				temperature: 0.7
			});

			console.log(`✅ [ConversationSummary] Generated summary (${response.usage?.outputTokens} tokens)`);
			return response.content;

		} catch (error) {
			console.error('Failed to generate conversation summary:', error);
			throw new Error(`Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Build system prompt for AI summarization
	 */
	private buildSystemPrompt(conversationPartner: DreamNode, invocations: InvocationEvent[]): string {
		const hasInvocations = invocations.length > 0;

		return `You are a conversation summarization assistant. Your task is to create a concise, informative summary of a conversation between the user and ${conversationPartner.name}.

${hasInvocations ? `IMPORTANT: The transcript contains special markers in the format "(Invoked: NodeName)" which indicate that a DreamNode was shared during the conversation. These are noteworthy moments - pay special attention to the context around these invocations and mention them explicitly in your summary.` : ''}

Your summary should:
1. Capture the main topics and themes discussed
2. Highlight key decisions, action items, or insights
3. ${hasInvocations ? 'Explicitly mention when DreamNodes were shared and what was being discussed at those moments' : 'Focus on the natural flow of conversation'}
4. Be written in a professional yet warm tone suitable for sharing with the conversation partner
5. Be concise (2-3 paragraphs maximum)

Do not include greetings, sign-offs, or meta-commentary. Just provide the summary content.`;
	}

	/**
	 * Build user message with transcript and invocation context
	 */
	private buildUserMessage(conversationText: string, invocations: InvocationEvent[]): string {
		const hasInvocations = invocations.length > 0;

		let message = `Please summarize the following conversation:\n\n${conversationText}`;

		if (hasInvocations) {
			message += `\n\n---\n\nIMPORTANT CONTEXT: During this conversation, ${invocations.length} DreamNode${invocations.length > 1 ? 's were' : ' was'} shared:\n`;
			invocations.forEach((inv, i) => {
				const timestamp = inv.timestamp.toLocaleTimeString();
				message += `${i + 1}. "${inv.nodeName}" at ${timestamp}\n`;
			});
			message += `\nThese are marked in the transcript as "(Invoked: NodeName)". Please contextualize these invocations in your summary.`;
		}

		return message;
	}
}

// Singleton instance
let _conversationSummaryService: ConversationSummaryService | null = null;

export function initializeConversationSummaryService(app: App): void {
	_conversationSummaryService = new ConversationSummaryService(app);
	console.log(`📝 [ConversationSummary] Service initialized`);
}

export function getConversationSummaryService(): ConversationSummaryService {
	if (!_conversationSummaryService) {
		throw new Error('ConversationSummaryService not initialized. Call initializeConversationSummaryService() first.');
	}
	return _conversationSummaryService;
}
