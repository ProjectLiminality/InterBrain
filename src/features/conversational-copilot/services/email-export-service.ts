import { App, Notice } from 'obsidian';
import { DreamNode } from '../../../types/dreamnode';
import { InvocationEvent } from './conversation-recording-service';
import { URIHandlerService } from '../../../services/uri-handler-service';

/**
 * Email Export Service
 *
 * Generates pre-filled Apple Mail drafts with conversation summaries and deep links
 */
export class EmailExportService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Export conversation as pre-filled email draft
	 */
	async exportToEmail(
		conversationPartner: DreamNode,
		conversationStartTime: Date,
		conversationEndTime: Date,
		invocations: InvocationEvent[],
		aiSummary: string,
		recipientEmail?: string
	): Promise<void> {
		try {
			console.log(`📧 [EmailExport] Generating email for conversation with ${conversationPartner.name}`);

			// Get vault name for deep links
			const vaultName = this.app.vault.getName();

			// Build email components
			const subject = this.buildSubject(conversationPartner, conversationStartTime);
			const body = this.buildEmailBody(
				conversationPartner,
				conversationStartTime,
				conversationEndTime,
				invocations,
				aiSummary,
				vaultName
			);

			// Get recipient email (from metadata or parameter)
			const toEmail = recipientEmail || await this.getRecipientEmail(conversationPartner);

			// Generate and execute AppleScript
			await this.createMailDraft(toEmail, subject, body);

			new Notice('Email draft created in Apple Mail');
			console.log(`✅ [EmailExport] Email draft created successfully`);

		} catch (error) {
			console.error('Failed to export email:', error);
			throw new Error(`Email export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Build email subject line
	 */
	private buildSubject(conversationPartner: DreamNode, startTime: Date): string {
		const dateStr = startTime.toLocaleDateString();
		return `Call Summary: ${conversationPartner.name} - ${dateStr}`;
	}

	/**
	 * Build email body with metadata, summary, and deep links
	 */
	private buildEmailBody(
		conversationPartner: DreamNode,
		startTime: Date,
		endTime: Date,
		invocations: InvocationEvent[],
		aiSummary: string,
		vaultName: string
	): string {
		const duration = this.calculateDuration(startTime, endTime);
		const dateStr = startTime.toLocaleDateString();
		const timeStr = startTime.toLocaleTimeString();

		// Build email body
		let body = `Hi ${conversationPartner.name},\n\n`;
		body += `Here's a summary of our call on ${dateStr} at ${timeStr} (Duration: ${duration}):\n\n`;

		// Add AI-generated summary (if available)
		if (aiSummary && aiSummary.trim()) {
			body += `${aiSummary}\n\n`;
		}

		// Add invoked DreamNodes section if any
		if (invocations.length > 0) {
			body += `---\n\n`;
			body += `## Shared DreamNodes\n\n`;
			body += `During our conversation, I shared ${invocations.length} DreamNode${invocations.length > 1 ? 's' : ''}:\n\n`;

			invocations.forEach((inv, i) => {
				const invTimeStr = inv.timestamp.toLocaleTimeString();
				const deepLink = URIHandlerService.generateSingleNodeLink(vaultName, inv.dreamUUID);
				body += `${i + 1}. **${inv.nodeName}** (${invTimeStr})\n`;
				body += `   → ${deepLink}\n\n`;
			});

			// Add batch clone link if multiple nodes
			if (invocations.length > 1) {
				const uuids = invocations.map(inv => inv.dreamUUID);
				const batchLink = URIHandlerService.generateBatchNodeLink(vaultName, uuids);
				body += `📦 **Clone all shared nodes at once**: ${batchLink}\n\n`;
			}
		}

		// Add InterBrain download link
		body += `---\n\n`;
		body += `💡 **New to InterBrain?** Download and install: https://github.com/ProjectLiminality/InterBrain?tab=readme-ov-file#installation--setup\n\n`;
		body += `Once installed, you can click the links above to instantly add these DreamNodes to your vault!\n\n`;

		body += `Looking forward to our next conversation!\n`;

		return body;
	}

	/**
	 * Calculate conversation duration in human-readable format
	 */
	private calculateDuration(startTime: Date, endTime: Date): string {
		const durationMs = endTime.getTime() - startTime.getTime();
		const minutes = Math.floor(durationMs / 60000);
		const seconds = Math.floor((durationMs % 60000) / 1000);

		if (minutes > 0) {
			return `${minutes} minute${minutes > 1 ? 's' : ''}`;
		} else {
			return `${seconds} second${seconds > 1 ? 's' : ''}`;
		}
	}

	/**
	 * Get recipient email from DreamNode metadata
	 */
	private async getRecipientEmail(conversationPartner: DreamNode): Promise<string> {
		try {
			// Read metadata to get email
			const metadataPath = `${conversationPartner.repoPath}/.udd`;
			const metadataContent = await (this.app.vault.adapter as any).read(metadataPath);
			const metadata = JSON.parse(metadataContent);

			return metadata.email || '';
		} catch (error) {
			console.warn(`⚠️ [EmailExport] Could not read email from metadata:`, error);
			return '';
		}
	}

	/**
	 * Create Apple Mail draft using AppleScript via Electron
	 */
	private async createMailDraft(to: string, subject: string, body: string): Promise<void> {
		// Escape strings for AppleScript
		const escapeAS = (str: string): string => {
			return str
				.replace(/\\/g, '\\\\')
				.replace(/"/g, '\\"')
				.replace(/\n/g, '\\n')
				.replace(/\r/g, '\\r');
		};

		const escapedTo = escapeAS(to);
		const escapedSubject = escapeAS(subject);
		const escapedBody = escapeAS(body);

		// Build AppleScript to create email draft
		const appleScript = `
tell application "Mail"
	activate
	set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}", visible:true}
	tell newMessage
		${to ? `make new to recipient at end of to recipients with properties {address:"${escapedTo}"}` : ''}
	end tell
end tell
`;

		console.log(`🍎 [EmailExport] Executing AppleScript to create Mail draft`);
		console.log(`🍎 [EmailExport] AppleScript preview (first 500 chars):`, appleScript.substring(0, 500));

		try {
			// Check if require is available
			if (!(window as any).require) {
				console.error('❌ [EmailExport] window.require is not available');
				throw new Error('Node.js require not available in this environment');
			}

			console.log('✅ [EmailExport] window.require is available');

			// Access Node.js child_process through Obsidian's environment
			const childProcess = (window as any).require('child_process');
			console.log('✅ [EmailExport] child_process module loaded:', !!childProcess);

			const { exec } = childProcess;
			console.log('✅ [EmailExport] exec function available:', typeof exec);

			// Execute AppleScript
			const command = `osascript -e '${appleScript.replace(/'/g, "'\\''")}'`;
			console.log(`🍎 [EmailExport] Command length:`, command.length);
			console.log(`🍎 [EmailExport] Executing command...`);

			await new Promise<void>((resolve, reject) => {
				exec(command, (error: any, stdout: any, stderr: any) => {
					if (error) {
						console.error('❌ [EmailExport] AppleScript error:', error);
						console.error('❌ [EmailExport] stderr:', stderr);
						reject(error);
					} else {
						console.log('✅ [EmailExport] AppleScript stdout:', stdout);
						resolve();
					}
				});
			});

			console.log(`✅ [EmailExport] AppleScript executed successfully`);
		} catch (error) {
			console.error('❌ [EmailExport] AppleScript execution failed:', error);
			throw new Error('Failed to create email draft - ensure Apple Mail is installed');
		}
	}
}

// Singleton instance
let _emailExportService: EmailExportService | null = null;

export function initializeEmailExportService(app: App): void {
	_emailExportService = new EmailExportService(app);
	console.log(`📧 [EmailExport] Service initialized`);
}

export function getEmailExportService(): EmailExportService {
	if (!_emailExportService) {
		throw new Error('EmailExportService not initialized. Call initializeEmailExportService() first.');
	}
	return _emailExportService;
}
