import { App, TFile } from 'obsidian';
import { DreamNode } from '../../dreamnode';
import { InvocationEvent } from './conversation-recording-service';
import { createLLMProvider, LLMMessage } from './llm-provider';

/**
 * Clip suggestion from LLM for a specific invoked DreamNode
 */
export interface ClipSuggestion {
	nodeUuid: string;
	nodeName: string;
	startTime: string;      // Timestamp string in format "MM:SS"
	endTime: string;        // Timestamp string in format "MM:SS"
	transcript: string;     // Excerpt from conversation
}

/**
 * Result from conversation summary generation
 */
export interface ConversationSummaryResult {
	summary: string;
	clips: ClipSuggestion[];
}

/**
 * Conversation Summary Service
 *
 * Generates AI-powered summaries of conversations using transcript and invocation data.
 * Also generates clip timestamps for Songline feature.
 */
export class ConversationSummaryService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Generate conversation summary and clip suggestions from transcript file and invocations
	 */
	async generateSummary(
		transcriptFile: TFile,
		invocations: InvocationEvent[],
		conversationPartner: DreamNode,
		apiKey: string
	): Promise<ConversationSummaryResult> {
		try {
			// Read transcript content
			const transcriptContent = await this.app.vault.read(transcriptFile);
			return await this.generateSummaryFromContent(transcriptContent, invocations, conversationPartner, apiKey);
		} catch (error) {
			console.error('Failed to generate conversation summary:', error);
			throw new Error(`Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Generate conversation summary and clip suggestions from transcript content string and invocations
	 */
	async generateSummaryFromContent(
		transcriptContent: string,
		invocations: InvocationEvent[],
		conversationPartner: DreamNode,
		apiKey: string
	): Promise<ConversationSummaryResult> {
		try {
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

			// Generate summary and clips
			const messages: LLMMessage[] = [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			];

			const response = await llmProvider.generateCompletion(messages, {
				maxTokens: 3000,  // Increased for clip suggestions
				temperature: 0.7
			});

			console.log(`✅ [ConversationSummary] Generated summary and clips (${response.usage?.outputTokens} tokens)`);

			// Parse response to extract summary and clips
			return this.parseResponse(response.content, invocations);

		} catch (error) {
			console.error('Failed to generate conversation summary:', error);
			throw new Error(`Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Build system prompt for AI summarization and clip generation
	 */
	private buildSystemPrompt(conversationPartner: DreamNode, invocations: InvocationEvent[]): string {
		const hasInvocations = invocations.length > 0;

		return `You are a conversation summarization assistant. Your task is to create a concise, informative summary of a conversation between the user and ${conversationPartner.name}.

${hasInvocations ? `IMPORTANT: The transcript contains special markers in the format "[MM:SS] 🔮 Invoked: NodeName" which indicate that a DreamNode was shared during the conversation. For EACH invoked DreamNode, you must also identify the conversation thread where it was discussed and suggest coherent start/stop timestamps for an audio clip.

Your clip suggestions should:
- Start at a natural conversation boundary where the topic begins
- End at a natural conversation boundary where the topic concludes
- Capture the complete discussion that makes the DreamNode meaningful
- Use the timestamps from the transcript (format: MM:SS)
- Include the relevant transcript excerpt` : ''}

Your summary should:
1. Capture the main topics and themes discussed
2. Highlight key decisions, action items, or insights
3. ${hasInvocations ? 'Explicitly mention when DreamNodes were shared and what was being discussed at those moments' : 'Focus on the natural flow of conversation'}
4. Be written in a professional yet warm tone suitable for sharing with the conversation partner
5. Be concise (2-3 paragraphs maximum)

${hasInvocations ? `
RESPONSE FORMAT:
Provide your response in the following format:

SUMMARY:
[Your 2-3 paragraph summary here]

CLIPS:
${invocations.map((inv, i) => `
Clip ${i + 1}:
- Node UUID: ${inv.dreamUUID}
- Node Name: ${inv.nodeName}
- Start Time: MM:SS
- End Time: MM:SS
- Transcript: [The relevant conversation excerpt]`).join('\n')}
` : 'Do not include greetings, sign-offs, or meta-commentary. Just provide the summary content.'}`;
	}

	/**
	 * Build user message with transcript and invocation context
	 */
	private buildUserMessage(conversationText: string, invocations: InvocationEvent[]): string {
		const hasInvocations = invocations.length > 0;

		let message = `Please summarize the following conversation${hasInvocations ? ' and suggest clip timestamps for each invoked DreamNode' : ''}:\n\n${conversationText}`;

		if (hasInvocations) {
			message += `\n\n---\n\nIMPORTANT CONTEXT: During this conversation, ${invocations.length} DreamNode${invocations.length > 1 ? 's were' : ' was'} shared:\n`;
			invocations.forEach((inv, i) => {
				// Convert timestamp to MM:SS format for reference
				const date = inv.timestamp;
				const minutes = date.getMinutes();
				const seconds = date.getSeconds();
				const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
				message += `${i + 1}. "${inv.nodeName}" (UUID: ${inv.dreamUUID}) at approximately ${timeString}\n`;
			});
			message += `\nThese are marked in the transcript as "[MM:SS] 🔮 Invoked: NodeName". Please contextualize these invocations in your summary AND suggest clip timestamps for each one.`;
		}

		return message;
	}

	/**
	 * Parse LLM response to extract summary and clip suggestions
	 */
	private parseResponse(content: string, invocations: InvocationEvent[]): ConversationSummaryResult {
		// If no invocations, just return content as summary with empty clips
		if (invocations.length === 0) {
			return {
				summary: content.trim(),
				clips: []
			};
		}

		// Split response into SUMMARY and CLIPS sections
		const summaryMatch = content.match(/SUMMARY:\s*([\s\S]*?)(?=\n\s*CLIPS:|$)/i);
		const clipsMatch = content.match(/CLIPS:\s*([\s\S]*?)$/i);

		const summary = summaryMatch ? summaryMatch[1].trim() : content.trim();
		const clipsText = clipsMatch ? clipsMatch[1] : '';

		// Parse clips
		const clips: ClipSuggestion[] = [];

		if (clipsText) {
			// Match each clip block
			const clipBlocks = clipsText.split(/Clip \d+:/i).filter(block => block.trim());

			for (const block of clipBlocks) {
				const uuidMatch = block.match(/Node UUID:\s*([a-f0-9-]+)/i);
				const nameMatch = block.match(/Node Name:\s*(.+)/i);
				const startMatch = block.match(/Start Time:\s*(\d+:\d+)/i);
				const endMatch = block.match(/End Time:\s*(\d+:\d+)/i);
				const transcriptMatch = block.match(/Transcript:\s*([\s\S]+?)(?=\n\s*$|$)/i);

				if (uuidMatch && nameMatch && startMatch && endMatch && transcriptMatch) {
					clips.push({
						nodeUuid: uuidMatch[1].trim(),
						nodeName: nameMatch[1].trim(),
						startTime: startMatch[1].trim(),
						endTime: endMatch[1].trim(),
						transcript: transcriptMatch[1].trim()
					});
				}
			}

			console.log(`✅ [ConversationSummary] Parsed ${clips.length}/${invocations.length} clip suggestions`);
		}

		return {
			summary,
			clips
		};
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
