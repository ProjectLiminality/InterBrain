import { App, TFile } from 'obsidian';
import { DreamNode } from '../../dreamnode';
import { InvocationEvent } from './conversation-recording-service';
import { generateAI, AIMessage } from '../../ai-magic';

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
 * Also generates clip timestamps for Songline feature (separate from email summary).
 */
export class ConversationSummaryService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Generate a pure conversation summary for email (no clips, no invocation context)
	 * This is the simple path: transcript in -> summary out
	 */
	async generatePureSummary(
		transcriptContent: string,
		conversationPartner: DreamNode
	): Promise<string> {
		try {
			// Extract actual conversation text (skip metadata header)
			const contentLines = transcriptContent.split('\n');
			const separatorIndex = contentLines.findIndex(line => line === '---');
			const conversationText = contentLines
				.slice(separatorIndex + 1)
				.join('\n')
				.trim();

			// Check if we have actual content
			if (!conversationText || conversationText.length < 10) {
				console.warn(`⚠️ [ConversationSummary] Transcript too short for summary (${conversationText.length} chars)`);
				return '';
			}

			// Simple system prompt - just summarize the conversation
			const systemPrompt = `You are a conversation summarization assistant. Create a concise, informative summary of a conversation between the user and ${conversationPartner.name}.

Your summary should:
1. Capture the main topics and themes discussed
2. Highlight key decisions, action items, or insights
3. Be written in a professional yet warm tone suitable for sharing with the conversation partner
4. Be concise (2-3 paragraphs maximum)

Do not include greetings, sign-offs, or meta-commentary. Just provide the summary content.
Do not mention any technical details about the software or system - focus only on the conversation content.`;

			const messages: AIMessage[] = [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: `Please summarize the following conversation:\n\n${conversationText}` }
			];

			const response = await generateAI(messages, 'standard', {
				maxTokens: 1000,
				temperature: 0.7
			});

			console.log(`✅ [ConversationSummary] Generated pure summary via ${response.provider} (${response.usage?.outputTokens} tokens)`);

			return response.content.trim();

		} catch (error) {
			console.error('Failed to generate conversation summary:', error);
			return ''; // Return empty string on error - email will still work without summary
		}
	}

	/**
	 * Generate conversation summary and clip suggestions from transcript file and invocations
	 * Used for Songline feature (clips), not for email
	 */
	async generateSummary(
		transcriptFile: TFile,
		invocations: InvocationEvent[],
		conversationPartner: DreamNode
	): Promise<ConversationSummaryResult> {
		try {
			// Read transcript content
			const transcriptContent = await this.app.vault.read(transcriptFile);
			return await this.generateSummaryFromContent(transcriptContent, invocations, conversationPartner);
		} catch (error) {
			console.error('Failed to generate conversation summary:', error);
			throw new Error(`Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Generate conversation summary and clip suggestions from transcript content string and invocations
	 * Used for Songline feature (clips), not for email
	 */
	async generateSummaryFromContent(
		transcriptContent: string,
		invocations: InvocationEvent[],
		conversationPartner: DreamNode
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

			// Generate summary and clips using ai-magic service
			const messages: AIMessage[] = [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			];

			// Use 'standard' complexity - summaries benefit from quality
			const response = await generateAI(messages, 'standard', {
				maxTokens: 3000,
				temperature: 0.7
			});

			console.log(`✅ [ConversationSummary] Generated summary and clips via ${response.provider} (${response.usage?.outputTokens} tokens)`);

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
				// Use elapsed seconds (synced with transcript timestamps)
				const totalSeconds = Math.floor(inv.elapsedSeconds);
				const minutes = Math.floor(totalSeconds / 60);
				const seconds = totalSeconds % 60;
				const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
				message += `${i + 1}. "${inv.nodeName}" (UUID: ${inv.dreamUUID}) at approximately ${timeString}\n`;
			});
			message += `\nThese are marked in the transcript as "[M:SS] 🔮 Invoked: NodeName". Please identify the conversation segment around each invocation and suggest clip timestamps that capture the relevant discussion.`;
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
		// Handle various markdown formats: "SUMMARY:", "## SUMMARY:", "**SUMMARY:**", etc.
		const summaryMatch = content.match(/(?:#{1,3}\s*)?(?:\*{1,2})?SUMMARY:?\*{0,2}\s*([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?(?:\*{1,2})?CLIPS|$)/i);
		const clipsMatch = content.match(/(?:#{1,3}\s*)?(?:\*{1,2})?CLIPS:?\*{0,2}\s*([\s\S]*?)$/i);

		const summary = summaryMatch ? summaryMatch[1].trim() : content.trim();
		const clipsText = clipsMatch ? clipsMatch[1] : '';

		// Parse clips
		const clips: ClipSuggestion[] = [];

		if (clipsText) {
			// Match each clip block - handle "Clip 1:", "**Clip 1:**", etc.
			const clipBlocks = clipsText.split(/(?:\*{1,2})?Clip \d+:?\*{0,2}/i).filter(block => block.trim());

			for (const block of clipBlocks) {
				// Handle various formats: "- Node UUID:", "Node UUID:", "**Node UUID:**"
				const uuidMatch = block.match(/(?:-\s*)?(?:\*{1,2})?Node UUID:?\*{0,2}\s*([a-f0-9-]+)/i);
				const nameMatch = block.match(/(?:-\s*)?(?:\*{1,2})?Node Name:?\*{0,2}\s*(.+)/i);
				const startMatch = block.match(/(?:-\s*)?(?:\*{1,2})?Start Time:?\*{0,2}\s*(\d+:\d+)/i);
				const endMatch = block.match(/(?:-\s*)?(?:\*{1,2})?End Time:?\*{0,2}\s*(\d+:\d+)/i);
				// Transcript can be multi-line and may be wrapped in brackets
				const transcriptMatch = block.match(/(?:-\s*)?(?:\*{1,2})?Transcript:?\*{0,2}\s*\[?([\s\S]+?)\]?(?=\n\s*(?:\*|$)|$)/i);

				if (uuidMatch && startMatch && endMatch) {
					clips.push({
						nodeUuid: uuidMatch[1].trim(),
						nodeName: nameMatch ? nameMatch[1].trim() : 'Unknown',
						startTime: startMatch[1].trim(),
						endTime: endMatch[1].trim(),
						transcript: transcriptMatch ? transcriptMatch[1].trim() : ''
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
